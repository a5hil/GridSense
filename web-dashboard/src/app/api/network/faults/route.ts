import { NextRequest, NextResponse } from "next/server";
import { networkTwin } from "@/lib/network/twin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "inject") {
      const result = networkTwin.injectFault({
        type: body.type,
        spanChildId: body.spanChildId,
        feederId: body.feederId,
        phase: body.phase,
        magnitudeA: body.magnitudeA ? Number(body.magnitudeA) : undefined,
      });

      if (!result.ok) {
        return NextResponse.json({ success: false, message: result.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: result.message,
        snapshot: networkTwin.getSnapshot(),
      });
    }

    if (action === "clear") {
      networkTwin.clearFaults(body.id);
      return NextResponse.json({
        success: true,
        message: body.id ? `Cleared fault ${body.id}` : "Cleared all simulated faults",
        snapshot: networkTwin.getSnapshot(),
      });
    }

    return NextResponse.json({ success: false, message: `Unknown action '${action}'` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
