import { MongoClient, Db } from "mongodb";
import { GridTelemetry, SCADAEventLog, TroubleTicket } from "./types";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.MONGODB_DB || "gridsense";

let client: MongoClient | null = null;
let db: Db | null = null;
let isConnected = false;
let connectionAttempted = false;

// Fallback in-memory circular buffers if MongoDB service is offline
const inMemoryTelemetry: GridTelemetry[] = [];
const inMemoryLogs: SCADAEventLog[] = [];
const inMemoryTickets: TroubleTicket[] = [];
const MAX_BUFFER = 200;

export async function getDb(): Promise<Db | null> {
  if (db && isConnected) return db;

  try {
    if (!client) {
      client = new MongoClient(MONGODB_URI, {
        serverSelectionTimeoutMS: 2500,
        connectTimeoutMS: 2500,
      });
    }
    await client.connect();
    db = client.db(DB_NAME);
    isConnected = true;
    connectionAttempted = true;

    // Ensure indexes exist for high-speed queries
    try {
      await db.collection("trouble_tickets").createIndex({ ticketId: 1 }, { unique: true });
      await db.collection("scada_events").createIndex({ createdAt: -1 });
      await db.collection("telemetry_history").createIndex({ createdAt: -1 });
    } catch {
      // Index creation optional
    }

    return db;
  } catch (err: any) {
    isConnected = false;
    connectionAttempted = true;
    return null;
  }
}

export function isMongoConnected(): boolean {
  return isConnected;
}

export function getMongoDbName(): string {
  return DB_NAME;
}

export async function saveTelemetryRecord(data: GridTelemetry): Promise<void> {
  // Update in-memory buffer
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
    // Keep in memory buffer
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
    // Keep in memory buffer
  }
}

export async function saveTicketRecord(ticket: TroubleTicket): Promise<void> {
  // Update in-memory cache
  const idx = inMemoryTickets.findIndex((t) => t.ticketId === ticket.ticketId);
  if (idx >= 0) {
    inMemoryTickets[idx] = ticket;
  } else {
    inMemoryTickets.unshift(ticket);
  }

  try {
    const database = await getDb();
    if (database) {
      await database.collection("trouble_tickets").updateOne(
        { ticketId: ticket.ticketId },
        {
          $set: {
            ...ticket,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            persistedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
  } catch (err: any) {
    // Kept in memory
  }
}

export async function getStoredTickets(): Promise<TroubleTicket[]> {
  try {
    const database = await getDb();
    if (database) {
      const tickets = await database
        .collection("trouble_tickets")
        .find()
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();
      if (tickets && tickets.length > 0) {
        return tickets.map((t) => {
          const { _id, ...rest } = t;
          return rest as unknown as TroubleTicket;
        });
      }
    }
  } catch (err) {
    // fallback
  }
  return inMemoryTickets;
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
        return records.map((r) => {
          const { _id, ...rest } = r;
          return rest as unknown as GridTelemetry;
        });
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
        return logs.map((l) => {
          const { _id, ...rest } = l;
          return rest as unknown as SCADAEventLog;
        });
      }
    }
  } catch (err) {
    // fallback
  }
  return inMemoryLogs.slice(0, limit);
}

export async function getDatabaseStats(): Promise<{
  isConnected: boolean;
  uri: string;
  dbName: string;
  counts: { telemetry: number; logs: number; tickets: number };
}> {
  let counts = { telemetry: inMemoryTelemetry.length, logs: inMemoryLogs.length, tickets: inMemoryTickets.length };
  try {
    const database = await getDb();
    if (database) {
      const [telemetryCount, logCount, ticketCount] = await Promise.all([
        database.collection("telemetry_history").countDocuments().catch(() => 0),
        database.collection("scada_events").countDocuments().catch(() => 0),
        database.collection("trouble_tickets").countDocuments().catch(() => 0),
      ]);
      counts = { telemetry: telemetryCount, logs: logCount, tickets: ticketCount };
    }
  } catch {
    // fallback
  }

  return {
    isConnected,
    uri: MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@"),
    dbName: DB_NAME,
    counts,
  };
}
