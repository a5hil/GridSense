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
  sessionVersion?: number;
}

interface StoredAccount extends ScadaUser {
  passwordHash: string;
  salt: string;
  iterations?: number;
}

const AUTH_SECRET = process.env.AUTH_SECRET || "gridsense-scada-hmac-secret-viva2026-secure";
if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
  console.warn("⚠️ SCADA SECURITY WARNING: AUTH_SECRET is not set in production environment variables! Using fallback secret.");
}

export const COOKIE_NAME = "gs_scada_session";
export const PBKDF2_ITERATIONS = 600000;

/**
 * Constant-time string comparison to prevent timing attacks on HMAC signatures and password hashes.
 */
export function safeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * PBKDF2-HMAC-SHA256 password hashing conforming to OWASP guidelines (600,000 iterations).
 */
export function hashPassword(password: string, salt: string, iterations = PBKDF2_ITERATIONS): string {
  return crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
}

// Generate dynamic cryptographic salt for preseeded accounts
const SEED_SALT = crypto.randomBytes(16).toString("hex");

export const PRESEEDED_USERS: StoredAccount[] = [
  {
    id: "usr_op_01",
    username: "operator",
    passwordHash: hashPassword("gridsense123", SEED_SALT, PBKDF2_ITERATIONS),
    salt: SEED_SALT,
    iterations: PBKDF2_ITERATIONS,
    sessionVersion: 1,
    name: "GridSense Operator",
    role: "OPERATOR",
    badgeId: "#OP-4412",
    station: "Angamaly 33/11kV Substation",
    desk: "Feeder Control Desk",
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

/**
 * Automatically upgrade legacy account password hashes (e.g. from 1,000 iterations to 600,000).
 */
async function upgradeUserSecurity(username: string, pass: string): Promise<void> {
  const newSalt = crypto.randomBytes(16).toString("hex");
  const newHash = hashPassword(pass, newSalt, PBKDF2_ITERATIONS);

  const inMem = inMemoryAccounts.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (inMem) {
    inMem.salt = newSalt;
    inMem.passwordHash = newHash;
    inMem.iterations = PBKDF2_ITERATIONS;
  }

  try {
    const db = await getDb();
    if (db) {
      await db.collection("scada_users").updateOne(
        { username: username.toLowerCase() },
        { $set: { salt: newSalt, passwordHash: newHash, iterations: PBKDF2_ITERATIONS } }
      );
    }
  } catch {}
}

export async function authenticateCredentials(
  username: string,
  pass: string
): Promise<ScadaUser | null> {
  const user = await findUserByUsername(username);
  if (!user) {
    // Constant-time defense: compute dummy PBKDF2 calculation to eliminate username enumeration via timing side-channel
    hashPassword(pass, "a1b2c3d4e5f60718293a4b5c6d7e8f90", PBKDF2_ITERATIONS);
    return null;
  }

  // Use user's iterations or legacy default (1,000)
  const iterations = user.iterations || 1000;
  const computed = hashPassword(pass, user.salt, iterations);

  if (safeCompare(computed, user.passwordHash)) {
    // Auto-migrate legacy work factors to OWASP-compliant 600k
    if (iterations < PBKDF2_ITERATIONS) {
      upgradeUserSecurity(user.username, pass).catch(() => {});
    }

    const { passwordHash, salt, iterations: _, ...safeUser } = user;
    return safeUser;
  }
  return null;
}

/**
 * Increment session version to instantly invalidate all existing tokens for this user across all devices.
 */
export async function invalidateUserSession(username: string): Promise<void> {
  const clean = username.trim().toLowerCase();
  const inMem = inMemoryAccounts.find((u) => u.username.toLowerCase() === clean);
  if (inMem) {
    inMem.sessionVersion = (inMem.sessionVersion || 1) + 1;
  }

  try {
    const db = await getDb();
    if (db) {
      await db.collection("scada_users").updateOne(
        { username: clean },
        { $inc: { sessionVersion: 1 } }
      );
    }
  } catch {}
}

// Signed session token: base64(payload).signature with sessionVersion
export function createSessionToken(user: ScadaUser, sessionVersion = 1): string {
  const payload = JSON.stringify({
    u: user.username,
    r: user.role,
    n: user.name,
    b: user.badgeId,
    s: user.station,
    d: user.desk,
    v: sessionVersion,
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  });
  const data = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifySessionToken(token: string): ScadaUser | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  if (!data || !sig) return null;

  const expectedSig = crypto.createHmac("sha256", AUTH_SECRET).update(data).digest("base64url");
  if (!safeCompare(sig, expectedSig)) return null;

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
      sessionVersion: obj.v,
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
    const user = verifySessionToken(token);
    if (!user) return null;

    // Verify session version against user store to enforce instantaneous revocation
    const account = await findUserByUsername(user.username);
    if (account && account.sessionVersion && user.sessionVersion) {
      if (account.sessionVersion !== user.sessionVersion) {
        return null;
      }
    }

    return user;
  } catch {
    return null;
  }
}
