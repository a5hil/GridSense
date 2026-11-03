import { MongoClient, Db } from "mongodb";
import { GridTelemetry, SCADAEventLog, TroubleTicket, OmsSettings } from "./types";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.MONGODB_DB || "gridsense";

interface GlobalMongoState {
  client: MongoClient | null;
  db: Db | null;
  isConnected: boolean;
  connectionAttempted: boolean;
  indexesCreated: boolean;
  lastFailedAt: number;
  connectingPromise: Promise<Db | null> | null;
  inMemoryTelemetry: GridTelemetry[];
  inMemoryLogs: SCADAEventLog[];
  inMemoryTickets: TroubleTicket[];
  inMemorySettings: Partial<OmsSettings> | null;
}

const globalForMongo = globalThis as unknown as { __gridsense_mongo?: GlobalMongoState };

if (!globalForMongo.__gridsense_mongo) {
  globalForMongo.__gridsense_mongo = {
    client: null,
    db: null,
    isConnected: false,
    connectionAttempted: false,
    indexesCreated: false,
    lastFailedAt: 0,
    connectingPromise: null,
    inMemoryTelemetry: [],
    inMemoryLogs: [],
    inMemoryTickets: [],
    inMemorySettings: null,
  };
}

const state = globalForMongo.__gridsense_mongo;
const RETRY_COOLDOWN_MS = 15000;
const MAX_BUFFER = 200;

export async function getDb(): Promise<Db | null> {
  if (state.db && state.isConnected) return state.db;

  // Circuit breaker: if MongoDB recently failed to connect, return null immediately (<1ms)
  // so API requests and in-memory fallback never block waiting for a socket timeout
  if (state.lastFailedAt > 0 && Date.now() - state.lastFailedAt < RETRY_COOLDOWN_MS) {
    return null;
  }

  if (state.connectingPromise) return state.connectingPromise;

  state.connectingPromise = (async () => {
    try {
      if (!state.client) {
        state.client = new MongoClient(MONGODB_URI, {
          serverSelectionTimeoutMS: 2000,
          connectTimeoutMS: 2000,
        });
      }
      await state.client.connect();
      state.db = state.client.db(DB_NAME);
      state.isConnected = true;
      state.connectionAttempted = true;
      state.lastFailedAt = 0;

      // Ensure indexes exist once per connection lifecycle
      if (!state.indexesCreated) {
        state.indexesCreated = true;
        Promise.all([
          state.db.collection("trouble_tickets").createIndex({ ticketId: 1 }, { unique: true }),
          state.db.collection("scada_events").createIndex({ createdAt: -1 }),
          state.db.collection("telemetry_history").createIndex({ createdAt: -1 }),
        ]).catch(() => {});
      }

      return state.db;
    } catch {
      state.isConnected = false;
      state.connectionAttempted = true;
      state.lastFailedAt = Date.now();
      return null;
    } finally {
      state.connectingPromise = null;
    }
  })();

  return state.connectingPromise;
}

export function isMongoConnected(): boolean {
  return state.isConnected;
}

export function getMongoDbName(): string {
  return DB_NAME;
}

export async function saveTelemetryRecord(data: GridTelemetry): Promise<void> {
  // Strip nested history/tickets arrays before storing individual point to avoid 40x document bloat
  const { history: _h, tickets: _t, ...compactRecord } = data as GridTelemetry & { tickets?: unknown };
  state.inMemoryTelemetry.unshift(compactRecord as GridTelemetry);
  if (state.inMemoryTelemetry.length > MAX_BUFFER) state.inMemoryTelemetry.pop();

  try {
    const database = await getDb();
    if (database) {
      await database.collection("telemetry_history").insertOne({
        ...compactRecord,
        createdAt: new Date(),
      });
    }
  } catch (err: any) {
    // Keep in memory buffer
  }
}

export async function saveLogRecord(log: SCADAEventLog): Promise<void> {
  state.inMemoryLogs.unshift(log);
  if (state.inMemoryLogs.length > MAX_BUFFER) state.inMemoryLogs.pop();

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
  const idx = state.inMemoryTickets.findIndex((t) => t.ticketId === ticket.ticketId);
  if (idx >= 0) {
    state.inMemoryTickets[idx] = ticket;
  } else {
    state.inMemoryTickets.unshift(ticket);
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
  return state.inMemoryTickets;
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
  return state.inMemoryTelemetry.slice(0, limit);
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
  return state.inMemoryLogs.slice(0, limit);
}

export async function getDatabaseStats(): Promise<{
  isConnected: boolean;
  uri: string;
  dbName: string;
  counts: { telemetry: number; logs: number; tickets: number };
}> {
  let counts = {
    telemetry: state.inMemoryTelemetry.length,
    logs: state.inMemoryLogs.length,
    tickets: state.inMemoryTickets.length,
  };
  try {
    const database = await getDb();
    if (database) {
      // Use estimatedDocumentCount for O(1) metadata lookups on telemetry & logs
      const [telemetryCount, logCount, ticketCount] = await Promise.all([
        database.collection("telemetry_history").estimatedDocumentCount().catch(() => 0),
        database.collection("scada_events").estimatedDocumentCount().catch(() => 0),
        database.collection("trouble_tickets").countDocuments().catch(() => 0),
      ]);
      counts = { telemetry: telemetryCount, logs: logCount, tickets: ticketCount };
    }
  } catch {
    // fallback
  }

  return {
    isConnected: state.isConnected,
    uri: MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@"),
    dbName: DB_NAME,
    counts,
  };
}

export async function saveSettingsRecord(settings: OmsSettings): Promise<void> {
  state.inMemorySettings = { ...settings };
  try {
    const database = await getDb();
    if (database) {
      await database.collection("scada_settings").updateOne(
        { id: "global_scada_settings" },
        {
          $set: {
            ...settings,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
  } catch (err: any) {
    // Keep in memory
  }
}

export async function getStoredSettings(): Promise<Partial<OmsSettings> | null> {
  try {
    const database = await getDb();
    if (database) {
      const doc = await database.collection("scada_settings").findOne({ id: "global_scada_settings" });
      if (doc) {
        const { _id, id, updatedAt, ...settings } = doc as any;
        state.inMemorySettings = settings as Partial<OmsSettings>;
        return settings as Partial<OmsSettings>;
      }
    }
  } catch (err: any) {
    // Fallback
  }
  return state.inMemorySettings;
}
