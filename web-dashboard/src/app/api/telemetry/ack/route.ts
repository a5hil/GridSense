import { NextRequest, NextResponse } from "next/server";
import { telemetryStore } from "@/lib/telemetry-state";

export async function POST(req: NextRequest) {
  try {
    telemetryStore.acknowledgeAlarm();
    return NextResponse.json({ success: true, message: "Alarm acknowledged by operator" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
