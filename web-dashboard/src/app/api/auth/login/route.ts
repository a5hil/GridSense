import { NextRequest, NextResponse } from "next/server";
import { authenticateCredentials, createSessionToken, COOKIE_NAME } from "@/lib/auth";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { telemetryStore } from "@/lib/telemetry-state";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: "Username and password required" },
        { status: 400 }
      );
    }

    const cleanUser = username.trim().toLowerCase();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

    // Dual-Key Rate Limiting Defense:
    // 1. Account-level lockout: Max 5 attempts per username (prevents distributed password spraying across rotating IPs)
    // 2. IP-level throttle: Max 20 attempts per IP (prevents multi-account dictionary/credential stuffing)
    const userRateKey = `login:user:${cleanUser}`;
    const ipRateKey = `login:ip:${ip}`;

    const userRateCheck = checkRateLimit(userRateKey, 5, 15 * 60 * 1000);
    const ipRateCheck = checkRateLimit(ipRateKey, 20, 15 * 60 * 1000);

    if (!userRateCheck.allowed || !ipRateCheck.allowed) {
      const retryAfter = Math.max(userRateCheck.retryAfterSec, ipRateCheck.retryAfterSec);
      
      // Log security incident to Sequence of Events (SOE) audit trail
      telemetryStore.addEventLog({
        level: "WARN",
        source: "SECURITY",
        message: `Terminal Access Suspended: Rate limit threshold exceeded for '${cleanUser}' from IP ${ip}`,
        details: `Lockout duration: ${retryAfter} seconds remaining.`,
      });

      return NextResponse.json(
        {
          success: false,
          error: `Too many failed authentication attempts. Please retry after ${retryAfter} seconds.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        }
      );
    }

    const user = await authenticateCredentials(cleanUser, password);
    if (!user) {
      // Log authentication rejection to SCADA security log
      telemetryStore.addEventLog({
        level: "WARN",
        source: "AUTH",
        message: `Authentication rejected: Invalid credentials for operator '${cleanUser}' from IP ${ip}`,
      });

      return NextResponse.json(
        { success: false, error: "Invalid operator credentials or unassigned badge ID" },
        { status: 401 }
      );
    }

    // Reset rate limiter keys on successful authentication
    resetRateLimit(userRateKey);
    resetRateLimit(ipRateKey);

    // Audit log successful operator session creation
    telemetryStore.addEventLog({
      level: "INFO",
      source: "AUTH",
      message: `Authorized dispatch session created: ${user.name} (${user.badgeId}) on ${user.station}`,
    });

    const token = createSessionToken(user, user.sessionVersion || 1);
    const res = NextResponse.json({ success: true, user });

    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60, // 24 hours
      path: "/",
    });

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
