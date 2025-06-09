import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/mongodb';
import { CreateScraperSchema, ScraperConfigSchema } from '@/lib/models/scraper'; // Using base for DB interaction for now
import { z } from 'zod';
import { Collection, WithId, Document } from 'mongodb';

// Helper to convert MongoDB document _id to string and satisfy ScraperConfig type if needed
function fromDocument<T extends Document>(doc: WithId<T>): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id.toHexString() } as Omit<T, '_id'> & { id: string };
}


export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const collection: Collection<Document> = db.collection('scrapers');

    const body = await req.json();

    // Validate with the schema that includes refinements for creation
    const validationResult = CreateScraperSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: "Invalid input", details: validationResult.error.flatten() }, { status: 400 });
    }

    const scraperData = validationResult.data;

    const newScraper = {
      ...scraperData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await collection.insertOne(newScraper);

    if (!result.insertedId) {
      return NextResponse.json({ error: "Failed to create scraper" }, { status: 500 });
    }

    // Construct the response object, converting _id to id string
    const createdScraper = {
      ...newScraper,
      _id: result.insertedId, // Keep _id as ObjectId for internal use or further ops if needed
      id: result.insertedId.toHexString() // Provide string id for API response
    };

    // Optionally, remove the full _id object from the response if only string id is desired
    // delete (createdScraper as any)._id;

    return NextResponse.json(createdScraper, { status: 201 });

  } catch (error) {
    console.error('Error creating scraper:', error);
    if (error instanceof z.ZodError) { // Should be caught by safeParse, but as a fallback
      return NextResponse.json({ error: "Invalid input", details: error.flatten() }, { status: 400 });
    }
    if (error instanceof SyntaxError) { // JSON parsing error
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const collection: Collection<Document> = db.collection('scrapers');

    const scrapersDocs = await collection.find({}).toArray();

    // Convert each document: _id to string id, and ensure dates are handled if necessary.
    // For now, basic conversion. If ScraperConfigSchema expects Date objects for createdAt/updatedAt,
    // MongoDB driver usually returns them as such.
    const scrapers = scrapersDocs.map(doc => {
      const { _id, ...rest } = doc;
      return {
        ...rest,
        id: _id.toHexString(),
        // Ensure fields match the ScraperConfigSchema, especially dates
        // This might require parsing if dates are stored as strings or transforming if needed
        // For now, assume direct mapping is okay after _id transformation
      };
    });

    // Validate each object against the schema if there's a need for strict typing in response
    // or if transformations are complex. For simplicity, direct mapping is used here.

    return NextResponse.json(scrapers, { status: 200 });

  } catch (error) {
    console.error('Error fetching scrapers:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
