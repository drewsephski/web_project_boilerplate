import { NextRequest, NextResponse } from 'next/server';
import { runScraper, ScraperConfig as ScraperEngineConfig } from '@/lib/scraperEngine'; // Assuming ScraperEngineConfig is the type runScraper expects
import { ScraperConfigSchema, CreateScraperSchema } from '@/lib/models/scraper';
import { z } from 'zod';

// This is the actual configuration structure expected by runScraper.
// It should align with the ScraperConfig type in scraperEngine.ts
// which is z.infer<typeof ScraperConfigSchema>.
type FullScraperConfigForEngine = z.infer<typeof ScraperConfigSchema>;

// Define a schema for the payload specific to a test run.
// These are the fields we expect from the client for a test.
const TestRunClientPayloadSchema = z.object({
  url: z.string().url(),
  selectors: z.array(
    z.object({
      fieldName: z.string().min(1),
      cssSelector: z.string().min(1),
    })
  ).min(1),
  paginationEnabled: z.boolean().default(false),
  paginationNextSelector: z.string().optional(),
  maxDepth: z.number().int().positive().optional(),
});

// Refine the schema for pagination dependencies, similar to RefinedScraperConfigSchema
const RefinedTestRunClientPayloadSchema = TestRunClientPayloadSchema.refine(data => {
  if (data.paginationEnabled && !data.paginationNextSelector) {
    return false;
  }
  return true;
}, {
  message: "paginationNextSelector is required if pagination is enabled for test run.",
  path: ["paginationNextSelector"],
}).refine(data => {
  if (data.paginationEnabled && typeof data.maxDepth === 'undefined') {
    return false;
  }
  return true;
}, {
  message: "maxDepth is required if pagination is enabled for test run",
  path: ["maxDepth"],
});


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // First, validate the client payload structure
    const clientPayloadValidation = RefinedTestRunClientPayloadSchema.safeParse(body);
    if (!clientPayloadValidation.success) {
        return NextResponse.json({ message: 'Invalid test run payload', errors: clientPayloadValidation.error.format() }, { status: 400 });
    }
    const validClientPayload = clientPayloadValidation.data;

    // Construct the full configuration object expected by ScraperConfigSchema for validation,
    // adding dummy values for fields not provided by the client for a test run.
    const fullConfigForValidation: FullScraperConfigForEngine = {
      ...validClientPayload,
      name: "Test Scraper", // Dummy name
      description: "Test run configuration", // Dummy description
      status: "active", // Dummy status
      // schedule, createdAt, updatedAt are optional and not strictly needed for runScraper's core logic
    };

    // Now validate this constructed full config against the main schema
    const finalValidation = ScraperConfigSchema.safeParse(fullConfigForValidation);
    if (!finalValidation.success) {
      // This indicates an issue with how we constructed the fullConfigForValidation or the base ScraperConfigSchema
      console.error("Internal validation of constructed config failed:", finalValidation.error.format());
      return NextResponse.json({ message: 'Internal error validating test configuration', errors: finalValidation.error.format() }, { status: 500 });
    }

    const configToRun: FullScraperConfigForEngine = finalValidation.data;

    console.log(`[API TestRun] Starting test scraper run for URL: ${configToRun.url}`);
    const scrapedDataItems = await runScraper(configToRun);
    const itemCount = scrapedDataItems.length;

    const MAX_SAMPLE_SIZE = 5;
    const sampledData = scrapedDataItems.slice(0, MAX_SAMPLE_SIZE);

    console.log(`[API TestRun] Completed for URL: ${configToRun.url}. Items: ${itemCount}. Sample: ${sampledData.length}`);
    return NextResponse.json({
      message: `Test run successful. Found ${itemCount} items. Displaying up to ${MAX_SAMPLE_SIZE} items as a sample.`,
      itemCount,
      data: sampledData,
    }, { status: 200 });

  } catch (error: any) {
    console.error('[API TestRun] Error during test scraper run:', error);
    return NextResponse.json({
      message: 'Failed to run test scrape.',
      error: error.message || 'Unknown error'
    }, { status: 500 });
  }
}
