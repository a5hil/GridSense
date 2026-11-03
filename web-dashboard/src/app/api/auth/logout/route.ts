import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken, invalidateUserSession } from "@/lib/auth";
import { telemetryStore } from "@/lib/telemetry-state";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (token) {
      const user = verifySessionToken(token);
      if (user?.username) {
        await invalidateUserSession(user.username);
        telemetryStore.addEventLog({
          level: "INFO",
          source: "AUTH",
          message: `Operator logout: ${user.name} (${user.badgeId}) terminated dispatch session`,
        });
      }
    }
  } catch {}

  const res = NextResponse.json({ success: true, message: "Logged out" });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
