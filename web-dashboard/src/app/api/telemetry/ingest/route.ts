import { NextRequest, NextResponse } from "next/server";
import { telemetryStore } from "@/lib/telemetry-state";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Optional bridge secret verification if configured in cloud environment
    const bridgeSecret = process.env.BRIDGE_SECRET;
    if (bridgeSecret) {
      const token = req.headers.get("x-bridge-token");
      if (token !== bridgeSecret) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid x-bridge-token" },
          { status: 401 }
        );
      }
    }

    const payload = await req.json();
    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON telemetry payload" },
        { status: 400 }
      );
    }

    // Deactivate simulator and establish live bridge connection
    telemetryStore.stopSimulation();

    const remotePortLabel =
      typeof payload.__port === "string" ? payload.__port : "COM8 (Remote Bridge)";
    telemetryStore.setPortStatus(remotePortLabel, true, false);

    // Ingest the telemetry packet directly into the real-time protection and SCADA engine
    telemetryStore.ingestRawJson(payload, "CLOUD_BRIDGE");

    return NextResponse.json({
      success: true,
      receivedAt: new Date().toISOString(),
      activePort: remotePortLabel,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to process telemetry payload", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function GET(_req: NextRequest) {
  const currentStatus = telemetryStore.getStatus();
  return NextResponse.json({
    status: "online",
    ready: true,
    service: "GridSense Telemetry Ingest API",
    activePort: currentStatus.activePort,
    gatewayConnected: currentStatus.gatewayConnected,
    isSimulated: currentStatus.isSimulated,
    timestamp: new Date().toISOString(),
  });
}
