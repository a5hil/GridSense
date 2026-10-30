"use client";

import * as React from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  Flame,
  Info,
  Layers,
  Lock,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Scale,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Trash2,
  Wifi,
  WifiOff,
  Wrench,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Detection,
  FeederSummary,
  InjectedFault,
  InjectedFaultType,
  NetworkSnapshot,
  NodeState,
  Phase,
  PHASES,
  UninstrumentedPhaseMode,
} from "@/lib/network/types";
import { ENTERPRISE_CONFIG } from "@/lib/constants";

interface NetworkTwinViewProps {
  snapshot: NetworkSnapshot | null;
  onRefresh?: () => void;
  onSelectPole?: (poleId: string) => void;
  selectedPoleId?: string;
}

export const NetworkTwinView = React.memo(function NetworkTwinView({
  snapshot,
  onRefresh,
  onSelectPole,
  selectedPoleId,
}: NetworkTwinViewProps) {
  const [selectedFeederId, setSelectedFeederId] = React.useState<string>("LT-1");
  const [isInjecting, setIsInjecting] = React.useState(false);
  const [isSwitchingMode, setIsSwitchingMode] = React.useState(false);

  // Form state for fault injector
  const [faultType, setFaultType] = React.useState<InjectedFaultType>("LEAKAGE");
  const [faultFeederId, setFaultFeederId] = React.useState<string>("LT-1");
  const [faultSpanChildId, setFaultSpanChildId] = React.useState<string>("F1-P03");
  const [faultPhase, setFaultPhase] = React.useState<Phase>("R");
  const [faultMagnitudeA, setFaultMagnitudeA] = React.useState<number>(1.5);
  const [injectionFeedback, setInjectionFeedback] = React.useState<{ error?: string; success?: string } | null>(null);

  const [showFaultsOnly, setShowFaultsOnly] = React.useState(false);
  const [showSecondaryFdir, setShowSecondaryFdir] = React.useState(false);

  // Identify root-cause trips vs secondary cascade sags
  const rootDetections = React.useMemo(() => {
    if (!snapshot) return [];
    return snapshot.detections.filter((d) => !d.ansi.includes("27") || d.severity === "CRITICAL");
  }, [snapshot]);

  const cascadeDetections = React.useMemo(() => {
    if (!snapshot) return [];
    return snapshot.detections.filter((d) => d.ansi.includes("27") && d.severity !== "CRITICAL");
  }, [snapshot]);

  const totalFaultedPoles = React.useMemo(() => {
    if (!snapshot) return 0;
    return snapshot.nodes.filter((n) => {
      const hasTrippedSection = snapshot.sections.some(
        (s) => s.parentId === n.id && s.tripped
      );
      return n.feederId !== null && (n.status === "ALARM" || n.status === "WARN" || hasTrippedSection);
    }).length;
  }, [snapshot]);

  // Filter nodes for the selected feeder (+ DTR as root)
  const feederNodes = React.useMemo(() => {
    if (!snapshot) return [];
    return snapshot.nodes.filter((n) => {
      if (showFaultsOnly) {
        const hasTrippedSection = snapshot.sections.some(
          (s) => s.parentId === n.id && s.tripped
        );
        return n.status === "ALARM" || n.status === "WARN" || hasTrippedSection;
      }
      return n.feederId === selectedFeederId || (selectedFeederId === "ALL" && n.feederId !== null);
    });
  }, [snapshot, selectedFeederId, showFaultsOnly]);

  if (!snapshot) {
    return (
      <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-8 rounded-sm text-center font-mono">
        <RefreshCw className="h-6 w-6 animate-spin mx-auto text-emerald-500 mb-2" />
        <p className="text-xs text-slate-500 dark:text-zinc-400">Initializing 3-Phase Network Twin...</p>
      </div>
    );
  }

  const { dtr, feeders, nodes, detections, injectedFaults, uninstrumentedMode, calibration, liveLinkUp } = snapshot;
  const activeFeederSummary = feeders.find((f) => f.id === selectedFeederId);

  // Switch uninstrumented mode
  const handleToggleMode = async () => {
    setIsSwitchingMode(true);
    const nextMode: UninstrumentedPhaseMode =
      uninstrumentedMode === "NOT_INSTRUMENTED" ? "SIM" : "NOT_INSTRUMENTED";
    try {
      await fetch("/api/network/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSwitchingMode(false);
    }
  };

  // Inject simulated fault
  const handleInjectFault = async () => {
    setInjectionFeedback(null);
    try {
      const res = await fetch("/api/network/faults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "inject",
          type: faultType,
          feederId: faultFeederId,
          spanChildId: faultType === "OVERLOAD" || faultType === "PHASE_UNBALANCE" ? undefined : faultSpanChildId,
          phase: faultType === "BROKEN_NEUTRAL" ? undefined : faultPhase,
          magnitudeA: faultType === "LEAKAGE" ? faultMagnitudeA : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setInjectionFeedback({ error: data.message });
      } else {
        setInjectionFeedback({ success: data.message });
        if (onRefresh) onRefresh();
      }
    } catch (err: any) {
      setInjectionFeedback({ error: err.message });
    }
  };

  // Clear simulated fault
  const handleClearFault = async (id?: string) => {
    try {
      await fetch("/api/network/faults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear", id }),
      });
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 font-mono flex-1 min-h-full">
      {/* 1. TOP SUMMARY BAR: DTR SUBSTATION & 3-PHASE NETWORK METRICS */}
      <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-3.5 rounded-sm shadow-xs dark:shadow-none flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 border border-emerald-500/30 bg-emerald-500/10 rounded-sm">
            <Zap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100">
                DISTRIBUTION NETWORK MODEL // 3-PHASE LOAD-FLOW MATRIX
              </h2>
              <Badge variant="outline" className="text-[10px] bg-slate-100 dark:bg-zinc-800 border-slate-300 dark:border-zinc-700">
                28 POLES • 3 FEEDERS
              </Badge>
              {liveLinkUp ? (
                <Badge variant="healthy" className="text-[10px] flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  SCADA TELEMETRY ACTIVE
                </Badge>
              ) : (
                <Badge variant="warning" className="text-[10px] flex items-center gap-1">
                  <Radio className="h-3 w-3" />
                  OFFLINE DIGITAL TWIN (SIMULATION)
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
              {ENTERPRISE_CONFIG.DTR_NAME} • {ENTERPRISE_CONFIG.SUBSTATION_NAME}
            </p>
          </div>
        </div>

        {/* Uninstrumented Phase Mode Toggle */}
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500">LOAD-FLOW MODEL</div>
            <div className="text-xs font-bold text-slate-800 dark:text-zinc-200">
              {uninstrumentedMode === "NOT_INSTRUMENTED" ? "SINGLE-PHASE CT/PT ONLY" : "FULL 3-PHASE ESTIMATION"}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleMode}
            disabled={isSwitchingMode}
            className="text-xs font-mono h-7 px-2.5 border-slate-300 dark:border-zinc-700"
            title="Toggle between single-phase instrumented view and full 3-phase load-flow estimation"
          >
            <Sliders className="h-3 w-3 mr-1 text-emerald-500" />
            <span>{uninstrumentedMode === "NOT_INSTRUMENTED" ? "SOLVE 3-PHASE LOAD FLOW" : "INSTRUMENTED CT/PT ONLY"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsInjecting(!isInjecting)}
            className={`text-xs font-mono h-7 px-2.5 ${
              isInjecting
                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500"
                : "border-slate-300 dark:border-zinc-700"
            }`}
          >
            <Flame className="h-3 w-3 mr-1 text-amber-500" />
            <span>CONTINGENCY SIMULATOR (OTS) {injectedFaults.length > 0 ? `(${injectedFaults.length})` : ""}</span>
          </Button>
        </div>
      </div>

      {/* 2. DTR SUBSTATION BUS 3-PHASE METRICS CARD */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 text-xs">
        {/* DTR Total Loading */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-3 rounded-sm flex flex-col justify-between">
          <div className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center justify-between">
            <span>DTR-01 TOTAL LOAD</span>
            <span className="font-bold text-slate-800 dark:text-zinc-200">{dtr.loadingPct.toFixed(1)}%</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-slate-900 dark:text-zinc-100">{dtr.kva.toFixed(1)}</span>
            <span className="text-[11px] text-slate-400">kVA</span>
            <span className="text-[11px] text-slate-400">({dtr.kw.toFixed(1)} kW)</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full ${
                dtr.loadingPct > 90 ? "bg-rose-500" : dtr.loadingPct > 75 ? "bg-amber-500" : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(100, dtr.loadingPct)}%` }}
            />
          </div>
        </div>

        {/* Phase R (Red Phase) */}
        <div className="border border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/20 p-3 rounded-sm flex flex-col justify-between">
          <div className="text-[11px] text-rose-600 dark:text-rose-400 font-bold flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              PHASE R
            </span>
            <Badge variant="outline" className="text-[9px] border-rose-500/50 text-rose-500 py-0 font-bold">
              PRIMARY METERED
            </Badge>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">VOLTAGE</div>
              <div className="text-base font-bold text-slate-900 dark:text-zinc-100">{dtr.voltage.R.toFixed(1)} V</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">TOTAL CURRENT</div>
              <div className="text-base font-bold text-rose-600 dark:text-rose-400">{dtr.current.R.toFixed(1)} A</div>
            </div>
          </div>
        </div>

        {/* Phase Y (Yellow Phase) */}
        <div className="border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 p-3 rounded-sm flex flex-col justify-between">
          <div className="text-[11px] text-amber-700 dark:text-amber-400 font-bold flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              PHASE Y
            </span>
            <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-700 dark:text-amber-500 py-0 font-normal">
              120° LAG
            </Badge>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">VOLTAGE</div>
              <div className="text-base font-bold text-slate-900 dark:text-zinc-100">{dtr.voltage.Y.toFixed(1)} V</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">TOTAL CURRENT</div>
              <div className="text-base font-bold text-amber-700 dark:text-amber-400">{dtr.current.Y.toFixed(1)} A</div>
            </div>
          </div>
        </div>

        {/* Phase B (Blue Phase) */}
        <div className="border border-cyan-500/30 bg-cyan-500/5 dark:bg-cyan-950/20 p-3 rounded-sm flex flex-col justify-between">
          <div className="text-[11px] text-blue-700 dark:text-cyan-400 font-bold flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500 dark:bg-cyan-400" />
              PHASE B
            </span>
            <Badge variant="outline" className="text-[9px] border-cyan-500/50 text-blue-700 dark:text-cyan-500 py-0 font-normal">
              240° LAG
            </Badge>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">VOLTAGE</div>
              <div className="text-base font-bold text-slate-900 dark:text-zinc-100">{dtr.voltage.B.toFixed(1)} V</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">TOTAL CURRENT</div>
              <div className="text-base font-bold text-blue-700 dark:text-cyan-400">{dtr.current.B.toFixed(1)} A</div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. INTERACTIVE FAULT INJECTION SIMULATOR CONSOLE (COLLAPSIBLE) */}
      {isInjecting && (
        <div className="border border-amber-500/50 bg-amber-500/5 dark:bg-amber-950/30 p-3.5 rounded-sm flex flex-col gap-3 text-xs">
          <div className="flex items-center justify-between border-b border-amber-500/30 pb-2">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-amber-500 animate-pulse" />
              <span className="font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                OPERATOR TRAINING SIMULATOR (OTS) // CONTINGENCY CONSOLE
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-zinc-400">
              Simulates asymmetric distribution network faults and conductor disturbances to validate automated FLISR and protective relay response.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
            {/* Fault Type */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">CONTINGENCY SCENARIO</label>
              <select
                value={faultType}
                onChange={(e) => setFaultType(e.target.value as InjectedFaultType)}
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-sm px-2 py-1 text-xs font-mono"
              >
                <option value="LEAKAGE">ANSI 87L - High-Impedance Conductor Ground Leakage</option>
                <option value="BROKEN_CONDUCTOR">ANSI 46BC - Series Phase Conductor Rupture (Broken Conductor)</option>
                <option value="BROKEN_NEUTRAL">ANSI 59N - Neutral Discontinuity / Floating Neutral Displacement</option>
                <option value="OVERLOAD">ANSI 51 - Feeder Time-Overcurrent (Thermal Overload)</option>
                <option value="PHASE_UNBALANCE">ANSI 46 - Phase Load Asymmetry / Negative Sequence</option>
              </select>
            </div>

            {/* Feeder Selection */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">TARGET FEEDER</label>
              <select
                value={faultFeederId}
                onChange={(e) => setFaultFeederId(e.target.value)}
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-sm px-2 py-1 text-xs font-mono"
              >
                {feeders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Span Child (if span fault) */}
            {faultType !== "OVERLOAD" && faultType !== "PHASE_UNBALANCE" && (
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">TARGET SPAN (CHILD POLE)</label>
                <select
                  value={faultSpanChildId}
                  onChange={(e) => setFaultSpanChildId(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-sm px-2 py-1 text-xs font-mono"
                >
                  {nodes
                    .filter((n) => n.id !== "DTR-01" && n.feederId === faultFeederId && !n.isLive)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.parentId} ➔ {n.label} ({n.id})
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Target Phase (if applicable) */}
            {faultType !== "BROKEN_NEUTRAL" && faultType !== "OVERLOAD" && faultType !== "PHASE_UNBALANCE" && (
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">TARGET PHASE</label>
                <div className="flex gap-1">
                  {PHASES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFaultPhase(p)}
                      className={`flex-1 py-1 rounded-sm text-xs font-bold ${
                        faultPhase === p
                          ? p === "R"
                            ? "bg-rose-500 text-white"
                            : p === "Y"
                            ? "bg-amber-400 text-black"
                            : "bg-cyan-500 text-white"
                          : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Magnitude (if leakage) */}
            {faultType === "LEAKAGE" && (
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">LEAKAGE CURRENT (A)</label>
                <div className="flex gap-1">
                  {[0.5, 1.5, 3.0, 7.5].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setFaultMagnitudeA(m)}
                      className={`flex-1 py-1 rounded-sm text-[11px] ${
                        faultMagnitudeA === m
                          ? "bg-amber-500 text-white font-bold"
                          : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400"
                      }`}
                    >
                      {m}A
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Inject Button */}
            <div className="flex items-end">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleInjectFault}
                className="w-full text-xs font-mono h-7 bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                <Play className="h-3 w-3 mr-1 fill-white" />
                <span>EXECUTE CONTINGENCY</span>
              </Button>
            </div>
          </div>

          {injectionFeedback && (
            <div
              className={`text-xs px-2.5 py-1 rounded-sm ${
                injectionFeedback.error
                  ? "bg-rose-500/20 text-rose-500 border border-rose-500/40"
                  : "bg-emerald-500/20 text-emerald-500 border border-emerald-500/40"
              }`}
            >
              {injectionFeedback.error || injectionFeedback.success}
            </div>
          )}

          {/* Active Faults List */}
          {injectedFaults.length > 0 && (
            <div className="border-t border-amber-500/30 pt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">ACTIVE CONTINGENCIES:</span>
                {injectedFaults.map((f) => (
                  <Badge
                    key={f.id}
                    variant="outline"
                    className="text-[10px] bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-300 py-0.5 flex items-center gap-1.5"
                  >
                    <span>
                      {f.type} {f.phase ? `[${f.phase}]` : ""} {f.spanChildId ? `➔ ${f.spanChildId}` : `(${f.feederId})`}
                      {f.magnitudeA ? ` (${f.magnitudeA}A)` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleClearFault(f.id)}
                      className="hover:text-rose-400 font-bold ml-1"
                      title="Clear this contingency"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleClearFault()}
                className="text-[11px] h-6 px-2 text-rose-500 border-rose-500/40 hover:bg-rose-500/10 font-bold"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                <span>RESTORE ALL CONTINGENCIES (CLEAR)</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 4. ACTIVE DETECTIONS & FLISR ISOLATION MATRIX */}
      {detections.length > 0 && (
        <div className="border border-rose-500/60 bg-rose-500/10 dark:bg-rose-950/40 p-3 rounded-sm flex flex-col gap-2 font-mono text-xs shadow-md">
          <div className="flex items-center justify-between border-b border-rose-500/30 pb-1.5">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-300 font-bold">
              <AlertOctagon className="h-4 w-4 animate-bounce" />
              <span>
                CENTRAL FDIR &amp; AUTOMATION // {rootDetections.length} ROOT-CAUSE RELAY TRIP{rootDetections.length > 1 ? "S" : ""}
                {cascadeDetections.length > 0 ? ` (+${cascadeDetections.length} SYMPATHETIC SAGS)` : ""}
              </span>
            </div>
            <span className="text-[11px] text-slate-400">ANSI Protection Suite &amp; Automated FLISR</span>
          </div>

          {/* Root-Cause Protection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {rootDetections.map((d) => (
              <div
                key={d.key}
                className={`p-2.5 rounded-sm border flex flex-col justify-between ${
                  d.severity === "CRITICAL"
                    ? "bg-rose-50 dark:bg-rose-900/40 border-rose-300 dark:border-rose-500 text-rose-900 dark:text-rose-100 ring-1 ring-rose-400 dark:ring-rose-500/40"
                    : d.severity === "HIGH"
                    ? "bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-500 text-amber-900 dark:text-amber-100"
                    : "bg-slate-100 dark:bg-slate-900/40 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="destructive" className="text-[9px] py-0 font-bold">
                      {d.ansi}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] py-0 border-slate-400 dark:border-slate-600">
                      {d.source}
                    </Badge>
                    {d.phase && (
                      <span
                        className={`text-[10px] px-1 rounded-xs font-bold ${
                          d.phase === "R"
                            ? "bg-rose-500 text-white"
                            : d.phase === "Y"
                            ? "bg-amber-400 text-black"
                            : "bg-blue-600 dark:bg-cyan-500 text-white"
                        }`}
                      >
                        PHASE {d.phase}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">{d.feederId}</span>
                </div>

                <div className="text-[11px] font-bold leading-tight my-1">{d.message}</div>

                {d.isolate && (
                  <div className="text-[10px] text-amber-900 dark:text-amber-300/90 bg-amber-100/70 dark:bg-black/40 px-1.5 py-1 rounded-xs mt-1 border border-amber-300 dark:border-amber-500/30">
                    <span className="font-bold text-amber-700 dark:text-amber-400">FLISR ISOLATION:</span> Open switch at {d.isolate.upstream} ➔ isolate downstream {d.isolate.downstream.join(", ")}
                    {d.customersAffected !== undefined && (
                      <span className="text-slate-600 dark:text-slate-400 ml-1">({d.customersAffected} customers isolated)</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Secondary Cascade Sags Drawer */}
          {cascadeDetections.length > 0 && (
            <div className="border border-amber-500/40 bg-amber-500/5 dark:bg-amber-950/20 rounded-sm overflow-hidden text-xs mt-1">
              <div
                onClick={() => setShowSecondaryFdir(!showSecondaryFdir)}
                className="px-2.5 py-1.5 flex items-center justify-between cursor-pointer hover:bg-amber-500/10 transition-colors"
              >
                <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400 text-[11px]">
                  <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${showSecondaryFdir ? "rotate-90" : ""}`} />
                  <span>SECONDARY VOLTAGE SAGS ({cascadeDetections.length})</span>
                  <span className="text-[10px] text-slate-400 font-normal">-- Downstream undervoltages induced across radial laterals</span>
                </div>
                <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-500 py-0">
                  {showSecondaryFdir ? "COLLAPSE" : "EXPAND LIST"}
                </Badge>
              </div>

              {showSecondaryFdir && (
                <div className="p-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 border-t border-amber-500/20 bg-black/10">
                  {cascadeDetections.map((d) => (
                    <div
                      key={d.key}
                      className="p-2 rounded-sm border border-slate-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/40 text-xs"
                    >
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          {d.ansi} // {d.nodeId || d.sectionId} ({d.feederId})
                        </span>
                        <span className="text-slate-400">~{d.customersAffected ?? 8} Cust</span>
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">
                        {d.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 5. FEEDER SELECTION & 3-PHASE TREE VIEW */}
      <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-3.5 rounded-sm flex flex-col gap-3 flex-1 min-h-0">
        {/* Feeder Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-zinc-800/80 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">SELECT FEEDER CORRIDOR:</span>
            <div className="flex items-center bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-sm p-0.5 text-xs">
              {feeders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFeederId(f.id)}
                  className={`px-3 py-1 rounded-sm text-xs uppercase font-bold transition-colors ${
                    selectedFeederId === f.id
                      ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 border border-slate-300 dark:border-zinc-700 shadow-xs"
                      : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
                  }`}
                >
                  {f.id} ({f.name.split(" ")[1]})
                </button>
              ))}
              <button
                onClick={() => setSelectedFeederId("ALL")}
                className={`px-3 py-1 rounded-sm text-xs uppercase font-bold transition-colors ${
                  selectedFeederId === "ALL" && !showFaultsOnly
                    ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 border border-slate-300 dark:border-zinc-700 shadow-xs"
                    : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
                }`}
              >
                ALL POLES (28)
              </button>
            </div>

            {/* Quick Filter: Show Faulted Poles Only */}
            <button
              onClick={() => setShowFaultsOnly(!showFaultsOnly)}
              className={`px-2.5 py-1 rounded-sm text-xs uppercase font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                showFaultsOnly
                  ? "bg-rose-600 text-white shadow-xs border border-rose-500"
                  : totalFaultedPoles > 0
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/40 hover:bg-rose-500/20 animate-pulse"
                  : "text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800 hover:text-slate-800 dark:hover:text-zinc-200"
              }`}
              title="Filter pole matrix to only nodes with active alarms or tripped sections"
            >
              <AlertOctagon className="h-3.5 w-3.5 text-rose-500" />
              <span>{showFaultsOnly ? "SHOWING ALARMS ONLY" : `FILTER: ACTIVE ALARMS ONLY (${totalFaultedPoles})`}</span>
            </button>
          </div>

          {activeFeederSummary && (
            <div className="flex items-center gap-3 text-xs tabular-nums">
              <span>
                HEAD LOAD: <span className="font-bold text-slate-800 dark:text-zinc-200">{activeFeederSummary.kw.toFixed(1)} kW</span>
              </span>
              <span>•</span>
              <span>
                CURRENTS: <span className="text-rose-500 font-bold">{activeFeederSummary.headCurrent.R.toFixed(1)}A</span> /{" "}
                <span className="text-amber-500 font-bold">{activeFeederSummary.headCurrent.Y.toFixed(1)}A</span> /{" "}
                <span className="text-cyan-500 font-bold">{activeFeederSummary.headCurrent.B.toFixed(1)}A</span>
              </span>
              <span>•</span>
              <span>
                CAPACITY: <span className="font-bold text-slate-800 dark:text-zinc-200">{activeFeederSummary.loadingPct.toFixed(0)}%</span> of {activeFeederSummary.ampacityA}A
              </span>
            </div>
          )}
        </div>

        {/* Poles 3-Phase Grid Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-800 text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">
                <th className="py-2 px-2.5">NODE / DISTRIBUTION POLE</th>
                <th className="py-2 px-2.5">FEEDER CORRIDOR</th>
                <th className="py-2 px-2.5">METERING CLASS</th>
                <th className="py-2 px-2.5">
                  <span className="text-rose-600 dark:text-rose-500 font-bold">PHASE R (LIVE CT/PT)</span>
                </th>
                <th className="py-2 px-2.5">
                  <span className="text-amber-700 dark:text-amber-500 font-bold">PHASE Y</span>
                </th>
                <th className="py-2 px-2.5">
                  <span className="text-blue-700 dark:text-cyan-500 font-bold">PHASE B</span>
                </th>
                <th className="py-2 px-2.5">DIFFERENTIAL CURRENT (I_diff)</th>
                <th className="py-2 px-2.5 text-right">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 font-mono">
              {feederNodes.map((n) => {
                const isSelected = selectedPoleId === n.id;
                const rSec = snapshot.sections.filter((s) => s.parentId === n.id);
                const hasTrippedSection = rSec.some((s) => s.tripped);

                return (
                  <tr
                    key={n.id}
                    onClick={() => onSelectPole && onSelectPole(n.id)}
                    className={`hover:bg-slate-50 dark:hover:bg-zinc-900/60 transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-emerald-500/10 dark:bg-emerald-500/15"
                        : n.isLive
                        ? "bg-emerald-500/5 dark:bg-emerald-950/20"
                        : ""
                    }`}
                  >
                    {/* Pole ID & Label */}
                    <td className="py-2.5 px-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            n.status === "ALARM"
                              ? "bg-rose-500 animate-ping"
                              : n.status === "WARN"
                              ? "bg-amber-400"
                              : n.isLive
                              ? "bg-emerald-400"
                              : "bg-slate-400"
                          }`}
                        />
                        <div>
                          <div className="font-bold text-slate-800 dark:text-zinc-100">{n.label}</div>
                          {n.label !== n.id && (
                            <div className="text-[10px] text-slate-400">{n.id}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Feeder & Span */}
                    <td className="py-2.5 px-2.5 text-[11px] text-slate-500 dark:text-zinc-400">
                      <div>{n.feederId || "SUBSTATION BUS"}</div>
                      <div className="text-[10px] text-slate-400">
                        {n.parentId ? `from ${n.parentId}` : "ROOT (DTR)"}
                      </div>
                    </td>

                    {/* Metering Class Badge */}
                    <td className="py-2.5 px-2.5">
                      {n.isLive ? (
                        <Badge
                          variant="healthy"
                          className="text-[9px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/50 py-0.5 flex items-center gap-1 w-fit font-bold"
                        >
                          <Wifi className="h-3 w-3" />
                          <span>CLASS 0.5S RTU</span>
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[9px] bg-slate-100 dark:bg-zinc-800/80 border-slate-300 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 py-0.5 w-fit"
                        >
                          WLS ESTIMATED
                        </Badge>
                      )}
                    </td>

                    {/* Phase R */}
                    <td className="py-2.5 px-2.5">
                      <div className="font-bold text-rose-600 dark:text-rose-400">
                        {n.phases.R.v.toFixed(1)}V • {n.phases.R.i.toFixed(3)}A
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {n.phases.R.p.toFixed(0)}W • PF {n.phases.R.pf.toFixed(2)}
                      </div>
                    </td>

                    {/* Phase Y */}
                    <td className="py-2.5 px-2.5">
                      {n.phases.Y.source === "NOT_INSTRUMENTED" ? (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">-- UNMONITORED</span>
                      ) : (
                        <>
                          <div className="font-bold text-amber-700 dark:text-amber-400">
                            {n.phases.Y.v.toFixed(1)}V • {n.phases.Y.i.toFixed(3)}A
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {(n.phases.Y.p > 0
                              ? n.phases.Y.p
                              : n.phases.Y.i > 0
                              ? n.phases.Y.v * n.phases.Y.i * (n.phases.Y.pf || 0.96)
                              : 0
                            ).toFixed(0)}W
                            {n.phases.Y.source === "SIM" && n.isLive && (
                              <span className="ml-1 text-[9px] text-amber-600 dark:text-amber-500 font-semibold">(EST)</span>
                            )}
                          </div>
                        </>
                      )}
                    </td>

                    {/* Phase B */}
                    <td className="py-2.5 px-2.5">
                      {n.phases.B.source === "NOT_INSTRUMENTED" ? (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">-- UNMONITORED</span>
                      ) : (
                        <>
                          <div className="font-bold text-blue-700 dark:text-cyan-400">
                            {n.phases.B.v.toFixed(1)}V • {n.phases.B.i.toFixed(3)}A
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {(n.phases.B.p > 0
                              ? n.phases.B.p
                              : n.phases.B.i > 0
                              ? n.phases.B.v * n.phases.B.i * (n.phases.B.pf || 0.96)
                              : 0
                            ).toFixed(0)}W
                            {n.phases.B.source === "SIM" && n.isLive && (
                              <span className="ml-1 text-[9px] text-blue-600 dark:text-cyan-500 font-semibold">(EST)</span>
                            )}
                          </div>
                        </>
                      )}
                    </td>

                    {/* Section KCL Leakage */}
                    <td className="py-2.5 px-2.5">
                      {rSec.length === 0 ? (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">RADIAL TERMINAL</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {rSec.map((s) => (
                            <div
                              key={s.phase}
                              className={`text-[10px] font-mono flex items-center gap-1 ${
                                s.tripped
                                  ? "text-rose-600 dark:text-rose-500 font-bold bg-rose-50 dark:bg-rose-500/10 px-1 py-0.5 rounded-xs"
                                  : "text-slate-600 dark:text-zinc-400"
                              }`}
                            >
                              <span className="font-bold">[{s.phase}]</span>
                              <span>ΔI: {s.leakA.toFixed(3)}A</span>
                              {s.tripped && <span>(TRIP &gt; {s.thresholdA.toFixed(3)}A)</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-2.5 px-2.5 text-right">
                      {n.status === "ALARM" || hasTrippedSection ? (
                        <Badge variant="destructive" className="text-[9px] py-0 font-bold animate-pulse">
                          FAULT
                        </Badge>
                      ) : n.status === "WARN" ? (
                        <Badge variant="warning" className="text-[9px] py-0 font-bold">
                          WARN
                        </Badge>
                      ) : n.status === "DEENERGIZED" || !n.energized || n.phases.R.v < 50 ? (
                        <Badge variant="outline" className="text-[9px] py-0 border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-900/60 font-semibold">
                          DE-ENERGIZED
                        </Badge>
                      ) : (
                        <Badge variant="healthy" className="text-[9px] py-0">
                          NORMAL
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. LIVE SENSOR CROSS-CALIBRATION HUD */}
      <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-3 rounded-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-emerald-500" />
          <span className="font-bold text-slate-800 dark:text-zinc-200">
            LINE IMPEDANCE &amp; LOSS SUPERVISION // SECTION 1
          </span>
          <Badge
            variant={calibration.status === "CALIBRATED" ? "healthy" : "outline"}
            className="text-[9px] py-0"
          >
            {calibration.status}
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-xs tabular-nums text-slate-600 dark:text-zinc-400">
          <div>
            <span>VOLTAGE OFFSET: </span>
            <span className="font-bold text-slate-800 dark:text-zinc-200">{calibration.vOffset.toFixed(3)} V</span>
            <span className="text-[10px] text-slate-400 ml-1">({calibration.vSamples} samples)</span>
          </div>
          <div>
            <span>POWER GAIN FACTOR: </span>
            <span className="font-bold text-slate-800 dark:text-zinc-200">{calibration.pGain.toFixed(5)}×</span>
            <span className="text-[10px] text-slate-400 ml-1">({calibration.pSamples} samples)</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 max-w-md hidden lg:block">
          Dynamic transducer offset active. Reference conductor impedance: 0.544 Ω/km (Technical line loss active).
        </div>
      </div>
    </div>
  );
});
