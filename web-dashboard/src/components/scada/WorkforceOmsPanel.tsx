"use client";

import * as React from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Compass,
  CornerDownRight,
  ExternalLink,
  FileCheck2,
  FileText,
  Flame,
  Info,
  Lock,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  Power,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Unlock,
  UserCheck,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TroubleTicket } from "@/lib/types";
import { NetworkSnapshot, Detection } from "@/lib/network/types";
import { NODE_BY_ID } from "@/lib/network/topology";

interface WorkforceOmsPanelProps {
  tickets: TroubleTicket[];
  onRefresh?: () => void;
  isBreakerTripped?: boolean;
  isFault?: boolean;
  networkSnapshot?: NetworkSnapshot | null;
  selectedPoleId?: string;
  onSelectPole?: (poleId: string) => void;
  linemanPhone?: string;
}

export const FIELD_CREWS = [
  {
    id: "QRU-4",
    name: "Crew Alpha — Designated Field Lineman (Settings)",
    leader: "K. P. Rajesh (Designated Lineman)",
    type: "Primary 11kV Overhead Feeder Patrol",
    phone: "+919037129026",
    vehicle: "KL-41-E-4421 (Utility Bolero)",
    baseStation: "Angamaly 33/11kV Substation",
    status: "PRIMARY_DISPATCH",
  },
  {
    id: "EMERGENCY-102",
    name: "Emergency Line Crew 102",
    leader: "M. S. Anoop (Live-Line Specialist)",
    type: "Hazard & Broken Conductor Response",
    phone: "+919037129026",
    vehicle: "KL-07-CD-8812 (Hydraulic Boom)",
    baseStation: "Kalady Section Office",
    status: "ON_STANDBY",
  },
  {
    id: "QRU-7",
    name: "Lineman Quick-Response Unit #4",
    leader: "V. Babu & Lineman Team",
    type: "Distribution Fuse & LT Restoration",
    phone: "+919037129026",
    vehicle: "KL-41-F-1024 (Response Van)",
    baseStation: "Mattoor Electrical Section",
    status: "ON_STANDBY",
  },
  {
    id: "SUB-MAINT",
    name: "Substation & DTR Maintenance Crew",
    leader: "S. Suresh (Substation In-Charge)",
    type: "Transformer & Switchgear Engineering",
    phone: "+919037129026",
    vehicle: "KL-07-K-7711 (Diagnostic Van)",
    baseStation: "Angamaly Control Center",
    status: "ON_STANDBY",
  },
];

