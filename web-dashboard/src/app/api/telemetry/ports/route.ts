import { NextRequest, NextResponse } from "next/server";
import { connectSerialPort, disconnectSerialPort, listAvailablePorts, sendSerialCommand } from "@/lib/serial-reader";
import { telemetryStore } from "@/lib/telemetry-state";
import { getDatabaseStats } from "@/lib/db";

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
      const cmdStr = (command || "").toString();
      const success = await sendSerialCommand(cmdStr);
      return NextResponse.json({
        success,
        message: success ? `Command '${cmdStr}' sent to hardware` : "Failed to send command (port not open)",
      });
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
