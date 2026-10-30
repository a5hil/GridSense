"use client";

import React from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Crosshair,
  ExternalLink,
  Eye,
  FileText,
  Flame,
  Info,
  Lock,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  Power,
  Radio,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Unlock,
  User,
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

export interface DutyLineman {
  id: string;
  name: string;
  role: string;
  section: string;
  phone: string;
  status: "ON_DUTY" | "STANDBY" | "DISPATCHED";
}

export const DUTY_LINEMEN: DutyLineman[] = [
  {
    id: "LM-RAJESH",
    name: "K. P. Rajesh",
    role: "Senior Line Patrol",
    section: "Angamaly 33/11kV",
    phone: "+919037129026",
    status: "ON_DUTY",
  },
  {
    id: "LM-ANOOP",
    name: "M. S. Anoop",
    role: "Emergency Breakdown",
    section: "Kalady Section",
    phone: "+919037129026",
    status: "STANDBY",
  },
  {
    id: "LM-BABU",
    name: "V. Babu",
    role: "Feeder 04 Area Lineman",
    section: "Mattoor Section",
    phone: "+919037129026",
    status: "STANDBY",
  },
  {
    id: "LM-SURESH",
    name: "S. Suresh",
    role: "Substation & DTR Operator",
    section: "Control Center",
    phone: "+919037129026",
    status: "STANDBY",
  },
];

