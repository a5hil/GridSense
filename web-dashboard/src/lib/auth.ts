import crypto from "crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";

export type UserRole = "OPERATOR" | "FIELD_ENGINEER" | "ADMIN" | "AUDITOR";

export interface ScadaUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  badgeId: string;
  station: string;
  desk?: string;
}

interface StoredAccount extends ScadaUser {
  passwordHash: string;
  salt: string;
}

const AUTH_SECRET = process.env.AUTH_SECRET || "gridsense-scada-hmac-secret-viva2026-secure";
export const COOKIE_NAME = "gs_scada_session";

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 1000, 32, "sha256").toString("hex");
}

// Generate deterministic salt for seed accounts
const SEED_SALT = "gridsense_salt_2026";

export const PRESEEDED_USERS: StoredAccount[] = [
  {
    id: "usr_op_01",
    username: "operator",
    passwordHash: hashPassword("gridsense123", SEED_SALT),
    salt: SEED_SALT,
    name: "K. P. Rajesh",
    role: "OPERATOR",
    badgeId: "#OP-4412",
    station: "Angamaly 33/11kV Substation",
    desk: "Feeder 04 Dispatch Console",
  },
  {
    id: "usr_adm_01",
    username: "admin",
    passwordHash: hashPassword("admin123", SEED_SALT),
    salt: SEED_SALT,
    name: "Er. Anita Varma",
    role: "ADMIN",
    badgeId: "#ENG-1002",
    station: "Angamaly 33/11kV Substation",
    desk: "Executive Substation In-Charge",
  },
  {
    id: "usr_field_01",
    username: "lineman",
    passwordHash: hashPassword("lineman123", SEED_SALT),
    salt: SEED_SALT,
    name: "Suresh Kumar",
    role: "FIELD_ENGINEER",
    badgeId: "#LM-7701",
    station: "Sector 4 Line Maintenance",
    desk: "Quick-Response Unit #4",
  },
  {
    id: "usr_audit_01",
    username: "auditor",
    passwordHash: hashPassword("viva2026", SEED_SALT),
    salt: SEED_SALT,
    name: "External Viva Examiner",
    role: "AUDITOR",
    badgeId: "#AUD-9011",
    station: "KSEB Regulatory Board",
    desk: "System Audit & Compliance",
  },
];

let inMemoryAccounts: StoredAccount[] = [...PRESEEDED_USERS];

export async function initUsersDb(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const col = db.collection("scada_users");
    const count = await col.countDocuments();
    if (count === 0) {
      await col.insertMany(PRESEEDED_USERS as any[]);
    }
  } catch {
    // Memory fallback is active
  }
}

export async function findUserByUsername(username: string): Promise<StoredAccount | null> {
  const clean = username.trim().toLowerCase();
  try {
    const db = await getDb();
    if (db) {
      const u = (await db.collection("scada_users").findOne({ username: clean })) as unknown as StoredAccount;
      if (u) return u;
    }
  } catch {}
  return inMemoryAccounts.find((u) => u.username.toLowerCase() === clean) || null;
}

export async function authenticateCredentials(
  username: string,
  pass: string
): Promise<ScadaUser | null> {
  const user = await findUserByUsername(username);
  if (!user) return null;

  const computed = hashPassword(pass, user.salt);
  if (computed === user.passwordHash) {
    const { passwordHash, salt, ...safeUser } = user;
    return safeUser;
  }
  return null;
}

// Signed session token: base64(payload).signature
export function createSessionToken(user: ScadaUser): string {
  const payload = JSON.stringify({
    u: user.username,
    r: user.role,
    n: user.name,
    b: user.badgeId,
    s: user.station,
    d: user.desk,
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  });
  const data = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifySessionToken(token: string): ScadaUser | null {
  if (!token || !token.includes(".")) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;

  const expectedSig = crypto.createHmac("sha256", AUTH_SECRET).update(data).digest("base64url");
  if (sig !== expectedSig) return null;

  try {
    const raw = Buffer.from(data, "base64url").toString("utf-8");
    const obj = JSON.parse(raw);
    if (!obj.exp || Date.now() > obj.exp) return null;
    return {
      id: `usr_${obj.u}`,
      username: obj.u,
      role: obj.r,
      name: obj.n,
      badgeId: obj.b,
      station: obj.s,
      desk: obj.d,
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<ScadaUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifySessionToken(token);
  } catch {
    return null;
  }
}
