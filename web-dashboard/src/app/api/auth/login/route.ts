import { NextRequest, NextResponse } from "next/server";
import { authenticateCredentials, createSessionToken, COOKIE_NAME } from "@/lib/auth";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";

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

    // Rate Limiting: 5 attempts per IP/username per 15 minutes
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const rateLimitKey = `login:${ip}:${username.trim().toLowerCase()}`;
    const rateCheck = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many failed authentication attempts. Please retry after ${rateCheck.retryAfterSec} seconds.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateCheck.retryAfterSec) },
        }
      );
    }

    const user = await authenticateCredentials(username, password);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Invalid operator credentials or unassigned badge ID" },
        { status: 401 }
      );
    }

    // Reset rate limiter on successful authentication
    resetRateLimit(rateLimitKey);

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
