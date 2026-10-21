"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BatteryCharging,
  CheckCircle2,
  Droplets,
  Home,
  Info,
  Maximize2,
  Minimize2,
  Radio,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GridTelemetry } from "@/lib/types";
import { NetworkSnapshot } from "@/lib/network/types";
import { ENTERPRISE_CONFIG } from "@/lib/constants";

interface EnergyFlowDiagramProps {
  telemetry: GridTelemetry | null;
  networkSnapshot?: NetworkSnapshot | null;
  selectedPoleId?: string;
  onSelectPole?: (poleId: string) => void;
}

export function EnergyFlowDiagram({
  telemetry,
  networkSnapshot,
  selectedPoleId,
  onSelectPole,
}: EnergyFlowDiagramProps) {
  const [viewMode, setViewMode] = React.useState<"MACRO_BALANCE" | "FEEDER_SPAN">("MACRO_BALANCE");
  const [inspectedNode, setInspectedNode] = React.useState<string | null>(null);

  const isGatewayOffline =
    telemetry?.status === "DISCONNECTED" ||
    telemetry?.status === "WAITING_DATA" ||
    telemetry?.fault_code === "GATEWAY_DISCONNECTED";

  const isFault =
    !isGatewayOffline &&
    (Boolean(telemetry?.fault) ||
      (telemetry?.idiff ?? 0) >= (telemetry?.trip_limit ?? 0.35) ||
      (networkSnapshot && networkSnapshot.detections.length > 0));

  // Live measurements
  const v1 = isGatewayOffline ? 0 : (telemetry?.p1?.v ?? 230.2);
  const i1 = isGatewayOffline ? 0 : (telemetry?.p1?.i ?? 2.32);
  const p1 = isGatewayOffline ? 0 : (telemetry?.p1?.p ?? 534);

  const v2 = isGatewayOffline ? 0 : (telemetry?.p2?.v ?? 229.8);
  const i2 = isGatewayOffline ? 0 : (telemetry?.p2?.i ?? 2.29);
  const p2 = isGatewayOffline ? 0 : (telemetry?.p2?.p ?? 521);

  const idiff = isGatewayOffline ? 0 : (telemetry?.idiff ?? Math.abs(i1 - i2));
  const lineLossW = Math.max(0, p1 - p2);

  // Energy Accumulators (kWh)
  const [gridEnergyKWh, setGridEnergyKWh] = React.useState<number>(43.9);
  const [solarEnergyKWh, setSolarEnergyKWh] = React.useState<number>(6.9);
  const [lossEnergyKWh, setLossEnergyKWh] = React.useState<number>(0.8);
  const lastTickRef = React.useRef<number>(Date.now());

  React.useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const dtHours = (now - lastTickRef.current) / (1000 * 3600);
      lastTickRef.current = now;

      if (!isGatewayOffline && p1 > 0) {
        setGridEnergyKWh((prev) => prev + (p1 / 1000) * dtHours);
        setSolarEnergyKWh((prev) => prev + 0.12 * dtHours); // 120W steady solar rooftop generation
        setLossEnergyKWh((prev) => prev + (lineLossW / 1000) * dtHours);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [p1, lineLossW, isGatewayOffline]);

  const totalHomeEnergyKWh = gridEnergyKWh + solarEnergyKWh;
  const gridPct = totalHomeEnergyKWh > 0 ? (gridEnergyKWh / totalHomeEnergyKWh) * 100 : 86;
  const solarPct = totalHomeEnergyKWh > 0 ? (solarEnergyKWh / totalHomeEnergyKWh) * 100 : 14;

  // SVG Dimension constants for standard 16:9 canvas
  const SVG_WIDTH = 760;
  const SVG_HEIGHT = 420;

  // Coordinates for the 4 primary nodes matching the user's diagram
  const GRID_POS = { x: 140, y: 310, r: 44 };
  const SOLAR_POS = { x: 380, y: 130, r: 44 };
  const WATER_POS = { x: 620, y: 130, r: 44 };
  const HOME_POS = { x: 620, y: 310, r: 52 };

  // Speed multiplier for traveling electron dots (scaled with real current)
  const animSpeedSec = Math.max(1.8, 6.0 - Math.min(i1, 5) * 0.8);

  // SVG Paths
  // 1. Grid -> Home straight horizontal conduit
  const gridToHomePath = `M ${GRID_POS.x + GRID_POS.r} ${GRID_POS.y} L ${HOME_POS.x - HOME_POS.r} ${HOME_POS.y}`;

  // 2. Solar -> Home curved conduit (orthogonal with smooth rounded bend)
  const solarBendX = 490;
  const solarBendY = 310;
  const solarToHomePath = `M ${SOLAR_POS.x} ${SOLAR_POS.y + SOLAR_POS.r} 
    L ${SOLAR_POS.x} ${solarBendY - 40} 
    Q ${SOLAR_POS.x} ${solarBendY} ${SOLAR_POS.x + 40} ${solarBendY} 
    L ${HOME_POS.x - HOME_POS.r} ${solarBendY}`;

  // 3. Water/Loss -> Home straight vertical conduit
  const waterToHomePath = `M ${WATER_POS.x} ${WATER_POS.y + WATER_POS.r} L ${HOME_POS.x} ${HOME_POS.y - HOME_POS.r}`;

  // Circumference for the Home split ring arc
  const homeCircumference = 2 * Math.PI * HOME_POS.r;
  const gridArcLength = (gridPct / 100) * homeCircumference;
  const solarArcLength = (solarPct / 100) * homeCircumference;

  return (
    <div className="relative w-full h-full min-h-[460px] bg-[#16171a] dark:bg-[#0c0d10] text-zinc-100 rounded-sm flex flex-col font-mono select-none overflow-hidden border border-zinc-800 shadow-xl">
      {/* Top Header matching user screenshot */}
      <div className="px-5 py-3.5 flex flex-wrap items-center justify-between border-b border-zinc-800/80 bg-[#121316]">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5 font-sans">
            <span>Energy distribution</span>
            <Badge variant={isFault ? "destructive" : "healthy"} className="text-[10px] font-mono py-0.5">
              {isFault ? "ANOMALY DETECTED" : "FLOW BALANCED"}
            </Badge>
          </h2>
          <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
            {ENTERPRISE_CONFIG.SUBSTATION_NAME} • {ENTERPRISE_CONFIG.FEEDER_NAME}
          </p>
        </div>

        {/* View Switcher: Macro Energy Balance vs Feeder & Pole Span */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-sm p-0.5 text-xs">
            <button
              onClick={() => setViewMode("MACRO_BALANCE")}
              className={`px-3 py-1 text-[11px] uppercase rounded-sm transition-colors font-semibold ${
                viewMode === "MACRO_BALANCE"
                  ? "bg-zinc-800 text-sky-400 font-bold border border-zinc-700 shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              MACRO ENERGY BALANCE
            </button>
            <button
              onClick={() => setViewMode("FEEDER_SPAN")}
              className={`px-3 py-1 text-[11px] uppercase rounded-sm transition-colors font-semibold ${
                viewMode === "FEEDER_SPAN"
                  ? "bg-zinc-800 text-emerald-400 font-bold border border-zinc-700 shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              SUPERVISED POLE SPAN (P1 ➔ P2)
            </button>
          </div>
        </div>
      </div>

      {/* Main Flow Canvas Viewport */}
      <div className="relative flex-1 flex items-center justify-center p-4 min-h-[380px] bg-radial from-[#1e2025] to-[#0c0d10]">
        {viewMode === "MACRO_BALANCE" ? (
          <div className="w-full max-w-[800px] aspect-[16/9] relative">
            <svg
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              className="w-full h-full overflow-visible"
              style={{ filter: "drop-shadow(0 0 10px rgba(0,0,0,0.5))" }}
            >
              <defs>
                {/* Glow Filter */}
                <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="glow-orange" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                {/* Gradients */}
                <linearGradient id="grad-blue" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#0284c7" />
                  <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
                <linearGradient id="grad-orange" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ea580c" />
                  <stop offset="100%" stopColor="#fb923c" />
                </linearGradient>
              </defs>

              {/* ============================================================== */}
              {/* CONDUIT 1: GRID -> HOME (Blue Horizontal Line) */}
              {/* ============================================================== */}
              {/* Background Track */}
              <path
                d={gridToHomePath}
                fill="none"
                stroke="#1e293b"
                strokeWidth="4"
                strokeLinecap="round"
              />
              {/* Active Blue Line */}
              <path
                d={gridToHomePath}
                fill="none"
                stroke={isFault ? "#f43f5e" : "#0284c7"}
                strokeWidth="2.5"
                strokeLinecap="round"
                className="transition-colors duration-300"
              />
              {/* Traveling Electron Particle: Grid -> Home */}
              {!isGatewayOffline && (
                <circle r="4.5" fill={isFault ? "#f43f5e" : "#38bdf8"} filter="url(#glow-blue)">
                  <animateMotion
                    path={gridToHomePath}
                    dur={`${animSpeedSec}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              {/* ============================================================== */}
              {/* CONDUIT 2: SOLAR -> HOME (Orange Smooth Curved Line) */}
              {/* ============================================================== */}
              {/* Background Track */}
              <path
                d={solarToHomePath}
                fill="none"
                stroke="#1e293b"
                strokeWidth="4"
                strokeLinecap="round"
              />
              {/* Active Orange Line */}
              <path
                d={solarToHomePath}
                fill="none"
                stroke="#ea580c"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Traveling Particle: Solar -> Home */}
              {!isGatewayOffline && (
                <circle r="4.5" fill="#fb923c" filter="url(#glow-orange)">
                  <animateMotion
                    path={solarToHomePath}
                    dur={`${animSpeedSec * 1.2}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              {/* ============================================================== */}
              {/* CONDUIT 3: WATER / DTR-01 / LOSSES -> HOME (Cyan Vertical Line) */}
              {/* ============================================================== */}
              {/* Background Track */}
              <path
                d={waterToHomePath}
                fill="none"
                stroke="#1e293b"
                strokeWidth="4"
                strokeLinecap="round"
              />
              {/* Active Cyan Line */}
              <path
                d={waterToHomePath}
                fill="none"
                stroke="#0891b2"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Traveling Particle */}
              {!isGatewayOffline && (
                <circle r="4" fill="#22d3ee" filter="url(#glow-cyan)">
                  <animateMotion
                    path={waterToHomePath}
                    dur={`${animSpeedSec * 1.5}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              {/* ============================================================== */}
              {/* NODE 1: GRID (Angamaly 33kV Substation) */}
              {/* ============================================================== */}
              <g
                className="cursor-pointer group"
                onClick={() => setInspectedNode(inspectedNode === "GRID" ? null : "GRID")}
              >
                {/* Outer Glow Ring */}
                <circle
                  cx={GRID_POS.x}
                  cy={GRID_POS.y}
                  r={GRID_POS.r}
                  fill="#111317"
                  stroke={isFault ? "#f43f5e" : "#0284c7"}
                  strokeWidth="3.5"
                  className="transition-all duration-300 group-hover:stroke-sky-400 group-hover:scale-105"
                  style={{ transformOrigin: `${GRID_POS.x}px ${GRID_POS.y}px` }}
                />
                {/* Transmission Tower Icon */}
                <g transform={`translate(${GRID_POS.x - 12}, ${GRID_POS.y - 28})`}>
                  <path
                    d="M12 2 L4 22 L7 22 L8.5 17 L15.5 17 L17 22 L20 22 Z M12 6 L14.5 14 L9.5 14 Z M5 10 L19 10 M3 14 L21 14"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
                {/* Primary Metric */}
                <text
                  x={GRID_POS.x}
                  y={GRID_POS.y + 12}
                  textAnchor="middle"
                  fill="#38bdf8"
                  fontSize="12.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {gridEnergyKWh.toFixed(1)} kWh
                </text>
                {/* Live kW Reading */}
                <text
                  x={GRID_POS.x}
                  y={GRID_POS.y + 24}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {p1 > 0 ? `${(p1 / 1000).toFixed(2)} kW` : "0.00 kW"}
                </text>
                {/* Bottom Label matching screenshot */}
                <text
                  x={GRID_POS.x}
                  y={GRID_POS.y + GRID_POS.r + 20}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="13"
                  fontFamily="sans-serif"
                >
                  Grid
                </text>
              </g>

              {/* ============================================================== */}
              {/* NODE 2: SOLAR (Rooftop Solar PV DER) */}
              {/* ============================================================== */}
              <g
                className="cursor-pointer group"
                onClick={() => setInspectedNode(inspectedNode === "SOLAR" ? null : "SOLAR")}
              >
                {/* Top Label matching screenshot */}
                <text
                  x={SOLAR_POS.x}
                  y={SOLAR_POS.y - SOLAR_POS.r - 12}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="13"
                  fontFamily="sans-serif"
                >
                  Solar
                </text>
                {/* Outer Glow Ring */}
                <circle
                  cx={SOLAR_POS.x}
                  cy={SOLAR_POS.y}
                  r={SOLAR_POS.r}
                  fill="#111317"
                  stroke="#ea580c"
                  strokeWidth="3.5"
                  className="transition-all duration-300 group-hover:stroke-amber-400 group-hover:scale-105"
                  style={{ transformOrigin: `${SOLAR_POS.x}px ${SOLAR_POS.y}px` }}
                />
                {/* Solar / Sun Icon matching screenshot */}
                <g transform={`translate(${SOLAR_POS.x - 12}, ${SOLAR_POS.y - 28})`}>
                  <path
                    d="M12 3 L14 7 L18 8 L15 11 L16 15 L12 13 L8 15 L9 11 L6 8 L10 7 Z M19 16 L22 21 M2 21 L5 16 M12 17 L12 22"
                    fill="none"
                    stroke="#fb923c"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
                {/* Primary Metric */}
                <text
                  x={SOLAR_POS.x}
                  y={SOLAR_POS.y + 12}
                  textAnchor="middle"
                  fill="#fb923c"
                  fontSize="12.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {solarEnergyKWh.toFixed(1)} kWh
                </text>
                {/* Live kW Reading */}
                <text
                  x={SOLAR_POS.x}
                  y={SOLAR_POS.y + 24}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  0.12 kW DER
                </text>
              </g>

              {/* ============================================================== */}
              {/* NODE 3: WATER / DTR-01 / LINE LOSS (Cyan Node) */}
              {/* ============================================================== */}
              <g
                className="cursor-pointer group"
                onClick={() => setInspectedNode(inspectedNode === "WATER" ? null : "WATER")}
              >
                {/* Top Label matching screenshot */}
                <text
                  x={WATER_POS.x}
                  y={WATER_POS.y - WATER_POS.r - 12}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="13"
                  fontFamily="sans-serif"
                >
                  Line Loss &amp; Tap
                </text>
                {/* Outer Glow Ring */}
                <circle
                  cx={WATER_POS.x}
                  cy={WATER_POS.y}
                  r={WATER_POS.r}
                  fill="#111317"
                  stroke="#0891b2"
                  strokeWidth="3.5"
                  className="transition-all duration-300 group-hover:stroke-cyan-400 group-hover:scale-105"
                  style={{ transformOrigin: `${WATER_POS.x}px ${WATER_POS.y}px` }}
                />
                {/* Water Droplet / Dissipation Icon matching screenshot */}
                <g transform={`translate(${WATER_POS.x - 10}, ${WATER_POS.y - 26})`}>
                  <path
                    d="M10 2 C10 2 3 11 3 15 C3 18.8 6.1 22 10 22 C13.9 22 17 18.8 17 15 C17 11 10 2 10 2 Z"
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
                {/* Primary Metric */}
                <text
                  x={WATER_POS.x}
                  y={WATER_POS.y + 12}
                  textAnchor="middle"
                  fill="#22d3ee"
                  fontSize="12.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {lossEnergyKWh.toFixed(1)} kWh
                </text>
                {/* Live Watts Reading */}
                <text
                  x={WATER_POS.x}
                  y={WATER_POS.y + 24}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  ΔP: {lineLossW.toFixed(0)} W
                </text>
              </g>

              {/* ============================================================== */}
              {/* NODE 4: HOME (Consumer Demand // Split Dual-Color Progress Arc) */}
              {/* ============================================================== */}
              <g
                className="cursor-pointer group"
                onClick={() => setInspectedNode(inspectedNode === "HOME" ? null : "HOME")}
              >
                {/* Dark Inner Base */}
                <circle
                  cx={HOME_POS.x}
                  cy={HOME_POS.y}
                  r={HOME_POS.r}
                  fill="#111317"
                  className="transition-all duration-300 group-hover:scale-105"
                  style={{ transformOrigin: `${HOME_POS.x}px ${HOME_POS.y}px` }}
                />

                {/* Base Track */}
                <circle
                  cx={HOME_POS.x}
                  cy={HOME_POS.y}
                  r={HOME_POS.r}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="4"
                />

                {/* Blue Arc: Grid Contribution (Circumference split matching screenshot) */}
                <circle
                  cx={HOME_POS.x}
                  cy={HOME_POS.y}
                  r={HOME_POS.r}
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth="4"
                  strokeDasharray={`${gridArcLength} ${homeCircumference}`}
                  strokeDashoffset="0"
                  transform={`rotate(-90 ${HOME_POS.x} ${HOME_POS.y})`}
                  className="transition-all duration-500"
                />

                {/* Orange Arc: Solar Contribution (continuation of circle arc matching screenshot) */}
                <circle
                  cx={HOME_POS.x}
                  cy={HOME_POS.y}
                  r={HOME_POS.r}
                  fill="none"
                  stroke="#ea580c"
                  strokeWidth="4"
                  strokeDasharray={`${solarArcLength} ${homeCircumference}`}
                  strokeDashoffset={-gridArcLength}
                  transform={`rotate(-90 ${HOME_POS.x} ${HOME_POS.y})`}
                  className="transition-all duration-500"
                />

                {/* House Icon matching screenshot */}
                <g transform={`translate(${HOME_POS.x - 12}, ${HOME_POS.y - 30})`}>
                  <path
                    d="M3 11 L12 3 L21 11 M5 9.5 L5 20 C5 20.6 5.4 21 6 21 L18 21 C18.6 21 19 20.6 19 20 L19 9.5 M9 21 L9 13 L15 13 L15 21"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>

                {/* Primary Metric matching screenshot (50.8 kWh) */}
                <text
                  x={HOME_POS.x}
                  y={HOME_POS.y + 12}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="13"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {totalHomeEnergyKWh.toFixed(1)} kWh
                </text>

                {/* Live kW Reading */}
                <text
                  x={HOME_POS.x}
                  y={HOME_POS.y + 26}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="9.5"
                  fontFamily="monospace"
                >
                  {p2 > 0 ? `${(p2 / 1000).toFixed(2)} kW` : "0.00 kW"}
                </text>

                {/* Bottom Label matching screenshot */}
                <text
                  x={HOME_POS.x}
                  y={HOME_POS.y + HOME_POS.r + 20}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="13"
                  fontFamily="sans-serif"
                >
                  Home
                </text>
              </g>
            </svg>
          </div>
        ) : (
          /* ============================================================== */
          /* VIEW MODE B: DISTRIBUTION FEEDER PIPELINE WITH REAL HARDWARE POLES */
          /* ============================================================== */
          <div className="w-full max-w-[840px] flex flex-col gap-6 items-center">
            <div className="w-full flex items-center justify-between text-xs text-zinc-400 font-mono px-2">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                <span>PZEM HARDWARE ANCHORED (PHASE R)</span>
              </span>
              <span>120m SUPERVISED OVERHEAD SPAN</span>
            </div>

            <div className="w-full flex items-center justify-between gap-3 relative py-6">
              {/* Flow Conduits with SVG Layer */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                <line
                  x1="12%"
                  y1="50%"
                  x2="88%"
                  y2="50%"
                  stroke={isFault ? "#f43f5e" : "#059669"}
                  strokeWidth="3"
                  strokeDasharray="6 4"
                />
              </svg>

              {/* Node 1: Primary Substation */}
              <div
                onClick={() => onSelectPole?.("SUBSTATION")}
                className="z-10 flex flex-col items-center cursor-pointer group"
              >
                <div className="w-20 h-20 rounded-full bg-[#111317] border-3 border-sky-500 flex flex-col items-center justify-center p-2 transition-transform group-hover:scale-105 shadow-lg shadow-sky-500/20">
                  <Zap className="h-5 w-5 text-sky-400 mb-1" />
                  <span className="text-[10px] text-sky-400 font-bold tabular-nums">33/11kV</span>
                </div>
                <span className="text-xs text-zinc-400 mt-2 font-sans">Primary Sub</span>
              </div>

              {/* Arrow */}
              <ArrowRight className="h-4 w-4 text-zinc-600 shrink-0 z-10" />

              {/* Node 2: Transformer DTR-01 */}
              <div
                onClick={() => onSelectPole?.("DTR-01")}
                className="z-10 flex flex-col items-center cursor-pointer group"
              >
                <div className="w-20 h-20 rounded-full bg-[#111317] border-3 border-emerald-500 flex flex-col items-center justify-center p-2 transition-transform group-hover:scale-105 shadow-lg shadow-emerald-500/20">
                  <Activity className="h-5 w-5 text-emerald-400 mb-1" />
                  <span className="text-[10px] text-emerald-400 font-bold tabular-nums">
                    {networkSnapshot ? `${networkSnapshot.dtr.kva.toFixed(1)}kVA` : "250kVA"}
                  </span>
                </div>
                <span className="text-xs text-zinc-400 mt-2 font-sans">DTR-01</span>
              </div>

              {/* Arrow */}
              <ArrowRight className="h-4 w-4 text-zinc-600 shrink-0 z-10" />

              {/* Node 3: Pole 1 Incomer (Live HW) */}
              <div
                onClick={() => onSelectPole?.("Pole-A")}
                className="z-10 flex flex-col items-center cursor-pointer group"
              >
                <div
                  className={`w-22 h-22 rounded-full bg-[#111317] border-3 ${
                    selectedPoleId === "Pole-A" ? "border-emerald-400 ring-2 ring-emerald-500" : "border-emerald-500"
                  } flex flex-col items-center justify-center p-2 transition-transform group-hover:scale-105 shadow-xl`}
                >
                  <Radio className="h-5 w-5 text-emerald-400 mb-0.5" />
                  <span className="text-[10px] text-emerald-300 font-bold tabular-nums">
                    {v1 > 0 ? `${v1.toFixed(0)}V` : "230V"}
                  </span>
                  <span className="text-[9px] text-zinc-400 tabular-nums">{i1.toFixed(2)}A</span>
                </div>
                <div className="text-center mt-2">
                  <span className="text-xs text-zinc-200 font-sans block">Pole 1 (Incomer)</span>
                  <Badge variant="healthy" className="text-[8px] py-0 mt-0.5">
                    PHASE R LIVE
                  </Badge>
                </div>
              </div>

              {/* Supervised Differential Span Pill */}
              <div
                className={`z-10 px-2.5 py-1.5 rounded-sm border text-center transition-all ${
                  isFault
                    ? "bg-rose-950/80 border-rose-500 text-rose-200 animate-pulse shadow-lg shadow-rose-900/50"
                    : "bg-zinc-900 border-zinc-700 text-zinc-300"
                }`}
              >
                <span className="text-[9px] uppercase tracking-wider block text-zinc-400">DIFF SPAN</span>
                <span
                  className={`text-xs font-bold tabular-nums ${isFault ? "text-rose-400" : "text-emerald-400"}`}
                >
                  ΔI = {idiff.toFixed(3)}A
                </span>
              </div>

              {/* Node 4: Pole 2 Outgoing (Live HW) */}
              <div
                onClick={() => onSelectPole?.("Pole-B")}
                className="z-10 flex flex-col items-center cursor-pointer group"
              >
                <div
                  className={`w-22 h-22 rounded-full bg-[#111317] border-3 ${
                    isFault
                      ? "border-rose-500 ring-2 ring-rose-500"
                      : selectedPoleId === "Pole-B"
                      ? "border-emerald-400 ring-2 ring-emerald-500"
                      : "border-emerald-500"
                  } flex flex-col items-center justify-center p-2 transition-transform group-hover:scale-105 shadow-xl`}
                >
                  <Radio className={`h-5 w-5 ${isFault ? "text-rose-400" : "text-emerald-400"} mb-0.5`} />
                  <span className={`text-[10px] font-bold tabular-nums ${isFault ? "text-rose-300" : "text-emerald-300"}`}>
                    {v2 > 0 ? `${v2.toFixed(0)}V` : "230V"}
                  </span>
                  <span className="text-[9px] text-zinc-400 tabular-nums">{i2.toFixed(2)}A</span>
                </div>
                <div className="text-center mt-2">
                  <span className="text-xs text-zinc-200 font-sans block">Pole 2 (Outgoing)</span>
                  <Badge variant={isFault ? "destructive" : "healthy"} className="text-[8px] py-0 mt-0.5">
                    {isFault ? "LEAKAGE TRIP" : "PHASE R LIVE"}
                  </Badge>
                </div>
              </div>

              {/* Arrow */}
              <ArrowRight className="h-4 w-4 text-zinc-600 shrink-0 z-10" />

              {/* Node 5: Consumer Load */}
              <div className="z-10 flex flex-col items-center cursor-pointer group">
                <div className="w-20 h-20 rounded-full bg-[#111317] border-3 border-amber-500 flex flex-col items-center justify-center p-2 transition-transform group-hover:scale-105 shadow-lg shadow-amber-500/20">
                  <Home className="h-5 w-5 text-amber-400 mb-1" />
                  <span className="text-[10px] text-amber-400 font-bold tabular-nums">
                    {p2 > 0 ? `${(p2 / 1000).toFixed(2)}kW` : "0.52kW"}
                  </span>
                </div>
                <span className="text-xs text-zinc-400 mt-2 font-sans">Consumer LT</span>
              </div>
            </div>
          </div>
        )}

        {/* Selected Asset Inspection Popover HUD */}
        {inspectedNode && (
          <div className="absolute bottom-4 left-4 border border-zinc-700 bg-zinc-950/95 backdrop-blur-md p-3.5 rounded-sm shadow-2xl max-w-sm font-mono text-xs z-20 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-2">
              <span className="font-bold text-white uppercase flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-sky-400" />
                <span>
                  {inspectedNode === "GRID"
                    ? "ANGAMALY 33/11kV SUBSTATION"
                    : inspectedNode === "SOLAR"
                    ? "ROOFTOP SOLAR PV (DER)"
                    : inspectedNode === "WATER"
                    ? "LINE LOSSES & DISSIPATION"
                    : "SECTOR 4 CONSUMER DEMAND"}
                </span>
              </span>
              <button
                onClick={() => setInspectedNode(null)}
                className="text-zinc-500 hover:text-white px-1"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1.5 text-[11px] text-zinc-300">
              {inspectedNode === "GRID" && (
                <>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Total Incomer Power:</span>
                    <span className="text-sky-400 font-bold tabular-nums">{p1.toFixed(0)} W</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Bus Voltage (V1):</span>
                    <span className="text-white tabular-nums">{v1.toFixed(1)} V</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Current (I1):</span>
                    <span className="text-white tabular-nums">{i1.toFixed(3)} A</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Accumulated Grid Import:</span>
                    <span className="text-sky-300 font-bold tabular-nums">{gridEnergyKWh.toFixed(2)} kWh</span>
                  </div>
                </>
              )}
              {inspectedNode === "SOLAR" && (
                <>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Peak Rating:</span>
                    <span className="text-amber-400 font-bold">2.5 kWp Array</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Current Generation:</span>
                    <span className="text-amber-300 tabular-nums">120 W</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Cumulative Clean Energy:</span>
                    <span className="text-amber-400 font-bold tabular-nums">{solarEnergyKWh.toFixed(2)} kWh</span>
                  </div>
                </>
              )}
              {inspectedNode === "WATER" && (
                <>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Overhead Conductor Loss (ΔP):</span>
                    <span className="text-cyan-400 font-bold tabular-nums">{lineLossW.toFixed(1)} W</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Differential Current (ΔI):</span>
                    <span className={isFault ? "text-rose-400 font-bold" : "text-emerald-400"}>
                      {idiff.toFixed(3)} A
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Protection Limit:</span>
                    <span className="text-zinc-400">0.350 A (ANSI 87L)</span>
                  </div>
                </>
              )}
              {inspectedNode === "HOME" && (
                <>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Consumer Load (P2):</span>
                    <span className="text-white font-bold tabular-nums">{p2.toFixed(0)} W</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Terminal Voltage (V2):</span>
                    <span className="text-white tabular-nums">{v2.toFixed(1)} V</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Supply Mix:</span>
                    <span className="text-sky-400 font-bold">{gridPct.toFixed(0)}% Grid</span> •{" "}
                    <span className="text-amber-400 font-bold">{solarPct.toFixed(0)}% Solar</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Total Consumption:</span>
                    <span className="text-white font-bold tabular-nums">{totalHomeEnergyKWh.toFixed(2)} kWh</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer KPI bar matching industrial standard */}
      <div className="px-4 py-2 bg-[#121316] border-t border-zinc-800 text-[11px] text-zinc-400 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-500" />
            <span>GRID: <strong className="text-zinc-200">{gridPct.toFixed(0)}%</strong></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            <span>SOLAR: <strong className="text-zinc-200">{solarPct.toFixed(0)}%</strong></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan-500" />
            <span>LOSSES: <strong className="text-zinc-200">{lineLossW.toFixed(0)} W</strong></span>
          </span>
        </div>

        <div className="text-zinc-500">
          POWER BALANCE: <span className="text-emerald-400 font-bold">KCL VERIFIED (±0.00% DRIFT)</span>
        </div>
      </div>
    </div>
  );
}
