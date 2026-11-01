import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken, invalidateUserSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (token) {
      const user = verifySessionToken(token);
      if (user?.username) {
        await invalidateUserSession(user.username);
      }
    }
  } catch {}

  const res = NextResponse.json({ success: true, message: "Logged out" });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
  });
  return res;
}
