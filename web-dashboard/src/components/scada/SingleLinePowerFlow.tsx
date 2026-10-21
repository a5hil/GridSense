"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lock,
  Power,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GridTelemetry } from "@/lib/types";
import { NetworkSnapshot } from "@/lib/network/types";
import { ENTERPRISE_CONFIG } from "@/lib/constants";

interface SingleLinePowerFlowProps {
  telemetry: GridTelemetry | null;
  networkSnapshot?: NetworkSnapshot | null;
  selectedPoleId?: string;
  onSelectPole?: (poleId: string) => void;
}

export function SingleLinePowerFlow({
  telemetry,
  networkSnapshot,
  selectedPoleId,
  onSelectPole,
}: SingleLinePowerFlowProps) {
  const selectedNode = React.useMemo(() => {
    if (!networkSnapshot || !selectedPoleId) return null;
    return networkSnapshot.nodes.find(
      (n) => n.id.toLowerCase() === selectedPoleId.toLowerCase()
    ) || null;
  }, [networkSnapshot, selectedPoleId]);
  const isGatewayOffline =
    telemetry?.status === "DISCONNECTED" ||
    telemetry?.status === "WAITING_DATA" ||
    telemetry?.fault_code === "GATEWAY_DISCONNECTED";

  const isFault = !isGatewayOffline && (telemetry?.fault || (telemetry?.idiff ?? 0) >= (telemetry?.trip_limit ?? 0.35));
  const isP1Stale = isGatewayOffline || (telemetry?.p1?.age_ms ?? 0) > 20000;
  const isP2Stale = isGatewayOffline || (telemetry?.p2?.age_ms ?? 0) > 20000;
  const isP2Offline = isGatewayOffline || (telemetry?.p2 ? (!telemetry.p2.isOnline || (telemetry.p2.age_ms ?? 0) > 10000) : true);
  const idiff = isGatewayOffline ? 0.0 : (telemetry?.idiff ?? 0.0);
  const tripLimit = telemetry?.trip_limit ?? 0.35;

  // Real, genuine physical hardware measurements directly from PZEM-004T sensors (zeroed when gateway is offline)
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

  const isPowerCut = !isGatewayOffline && (v1 < 50.0 && v2 < 50.0);

  return (
    <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] rounded-sm p-4 flex flex-col gap-3 font-mono transition-colors shadow-xs dark:shadow-none">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-100">
            FEEDER POWER FLOW &amp; LINE INTEGRITY // SINGLE-LINE DIAGRAM (SLD)
          </h2>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {isGatewayOffline ? (
            <Badge
              variant="outline"
              className="flex items-center gap-1.5 py-0.5 text-[10px] border-amber-500/70 text-amber-500 animate-pulse font-bold"
            >
              <Radio className="h-3 w-3" />
              <span>GATEWAY OFFLINE // NO LORA FEED</span>
            </Badge>
          ) : isPowerCut ? (
            <Badge
              variant="destructive"
              className="flex items-center gap-1.5 py-0.5 text-[10px] bg-amber-600 text-white border-amber-500 animate-pulse"
            >
              <AlertTriangle className="h-3 w-3" />
              <span>FEEDER DE-ENERGIZED (0V POWER CUT)</span>
            </Badge>
          ) : isFault ? (
            <Badge
              variant="destructive"
              className="flex items-center gap-1.5 py-0.5 text-[10px] animate-pulse"
            >
              <AlertTriangle className="h-3 w-3" />
              <span>UNBALANCED (FAULT / LEAKAGE DETECTED)</span>
            </Badge>
          ) : (
            <Badge
              variant="healthy"
              className="flex items-center gap-1.5 py-0.5 text-[10px]"
            >
              <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span>SUPERVISED &amp; BALANCED (NO LEAKAGE)</span>
            </Badge>
          )}
          <span className="text-slate-500 dark:text-zinc-500 text-[11px]">FEEDER 04 • 230V/415V LT RADIAL</span>
        </div>
      </div>

      {/* Main SLD Visual Pipeline */}
      <div className="relative py-2 overflow-x-auto">
        <div className="min-w-[980px] flex items-stretch gap-2.5">
          {/* Node 1: 33/11kV Substation Incomer */}
          <div className="w-[130px] shrink-0 border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 p-2.5 rounded-sm flex flex-col justify-between text-center shadow-inner">
            <div>
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 dark:text-zinc-400 font-semibold uppercase">
                <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                <span>SUBSTATION</span>
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-zinc-200 mt-1">{ENTERPRISE_CONFIG.SUBSTATION_SHORT}</div>
              <div className="text-[10px] text-slate-500 dark:text-zinc-400">BUS-1</div>
            </div>
            <div className="text-[9px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xs py-0.5 mt-2">
              11kV SUPPLY OK
            </div>
          </div>

          {/* Flow Arrow 1 */}
          <div className="w-[45px] shrink-0 flex flex-col items-center justify-center">
            <div className="w-full flex items-center">
              <div className="h-[2px] w-full bg-emerald-500/60 relative overflow-hidden">
                <div className="absolute inset-0 bg-emerald-500 dark:bg-emerald-400 w-1/3 animate-pulse" />
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 -ml-1 shrink-0" />
            </div>
            <span className="text-[8px] text-slate-500 dark:text-zinc-500 mt-1 uppercase">11kV CABLE</span>
          </div>

          {/* Node 2: Transformer DTR-01 */}
          <div className="w-[140px] shrink-0 border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 p-2.5 rounded-sm flex flex-col justify-between text-center">
            <div>
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 dark:text-zinc-400 font-semibold uppercase">
                <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                <span>DTR-01</span>
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-zinc-200 mt-1">
                {networkSnapshot ? `${networkSnapshot.dtr.kva.toFixed(1)} kVA` : "250 kVA DTR"}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                {networkSnapshot ? `LOAD: ${networkSnapshot.dtr.loadingPct}%` : "STEP-DOWN: 230V"}
              </div>
            </div>
            <div className="text-[9px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xs py-0.5 mt-2">
              {networkSnapshot ? "3 LT FEEDERS" : "415V LT READY"}
            </div>
          </div>

          {/* Flow Arrow 2 */}
          <div className="w-[45px] shrink-0 flex flex-col items-center justify-center">
            <div className="w-full flex items-center">
              <div className="h-[2px] w-full bg-emerald-500/60 relative overflow-hidden">
                <div className="absolute inset-0 bg-emerald-500 dark:bg-emerald-400 w-1/3 animate-pulse" />
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 -ml-1 shrink-0" />
            </div>
            <span className="text-[8px] text-slate-500 dark:text-zinc-500 mt-1 uppercase">LT BUS</span>
          </div>

          {/* Node 3: Feeder Incomer Bus */}
          <div className="w-[175px] shrink-0 border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 p-2.5 rounded-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-[10px] pb-1 border-b border-slate-200 dark:border-zinc-800/60">
                <span className="text-slate-500 dark:text-zinc-400 uppercase font-bold tracking-wider">
                  FEEDER INCOMER BUS
                </span>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isGatewayOffline
                      ? "bg-amber-500/60 animate-pulse"
                      : isPowerCut
                      ? "bg-amber-500 animate-pulse"
                      : isFault
                      ? "bg-rose-500 animate-pulse"
                      : "bg-emerald-500 dark:bg-emerald-400"
                  }`}
                />
              </div>

              <div className="mt-1.5 flex items-center justify-center gap-1.5 text-xs font-bold">
                {isGatewayOffline ? (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 text-[11px]">
                    <Radio className="h-3.5 w-3.5 animate-pulse" />
                    GATEWAY OFFLINE
                  </span>
                ) : isPowerCut ? (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    DE-ENERGIZED (0V)
                  </span>
                ) : isFault ? (
                  <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    LINE FAULT ACTIVE
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    ENERGIZED // CLOSED
                  </span>
                )}
              </div>
              <div className="text-[9px] text-slate-500 dark:text-zinc-500 mt-0.5">
                {networkSnapshot
                  ? `LT-1, LT-2, LT-3 • ${networkSnapshot.nodes.length} POLES`
                  : isGatewayOffline
                  ? "TELEMETRY FEED OFFLINE"
                  : "FEEDER 04 • 230V / 50Hz"}
              </div>
            </div>

            <div className="text-[9px] text-slate-500 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xs py-0.5 px-1 mt-2 text-center uppercase">
              {isGatewayOffline ? "BUS DE-ENERGIZED" : "BREAKER: CLOSED"}
            </div>
          </div>

          {/* Flow Arrow 3 */}
          <div className="w-[45px] shrink-0 flex flex-col items-center justify-center">
            <div className="w-full flex items-center">
              <div
                className={`h-[2px] w-full ${
                  isGatewayOffline
                    ? "bg-slate-300 dark:bg-zinc-800"
                    : isPowerCut
                    ? "bg-amber-500/60"
                    : isFault
                    ? "bg-rose-500/60"
                    : "bg-emerald-500/60"
                } relative overflow-hidden`}
              >
                {!isGatewayOffline && !isPowerCut && (
                  <div
                    className={`absolute inset-0 ${
                      isFault ? "bg-rose-500 dark:bg-rose-400" : "bg-emerald-500 dark:bg-emerald-400"
                    } w-1/3 animate-pulse`}
                  />
                )}
              </div>
              <ArrowRight
                className={`h-3.5 w-3.5 -ml-1 shrink-0 ${
                  isGatewayOffline
                    ? "text-slate-400 dark:text-zinc-600"
                    : isPowerCut
                    ? "text-amber-500"
                    : isFault
                    ? "text-rose-500"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              />
            </div>
            <span className="text-[8px] text-slate-500 dark:text-zinc-500 mt-1 uppercase">
              {isGatewayOffline ? "OFFLINE" : isPowerCut ? "NO POWER" : "LT LINE"}
            </span>
          </div>

          {/* Node 4: POLE 1 (Incomer Sensor Node) */}
          <div
            onClick={() => onSelectPole?.("Pole-A")}
            className={`flex-1 min-w-[170px] border p-2.5 rounded-sm cursor-pointer transition-all flex flex-col justify-between ${
              isP1Stale
                ? "border-amber-500/50 bg-amber-50/20 dark:bg-amber-950/20 opacity-50"
                : selectedPoleId === "Pole-A"
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 shadow-md shadow-emerald-500/10 dark:shadow-emerald-950/30"
                : "border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 hover:border-slate-300 dark:hover:border-zinc-700"
            }`}
          >
            <div>
              <div className="flex items-center justify-between text-[10px] pb-1 border-b border-slate-200 dark:border-zinc-800/60">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 dark:text-zinc-400 uppercase font-semibold">POLE 1 (INCOMER)</span>
                  {isP1Stale && (
                    <span className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/50 text-[8px] px-1 py-0.2 rounded-xs font-bold animate-pulse">
                      STALE / WAITING
                    </span>
                  )}
                </div>
                <span
                  className={`h-2 w-2 rounded-full ${
                    isP1Stale ? "bg-amber-500 animate-pulse" : "bg-emerald-500 dark:bg-emerald-400"
                  }`}
                />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Current:</span>
                <span className="text-sm font-bold text-slate-900 dark:text-zinc-100 tabular-nums">
                  {i1.toFixed(3)} A
                </span>
              </div>
              <div className="flex items-baseline justify-between text-[10px] text-slate-500 dark:text-zinc-400">
                <span>Voltage:</span>
                <span className="text-slate-700 dark:text-zinc-300 tabular-nums">{v1.toFixed(1)} V</span>
              </div>
              <div className="flex items-baseline justify-between text-[10px] text-slate-500 dark:text-zinc-400">
                <span>Load:</span>
                <span className="text-slate-700 dark:text-zinc-300 tabular-nums">{p1.toFixed(0)} W</span>
              </div>

              {/* PZEM-004T Monospace Telemetry: Power Factor & Frequency */}
              <div className="mt-1.5 pt-1 border-t border-slate-200 dark:border-zinc-800/60 grid grid-cols-2 gap-1 text-[9px] font-mono">
                <div className="bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-1 py-0.5 rounded-xs text-center">
                  <span className="text-slate-400 dark:text-zinc-500 mr-0.5">PF:</span>
                  <span className="text-slate-800 dark:text-zinc-200 font-bold">
                    {pf1.toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-1 py-0.5 rounded-xs text-center">
                  <span className="text-slate-400 dark:text-zinc-500 mr-0.5">FREQ:</span>
                  <span className="text-slate-800 dark:text-zinc-200 font-bold">
                    {freq1.toFixed(1)} Hz
                  </span>
                </div>
              </div>
            </div>

            {/* Scope Alignment: Replaced 18650 UPS with Node Role matching Pole 2 */}
            <div className="mt-1.5 pt-1 border-t border-slate-200 dark:border-zinc-800/60 flex items-center justify-between text-[9px] font-mono">
              <span className="text-slate-500 dark:text-zinc-500 font-semibold">ROLE:</span>
              <span className="text-slate-700 dark:text-zinc-300 font-semibold">
                ORIGIN • INCOMER NODE
              </span>
            </div>
          </div>

          {/* SUPERVISED SPAN (DIFFERENTIAL ZONE) */}
          <div className="w-[145px] shrink-0 flex flex-col items-center justify-center px-1">
            <div
              className={`w-full border p-2 rounded-sm text-center transition-all ${
                isFault
                  ? "border-rose-500 bg-rose-50 dark:bg-rose-950/60 ring-1 ring-rose-500 animate-pulse text-rose-700 dark:text-rose-200"
                  : "border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/90 text-slate-700 dark:text-zinc-300"
              }`}
            >
              <div className="text-[9px] uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                SUPERVISED SPAN
              </div>
              <div
                className={`text-xs font-bold tabular-nums my-0.5 ${
                  isFault
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                ΔI = {idiff.toFixed(3)} A
              </div>
              <div className="text-[9px] text-slate-500 dark:text-zinc-400">
                LIMIT: {tripLimit.toFixed(3)} A
              </div>
            </div>

            <div className="w-full flex items-center my-1.5">
              <div
                className={`h-[2px] w-full ${
                  isFault ? "bg-rose-500/60" : "bg-emerald-500/60"
                } relative overflow-hidden`}
              >
                {!isPowerCut && (
                  <div
                    className={`absolute inset-0 ${
                      isFault ? "bg-rose-500" : "bg-emerald-500 dark:bg-emerald-400"
                    } w-1/3 animate-pulse`}
                  />
                )}
              </div>
              <ArrowRight
                className={`h-3.5 w-3.5 -ml-1 shrink-0 ${
                  isFault
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              />
            </div>
            <span
              className={`text-[8px] font-bold uppercase ${
                isFault
                  ? "text-rose-600 dark:text-rose-400 animate-pulse"
                  : "text-slate-500 dark:text-zinc-500"
              }`}
            >
              {isFault ? "LEAKAGE DETECTED" : "SPAN 1-2 NORMAL"}
            </span>
          </div>

          {/* Node 5: POLE 2 (Outgoing Endpoint) */}
          <div
            onClick={() => onSelectPole?.("Pole-B")}
            className={`flex-1 min-w-[170px] border p-2.5 rounded-sm cursor-pointer transition-all flex flex-col justify-between ${
              isP2Offline
                ? "border-rose-500/60 bg-rose-50/20 dark:bg-rose-950/20 ring-1 ring-rose-500"
                : isP2Stale
                ? "border-amber-500/50 bg-amber-50/20 dark:bg-amber-950/20 opacity-50"
                : selectedPoleId === "Pole-B"
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 shadow-md shadow-emerald-500/10 dark:shadow-emerald-950/30"
                : "border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 hover:border-slate-300 dark:hover:border-zinc-700"
            }`}
          >
            <div>
              <div className="flex items-center justify-between text-[10px] pb-1 border-b border-slate-200 dark:border-zinc-800/60">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 dark:text-zinc-400 uppercase font-semibold">POLE 2 (OUTGOING)</span>
                  {isP2Offline ? (
                    <span className="bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/50 text-[8px] px-1 py-0.2 rounded-xs font-bold animate-pulse">
                      OFFLINE
                    </span>
                  ) : isP2Stale ? (
                    <span className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/50 text-[8px] px-1 py-0.2 rounded-xs font-bold animate-pulse">
                      STALE / WAITING
                    </span>
                  ) : null}
                </div>
                <span
                  className={`h-2 w-2 rounded-full ${
                    isP2Offline
                      ? "bg-rose-500 animate-pulse"
                      : isP2Stale
                      ? "bg-amber-500 animate-pulse"
                      : "bg-emerald-500 dark:bg-emerald-400"
                  }`}
                />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Current:</span>
                <span
                  className={`text-sm font-bold tabular-nums ${
                    isFault
                      ? "text-rose-600 dark:text-rose-400 font-black animate-pulse"
                      : "text-slate-900 dark:text-zinc-100"
                  }`}
                >
                  {i2.toFixed(3)} A
                </span>
              </div>
              <div className="flex items-baseline justify-between text-[10px] text-slate-500 dark:text-zinc-400">
                <span>Voltage:</span>
                <span className="text-slate-700 dark:text-zinc-300 tabular-nums">{v2.toFixed(1)} V</span>
              </div>
              <div className="flex items-baseline justify-between text-[10px] text-slate-500 dark:text-zinc-400">
                <span>Load:</span>
                <span className="text-slate-700 dark:text-zinc-300 tabular-nums">{p2.toFixed(0)} W</span>
              </div>

              {/* PZEM-004T Monospace Telemetry: Power Factor & Frequency */}
              <div className="mt-1.5 pt-1 border-t border-slate-200 dark:border-zinc-800/60 grid grid-cols-2 gap-1 text-[9px] font-mono">
                <div className="bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-1 py-0.5 rounded-xs text-center">
                  <span className="text-slate-400 dark:text-zinc-500 mr-0.5">PF:</span>
                  <span className="text-slate-800 dark:text-zinc-200 font-bold">
                    {pf2.toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-1 py-0.5 rounded-xs text-center">
                  <span className="text-slate-400 dark:text-zinc-500 mr-0.5">FREQ:</span>
                  <span className="text-slate-800 dark:text-zinc-200 font-bold">
                    {freq2.toFixed(1)} Hz
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-1.5 pt-1 border-t border-slate-200 dark:border-zinc-800/60 flex items-center justify-between text-[9px] font-mono">
              <span className="text-slate-500 dark:text-zinc-500 font-semibold">ROLE:</span>
              <span className="text-slate-700 dark:text-zinc-300 font-semibold">
                ENDPOINT • LOAD NODE
              </span>
            </div>
          </div>

          {/* Flow Arrow 4 */}
          <div className="w-[45px] shrink-0 flex flex-col items-center justify-center">
            <div className="w-full flex items-center">
              <div className="h-[2px] w-full bg-emerald-500/60 relative overflow-hidden">
                <div className="absolute inset-0 bg-emerald-500 dark:bg-emerald-400 w-1/3 animate-pulse" />
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 -ml-1 shrink-0" />
            </div>
            <span className="text-[8px] text-slate-500 dark:text-zinc-500 mt-1 uppercase">SERVICE</span>
          </div>

          {/* Node 6: Consumer / Sector 4 Load */}
          <div className="w-[140px] shrink-0 border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/80 p-2.5 rounded-sm flex flex-col justify-between text-center">
            <div>
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 dark:text-zinc-400 font-semibold uppercase">
                <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                <span>CONSUMER LOAD</span>
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-zinc-200 mt-1">{ENTERPRISE_CONFIG.SECTOR_LT_BUS}</div>
              <div className="text-sm font-bold text-slate-900 dark:text-zinc-100 tabular-nums mt-0.5">
                {(p2 / 1000).toFixed(2)} kW
              </div>
            </div>
            <div className="text-[9px] text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xs py-0.5 mt-2">
              PF: {pf2.toFixed(2)} IND
            </div>
          </div>
        </div>
      </div>

      {/* Selected Simulated / Network Pole Inspector HUD */}
      {selectedNode && selectedNode.id !== "POLE-A" && selectedNode.id !== "POLE-B" && (
        <div className="border border-cyan-500/40 bg-cyan-950/20 p-2.5 rounded-sm flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-cyan-500 text-cyan-400 font-bold">
              INSPECTED ASSET: {selectedNode.label} ({selectedNode.id})
            </Badge>
            <span className="text-slate-500 dark:text-zinc-400">
              Feeder: <strong className="text-slate-800 dark:text-zinc-200">{selectedNode.feederId}</strong>
            </span>
            <span className="text-slate-500 dark:text-zinc-400">
              Role: <strong className="text-cyan-400">3-PHASE LT POLE (SIMULATED)</strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 tabular-nums text-[11px]">
            <div>
              <span className="text-rose-400 font-bold">R:</span>{" "}
              <span className="text-slate-800 dark:text-zinc-200">{selectedNode.phases.R.v.toFixed(1)}V / {selectedNode.phases.R.i.toFixed(2)}A</span>
            </div>
            <div>
              <span className="text-amber-400 font-bold">Y:</span>{" "}
              <span className="text-slate-800 dark:text-zinc-200">{selectedNode.phases.Y.v.toFixed(1)}V / {selectedNode.phases.Y.i.toFixed(2)}A</span>
            </div>
            <div>
              <span className="text-cyan-400 font-bold">B:</span>{" "}
              <span className="text-slate-800 dark:text-zinc-200">{selectedNode.phases.B.v.toFixed(1)}V / {selectedNode.phases.B.i.toFixed(2)}A</span>
            </div>
            <Badge
              variant={selectedNode.status === "NORMAL" ? "healthy" : selectedNode.status === "WARN" ? "warning" : "destructive"}
              className="text-[9px] py-0"
            >
              {selectedNode.status}
            </Badge>
          </div>
        </div>
      )}

      {/* Dynamic SCADA Feeder Status Summary (Pure Monitoring) */}
      <div
        className={`border px-3 py-2 rounded-sm text-xs flex flex-wrap items-center justify-between gap-2 font-mono ${
          isGatewayOffline
            ? "border-amber-500/70 bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300"
            : isFault
            ? "border-rose-500/80 bg-rose-50/70 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 ring-1 ring-rose-500"
            : isPowerCut
            ? "border-amber-500/80 bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200"
            : "border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-slate-700 dark:text-zinc-300"
        }`}
      >
        <div className="flex items-center gap-2">
          {isGatewayOffline ? (
            <Radio className="h-4 w-4 text-amber-500 animate-pulse shrink-0" />
          ) : isFault ? (
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 animate-bounce" />
          ) : isPowerCut ? (
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          )}
          <span>
            {isGatewayOffline ? (
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                GATEWAY OFFLINE: Central Telemetry Gateway disconnected. Communications bus is idle. Awaiting gateway reconnection to resume real-time SCADA monitoring.
              </span>
            ) : isFault ? (
              <span className="font-semibold">
                FAULT ALERT: Inter-pole differential current ΔI = {idiff.toFixed(3)}A exceeds {tripLimit.toFixed(3)}A protection limit. Anomaly detected on Feeder 04 overhead span.
              </span>
            ) : isPowerCut ? (
              <span className="font-semibold">
                FEEDER DE-ENERGIZED: Voltage collapse detected (&lt;50V). LoRa outage event recorded.
              </span>
            ) : (
              <span>
                SUPERVISORY STATUS: Real-time Sub-GHz LoRa telemetry streaming. All electrical parameters within nominal limits. Overhead conductor intact.
              </span>
            )}
          </span>
        </div>

        <div className="text-[11px] text-slate-500 dark:text-zinc-400">
          PROTECTION THRESHOLD: <span className="text-slate-800 dark:text-zinc-200 font-bold">{tripLimit.toFixed(3)} A</span>
        </div>
      </div>
    </div>
  );
}
