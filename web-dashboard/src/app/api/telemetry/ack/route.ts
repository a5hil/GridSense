import { NextRequest, NextResponse } from "next/server";
import { telemetryStore } from "@/lib/telemetry-state";
import { networkTwin } from "@/lib/network/twin";
import { assertOperatorSession } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  try {
    // Operator RBAC Authorization
    const auth = await assertOperatorSession();
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.statusCode || 401 });
    }

    telemetryStore.acknowledgeAlarm();
    telemetryStore.resetProtection();
    networkTwin.clearFaults();
    return NextResponse.json({ success: true, message: "Alarm acknowledged and protection reset" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
