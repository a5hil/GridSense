import { NextRequest, NextResponse } from "next/server";
import { omsManager } from "@/lib/oms-state";
import { telemetryStore } from "@/lib/telemetry-state";

export async function GET() {
  const tickets = omsManager.getTickets();
  const activeTicket = omsManager.getActiveTicket();
  return NextResponse.json({ tickets, activeTicket });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ticketId, status, message, linemanName, notes } = body;

    if (action === "create_ticket") {
      const { faultCode, affectedPole, gps, idiff, severity, feederId, feederName, estimatedCustomers } = body;
      const created = omsManager.autoCreateTicketForFault({
        faultCode: faultCode || "DISTRIBUTION_FAULT",
        affectedPole: affectedPole || "F1-P01",
        gps: gps || { lat: 10.2318, lng: 76.4088 },
        idiff: idiff || 0.45,
        severity: severity || "CRITICAL",
        feederId: feederId || "LT-1",
        feederName: feederName || "Feeder LT-1",
        estimatedCustomers: estimatedCustomers ?? 35,
      });
      return NextResponse.json({ success: true, ticket: created });
    }

    if (action === "update_status" && ticketId && status) {
      const updated = omsManager.updateTicketStatus(ticketId, status, message);
      return NextResponse.json({ success: true, ticket: updated });
    }

    if (action === "issue_ptw" && ticketId) {
      const ptw = omsManager.issuePtw(ticketId, linemanName || "K. P. Rajesh");
      return NextResponse.json({ success: true, ptw });
    }

    if (action === "clear_ptw" && ticketId) {
      const cleared = omsManager.clearPtw(ticketId, notes || "Conductor inspection completed and verified safe");
      return NextResponse.json({ success: cleared });
    }

    return NextResponse.json({ success: false, message: "Invalid action or parameters" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
