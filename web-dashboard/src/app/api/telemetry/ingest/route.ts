import { NextRequest, NextResponse } from "next/server";
import { telemetryStore } from "@/lib/telemetry-state";
import { safeCompare } from "@/lib/auth";

export const dynamic = "force-dynamic";

const EXPECTED_BRIDGE_SECRET =
  process.env.BRIDGE_SECRET || "gridsense-telemetry-bridge-viva-2026";

function isValidNumber(val: unknown, min: number, max: number): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val !== "number") return false;
  if (isNaN(val) || !isFinite(val)) return false;
  return val >= min && val <= max;
}

function validateTelemetryPayload(payload: any): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, error: "Payload must be a valid JSON object" };
  }

  // Validate voltage readings (0V to 350V)
  const voltages = [payload.v_r, payload.v_y, payload.v_b, payload.v, payload.v1, payload.v2];
  for (const v of voltages) {
    if (!isValidNumber(v, 0, 350)) {
      return { valid: false, error: `Invalid voltage reading: ${v}. Must be finite number between 0 and 350V.` };
    }
  }

  // Validate current readings (0A to 120A)
  const currents = [payload.i_r, payload.i_y, payload.i_b, payload.i, payload.i1, payload.i2, payload.diff_current];
  for (const i of currents) {
    if (!isValidNumber(i, 0, 120)) {
      return { valid: false, error: `Invalid current reading: ${i}. Must be finite number between 0 and 120A.` };
    }
  }

  // Validate power readings (0W to 100kW)
  const powers = [payload.p_r, payload.p_y, payload.p_b, payload.p, payload.p1, payload.p2];
  for (const p of powers) {
    if (!isValidNumber(p, 0, 100000)) {
      return { valid: false, error: `Invalid power reading: ${p}. Must be finite number between 0 and 100kW.` };
    }
  }

  return { valid: true };
}

export async function POST(req: NextRequest) {
  try {
    // 1. Mutual Ingestion Authentication
    const token = req.headers.get("x-bridge-token") || "";
    if (!safeCompare(token, EXPECTED_BRIDGE_SECRET)) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing x-bridge-token" },
        { status: 401 }
      );
    }

    const payload = await req.json();

    // 2. Schema & Physical Range Bounds Validation
    const validation = validateTelemetryPayload(payload);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Telemetry validation error: ${validation.error}` },
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
