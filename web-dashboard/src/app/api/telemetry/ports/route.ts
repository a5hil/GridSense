import { NextRequest, NextResponse } from "next/server";
import { connectSerialPort, disconnectSerialPort, listAvailablePorts } from "@/lib/serial-reader";
import { telemetryStore } from "@/lib/telemetry-state";

export async function GET() {
  const ports = await listAvailablePorts();
  const status = telemetryStore.getStatus();
  return NextResponse.json({ ports, status });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, port, baudRate } = body;

    if (action === "disconnect") {
      await disconnectSerialPort();
      return NextResponse.json({ success: true, message: "Disconnected serial port" });
    }

    if (action === "connect") {
      const res = await connectSerialPort(port, baudRate || 115200);
      return NextResponse.json(res);
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
