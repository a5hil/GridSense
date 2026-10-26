"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  GitBranch,
  Layers,
  Lock,
  Power,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GridTelemetry } from "@/lib/types";
import { NetworkSnapshot, NodeState } from "@/lib/network/types";
import { ENTERPRISE_CONFIG } from "@/lib/constants";

interface SingleLinePowerFlowProps {
  telemetry: GridTelemetry | null;
  networkSnapshot?: NetworkSnapshot | null;
  selectedPoleId?: string;
  onSelectPole?: (poleId: string) => void;
}

export const SingleLinePowerFlow = React.memo(function SingleLinePowerFlow({
  telemetry,
  networkSnapshot,
  selectedPoleId,
  onSelectPole,
}: SingleLinePowerFlowProps) {
  // View Scope: Feeder LT-1 (Residential & Live Anchor Span), LT-2, or LT-3
  const [viewScope, setViewScope] = React.useState<"LT-1" | "LT-2" | "LT-3">("LT-1");

  // Auto-synchronize feeder tab if user selects a pole belonging to another feeder
  React.useEffect(() => {
    if (!selectedPoleId) return;
    const upper = selectedPoleId.toUpperCase();
    if (upper.startsWith("F1") || upper === "POLE-A" || upper === "POLE-B" || upper === "P1" || upper === "P2") {
      setViewScope("LT-1");
    } else if (upper.startsWith("F2")) {
      setViewScope("LT-2");
    } else if (upper.startsWith("F3")) {
      setViewScope("LT-3");
    }
  }, [selectedPoleId]);

  const selectedNode = React.useMemo(() => {
    if (!networkSnapshot || !selectedPoleId) return null;
    const target = selectedPoleId.trim().toLowerCase();
    const normalizeId = (id: string) => id.toLowerCase().replace(/([a-z0-9]+)-p0?(\d+)/i, "$1-p$2");
    const targetNorm = normalizeId(target);

    return (
      networkSnapshot.nodes.find((n) => {
        const nId = n.id.toLowerCase();
        if (nId === target) return true;
        if (normalizeId(nId) === targetNorm) return true;
        if (
          (target === "pole-a" || target === "pole 1" || target === "p1" || target === "f1-p01" || target === "f1-p1") &&
          (nId === "f1-p01" || nId === "pole-a")
        ) return true;
        if (
          (target === "pole-b" || target === "pole 2" || target === "p2" || target === "f1-p02" || target === "f1-p2") &&
          (nId === "f1-p02" || nId === "pole-b")
        ) return true;
        return false;
      }) || null
    );
  }, [networkSnapshot, selectedPoleId]);

  const isGatewayOffline =
    telemetry?.status === "DISCONNECTED" ||
    telemetry?.status === "WAITING_DATA" ||
    telemetry?.fault_code === "GATEWAY_DISCONNECTED";

  const idiff = isGatewayOffline ? 0.0 : (telemetry?.idiff ?? 0.0);
  const tripLimit = telemetry?.trip_limit ?? 0.35;

  // Real, physical hardware measurements directly from PZEM-004T sensors
  const v1 = isGatewayOffline ? 0.0 : (telemetry?.p1?.v ?? 0.0);
  const i1 = isGatewayOffline ? 0.0 : (telemetry?.p1?.i ?? 0.0);
  const p1 = isGatewayOffline ? 0.0 : (telemetry?.p1?.p ?? 0.0);
  const pf1 = isGatewayOffline ? 0.0 : (telemetry?.p1?.pf ?? 0.96);
  const freq1 = isGatewayOffline ? 0.0 : (telemetry?.p1?.freq ?? 50.0);

  const v2 = isGatewayOffline ? 0.0 : (telemetry?.p2?.v ?? 0.0);
  const i2 = isGatewayOffline ? 0.0 : (telemetry?.p2?.i ?? 0.0);
  const p2 = isGatewayOffline ? 0.0 : (telemetry?.p2?.p ?? 0.0);
  const pf2 = isGatewayOffline ? 0.0 : (telemetry?.p2?.pf ?? 0.95);
  const freq2 = isGatewayOffline ? 0.0 : (telemetry?.p2?.freq ?? 50.0);

  const isPowerCut = !isGatewayOffline && (telemetry?.fault_code === "POWERCUT" || (v1 < 50.0 && v2 < 50.0));
  const isDifferentialFault = !isGatewayOffline && !isPowerCut && (telemetry?.fault_code === "DIFF_LEAKAGE" || idiff >= tripLimit);
  const isBrokenConductor = !isGatewayOffline && telemetry?.fault_code === "BROKEN_CONDUCTOR";
  const isBrokenNeutral = !isGatewayOffline && telemetry?.fault_code === "BROKEN_NEUTRAL";
  const isOvercurrent = !isGatewayOffline && telemetry?.fault_code === "OVERCURRENT";
  const isLastGasp = !isGatewayOffline && telemetry?.fault_code === "OUTAGE_LAST_GASP";
  const isPoleOffline = !isGatewayOffline && telemetry?.fault_code === "POLE_OFFLINE";
  const isFault = isDifferentialFault || isBrokenConductor || isBrokenNeutral || isOvercurrent || isLastGasp;

  const isP1Stale = isGatewayOffline || (telemetry?.p1?.age_ms ?? 0) > 20000;
  const isP2Stale = isGatewayOffline || (telemetry?.p2?.age_ms ?? 0) > 20000;
  const isP2Offline = isGatewayOffline || (telemetry?.p2 ? (!telemetry.p2.isOnline || (telemetry.p2.age_ms ?? 0) > 10000) : true);

  // Feeder Nodes & Summary
  const feederNodes: NodeState[] = React.useMemo(() => {
    if (!networkSnapshot) return [];
    return networkSnapshot.nodes.filter((n) => n.feederId === viewScope);
  }, [networkSnapshot, viewScope]);

  const feederSummary = React.useMemo(() => {
    if (!networkSnapshot) return null;
    return networkSnapshot.feeders.find((f) => f.id === viewScope) || null;
  }, [networkSnapshot, viewScope]);

  const feederDetections = React.useMemo(() => {
    if (!networkSnapshot) return [];
    return networkSnapshot.detections.filter((d) => d.feederId === viewScope);
  }, [networkSnapshot, viewScope]);

  const isFeederFaulted = feederDetections.length > 0 || (viewScope === "LT-1" && isFault);

  return (
    <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm p-4 flex flex-col gap-3 font-mono transition-colors shadow-xs dark:shadow-none">
      {/* Header Bar with Feeder Scope Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-100">
            FEEDER POWER FLOW &amp; LINE INTEGRITY // SINGLE-LINE DIAGRAM (SLD)
          </h2>
        </div>

        {/* View Scope Tabs: Unified Feeder Selection */}
        <div className="flex items-center bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-sm p-0.5 text-xs">
          <button
            onClick={() => setViewScope("LT-1")}
            className={`px-2.5 py-1 text-[10px] uppercase font-bold rounded-xs transition-colors flex items-center gap-1.5 ${
              viewScope === "LT-1"
                ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 border border-slate-300 dark:border-zinc-700 shadow-xs"
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
            }`}
          >
            <Radio className="h-3 w-3" />
            <span>FEEDER LT-1</span>
            <span className="text-[9px] opacity-75">(10 POLES)</span>
          </button>
          <button
            onClick={() => setViewScope("LT-2")}
            className={`px-2.5 py-1 text-[10px] uppercase font-bold rounded-xs transition-colors flex items-center gap-1 ${
              viewScope === "LT-2"
                ? "bg-white dark:bg-zinc-800 text-cyan-600 dark:text-cyan-400 border border-slate-300 dark:border-zinc-700 shadow-xs"
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
            }`}
          >
            <span>FEEDER LT-2</span>
            <span className="text-[9px] opacity-75">(11 POLES)</span>
          </button>
          <button
            onClick={() => setViewScope("LT-3")}
            className={`px-2.5 py-1 text-[10px] uppercase font-bold rounded-xs transition-colors flex items-center gap-1 ${
              viewScope === "LT-3"
                ? "bg-white dark:bg-zinc-800 text-purple-600 dark:text-purple-400 border border-slate-300 dark:border-zinc-700 shadow-xs"
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
            }`}
          >
            <span>FEEDER LT-3</span>
            <span className="text-[9px] opacity-75">(7 POLES)</span>
          </button>
        </div>

        {/* Global Feeder Status Badge */}
        <div className="flex items-center gap-2 text-xs">
          {viewScope === "LT-1" && isFault ? (
            <Badge
              variant="destructive"
              className="flex items-center gap-1.5 py-0.5 text-[10px] animate-pulse"
            >
              <AlertTriangle className="h-3 w-3" />
              <span>LT-1 PROTECTION TRIP ({telemetry?.fault_code || "LEAKAGE"})</span>
            </Badge>
          ) : isFeederFaulted ? (
            <Badge
              variant="destructive"
              className="flex items-center gap-1.5 py-0.5 text-[10px] animate-pulse"
            >
              <AlertTriangle className="h-3 w-3" />
              <span>{viewScope} FAULT ({feederDetections.length} ANOMALIES)</span>
            </Badge>
          ) : (
            <Badge
              variant="healthy"
              className="flex items-center gap-1.5 py-0.5 text-[10px]"
            >
              <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span>{viewScope} RADIAL LINE HEALTHY (100% BALANCED)</span>
            </Badge>
          )}
          <span className="text-slate-500 dark:text-zinc-500 text-[11px]">
            {feederSummary
              ? `${feederSummary.name} • ${feederNodes.length} POLES`
              : "230V/415V LT RADIAL"}
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* UNIFIED RADIAL FEEDER PIPELINE (LT-1 [LIVE ANCHOR], LT-2, LT-3) */}
      {/* ========================================================================= */}
      <div className="relative py-2 overflow-x-auto">
          <div className="min-w-[1200px] flex items-stretch gap-2.5">
            {/* 1. Substation */}
            <div className="w-[125px] shrink-0 border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 p-2.5 rounded-sm flex flex-col justify-between text-center shadow-inner">
              <div>
                <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 dark:text-zinc-400 font-semibold uppercase">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                  <span>SUBSTATION</span>
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-zinc-200 mt-1">
                  {ENTERPRISE_CONFIG.SUBSTATION_SHORT}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400">33/11kV</div>
              </div>
              <div className="text-[9px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xs py-0.5 mt-2">
                11kV BUS
              </div>
            </div>

            {/* Cable arrow */}
            <div className="w-[35px] shrink-0 flex flex-col items-center justify-center">
              <div className="w-full flex items-center">
                <div className="h-[2px] w-full bg-emerald-500/60 relative overflow-hidden">
                  <div className="absolute inset-0 bg-emerald-500 dark:bg-emerald-400 w-1/3 animate-pulse" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 -ml-1 shrink-0" />
              </div>
            </div>

            {/* 2. DTR-01 */}
            <div className="w-[135px] shrink-0 border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 p-2.5 rounded-sm flex flex-col justify-between text-center">
              <div>
                <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 dark:text-zinc-400 font-semibold uppercase">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                  <span>DTR-01</span>
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-zinc-200 mt-0.5">
                  {networkSnapshot ? `${networkSnapshot.dtr.kva.toFixed(1)} kVA` : "250 kVA"}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                  LOAD: {networkSnapshot ? `${networkSnapshot.dtr.loadingPct}%` : "17%"}
                </div>
              </div>
              <div className="text-[9px] text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xs py-0.5 mt-1">
                415V 3-PHASE
              </div>
            </div>

            {/* Feeder Bus Arrow */}
            <div className="w-[35px] shrink-0 flex flex-col items-center justify-center">
              <div className="w-full flex items-center">
                <div className="h-[2px] w-full bg-emerald-500/60 relative overflow-hidden">
                  <div className="absolute inset-0 bg-emerald-500 dark:bg-emerald-400 w-1/3 animate-pulse" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 -ml-1 shrink-0" />
              </div>
            </div>

            {/* 3. Feeder Breaker / Incomer Bus */}
            <div className="w-[145px] shrink-0 border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 p-2.5 rounded-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[10px] pb-1 border-b border-slate-200 dark:border-zinc-800/60">
                  <span className="text-slate-800 dark:text-zinc-200 font-bold uppercase">{viewScope} BUSBAR</span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isFeederFaulted ? "bg-rose-500 animate-pulse" : "bg-emerald-500 dark:bg-emerald-400"
                    }`}
                  />
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-zinc-100 mt-1 tabular-nums">
                  {feederSummary ? `${feederSummary.kw.toFixed(1)} kW` : "--- kW"}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                  CURRENT: {feederSummary ? `${feederSummary.headCurrent.R.toFixed(1)}A (R)` : "---"}
                </div>
              </div>
              <div className="text-[9px] text-center font-bold uppercase py-0.5 rounded-xs mt-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
                RADIAL FEEDER
              </div>
            </div>

            {/* Series Radial Pole Nodes in this Feeder */}
            {feederNodes.map((node, index) => {
              const isSelected = selectedPoleId?.toLowerCase() === node.id.toLowerCase();
              const isNodeTripped = node.status === "ALARM";
              const isNodeWarn = node.status === "WARN";
              const isNodeDeenergized = node.status === "DEENERGIZED" || !node.energized || isPowerCut;

              // Check if span to this node has a detection or tripped section
              const spanDetection = networkSnapshot?.detections.find(
                (d) => d.nodeId === node.id || d.sectionId === node.parentId
              );
              const isSpanTripped = spanDetection !== undefined;
              const isLiveSpan = viewScope === "LT-1" && (node.id === "F1-P02" || node.id === "POLE-B");
              const isP1 = node.id === "F1-P01" || node.id === "POLE-A";
              const isP2 = node.id === "F1-P02" || node.id === "POLE-B";
              const liveV = isP1 ? (v1 > 0 ? v1 : node.phases.R.v) : isP2 ? (v2 > 0 ? v2 : node.phases.R.v) : node.phases.R.v;
              const liveI = isP1 ? (i1 > 0 ? i1 : node.phases.R.i) : isP2 ? (i2 > 0 ? i2 : node.phases.R.i) : node.phases.R.i;
              const liveP = isP1 ? (p1 > 0 ? p1 : node.phases.R.p) : isP2 ? (p2 > 0 ? p2 : node.phases.R.p) : (node.phases.R.p + node.phases.Y.p + node.phases.B.p);

              return (
                <React.Fragment key={node.id}>
                  {/* Inter-pole span connector */}
                  {isLiveSpan ? (
                    <div className="w-[170px] shrink-0 flex flex-col items-center justify-center px-1">
                      <div className="w-full flex items-center relative">
                        <div
                          className={`h-[3px] w-full ${
                            isFault || isDifferentialFault
                              ? "bg-rose-500 ring-2 ring-rose-500 animate-pulse"
                              : "bg-emerald-500"
                          } relative overflow-hidden rounded-xs`}
                        >
                          <div
                            className={`absolute inset-0 ${
                              isFault || isDifferentialFault ? "bg-rose-300" : "bg-emerald-300"
                            } w-1/3 animate-pulse`}
                          />
                        </div>
                        <ArrowRight
                          className={`h-4 w-4 -ml-1 shrink-0 ${
                            isFault || isDifferentialFault ? "text-rose-500 animate-bounce" : "text-emerald-500"
                          }`}
                        />
                      </div>
                      <div
                        className={`mt-1 px-1.5 py-0.5 rounded-xs text-[9px] font-bold text-center border w-full ${
                          isFault || isDifferentialFault
                            ? "bg-rose-500/20 text-rose-500 border-rose-500 animate-pulse"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <GitBranch className="h-3 w-3" />
                          <span>ANSI 87L DIFFERENTIAL</span>
                        </div>
                        <div className="text-[8px] font-mono tabular-nums opacity-90">
                          ΔI = {idiff.toFixed(3)}A {isDifferentialFault ? "(TRIP LIMIT EXCEEDED)" : "• Z = 0.045 Ω"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-[60px] shrink-0 flex flex-col items-center justify-center">
                      <div className="w-full flex items-center">
                        <div
                          className={`h-[2px] w-full ${
                            isSpanTripped ? "bg-rose-500 ring-1 ring-rose-400" : "bg-emerald-500/60"
                          } relative overflow-hidden`}
                        >
                          <div
                            className={`absolute inset-0 ${
                              isSpanTripped ? "bg-rose-500 animate-pulse" : "bg-emerald-500 dark:bg-emerald-400"
                            } w-1/3 animate-pulse`}
                          />
                        </div>
                        <ArrowRight
                          className={`h-3 w-3 -ml-1 shrink-0 ${
                            isSpanTripped ? "text-rose-500 font-bold" : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        />
                      </div>
                      <span
                        className={`text-[8px] font-bold mt-0.5 truncate uppercase ${
                          isSpanTripped ? "text-rose-500 animate-pulse" : "text-slate-400 dark:text-zinc-500"
                        }`}
                      >
                        {isSpanTripped ? "LEAK/SNAP" : `SPAN ${index + 1}`}
                      </span>
                    </div>
                  )}

                  {/* Pole Node Card */}
                  <div
                    onClick={() => onSelectPole?.(node.id)}
                    className={`w-[160px] shrink-0 border p-2.5 rounded-sm cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 ring-2 ring-emerald-500/50 shadow-md shadow-emerald-500/10"
                        : isNodeTripped
                        ? "border-rose-500/80 bg-rose-50/30 dark:bg-rose-950/30 ring-1 ring-rose-500"
                        : isNodeWarn
                        ? "border-amber-500/80 bg-amber-50/20 dark:bg-amber-950/20"
                        : "border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 hover:border-slate-300 dark:hover:border-zinc-700"
                    }`}
                  >
                    <div>
                      {/* Card Header: Node ID & Status indicator */}
                      <div className="flex items-center justify-between text-[10px] pb-1 border-b border-slate-200 dark:border-zinc-800/60">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-800 dark:text-zinc-200">{node.id}</span>
                          {node.isLive ? (
                            <span className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 text-[8px] px-1 py-0.2 rounded-xs font-bold">
                              {isP1 ? "INCOMER RTU" : "BOUNDARY RTU"}
                            </span>
                          ) : (
                            <span className="bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 text-[8px] px-1 py-0.2 rounded-xs">
                              {isNodeDeenergized ? "DE-ENERGIZED" : "ENERGIZED"}
                            </span>
                          )}
                        </div>
                        <span
                          className={`h-2 w-2 rounded-full ${
                            isNodeTripped
                              ? "bg-rose-500 animate-pulse"
                              : isNodeWarn
                              ? "bg-amber-500 animate-pulse"
                              : isNodeDeenergized
                              ? "bg-slate-400 dark:bg-zinc-600"
                              : "bg-emerald-500 dark:bg-emerald-400"
                          }`}
                        />
                      </div>

                      {/* 3-Phase Voltages */}
                      <div className="mt-1.5 space-y-0.5 text-[10px] font-mono">
                        <div className="flex justify-between items-baseline">
                          <span className="text-rose-500 font-bold">VR:</span>
                          <span className="text-slate-800 dark:text-zinc-200 font-bold tabular-nums">
                            {liveV.toFixed(1)}V
                          </span>
                          <span className="text-slate-500 dark:text-zinc-400 tabular-nums">
                            {liveI.toFixed(2)}A
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-amber-500 font-bold">VY:</span>
                          <span className="text-slate-800 dark:text-zinc-200 font-bold tabular-nums">
                            {node.phases.Y.v.toFixed(1)}V
                          </span>
                          <span className="text-slate-500 dark:text-zinc-400 tabular-nums">
                            {node.phases.Y.i.toFixed(2)}A
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-cyan-500 font-bold">VB:</span>
                          <span className="text-slate-800 dark:text-zinc-200 font-bold tabular-nums">
                            {node.phases.B.v.toFixed(1)}V
                          </span>
                          <span className="text-slate-500 dark:text-zinc-400 tabular-nums">
                            {node.phases.B.i.toFixed(2)}A
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Pole Bottom Badge: Consumers & Load */}
                    <div className="mt-2 pt-1 border-t border-slate-200 dark:border-zinc-800/60 flex items-center justify-between text-[9px] text-slate-500 dark:text-zinc-400">
                      <span>LOAD: {Math.round(liveP)}W</span>
                      <span className="font-bold text-slate-700 dark:text-zinc-300">
                        {node.isLive ? (isP1 ? "INCOMER RTU" : "BOUNDARY RTU") : (node.status === "NORMAL" ? "ENERGIZED" : node.status)}
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}

            {/* Terminal Customer Service Load */}
            <div className="w-[35px] shrink-0 flex flex-col items-center justify-center">
              <div className="w-full flex items-center">
                <div className="h-[2px] w-full bg-emerald-500/60 relative overflow-hidden">
                  <div className="absolute inset-0 bg-emerald-500 dark:bg-emerald-400 w-1/3 animate-pulse" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 -ml-1 shrink-0" />
              </div>
            </div>

            <div className="w-[130px] shrink-0 border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 p-2.5 rounded-sm flex flex-col justify-between text-center">
              <div>
                <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 dark:text-zinc-400 font-semibold uppercase">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                  <span>END OF LINE</span>
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-zinc-200 mt-1">
                  {viewScope} TAIL
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                  TOTAL POLES: {feederNodes.length}
                </div>
              </div>
              <div className="text-[9px] text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xs py-0.5 mt-2">
                TERMINAL SPAN
              </div>
            </div>
          </div>
        </div>


      {/* Selected Simulated / Network Pole Inspector HUD */}
      {/* Unified SLD Footer: Inspected Asset or Supervisory Status */}
      <div
        className={`border px-3 py-2 rounded-sm text-xs flex flex-wrap items-center justify-between gap-2 font-mono transition-colors ${
          selectedNode
            ? "border-cyan-500/50 bg-cyan-950/20 text-cyan-200"
            : (viewScope === "LT-1" && isFault) || isFeederFaulted
            ? "border-rose-500/80 bg-rose-50/70 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 ring-1 ring-rose-500"
            : "border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-slate-700 dark:text-zinc-300"
        }`}
      >
        {selectedNode ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-cyan-500 text-cyan-400 font-bold text-[10px]">
                ASSET: {selectedNode.label === selectedNode.id ? selectedNode.label : `${selectedNode.label} (${selectedNode.id})`}
              </Badge>
              <span className="text-slate-500 dark:text-zinc-400 text-[11px]">
                Feeder <strong className="text-slate-800 dark:text-zinc-200">{selectedNode.feederId || "DTR"}</strong>
              </span>
              <span className="text-slate-300 dark:text-zinc-700">|</span>
              <div className="flex items-center gap-2 tabular-nums text-[11px]">
                <span>
                  <strong className="text-rose-400">R:</strong>{" "}
                  <span className="text-slate-800 dark:text-zinc-200">
                    {selectedNode.isLive
                      ? `${(selectedNode.id === "F1-P01" ? (v1 > 0 ? v1 : selectedNode.phases.R.v) : (v2 > 0 ? v2 : selectedNode.phases.R.v)).toFixed(1)}V/${(selectedNode.id === "F1-P01" ? (i1 > 0 ? i1 : selectedNode.phases.R.i) : (i2 > 0 ? i2 : selectedNode.phases.R.i)).toFixed(2)}A`
                      : `${selectedNode.phases.R.v.toFixed(1)}V/${selectedNode.phases.R.i.toFixed(2)}A`}
                  </span>
                </span>
                <span>
                  <strong className="text-amber-400">Y:</strong>{" "}
                  <span className="text-slate-800 dark:text-zinc-200">
                    {selectedNode.phases.Y.v.toFixed(1)}V/{selectedNode.phases.Y.i.toFixed(2)}A
                  </span>
                </span>
                <span>
                  <strong className="text-cyan-400">B:</strong>{" "}
                  <span className="text-slate-800 dark:text-zinc-200">
                    {selectedNode.phases.B.v.toFixed(1)}V/{selectedNode.phases.B.i.toFixed(2)}A
                  </span>
                </span>
                {selectedNode.isLive && (
                  <span className="text-emerald-400 font-bold ml-1">
                    ΔI: {idiff.toFixed(3)}A • PF: {(selectedNode.id === "F1-P01" ? pf1 : pf2).toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant={
                  selectedNode.status === "NORMAL"
                    ? "healthy"
                    : selectedNode.status === "WARN"
                    ? "warning"
                    : "destructive"
                }
                className="text-[9px] py-0 font-bold"
              >
                {selectedNode.status}
              </Badge>
              <button
                onClick={() => onSelectPole?.("")}
                className="text-[10px] text-slate-400 hover:text-slate-100 px-1 py-0.5 rounded border border-slate-700 hover:border-slate-500 transition-colors"
                title="Clear selection"
              >
                ✕ Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {(viewScope === "LT-1" && isFault) || isFeederFaulted ? (
                <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 animate-bounce" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              )}

              <span>
                {viewScope === "LT-1" && isFault ? (
                  isDifferentialFault ? (
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      FAULT ALERT: Inter-pole differential current ΔI = {idiff.toFixed(3)}A exceeds {tripLimit.toFixed(3)}A limit (F1-P01 ↔ F1-P02).
                    </span>
                  ) : isBrokenConductor ? (
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      FAULT ALERT: Open Conductor snap detected on Phase {telemetry?.fault_phase || "Y"} (ANSI 46BC).
                    </span>
                  ) : isBrokenNeutral ? (
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      VOLTAGE ALERT: Broken Neutral / Severe Voltage Unbalance (ANSI 59N).
                    </span>
                  ) : isOvercurrent ? (
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      TRIP ALERT: Overcurrent condition detected (ANSI 50/51).
                    </span>
                  ) : isLastGasp ? (
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      EMERGENCY ALERT: Pole 2 Outage Last-Gasp beacon received. Lineman dispatch recommended.
                    </span>
                  ) : (
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      FEEDER PROTECTION ALERT: {telemetry?.fault_code || "ANOMALY"} on Feeder LT-1.
                    </span>
                  )
                ) : isFeederFaulted ? (
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    FDIR FAULT ON {viewScope}: {feederDetections[0]?.ansi} • {feederDetections[0]?.message}
                  </span>
                ) : (
                  <span>
                    SUPERVISORY STATUS: {viewScope} radial feeder healthy • All {feederNodes.length} poles energized • Click any pole or breaker to inspect
                  </span>
                )}
              </span>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-zinc-400">
              TRIP THRESHOLD:{" "}
              <span className="text-slate-800 dark:text-zinc-200 font-bold">{tripLimit.toFixed(3)} A</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
