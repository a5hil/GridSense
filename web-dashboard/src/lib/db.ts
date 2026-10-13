import { MongoClient, Db } from "mongodb";
import { GridTelemetry, SCADAEventLog } from "./types";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.MONGODB_DB || "gridsense";

let client: MongoClient | null = null;
let db: Db | null = null;
let isConnected = false;
let connectionAttempted = false;

// Fallback in-memory circular buffers if MongoDB service is offline
const inMemoryTelemetry: GridTelemetry[] = [];
const inMemoryLogs: SCADAEventLog[] = [];
const MAX_BUFFER = 200;

export async function getDb(): Promise<Db | null> {
  if (db && isConnected) return db;
  if (connectionAttempted && !isConnected) return null; // Avoid spamming connection timeouts on every frame

  try {
    connectionAttempted = true;
    client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000,
    });
    await client.connect();
    db = client.db(DB_NAME);
    isConnected = true;
    console.log(`[MongoDB] Connected successfully to ${DB_NAME}`);
    return db;
  } catch (err: any) {
    isConnected = false;
    console.warn(`[MongoDB] Local MongoDB offline (${err.message}). Using high-performance in-memory fallback buffer.`);
    return null;
  }
}

export async function saveTelemetryRecord(data: GridTelemetry): Promise<void> {
  // Always update in-memory buffer
  inMemoryTelemetry.unshift(data);
  if (inMemoryTelemetry.length > MAX_BUFFER) inMemoryTelemetry.pop();

  try {
    const database = await getDb();
    if (database) {
      await database.collection("telemetry_history").insertOne({
        ...data,
        createdAt: new Date(),
      });
    }
  } catch (err: any) {
    console.warn(`[MongoDB] Save failed, data kept in memory buffer: ${err.message}`);
  }
}

export async function saveLogRecord(log: SCADAEventLog): Promise<void> {
  inMemoryLogs.unshift(log);
  if (inMemoryLogs.length > MAX_BUFFER) inMemoryLogs.pop();

  try {
    const database = await getDb();
    if (database) {
      await database.collection("scada_events").insertOne({
        ...log,
        createdAt: new Date(),
      });
    }
  } catch (err: any) {
    // silently maintain in memory
  }
}

export async function getRecentTelemetry(limit = 50): Promise<GridTelemetry[]> {
  try {
    const database = await getDb();
    if (database) {
      const records = await database
        .collection("telemetry_history")
        .find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      if (records.length > 0) {
        return records as unknown as GridTelemetry[];
      }
    }
  } catch (err) {
    // fallback
  }
  return inMemoryTelemetry.slice(0, limit);
}

export async function getRecentLogs(limit = 50): Promise<SCADAEventLog[]> {
  try {
    const database = await getDb();
    if (database) {
      const logs = await database
        .collection("scada_events")
        .find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      if (logs.length > 0) {
        return logs as unknown as SCADAEventLog[];
      }
    }
  } catch (err) {
    // fallback
  }
  return inMemoryLogs.slice(0, limit);
}
