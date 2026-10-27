import { NextRequest, NextResponse } from "next/server";
import { omsManager } from "@/lib/oms-state";
import { NODE_BY_ID } from "@/lib/network/topology";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const tickets = omsManager.getTickets();
    const activeTicket = omsManager.getActiveTicket();
    const settings = omsManager.getSettings();
    return NextResponse.json({ tickets, activeTicket, settings });
  } catch (err: any) {
    console.error("[OMS API] Failed to fetch tickets:", err);
    return NextResponse.json(
      { tickets: [], activeTicket: null, settings: omsManager.getSettings(), error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ticketId, status, message, linemanName, notes } = body;

    if (action === "create_ticket") {
      const { faultCode, affectedPole, gps, idiff, severity, feederId, feederName, estimatedCustomers } = body;
      const targetPole = affectedPole || "F1-P02";
      const topo = NODE_BY_ID[targetPole] || NODE_BY_ID["F1-P02"];
      const resolvedGps = gps || (topo ? { lat: topo.lat, lng: topo.lng } : { lat: 10.232172, lng: 76.408750 });
      const created = omsManager.registerIncidentForObservation({
        faultCode: faultCode || "DISTRIBUTION_FAULT",
        affectedPole: targetPole,
        gps: resolvedGps,
        idiff: idiff || 0.45,
        severity: severity || "CRITICAL",
        feederId: feederId || topo?.feederId || "LT-1",
        feederName: feederName || "Feeder LT-1 East (Market Road)",
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
