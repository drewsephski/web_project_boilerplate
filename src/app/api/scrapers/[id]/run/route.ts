import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Collection, ObjectId, WithId } from 'mongodb';
import { runScraper, ScraperConfig as ScraperEngineConfig } from '@/lib/scraperEngine'; // Renamed to avoid conflict
import { ScraperConfigSchema } from '@/lib/models/scraper';
import { z } from 'zod';

// Type for scraper config stored in DB (includes _id)
type DbScraperConfig = WithId<z.infer<typeof ScraperConfigSchema>>;

// Type for what runScraper expects (might be slightly different from DB, e.g. no _id)
// For now, assuming ScraperConfigSchema is the source of truth for runScraper's expected input.
type RunScraperInputConfig = z.infer<typeof ScraperConfigSchema>;


export async function POST(
  request: NextRequest, // Changed from Request to NextRequest for consistency if needed, though Request is standard
  { params }: { params: { id: string } }
) {
  const scraperId = params.id;

  if (!scraperId || !ObjectId.isValid(scraperId)) {
    return NextResponse.json({ message: 'Invalid scraper ID' }, { status: 400 });
  }

  let mongo; // To hold the mongo client/db object for potential use in catch block
  try {
    mongo = await connectToDatabase();
    const db = mongo.db; // Use the 'db' instance from the connection

    const scrapersCollection = db.collection<DbScraperConfig>('scrapers');
    const scraperConfigDoc = await scrapersCollection.findOne({ _id: new ObjectId(scraperId) });

    if (!scraperConfigDoc) {
      return NextResponse.json({ message: 'Scraper configuration not found' }, { status: 404 });
    }

    // We need to convert the _id from ObjectId to string for Zod validation if _id is part of the schema.
    // However, ScraperConfigSchema typically doesn't include _id. Let's assume scraperConfigDoc (without _id) is what needs validation.
    const { _id, ...configToValidate } = scraperConfigDoc;

    const parsedConfig = ScraperConfigSchema.safeParse(configToValidate);
    if (!parsedConfig.success) {
        console.error("Invalid scraper config fetched from DB:", parsedConfig.error.flatten());
        // Update DB with error status for this config if it's fundamentally broken
        await scrapersCollection.updateOne(
            { _id: new ObjectId(scraperId) },
            { $set: {
                status: 'error',
                lastRunStatus: 'error',
                lastRunAt: new Date(),
                lastRunErrorMessage: 'Invalid configuration in database'
            } }
        );
        return NextResponse.json({ message: 'Invalid scraper configuration in database', errors: parsedConfig.error.flatten() }, { status: 500 });
    }
    const scraperConfigForEngine: RunScraperInputConfig = parsedConfig.data;

    console.log(`[API ScraperRun] Starting scraper run for ID: ${scraperId}, Name: ${scraperConfigForEngine.name}`);
    const scrapedDataItems = await runScraper(scraperConfigForEngine); // runScraper expects a config that matches its type
    const itemCount = scrapedDataItems.length;
    const runAt = new Date();
    const runStatus = itemCount > 0 ? 'success' : 'empty'; // 'empty' if 0 items but no error during run

    const scrapedDataCollection = db.collection('scrapedData');
    const result = await scrapedDataCollection.insertOne({
      scraperConfigId: new ObjectId(scraperId),
      scraperName: scraperConfigForEngine.name,
      runAt,
      status: runStatus,
      itemCount,
      data: scrapedDataItems, // Storing all data
    });
    const runId = result.insertedId;

    await scrapersCollection.updateOne(
      { _id: new ObjectId(scraperId) },
      { $set: {
          lastRunAt: runAt,
          lastRunStatus: runStatus,
          lastRunItemCount: itemCount,
          lastRunId: runId, // Store the ID of the run document
          status: scraperConfigForEngine.status === 'error' ? 'error' : 'active', // Reset status to active if it was error and ran successfully
          lastRunErrorMessage: null // Clear previous error message
        } }
    );

    console.log(`[API ScraperRun] Completed for ID: ${scraperId}. Items: ${itemCount}. Run ID: ${runId}`);
    return NextResponse.json({
      message: `Scraper "${scraperConfigForEngine.name}" run successfully. ${itemCount} items scraped.`,
      runId: runId.toString(),
      itemCount,
      // data: scrapedDataItems, // Optionally return data; for now, keeping it minimal
    }, { status: 200 });

  } catch (error: any) {
    console.error(`[API ScraperRun] Error during scraper run for ID ${scraperId}:`, error);
    const runAt = new Date();

    if (mongo && ObjectId.isValid(scraperId)) {
        try {
            const db = mongo.db;
            const scrapersCollection = db.collection<DbScraperConfig>('scrapers');
            await scrapersCollection.updateOne(
                { _id: new ObjectId(scraperId) },
                { $set: {
                    lastRunAt: runAt,
                    lastRunStatus: 'error',
                    lastRunErrorMessage: error.message || 'Unknown error during run'
                } }
            );
        } catch (dbUpdateError) {
            console.error("[API ScraperRun] Failed to update scraper lastRunStatus to error:", dbUpdateError);
        }
    }

    return NextResponse.json({
      message: 'Failed to run scraper.',
      error: error.message || 'Unknown error'
    }, { status: 500 });
  }
}
