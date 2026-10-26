import { NextRequest, NextResponse } from "next/server";
import { telemetryStore } from "@/lib/telemetry-state";
import { networkTwin } from "@/lib/network/twin";

export async function POST(req: NextRequest) {
  try {
    telemetryStore.acknowledgeAlarm();
    telemetryStore.resetProtection();
    networkTwin.clearFaults();
    return NextResponse.json({ success: true, message: "Alarm acknowledged and protection reset" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
