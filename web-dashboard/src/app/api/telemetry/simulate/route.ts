import { NextRequest, NextResponse } from "next/server";
import { telemetryStore } from "@/lib/telemetry-state";

export async function POST(req: NextRequest) {
  try {
    let scenario = "NORMAL";
    try {
      const body = await req.json();
      if (body && body.scenario) {
        scenario = body.scenario;
      }
    } catch (parseErr) {
      // Fallback: check query parameter ?scenario=...
      const url = new URL(req.url);
      const queryScenario = url.searchParams.get("scenario");
      if (queryScenario) scenario = queryScenario;
    }

    if (scenario === "STOP") {
      telemetryStore.stopSimulation();
      return NextResponse.json({ success: true, message: "Simulation stopped" });
    }

    telemetryStore.startSimulation(scenario as any);
    return NextResponse.json({ success: true, message: `Simulator running: ${scenario}` });
  } catch (err: any) {
    console.error("[Simulate API Error]:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const scenario = (url.searchParams.get("scenario") || "NORMAL") as any;
  telemetryStore.startSimulation(scenario);
  return NextResponse.json({ success: true, message: `Simulator running: ${scenario}` });
}
