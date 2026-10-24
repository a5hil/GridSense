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
  Clock,
  CornerDownRight,
  Crosshair,
  ExternalLink,
  FileText,
  GitBranch,
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

  // Sync active detections from the 28-pole Digital Twin
  const activeDetections = React.useMemo(() => {
    return networkSnapshot?.detections || [];
  }, [networkSnapshot]);

  // Sync selected ticket or detection
  React.useEffect(() => {
    if (!selectedTicketId && tickets.length > 0) {
      setSelectedTicketId(tickets[0].ticketId);
    }
  }, [tickets, selectedTicketId]);

  // Find explicit ticket from DB
  const rawActiveTicket = tickets.find((t) => t.ticketId === selectedTicketId) || tickets[0] || null;

  // Selected detection if operator clicked a detection card
  const activeDetection = React.useMemo(() => {
    if (selectedDetectionKey) {
      return activeDetections.find((d) => d.key === selectedDetectionKey) || activeDetections[0] || null;
    }
    return activeDetections[0] || null;
  }, [activeDetections, selectedDetectionKey]);

  // Unified Effective Ticket: combines database ticket with live FDIR detection
  const effectiveTicket: TroubleTicket | null = React.useMemo(() => {
    if (rawActiveTicket) return rawActiveTicket;
    if (activeDetection) {
      const targetNodeId = activeDetection.nodeId || activeDetection.sectionId || "F1-P01";
      const targetNode = networkSnapshot?.nodes.find((n) => n.id === targetNodeId);
      const topoNode = NODE_BY_ID[targetNodeId];
      const feederDef = networkSnapshot?.feeders.find((f) => f.id === activeDetection.feederId);
      return {
        ticketId: `FDIR-${activeDetection.ansi.replace(/\s+/g, "")}-${targetNodeId}`,
        createdAt: new Date().toISOString(),
        feederId: activeDetection.feederId || "LT-1",
        feederName: feederDef ? feederDef.name : `Feeder ${activeDetection.feederId || "LT-1"}`,
        affectedPole: targetNode ? `${targetNode.id} (${targetNode.label})` : targetNodeId,
        gps: topoNode ? { lat: topoNode.lat, lng: topoNode.lng } : { lat: 10.2318, lng: 76.4088 },
        faultType: `${activeDetection.ansi}: ${activeDetection.type}`,
        severity: activeDetection.severity,
        status: (localStatus as any) || "DISPATCHED",
        assignedCrew: "Lineman Quick-Response Unit #4 (K. P. Rajesh)",
        assignedPhone: "+91 94470 12345",
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

  // Auto-dispatch ticket to backend SQLite database
  const handleAutoDispatch = async (det: Detection) => {
    setIsSubmitting(true);
    try {
      const targetNodeId = det.nodeId || det.sectionId || "F1-P01";
      const targetNode = networkSnapshot?.nodes.find((n) => n.id === targetNodeId);
      const topoNode = NODE_BY_ID[targetNodeId];
      const gps = topoNode ? { lat: topoNode.lat, lng: topoNode.lng } : { lat: 10.2318, lng: 76.4088 };
      const feederDef = networkSnapshot?.feeders.find((f) => f.id === det.feederId);

      await fetch("/api/oms/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_ticket",
          faultCode: `${det.ansi}: ${det.type}`,
          affectedPole: targetNode ? `${targetNode.id} (${targetNode.label})` : targetNodeId,
          gps,
          idiff: det.value || 0.45,
          severity: det.severity,
          feederId: det.feederId || "LT-1",
          feederName: feederDef ? feederDef.name : `Feeder ${det.feederId || "LT-1"}`,
          estimatedCustomers: det.customersAffected ?? topoNode?.customers ?? 35,
        }),
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Auto dispatch error:", err);
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

  // Active target node from snapshot
  const activeNode = React.useMemo(() => {
    if (!networkSnapshot || !effectiveTicket) return null;
    const rawTarget = effectiveTicket.affectedPole.split(" ")[0].trim();
    return (
      networkSnapshot.nodes.find(
        (n) => n.id.toLowerCase() === rawTarget.toLowerCase()
      ) || null
    );
  }, [networkSnapshot, effectiveTicket]);

  return (
    <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1012] rounded-sm flex flex-col h-full overflow-hidden text-xs font-mono shadow-sm">
      {/* 1. Global SCADA Header Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-zinc-800 px-3.5 py-2.5 bg-slate-50 dark:bg-zinc-950/80 gap-2">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-amber-500 dark:text-amber-400" />
          <span className="font-semibold uppercase tracking-wider text-slate-800 dark:text-zinc-100">
            OUTAGE MANAGEMENT SYSTEM (OMS) // FLISR &amp; LINEMAN DISPATCH
          </span>
          <Badge
            variant={hasActiveIncidents ? "destructive" : "healthy"}
            className="text-[10px]"
          >
            {hasActiveIncidents
              ? `ACTIVE INCIDENTS: ${tickets.filter((t) => t.status !== "CLOSED").length + activeDetections.length}`
              : "ALL FEEDERS HEALTHY"}
          </Badge>
          {activeDetections.length > 0 && (
            <Badge variant="warning" className="text-[10px] animate-pulse flex items-center gap-1">
              <Activity className="h-3 w-3" />
              <span>{activeDetections.length} FDIR FAULT(S) DETECTED</span>
            </Badge>
          )}
        </div>

        {isPtwActive ? (
          <Badge variant="destructive" className="flex items-center gap-1 text-[10px] animate-pulse">
            <Lock className="h-3 w-3" />
            SAFETY INTERLOCK ACTIVE (RECLOSING LOCKED // IEEE 1686)
          </Badge>
        ) : (
          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-zinc-400">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span>SCADA RECLOSER READY // NO LOCKOUT</span>
          </div>
        )}
      </div>

      {/* 2. Dynamic FLISR Isolation & Backfeed Strategy Bar (Visible during active fault) */}
      {activeDetections.length > 0 && (
        <div className="bg-rose-500/10 border-b border-rose-500/30 px-3.5 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-500 animate-bounce" />
            <span className="font-bold text-rose-700 dark:text-rose-400">
              FLISR AUTOMATED ISOLATION MATRIX:
            </span>
            <span className="text-slate-700 dark:text-zinc-300">
              Fault at <strong className="text-rose-600 dark:text-rose-400">{activeDetection?.nodeId || activeDetection?.sectionId}</strong> on Feeder <strong className="text-cyan-600 dark:text-cyan-400">{activeDetection?.feederId}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-zinc-400">
              <span>UPSTREAM CUT:</span>
              <span className="bg-rose-500/20 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded-xs font-bold border border-rose-500/40">
                {activeDetection?.isolate?.upstream || "DTR-01 ACB"}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-zinc-400">
              <span>ISOLATED CUSTOMERS:</span>
              <span className="text-amber-600 dark:text-amber-400 font-bold">
                ~{activeDetection?.customersAffected ?? 28} Consumers
              </span>
            </div>

            {activeDetection && !rawActiveTicket && (
              <Button
                size="sm"
                variant="destructive"
                className="h-6 text-[10px] px-2.5 font-bold"
                disabled={isSubmitting}
                onClick={() => handleAutoDispatch(activeDetection)}
              >
                DISPATCH LINEMAN CREW
              </Button>
            )}

            {activeDetection && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] px-2.5 border-slate-300 dark:border-zinc-700 font-bold"
                onClick={() => onSelectPole?.(activeDetection.nodeId || activeDetection.sectionId || "F1-P01")}
              >
                INSPECT POLE
              </Button>
            )}
          </div>
        </div>
      )}

      {/* 3. Three-Column SCADA Layout */}
      <div className="grid grid-cols-12 flex-1 min-h-[460px]">
        {/* ============================================================== */}
        {/* LEFT COLUMN: LIVE FDIR INCIDENTS & HISTORICAL QUEUE */}
        {/* ============================================================== */}
        <div className="col-span-12 lg:col-span-4 border-r border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800/80 pb-1.5">
            <div className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              {hasActiveIncidents ? "DISTRIBUTION TROUBLE INCIDENTS" : "RECENT RESOLVED INCIDENTS"}
            </div>
            <Badge variant="outline" className="text-[9px]">
              {hasActiveIncidents ? `${tickets.length + activeDetections.length} ACTIVE` : "ARCHIVE LOG"}
            </Badge>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[440px] pr-0.5">
            {/* Live FDIR Detections from Digital Twin Network */}
            {activeDetections.map((d) => {
              const isSelected = activeDetection?.key === d.key;
              const targetNode = networkSnapshot?.nodes.find((n) => n.id === (d.nodeId || d.sectionId));
              return (
                <div
                  key={d.key}
                  onClick={() => setSelectedDetectionKey(d.key)}
                  className={`border p-2.5 rounded-sm cursor-pointer transition-all ${
                    isSelected
                      ? "border-rose-500 bg-rose-500/10 shadow-sm ring-1 ring-rose-500/50"
                      : "border-rose-500/40 bg-white dark:bg-zinc-950/60 hover:bg-rose-500/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                      <span className="font-bold text-rose-600 dark:text-rose-400">
                        {d.ansi} FAULT
                      </span>
                    </div>
                    <Badge variant="destructive" className="text-[9px]">
                      {d.severity}
                    </Badge>
                  </div>

                  <div className="text-[11px] text-slate-800 dark:text-zinc-200 font-bold mt-1 flex items-center justify-between">
                    <span>{d.nodeId || d.sectionId} ({d.feederId})</span>
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">
                      ~{d.customersAffected ?? NODE_BY_ID[d.nodeId || d.sectionId || ""]?.customers ?? 24} Cust
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-600 dark:text-zinc-400 mt-1">
                    {d.message}
                  </div>

                  <div className="mt-1.5 pt-1 border-t border-slate-200 dark:border-zinc-800/80 flex items-center justify-between text-[10px]">
                    <span className="text-cyan-600 dark:text-cyan-400 font-semibold">
                      ISOLATE: {d.isolate?.upstream || "DTR-01"}
                    </span>
                    <span className="text-rose-600 dark:text-rose-400 font-bold">
                      [UNRESOLVED]
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Database Trouble Tickets */}
            {tickets.map((t) => {
              const isSelected = effectiveTicket?.ticketId === t.ticketId;
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
        {/* CENTER COLUMN: INCIDENT DOSSIER & FLISR ISOLATION MATRIX */}
        {/* ============================================================== */}
        <div className="col-span-12 lg:col-span-4 border-r border-slate-200 dark:border-zinc-800 p-3.5 flex flex-col justify-between space-y-3 bg-white dark:bg-[#0d0e11]">
          {effectiveTicket ? (
            <div className="space-y-3 overflow-y-auto max-h-[520px]">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2">
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                    <span>{effectiveTicket.ticketId}</span>
                    {activeDetection && (
                      <span className="text-[9px] bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 px-1 py-0.2 rounded-xs font-bold">
                        LIVE FDIR
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                    REPORTED: {new Date(effectiveTicket.createdAt).toLocaleString()}
                  </div>
                </div>
                <Badge
                  variant={effectiveTicket.severity === "CRITICAL" ? "trip" : "warning"}
                  className="text-[10px]"
                >
                  SEV: {effectiveTicket.severity}
                </Badge>
              </div>

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

              {/* FLISR Automated Isolation Protocol */}
              <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/70 p-2.5 rounded-sm space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 dark:text-zinc-200 border-b border-slate-200 dark:border-zinc-800 pb-1">
                  <span className="flex items-center gap-1.5">
                    <Split className="h-3.5 w-3.5 text-cyan-500" />
                    FLISR ISOLATION &amp; BACKFEED PLAN
                  </span>
                  <span className="text-[9px] text-cyan-600 dark:text-cyan-400">IEEE 1686</span>
                </div>

                <div className="space-y-1.5 text-[10px]">
                  <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-1.5 rounded-xs border border-slate-200 dark:border-zinc-800">
                    <span className="text-slate-500 dark:text-zinc-400">1. UPSTREAM SECTIONALIZER:</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400">
                      {activeDetection?.isolate?.upstream || "DTR-01 ACB"} [TRIP &amp; LOTO]
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-1.5 rounded-xs border border-slate-200 dark:border-zinc-800">
                    <span className="text-slate-500 dark:text-zinc-400">2. DOWNSTREAM BOUNDARY:</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {activeDetection?.isolate?.downstream?.join(", ") || "Radial End"} [ISOLATED]
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-1.5 rounded-xs border border-slate-200 dark:border-zinc-800">
                    <span className="text-slate-500 dark:text-zinc-400">3. HEALTHY BACKFEED:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      Upstream Feeder Intact
                    </span>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-[10px] h-6 font-bold border-cyan-500/40 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10"
                  onClick={() => onSelectPole?.(activeDetection?.nodeId || activeDetection?.sectionId || "F1-P01")}
                >
                  <Crosshair className="h-3 w-3 mr-1" />
                  LOCATE POLE ON SINGLE-LINE DIAGRAM
                </Button>
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
                  {effectiveTicket.assignedCrew}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3 text-slate-400 dark:text-zinc-500" />
                    {effectiveTicket.assignedPhone}
                  </span>
                  <a
                    href={`https://www.google.com/maps?q=${effectiveTicket.gps.lat},${effectiveTicket.gps.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-bold"
                  >
                    <Navigation className="h-3 w-3" />
                    GPS ROUTE
                  </a>
                </div>
              </div>

              {/* Event / Action Work Log */}
              <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/70 p-2.5 rounded-sm">
                <div className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  CHRONOLOGICAL AUDIT TRAIL
                </div>
                <div className="space-y-1 max-h-24 overflow-y-auto text-[10px] text-slate-600 dark:text-zinc-300">
                  {effectiveTicket.workLog.map((log, idx) => (
                    <div key={idx} className="border-b border-slate-200 dark:border-zinc-800/40 pb-0.5">
                      • {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Standby Status Summary Card (0 Active Incidents) */
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
                  ANSI 87L Current Differential &amp; IEC 61000 Power Quality Supervision
                </div>
              </div>

              <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-950 p-2.5 rounded-sm space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold">
                  <span className="text-slate-500 dark:text-zinc-400 uppercase">PTW SAFETY INTERLOCK MATRIX</span>
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
                        KSEB SMART LINEMAN
                      </div>
                      <div className="text-[8px] text-zinc-400 uppercase">
                        FIELD CREW AUTOMATION // CREW #4
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant={hasActiveIncidents ? "destructive" : "healthy"}
                    className="text-[9px] py-0 px-1.5"
                  >
                    {hasActiveIncidents ? "DISPATCH ACTIVE" : "STANDBY"}
                  </Badge>
                </div>

                {!hasActiveIncidents ? (
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
                      Target: <strong className="text-amber-300">{effectiveTicket?.affectedPole}</strong> • GPS: {effectiveTicket?.gps.lat.toFixed(4)}°N, {effectiveTicket?.gps.lng.toFixed(4)}°E
                    </p>
                  </div>
                )}

                {/* Lineman 3-Step Action Workflow */}
                <div className="space-y-2">
                  {/* STEP 1: Confirm Arrival */}
                  <div className="border border-zinc-800 bg-zinc-950/70 p-2 rounded-sm space-y-1.5">
                    <div className="text-[10px] font-bold text-zinc-200 uppercase flex items-center justify-between">
                      <span>STEP 1: FIELD CREW ARRIVAL</span>
                      {hasActiveIncidents && effectiveTicket?.status !== "DISPATCHED" ? (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                      ) : null}
                    </div>
                    <p className="text-[9px] text-zinc-400">
                      Field crew arrives at {effectiveTicket?.affectedPole || "faulted pole"} coordinates and verifies physical line clearance.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-[10px] h-7 bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-zinc-200 disabled:opacity-40"
                      disabled={!hasActiveIncidents || effectiveTicket?.status !== "DISPATCHED" || isSubmitting}
                      onClick={() =>
                        handleUpdateStatus(
                          "CREW_ON_SITE",
                          `Field crew arrived on site at ${effectiveTicket?.affectedPole}. Starting visual line inspection.`
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
                        STEP 2: ISSUE DIGITAL PTW &amp; LOTO
                      </span>
                      {isPtwActive ? (
                        <Badge variant="destructive" className="text-[8px] py-0 px-1 animate-pulse">
                          LOCKOUT ENGAGED
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-[9px] text-zinc-400">
                      Engages remote SCADA lockout at upstream sectionalizer {activeDetection?.isolate?.upstream || "switch"}. Remote reclose is strictly blocked.
                    </p>

                    <Button
                      variant={isPtwActive ? "secondary" : "amber"}
                      size="sm"
                      className="w-full text-[10px] h-7 font-bold disabled:opacity-40"
                      disabled={
                        !hasActiveIncidents ||
                        effectiveTicket?.status !== "CREW_ON_SITE" ||
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
                      disabled={!hasActiveIncidents || !isPtwActive}
                      className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-[10px] px-2 py-1 rounded-sm font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-40"
                      value={repairNotes}
                      onChange={(e) => setRepairNotes(e.target.value)}
                      placeholder="Enter repair clearance notes..."
                    />

                    <Button
                      variant="emerald"
                      size="sm"
                      className="w-full text-[10px] h-7 font-bold disabled:opacity-40"
                      disabled={!hasActiveIncidents || !isPtwActive || isSubmitting}
                      onClick={handleClearPtw}
                    >
                      <Unlock className="h-3 w-3 mr-1" />
                      SIGN-OFF CLEARANCE &amp; RESTORE SERVICE
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
});
