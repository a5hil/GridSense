"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BatteryCharging,
  Check,
  CheckCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  CornerDownRight,
  Crosshair,
  ExternalLink,
  FileText,
  GitBranch,
  Lock,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  Power,
  Radio,
  Send,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Split,
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
import { NetworkSnapshot, NodeState, Detection } from "@/lib/network/types";
import { NODE_BY_ID } from "@/lib/network/topology";

interface WorkforceOmsPanelProps {
  tickets: TroubleTicket[];
  onRefresh?: () => void;
  isBreakerTripped?: boolean;
  isFault?: boolean;
  networkSnapshot?: NetworkSnapshot | null;
  selectedPoleId?: string;
  onSelectPole?: (poleId: string) => void;
}

export const FIELD_CREWS = [
  {
    id: "QRU-4",
    name: "Lineman Quick-Response Unit #4 (K. P. Rajesh & Team)",
    type: "Lineman Quick Response",
    phone: "+919447012345",
  },
  {
    id: "GANG-2",
    name: "Breakdown & Conductor Jointing Gang (Unit #2)",
    type: "Breakdown / Conductor Splice",
    phone: "+919846099881",
  },
  {
    id: "TREE-1",
    name: "Tree Trimming & Vegetation Clearance Unit",
    type: "Vegetation & Line Clearance",
    phone: "+919447055443",
  },
  {
    id: "DTR-TECH",
    name: "Substation & DTR Technical Crew (Transformers)",
    type: "Transformer Maintenance",
    phone: "+919447066772",
  },
];

export function getWhatsAppUrl(ticket: TroubleTicket, phone: string, customNotes?: string) {
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const mapsUrl = `https://maps.google.com/?q=${ticket.gps.lat.toFixed(6)},${ticket.gps.lng.toFixed(6)}`;

  const text = `🚨 *KSEB SCADA EMERGENCY FIELD DISPATCH* 🚨
*Ticket ID:* ${ticket.ticketId}
*Severity:* ${ticket.severity}
*Feeder Corridor:* ${ticket.feederName}
*Fault Type:* ${ticket.faultType}
*Target Pole:* ${ticket.affectedPole}
*Impacted Customers:* ~${ticket.estimatedCustomers} Metered Drops

📍 *GPS Navigation Route:* ${mapsUrl}

${customNotes ? `📝 *Operator Directive:* ${customNotes}\n` : ""}
⚠️ *MANDATORY SAFETY DIRECTIVE (CEA SEC 44):*
Physical line isolation and digital Permit-To-Work (PTW) must be verified before conductor contact.`;

  return `https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`;
}

export function getRemainingSoak(soakExpiresAt?: string): {
  minutes: number;
  seconds: number;
  isExpired: boolean;
  label: string;
} {
  if (!soakExpiresAt) return { minutes: 0, seconds: 0, isExpired: true, label: "00:00" };
  const diffMs = new Date(soakExpiresAt).getTime() - Date.now();
  if (diffMs <= 0) return { minutes: 0, seconds: 0, isExpired: true, label: "00:00" };
  const totalSec = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return {
    minutes,
    seconds,
    isExpired: false,
    label: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
  };
}

const DEFAULT_RESOLVED_INCIDENTS = [
  {
    ticketId: "INC-2026-0882",
    feederName: "Feeder LT-1 • Residential (10 Poles)",
    affectedPole: "Pole F1-P03 - F1-P04 Span",
    resolvedAt: "Today, 14:20 IST",
    faultType: "Vegetation Encroachment & Conductor Sway (ANSI 87L)",
    duration: "24m",
    crew: "Unit #4 (K. P. Rajesh)",
    action: "Tree branches pruned, PTW cleared, feeder re-energized.",
    ptwNumber: "PTW-415V-0882",
    status: "CLOSED",
  },
  {
    ticketId: "INC-2026-0841",
    feederName: "Feeder LT-2 • Commercial (11 Poles)",
    affectedPole: "Pole F2-P04 Lateral",
    resolvedAt: "Yesterday, 18:45 IST",
    faultType: "Shunt Neutral Insulation Degradation (ANSI 59N)",
    duration: "42m",
    crew: "Unit #4 (K. P. Rajesh)",
    action: "Neutral grounding conductor re-torqued, heat shrink applied.",
    ptwNumber: "PTW-415V-0841",
    status: "CLOSED",
  },
  {
    ticketId: "INC-2026-0795",
    feederName: "Distribution Substation DTR-01",
    affectedPole: "DTR-01 LV Incomer Bushing",
    resolvedAt: "Oct 17, 11:15 IST",
    faultType: "Thermal Hotspot & Loose Lug (ANSI 50/51)",
    duration: "35m",
    crew: "Substation Maintenance Unit",
    action: "Lug crimped, torque verified to 45 Nm, thermography clear.",
    ptwNumber: "PTW-DTR-0795",
    status: "CLOSED",
  },
];

