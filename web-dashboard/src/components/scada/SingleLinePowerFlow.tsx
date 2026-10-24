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
    <div className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/90 rounded-lg p-4 flex flex-col gap-3 transition-colors shadow-xs dark:shadow-none">
      {/* Header Bar with Feeder Scope Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-emerald-500" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Feeder Power Flow &amp; Line Integrity <span className="text-slate-400 dark:text-slate-600 font-normal">|</span> Single-Line Diagram (SLD)
          </h2>
        </div>

        {/* View Scope Tabs: Unified Feeder Selection */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg p-1 text-xs gap-1">
          <button
            onClick={() => setViewScope("LT-1")}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all flex items-center gap-1.5 ${
              viewScope === "LT-1"
                ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            <span>Feeder LT-1</span>
            <span className="text-[10px] opacity-75 font-mono">(10 Poles)</span>
          </button>
          <button
            onClick={() => setViewScope("LT-2")}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all flex items-center gap-1.5 ${
              viewScope === "LT-2"
                ? "bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 font-semibold shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <span>Feeder LT-2</span>
            <span className="text-[10px] opacity-75 font-mono">(11 Poles)</span>
          </button>
          <button
            onClick={() => setViewScope("LT-3")}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all flex items-center gap-1.5 ${
              viewScope === "LT-3"
                ? "bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 font-semibold shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <span>Feeder LT-3</span>
            <span className="text-[10px] opacity-75 font-mono">(7 Poles)</span>
          </button>
        </div>

        {/* Global Feeder Status Badge */}
        <div className="flex items-center gap-2 text-xs">
          {viewScope === "LT-1" && isFault ? (
            <Badge
              variant="destructive"
              className="flex items-center gap-1.5 py-0.5 text-[11px]"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>LT-1 Protection Trip ({telemetry?.fault_code || "Leakage"})</span>
            </Badge>
          ) : isFeederFaulted ? (
            <Badge
              variant="destructive"
              className="flex items-center gap-1.5 py-0.5 text-[11px]"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{viewScope} Fault ({feederDetections.length} Anomalies)</span>
            </Badge>
          ) : (
            <Badge
              variant="healthy"
              className="flex items-center gap-1.5 py-0.5 text-[11px]"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span>{viewScope} Line Healthy (100% Balanced)</span>
            </Badge>
          )}
          <span className="text-slate-400 dark:text-slate-400 text-xs font-normal">
            {feederSummary
              ? `${feederSummary.name} • ${feederNodes.length} Poles`
              : "230V/415V LT Radial"}
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* UNIFIED RADIAL FEEDER PIPELINE (LT-1 [LIVE ANCHOR], LT-2, LT-3) */}
      {/* ========================================================================= */}
      <div className="relative py-2 overflow-x-auto">
          <div className="min-w-[1200px] flex items-stretch gap-2.5">
            {/* 1. Substation */}
            <div className="w-[130px] shrink-0 border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 p-3 rounded-lg flex flex-col justify-between text-center">
              <div>
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>Substation</span>
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                  {ENTERPRISE_CONFIG.SUBSTATION_SHORT}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">33/11kV</div>
              </div>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-md py-0.5 mt-2 font-medium">
                11kV Bus
              </div>
            </div>

            {/* Cable arrow */}
            <div className="w-[35px] shrink-0 flex flex-col items-center justify-center">
              <div className="w-full flex items-center">
                <div className="h-[2px] w-full bg-emerald-500/50 relative overflow-hidden">
                  <div className="absolute inset-0 bg-emerald-500 w-1/3" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-emerald-500 -ml-1 shrink-0" />
              </div>
            </div>

            {/* 2. DTR-01 */}
            <div className="w-[140px] shrink-0 border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 p-3 rounded-lg flex flex-col justify-between text-center">
              <div>
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>DTR-01</span>
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 font-mono">
                  {networkSnapshot ? `${networkSnapshot.dtr.kva.toFixed(1)} kVA` : "250 kVA"}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Load: {networkSnapshot ? `${networkSnapshot.dtr.loadingPct}%` : "17%"}
                </div>
              </div>
              <div className="text-[10px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md py-0.5 mt-1 font-medium">
                415V 3-Phase
              </div>
            </div>

            {/* Feeder Bus Arrow */}
            <div className="w-[35px] shrink-0 flex flex-col items-center justify-center">
              <div className="w-full flex items-center">
                <div className="h-[2px] w-full bg-emerald-500/50 relative overflow-hidden">
                  <div className="absolute inset-0 bg-emerald-500 w-1/3" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-emerald-500 -ml-1 shrink-0" />
              </div>
            </div>

            {/* 3. Feeder Breaker / Incomer Bus */}
            <div className="w-[145px] shrink-0 border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 p-3 rounded-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-[11px] pb-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-800 dark:text-slate-200 font-semibold uppercase">{viewScope} Busbar</span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isFeederFaulted ? "bg-rose-500 animate-pulse" : "bg-emerald-500"
                    }`}
                  />
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-1 font-mono tabular-nums">
                  {feederSummary ? `${feederSummary.kw.toFixed(1)} kW` : "--- kW"}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {feederSummary ? `${feederSummary.headCurrent.R.toFixed(1)}A (R)` : "---"}
                </div>
              </div>
              <div className="text-[10px] text-center font-medium uppercase py-0.5 rounded-md mt-1 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
                Radial Feeder
              </div>
            </div>

            {/* Series Radial Pole Nodes in this Feeder */}
            {feederNodes.map((node, index) => {
              const isSelected = selectedPoleId?.toLowerCase() === node.id.toLowerCase();
              const isNodeTripped = node.status === "ALARM";
              const isNodeWarn = node.status === "WARN";

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
                          className={`h-[2.5px] w-full ${
                            isFault || isDifferentialFault
                              ? "bg-rose-500"
                              : "bg-emerald-500"
                          } relative overflow-hidden rounded-full`}
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
                        className={`mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold text-center border w-full ${
                          isFault || isDifferentialFault
                            ? "bg-rose-500/10 text-rose-500 border-rose-500/40"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <GitBranch className="h-3 w-3" />
                          <span>ANSI 87L Differential</span>
                        </div>
                        <div className="text-[9px] font-mono tabular-nums opacity-90">
                          ΔI = {idiff.toFixed(3)}A {isDifferentialFault ? "(Trip Limit Exceeded)" : "• Z = 0.045 Ω"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-[60px] shrink-0 flex flex-col items-center justify-center">
                      <div className="w-full flex items-center">
                        <div
                          className={`h-[2px] w-full ${
                            isSpanTripped ? "bg-rose-500" : "bg-emerald-500/50"
                          } relative overflow-hidden rounded-full`}
                        >
                          <div
                            className={`absolute inset-0 ${
                              isSpanTripped ? "bg-rose-400" : "bg-emerald-400"
                            } w-1/3`}
                          />
                        </div>
                        <ArrowRight
                          className={`h-3 w-3 -ml-1 shrink-0 ${
                            isSpanTripped ? "text-rose-500 font-bold" : "text-emerald-500"
                          }`}
                        />
                      </div>
                      <span
                        className={`text-[9px] font-semibold mt-0.5 truncate uppercase ${
                          isSpanTripped ? "text-rose-500 font-bold" : "text-slate-400 dark:text-slate-400"
                        }`}
                      >
                        {isSpanTripped ? "Fault" : `Span ${index + 1}`}
                      </span>
                    </div>
                  )}

                  {/* Pole Node Card */}
                  <div
                    onClick={() => onSelectPole?.(node.id)}
                    className={`w-[165px] shrink-0 border p-3 rounded-lg cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-500 shadow-sm"
                        : isNodeTripped
                        ? "border-rose-500/80 bg-rose-50/30 dark:bg-rose-950/30"
                        : isNodeWarn
                        ? "border-amber-500/80 bg-amber-50/20 dark:bg-amber-950/20"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div>
                      {/* Card Header: Node ID & Status indicator */}
                      <div className="flex items-center justify-between text-[11px] pb-1.5 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{node.id}</span>
                          {node.isLive ? (
                            <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[9px] px-1.5 py-0.2 rounded-full font-semibold">
                              {isP1 ? "Incomer" : "Outgoing"}
                            </span>
                          ) : (
                            <span className="bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[9px] px-1.5 py-0.2 rounded-full font-medium">
                              Energized
                            </span>
                          )}
                        </div>
                        <span
                          className={`h-2 w-2 rounded-full ${
                            isNodeTripped
                              ? "bg-rose-500 animate-pulse"
                              : isNodeWarn
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                        />
                      </div>

                      {/* 3-Phase Voltages */}
                      <div className="mt-2 space-y-1 text-xs font-mono">
                        <div className="flex justify-between items-baseline">
                          <span className="text-rose-500 font-bold">VR:</span>
                          <span className="text-slate-800 dark:text-slate-200 font-semibold tabular-nums">
                            {liveV.toFixed(1)}V
                          </span>
                          <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                            {liveI.toFixed(2)}A
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-amber-500 font-bold">VY:</span>
                          <span className="text-slate-800 dark:text-slate-200 font-semibold tabular-nums">
                            {node.phases.Y.v.toFixed(1)}V
                          </span>
                          <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                            {node.phases.Y.i.toFixed(2)}A
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-sky-500 font-bold">VB:</span>
                          <span className="text-slate-800 dark:text-slate-200 font-semibold tabular-nums">
                            {node.phases.B.v.toFixed(1)}V
                          </span>
                          <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                            {node.phases.B.i.toFixed(2)}A
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Pole Bottom Badge: Consumers & Load */}
                    <div className="mt-2.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                      <span className="font-mono">Load: {Math.round(liveP)}W</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {node.isLive ? (isP1 ? "Incomer" : "Outgoing") : node.status}
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}

            {/* End of Line Terminal */}
            <div className="w-[130px] shrink-0 border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 p-3 rounded-lg flex flex-col justify-between text-center">
              <div>
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>End of Line</span>
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                  {viewScope} Tail
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Total Poles: {feederNodes.length}
                </div>
              </div>
              <div className="text-[10px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md py-0.5 mt-2 font-medium">
                Terminal Span
              </div>
            </div>
          </div>
        </div>


      {/* Selected Simulated / Network Pole Inspector HUD */}
      {selectedNode && (
        <div className="border border-sky-500/30 bg-sky-50/40 dark:bg-sky-950/20 p-3 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <Badge variant="outline" className="border-sky-500 text-sky-600 dark:text-sky-400 font-semibold">
              Inspected Asset: {selectedNode.label} ({selectedNode.id})
            </Badge>
            <span className="text-slate-500 dark:text-slate-400">
              Feeder: <strong className="text-slate-800 dark:text-slate-200">{selectedNode.feederId || "DTR"}</strong>
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              Type:{" "}
              <strong className={selectedNode.isLive ? "text-emerald-600 dark:text-emerald-400" : "text-sky-600 dark:text-sky-400"}>
                {selectedNode.isLive ? "Primary Metered Incomer (415V/240V)" : "Radial Distribution Pole (415V/240V)"}
              </strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 tabular-nums text-xs font-mono">
            <div>
              <span className="text-rose-500 font-bold">R:</span>{" "}
              <span className="text-slate-800 dark:text-slate-200">
                {selectedNode.isLive
                  ? `${(selectedNode.id === "F1-P01" ? (v1 > 0 ? v1 : selectedNode.phases.R.v) : (v2 > 0 ? v2 : selectedNode.phases.R.v)).toFixed(1)}V / ${(selectedNode.id === "F1-P01" ? (i1 > 0 ? i1 : selectedNode.phases.R.i) : (i2 > 0 ? i2 : selectedNode.phases.R.i)).toFixed(2)}A`
                  : `${selectedNode.phases.R.v.toFixed(1)}V / ${selectedNode.phases.R.i.toFixed(2)}A`}
              </span>
            </div>
            <div>
              <span className="text-amber-500 font-bold">Y:</span>{" "}
              <span className="text-slate-800 dark:text-slate-200">
                {selectedNode.phases.Y.v.toFixed(1)}V / {selectedNode.phases.Y.i.toFixed(2)}A
              </span>
            </div>
            <div>
              <span className="text-sky-500 font-bold">B:</span>{" "}
              <span className="text-slate-800 dark:text-slate-200">
                {selectedNode.phases.B.v.toFixed(1)}V / {selectedNode.phases.B.i.toFixed(2)}A
              </span>
            </div>
            {selectedNode.isLive && (
              <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                ΔI: {idiff.toFixed(3)}A • PF: {(selectedNode.id === "F1-P01" ? pf1 : pf2).toFixed(2)}
              </div>
            )}
            <Badge
              variant={
                selectedNode.status === "NORMAL"
                  ? "healthy"
                  : selectedNode.status === "WARN"
                  ? "warning"
                  : "destructive"
              }
              className="text-[10px] py-0 font-medium"
            >
              {selectedNode.status}
            </Badge>
          </div>
        </div>
      )}

      {/* Dynamic SCADA Feeder Status Summary */}
      <div
        className={`border px-3.5 py-2.5 rounded-lg text-xs flex flex-wrap items-center justify-between gap-2 ${
          viewScope === "LT-1" && isFault
            ? "border-rose-500/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200"
            : isFeederFaulted
            ? "border-rose-500/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200"
            : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 text-slate-700 dark:text-slate-300"
        }`}
      >
        <div className="flex items-center gap-2">
          {viewScope === "LT-1" && isFault ? (
            <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
          ) : isFeederFaulted ? (
            <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          )}

          <span>
            {viewScope === "LT-1" && isFault ? (
              isDifferentialFault ? (
                <span className="font-semibold text-rose-600 dark:text-rose-400">
                  FAULT ALERT: Inter-pole differential current ΔI = {idiff.toFixed(3)}A exceeds {tripLimit.toFixed(3)}A protection limit. Anomaly detected on Feeder LT-1 span (F1-P01 ↔ F1-P02).
                </span>
              ) : isBrokenConductor ? (
                <span className="font-semibold text-rose-600 dark:text-rose-400">
                  FAULT ALERT: Open Conductor snap detected on Phase {telemetry?.fault_phase || "Y"} (ANSI 46BC). Upstream line energized, downstream voltage collapsed.
                </span>
              ) : isBrokenNeutral ? (
                <span className="font-semibold text-rose-600 dark:text-rose-400">
                  VOLTAGE ALERT: Broken Neutral / Severe Voltage Unbalance (ANSI 59N). Neutral floating across Indian LT 3-phase grid.
                </span>
              ) : isOvercurrent ? (
                <span className="font-semibold text-rose-600 dark:text-rose-400">
                  TRIP ALERT: Overcurrent condition detected (ANSI 50/51). Line current exceeds 16.0A thermal limit.
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
                SUPERVISORY STATUS: {viewScope} radial feeder is 100% healthy. All {feederNodes.length} distribution poles energised. {viewScope === "LT-1" ? "Section 1 differential current within statutory tolerance (ΔI < 0.350 A)." : ""}
              </span>
            )}
          </span>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          Protection Threshold:{" "}
          <span className="text-slate-800 dark:text-slate-200 font-bold">{tripLimit.toFixed(3)} A</span>
        </div>
      </div>
    </div>
  );
});
