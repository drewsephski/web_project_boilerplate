"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PlusCircle, PlayCircle, Edit3, Trash2, History as HistoryIcon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription }    from "@/components/ui/alert";
import type { DashboardScraperConfig } from "@/lib/models/scraper"; // Use the new type

// Helper to format date
const formatDate = (dateString?: string | Date): string => {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    // Check if date is valid after parsing
    if (isNaN(date.getTime())) {
      return "Invalid Date";
    }
    return date.toLocaleString();
  } catch (e) {
    return "Invalid Date";
  }
};

export default function DashboardPage() {
  const [scrapers, setScrapers] = useState<DashboardScraperConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [runStates, setRunStates] = useState<{ [key: string]: { loading: boolean; message?: string; type?: 'success' | 'error' } }>({});

  const fetchScrapers = useCallback(async () => {
    if (!isLoading) setIsLoading(true); // Set loading true when fetch starts, unless it's already true
    // Clear global message before fetching
    setRunStates(prev => {
      const { global, ...rest } = prev;
      return rest;
    });
    try {
      const response = await fetch("/api/scrapers");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to fetch scrapers" }));
        throw new Error(errorData.message || "Failed to fetch scrapers");
      }
      const data = await response.json();
      setScrapers(data);
    } catch (error: any) {
       setRunStates(prev => ({ ...prev, global: { loading: false, message: error.message, type: 'error' } }));
       setScrapers([]); // Clear scrapers on error
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]); // Add isLoading to dependencies to allow re-triggering if needed

  useEffect(() => {
    fetchScrapers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Initial fetch only

  const handleRunScraper = async (scraperId: string) => {
    if (!scraperId) return;
    setRunStates(prev => ({
      ...prev,
      [scraperId]: { loading: true, message: undefined, type: undefined },
      global: undefined // Clear global message on new action
    }));

    try {
      const response = await fetch(`/api/scrapers/${scraperId}/run`, { method: 'POST' });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to run scraper");
      }

      setRunStates(prev => ({ ...prev, [scraperId]: { loading: false, message: result.message || "Scraper run successfully!", type: 'success' } }));
      // Auto-clear success message after a few seconds and refresh
      setTimeout(() => {
        setRunStates(prev => {
          const { [scraperId]: _, ...rest } = prev; // Remove specific scraper message
          return rest;
        });
        fetchScrapers();
      }, 3000);

    } catch (error: any) {
      setRunStates(prev => ({ ...prev, [scraperId]: { loading: false, message: error.message, type: 'error' } }));
    }
  };

  const getStatusBadgeVariant = (status?: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status?.toLowerCase()) {
      case 'active':
        return "secondary"; // More neutral for active, not yet run successfully
      case 'success':
      case 'completed': // Assuming 'completed' might also be a success state
        return "default";
      case 'paused':
        return "outline"; // Using outline for paused for better distinction
      case 'error':
      case 'failure':
        return "destructive";
      case 'empty': // For runs that completed but found 0 items
        return "outline";
      default:
        return "outline";
    }
  };

  if (isLoading && scrapers.length === 0) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen p-8">
        <p className="text-lg">Loading scrapers...</p>
        {/* Consider adding a spinner here */}
      </main>
    );
  }

  const globalMessage = runStates.global;

  return (
    <main className="flex flex-col items-center p-4 sm:p-8 md:p-16">
      <div className="w-full max-w-7xl">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">My Scrapers</h1>
          <Link href="/scrapers/new" passHref>
            <Button>
              <PlusCircle className="mr-2 h-5 w-5" /> Create New Scraper
            </Button>
          </Link>
        </div>

        {globalMessage && (
          <Alert variant={globalMessage.type === 'error' ? 'destructive' : 'default'} className="mb-4">
            {globalMessage.type === 'error' ? <AlertTriangle className="h-4 w-4 mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            <AlertDescription>{globalMessage.message}</AlertDescription>
          </Alert>
        )}

        {!isLoading && scrapers.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-border rounded-lg">
            <p className="text-xl font-medium text-muted-foreground">No scrapers created yet.</p>
            <p className="mt-2 text-muted-foreground">Click 'Create New Scraper' to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {scrapers.map((scraper) => {
              const currentRunState = runStates[scraper._id] || { loading: false };
              const displayStatus = scraper.lastRunStatus || scraper.status || "Unknown";
              return (
              <Card key={scraper._id} className="flex flex-col shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="truncate text-xl" title={scraper.name}>{scraper.name}</CardTitle>
                  <CardDescription className="truncate text-xs" title={scraper.url}>{scraper.url}</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow space-y-2 text-sm">
                  <div className="flex items-center">
                    <span className="text-muted-foreground mr-2">Status:</span>
                    <Badge variant={getStatusBadgeVariant(displayStatus)} className="capitalize">
                      {displayStatus.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground">Last Run: <span className="font-medium text-foreground">{formatDate(scraper.lastRunAt)}</span></div>
                  <div className="text-muted-foreground">Items Scraped: <span className="font-medium text-foreground">{scraper.lastRunItemCount ?? 'N/A'}</span></div>
                  {scraper.lastRunErrorMessage && (
                     <Alert variant="destructive" className="mt-2 text-xs p-2">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        <AlertDescription>Error: {scraper.lastRunErrorMessage}</AlertDescription>
                     </Alert>
                  )}
                  {currentRunState.message && (
                    <Alert variant={currentRunState.type === 'error' ? 'destructive' : 'default'} className="mt-2 text-xs p-2">
                        {currentRunState.type === 'error' ? <AlertTriangle className="h-3 w-3 mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                      <AlertDescription>{currentRunState.message}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
                <CardFooter className="flex justify-start space-x-2 border-t pt-4">
                  <Button
                    onClick={() => handleRunScraper(scraper._id)}
                    disabled={currentRunState.loading || isLoading}
                    size="sm"
                  >
                    <PlayCircle className="mr-2 h-4 w-4" />
                    {currentRunState.loading ? "Running..." : "Run Now"}
                  </Button>
                  <Button variant="outline" size="sm" disabled title="Edit (Coming Soon)">
                    <Edit3 className="mr-1 h-4 w-4" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" disabled title="History (Coming Soon)">
                    <HistoryIcon className="mr-1 h-4 w-4" /> History
                  </Button>
                  {/* <Button variant="destructive" size="sm" disabled><Trash2 className="mr-1 h-4 w-4" /> Delete</Button> */}
                </CardFooter>
              </Card>
            )})}
          </div>
        )}
      </div>
    </main>
  );
}