// Backwards-compatibility alias
export const FIELD_CREWS = DUTY_LINEMEN;

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
  const [isDispatchModalOpen, setIsDispatchModalOpen] = React.useState(false);
  const [selectedLinemanId, setSelectedLinemanId] = React.useState<string>("LM-RAJESH");
  const [customDispatchNotes, setCustomDispatchNotes] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [historyFilter, setHistoryFilter] = React.useState<"ALL" | "AUTO_CLEARED" | "FIELD_REPAIRED" | "MAINTENANCE">("ALL");
  const [auditModalTicket, setAuditModalTicket] = React.useState<TroubleTicket | null>(null);
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

  const linemen = React.useMemo(() => {
    return DUTY_LINEMEN.map((l) => ({
      ...l,
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

  // Determine currently active open ticket from state
  const activeTicket: TroubleTicket | null = React.useMemo(() => {
    return (
      tickets.find(
        (t) =>
          t.status === "WATCHING" ||
          t.status === "ESCALATED" ||
          t.status === "DISPATCHED" ||
          t.status === "CREW_ON_SITE" ||
          t.status === "PTW_ISSUED"
      ) || null
    );
  }, [tickets]);

  // If no open ticket in DB but a detection exists in twin OR telemetry indicates active fault/powercut, synthesize a view ticket
  const effectiveTicket: TroubleTicket | null = React.useMemo(() => {
    if (activeTicket) return activeTicket;
    if (activeDetections.length > 0) {
      const topDet = activeDetections.find((d) => d.severity === "CRITICAL" || d.severity === "HIGH") || activeDetections[0];
      const targetPole = topDet.nodeId || "F1-P02";
      const topo = NODE_BY_ID[targetPole] || NODE_BY_ID["F1-P02"];
      const isConductorBreak = topDet.ansi === "ANSI 46BC" || topDet.type.includes("BROKEN");

      return {
        ticketId: "LIVE-SOAK-EVENT",
        createdAt: new Date().toISOString(),
        feederId: topDet.feederId || topo?.feederId || "LT-1",
        feederName: "Feeder LT-1 East (Market Road)",
        affectedPole: topo?.id || targetPole,
        gps: topo ? { lat: topo.lat, lng: topo.lng } : { lat: 10.232172, lng: 76.408750 },
        faultType: `${topDet.ansi} - ${topDet.type.replace(/_/g, " ")}`,
        severity: isConductorBreak ? "CRITICAL" : "HIGH",
        status: isConductorBreak ? "ESCALATED" : "WATCHING",
        assignedCrew: "",
        assignedPhone: activeLinemanPhone,
        estimatedCustomers: 85,
        ptw: null,
        soakDurationMinutes: 15,
        soakExpiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
        safetyBypassTriggered: isConductorBreak,
        workLog: [
          `FDIR Supervisory Alert: ${topDet.message}`,
          `GPS Coordinate Waypoint: ${topo ? `${topo.lat.toFixed(6)}°N, ${topo.lng.toFixed(6)}°E` : "10.232172°N, 76.408750°E"}`,
        ],
      };
    }
    if (isFault || isBreakerTripped) {
      const targetPoleId = selectedPoleId && NODE_BY_ID[selectedPoleId] ? selectedPoleId : "F1-P02";
      const topo = NODE_BY_ID[targetPoleId] || NODE_BY_ID["F1-P02"];
      return {
        ticketId: "LIVE-SUPERVISORY-EVENT",
        createdAt: new Date().toISOString(),
        feederId: topo?.feederId || "LT-1",
        feederName: "Feeder LT-1 East (Market Road)",
        affectedPole: targetPoleId,
        gps: topo ? { lat: topo.lat, lng: topo.lng } : { lat: 10.232172, lng: 76.408750 },
        faultType: isBreakerTripped ? "ANSI 87L - FEEDER BREAKER TRIP" : "ANSI 27 - FEEDER DE-ENERGIZED (0V SUPPLY)",
        severity: isBreakerTripped ? "CRITICAL" : "HIGH",
        status: isBreakerTripped ? "ESCALATED" : "WATCHING",
        assignedCrew: "",
        assignedPhone: activeLinemanPhone,
        estimatedCustomers: 45,
        ptw: null,
        soakDurationMinutes: 15,
        soakExpiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
        safetyBypassTriggered: isBreakerTripped,
        workLog: [
          `SCADA Supervisory Incident Flagged.`,
          isBreakerTripped ? "Feeder differential protection tripped breaker." : "Zero-voltage power cut / de-energization in progress.",
          `GPS Coordinate Waypoint: ${topo ? `${topo.lat.toFixed(6)}°N, ${topo.lng.toFixed(6)}°E` : "10.232172°N, 76.408750°E"}`,
        ],
      };
    }
    return null;
  }, [activeTicket, activeDetections, isFault, isBreakerTripped, selectedPoleId, activeLinemanPhone]);

  // Combined Active Tickets List
  const activeTicketsList: TroubleTicket[] = React.useMemo(() => {
    const map = new Map<string, TroubleTicket>();
    if (effectiveTicket) {
      map.set(effectiveTicket.ticketId, effectiveTicket);
    }
    for (const t of tickets) {
      if (
        t.status === "WATCHING" ||
        t.status === "ESCALATED" ||
        t.status === "DISPATCHED" ||
        t.status === "CREW_ON_SITE" ||
        t.status === "PTW_ISSUED"
      ) {
        if (!map.has(t.ticketId)) {
          map.set(t.ticketId, t);
        }
      }
    }
    return Array.from(map.values());
  }, [effectiveTicket, tickets]);

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
    const chosen = linemen.find((l) => l.id === selectedLinemanId) || linemen[0];

    try {
      await fetch("/api/oms/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual_dispatch",
          ticketId: effectiveTicket.ticketId,
          crewName: chosen.name,
          crewPhone: chosen.phone,
          crewType: chosen.role,
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

  // Early Escalation (Bypass Soak)
  const handleEscalateEarly = async (ticketId?: string) => {
    const targetId = typeof ticketId === "string" ? ticketId : effectiveTicket?.ticketId;
    if (!targetId) return;
    setIsSubmitting(true);
    try {
      await fetch("/api/oms/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "escalate_early",
          ticketId: targetId,
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
  const handleFlagMaintenance = async (ticketId?: string) => {
    const targetId = typeof ticketId === "string" ? ticketId : effectiveTicket?.ticketId;
    if (!targetId) return;
    setIsSubmitting(true);
    try {
      await fetch("/api/oms/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "flag_maintenance",
          ticketId: targetId,
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
  const handleCloseTicket = async (ticketId?: string) => {
    const targetId = typeof ticketId === "string" ? ticketId : effectiveTicket?.ticketId;
    if (!targetId) return;
    setIsSubmitting(true);
    try {
      await fetch("/api/oms/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clear_ptw",
          ticketId: targetId,
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
        (t) => t.status === "CLOSED" && (!t.assignedCrew || t.assignedCrew.toLowerCase().startsWith("unassigned"))
      );
    }
    if (historyFilter === "FIELD_REPAIRED") {
      return closedTickets.filter(
        (t) => Boolean(t.assignedCrew && !t.assignedCrew.toLowerCase().startsWith("unassigned"))
      );
    }
    if (historyFilter === "MAINTENANCE") {
      return closedTickets.filter((t) => t.status === "MAINTENANCE_SUPPRESSED");
    }
    return closedTickets;
  }, [closedTickets, historyFilter]);

  return (
    <div className="flex flex-col h-full overflow-hidden text-xs font-mono text-slate-900 dark:text-zinc-100 gap-2.5">
      {/* ============================================================== */}
      {/* 1. TOP OPERATIONAL KPI STATUS RIBBON                           */}
      {/* ============================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 shrink-0">
        {/* Metric 1: Grid Status */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-3 rounded-sm flex items-center justify-between shadow-xs dark:shadow-none">
          <div>
            <div className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider font-semibold">
              Grid Feeder Integrity
            </div>
            <div className="text-sm font-bold flex items-center gap-1.5 mt-0.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  activeTicketsList.length > 0 || isFault || isBreakerTripped ? "bg-rose-500 animate-ping" : "bg-emerald-500"
                }`}
              />
              <span className={activeTicketsList.length > 0 || isFault || isBreakerTripped ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>
                {activeTicketsList.length > 0 || isFault || isBreakerTripped ? "OUTAGE ACTIVE" : "100% HEALTHY"}
              </span>
            </div>
          </div>
          <Activity className="h-4 w-4 text-slate-400 dark:text-zinc-500" />
        </div>

        {/* Metric 2: Soak Observation Watchlist */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-3 rounded-sm flex items-center justify-between shadow-xs dark:shadow-none">
          <div>
            <div className="text-[10px] text-slate-600 dark:text-zinc-400 uppercase tracking-wider font-semibold">
              Soak Watchlist
            </div>
            <div className="text-sm font-bold flex items-center gap-1.5 mt-0.5">
              <Clock className={`h-3.5 w-3.5 ${isSoakActive ? "text-amber-500 animate-spin" : "text-slate-400 dark:text-zinc-500"}`} />
              <span className={isSoakActive ? "text-amber-700 dark:text-amber-400 font-bold" : "text-slate-800 dark:text-zinc-300 font-bold"}>
                {watchingTickets.length > 0 || isSoakActive ? `${Math.max(1, watchingTickets.length)} In Observation` : "0 Monitoring"}
              </span>
            </div>
          </div>
          <Badge variant={isSoakActive ? "warning" : "outline"} className="text-[10px] tabular-nums">
            {isSoakActive ? soakRemaining.label : "IDLE"}
          </Badge>
        </div>

        {/* Metric 3: Sustained Outages / Escalated */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-3 rounded-sm flex items-center justify-between shadow-xs dark:shadow-none">
          <div>
            <div className="text-[10px] text-slate-600 dark:text-zinc-400 uppercase tracking-wider font-semibold">
              Action Required
            </div>
            <div className="text-sm font-bold flex items-center gap-1.5 mt-0.5">
              <AlertTriangle className={`h-3.5 w-3.5 ${isEscalated ? "text-rose-600 dark:text-rose-500 animate-bounce" : "text-slate-400 dark:text-zinc-500"}`} />
              <span className={isEscalated ? "text-rose-600 dark:text-rose-400 font-bold" : "text-slate-800 dark:text-zinc-300 font-bold"}>
                {escalatedTickets.length > 0 || isEscalated ? `${Math.max(1, escalatedTickets.length)} Escalated` : "0 Pending"}
              </span>
            </div>
          </div>
          <Badge variant={isEscalated ? "destructive" : "outline"} className="text-[10px]">
            {isEscalated ? "DISPATCH REQ" : "CLEAR"}
          </Badge>
        </div>

        {/* Metric 4: Field Crews Dispatched */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-3 rounded-sm flex items-center justify-between shadow-xs dark:shadow-none">
          <div>
            <div className="text-[10px] text-slate-600 dark:text-zinc-400 uppercase tracking-wider font-semibold">
              Duty Linemen
            </div>
            <div className="text-sm font-bold flex items-center gap-1.5 mt-0.5">
              <UserCheck className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
              <span className={dispatchedTickets.length > 0 ? "text-cyan-700 dark:text-cyan-400 font-bold" : "text-slate-800 dark:text-zinc-300 font-bold"}>
                {dispatchedTickets.length > 0 ? `${dispatchedTickets.length} Dispatched` : "4 Ready"}
              </span>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {dispatchedTickets.length > 0 ? "1 ACTIVE" : "STANDBY"}
          </Badge>
        </div>

        {/* Metric 5: SCADA Safety Interlocks */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-3 rounded-sm flex items-center justify-between shadow-xs dark:shadow-none col-span-2 sm:col-span-1">
          <div>
            <div className="text-[10px] text-slate-600 dark:text-zinc-400 uppercase tracking-wider font-semibold">
              SCADA Safety Interlock
            </div>
            <div className="text-sm font-bold flex items-center gap-1.5 mt-0.5">
              {isPtwActive ? (
                <>
                  <Lock className="h-3.5 w-3.5 text-rose-500" />
                  <span className="text-rose-600 dark:text-rose-400 font-bold">LOTO LOCKED</span>
                </>
              ) : (
                <>
                  <Unlock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">RECLOSE READY</span>
                </>
              )}
            </div>
          </div>
          <Badge variant={isPtwActive ? "destructive" : "healthy"} className="text-[10px]">
            {isPtwActive ? "CEA SEC 44" : "SAFE"}
          </Badge>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. TABLE 1: ACTIVE OUTAGES & SOAK WATCHLIST (ACTION TABLE)     */}
      {/* ============================================================== */}
      <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm p-3.5 shadow-xs dark:shadow-none flex flex-col shrink-0 space-y-2">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-rose-600 dark:text-rose-400 animate-pulse" />
            <span className="font-bold uppercase tracking-wider text-xs text-slate-900 dark:text-zinc-100">
              Live Outage Supervision &amp; Soak Watchlist
            </span>
            <Badge variant={activeTicketsList.length > 0 ? "destructive" : "outline"} className="text-[9px]">
              {activeTicketsList.length} ACTIVE INCIDENT{activeTicketsList.length === 1 ? "" : "S"}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                className="h-6 px-2 text-[10px] text-slate-500 hover:text-slate-900 dark:hover:text-white"
                title="Refresh Tickets"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            )}
          </div>
        </div>

        {activeTicketsList.length === 0 ? (
          /* Normal State: Sleek, non-intrusive SCADA banner */
          <div className="border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 px-3.5 py-3 rounded-xs flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span className="font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                Feeder Topology Normal • Zero Active Outages
              </span>
              <span className="text-slate-500 dark:text-zinc-400 text-[11px] hidden md:inline">
                | Angamaly 33/11kV DTR-01 operating within nominal statutory limits. LoRa Last-Gasp listener active.
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="px-2 py-0.5 rounded-xs border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                ANSI 87L: ARMED
              </span>
              <span className="px-2 py-0.5 rounded-xs border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                ANSI 46BC: SUPERVISED
              </span>
              <span className="px-2 py-0.5 rounded-xs border border-slate-300 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 font-semibold">
                SOAK POLICY: 15m ESCALATION
              </span>
            </div>
          </div>
        ) : (
          /* Active Outages Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 text-[10px] uppercase font-bold">
                  <th className="py-2 px-2.5">Ticket ID</th>
                  <th className="py-2 px-2.5">Detected</th>
                  <th className="py-2 px-2.5">Feeder / Target Pole</th>
                  <th className="py-2 px-2.5">GPS Waypoint</th>
                  <th className="py-2 px-2.5">Fault Code</th>
                  <th className="py-2 px-2.5">Soak / Status</th>
                  <th className="py-2 px-2.5">Assigned Lineman</th>
                  <th className="py-2 px-2.5 text-right">Operational Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                {activeTicketsList.map((t) => {
                  const isRowSoak = t.status === "WATCHING";
                  const isRowEscalated = t.status === "ESCALATED";
                  const isRowDispatched = t.status === "DISPATCHED" || t.status === "CREW_ON_SITE" || t.status === "PTW_ISSUED";
                  const timeStr = new Date(t.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

                  return (
                    <tr
                      key={t.ticketId}
                      className={`hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors ${
                        isRowEscalated
                          ? "bg-rose-50/40 dark:bg-rose-950/20"
                          : isRowSoak
                          ? "bg-amber-50/30 dark:bg-amber-950/15"
                          : "bg-cyan-50/30 dark:bg-cyan-950/15"
                      }`}
                    >
                      {/* Ticket ID */}
                      <td className="py-2 px-2.5 font-bold text-slate-900 dark:text-zinc-100 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isRowEscalated ? "bg-rose-500 animate-ping" : isRowSoak ? "bg-amber-500 animate-spin" : "bg-cyan-500"
                            }`}
                          />
                          <span>{t.ticketId}</span>
                        </div>
                      </td>

                      {/* Detected Time */}
                      <td className="py-2 px-2.5 text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                        {timeStr}
                      </td>

                      {/* Feeder / Pole */}
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        <span className="font-bold text-slate-800 dark:text-zinc-200">{t.affectedPole}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{t.feederName}</span>
                      </td>

                      {/* GPS Waypoint */}
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${t.gps.lat.toFixed(6)},${t.gps.lng.toFixed(6)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-700 dark:text-cyan-400 hover:underline flex items-center gap-1 font-bold tabular-nums"
                          title="Open exact sub-meter pin in Google Maps"
                        >
                          <MapPin className="h-3 w-3 shrink-0 text-cyan-600 dark:text-cyan-500" />
                          <span>{t.gps.lat.toFixed(6)}°N, {t.gps.lng.toFixed(6)}°E</span>
                          <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                        </a>
                      </td>

                      {/* Fault Code */}
                      <td className="py-2 px-2.5 font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                        {t.faultType}
                      </td>

                      {/* Soak / Status */}
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        {isRowSoak ? (
                          <div className="space-y-1">
                            <Badge variant="warning" className="flex items-center gap-1 text-[10px] py-0 px-1.5">
                              <Clock className="h-2.5 w-2.5 animate-spin" />
                              <span>SOAK: {soakRemaining.label}</span>
                            </Badge>
                            <div className="w-24 bg-amber-200 dark:bg-amber-950 rounded-full h-1 overflow-hidden">
                              <div
                                className="bg-amber-500 h-1 transition-all duration-1000 ease-linear rounded-full"
                                style={{ width: `${soakRemaining.percent}%` }}
                              />
                            </div>
                          </div>
                        ) : isRowEscalated ? (
                          <Badge variant="destructive" className="animate-pulse text-[10px]">
                            ESCALATED (DISPATCH REQ)
                          </Badge>
                        ) : (
                          <Badge variant="healthy" className="text-[10px]">
                            {t.status.replace(/_/g, " ")}
                          </Badge>
                        )}
                      </td>

                      {/* Assigned Lineman */}
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        {t.assignedCrew ? (
                          <div className="flex items-center gap-1 text-slate-800 dark:text-zinc-200 font-bold">
                            <User className="h-3 w-3 text-cyan-500" />
                            <span>{t.assignedCrew}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {isRowEscalated && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setIsDispatchModalOpen(true)}
                              className="h-6 px-2.5 text-[10px] font-bold shadow-xs cursor-pointer flex items-center gap-1"
                            >
                              <Send className="h-3 w-3" />
                              <span>Dispatch Lineman (Telegram) ➔</span>
                            </Button>
                          )}

                          {isRowSoak && (
                            <>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleEscalateEarly(t.ticketId)}
                                disabled={isSubmitting}
                                className="h-6 px-2 text-[10px] font-bold cursor-pointer"
                              >
                                Escalate Early ➔
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleFlagMaintenance(t.ticketId)}
                                disabled={isSubmitting}
                                className="h-6 px-2 text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400 cursor-pointer"
                              >
                                Flag Maint
                              </Button>
                            </>
                          )}

                          {isRowDispatched && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCloseTicket(t.ticketId)}
                              disabled={isSubmitting}
                              className="h-6 px-2 text-[10px] border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-50 cursor-pointer"
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Clear PTW &amp; Close
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAuditModalTicket(t)}
                            className="h-6 px-2 text-[10px] text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                            title="View SCADA worklog & directives"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            Log
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* 3. TABLE 2: RESOLVED OUTAGES & RESTORATION LEDGER              */}
      {/* ============================================================== */}
      <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm p-3.5 shadow-xs dark:shadow-none flex flex-col flex-1 min-h-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-zinc-800 pb-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-500" />
            <span className="font-bold uppercase tracking-wider text-xs text-slate-900 dark:text-zinc-100">
              Outage Restoration &amp; Resolved Incidents Ledger
            </span>
            <Badge variant="outline" className="text-[9px]">
              {filteredClosedTickets.length} RECORDS
            </Badge>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-900 p-0.5 rounded-xs border border-slate-200 dark:border-zinc-800 text-[10px]">
            <button
              onClick={() => setHistoryFilter("ALL")}
              className={`px-2 py-0.5 rounded-xs cursor-pointer transition-colors ${
                historyFilter === "ALL"
                  ? "bg-white dark:bg-zinc-800 font-bold text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              All ({closedTickets.length})
            </button>
            <button
              onClick={() => setHistoryFilter("AUTO_CLEARED")}
              className={`px-2 py-0.5 rounded-xs cursor-pointer transition-colors ${
                historyFilter === "AUTO_CLEARED"
                  ? "bg-white dark:bg-zinc-800 font-bold text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Auto-Cleared (Soak)
            </button>
            <button
              onClick={() => setHistoryFilter("FIELD_REPAIRED")}
              className={`px-2 py-0.5 rounded-xs cursor-pointer transition-colors ${
                historyFilter === "FIELD_REPAIRED"
                  ? "bg-white dark:bg-zinc-800 font-bold text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Lineman Repaired
            </button>
            <button
              onClick={() => setHistoryFilter("MAINTENANCE")}
              className={`px-2 py-0.5 rounded-xs cursor-pointer transition-colors ${
                historyFilter === "MAINTENANCE"
                  ? "bg-white dark:bg-zinc-800 font-bold text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Maintenance
            </button>
          </div>
        </div>

        {/* Tabular History View */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="sticky top-0 bg-white dark:bg-[#0c0d10] z-10">
              <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 text-[10px] uppercase font-semibold">
                <th className="py-2 px-2.5">Ticket ID</th>
                <th className="py-2 px-2.5">Restored Time</th>
                <th className="py-2 px-2.5">Feeder / Affected Span</th>
                <th className="py-2 px-2.5">GPS Waypoint</th>
                <th className="py-2 px-2.5">Fault Reason</th>
                <th className="py-2 px-2.5">Outage Duration</th>
                <th className="py-2 px-2.5">Resolution Outcome</th>
                <th className="py-2 px-2.5 text-right">Audit Trail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
              {filteredClosedTickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400 dark:text-zinc-500 text-xs">
                    No resolved records found in this category.
                  </td>
                </tr>
              ) : (
                filteredClosedTickets.map((t) => {
                  const hasCrew = Boolean(t.assignedCrew && !t.assignedCrew.toLowerCase().startsWith("unassigned"));
                  const isMaint = t.status === "MAINTENANCE_SUPPRESSED";
                  const timeStr = new Date(t.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  
                  // Approximate duration from worklog or soak
                  const durationStr = isMaint ? "Suppressed" : hasCrew ? "~12 mins" : "~1 min (Soak)";

                  return (
                    <tr key={t.ticketId} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors">
                      {/* Ticket ID */}
                      <td className="py-2 px-2.5 font-bold text-slate-800 dark:text-zinc-200 whitespace-nowrap">
                        {t.ticketId}
                      </td>

                      {/* Restored Time */}
                      <td className="py-2 px-2.5 text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                        {timeStr}
                      </td>

                      {/* Feeder / Location */}
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        <span className="font-semibold text-slate-800 dark:text-zinc-200">{t.affectedPole}</span>
                        <span className="text-[10px] text-slate-400 block">{t.feederName}</span>
                      </td>

                      {/* GPS */}
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${t.gps.lat.toFixed(6)},${t.gps.lng.toFixed(6)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 tabular-nums font-medium"
                          title="View on Google Maps"
                        >
                          <MapPin className="h-3 w-3 text-cyan-500" />
                          <span>{t.gps.lat.toFixed(6)}°N, {t.gps.lng.toFixed(6)}°E</span>
                        </a>
                      </td>

                      {/* Fault Reason */}
                      <td className="py-2 px-2.5 text-slate-700 dark:text-zinc-300 font-medium whitespace-nowrap">
                        {t.faultType}
                      </td>

                      {/* Duration */}
                      <td className="py-2 px-2.5 text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                        {durationStr}
                      </td>

                      {/* Outcome Badge */}
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        {isMaint ? (
                          <Badge variant="warning" className="text-[9px]">
                            MAINTENANCE
                          </Badge>
                        ) : hasCrew ? (
                          <Badge variant="healthy" className="text-[9px]">
                            REPAIRED ({t.assignedCrew.split(" ")[0].toUpperCase()})
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[9px]">
                            AUTO-CLEARED (SOAK)
                          </Badge>
                        )}
                      </td>

                      {/* Audit Action */}
                      <td className="py-2 px-2.5 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAuditModalTicket(t)}
                          className="h-6 px-2 text-[10px] text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          Audit Trail
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. BOTTOM BAR: DUTY LINEMEN & SCADA SAFETY PROTOCOL STRIP      */}
      {/* ============================================================== */}
      <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm p-3 shadow-xs dark:shadow-none shrink-0 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Lineman Readiness */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            <UserCheck className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
            <span className="font-bold uppercase tracking-wider text-[10px] text-slate-600 dark:text-zinc-400">
              Duty Linemen:
            </span>
          </div>

          {linemen.map((lm) => {
            const isAssigned = effectiveTicket?.assignedPhone === lm.phone;
            return (
              <div
                key={lm.id}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xs border text-[10px] ${
                  lm.status === "ON_DUTY"
                    ? "border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300 font-semibold"
                    : "border-slate-300 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 text-slate-800 dark:text-zinc-400 font-medium"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    lm.status === "ON_DUTY" ? "bg-emerald-500" : "bg-slate-400"
                  }`}
                />
                <span className="font-bold">{lm.name}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">({lm.role.split(" ")[0]})</span>
                {isAssigned && (
                  <Badge variant="healthy" className="text-[9px] py-0 px-1 ml-1">
                    ACTIVE
                  </Badge>
                )}
              </div>
            );
          })}
        </div>

        {/* SCADA Reclose Lockout Status */}
        <div className="flex items-center gap-3 text-[11px] font-semibold">
          <div className="flex items-center gap-1.5">
            {isPtwActive ? (
              <>
                <Lock className="h-3.5 w-3.5 text-rose-500" />
                <span className="text-rose-600 dark:text-rose-400">LOTO LOCKED // Remote Reclose Blocked (CEA Sec 44)</span>
              </>
            ) : (
              <>
                <Unlock className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">RECLOSE PERMITTED // Supervisory Interlock Ready</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 5. MANUAL FIELD LINEMAN DISPATCH MODAL                         */}
      {/* ============================================================== */}
      {isDispatchModalOpen && effectiveTicket && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0c0d10] border border-slate-300 dark:border-zinc-700 rounded-sm w-full max-w-lg p-5 font-mono shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 uppercase">
                    AUTHORIZE LINEMAN DISPATCH (KSEB OMS)
                  </h3>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                    Ticket: {effectiveTicket.ticketId} • Feeder: {effectiveTicket.feederName}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsDispatchModalOpen(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs px-2 py-0.5 border border-slate-300 dark:border-zinc-700 rounded-xs cursor-pointer"
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

            {/* Lineman Selection */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                Select Designated Duty Lineman
              </label>
              <div className="space-y-1.5">
                {linemen.map((lm) => (
                  <div
                    key={lm.id}
                    onClick={() => setSelectedLinemanId(lm.id)}
                    className={`p-2.5 rounded-xs border cursor-pointer flex items-center justify-between text-xs transition-all ${
                      selectedLinemanId === lm.id
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 ring-1 ring-emerald-500"
                        : "border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 hover:border-slate-400"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                        <User className="h-3 w-3 text-slate-400" />
                        <span>{lm.name}</span>
                        <span className="text-[10px] text-slate-500 font-normal">({lm.role})</span>
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                        Section: {lm.section} • Mobile: {lm.phone}
                      </div>
                    </div>
                    <Badge variant={selectedLinemanId === lm.id ? "healthy" : "outline"} className="text-[9px]">
                      {selectedLinemanId === lm.id ? "SELECTED" : "AVAILABLE"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Notes */}
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                Operator Instructions to Lineman (Optional)
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
              <div className="text-[10px] text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                <Send className="h-3 w-3 text-cyan-500" />
                <span>Background automated dispatch via Telegram Bot</span>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsDispatchModalOpen(false)}
                  className="text-xs h-8 cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  disabled={isSubmitting}
                  onClick={handleConfirmManualDispatch}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs h-8 px-4 flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{isSubmitting ? "Dispatching..." : "Send Telegram Dispatch Alert ➔"}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 6. AUDIT TRAIL MODAL                                           */}
      {/* ============================================================== */}
      {auditModalTicket && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0c0d10] border border-slate-300 dark:border-zinc-700 rounded-sm w-full max-w-lg p-5 font-mono shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 uppercase">
                    SCADA AUDIT LOG // {auditModalTicket.ticketId}
                  </h3>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                    Location: {auditModalTicket.affectedPole} • {auditModalTicket.feederName}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setAuditModalTicket(null)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs px-2 py-0.5 border border-slate-300 dark:border-zinc-700 rounded-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Ticket Metadata Bar */}
            <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 dark:bg-zinc-950 p-2.5 rounded-xs border border-slate-200 dark:border-zinc-800">
              <div>
                <span className="text-slate-500 block text-[10px]">FAULT CLASSIFICATION</span>
                <span className="font-bold text-rose-600 dark:text-rose-400">{auditModalTicket.faultType}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">GPS LOCATION</span>
                <span className="font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
                  {auditModalTicket.gps.lat.toFixed(6)}°N, {auditModalTicket.gps.lng.toFixed(6)}°E
                </span>
              </div>
            </div>

            {/* Chronological WorkLog */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                Chronological Directives &amp; Restoration Events
              </div>
              <div className="bg-slate-50 dark:bg-zinc-950 p-3 rounded-xs border border-slate-200 dark:border-zinc-800 max-h-56 overflow-y-auto space-y-1.5 text-[11px] font-mono">
                {auditModalTicket.workLog.map((log, idx) => (
                  <div key={idx} className="text-slate-700 dark:text-zinc-300 flex items-start gap-2">
                    <span className="text-emerald-500 shrink-0 font-bold">›</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-zinc-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAuditModalTicket(null)}
                className="text-xs h-7 cursor-pointer"
              >
                Close Audit Trail
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
