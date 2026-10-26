import { NextRequest, NextResponse } from "next/server";
import { omsManager } from "@/lib/oms-state";

export async function GET() {
  const tickets = omsManager.getTickets();
  const activeTicket = omsManager.getActiveTicket();
  const settings = omsManager.getSettings();
  return NextResponse.json({ tickets, activeTicket, settings });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ticketId, status, message, linemanName, notes } = body;

    if (action === "create_ticket") {
      const { faultCode, affectedPole, gps, idiff, severity, feederId, feederName, estimatedCustomers } = body;
      const created = omsManager.registerIncidentForObservation({
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

    if (action === "manual_dispatch" && ticketId) {
      const { crewName, crewPhone, crewType, operatorNotes } = body;
      const updated = omsManager.manualDispatchCrew(ticketId, {
        crewName: crewName || "Lineman Quick-Response Unit #4",
        crewPhone: crewPhone || "+919447012345",
        crewType: crewType || "Lineman QRU",
        operatorNotes,
      });
      return NextResponse.json({ success: true, ticket: updated });
    }

    if (action === "flag_maintenance" && ticketId) {
      const { reason } = body;
      const updated = omsManager.flagAsScheduledMaintenance(ticketId, reason);
      return NextResponse.json({ success: true, ticket: updated });
    }

    if (action === "escalate_early" && ticketId) {
      const updated = omsManager.escalateEarly(ticketId);
      return NextResponse.json({ success: true, ticket: updated });
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
