import { NextResponse } from "next/server";
import { networkTwin } from "@/lib/network/twin";

export async function GET() {
  try {
    const snapshot = networkTwin.getSnapshot();
    return NextResponse.json({ success: true, snapshot });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
