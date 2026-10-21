"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Check,
  CheckCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Lock,
  MapPin,
  Navigation,
  Phone,
  Power,
  Radio,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Unlock,
  UserCheck,
  Users,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TroubleTicket } from "@/lib/types";

interface WorkforceOmsPanelProps {
  tickets: TroubleTicket[];
  onRefresh?: () => void;
  isBreakerTripped?: boolean;
  isFault?: boolean;
}

const DEFAULT_RESOLVED_INCIDENTS = [
  {
    ticketId: "INC-2026-0882",
    feederName: "Feeder 04 • 415V LT",
    affectedPole: "Pole 1 - Pole 2 Span",
    resolvedAt: "Today, 14:20 IST",
    faultType: "Vegetation Encroachment & Conductor Sway",
    duration: "24m",
    crew: "Unit #4 (K. P. Rajesh)",
    action: "Tree branches pruned, PTW cleared, feeder re-energized.",
    ptwNumber: "PTW-415V-0882",
    status: "CLOSED",
  },
  {
    ticketId: "INC-2026-0841",
    feederName: "Feeder 04 • 415V LT",
    affectedPole: "Pole 2 Terminal",
    resolvedAt: "Yesterday, 18:45 IST",
    faultType: "Shunt Neutral Insulation Degradation",
    duration: "42m",
    crew: "Unit #4 (K. P. Rajesh)",
    action: "PZEM current sensor clamp re-seated, heat shrink sleeve applied.",
    ptwNumber: "PTW-415V-0841",
    status: "CLOSED",
  },
  {
    ticketId: "INC-2026-0795",
    feederName: "Feeder 04 • 415V LT",
    affectedPole: "DTR-01 LV Bushing",
    resolvedAt: "Oct 17, 11:15 IST",
    faultType: "Thermal Hotspot & Loose Lug",
    duration: "35m",
    crew: "Substation Maintenance Unit",
    action: "Lug crimped, torque verified to 45 Nm, thermography clear.",
    ptwNumber: "PTW-DTR-0795",
    status: "CLOSED",
  },
];