export const WorkforceOmsPanel = React.memo(function WorkforceOmsPanel({
  tickets,
  onRefresh,
  isBreakerTripped = false,
  isFault = false,
  networkSnapshot,
  selectedPoleId,
  onSelectPole,
}: WorkforceOmsPanelProps) {
  const [selectedTicketId, setSelectedTicketId] = React.useState<string>(
    tickets[0]?.ticketId || ""
  );
  const [selectedDetectionKey, setSelectedDetectionKey] = React.useState<string | null>(null);
  const [repairNotes, setRepairNotes] = React.useState(
    "Conductor inspected. Vegetation cleared. Safe for re-energization."
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [simulatedTime, setSimulatedTime] = React.useState("09:41");
  const [localPtwIssued, setLocalPtwIssued] = React.useState(false);
  const [localStatus, setLocalStatus] = React.useState<string | null>(null);

  // Manual Dispatch Modal states
  const [isDispatchModalOpen, setIsDispatchModalOpen] = React.useState(false);
  const [selectedCrewId, setSelectedCrewId] = React.useState("QRU-4");
  const [customDispatchNotes, setCustomDispatchNotes] = React.useState(
    "Inspect conductor span, verify phase balance, and obtain digital PTW before line touch."
  );

  // Periodic tick for live soak countdown timer
  const [, setNowTick] = React.useState(Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  const [showCascade, setShowCascade] = React.useState(false);

  // Sync active detections from the 28-pole Digital Twin
  const activeDetections = React.useMemo(() => {
    return networkSnapshot?.detections || [];
  }, [networkSnapshot]);

  // Group root-cause events vs downstream sympathetic undervoltage sags
  const isCascadeSymptom = React.useCallback(
    (d: Detection) => d.ansi.includes("27") && d.severity !== "CRITICAL",
    []
  );

  const hasRootFault = React.useMemo(() => {
    return activeDetections.some((d) => !isCascadeSymptom(d));
  }, [activeDetections, isCascadeSymptom]);

  const primaryDetections = React.useMemo(() => {
    if (!hasRootFault) return activeDetections;
    return activeDetections.filter((d) => !isCascadeSymptom(d));
  }, [activeDetections, hasRootFault, isCascadeSymptom]);

  const cascadeDetections = React.useMemo(() => {
    if (!hasRootFault) return [];
    return activeDetections.filter((d) => isCascadeSymptom(d));
  }, [activeDetections, hasRootFault, isCascadeSymptom]);

  // Selected detection for dossier inspection
  const activeDetection = React.useMemo(() => {
    if (selectedDetectionKey) {
      return activeDetections.find((d) => d.key === selectedDetectionKey) || null;
    }
    return primaryDetections[0] || activeDetections[0] || null;
  }, [activeDetections, primaryDetections, selectedDetectionKey]);

  // Raw Active Ticket from database
  const rawActiveTicket = React.useMemo(() => {
    if (selectedTicketId) {
      const match = tickets.find((t) => t.ticketId === selectedTicketId);
      if (match) return match;
    }
    // Default to first open or watching ticket
    return (
      tickets.find(
        (t) =>
          t.status === "WATCHING" ||
          t.status === "ESCALATED" ||
          t.status === "DISPATCHED" ||
          t.status === "CREW_ON_SITE" ||
          t.status === "PTW_ISSUED"
      ) ||
      tickets[0] ||
      null
    );
  }, [tickets, selectedTicketId]);

  // Unified Effective Ticket
  const effectiveTicket: TroubleTicket | null = React.useMemo(() => {
    if (rawActiveTicket) return rawActiveTicket;
    if (activeDetection) {
      const targetNodeId = activeDetection.nodeId || activeDetection.sectionId || "F1-P01";
      const targetNode = networkSnapshot?.nodes.find((n) => n.id === targetNodeId);
      const topoNode = NODE_BY_ID[targetNodeId];
      const feederDef = networkSnapshot?.feeders.find((f) => f.id === activeDetection.feederId);
      const isBroken =
        activeDetection.ansi.includes("46BC") ||
        activeDetection.type.includes("BROKEN");

      return {
        ticketId: `FDIR-${activeDetection.ansi.replace(/\s+/g, "")}-${targetNodeId}`,
        createdAt: new Date().toISOString(),
        feederId: activeDetection.feederId || "LT-1",
        feederName: feederDef ? feederDef.name : `Feeder ${activeDetection.feederId || "LT-1"}`,
        affectedPole: targetNode ? `${targetNode.id} (${targetNode.label})` : targetNodeId,
        gps: topoNode ? { lat: topoNode.lat, lng: topoNode.lng } : { lat: 10.2318, lng: 76.4088 },
        faultType: `${activeDetection.ansi}: ${activeDetection.type}`,
        severity: activeDetection.severity,
        status: (localStatus as any) || (isBroken ? "ESCALATED" : "WATCHING"),
        assignedCrew: "Unassigned (Monitoring in Soak Watchlist)",
        assignedPhone: "+919447012345",
        estimatedCustomers: activeDetection.customersAffected ?? topoNode?.customers ?? 28,
        ptw: localPtwIssued
          ? {
              ptwNumber: "PTW-415V-DIGITAL-094",
              issuedTo: "K. P. Rajesh",
              issuedAt: new Date().toISOString(),
              lineIsolated: true,
              earthingConfirmed: true,
              reclosingInterlockActive: true,
            }
          : null,
        soakExpiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
        soakDurationMinutes: 15,
        safetyBypassTriggered: isBroken,
        workLog: [
          `FDIR Supervisory Alert: ${activeDetection.message}`,
          `FLISR Isolation: Upstream pole ${activeDetection.isolate?.upstream || "DTR-01"}, Downstream [${activeDetection.isolate?.downstream?.join(", ") || "Terminal"}]`,
          `GPS Dispatch Waypoint: ${topoNode ? `${topoNode.lat.toFixed(6)}°N, ${topoNode.lng.toFixed(6)}°E` : "10.2318°N, 76.4088°E"}`,
        ],
      };
    }
    return null;
  }, [rawActiveTicket, activeDetection, networkSnapshot, localPtwIssued, localStatus]);

  const hasActiveIncidents = Boolean(rawActiveTicket || activeDetection);

  // Manual Dispatch Action
  const handleConfirmManualDispatch = async () => {
    if (!effectiveTicket) return;
    setIsSubmitting(true);
    const chosenCrew = FIELD_CREWS.find((c) => c.id === selectedCrewId) || FIELD_CREWS[0];

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
      setLocalStatus("DISPATCHED");
      setIsDispatchModalOpen(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Manual dispatch error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Launch WhatsApp Dispatch Message
  const handleLaunchWhatsApp = (phone?: string) => {
    if (!effectiveTicket) return;
    const targetPhone = phone || effectiveTicket.assignedPhone || "+919447012345";
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
      setLocalStatus("ESCALATED");
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Escalate error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Flag as Scheduled Local Maintenance
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
          reason: "Scheduled Local Line & Vegetation Maintenance",
        }),
      });
      setLocalStatus("MAINTENANCE_SUPPRESSED");
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Maintenance flag error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (status: string, message: string) => {
    if (!effectiveTicket) return;
    setIsSubmitting(true);
    setLocalStatus(status);
    try {
      if (rawActiveTicket) {
        await fetch("/api/oms/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_status",
            ticketId: effectiveTicket.ticketId,
            status,
            message,
          }),
        });
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIssuePtw = async () => {
    if (!effectiveTicket) return;
    setIsSubmitting(true);
    setLocalPtwIssued(true);
    setLocalStatus("PTW_ISSUED");
    try {
      if (rawActiveTicket) {
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
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearPtw = async () => {
    if (!effectiveTicket) return;
    setIsSubmitting(true);
    setLocalPtwIssued(false);
    setLocalStatus("CLOSED");
    try {
      if (rawActiveTicket) {
        await fetch("/api/oms/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "clear_ptw",
            ticketId: effectiveTicket.ticketId,
            notes: repairNotes,
          }),
        });
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPtwActive =
    effectiveTicket?.ptw?.reclosingInterlockActive === true || localPtwIssued;

  const soakRemaining = getRemainingSoak(effectiveTicket?.soakExpiresAt);

  return (
    <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1012] rounded-sm flex flex-col h-full overflow-hidden text-xs font-mono shadow-sm relative">
      {/* 1. Global SCADA Header Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-zinc-800 px-3.5 py-2.5 bg-slate-50 dark:bg-zinc-950/80 gap-2">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-amber-500 dark:text-amber-400" />
          <span className="font-semibold uppercase tracking-wider text-slate-800 dark:text-zinc-100">
            OUTAGE MANAGEMENT SYSTEM (OMS) // TIERED SOAK &amp; MANUAL DISPATCH CONSOLE
          </span>
          <Badge
            variant={hasActiveIncidents ? "destructive" : "healthy"}
            className="text-[10px]"
          >
            {hasActiveIncidents
              ? `DISTRIBUTION OUTAGES: ${tickets.filter((t) => t.status !== "CLOSED").length + activeDetections.length}`
              : "FEEDER TOPOLOGY NORMAL // NO OUTAGES"}
          </Badge>
          {effectiveTicket?.status === "WATCHING" && (
            <Badge variant="warning" className="text-[10px] flex items-center gap-1 font-bold">
              <Clock className="h-3 w-3 animate-spin" />
              <span>SOAK WATCHLIST: {soakRemaining.label}</span>
            </Badge>
          )}
          {effectiveTicket?.status === "ESCALATED" && (
            <Badge variant="destructive" className="text-[10px] animate-pulse flex items-center gap-1 font-bold">
              <AlertTriangle className="h-3 w-3" />
              <span>ESCALATED: OPERATOR ACTION REQUIRED</span>
            </Badge>
          )}
        </div>

        {isPtwActive ? (
          <Badge variant="destructive" className="flex items-center gap-1 text-[10px] animate-pulse">
            <Lock className="h-3 w-3" />
            PTW SAFETY INTERLOCK ENGAGED // REMOTE RECLOSING INHIBITED (IEEE 1686 / CEA 44)
          </Badge>
        ) : (
          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-zinc-400">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span>SCADA SUPERVISORY CONTROL READY // RECLOSING PERMITTED</span>
          </div>
        )}
      </div>

      {/* 2. Three-Column SCADA Layout */}
      <div className="grid grid-cols-12 flex-1 min-h-[460px]">
        {/* ============================================================== */}
        {/* LEFT COLUMN: LIVE FDIR INCIDENTS & HISTORICAL QUEUE */}
        {/* ============================================================== */}
        <div className="col-span-12 lg:col-span-4 border-r border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800/80 pb-1.5">
            <div className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              {hasActiveIncidents ? "INCIDENTS & SOAK WATCHLIST" : "HISTORICAL RESOLVED INCIDENTS (ARCHIVE)"}
            </div>
            <Badge variant="outline" className="text-[9px]">
              {hasActiveIncidents
                ? `${tickets.length + primaryDetections.length} ACTIVE`
                : "ARCHIVE LOG"}
            </Badge>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[440px] pr-0.5">
            {/* Database Trouble Tickets */}
            {tickets.map((t) => {
              const isSelected = effectiveTicket?.ticketId === t.ticketId;
              const rem = getRemainingSoak(t.soakExpiresAt);
              return (
                <div
                  key={t.ticketId}
                  onClick={() => {
                    setSelectedTicketId(t.ticketId);
                    setSelectedDetectionKey(null);
                  }}
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
                          : t.status === "WATCHING"
                          ? "warning"
                          : t.status === "ESCALATED"
                          ? "destructive"
                          : t.status === "PTW_ISSUED"
                          ? "destructive"
                          : "default"
                      }
                      className="text-[9px] font-bold"
                    >
                      {t.status === "WATCHING" ? `SOAKING (${rem.label})` : t.status}
                    </Badge>
                  </div>

                  <div className="text-[11px] text-slate-700 dark:text-zinc-300 font-semibold mt-1">
                    {t.affectedPole}
                  </div>

                  <div className="text-[10px] text-slate-500 dark:text-zinc-500 flex justify-between mt-1">
                    <span>{t.feederName}</span>
                    <span>{new Date(t.createdAt).toLocaleTimeString()}</span>
                  </div>

                  {t.safetyBypassTriggered && (
                    <div className="mt-1 text-[9px] text-rose-500 font-bold flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      <span>SAFETY CRITICAL OVERRIDE (ANSI 46BC)</span>
                    </div>
                  )}

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
            })}

            {!hasActiveIncidents && (
              /* Resolved Incidents Archive */
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
        {/* CENTER COLUMN: INCIDENT DOSSIER & OPERATOR ACTION CONSOLE */}
        {/* ============================================================== */}
        <div className="col-span-12 lg:col-span-4 border-r border-slate-200 dark:border-zinc-800 p-3.5 flex flex-col justify-between space-y-3 bg-white dark:bg-[#0d0e11]">
          {effectiveTicket ? (
            <div className="space-y-3 overflow-y-auto max-h-[520px]">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2">
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                    <span>{effectiveTicket.ticketId}</span>
                    {effectiveTicket.safetyBypassTriggered && (
                      <span className="text-[9px] bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 px-1 py-0.2 rounded-xs font-bold">
                        SAFETY OVERRIDE
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                    REPORTED: {new Date(effectiveTicket.createdAt).toLocaleString()}
                  </div>
                </div>
                <Badge
                  variant={
                    effectiveTicket.status === "ESCALATED"
                      ? "destructive"
                      : effectiveTicket.status === "WATCHING"
                      ? "warning"
                      : "healthy"
                  }
                  className="text-[10px] font-bold"
                >
                  {effectiveTicket.status}
                </Badge>
              </div>

              {/* 1. SOAK OBSERVATION CARD (When WATCHING) */}
              {effectiveTicket.status === "WATCHING" && (
                <div className="border border-amber-500/40 bg-amber-500/10 p-2.5 rounded-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400 text-xs">
                      <Clock className="h-4 w-4 animate-spin text-amber-500" />
                      <span>TRANSIENT OUTAGE UNDER SOAK OBSERVATION</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-300">
                      {soakRemaining.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-600 dark:text-zinc-300">
                    Monitoring for automatic restoration or local reclose. If power restores within this window, the outage will auto-archive without paging field crews.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 text-[10px] px-2 font-bold"
                      onClick={handleEscalateEarly}
                      disabled={isSubmitting}
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      ESCALATE NOW (BYPASS SOAK)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2 border-slate-300 dark:border-zinc-700 font-bold"
                      onClick={handleFlagMaintenance}
                      disabled={isSubmitting}
                    >
                      <Wrench className="h-3 w-3 mr-1" />
                      FLAG AS PLANNED WORK
                    </Button>
                  </div>
                </div>
              )}

              {/* 2. ESCALATED CALL-TO-ACTION CARD (When ESCALATED) */}
              {effectiveTicket.status === "ESCALATED" && (
                <div className="border border-rose-500 bg-rose-500/10 p-2.5 rounded-sm space-y-2 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-400 text-xs">
                      <AlertTriangle className="h-4 w-4 text-rose-500 animate-bounce" />
                      <span>SUSTAINED OUTAGE // OPERATOR ACTION REQUIRED</span>
                    </div>
                    <Badge variant="destructive" className="text-[9px]">
                      {effectiveTicket.safetyBypassTriggered ? "SAFETY OVERRIDE" : "SOAK EXPIRED"}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-slate-600 dark:text-zinc-300">
                    {effectiveTicket.safetyBypassTriggered
                      ? "High-risk live broken conductor detected. Immediate manual lineman assignment required for public safety."
                      : "Outage persisted beyond configured soak period without restoration. Please assign and dispatch a field crew."}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      className="h-7 text-xs px-3 font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm"
                      onClick={() => setIsDispatchModalOpen(true)}
                    >
                      <UserCheck className="h-3.5 w-3.5 mr-1" />
                      ASSIGN &amp; DISPATCH FIELD CREW
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2 border-slate-300 dark:border-zinc-700 font-bold"
                      onClick={handleFlagMaintenance}
                    >
                      FLAG AS PLANNED
                    </Button>
                  </div>
                </div>
              )}

              {/* 3. DISPATCHED STATUS WITH WHATSAPP LINK */}
              {(effectiveTicket.status === "DISPATCHED" ||
                effectiveTicket.status === "CREW_ON_SITE" ||
                effectiveTicket.status === "PTW_ISSUED") && (
                <div className="border border-emerald-500/40 bg-emerald-500/10 p-2.5 rounded-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-1.5">
                      <UserCheck className="h-4 w-4" />
                      FIELD CREW ASSIGNED &amp; DISPATCHED
                    </span>
                    <Badge variant="healthy" className="text-[9px]">
                      {effectiveTicket.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-800 dark:text-zinc-200 font-bold">
                    {effectiveTicket.assignedCrew}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {effectiveTicket.assignedPhone}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => handleLaunchWhatsApp(effectiveTicket.assignedPhone)}
                      className="h-6 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1 shadow-xs cursor-pointer"
                    >
                      <MessageSquare className="h-3 w-3" />
                      SEND VIA WHATSAPP
                    </Button>
                  </div>
                </div>
              )}

              {/* Geographic & Technical Specs */}
              <div className="space-y-1.5 border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-2.5 rounded-sm">
                <div className="flex justify-between items-baseline border-b border-slate-200 dark:border-zinc-800/60 pb-1">
                  <span className="text-slate-500 dark:text-zinc-500">FEEDER:</span>
                  <span className="text-slate-800 dark:text-zinc-200 font-semibold">{effectiveTicket.feederName}</span>
                </div>
                <div className="flex justify-between items-baseline border-b border-slate-200 dark:border-zinc-800/60 pb-1">
                  <span className="text-slate-500 dark:text-zinc-500">FAULT CATEGORY:</span>
                  <span className="text-rose-600 dark:text-rose-400 font-bold">{effectiveTicket.faultType}</span>
                </div>
                <div className="flex justify-between items-baseline border-b border-slate-200 dark:border-zinc-800/60 pb-1">
                  <span className="text-slate-500 dark:text-zinc-500">AFFECTED POLE:</span>
                  <span className="text-slate-800 dark:text-zinc-200 font-bold">{effectiveTicket.affectedPole}</span>
                </div>
                <div className="flex justify-between items-baseline border-b border-slate-200 dark:border-zinc-800/60 pb-1">
                  <span className="text-slate-500 dark:text-zinc-500">GPS COORDINATES:</span>
                  <span className="text-cyan-600 dark:text-cyan-400 tabular-nums font-bold">
                    {effectiveTicket.gps.lat.toFixed(6)}°N, {effectiveTicket.gps.lng.toFixed(6)}°E
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500 dark:text-zinc-500">IMPACTED CONSUMERS:</span>
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">
                    ~{effectiveTicket.estimatedCustomers} Metered Drops
                  </span>
                </div>
              </div>

              {/* Event / Action Work Log */}
              <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/70 p-2.5 rounded-sm">
                <div className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  CHRONOLOGICAL AUDIT TRAIL
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto text-[10px] text-slate-600 dark:text-zinc-300">
                  {effectiveTicket.workLog.map((log, idx) => (
                    <div key={idx} className="border-b border-slate-200 dark:border-zinc-800/40 pb-0.5">
                      • {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Standby Status Summary Card */
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-100 uppercase tracking-wider">
                    FEEDER SAFETY &amp; PTW READINESS
                  </span>
                </div>
                <Badge variant="healthy" className="text-[9px]">
                  ALL CLEAR
                </Badge>
              </div>

              <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-950 p-2.5 rounded-sm space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold">
                  <span className="text-slate-500 dark:text-zinc-400 uppercase">FEEDER NETWORK SUPERVISION</span>
                  <Badge variant="healthy" className="text-[9px]">
                    28 POLES ONLINE
                  </Badge>
                </div>
                <div className="text-slate-800 dark:text-zinc-200 font-bold text-xs">
                  ANGAMALY 33/11kV DTR-01 • 3 RADIAL LT FEEDERS
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                  ANSI 87L Current Differential &amp; CEA Sec 44 Safety Regulation Active
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
          <div className="rounded-2xl border-2 border-slate-700/80 dark:border-zinc-700/80 bg-slate-900 shadow-xl overflow-hidden flex flex-col h-full text-zinc-100">
            {/* Phone Status Bar Header */}
            <div className="bg-black/90 px-3 py-1.5 flex items-center justify-between text-[10px] border-b border-zinc-800/80 shrink-0">
              <span className="font-bold tracking-tight text-white">{simulatedTime}</span>

              <div className="h-3 w-20 bg-zinc-950 rounded-full border border-zinc-800 flex items-center justify-center">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>

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
              <div>
                <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <Smartphone className="h-4 w-4 text-emerald-400" />
                    <div>
                      <div className="text-[11px] font-bold uppercase text-white tracking-wider">
                        KSEB FIELD LINEMAN APP
                      </div>
                      <div className="text-[8px] text-zinc-400 uppercase">
                        PERMIT-TO-WORK (PTW) // UNIT #4
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant={
                      effectiveTicket?.status === "DISPATCHED" || effectiveTicket?.status === "CREW_ON_SITE"
                        ? "destructive"
                        : "healthy"
                    }
                    className="text-[9px] py-0 px-1.5 font-bold"
                  >
                    {effectiveTicket?.status === "DISPATCHED"
                      ? "DISPATCHED"
                      : effectiveTicket?.status === "CREW_ON_SITE"
                      ? "ON SITE"
                      : effectiveTicket?.status === "PTW_ISSUED"
                      ? "PTW ACTIVE"
                      : "STANDBY"}
                  </Badge>
                </div>

                {/* Standby notice if not dispatched */}
                {(!effectiveTicket ||
                  effectiveTicket.status === "WATCHING" ||
                  effectiveTicket.status === "ESCALATED") && (
                  <div className="mb-2.5 p-2 bg-slate-800/80 border border-zinc-700 rounded-sm text-[10px] space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-amber-300">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {effectiveTicket?.status === "WATCHING"
                          ? "INCIDENT IN SOAK OBSERVATION"
                          : "AWAITING OPERATOR DISPATCH"}
                      </span>
                    </div>
                    <p className="text-[9px] text-zinc-400">
                      Field crew dispatch has not been authorized by the SCADA Operator. Action steps remain locked.
                    </p>
                  </div>
                )}

                {/* Active Dispatch banner */}
                {effectiveTicket &&
                  (effectiveTicket.status === "DISPATCHED" ||
                    effectiveTicket.status === "CREW_ON_SITE" ||
                    effectiveTicket.status === "PTW_ISSUED") && (
                    <div className="mb-2.5 p-2 bg-rose-950/40 border border-rose-800/60 rounded-sm text-[10px] text-rose-300 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 font-bold text-rose-200">
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                          <span>ACTIVE DISPATCH ASSIGNMENT</span>
                        </div>
                        <button
                          onClick={() => handleLaunchWhatsApp(effectiveTicket.assignedPhone)}
                          className="text-[9px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 underline font-bold"
                        >
                          <MessageSquare className="h-3 w-3" />
                          WhatsApp
                        </button>
                      </div>
                      <p className="text-[9px] text-zinc-300">
                        Target: <strong className="text-amber-300">{effectiveTicket.affectedPole}</strong>
                      </p>
                    </div>
                  )}

                {/* Lineman 3-Step Action Workflow */}
                <div className="space-y-2">
                  {/* STEP 1: Confirm Arrival */}
                  <div className="border border-zinc-800 bg-zinc-950/70 p-2 rounded-sm space-y-1.5">
                    <div className="text-[10px] font-bold text-zinc-200 uppercase flex items-center justify-between">
                      <span>STEP 1: DISPATCH ARRIVAL &amp; LINE VERIFICATION</span>
                      {effectiveTicket?.status !== "WATCHING" &&
                      effectiveTicket?.status !== "ESCALATED" &&
                      effectiveTicket?.status !== "DISPATCHED" ? (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                      ) : null}
                    </div>
                    <p className="text-[9px] text-zinc-400">
                      Field crew arrives at {effectiveTicket?.affectedPole || "faulted pole"} coordinates and verifies physical line clearance.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-[10px] h-7 bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-zinc-200 disabled:opacity-40 cursor-pointer"
                      disabled={effectiveTicket?.status !== "DISPATCHED" || isSubmitting}
                      onClick={() =>
                        handleUpdateStatus(
                          "CREW_ON_SITE",
                          `Field crew arrived on site at ${effectiveTicket?.affectedPole}. Starting visual line inspection.`
                        )
                      }
                    >
                      LOG ON-SITE ARRIVAL (GPS VERIFIED)
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
                        STEP 2: ISSUE DIGITAL PTW &amp; LOTO LOCKOUT
                      </span>
                      {isPtwActive ? (
                        <Badge variant="destructive" className="text-[8px] py-0 px-1 animate-pulse">
                          LOCKOUT ENGAGED
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-[9px] text-zinc-400">
                      Engages remote SCADA breaker lockout. Remote and local reclose is strictly inhibited under CEA Sec 44.
                    </p>

                    <Button
                      variant={isPtwActive ? "secondary" : "default"}
                      size="sm"
                      className={`w-full text-[10px] h-7 font-bold disabled:opacity-40 cursor-pointer ${
                        !isPtwActive && effectiveTicket?.status === "CREW_ON_SITE"
                          ? "bg-amber-600 hover:bg-amber-500 text-white"
                          : ""
                      }`}
                      disabled={effectiveTicket?.status !== "CREW_ON_SITE" || isPtwActive || isSubmitting}
                      onClick={handleIssuePtw}
                    >
                      <Lock className="h-3 w-3 mr-1" />
                      AUTHORIZE PTW &amp; ENGAGE SCADA LOCKOUT
                    </Button>
                  </div>

                  {/* STEP 3: Repair Clearance & PTW Sign-Off */}
                  <div className="border border-zinc-800 bg-zinc-950/70 p-2 rounded-sm space-y-1.5">
                    <div className="text-[10px] font-bold text-zinc-200 uppercase flex items-center justify-between">
                      <span>STEP 3: REPAIR COMPLETION &amp; PTW SURRENDER</span>
                    </div>
                    <input
                      type="text"
                      disabled={!isPtwActive}
                      className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-[10px] px-2 py-1 rounded-sm font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-40"
                      value={repairNotes}
                      onChange={(e) => setRepairNotes(e.target.value)}
                      placeholder="Enter repair clearance notes..."
                    />

                    <Button
                      size="sm"
                      className="w-full text-[10px] h-7 font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 cursor-pointer"
                      disabled={!isPtwActive || isSubmitting}
                      onClick={handleClearPtw}
                    >
                      <Unlock className="h-3 w-3 mr-1" />
                      SURRENDER PTW &amp; RESTORE FEEDER RECLOSE
                    </Button>
                  </div>
                </div>
              </div>

              {/* Phone Bottom Home Bar */}
              <div className="pt-2 border-t border-zinc-800 text-center">
                <div className="h-1 w-24 bg-zinc-600 rounded-full mx-auto" />
                <span className="text-[8px] text-zinc-500 mt-1 block">
                  KSEB FIELD WORKFORCE MOBILE CLIENT // CEA SEC 44 COMPLIANT
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* MANUAL OPERATOR DISPATCH MODAL                                 */}
      {/* ============================================================== */}
      {isDispatchModalOpen && effectiveTicket && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f1115] border border-slate-300 dark:border-zinc-700 rounded-sm w-full max-w-lg p-4 font-mono shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2">
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
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs px-1.5 py-0.5 border border-slate-300 dark:border-zinc-700 rounded-xs"
              >
                ✕
              </button>
            </div>

            {/* Incident Waypoint Box */}
            <div className="bg-slate-50 dark:bg-zinc-950 p-2.5 rounded-sm border border-slate-200 dark:border-zinc-800 text-xs space-y-1">
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
                {FIELD_CREWS.map((crew) => (
                  <div
                    key={crew.id}
                    onClick={() => setSelectedCrewId(crew.id)}
                    className={`p-2 rounded-sm border cursor-pointer flex items-center justify-between text-xs transition-all ${
                      selectedCrewId === crew.id
                        ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30 ring-1 ring-emerald-500"
                        : "border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 hover:border-slate-400"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-zinc-100">{crew.name}</div>
                      <div className="text-[10px] text-slate-500 dark:text-zinc-400">{crew.type}</div>
                    </div>
                    <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400">{crew.phone}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Operator Directives */}
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                Field Instructions / Safety Directive
              </label>
              <textarea
                rows={2}
                value={customDispatchNotes}
                onChange={(e) => setCustomDispatchNotes(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-sm p-2 text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-emerald-500"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const chosenCrew = FIELD_CREWS.find((c) => c.id === selectedCrewId) || FIELD_CREWS[0];
                  handleLaunchWhatsApp(chosenCrew.phone);
                }}
                className="border-emerald-600 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-bold gap-1.5"
              >
                <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                <span>OPEN IN WHATSAPP</span>
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDispatchModalOpen(false)}
                  className="text-xs border-slate-300 dark:border-zinc-700"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmManualDispatch}
                  disabled={isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5 shadow-sm"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{isSubmitting ? "DISPATCHING..." : "CONFIRM DISPATCH"}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