export function getWhatsAppUrl(
  ticket: TroubleTicket,
  phone: string,
  operatorNotes?: string
): string {
  const cleanPhone = phone.replace(/[^\d]/g, "");
  const mapsUrl = `https://maps.google.com/?q=${ticket.gps.lat},${ticket.gps.lng}`;

  const text = `🚨 *KSEB EMERGENCY OUTAGE DISPATCH* 🚨
━━━━━━━━━━━━━━━━━━━━━━
*Ticket ID:* #${ticket.ticketId}
*Feeder:* ${ticket.feederName}
*Fault Type:* ${ticket.faultType}
*Affected Location:* ${ticket.affectedPole}
*GPS Coordinates:* ${ticket.gps.lat.toFixed(6)}, ${ticket.gps.lng.toFixed(6)}
*Google Maps Route:* ${mapsUrl}
*Assigned Crew:* ${ticket.assignedCrew || "Designated Lineman Crew"}
${operatorNotes ? `*Operator Notes:* ${operatorNotes}\n` : ""}━━━━━━━━━━━━━━━━━━━━━━
Safety Protocol: Physical line isolation and digital Permit-To-Work (PTW) must be verified before conductor contact.`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

export function getRemainingSoak(soakExpiresAt?: string): {
  minutes: number;
  seconds: number;
  isExpired: boolean;
  label: string;
  percent: number;
} {
  if (!soakExpiresAt) return { minutes: 0, seconds: 0, isExpired: true, label: "00:00", percent: 100 };
  const target = new Date(soakExpiresAt).getTime();
  const now = Date.now();
  const diffMs = target - now;
  if (diffMs <= 0) return { minutes: 0, seconds: 0, isExpired: true, label: "00:00", percent: 100 };

  const totalSec = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;

  // Approximate soak duration in seconds (default 120s if 2m, or 900s if 15m)
  const percent = Math.max(0, Math.min(100, Math.round(((minutes * 60 + seconds) / (15 * 60)) * 100)));

  return {
    minutes,
    seconds,
    isExpired: false,
    label: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    percent,
  };
}

export function WorkforceOmsPanel({
  tickets,
  onRefresh,
  isBreakerTripped = false,
  isFault = false,
  networkSnapshot,
  selectedPoleId,
  onSelectPole,
  linemanPhone,
}: WorkforceOmsPanelProps) {
  const [activeLinemanPhone, setActiveLinemanPhone] = React.useState<string>(linemanPhone || "+919037129026");
  const [selectedTicketId, setSelectedTicketId] = React.useState<string | null>(null);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = React.useState(false);
  const [selectedCrewId, setSelectedCrewId] = React.useState<string>("QRU-4");
  const [customDispatchNotes, setCustomDispatchNotes] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [historyFilter, setHistoryFilter] = React.useState<"ALL" | "AUTO_CLEARED" | "FIELD_REPAIRED">("ALL");
  const [nowMs, setNowMs] = React.useState(Date.now());

  // Keep phone synced with prop or /api/oms/settings
  React.useEffect(() => {
    if (linemanPhone) {
      setActiveLinemanPhone(linemanPhone);
    }
  }, [linemanPhone]);

  React.useEffect(() => {
    fetch("/api/oms/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data?.settings?.linemanPhone) {
          setActiveLinemanPhone(data.settings.linemanPhone);
        }
      })
      .catch(() => {});
  }, []);

  const crews = React.useMemo(() => {
    return FIELD_CREWS.map((c) => ({
      ...c,
      phone: activeLinemanPhone,
    }));
  }, [activeLinemanPhone]);

  // 1-second interval to keep soak countdown timer live
  React.useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync active detections from Digital Twin
  const activeDetections = React.useMemo(() => {
    return networkSnapshot?.detections || [];
  }, [networkSnapshot]);

  // Primary active ticket in progress
  const activeTicket = React.useMemo(() => {
    if (selectedTicketId) {
      const match = tickets.find((t) => t.ticketId === selectedTicketId);
      if (match) return match;
    }
    // Return first non-closed ticket
    return (
      tickets.find(
        (t) =>
          t.status === "ESCALATED" ||
          t.status === "WATCHING" ||
          t.status === "DISPATCHED" ||
          t.status === "CREW_ON_SITE" ||
          t.status === "PTW_ISSUED"
      ) || null
    );
  }, [tickets, selectedTicketId]);

  // If no open ticket in DB but a detection exists in twin OR telemetry indicates active fault/powercut, synthesize a view ticket
  const effectiveTicket: TroubleTicket | null = React.useMemo(() => {
    if (activeTicket) return activeTicket;
    if (activeDetections.length > 0) {
      const topDet = activeDetections.find((d) => d.severity === "CRITICAL" || d.severity === "HIGH") || activeDetections[0];
      const targetPole = topDet.nodeId || "P2";
      const topo = NODE_BY_ID[targetPole];
      const isConductorBreak = topDet.ansi === "ANSI 46BC" || topDet.type.includes("BROKEN");

      return {
        ticketId: "LIVE-SOAK-EVENT",
        createdAt: new Date().toISOString(),
        feederId: topDet.feederId || "F4",
        feederName: "Feeder 04 (Angamaly North 11kV)",
        affectedPole: targetPole,
        gps: topo ? { lat: topo.lat, lng: topo.lng } : { lat: 10.232109, lng: 76.406110 },
        faultType: `${topDet.ansi} - ${topDet.type.replace(/_/g, " ")}`,
        severity: isConductorBreak ? "CRITICAL" : "HIGH",
        status: isConductorBreak ? "ESCALATED" : "WATCHING",
        assignedCrew: "",
        assignedPhone: "+919447012345",
        estimatedCustomers: 85,
        ptw: null,
        soakDurationMinutes: 15,
        soakExpiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
        safetyBypassTriggered: isConductorBreak,
        workLog: [
          `FDIR Supervisory Alert: ${topDet.message}`,
          `GPS Coordinate Waypoint: ${topo ? `${topo.lat.toFixed(6)}°N, ${topo.lng.toFixed(6)}°E` : "10.232109°N, 76.406110°E"}`,
        ],
      };
    }
    if (isFault || isBreakerTripped) {
      return {
        ticketId: "LIVE-SUPERVISORY-EVENT",
        createdAt: new Date().toISOString(),
        feederId: "FEEDER_04_SECTOR4",
        feederName: "Feeder 04 (Angamaly 11kV / DTR-01)",
        affectedPole: selectedPoleId || "Feeder LT-1: Span F1-P01 ↔ F1-P02",
        gps: { lat: 10.2325, lng: 76.4095 },
        faultType: isBreakerTripped ? "ANSI 87L - FEEDER BREAKER TRIP" : "ANSI 27 - FEEDER DE-ENERGIZED (0V SUPPLY)",
        severity: isBreakerTripped ? "CRITICAL" : "HIGH",
        status: isBreakerTripped ? "ESCALATED" : "WATCHING",
        assignedCrew: "",
        assignedPhone: "+919447012345",
        estimatedCustomers: 45,
        ptw: null,
        soakDurationMinutes: 15,
        soakExpiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
        safetyBypassTriggered: isBreakerTripped,
        workLog: [
          `SCADA Supervisory Incident Flagged.`,
          isBreakerTripped ? "Feeder differential protection tripped breaker." : "Zero-voltage power cut / de-energization in progress.",
        ],
      };
    }
    return null;
  }, [activeTicket, activeDetections, isFault, isBreakerTripped, selectedPoleId]);

  // Calculations for summary metrics
  const watchingTickets = tickets.filter((t) => t.status === "WATCHING");
  const escalatedTickets = tickets.filter((t) => t.status === "ESCALATED");
  const dispatchedTickets = tickets.filter(
    (t) => t.status === "DISPATCHED" || t.status === "CREW_ON_SITE" || t.status === "PTW_ISSUED"
  );
  const closedTickets = tickets.filter((t) => t.status === "CLOSED" || t.status === "MAINTENANCE_SUPPRESSED");
  const activePtwTicket = tickets.find((t) => t.ptw?.reclosingInterlockActive === true);

  const isSoakActive = effectiveTicket?.status === "WATCHING";
  const isEscalated = effectiveTicket?.status === "ESCALATED";
  const isDispatched = effectiveTicket?.status === "DISPATCHED" || effectiveTicket?.status === "CREW_ON_SITE";
  const isPtwActive = Boolean(effectiveTicket?.ptw?.reclosingInterlockActive || activePtwTicket);

  const soakRemaining = getRemainingSoak(effectiveTicket?.soakExpiresAt);

  // Manual Dispatch Handler
  const handleConfirmManualDispatch = async () => {
    if (!effectiveTicket) return;
    setIsSubmitting(true);
    const chosenCrew = crews.find((c) => c.id === selectedCrewId) || crews[0];

    try {
      await fetch("/api/oms/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual_dispatch",
          ticketId: effectiveTicket.ticketId,
          crewName: chosenCrew.name,
          crewPhone: chosenCrew.phone,
          crewType: chosenCrew.type,
          operatorNotes: customDispatchNotes,
        }),
      });
      setIsDispatchModalOpen(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Manual dispatch error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Launch WhatsApp Chat directly
  const handleLaunchWhatsApp = (phone?: string) => {
    if (!effectiveTicket) return;
    const targetPhone = phone || activeLinemanPhone;
    const url = getWhatsAppUrl(effectiveTicket, targetPhone, customDispatchNotes);
    window.open(url, "_blank");
  };

  // Early Escalation (Bypass Soak)
  const handleEscalateEarly = async () => {
    if (!effectiveTicket) return;
    setIsSubmitting(true);
    try {
      await fetch("/api/oms/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "escalate_early",
          ticketId: effectiveTicket.ticketId,
        }),
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Escalate early error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Flag as Scheduled Maintenance
  const handleFlagMaintenance = async () => {
    if (!effectiveTicket) return;
    setIsSubmitting(true);
    try {
      await fetch("/api/oms/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "flag_maintenance",
          ticketId: effectiveTicket.ticketId,
          reason: "Scheduled Local Line & Vegetation Maintenance (Operator Suppressed)",
        }),
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Flag maintenance error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Close Ticket & Release Interlock
  const handleCloseTicket = async () => {
    if (!effectiveTicket) return;
    setIsSubmitting(true);
    try {
      await fetch("/api/oms/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clear_ptw",
          ticketId: effectiveTicket.ticketId,
          notes: "Repairs verified safe by operator. Feeder re-energized.",
        }),
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Close ticket error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered closed tickets history
  const filteredClosedTickets = React.useMemo(() => {
    if (historyFilter === "AUTO_CLEARED") {
      return closedTickets.filter(
        (t) =>
          !t.assignedCrew ||
          t.assignedCrew.toLowerCase().startsWith("unassigned") ||
          t.workLog.some((l) => l.toLowerCase().includes("transient") || l.toLowerCase().includes("auto-cleared"))
      );
    }
    if (historyFilter === "FIELD_REPAIRED") {
      return closedTickets.filter(
        (t) => Boolean(t.assignedCrew && !t.assignedCrew.toLowerCase().startsWith("unassigned"))
      );
    }
    return closedTickets;
  }, [closedTickets, historyFilter]);

  return (
    <div className="flex flex-col h-full overflow-hidden text-xs font-mono bg-slate-100 dark:bg-[#090a0d] text-slate-900 dark:text-zinc-100 p-2 sm:p-3 gap-3">
      {/* ============================================================== */}
      {/* 1. TOP OPERATIONAL KPI STATUS RIBBON                           */}
      {/* ============================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 shrink-0">
        {/* Metric 1: Grid Status */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1115] p-2.5 rounded-sm flex items-center justify-between shadow-xs">
          <div>
            <div className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider font-semibold">
              Grid Feeder Integrity
            </div>
            <div className="text-sm font-bold flex items-center gap-1.5 mt-0.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  effectiveTicket || isFault || isBreakerTripped ? "bg-rose-500 animate-ping" : "bg-emerald-500"
                }`}
              />
              <span className={effectiveTicket || isFault || isBreakerTripped ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>
                {effectiveTicket || isFault || isBreakerTripped ? "OUTAGE DETECTED" : "100% HEALTHY"}
              </span>
            </div>
          </div>
          <Activity className="h-4 w-4 text-slate-400 dark:text-zinc-500" />
        </div>

        {/* Metric 2: Soak Observation Watchlist */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1115] p-2.5 rounded-sm flex items-center justify-between shadow-xs">
          <div>
            <div className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider font-semibold">
              Soak Watchlist
            </div>
            <div className="text-sm font-bold flex items-center gap-1.5 mt-0.5">
              <Clock className={`h-3.5 w-3.5 ${isSoakActive ? "text-amber-500 animate-spin" : "text-slate-400 dark:text-zinc-500"}`} />
              <span className={isSoakActive ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-zinc-300"}>
                {watchingTickets.length > 0 || isSoakActive ? `${Math.max(1, watchingTickets.length)} In Observation` : "0 Monitoring"}
              </span>
            </div>
          </div>
          <Badge variant={isSoakActive ? "warning" : "outline"} className="text-[9px] tabular-nums">
            {isSoakActive ? soakRemaining.label : "IDLE"}
          </Badge>
        </div>

        {/* Metric 3: Sustained Outages / Escalated */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1115] p-2.5 rounded-sm flex items-center justify-between shadow-xs">
          <div>
            <div className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider font-semibold">
              Action Required
            </div>
            <div className="text-sm font-bold flex items-center gap-1.5 mt-0.5">
              <AlertTriangle className={`h-3.5 w-3.5 ${isEscalated ? "text-rose-500 animate-bounce" : "text-slate-400 dark:text-zinc-500"}`} />
              <span className={isEscalated ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-zinc-300"}>
                {escalatedTickets.length > 0 || isEscalated ? `${Math.max(1, escalatedTickets.length)} Escalated` : "0 Pending"}
              </span>
            </div>
          </div>
          <Badge variant={isEscalated ? "destructive" : "outline"} className="text-[9px]">
            {isEscalated ? "DISPATCH REQ" : "CLEAR"}
          </Badge>
        </div>

        {/* Metric 4: Field Crews Dispatched */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1115] p-2.5 rounded-sm flex items-center justify-between shadow-xs">
          <div>
            <div className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider font-semibold">
              Field Deployments
            </div>
            <div className="text-sm font-bold flex items-center gap-1.5 mt-0.5">
              <Users className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
              <span className={dispatchedTickets.length > 0 ? "text-cyan-600 dark:text-cyan-400" : "text-slate-700 dark:text-zinc-300"}>
                {dispatchedTickets.length} Unit{dispatchedTickets.length === 1 ? "" : "s"} Active
              </span>
            </div>
          </div>
          <Badge variant="outline" className="text-[9px]">
            4 STANDBY
          </Badge>
        </div>

        {/* Metric 5: SCADA Safety Interlocks */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1115] p-2.5 rounded-sm flex items-center justify-between shadow-xs col-span-2 sm:col-span-1">
          <div>
            <div className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider font-semibold">
              SCADA Safety Interlock
            </div>
            <div className="text-sm font-bold flex items-center gap-1.5 mt-0.5">
              {isPtwActive ? (
                <>
                  <Lock className="h-3.5 w-3.5 text-rose-500" />
                  <span className="text-rose-600 dark:text-rose-400">LOTO LOCKED</span>
                </>
              ) : (
                <>
                  <Unlock className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">RECLOSE READY</span>
                </>
              )}
            </div>
          </div>
          <Badge variant={isPtwActive ? "destructive" : "healthy"} className="text-[9px]">
            {isPtwActive ? "CEA SEC 44" : "SAFE"}
          </Badge>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. PRIMARY OPERATIONS DESK (TWO-PANEL WORKBENCH)               */}
      {/* ============================================================== */}
      <div className="grid grid-cols-12 gap-3 flex-1 min-h-0">
        {/* ------------------------------------------------------------ */}
        {/* LEFT PANEL: OUTAGE SUPERVISION & LIVE SOAK WATCHLIST        */}
        {/* ------------------------------------------------------------ */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-3 min-h-0 overflow-y-auto">
          {/* Active Outage Banner or Healthy System Screen */}
          {effectiveTicket ? (
            <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1115] rounded-sm p-3.5 shadow-sm space-y-3">
              {/* Event Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-zinc-800/80 pb-2.5">
                <div className="flex items-center gap-2">
                  {effectiveTicket.safetyBypassTriggered ? (
                    <div className="p-1.5 rounded-xs bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                      <AlertOctagon className="h-4 w-4" />
                    </div>
                  ) : isSoakActive ? (
                    <div className="p-1.5 rounded-xs bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      <Clock className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    <div className="p-1.5 rounded-xs bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                  )}
                  <div>
                    <div className="font-bold text-sm text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                      <span>{effectiveTicket.faultType}</span>
                      <span className="text-xs font-normal text-slate-400">({effectiveTicket.ticketId})</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Target Pole: <span className="text-slate-900 dark:text-zinc-200 font-bold">{effectiveTicket.affectedPole}</span> • Feeder: {effectiveTicket.feederName}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {effectiveTicket.safetyBypassTriggered ? (
                    <Badge variant="destructive" className="animate-pulse">
                      SAFETY CRITICAL OVERRIDE
                    </Badge>
                  ) : isSoakActive ? (
                    <Badge variant="warning" className="flex items-center gap-1">
                      <Clock className="h-3 w-3 animate-spin" />
                      SOAK OBSERVATION ({soakRemaining.label})
                    </Badge>
                  ) : isEscalated ? (
                    <Badge variant="destructive" className="animate-pulse">
                      SUSTAINED OUTAGE (DISPATCH REQ)
                    </Badge>
                  ) : (
                    <Badge variant="default">{effectiveTicket.status}</Badge>
                  )}
                </div>
              </div>

              {/* Dynamic Status Display Box */}
              {isSoakActive ? (
                /* SOAK OBSERVATION CARD */
                <div className="border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-3 rounded-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 animate-spin" />
                        <span>OUTAGE IN SOAK OBSERVATION WINDOW ({soakRemaining.label} REMAINING)</span>
                      </div>
                      <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                        Watching event to suppress unnecessary lineman dispatch if power restores naturally. If outage persists past window, it will automatically escalate.
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-bold font-mono text-amber-700 dark:text-amber-300">
                        {soakRemaining.label}
                      </span>
                    </div>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="w-full bg-amber-200 dark:bg-amber-950 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-amber-500 h-1.5 transition-all duration-1000 ease-linear rounded-full"
                      style={{ width: `${soakRemaining.percent}%` }}
                    />
                  </div>

                  {/* Operator Fast-Track Actions */}
                  <div className="flex flex-wrap items-center justify-between pt-1 gap-2 border-t border-amber-500/20">
                    <div className="text-[10px] text-amber-700 dark:text-amber-400">
                      Policy: {effectiveTicket.soakDurationMinutes || 15}m Soak Window • Zero Crews Dispatched
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleFlagMaintenance}
                        disabled={isSubmitting}
                        className="h-7 text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                      >
                        Flag Planned Maintenance
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleEscalateEarly}
                        disabled={isSubmitting}
                        className="h-7 text-[10px] font-bold"
                      >
                        Escalate Early ➔
                      </Button>
                    </div>
                  </div>
                </div>
              ) : isEscalated ? (
                /* ESCALATED SUSTAINED OUTAGE CARD */
                <div className="border border-rose-500/40 bg-rose-50/60 dark:bg-rose-950/30 p-3 rounded-sm space-y-2.5 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                        <span>SUSTAINED DISTRIBUTION OUTAGE — OPERATOR DISPATCH MANDATORY</span>
                      </div>
                      <p className="text-[11px] text-rose-600/90 dark:text-zinc-300 mt-0.5">
                        {effectiveTicket.safetyBypassTriggered
                          ? "SAFETY OVERRIDE: Physical conductor hazard detected. Public safety lockout requires immediate on-site crew presence."
                          : "Outage persisted beyond soak observation. Operator must designate and dispatch a field crew."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-rose-500/20">
                    <span className="text-[10px] text-rose-600 dark:text-rose-400">
                      Est. Affected Customers: <strong>{effectiveTicket.estimatedCustomers || 85} LT Consumers</strong>
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setIsDispatchModalOpen(true)}
                      className="h-7 px-3 text-[11px] font-bold shadow-sm"
                    >
                      <UserCheck className="h-3.5 w-3.5 mr-1" />
                      Dispatch Field Crew (WhatsApp) ➔
                    </Button>
                  </div>
                </div>
              ) : isDispatched ? (
                /* DISPATCHED CREW TRACKING CARD */
                <div className="border border-cyan-500/40 bg-cyan-50/60 dark:bg-cyan-950/20 p-3 rounded-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-cyan-800 dark:text-cyan-300 flex items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                        <span>FIELD UNIT ASSIGNED: {effectiveTicket.assignedCrew}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-zinc-400 mt-0.5">
                        Lineman Contact: <strong>{effectiveTicket.assignedPhone}</strong> • Status: <strong>{effectiveTicket.status.replace(/_/g, " ")}</strong>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLaunchWhatsApp(effectiveTicket.assignedPhone)}
                      className="h-7 text-[10px] border-emerald-500 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                    >
                      <MessageSquare className="h-3 w-3 mr-1 text-emerald-500" />
                      Message on WhatsApp
                    </Button>
                  </div>

                  {/* PTW Status inside Dispatched Card */}
                  <div className="bg-white/80 dark:bg-zinc-900/80 p-2 rounded-xs border border-cyan-500/20 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <Shield className={`h-4 w-4 ${isPtwActive ? "text-rose-500" : "text-slate-400"}`} />
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-zinc-200">
                          {isPtwActive ? "Permit-To-Work (PTW) Active" : "Permit-To-Work (PTW) Pending Site Arrival"}
                        </span>
                        <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                          {isPtwActive
                            ? `PTW #${effectiveTicket.ptw?.ptwNumber || "PTW-2026-904"} Issued to ${effectiveTicket.ptw?.issuedTo || "Lineman"}`
                            : "Lineman must verify isolation at pole before touching conductors"}
                        </div>
                      </div>
                    </div>

                    {isPtwActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCloseTicket}
                        disabled={isSubmitting}
                        className="h-6 text-[10px] border-emerald-500 text-emerald-600 hover:bg-emerald-50 font-bold"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Clear PTW &amp; Close Ticket
                      </Button>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Waypoint Coordinates & Diagnostics Table */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="border border-slate-200 dark:border-zinc-800 p-2 rounded-xs bg-slate-50 dark:bg-zinc-900/40">
                  <span className="text-slate-500 dark:text-zinc-400 block text-[10px]">TARGET POLE</span>
                  <span className="font-bold text-slate-900 dark:text-zinc-100">{effectiveTicket.affectedPole}</span>
                </div>
                <div className="border border-slate-200 dark:border-zinc-800 p-2 rounded-xs bg-slate-50 dark:bg-zinc-900/40">
                  <span className="text-slate-500 dark:text-zinc-400 block text-[10px]">GPS WAYPOINT</span>
                  <a
                    href={`https://maps.google.com/?q=${effectiveTicket.gps.lat},${effectiveTicket.gps.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    <span>{effectiveTicket.gps.lat.toFixed(4)}, {effectiveTicket.gps.lng.toFixed(4)}</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
                <div className="border border-slate-200 dark:border-zinc-800 p-2 rounded-xs bg-slate-50 dark:bg-zinc-900/40">
                  <span className="text-slate-500 dark:text-zinc-400 block text-[10px]">SAFETY OVERRIDE</span>
                  <span className={`font-bold ${effectiveTicket.safetyBypassTriggered ? "text-rose-500" : "text-slate-700 dark:text-zinc-300"}`}>
                    {effectiveTicket.safetyBypassTriggered ? "BYPASSED (HAZARD)" : "STANDARD SOAK"}
                  </span>
                </div>
                <div className="border border-slate-200 dark:border-zinc-800 p-2 rounded-xs bg-slate-50 dark:bg-zinc-900/40">
                  <span className="text-slate-500 dark:text-zinc-400 block text-[10px]">ACTION</span>
                  {effectiveTicket.status === "ESCALATED" ? (
                    <button
                      onClick={() => setIsDispatchModalOpen(true)}
                      className="font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span>Dispatch Now</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  ) : (
                    <span className="font-bold text-slate-500">{effectiveTicket.status}</span>
                  )}
                </div>
              </div>

              {/* Work Log Audit Trail */}
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Incident Chronology &amp; SCADA Directive Log
                </div>
                <div className="bg-slate-50 dark:bg-zinc-950 p-2 rounded-xs border border-slate-200 dark:border-zinc-800 max-h-24 overflow-y-auto space-y-1 text-[10px] font-mono">
                  {effectiveTicket.workLog.map((log, idx) => (
                    <div key={idx} className="text-slate-700 dark:text-zinc-300 flex items-start gap-1.5">
                      <span className="text-emerald-500 shrink-0">›</span>
                      <span>{log}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* ZERO OUTAGES: HEALTHY SCADA GRID SUPERVISION CENTER */
            <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1115] rounded-sm p-6 shadow-sm flex flex-col items-center justify-center text-center space-y-3">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 rounded-full text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100">
                  FEEDER TOPOLOGY NORMAL • ZERO ACTIVE OUTAGES
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md mt-1">
                  Distribution Substation Angamaly 33/11kV DTR-01 is operating within normal statutory voltage and current limits. LoRa Last-Gasp beacon listener is active.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 w-full max-w-lg pt-2 text-left">
                <div className="p-2 border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50 rounded-xs">
                  <span className="text-[10px] text-slate-500 block">ANSI 87L DIFFERENTIAL</span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">HEALTHY / ARMED</span>
                </div>
                <div className="p-2 border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50 rounded-xs">
                  <span className="text-[10px] text-slate-500 block">ANSI 46BC CONDUCTOR</span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">INTACT / SUPERVISED</span>
                </div>
                <div className="p-2 border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50 rounded-xs">
                  <span className="text-[10px] text-slate-500 block">SOAK POLICY</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">15m ESCALATION</span>
                </div>
              </div>
            </div>
          )}

          {/* Real Outage History & Resolved Incidents Ledger */}
          <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1115] rounded-sm p-3 shadow-sm space-y-2 flex-1 min-h-[220px] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                <span className="font-bold uppercase tracking-wider text-[11px] text-slate-800 dark:text-zinc-200">
                  Resolved Outages &amp; Auto-Cleared Incidents Ledger
                </span>
                <Badge variant="outline" className="text-[9px]">
                  {filteredClosedTickets.length} RECORDS
                </Badge>
              </div>

              {/* History Filter Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-900 p-0.5 rounded-xs border border-slate-200 dark:border-zinc-800 text-[10px]">
                <button
                  onClick={() => setHistoryFilter("ALL")}
                  className={`px-2 py-0.5 rounded-xs cursor-pointer ${
                    historyFilter === "ALL"
                      ? "bg-white dark:bg-zinc-800 font-bold text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setHistoryFilter("AUTO_CLEARED")}
                  className={`px-2 py-0.5 rounded-xs cursor-pointer ${
                    historyFilter === "AUTO_CLEARED"
                      ? "bg-white dark:bg-zinc-800 font-bold text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  Auto-Cleared (Soak)
                </button>
                <button
                  onClick={() => setHistoryFilter("FIELD_REPAIRED")}
                  className={`px-2 py-0.5 rounded-xs cursor-pointer ${
                    historyFilter === "FIELD_REPAIRED"
                      ? "bg-white dark:bg-zinc-800 font-bold text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  Field Repaired
                </button>
              </div>
            </div>

            <div className="space-y-1.5 overflow-y-auto flex-1 max-h-56 pr-1">
              {filteredClosedTickets.length === 0 ? (
                <div className="text-center py-8 text-slate-400 dark:text-zinc-500 text-xs">
                  No resolved records found in this category.
                </div>
              ) : (
                filteredClosedTickets.map((t) => (
                  <div
                    key={t.ticketId}
                    className="p-2 border border-slate-200 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-950/40 rounded-xs flex items-center justify-between text-[11px]"
                  >
                    <div>
                      <div className="font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-2">
                        <span>{t.ticketId}</span>
                        <span className="text-[10px] font-normal text-slate-500 dark:text-zinc-400">
                          {t.feederName} • {t.affectedPole}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                        {t.faultType} • {t.workLog[t.workLog.length - 1] || "Incident archived"}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {(() => {
                        const hasCrew = Boolean(t.assignedCrew && !t.assignedCrew.toLowerCase().startsWith("unassigned"));
                        return (
                          <Badge
                            variant={hasCrew ? "healthy" : "secondary"}
                            className="text-[9px]"
                          >
                            {hasCrew ? `REPAIRED (${t.assignedCrew.split(" ")[0].toUpperCase()})` : "AUTO-CLEARED (SOAK)"}
                          </Badge>
                        );
                      })()}
                      <span className="text-[9px] text-slate-400 block mt-0.5">
                        {new Date(t.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* RIGHT PANEL: KSEB FIELD WORKFORCE & WHATSAPP DISPATCH HUB   */}
        {/* ------------------------------------------------------------ */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-3 min-h-0 overflow-y-auto">
          {/* Header Card */}
          <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1115] rounded-sm p-3.5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-bold uppercase tracking-wider text-sm text-slate-900 dark:text-zinc-100">
                  KSEB Field Workforce Roster
                </span>
              </div>
              <Badge variant="outline" className="text-[9px]">
                4 REGISTERED CREWS
              </Badge>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Select any designated line crew to initiate a one-click WhatsApp dispatch order with GPS waypoint coordinates and safety instructions.
            </p>

            {/* Crew Cards */}
            <div className="space-y-2">
              {crews.map((crew) => {
                const isAssigned = effectiveTicket?.assignedPhone === crew.phone;
                return (
                  <div
                    key={crew.id}
                    className={`border p-2.5 rounded-sm transition-all ${
                      isAssigned
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-xs"
                        : "border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-950/60 hover:border-slate-300 dark:hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-zinc-100 text-xs flex items-center gap-1.5">
                          <span>{crew.name}</span>
                          {isAssigned && (
                            <Badge variant="healthy" className="text-[8px] py-0 px-1">
                              ACTIVE DISPATCH
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                          Leader: <strong>{crew.leader}</strong> • {crew.type}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                          Base: {crew.baseStation} • Vehicle: {crew.vehicle}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (effectiveTicket) {
                              const url = getWhatsAppUrl(effectiveTicket, crew.phone);
                              window.open(url, "_blank");
                            } else {
                              const url = `https://wa.me/${crew.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent("GridSense SCADA Notice: Feeder 04 is currently healthy. Standing by.")}`;
                              window.open(url, "_blank");
                            }
                          }}
                          className="h-6 px-2 text-[10px] border-emerald-500/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        >
                          <MessageSquare className="h-3 w-3 mr-1 text-emerald-500" />
                          WhatsApp
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Safety & Permit-To-Work (PTW) Regulatory Center */}
          <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1115] rounded-sm p-3.5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-500" />
                <span className="font-bold uppercase tracking-wider text-xs text-slate-900 dark:text-zinc-100">
                  SCADA Reclosing Lockout &amp; PTW Protocol
                </span>
              </div>
              <Badge variant="outline" className="text-[9px]">
                CEA SEC 44 / IEEE 1686
              </Badge>
            </div>

            <div className="bg-slate-50 dark:bg-zinc-950 p-2.5 rounded-xs border border-slate-200 dark:border-zinc-800 text-[11px] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-zinc-400">Breaker Remote Reclose:</span>
                <span className={`font-bold ${isPtwActive ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {isPtwActive ? "INHIBITED (LOTO INTERLOCK ENGAGED)" : "PERMITTED (NORMAL SUPERVISION)"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-zinc-400">Earthing &amp; Line Discharge:</span>
                <span className="font-bold text-slate-800 dark:text-zinc-200">
                  {isPtwActive ? "Portable Grounding Sets Applied" : "Normal Energization"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-zinc-400">Digital Safety Token:</span>
                <span className="font-mono text-cyan-600 dark:text-cyan-400">
                  {effectiveTicket?.ptw?.ptwNumber || "NONE-STANDBY"}
                </span>
              </div>
            </div>

            {effectiveTicket && effectiveTicket.status !== "WATCHING" && (
              <div className="pt-1 flex gap-2">
                {!isPtwActive ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      if (!effectiveTicket) return;
                      await fetch("/api/oms/tickets", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "issue_ptw",
                          ticketId: effectiveTicket.ticketId,
                          linemanName: "K. P. Rajesh",
                        }),
                      });
                      if (onRefresh) onRefresh();
                    }}
                    className="w-full h-7 text-[10px] font-bold"
                  >
                    <Lock className="h-3 w-3 mr-1" />
                    Engage SCADA Reclose Lockout (Issue PTW)
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCloseTicket}
                    className="w-full h-7 text-[10px] font-bold border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                  >
                    <Unlock className="h-3 w-3 mr-1" />
                    Surrender PTW &amp; Authorize Reclose
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. MANUAL FIELD CREW DISPATCH MODAL                            */}
      {/* ============================================================== */}
      {isDispatchModalOpen && effectiveTicket && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f1115] border border-slate-300 dark:border-zinc-700 rounded-sm w-full max-w-lg p-5 font-mono shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 uppercase">
                    AUTHORIZE FIELD CREW DISPATCH (KSEB OMS)
                  </h3>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                    Ticket: {effectiveTicket.ticketId} • Feeder: {effectiveTicket.feederName}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsDispatchModalOpen(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs px-2 py-0.5 border border-slate-300 dark:border-zinc-700 rounded-xs"
              >
                ✕
              </button>
            </div>

            {/* Waypoint Summary Box */}
            <div className="bg-slate-50 dark:bg-zinc-950 p-3 rounded-xs border border-slate-200 dark:border-zinc-800 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Target Distribution Pole:</span>
                <span className="font-bold text-slate-900 dark:text-zinc-100">{effectiveTicket.affectedPole}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">GPS Navigation Waypoint:</span>
                <span className="text-cyan-600 dark:text-cyan-400 font-bold tabular-nums">
                  {effectiveTicket.gps.lat.toFixed(6)}°N, {effectiveTicket.gps.lng.toFixed(6)}°E
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fault Classification:</span>
                <span className="text-rose-600 dark:text-rose-400 font-bold">{effectiveTicket.faultType}</span>
              </div>
            </div>

            {/* Crew Selection */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                Select Designated KSEB Field Unit
              </label>
              <div className="space-y-1.5">
                {crews.map((crew) => (
                  <div
                    key={crew.id}
                    onClick={() => setSelectedCrewId(crew.id)}
                    className={`p-2.5 rounded-xs border cursor-pointer flex items-center justify-between text-xs transition-all ${
                      selectedCrewId === crew.id
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 ring-1 ring-emerald-500"
                        : "border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 hover:border-slate-400"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-zinc-100">{crew.name}</div>
                      <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                        Leader: {crew.leader} • Phone: {crew.phone}
                      </div>
                    </div>
                    <Badge variant={selectedCrewId === crew.id ? "healthy" : "outline"} className="text-[9px]">
                      {selectedCrewId === crew.id ? "SELECTED" : "AVAILABLE"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Notes */}
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                Operator Instructions to Field Crew (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Inspect jumper insulation at Pole P2 crossarm before applying earthing"
                value={customDispatchNotes}
                onChange={(e) => setCustomDispatchNotes(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 px-2.5 py-1.5 text-xs font-mono rounded-xs text-slate-900 dark:text-zinc-100 outline-none focus:border-emerald-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-zinc-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const chosen = crews.find((c) => c.id === selectedCrewId) || crews[0];
                  handleLaunchWhatsApp(chosen.phone);
                }}
                className="text-xs h-8 border-emerald-500/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                Open WhatsApp Message ➔
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsDispatchModalOpen(false)}
                  className="text-xs h-8"
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  disabled={isSubmitting}
                  onClick={handleConfirmManualDispatch}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 px-4"
                >
                  Confirm Crew Dispatched
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
