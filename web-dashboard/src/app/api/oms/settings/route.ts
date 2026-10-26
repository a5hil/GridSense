import { NextRequest, NextResponse } from "next/server";
import { omsManager } from "@/lib/oms-state";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const settings = omsManager.getSettings();
    return NextResponse.json({ success: true, settings });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
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
