import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken, findUserByUsername } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  const user = verifySessionToken(token);
  if (!user) {
    const res = NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  // Check if session has been invalidated
  const account = await findUserByUsername(user.username);
  if (account && account.sessionVersion && user.sessionVersion) {
    if (account.sessionVersion !== user.sessionVersion) {
      const res = NextResponse.json({ authenticated: false, user: null }, { status: 401 });
      res.cookies.delete(COOKIE_NAME);
      return res;
    }
  }

  return NextResponse.json({ authenticated: true, user });
}
