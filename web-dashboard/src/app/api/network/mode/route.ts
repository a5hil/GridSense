import { NextRequest, NextResponse } from "next/server";
import { networkTwin } from "@/lib/network/twin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode } = body;

    if (mode !== "NOT_INSTRUMENTED" && mode !== "SIM") {
      return NextResponse.json(
        { success: false, message: "Invalid mode. Must be 'NOT_INSTRUMENTED' or 'SIM'" },
        { status: 400 }
      );
    }

    networkTwin.setMode(mode);
    return NextResponse.json({
      success: true,
      mode,
      snapshot: networkTwin.getSnapshot(),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
