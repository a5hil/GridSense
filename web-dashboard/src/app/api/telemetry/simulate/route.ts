import { NextRequest, NextResponse } from "next/server";
import { telemetryStore } from "@/lib/telemetry-state";

export async function POST(_req: NextRequest) {
  telemetryStore.stopSimulation();
  return NextResponse.json({
    success: true,
    message: "Mock simulation disabled. GridSense is in live physical hardware telemetry mode.",
  });
}

export async function GET(_req: NextRequest) {
  telemetryStore.stopSimulation();
  return NextResponse.json({
    success: true,
    message: "Mock simulation disabled. GridSense is in live physical hardware telemetry mode.",
  });
}
