"use client";

import * as React from "react";
import {
  Activity,
  Clock,
  Zap,
  Pause,
  Play,
  TrendingUp,
  ShieldAlert,
  Flame,
  Gauge,
  Radio,
} from "lucide-react";
import { HistoricalTelemetryPoint } from "@/lib/types";

interface TelemetryTrendChartProps {
  history: HistoricalTelemetryPoint[];
  tripLimit?: number;
  isFrozen?: boolean;
  onToggleFreeze?: () => void;
}

export function TelemetryTrendChart({
  history,
  tripLimit = 0.35,
  isFrozen: controlledFrozen,
  onToggleFreeze,
}: TelemetryTrendChartProps) {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);

  // Freeze / Buffer Capture State
  const [localFrozen, setLocalFrozen] = React.useState(false);
  const isFrozen = controlledFrozen !== undefined ? controlledFrozen : localFrozen;
  const [frozenBuffer, setFrozenBuffer] = React.useState<HistoricalTelemetryPoint[]>([]);
  const [frozenTime, setFrozenTime] = React.useState<string>("");

  const handleToggleFreeze = () => {
    if (!isFrozen) {
      setFrozenBuffer([...history]);
      setFrozenTime(new Date().toLocaleTimeString());
    }
    if (onToggleFreeze) {
      onToggleFreeze();
    } else {
      setLocalFrozen(!localFrozen);
    }
  };

  React.useEffect(() => {
    if (isFrozen && frozenBuffer.length === 0 && history.length > 0) {
      setFrozenBuffer([...history]);
      setFrozenTime(new Date().toLocaleTimeString());
    } else if (!isFrozen && frozenBuffer.length > 0) {
      setFrozenBuffer([]);
    }
  }, [isFrozen, history]);

  const data = isFrozen
    ? frozenBuffer.length > 0
      ? frozenBuffer
      : history
    : history.length > 0
    ? history
    : [];

  // Helper to compute min, max, avg, current
  const calcStats = (vals: number[]) => {
    if (vals.length === 0) return { min: 0, max: 0, avg: 0, cur: 0 };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = sum / vals.length;
    const cur = vals[vals.length - 1];
    return { min, max, avg, cur };
  };

  // Hover data point
  const hoveredPoint =
    hoverIndex !== null && data[hoverIndex]
      ? data[hoverIndex]
      : data.length > 0
      ? data[data.length - 1]
      : null;

  // Optimized High-Resolution Sizing for 2x2 Grid
  const svgWidth = 800;
  const svgHeight = 240;
  const padding = { top: 24, right: 36, bottom: 32, left: 62 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  const getX = (index: number) => {
    if (data.length <= 1) return padding.left;
    return padding.left + (index / (data.length - 1)) * graphWidth;
  };

  const getYCoord = (val: number, minY: number, maxY: number) => {
    if (maxY === minY) return padding.top + graphHeight / 2;
    return padding.top + graphHeight - ((val - minY) / (maxY - minY)) * graphHeight;
  };

  // Generic Line Path Generator
  const generatePath = (
    valExtractor: (d: HistoricalTelemetryPoint) => number,
    minY: number,
    maxY: number
  ) => {
    if (data.length === 0) return "";
    return data
      .map((d, i) => {
        const val = valExtractor(d);
        const y = getYCoord(val, minY, maxY);
        const x = getX(i);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };

  // Generic Area Path Generator (Filled gradient under curves)
  const generateAreaPath = (
    valExtractor: (d: HistoricalTelemetryPoint) => number,
    minY: number,
    maxY: number
  ) => {
    if (data.length === 0) return "";
    const linePath = data
      .map((d, i) => {
        const val = valExtractor(d);
        const y = getYCoord(val, minY, maxY);
        const x = getX(i);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
    const firstX = getX(0).toFixed(1);
    const lastX = getX(data.length - 1).toFixed(1);
    const bottomY = (svgHeight - padding.bottom).toFixed(1);
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  // 5 Y-Axis Tick Percentages for High Precision
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];

  // X-Axis Time Markers (40 samples @ 250ms = 10s sliding window)
  const xTimeMarkers = [
    { p: 0.0, label: "T-10s" },
    { p: 0.25, label: "T-7.5s" },
    { p: 0.5, label: "T-5.0s" },
    { p: 0.75, label: "T-2.5s" },
    { p: 1.0, label: "LIVE" },
  ];

  // ==========================================
  // 1. DATA SCALES: CURRENT & FAULT LEAKAGE
  // ==========================================
  const allI = data.flatMap((d) => [d.i1, d.i2, d.idiff, tripLimit]);
  const minI = Math.max(0, Math.floor(Math.min(...(allI.length ? allI : [0])) * 10) / 10 - 0.2);
  const maxI = Math.ceil((Math.max(...(allI.length ? allI : [3.0])) + 0.3) * 10) / 10;
  const pathI1 = generatePath((d) => d.i1, minI, maxI);
  const pathI2 = generatePath((d) => d.i2, minI, maxI);
  const pathIdiff = generatePath((d) => d.idiff, minI, maxI);
  const areaIdiff = generateAreaPath((d) => d.idiff, minI, maxI);
  const yTripLimit = getYCoord(tripLimit, minI, maxI);
  const statsI1 = calcStats(data.map((d) => d.i1));
  const statsI2 = calcStats(data.map((d) => d.i2));
  const statsIdiff = calcStats(data.map((d) => d.idiff));

  // ==========================================
  // 2. DATA SCALES: VOLTAGE & FREQUENCY
  // ==========================================
  const allV = data.flatMap((d) => [d.v1, d.v2, 207, 253]);
  const minV = Math.max(0, Math.floor(Math.min(...(allV.length ? allV : [200])) - 5));
  const maxV = Math.ceil(Math.max(...(allV.length ? allV : [260])) + 5);
  const pathV1 = generatePath((d) => d.v1, minV, maxV);
  const pathV2 = generatePath((d) => d.v2, minV, maxV);
  const yOverV = getYCoord(253, minV, maxV);
  const yUnderV = getYCoord(207, minV, maxV);
  const statsV1 = calcStats(data.map((d) => d.v1));
  const statsV2 = calcStats(data.map((d) => d.v2));
  const statsFreq = calcStats(data.map((d) => d.freq1 ?? 50.0));

  // ==========================================
  // 3. DATA SCALES: POWER TRIANGLE (P / Q / S)
  // ==========================================
  const allP = data.flatMap((d) => [
    (d.p1 ?? 0) / 1000,
    (d.q1 ?? 0) / 1000,
    (d.s1 ?? 0) / 1000,
  ]);
  const minP = Math.max(0, Math.floor(Math.min(...(allP.length ? allP : [0])) * 10) / 10);
  const maxP = Math.max(0.5, Math.ceil((Math.max(...(allP.length ? allP : [0.6])) + 0.1) * 10) / 10);
  const pathPActive = generatePath((d) => (d.p1 ?? 0) / 1000, minP, maxP);
  const areaPActive = generateAreaPath((d) => (d.p1 ?? 0) / 1000, minP, maxP);
  const pathQReactive = generatePath((d) => (d.q1 ?? 0) / 1000, minP, maxP);
  const pathSApparent = generatePath((d) => (d.s1 ?? 0) / 1000, minP, maxP);
  const statsP1 = calcStats(data.map((d) => (d.p1 ?? 0) / 1000));
  const statsQ1 = calcStats(data.map((d) => (d.q1 ?? 0) / 1000));
  const statsS1 = calcStats(data.map((d) => (d.s1 ?? 0) / 1000));
  const statsPf = calcStats(data.map((d) => d.pf1 ?? 0.96));

  // ==========================================
  // 4. DATA SCALES: LINE LOSS & VOLTAGE DROP
  // ==========================================
  const allLoss = data.flatMap((d) => [d.pLoss ?? 0, (d.vDrop ?? 0) * 5]);
  const minLoss = 0;
  const maxLoss = Math.max(10, Math.ceil(Math.max(...(allLoss.length ? allLoss : [10])) * 1.2));
  const pathLoss = generatePath((d) => d.pLoss ?? 0, minLoss, maxLoss);
  const areaLoss = generateAreaPath((d) => d.pLoss ?? 0, minLoss, maxLoss);
  const pathVDrop = generatePath((d) => (d.vDrop ?? 0) * 5, minLoss, maxLoss);
  const statsLossW = calcStats(data.map((d) => d.pLoss ?? 0));
  const statsVDrop = calcStats(data.map((d) => d.vDrop ?? 0));

  return (
    <div className="flex-1 flex flex-col gap-3 font-mono">
      {/* 1. Global SCADA Header Bar */}
      <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-2.5 rounded-sm flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isFrozen ? "bg-amber-400" : "bg-emerald-400"}`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isFrozen ? "bg-amber-500" : "bg-emerald-500"}`} />
            </span>
            <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-zinc-200">
              SCADA TELEMETRY WAVEFORM MONITOR // MULTI-PARAMETER POWER QUALITY ANALYZER
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 border-l border-slate-200 dark:border-zinc-800 pl-3">
            <span>FEEDER 04 (11kV DISTRIBUTION PRIMARY)</span>
            <span>•</span>
            <span>LORA SUB-GHZ MESH</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isFrozen && (
            <div className="flex items-center gap-1.5 text-xs bg-amber-500/10 border border-amber-500/40 text-amber-500 dark:text-amber-400 px-2 py-0.5 rounded-xs font-bold animate-pulse">
              <Clock className="h-3.5 w-3.5" />
              <span>BUFFER FROZEN AT {frozenTime || "INSPECTION"}</span>
            </div>
          )}

          {/* Freeze / Resume Toggle Button */}
          <button
            onClick={handleToggleFreeze}
            className={`px-3 py-1 text-xs rounded-sm transition-all flex items-center gap-1.5 font-bold cursor-pointer shadow-xs ${
              isFrozen
                ? "bg-amber-500 hover:bg-amber-600 text-zinc-950 border border-amber-400"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-zinc-700"
            }`}
            title={isFrozen ? "Resume Live Rolling Stream" : "Freeze All Waveform Buffers for Presentation Inspection"}
          >
            {isFrozen ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            <span>{isFrozen ? "RESUME LIVE STREAM" : "FREEZE ALL WAVEFORMS"}</span>
          </button>

          <div className="text-xs text-slate-500 dark:text-zinc-400 border-l border-slate-200 dark:border-zinc-800 pl-3">
            BUFFER: <span className="text-slate-800 dark:text-zinc-200 font-bold">{data.length}</span> / 40 SAMPLES (10s)
          </div>
        </div>
      </div>

      {/* 2. 2x2 High-Readability Full Screen Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3.5 min-h-0">
        {/* ============================================================== */}
        {/* CHART 1: CURRENT & DIFFERENTIAL PROTECTION (ANSI 87L) */}
        {/* ============================================================== */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm flex flex-col overflow-hidden shadow-xs dark:shadow-none min-h-[300px]">
          {/* Card Header with Live Values */}
          <div className="flex flex-wrap items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/80 border-b border-slate-200 dark:border-zinc-800/80 text-xs">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-500" />
              <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs tracking-wide">
                1. CURRENT &amp; DIFFERENTIAL PROTECTION (ANSI 87L)
              </span>
            </div>
            {/* Live Instantaneous Pill Badges */}
            <div className="flex items-center gap-3 text-xs tabular-nums font-semibold">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-xs" />
                I1: <span className="font-bold">{statsI1.cur.toFixed(3)}A</span>
              </span>
              <span className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400">
                <span className="h-2 w-2 rounded-full bg-cyan-500 shadow-xs" />
                I2: <span className="font-bold">{statsI2.cur.toFixed(3)}A</span>
              </span>
              <span className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-xs ${statsIdiff.cur > tripLimit ? "bg-rose-500/20 text-rose-500 border border-rose-500/50 animate-pulse font-bold" : "text-rose-500"}`}>
                <span className="h-2 w-2 rounded-full bg-rose-500 shadow-xs" />
                ΔI: <span className="font-bold">{statsIdiff.cur.toFixed(3)}A</span>
              </span>
            </div>
          </div>

          {/* SVG Graph Area */}
          <div
            className="relative flex-1 bg-slate-50/50 dark:bg-[#070809] p-2 select-none min-h-[220px] h-[260px] xl:h-[285px]"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
              <defs>
                <linearGradient id="gradIdiff" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.14" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Y-Axis Horizontal Gridlines & Labels */}
              {yTicks.map((p, idx) => {
                const val = minI + p * (maxI - minI);
                const y = getYCoord(val, minI, maxI);
                return (
                  <g key={idx}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={svgWidth - padding.right}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-zinc-800"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 3.5}
                      className="fill-slate-500 dark:fill-zinc-400"
                      fontSize="10"
                      fontWeight="500"
                      textAnchor="end"
                    >
                      {val.toFixed(2)}A
                    </text>
                  </g>
                );
              })}

              {/* X-Axis Vertical Time Guides & Labels */}
              {xTimeMarkers.map((marker, idx) => {
                const x = padding.left + marker.p * graphWidth;
                return (
                  <g key={idx}>
                    <line
                      x1={x}
                      y1={padding.top}
                      x2={x}
                      y2={svgHeight - padding.bottom}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-zinc-800/60"
                      strokeWidth="1"
                      strokeDasharray="2 3"
                    />
                    <text
                      x={x}
                      y={svgHeight - padding.bottom + 18}
                      className="fill-slate-400 dark:fill-zinc-500"
                      fontSize="9.5"
                      textAnchor="middle"
                    >
                      {marker.label}
                    </text>
                  </g>
                );
              })}

              {/* ANSI 87L Trip Threshold Reference Line */}
              <line
                x1={padding.left}
                y1={yTripLimit}
                x2={svgWidth - padding.right}
                y2={yTripLimit}
                stroke="#f43f5e"
                strokeWidth="1.1"
                strokeDasharray="4 3"
              />
              <text
                x={svgWidth - padding.right - 6}
                y={yTripLimit - 5}
                fill="#f43f5e"
                fontSize="9.5"
                fontWeight="bold"
                textAnchor="end"
              >
                ANSI 87L TRIP LIMIT: {tripLimit.toFixed(2)}A
              </text>

              {/* Gradient Area under ΔI */}
              <path d={areaIdiff} fill="url(#gradIdiff)" />

              {/* Traces */}
              <path d={pathI1} fill="none" stroke="#10b981" strokeWidth="1.4" strokeLinecap="round" />
              <path d={pathI2} fill="none" stroke="#06b6d4" strokeWidth="1.4" strokeLinecap="round" />
              <path d={pathIdiff} fill="none" stroke="#f43f5e" strokeWidth="1.7" strokeLinecap="round" />

              {/* Hover Crosshair & Dots */}
              {hoverIndex !== null && data[hoverIndex] && (
                <g>
                  <line
                    x1={getX(hoverIndex)}
                    y1={padding.top}
                    x2={getX(hoverIndex)}
                    y2={svgHeight - padding.bottom}
                    stroke="#ffffff"
                    strokeWidth="1.0"
                    strokeDasharray="3 3"
                  />
                  <circle cx={getX(hoverIndex)} cy={getYCoord(data[hoverIndex].i1, minI, maxI)} r="3" fill="#10b981" stroke="#ffffff" strokeWidth="1" />
                  <circle cx={getX(hoverIndex)} cy={getYCoord(data[hoverIndex].i2, minI, maxI)} r="3" fill="#06b6d4" stroke="#ffffff" strokeWidth="1" />
                  <circle cx={getX(hoverIndex)} cy={getYCoord(data[hoverIndex].idiff, minI, maxI)} r="3.5" fill="#f43f5e" stroke="#ffffff" strokeWidth="1" />
                </g>
              )}

              {/* Mouse Interaction Overlay */}
              {data.map((_, idx) => (
                <rect
                  key={idx}
                  x={getX(idx) - graphWidth / (data.length * 2)}
                  y={padding.top}
                  width={graphWidth / data.length}
                  height={graphHeight}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoverIndex(idx)}
                />
              ))}
            </svg>

            {/* High-Readability Floating HUD Tooltip */}
            {hoveredPoint && (
              <div className="absolute top-2 left-20 border border-slate-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-950/95 text-slate-800 dark:text-zinc-100 px-3 py-1 rounded-sm flex items-center gap-3 text-xs shadow-md backdrop-blur-xs">
                <span className="text-slate-400 dark:text-zinc-400 font-mono">{hoveredPoint.timeLabel}</span>
                <span className="text-emerald-500 font-bold">I1: {hoveredPoint.i1.toFixed(3)}A</span>
                <span className="text-cyan-500 font-bold">I2: {hoveredPoint.i2.toFixed(3)}A</span>
                <span className={`font-bold ${hoveredPoint.idiff > tripLimit ? "text-rose-500 animate-pulse" : "text-rose-400"}`}>
                  ΔI: {hoveredPoint.idiff.toFixed(3)}A
                </span>
                <span className="text-slate-400 dark:text-zinc-500 text-[10px]">
                  (Margin: {Math.max(0, tripLimit - hoveredPoint.idiff).toFixed(3)}A)
                </span>
              </div>
            )}
          </div>

          {/* Stats Bar */}
          <div className="border-t border-slate-200 dark:border-zinc-800/80 px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/70 grid grid-cols-3 text-xs tabular-nums">
            <div>I1 (INCOMER): <span className="font-bold text-emerald-600 dark:text-emerald-400">{statsI1.cur.toFixed(3)}A</span> <span className="text-slate-400 dark:text-zinc-500">(Avg: {statsI1.avg.toFixed(2)}A)</span></div>
            <div>I2 (OUTGOING): <span className="font-bold text-cyan-600 dark:text-cyan-400">{statsI2.cur.toFixed(3)}A</span> <span className="text-slate-400 dark:text-zinc-500">(Avg: {statsI2.avg.toFixed(2)}A)</span></div>
            <div>FAULT LEAKAGE ΔI: <span className={`font-bold ${statsIdiff.cur > tripLimit ? "text-rose-500 animate-pulse" : "text-slate-800 dark:text-zinc-200"}`}>{statsIdiff.cur.toFixed(3)}A</span> <span className="text-slate-400 dark:text-zinc-500">(Max: {statsIdiff.max.toFixed(3)}A)</span></div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* CHART 2: BUS VOLTAGE STABILITY & GRID FREQUENCY */}
        {/* ============================================================== */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm flex flex-col overflow-hidden shadow-xs dark:shadow-none min-h-[300px]">
          {/* Card Header with Live Values */}
          <div className="flex flex-wrap items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/80 border-b border-slate-200 dark:border-zinc-800/80 text-xs">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-cyan-500" />
              <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs tracking-wide">
                2. BUS VOLTAGE STABILITY &amp; GRID FREQUENCY
              </span>
            </div>
            {/* Live Instantaneous Pill Badges */}
            <div className="flex items-center gap-3 text-xs tabular-nums font-semibold">
              <span className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400">
                <span className="h-2 w-2 rounded-full bg-cyan-500 shadow-xs" />
                V1: <span className="font-bold">{statsV1.cur.toFixed(1)}V</span>
              </span>
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-500 shadow-xs" />
                V2: <span className="font-bold">{statsV2.cur.toFixed(1)}V</span>
              </span>
              <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                <span className="h-2 w-2 rounded-full bg-purple-500 shadow-xs" />
                FREQ: <span className="font-bold">{statsFreq.cur.toFixed(2)}Hz</span>
              </span>
            </div>
          </div>

          {/* SVG Graph Area */}
          <div
            className="relative flex-1 bg-slate-50/50 dark:bg-[#070809] p-2 select-none min-h-[220px] h-[260px] xl:h-[285px]"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
              {/* Shaded Statutory Voltage Safe Zone (+/- 10%) */}
              <rect
                x={padding.left}
                y={Math.min(yOverV, yUnderV)}
                width={graphWidth}
                height={Math.abs(yUnderV - yOverV)}
                fill="#10b981"
                fillOpacity="0.04"
              />

              {/* Y-Axis Horizontal Gridlines & Labels */}
              {yTicks.map((p, idx) => {
                const val = minV + p * (maxV - minV);
                const y = getYCoord(val, minV, maxV);
                return (
                  <g key={idx}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={svgWidth - padding.right}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-zinc-800"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 3.5}
                      className="fill-slate-500 dark:fill-zinc-400"
                      fontSize="10"
                      fontWeight="500"
                      textAnchor="end"
                    >
                      {val.toFixed(0)}V
                    </text>
                  </g>
                );
              })}

              {/* X-Axis Vertical Time Guides & Labels */}
              {xTimeMarkers.map((marker, idx) => {
                const x = padding.left + marker.p * graphWidth;
                return (
                  <g key={idx}>
                    <line
                      x1={x}
                      y1={padding.top}
                      x2={x}
                      y2={svgHeight - padding.bottom}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-zinc-800/60"
                      strokeWidth="1"
                      strokeDasharray="2 3"
                    />
                    <text
                      x={x}
                      y={svgHeight - padding.bottom + 18}
                      className="fill-slate-400 dark:fill-zinc-500"
                      fontSize="9.5"
                      textAnchor="middle"
                    >
                      {marker.label}
                    </text>
                  </g>
                );
              })}

              {/* Statutory Voltage Limits (+10% / -10%) */}
              <line x1={padding.left} y1={yOverV} x2={svgWidth - padding.right} y2={yOverV} stroke="#f43f5e" strokeWidth="1.0" strokeDasharray="4 3" />
              <text x={svgWidth - padding.right - 6} y={yOverV - 5} fill="#f43f5e" fontSize="9" fontWeight="bold" textAnchor="end">+10% UPPER (253V)</text>

              <line x1={padding.left} y1={yUnderV} x2={svgWidth - padding.right} y2={yUnderV} stroke="#eab308" strokeWidth="1.0" strokeDasharray="4 3" />
              <text x={svgWidth - padding.right - 6} y={yUnderV + 12} fill="#eab308" fontSize="9" fontWeight="bold" textAnchor="end">-10% LOWER (207V)</text>

              {/* Traces */}
              <path d={pathV1} fill="none" stroke="#06b6d4" strokeWidth="1.4" strokeLinecap="round" />
              <path d={pathV2} fill="none" stroke="#eab308" strokeWidth="1.4" strokeLinecap="round" />

              {/* Hover Crosshair & Dots */}
              {hoverIndex !== null && data[hoverIndex] && (
                <g>
                  <line
                    x1={getX(hoverIndex)}
                    y1={padding.top}
                    x2={getX(hoverIndex)}
                    y2={svgHeight - padding.bottom}
                    stroke="#ffffff"
                    strokeWidth="1.0"
                    strokeDasharray="3 3"
                  />
                  <circle cx={getX(hoverIndex)} cy={getYCoord(data[hoverIndex].v1, minV, maxV)} r="3" fill="#06b6d4" stroke="#ffffff" strokeWidth="1" />
                  <circle cx={getX(hoverIndex)} cy={getYCoord(data[hoverIndex].v2, minV, maxV)} r="3" fill="#eab308" stroke="#ffffff" strokeWidth="1" />
                </g>
              )}

              {/* Mouse Interaction Overlay */}
              {data.map((_, idx) => (
                <rect
                  key={idx}
                  x={getX(idx) - graphWidth / (data.length * 2)}
                  y={padding.top}
                  width={graphWidth / data.length}
                  height={graphHeight}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoverIndex(idx)}
                />
              ))}
            </svg>

            {/* High-Readability Floating HUD Tooltip */}
            {hoveredPoint && (
              <div className="absolute top-2 left-20 border border-slate-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-950/95 text-slate-800 dark:text-zinc-100 px-3 py-1 rounded-sm flex items-center gap-3 text-xs shadow-md backdrop-blur-xs">
                <span className="text-slate-400 dark:text-zinc-400 font-mono">{hoveredPoint.timeLabel}</span>
                <span className="text-cyan-500 font-bold">V1: {hoveredPoint.v1.toFixed(1)}V</span>
                <span className="text-amber-500 font-bold">V2: {hoveredPoint.v2.toFixed(1)}V</span>
                <span className="text-purple-400 font-bold">FREQ: {(hoveredPoint.freq1 ?? 50.0).toFixed(2)}Hz</span>
                <span className="text-slate-400 dark:text-zinc-500 text-[10px]">
                  (ΔV: {Math.abs(hoveredPoint.v1 - hoveredPoint.v2).toFixed(1)}V)
                </span>
              </div>
            )}
          </div>

          {/* Stats Bar */}
          <div className="border-t border-slate-200 dark:border-zinc-800/80 px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/70 grid grid-cols-3 text-xs tabular-nums">
            <div>V1 (SUBSTATION): <span className="font-bold text-cyan-600 dark:text-cyan-400">{statsV1.cur.toFixed(1)}V</span> <span className="text-slate-400 dark:text-zinc-500">(Avg: {statsV1.avg.toFixed(1)}V)</span></div>
            <div>V2 (LOAD END): <span className="font-bold text-amber-600 dark:text-amber-400">{statsV2.cur.toFixed(1)}V</span> <span className="text-slate-400 dark:text-zinc-500">(Avg: {statsV2.avg.toFixed(1)}V)</span></div>
            <div>FREQUENCY: <span className="font-bold text-purple-600 dark:text-purple-400">{statsFreq.cur.toFixed(2)} Hz</span> <span className="text-emerald-500 font-semibold">(50Hz Nominal)</span></div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* CHART 3: POWER TRIANGLE (ACTIVE, REACTIVE, APPARENT & PF) */}
        {/* ============================================================== */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm flex flex-col overflow-hidden shadow-xs dark:shadow-none min-h-[300px]">
          {/* Card Header with Live Values */}
          <div className="flex flex-wrap items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/80 border-b border-slate-200 dark:border-zinc-800/80 text-xs">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs tracking-wide">
                3. POWER TRIANGLE (P / Q / S) &amp; POWER FACTOR
              </span>
            </div>
            {/* Live Instantaneous Pill Badges */}
            <div className="flex items-center gap-2.5 text-xs tabular-nums font-semibold">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                P: <span className="font-bold">{statsP1.cur.toFixed(2)}kW</span>
              </span>
              <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Q: <span className="font-bold">{statsQ1.cur.toFixed(2)}kvar</span>
              </span>
              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                S: <span className="font-bold">{statsS1.cur.toFixed(2)}kVA</span>
              </span>
              <span className="flex items-center gap-1 text-amber-500">
                PF: <span className="font-bold">{statsPf.cur.toFixed(2)}</span>
              </span>
            </div>
          </div>

          {/* SVG Graph Area */}
          <div
            className="relative flex-1 bg-slate-50/50 dark:bg-[#070809] p-2 select-none min-h-[220px] h-[260px] xl:h-[285px]"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
              <defs>
                <linearGradient id="gradPActive" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Y-Axis Horizontal Gridlines & Labels */}
              {yTicks.map((p, idx) => {
                const val = minP + p * (maxP - minP);
                const y = getYCoord(val, minP, maxP);
                return (
                  <g key={idx}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={svgWidth - padding.right}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-zinc-800"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 3.5}
                      className="fill-slate-500 dark:fill-zinc-400"
                      fontSize="10"
                      fontWeight="500"
                      textAnchor="end"
                    >
                      {val.toFixed(2)}kW
                    </text>
                  </g>
                );
              })}

              {/* X-Axis Vertical Time Guides & Labels */}
              {xTimeMarkers.map((marker, idx) => {
                const x = padding.left + marker.p * graphWidth;
                return (
                  <g key={idx}>
                    <line
                      x1={x}
                      y1={padding.top}
                      x2={x}
                      y2={svgHeight - padding.bottom}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-zinc-800/60"
                      strokeWidth="1"
                      strokeDasharray="2 3"
                    />
                    <text
                      x={x}
                      y={svgHeight - padding.bottom + 18}
                      className="fill-slate-400 dark:fill-zinc-500"
                      fontSize="9.5"
                      textAnchor="middle"
                    >
                      {marker.label}
                    </text>
                  </g>
                );
              })}

              {/* Gradient Area under Active Power P */}
              <path d={areaPActive} fill="url(#gradPActive)" />

              {/* Traces */}
              <path d={pathSApparent} fill="none" stroke="#3b82f6" strokeWidth="1.3" strokeLinecap="round" />
              <path d={pathPActive} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />
              <path d={pathQReactive} fill="none" stroke="#f43f5e" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="4 3" />

              {/* Hover Crosshair & Dots */}
              {hoverIndex !== null && data[hoverIndex] && (
                <g>
                  <line
                    x1={getX(hoverIndex)}
                    y1={padding.top}
                    x2={getX(hoverIndex)}
                    y2={svgHeight - padding.bottom}
                    stroke="#ffffff"
                    strokeWidth="1.0"
                    strokeDasharray="3 3"
                  />
                  <circle cx={getX(hoverIndex)} cy={getYCoord((data[hoverIndex].s1 ?? 0) / 1000, minP, maxP)} r="3" fill="#3b82f6" stroke="#ffffff" strokeWidth="1" />
                  <circle cx={getX(hoverIndex)} cy={getYCoord((data[hoverIndex].p1 ?? 0) / 1000, minP, maxP)} r="3" fill="#10b981" stroke="#ffffff" strokeWidth="1" />
                  <circle cx={getX(hoverIndex)} cy={getYCoord((data[hoverIndex].q1 ?? 0) / 1000, minP, maxP)} r="3" fill="#f43f5e" stroke="#ffffff" strokeWidth="1" />
                </g>
              )}

              {/* Mouse Interaction Overlay */}
              {data.map((_, idx) => (
                <rect
                  key={idx}
                  x={getX(idx) - graphWidth / (data.length * 2)}
                  y={padding.top}
                  width={graphWidth / data.length}
                  height={graphHeight}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoverIndex(idx)}
                />
              ))}
            </svg>

            {/* High-Readability Floating HUD Tooltip */}
            {hoveredPoint && (
              <div className="absolute top-2 left-20 border border-slate-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-950/95 text-slate-800 dark:text-zinc-100 px-3 py-1 rounded-sm flex items-center gap-3 text-xs shadow-md backdrop-blur-xs">
                <span className="text-slate-400 dark:text-zinc-400 font-mono">{hoveredPoint.timeLabel}</span>
                <span className="text-emerald-500 font-bold">P: {((hoveredPoint.p1 ?? 0) / 1000).toFixed(2)}kW</span>
                <span className="text-rose-400 font-bold">Q: {((hoveredPoint.q1 ?? 0) / 1000).toFixed(2)}kvar</span>
                <span className="text-blue-400 font-bold">S: {((hoveredPoint.s1 ?? 0) / 1000).toFixed(2)}kVA</span>
                <span className="text-amber-400 font-bold">PF: {(hoveredPoint.pf1 ?? 0.96).toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Stats Bar */}
          <div className="border-t border-slate-200 dark:border-zinc-800/80 px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/70 grid grid-cols-4 text-xs tabular-nums">
            <div>ACTIVE P: <span className="font-bold text-emerald-600 dark:text-emerald-400">{statsP1.cur.toFixed(2)} kW</span></div>
            <div>REACTIVE Q: <span className="font-bold text-rose-600 dark:text-rose-400">{statsQ1.cur.toFixed(2)} kvar</span></div>
            <div>APPARENT S: <span className="font-bold text-blue-600 dark:text-blue-400">{statsS1.cur.toFixed(2)} kVA</span></div>
            <div>PF: <span className="font-bold text-amber-500">{statsPf.cur.toFixed(2)}</span> <span className="text-slate-400 dark:text-zinc-500">(Lagging)</span></div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* CHART 4: TECHNICAL LINE LOSS & SPAN VOLTAGE DROP */}
        {/* ============================================================== */}
        <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm flex flex-col overflow-hidden shadow-xs dark:shadow-none min-h-[300px]">
          {/* Card Header with Live Values */}
          <div className="flex flex-wrap items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/80 border-b border-slate-200 dark:border-zinc-800/80 text-xs">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-amber-500" />
              <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs tracking-wide">
                4. TECHNICAL LINE LOSS (ΔP) &amp; SPAN VOLTAGE DROP (ΔV)
              </span>
            </div>
            {/* Live Instantaneous Pill Badges */}
            <div className="flex items-center gap-3 text-xs tabular-nums font-semibold">
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-500 shadow-xs" />
                LOSS ΔP: <span className="font-bold">{statsLossW.cur.toFixed(1)}W</span>
              </span>
              <span className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400">
                <span className="h-2 w-2 rounded-full bg-cyan-500 shadow-xs" />
                DROP ΔV: <span className="font-bold">{statsVDrop.cur.toFixed(1)}V</span>
              </span>
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-xs" />
                EFFICIENCY: <span className="font-bold">
                  {statsP1.cur > 0
                    ? `${(Math.max(0, 100 - (statsLossW.cur / (statsP1.cur * 1000)) * 100)).toFixed(2)}%`
                    : "99.8%"}
                </span>
              </span>
            </div>
          </div>

          {/* SVG Graph Area */}
          <div
            className="relative flex-1 bg-slate-50/50 dark:bg-[#070809] p-2 select-none min-h-[220px] h-[260px] xl:h-[285px]"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
              <defs>
                <linearGradient id="gradLoss" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#f97316" stopOpacity="0.13" />
                  <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Y-Axis Horizontal Gridlines & Labels */}
              {yTicks.map((p, idx) => {
                const val = minLoss + p * (maxLoss - minLoss);
                const y = getYCoord(val, minLoss, maxLoss);
                return (
                  <g key={idx}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={svgWidth - padding.right}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-zinc-800"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 3.5}
                      className="fill-slate-500 dark:fill-zinc-400"
                      fontSize="10"
                      fontWeight="500"
                      textAnchor="end"
                    >
                      {val.toFixed(0)}W
                    </text>
                  </g>
                );
              })}

              {/* X-Axis Vertical Time Guides & Labels */}
              {xTimeMarkers.map((marker, idx) => {
                const x = padding.left + marker.p * graphWidth;
                return (
                  <g key={idx}>
                    <line
                      x1={x}
                      y1={padding.top}
                      x2={x}
                      y2={svgHeight - padding.bottom}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-zinc-800/60"
                      strokeWidth="1"
                      strokeDasharray="2 3"
                    />
                    <text
                      x={x}
                      y={svgHeight - padding.bottom + 18}
                      className="fill-slate-400 dark:fill-zinc-500"
                      fontSize="9.5"
                      textAnchor="middle"
                    >
                      {marker.label}
                    </text>
                  </g>
                );
              })}

              {/* Gradient Area under Conductor Line Loss */}
              <path d={areaLoss} fill="url(#gradLoss)" />

              {/* Traces */}
              <path d={pathLoss} fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" />
              <path d={pathVDrop} fill="none" stroke="#06b6d4" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="4 3" />

              {/* Hover Crosshair & Dots */}
              {hoverIndex !== null && data[hoverIndex] && (
                <g>
                  <line
                    x1={getX(hoverIndex)}
                    y1={padding.top}
                    x2={getX(hoverIndex)}
                    y2={svgHeight - padding.bottom}
                    stroke="#ffffff"
                    strokeWidth="1.0"
                    strokeDasharray="3 3"
                  />
                  <circle cx={getX(hoverIndex)} cy={getYCoord(data[hoverIndex].pLoss ?? 0, minLoss, maxLoss)} r="3" fill="#f97316" stroke="#ffffff" strokeWidth="1" />
                </g>
              )}

              {/* Mouse Interaction Overlay */}
              {data.map((_, idx) => (
                <rect
                  key={idx}
                  x={getX(idx) - graphWidth / (data.length * 2)}
                  y={padding.top}
                  width={graphWidth / data.length}
                  height={graphHeight}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoverIndex(idx)}
                />
              ))}
            </svg>

            {/* High-Readability Floating HUD Tooltip */}
            {hoveredPoint && (
              <div className="absolute top-2 left-20 border border-slate-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-950/95 text-slate-800 dark:text-zinc-100 px-3 py-1 rounded-sm flex items-center gap-3 text-xs shadow-md backdrop-blur-xs">
                <span className="text-slate-400 dark:text-zinc-400 font-mono">{hoveredPoint.timeLabel}</span>
                <span className="text-amber-500 font-bold">ΔP: {(hoveredPoint.pLoss ?? 0).toFixed(1)}W</span>
                <span className="text-cyan-500 font-bold">ΔV: {(hoveredPoint.vDrop ?? 0).toFixed(1)}V</span>
                <span className="text-emerald-500 font-bold">
                  η: {hoveredPoint.p1 && hoveredPoint.p1 > 0
                    ? `${(Math.max(0, 100 - ((hoveredPoint.pLoss ?? 0) / hoveredPoint.p1) * 100)).toFixed(2)}%`
                    : "99.8%"}
                </span>
              </div>
            )}
          </div>

          {/* Stats Bar */}
          <div className="border-t border-slate-200 dark:border-zinc-800/80 px-3.5 py-2 bg-slate-50 dark:bg-zinc-950/70 grid grid-cols-3 text-xs tabular-nums">
            <div>LINE LOSS (I²R): <span className="font-bold text-amber-600 dark:text-amber-400">{statsLossW.cur.toFixed(1)} W</span> <span className="text-slate-400 dark:text-zinc-500">(Avg: {statsLossW.avg.toFixed(1)} W)</span></div>
            <div>SPAN DROP (ΔV): <span className="font-bold text-cyan-600 dark:text-cyan-400">{statsVDrop.cur.toFixed(1)} V</span> <span className="text-slate-400 dark:text-zinc-500">(Norm: &lt;3%)</span></div>
            <div>SPAN EFFICIENCY: <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {statsP1.cur > 0
                ? `${(Math.max(0, 100 - (statsLossW.cur / (statsP1.cur * 1000)) * 100)).toFixed(2)}%`
                : "99.8%"}
            </span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
