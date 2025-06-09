import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/web_scraper_dev_placeholder';
const DATABASE_NAME = process.env.DATABASE_NAME || 'web_scraper_dev_placeholder_db';

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

if (!DATABASE_NAME) {
  throw new Error('Please define the DATABASE_NAME environment variable inside .env.local');
}

// Global is used here to maintain a cached connection across hot reloads
// in development. This prevents connections from growing exponentially
// during API Route usage.
// Type assertion for globalThis with a custom property
interface CustomGlobal extends NodeJS.Global {
  mongoClient?: MongoClient;
  mongoDb?: Db;
}
const customGlobal = globalThis as CustomGlobal;

let cachedClient: MongoClient | undefined = customGlobal.mongoClient;
let cachedDb: Db | undefined = customGlobal.mongoDb;

export async function connectToDatabase(): Promise<{ client: MongoClient, db: Db }> {
  if (cachedClient && cachedDb) {
    try {
      // Verify connection by pinging (optional, but good practice)
      await cachedClient.db('admin').command({ ping: 1 });
      // console.log('Using cached MongoDB connection');
      return { client: cachedClient, db: cachedDb };
    } catch (e) {
      // console.warn('Cached connection failed, creating new one.', e);
      cachedClient = undefined;
      cachedDb = undefined;
    }
  }

  // console.log('Creating new MongoDB connection');
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DATABASE_NAME);

    // Cache them on the global object
    customGlobal.mongoClient = client;
    customGlobal.mongoDb = db;

    cachedClient = client;
    cachedDb = db;

    // console.log('Successfully connected to MongoDB and cached connection');
    return { client, db };
  } catch (error) {
    // console.error('Failed to connect to MongoDB', error);
    // If connection fails, ensure client is closed to prevent resource leaks
    await client.close();
    throw error; // Re-throw error to be handled by the caller
  }
}

// Optional: A function to get just the Db object if client is not needed directly
export async function getDb(): Promise<Db> {
  const { db } = await connectToDatabase();
  return db;
}
