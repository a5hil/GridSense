import { NextRequest, NextResponse } from "next/server";
import { connectSerialPort, disconnectSerialPort, listAvailablePorts, sendSerialCommand } from "@/lib/serial-reader";
import { telemetryStore } from "@/lib/telemetry-state";
import { getDatabaseStats } from "@/lib/db";
import { assertOperatorSession } from "@/lib/rbac";

const ALLOWED_SERIAL_COMMANDS = new Set(["n", "r", "t", "ping", "reset", "d", "b", "o", "p", "status"]);

export async function GET() {
  const [ports, dbStats] = await Promise.all([
    listAvailablePorts(),
    getDatabaseStats(),
  ]);
  const status = telemetryStore.getStatus();
  return NextResponse.json({ ports, status, dbStats });
}

export async function POST(req: NextRequest) {
  try {
    // 1. Operator RBAC Authorization
    const auth = await assertOperatorSession();
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.statusCode || 401 });
    }

    const body = await req.json();
    const { action, port, baudRate, command } = body;

    if (action === "disconnect") {
      await disconnectSerialPort();
      return NextResponse.json({ success: true, message: "Disconnected serial port" });
    }

    if (action === "connect") {
      const res = await connectSerialPort(port, baudRate || 115200);
      return NextResponse.json(res);
    }

    if (action === "command") {
      // 2. Strict UART Command Whitelisting & Input Sanitization
      const cleanCmd = (command || "").toString().trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      
      if (!ALLOWED_SERIAL_COMMANDS.has(cleanCmd)) {
        return NextResponse.json(
          {
            success: false,
            error: `Unauthorized or invalid serial command '${cleanCmd}'. Permitted commands: ${Array.from(ALLOWED_SERIAL_COMMANDS).join(", ")}`,
          },
          { status: 400 }
        );
      }

      if (cleanCmd === "n" || cleanCmd === "reset") {
        telemetryStore.resetProtection();
      }

      const success = await sendSerialCommand(cleanCmd);
      return NextResponse.json({
        success,
        message: success ? `Command '${cleanCmd}' dispatched to gateway` : "Failed to send command (port not open)",
      });
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
