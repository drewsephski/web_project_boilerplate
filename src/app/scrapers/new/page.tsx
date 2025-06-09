"use client";

import { useState, ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";

interface SelectorRow {
  fieldName: string;
  cssSelector: string;
}

export default function NewScraperPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [url, setUrl] = useState("");
  const [scrapeMode, setScrapeMode] = useState("simple");

  const [selectors, setSelectors] = useState<SelectorRow[]>([{ fieldName: "", cssSelector: "" }]);
  const [paginationEnabled, setPaginationEnabled] = useState(false);
  const [paginationNextSelector, setPaginationNextSelector] = useState("");
  const [maxDepth, setMaxDepth] = useState(5);

  const [scraperName, setScraperName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State for Test Run in Step 4
  const [testRunData, setTestRunData] = useState<any[] | null>(null);
  const [isTestingRun, setIsTestingRun] = useState(false);
  const [testRunError, setTestRunError] = useState<string | null>(null);
  const [testRunMessage, setTestRunMessage] = useState<string | null>(null);


  const handleSubmitStep1 = () => {
    if (!url || !url.match(/^https?:\/\//)) {
      alert("Please enter a valid URL (starting with http:// or https://).");
      return;
    }
    setCurrentStep(2);
  };

  const handleSubmitStep2 = () => {
    if (!scrapeMode) {
      alert("Please select a scrape mode.");
      return;
    }
    if (scrapeMode === "simple") {
      setCurrentStep(3);
    } else {
      alert("Visual selector not yet implemented. Please choose Simple for now.");
    }
  };

  const handleSelectorChange = (index: number, event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newSelectors = [...selectors];
    newSelectors[index][event.target.name as keyof SelectorRow] = event.target.value;
    setSelectors(newSelectors);
  };

  const addSelectorRow = () => {
    setSelectors([...selectors, { fieldName: "", cssSelector: "" }]);
  };

  const removeSelectorRow = (index: number) => {
    if (selectors.length <= 1) return;
    const newSelectors = selectors.filter((_, i) => i !== index);
    setSelectors(newSelectors);
  };

  const handleSubmitStep3 = () => {
    if (selectors.some(s => !s.fieldName.trim() || !s.cssSelector.trim())) {
      alert("Please fill in all selector fields or remove empty ones.");
      return;
    }
    if (paginationEnabled) {
      if (!paginationNextSelector.trim()) {
        alert("Please provide a 'Next Page Selector' if pagination is enabled.");
        return;
      }
      if (maxDepth <= 0) {
        alert("Max depth for pagination must be a positive number.");
        return;
      }
    }
    // Clear previous test run data when moving from step 3
    setTestRunData(null);
    setTestRunError(null);
    setTestRunMessage(null);
    setCurrentStep(4);
  };

  const handleTestRun = async () => {
    setIsTestingRun(true);
    setTestRunData(null);
    setTestRunError(null);
    setTestRunMessage(null);

    const payload = {
      url,
      selectors: selectors.filter(s => s.fieldName.trim() && s.cssSelector.trim()),
      paginationEnabled,
      ...(paginationEnabled && {
        paginationNextSelector,
        maxDepth
      }),
    };

    try {
      const response = await fetch('/api/scrapers/test-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        let errorMessage = result.message || result.error || `Error: ${response.status}`;
        if (result.errors) {
            const fieldErrors = Object.entries(result.errors.fieldErrors || result.errors._errors || result.errors || {})
                .map(([field, errors]) => `${field}: ${(errors as string[]).join(', ')}`)
                .join('; ');
             if(fieldErrors && fieldErrors.length > 0 && fieldErrors !== "field: ") errorMessage += ` Details: ${fieldErrors}`;
        }
        throw new Error(errorMessage);
      }

      setTestRunMessage(result.message || "Test run completed.");
      setTestRunData(result.data || []);

      if (result.itemCount === 0) {
        setTestRunMessage(prev => (prev || "") + " No items were found matching your selectors with the current configuration.");
      } else if (result.data && result.data.length === 0 && result.itemCount > 0) {
        setTestRunMessage(prev => (prev || "") + " (Sample is empty, but items were found. Check full run later.)");
      }

    } catch (error: any) {
      console.error("Test run failed:", error);
      setTestRunError(error.message);
    } finally {
      setIsTestingRun(false);
    }
  };

  const handleSubmitStep4 = () => {
    setCurrentStep(5);
  };

  const handleSaveConfiguration = async () => {
    if (!scraperName.trim()) {
      alert("Please provide a name for your scraper.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        name: scraperName,
        url,
        description: `Scraper for ${scraperName || url}`,
        selectors: selectors.filter(s => s.fieldName.trim() && s.cssSelector.trim()),
        paginationEnabled,
        ...(paginationEnabled && {
          paginationNextSelector,
          maxDepth,
        }),
        status: 'active',
      };

      const response = await fetch('/api/scrapers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        let errorMessage = errorData.message || `Error: ${response.status}`;
        if (errorData.details && errorData.details.fieldErrors) {
            const fieldErrors = Object.entries(errorData.details.fieldErrors)
                .map(([field, errors]) => `${field}: ${(errors as string[]).join(', ')}`)
                .join('; ');
            errorMessage += ` Details: ${fieldErrors}`;
        } else if (Array.isArray(errorData.details)) { // Handle array of ZodIssue-like objects
            const issueDetails = errorData.details.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
            errorMessage += ` Details: ${issueDetails}`;
        }
        throw new Error(errorMessage);
      }
      alert('Scraper configuration saved successfully!');
      router.push('/');
    } catch (error: any) {
      console.error("Failed to save scraper:", error);
      alert(`Failed to save scraper: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStepDescription = () => {
    switch (currentStep) {
      case 1: return "Step 1 of 5: Enter Target URL";
      case 2: return "Step 2 of 5: Choose Scrape Mode";
      case 3: return "Step 3 of 5: Define Data Selectors & Pagination";
      case 4: return "Step 4 of 5: Review Configuration & Test";
      case 5: return "Step 5 of 5: Name and Save Configuration";
      default: return "";
    }
  };

  return (
    <main className="flex flex-col items-center p-8 sm:p-16">
      <div className="w-full max-w-2xl">
        <div className="mb-4">
          <Link href="/" passHref>
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create New Scraper</CardTitle>
            <CardDescription>{getStepDescription()}</CardDescription>
          </CardHeader>

          {currentStep === 1 && (
            <>
              <CardContent>
                <form onSubmit={(e: FormEvent) => { e.preventDefault(); handleSubmitStep1(); }}>
                  <div className="grid w-full items-center gap-4">
                    <div className="flex flex-col space-y-1.5">
                      <Label htmlFor="url">Website URL</Label>
                      <Input
                        id="url"
                        placeholder="https://example.com"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </form>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleSubmitStep1}>Next: Choose Mode</Button>
              </CardFooter>
            </>
          )}

          {currentStep === 2 && (
            <>
              <CardContent>
                <form onSubmit={(e: FormEvent) => { e.preventDefault(); handleSubmitStep2(); }}>
                  <RadioGroup
                    defaultValue="simple"
                    value={scrapeMode}
                    onValueChange={setScrapeMode}
                    className="space-y-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="simple" id="mode-simple" />
                      <Label htmlFor="mode-simple">Simple Selector Input</Label>
                    </div>
                    <p className="text-sm text-muted-foreground pl-6">
                      Manually enter CSS selectors for the data you want to extract.
                    </p>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="visual" id="mode-visual" disabled />
                      <Label htmlFor="mode-visual" className="text-muted-foreground">
                        Visual DOM Selector (Coming Soon)
                      </Label>
                    </div>
                      <p className="text-sm text-muted-foreground pl-6">
                        Click on elements in a preview to select them (feature disabled).
                      </p>
                  </RadioGroup>
                </form>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  Previous
                </Button>
                <Button onClick={handleSubmitStep2}>Next: Define Selectors</Button>
              </CardFooter>
            </>
          )}

          {currentStep === 3 && scrapeMode === 'simple' && (
            <>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium mb-2">Data Selectors</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Define the data fields you want to extract and their corresponding CSS selectors.
                  </p>
                  {selectors.map((selector, index) => (
                    <div key={index} className="flex items-end gap-2 mb-3 p-3 border rounded-md">
                      <div className="flex-grow space-y-1.5">
                        <Label htmlFor={`fieldName-${index}`}>Field Name</Label>
                        <Input
                          id={`fieldName-${index}`}
                          name="fieldName"
                          placeholder="e.g., Title, Price"
                          value={selector.fieldName}
                          onChange={(e) => handleSelectorChange(index, e)}
                        />
                      </div>
                      <div className="flex-grow space-y-1.5">
                        <Label htmlFor={`cssSelector-${index}`}>CSS Selector</Label>
                        <Textarea
                          id={`cssSelector-${index}`}
                          name="cssSelector"
                          placeholder="e.g., h1.product-title, .price > span"
                          value={selector.cssSelector}
                          onChange={(e) => handleSelectorChange(index, e)}
                          rows={1}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSelectorRow(index)}
                        disabled={selectors.length <= 1}
                        aria-label="Remove selector"
                        type="button"
                      >
                        <Trash2 className="h-5 w-5 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" onClick={addSelectorRow} className="mt-2" type="button">
                    Add Another Selector
                  </Button>
                </div>

                <div className="border-t pt-6">
                  <h3 className="text-lg font-medium mb-2">Pagination (Optional)</h3>
                  <div className="flex items-center space-x-2 mb-4">
                    <Checkbox
                      id="paginationEnabled"
                      checked={paginationEnabled}
                      onCheckedChange={(checkedState) => setPaginationEnabled(checkedState as boolean)}
                    />
                    <Label htmlFor="paginationEnabled" className="font-normal">
                      Enable crawling multiple pages
                    </Label>
                  </div>
                  {paginationEnabled && (
                    <div className="space-y-4 pl-6 border-l-2 border-muted ml-2">
                      <div>
                        <Label htmlFor="paginationNextSelector">Next Page Selector</Label>
                        <Input
                          id="paginationNextSelector"
                          placeholder="e.g., a.next-page, .pagination .next"
                          value={paginationNextSelector}
                          onChange={(e) => setPaginationNextSelector(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">CSS selector for the link/button that leads to the next page.</p>
                      </div>
                      <div>
                        <Label htmlFor="maxDepth">Max Depth (pages)</Label>
                        <Input
                          id="maxDepth"
                          type="number"
                          min="1"
                          value={maxDepth}
                          onChange={(e) => setMaxDepth(parseInt(e.target.value, 10) || 1)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">Maximum number of pages to crawl.</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(2)}>
                  Previous
                </Button>
                <Button onClick={handleSubmitStep3}>Next: Review Config & Test</Button>
              </CardFooter>
            </>
          )}

          {currentStep === 4 && (
            <>
              <CardContent className="space-y-6">
                {/* Configuration Summary Section */}
                <div>
                  <h3 className="text-lg font-semibold mb-1">Target URL</h3>
                  <p className="text-sm text-muted-foreground break-all">{url || "Not set"}</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Scrape Mode</h3>
                  <p className="text-sm text-muted-foreground capitalize">{scrapeMode || "Not set"}</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">Data Selectors</h3>
                  {selectors.length > 0 && selectors.some(s => s.fieldName.trim()) ? (
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {selectors.filter(s => s.fieldName.trim()).map((selector, index) => (
                        <li key={index}>
                          <strong>{selector.fieldName}:</strong> {selector.cssSelector || "No selector"}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No selectors defined.</p>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Pagination</h3>
                  {paginationEnabled ? (
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p><strong>Status:</strong> Enabled</p>
                      <p><strong>Next Page Selector:</strong> {paginationNextSelector || "Not set"}</p>
                      <p><strong>Max Depth:</strong> {maxDepth || "Not set"} pages</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Disabled</p>
                  )}
                </div>

                {/* Test Run Section */}
                <div className="mt-6 border-t pt-6">
                  <h3 className="text-lg font-semibold mb-2">Test Your Configuration</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Run a quick test to see a sample of what your current configuration will scrape.
                    This will only process a limited number of pages if pagination is enabled.
                  </p>
                  <Button onClick={handleTestRun} disabled={isTestingRun} variant="outline">
                    {isTestingRun ? "Testing..." : "Run Test Scrape"}
                  </Button>

                  {isTestingRun && <p className="mt-3 text-sm text-foreground animate-pulse">Running test scrape, please wait...</p>}

                  {testRunError && (
                    <Alert variant="destructive" className="mt-3">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{testRunError}</AlertDescription>
                    </Alert>
                  )}
                  {testRunMessage && !testRunError && (
                    <Alert variant="default" className="mt-3">
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertDescription>{testRunMessage}</AlertDescription>
                    </Alert>
                  )}

                  {testRunData && testRunData.length > 0 && (
                    <div className="mt-3">
                      <h4 className="font-medium mb-1">Test Data Sample:</h4>
                      <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto max-h-60">
                        {JSON.stringify(testRunData, null, 2)}
                      </pre>
                    </div>
                  )}
                  {testRunData && testRunData.length === 0 && testRunMessage && !testRunError && ( // Message for empty sample but successful run
                    <p className="mt-3 text-sm text-muted-foreground">
                        The test run completed as indicated, but the data sample is empty. This might mean no items were found with the current selectors on the tested page(s), or the items found had no extractable text.
                    </p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(3)}>
                  Previous
                </Button>
                <Button onClick={handleSubmitStep4}>Next: Name & Save</Button>
              </CardFooter>
            </>
          )}

          {currentStep === 5 && (
            <>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="scraperName">Scraper Name</Label>
                  <Input
                    id="scraperName"
                    placeholder="e.g., My Product Scraper"
                    value={scraperName}
                    onChange={(e) => setScraperName(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Give your scraper a descriptive name.
                  </p>
                </div>
                <div className="pt-4">
                  <p className="text-sm text-muted-foreground">
                    You're all set! Review the name and click "Save Scraper" to store your configuration.
                    You can run and manage your scrapers from the dashboard.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(4)} disabled={isSubmitting}>
                  Previous
                </Button>
                <Button onClick={handleSaveConfiguration} disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save Scraper"}
                </Button>
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