export function WorkforceOmsPanel({
  tickets,
  onRefresh,
  isBreakerTripped = false,
  isFault = false,
}: WorkforceOmsPanelProps) {
  const [selectedTicketId, setSelectedTicketId] = React.useState<string>(
    tickets[0]?.ticketId || ""
  );
  const [repairNotes, setRepairNotes] = React.useState(
    "Conductor inspected. Vegetation cleared. Safe for re-energization."
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [simulatedTime, setSimulatedTime] = React.useState("09:41");

  // Keep simulated phone clock alive
  React.useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setSimulatedTime(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // Sync selected ticket if changed
  React.useEffect(() => {
    if (!selectedTicketId && tickets.length > 0) {
      setSelectedTicketId(tickets[0].ticketId);
    }
  }, [tickets, selectedTicketId]);

  const activeTicket = tickets.find((t) => t.ticketId === selectedTicketId) || tickets[0];
  const hasActiveTickets = tickets.length > 0;

  const handleUpdateStatus = async (status: string, message: string) => {
    if (!activeTicket) return;
    setIsSubmitting(true);
    try {
      await fetch("/api/oms/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_status",
          ticketId: activeTicket.ticketId,
          status,
          message,
        }),
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIssuePtw = async () => {
    if (!activeTicket) return;
    setIsSubmitting(true);
    try {
      await fetch("/api/oms/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "issue_ptw",
          ticketId: activeTicket.ticketId,
          linemanName: "K. P. Rajesh",
        }),
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearPtw = async () => {
    if (!activeTicket) return;
    setIsSubmitting(true);
    try {
      await fetch("/api/oms/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clear_ptw",
          ticketId: activeTicket.ticketId,
          notes: repairNotes,
        }),
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPtwActive = activeTicket?.ptw?.reclosingInterlockActive === true;

  return (
    <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1012] rounded-sm flex flex-col h-full overflow-hidden text-xs font-mono shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-zinc-800 px-3.5 py-2.5 bg-slate-50 dark:bg-zinc-950/80 gap-2">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-amber-500 dark:text-amber-400" />
          <span className="font-semibold uppercase tracking-wider text-slate-800 dark:text-zinc-100">
            OUTAGE MANAGEMENT SYSTEM (OMS) // LINEMAN DISPATCH &amp; PTW SAFETY
          </span>
          <Badge
            variant={hasActiveTickets ? "destructive" : "healthy"}
            className="text-[10px]"
          >
            ACTIVE TICKETS: {tickets.filter((t) => t.status !== "CLOSED").length}
          </Badge>
        </div>

        {isPtwActive ? (
          <Badge variant="destructive" className="flex items-center gap-1 text-[10px] animate-pulse">
            <Lock className="h-3 w-3" />
            SAFETY INTERLOCK ACTIVE (RECLOSING LOCKED)
          </Badge>
        ) : (
          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-zinc-400">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span>SCADA RECLOSER READY // NO LOCKOUT</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 flex-1 min-h-[460px]">
        {/* ============================================================== */}
        {/* LEFT COLUMN: TROUBLE TICKET QUEUE OR RECENT RESOLVED INCIDENTS */}
        {/* ============================================================== */}
        <div className="col-span-12 lg:col-span-4 border-r border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800/80 pb-1.5">
            <div className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              {hasActiveTickets ? "DISTRIBUTION TROUBLE TICKETS" : "RECENT RESOLVED INCIDENTS"}
            </div>
            <Badge variant="outline" className="text-[9px]">
              {hasActiveTickets ? `${tickets.length} ACTIVE` : "ARCHIVE LOG"}
            </Badge>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[440px] pr-0.5">
            {hasActiveTickets ? (
              tickets.map((t) => {
                const isSelected = activeTicket?.ticketId === t.ticketId;
                return (
                  <div
                    key={t.ticketId}
                    onClick={() => setSelectedTicketId(t.ticketId)}
                    className={`border p-2.5 rounded-sm cursor-pointer transition-all ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-zinc-900 shadow-sm"
                        : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 hover:bg-slate-50 dark:hover:bg-zinc-900/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-zinc-200">
                        {t.ticketId}
                      </span>
                      <Badge
                        variant={
                          t.status === "CLOSED"
                            ? "healthy"
                            : t.status === "PTW_ISSUED"
                            ? "warning"
                            : "destructive"
                        }
                        className="text-[9px]"
                      >
                        {t.status}
                      </Badge>
                    </div>

                    <div className="text-[11px] text-slate-700 dark:text-zinc-300 font-semibold mt-1">
                      {t.affectedPole}
                    </div>

                    <div className="text-[10px] text-slate-500 dark:text-zinc-500 flex justify-between mt-1">
                      <span>{t.feederName}</span>
                      <span>{new Date(t.createdAt).toLocaleTimeString()}</span>
                    </div>

                    {t.ptw && (
                      <div className="mt-1.5 pt-1 border-t border-slate-200 dark:border-zinc-800/80 flex items-center justify-between text-[10px]">
                        <span className="text-amber-600 dark:text-amber-400 font-bold">
                          {t.ptw.ptwNumber}
                        </span>
                        <span
                          className={
                            t.ptw.reclosingInterlockActive
                              ? "text-rose-600 dark:text-rose-400 font-bold"
                              : "text-emerald-600 dark:text-emerald-400 font-bold"
                          }
                        >
                          {t.ptw.reclosingInterlockActive ? "[INTERLOCKED]" : "[CLEARED]"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              /* High-fidelity Recent Resolved Incidents list when 0 active tickets */
              <div className="space-y-2">
                {DEFAULT_RESOLVED_INCIDENTS.map((inc) => (
                  <div
                    key={inc.ticketId}
                    className="border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950/60 p-2.5 rounded-sm space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-zinc-200">
                        {inc.ticketId}
                      </span>
                      <Badge variant="healthy" className="text-[9px] py-0">
                        RESOLVED
                      </Badge>
                    </div>

                    <div className="text-[11px] text-slate-700 dark:text-zinc-300 font-semibold">
                      {inc.affectedPole}
                    </div>

                    <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                      {inc.faultType}
                    </div>

                    <p className="text-[9px] text-slate-600 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-900/60 p-1.5 rounded-xs border border-slate-200 dark:border-zinc-800/60">
                      • {inc.action}
                    </p>

                    <div className="flex items-center justify-between text-[9px] text-slate-400 dark:text-zinc-500 pt-1 border-t border-slate-100 dark:border-zinc-800/50">
                      <span>{inc.resolvedAt}</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                        {inc.ptwNumber} (CLEARED)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* CENTER COLUMN: TICKET DETAILS OR FEEDER SAFETY & PTW READINESS */}
        {/* ============================================================== */}
        <div className="col-span-12 lg:col-span-4 border-r border-slate-200 dark:border-zinc-800 p-3.5 flex flex-col justify-between space-y-3 bg-white dark:bg-[#0d0e11]">
          {hasActiveTickets && activeTicket ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2">
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                    {activeTicket.ticketId}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                    REPORTED: {new Date(activeTicket.createdAt).toLocaleString()}
                  </div>
                </div>
                <Badge
                  variant={activeTicket.severity === "CRITICAL" ? "trip" : "warning"}
                  className="text-[10px]"
                >
                  SEV: {activeTicket.severity}
                </Badge>
              </div>

              {/* Geographic & Technical Specs */}
              <div className="space-y-1.5 border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-2.5 rounded-sm">
                <div className="flex justify-between items-baseline border-b border-slate-200 dark:border-zinc-800/60 pb-1">
                  <span className="text-slate-500 dark:text-zinc-500">FEEDER:</span>
                  <span className="text-slate-800 dark:text-zinc-200 font-semibold">{activeTicket.feederName}</span>
                </div>
                <div className="flex justify-between items-baseline border-b border-slate-200 dark:border-zinc-800/60 pb-1">
                  <span className="text-slate-500 dark:text-zinc-500">FAULT CATEGORY:</span>
                  <span className="text-rose-600 dark:text-rose-400 font-bold">{activeTicket.faultType}</span>
                </div>
                <div className="flex justify-between items-baseline border-b border-slate-200 dark:border-zinc-800/60 pb-1">
                  <span className="text-slate-500 dark:text-zinc-500">LOCATION:</span>
                  <span className="text-slate-800 dark:text-zinc-200">{activeTicket.affectedPole}</span>
                </div>
                <div className="flex justify-between items-baseline border-b border-slate-200 dark:border-zinc-800/60 pb-1">
                  <span className="text-slate-500 dark:text-zinc-500">GPS COORDINATES:</span>
                  <span className="text-cyan-600 dark:text-cyan-400 tabular-nums">
                    {activeTicket.gps.lat.toFixed(4)}°N, {activeTicket.gps.lng.toFixed(4)}°E
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500 dark:text-zinc-500">AFFECTED LOAD:</span>
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">
                    ~{activeTicket.estimatedCustomers} Consumers (DTR-01)
                  </span>
                </div>
              </div>

              {/* Lineman Assignment */}
              <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-2.5 rounded-sm space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    ASSIGNED FIELD CREW
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">DISPATCHED</span>
                </div>
                <div className="text-slate-900 dark:text-zinc-100 font-bold">
                  {activeTicket.assignedCrew}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3 text-slate-400 dark:text-zinc-500" />
                    {activeTicket.assignedPhone}
                  </span>
                  <a
                    href={`https://www.google.com/maps?q=${activeTicket.gps.lat},${activeTicket.gps.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    <Navigation className="h-3 w-3" />
                    NAVIGATE
                  </a>
                </div>
              </div>

              {/* Event / Action Work Log */}
              <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/70 p-2.5 rounded-sm">
                <div className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  CHRONOLOGICAL AUDIT TRAIL
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto text-[10px] text-slate-600 dark:text-zinc-300">
                  {activeTicket.workLog.map((log, idx) => (
                    <div key={idx} className="border-b border-slate-200 dark:border-zinc-800/40 pb-0.5">
                      • {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Feeder Safety & PTW Readiness Status Summary Card (0 Active Tickets) */
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-100 uppercase tracking-wider">
                    FEEDER SAFETY &amp; PTW READINESS STATUS
                  </span>
                </div>
                <Badge variant="healthy" className="text-[9px]">
                  ALL CLEAR
                </Badge>
              </div>

              {/* Feeder Supervision Status Card */}
              <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-950 p-2.5 rounded-sm space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold">
                  <span className="text-slate-500 dark:text-zinc-400 uppercase">FEEDER SUPERVISION</span>
                  <Badge
                    variant={isFault ? "destructive" : "healthy"}
                    className="text-[9px]"
                  >
                    {isFault ? "FAULT ACTIVE / TRIP REPORTED" : "FEEDER HEALTHY & ENERGIZED"}
                  </Badge>
                </div>
                <div className="text-slate-800 dark:text-zinc-200 font-bold text-xs">
                  FISAT 33/11kV SUBSTATION • FEEDER 04
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                  Continuous LoRa Sub-GHz Mesh • Dual-Pole Differential Monitoring
                </div>
              </div>

              {/* PTW Safety Interlock Status */}
              <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-950 p-2.5 rounded-sm space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold">
                  <span className="text-slate-500 dark:text-zinc-400 uppercase">PTW SAFETY INTERLOCK</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px] flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    CLEAR / UNLOCKED
                  </span>
                </div>
                <div className="text-slate-800 dark:text-zinc-200 text-xs">
                  IEEE 1686 Safety Interlock Matrix: <strong className="text-emerald-600 dark:text-emerald-400">READY</strong>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                  0 active Permit-To-Work locks. Remote SCADA breaker reclose is authorized.
                </div>
              </div>

              {/* Assigned Duty Crew #4 Details */}
              <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-950 p-2.5 rounded-sm space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold">
                  <span className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400 uppercase">
                    <Users className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    DUTY CREW #4 (STANDBY)
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                    READY FOR DISPATCH
                  </span>
                </div>
                <div className="text-slate-800 dark:text-zinc-100 font-bold text-xs">
                  K. P. Rajesh (Sr. Lineman) &amp; M. S. Sreejith (Line Assistant)
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3 text-slate-400" />
                    +91 94470 12345
                  </span>
                  <span>ETA: &lt; 8 mins</span>
                </div>
                <div className="text-[9px] text-slate-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 p-1.5 rounded-xs border border-slate-200 dark:border-zinc-800">
                  • Base: Angamaly Section Office Standby Station
                  <br />
                  • PPE: Class 4 Insulated Gloves, Discharge Rods, LR1121 Mesh Handset
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-slate-200 dark:border-zinc-800 pt-2 text-[10px] text-slate-400 dark:text-zinc-500 flex items-center justify-between">
            <span>REGULATION: CEA SAFETY SEC 44</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">ZERO ACCIDENTS</span>
          </div>
        </div>

        {/* ============================================================== */}
        {/* RIGHT COLUMN: LINEMAN COMPANION SMARTPHONE APP SIMULATOR       */}
        {/* ============================================================== */}
        <div className="col-span-12 lg:col-span-4 p-3 flex flex-col justify-between bg-slate-100/60 dark:bg-zinc-950/90">
          {/* Subtle Mobile Device Shell */}
          <div className="rounded-2xl border-2 border-slate-700/80 dark:border-zinc-700/80 bg-slate-900 shadow-xl overflow-hidden flex flex-col h-full text-zinc-100">
            {/* Phone Status Bar Header */}
            <div className="bg-black/90 px-3 py-1.5 flex items-center justify-between text-[10px] border-b border-zinc-800/80 shrink-0">
              {/* Left: Clock */}
              <span className="font-bold tracking-tight text-white">{simulatedTime}</span>

              {/* Center: Dynamic Island / Speaker Notch */}
              <div className="h-3 w-20 bg-zinc-950 rounded-full border border-zinc-800 flex items-center justify-center">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>

              {/* Right: Connectivity Icons */}
              <div className="flex items-center gap-1.5 text-zinc-300">
                <span className="text-[9px] font-black tracking-wider text-emerald-400">5G</span>
                <Wifi className="h-3 w-3" />
                <div className="flex items-center gap-0.5">
                  <span className="text-[8px] font-mono">100%</span>
                  <BatteryCharging className="h-3 w-3 text-emerald-400" />
                </div>
              </div>
            </div>

            {/* Mobile App Screen Content */}
            <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5 overflow-y-auto bg-slate-900/95 dark:bg-[#0c0d10]">
              {/* Lineman App Title */}
              <div>
                <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <Smartphone className="h-4 w-4 text-emerald-400" />
                    <div>
                      <div className="text-[11px] font-bold uppercase text-white tracking-wider">
                        KSEB SMART LINEMAN
                      </div>
                      <div className="text-[8px] text-zinc-400 uppercase">
                        FIELD APP SIMULATOR // CREW #4
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant={hasActiveTickets ? "destructive" : "healthy"}
                    className="text-[9px] py-0 px-1.5"
                  >
                    {hasActiveTickets ? "DISPATCH ACTIVE" : "STANDBY"}
                  </Badge>
                </div>

                {/* Standby Banner if No Active Tickets */}
                {!hasActiveTickets ? (
                  <div className="mb-2.5 p-2 bg-emerald-950/40 border border-emerald-800/60 rounded-sm text-[10px] text-emerald-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span>ALL DISTRIBUTION FEEDERS HEALTHY</span>
                    </div>
                    <p className="text-[9px] text-zinc-400">
                      No active trouble tickets dispatched. Safety action buttons remain locked until an outage incident is reported.
                    </p>
                  </div>
                ) : (
                  <div className="mb-2.5 p-2 bg-rose-950/40 border border-rose-800/60 rounded-sm text-[10px] text-rose-300 space-y-0.5">
                    <div className="flex items-center gap-1 font-bold text-rose-200">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                      <span>ACTIVE DISPATCH ASSIGNMENT</span>
                    </div>
                    <p className="text-[9px] text-zinc-300">
                      Ticket #{activeTicket.ticketId} • {activeTicket.affectedPole} • Follow CEA safety protocol below.
                    </p>
                  </div>
                )}

                {/* Lineman 3-Step Action Workflow */}
                <div className="space-y-2">
                  {/* STEP 1: Confirm Arrival */}
                  <div className="border border-zinc-800 bg-zinc-950/70 p-2 rounded-sm space-y-1.5">
                    <div className="text-[10px] font-bold text-zinc-200 uppercase flex items-center justify-between">
                      <span>STEP 1: FIELD CREW ARRIVAL</span>
                      {hasActiveTickets && activeTicket?.status !== "DISPATCHED" ? (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                      ) : null}
                    </div>
                    <p className="text-[9px] text-zinc-400">
                      Lineman arrives at Pole 2 GPS coordinates and verifies physical line isolation.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-[10px] h-7 bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-zinc-200 disabled:opacity-40"
                      disabled={!hasActiveTickets || activeTicket?.status !== "DISPATCHED" || isSubmitting}
                      onClick={() =>
                        handleUpdateStatus(
                          "CREW_ON_SITE",
                          "Lineman arrived on site at Pole 2. Starting visual inspection."
                        )
                      }
                    >
                      CONFIRM ON-SITE ARRIVAL
                    </Button>
                  </div>

                  {/* STEP 2: Issue Permit-To-Work (PTW) */}
                  <div
                    className={`border p-2 rounded-sm space-y-1.5 transition-all ${
                      isPtwActive
                        ? "border-rose-500 bg-rose-950/40 ring-1 ring-rose-500/60"
                        : "border-zinc-800 bg-zinc-950/70"
                    }`}
                  >
                    <div className="text-[10px] font-bold text-zinc-200 uppercase flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Shield className="h-3 w-3 text-amber-400" />
                        STEP 2: ISSUE DIGITAL PTW
                      </span>
                      {isPtwActive ? (
                        <Badge variant="destructive" className="text-[8px] py-0 px-1 animate-pulse">
                          LOCKOUT ENGAGED
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-[9px] text-zinc-400">
                      Hard reclose interlock engages in SCADA. Remote breaker re-closing is strictly blocked.
                    </p>

                    <Button
                      variant={isPtwActive ? "secondary" : "amber"}
                      size="sm"
                      className="w-full text-[10px] h-7 font-bold disabled:opacity-40"
                      disabled={
                        !hasActiveTickets ||
                        activeTicket?.status !== "CREW_ON_SITE" ||
                        isPtwActive ||
                        isSubmitting
                      }
                      onClick={handleIssuePtw}
                    >
                      <Lock className="h-3 w-3 mr-1" />
                      ISSUE PTW &amp; ENGAGE LOCKOUT
                    </Button>
                  </div>

                  {/* STEP 3: Repair Clearance & PTW Sign-Off */}
                  <div className="border border-zinc-800 bg-zinc-950/70 p-2 rounded-sm space-y-1.5">
                    <div className="text-[10px] font-bold text-zinc-200 uppercase flex items-center justify-between">
                      <span>STEP 3: REPAIR CLEARANCE &amp; UNLOCK</span>
                    </div>
                    <input
                      type="text"
                      disabled={!hasActiveTickets || !isPtwActive}
                      className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-[10px] px-2 py-1 rounded-sm font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-40"
                      value={repairNotes}
                      onChange={(e) => setRepairNotes(e.target.value)}
                      placeholder="Enter repair clearance notes..."
                    />

                    <Button
                      variant="emerald"
                      size="sm"
                      className="w-full text-[10px] h-7 font-bold disabled:opacity-40"
                      disabled={!hasActiveTickets || !isPtwActive || isSubmitting}
                      onClick={handleClearPtw}
                    >
                      <Unlock className="h-3 w-3 mr-1" />
                      SIGN-OFF CLEARANCE &amp; UNLOCK
                    </Button>
                  </div>
                </div>
              </div>

              {/* Phone Bottom Home Bar */}
              <div className="pt-2 border-t border-zinc-800 text-center">
                <div className="h-1 w-24 bg-zinc-600 rounded-full mx-auto" />
                <span className="text-[8px] text-zinc-500 mt-1 block">
                  KSEB FIELD WORKFORCE MOBILE v2.4.1 // IEEE 1686
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
