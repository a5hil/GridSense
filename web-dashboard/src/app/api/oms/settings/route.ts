import { NextRequest, NextResponse } from "next/server";
import { omsManager } from "@/lib/oms-state";

export async function GET() {
  const settings = omsManager.getSettings();
  return NextResponse.json({ success: true, settings });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const updated = omsManager.updateSettings(body);
    return NextResponse.json({ success: true, settings: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
