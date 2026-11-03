import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "gs_scada_session";
const AUTH_SECRET = process.env.AUTH_SECRET || "gridsense-scada-hmac-secret-viva2026-secure";

function base64UrlToArrayBuffer(str: string): ArrayBuffer {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buffer;
}

async function isTokenValid(token?: string): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [data, sig] = parts;
  if (!data || !sig) return false;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(AUTH_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBuffer = base64UrlToArrayBuffer(sig);
    const valid = await crypto.subtle.verify("HMAC", key, sigBuffer, encoder.encode(data));
    if (!valid) return false;

    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
    const payload = JSON.parse(atob(base64 + pad));
    if (!payload.exp || Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Allow static assets, next internal files, and public auth / bridge ingest APIs
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/icon.svg") ||
    pathname.startsWith("/apple-icon.png") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/telemetry/ingest" ||
    pathname === "/api/telemetry/stream"
  ) {
    return NextResponse.next();
  }

  // 1b. CSRF Protection: Verify Origin on state-changing API operations to prevent cross-origin abuse
  if (pathname.startsWith("/api/") && ["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) {
      return NextResponse.json(
        { success: false, error: "CSRF_FORBIDDEN", message: "Cross-origin SCADA operations forbidden" },
        { status: 403 }
      );
    }
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const valid = await isTokenValid(token);

  // 2. Allow operators to access /login freely (to switch users or re-authenticate)
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // 3. Block unauthenticated access to protected SCADA pages & APIs
  if (!valid) {
    if (pathname.startsWith("/api/")) {
      const jsonRes = NextResponse.json(
        { success: false, error: "UNAUTHORIZED_SCADA_ACCESS", message: "Operator session required" },
        { status: 401 }
      );
      if (token) jsonRes.cookies.delete(COOKIE_NAME);
      return jsonRes;
    }
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("from", pathname);
    }
    const redirectRes = NextResponse.redirect(loginUrl);
    if (token) redirectRes.cookies.delete(COOKIE_NAME);
    return redirectRes;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
