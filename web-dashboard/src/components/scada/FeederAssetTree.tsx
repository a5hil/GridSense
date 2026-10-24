"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Layers,
  Power,
  Radio,
  ShieldAlert,
  Wifi,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GridTelemetry } from "@/lib/types";
import { NetworkSnapshot } from "@/lib/network/types";
import { ENTERPRISE_CONFIG } from "@/lib/constants";

interface FeederAssetTreeProps {
  telemetry: GridTelemetry | null;
  networkSnapshot?: NetworkSnapshot | null;
  selectedPoleId?: string;
  onSelectPole?: (poleId: string) => void;
}

export const FeederAssetTree = React.memo(function FeederAssetTree({
  telemetry,
  networkSnapshot,
  selectedPoleId,
  onSelectPole,
}: FeederAssetTreeProps) {
  const [expandedSubstation, setExpandedSubstation] = React.useState(true);
  const [expandedDtr, setExpandedDtr] = React.useState(true);
  const [expandedFeeders, setExpandedFeeders] = React.useState<Record<string, boolean>>({
    "LT-1": true,
    "LT-2": false,
    "LT-3": false,
  });

  const toggleFeeder = (feederId: string) => {
    setExpandedFeeders((prev) => ({
      ...prev,
      [feederId]: !prev[feederId],
    }));
  };

  const isLiveFault = telemetry?.fault || (telemetry?.idiff ?? 0) >= (telemetry?.trip_limit ?? 0.35);

  return (
    <div className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/90 rounded-lg flex flex-col h-full overflow-hidden text-xs shadow-xs transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 px-3.5 py-2.5 bg-slate-50/60 dark:bg-slate-900/60">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
            Distribution Asset Hierarchy
          </span>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {networkSnapshot ? "3-Phase Grid (28 Poles)" : "Discom Tree"}
        </Badge>
      </div>

      {/* Hierarchical Tree Body */}
      <div className="p-3 space-y-2 overflow-y-auto flex-1 max-h-[500px]">
        {/* LEVEL 1: Substation */}
        <div>
          <button
            onClick={() => setExpandedSubstation(!expandedSubstation)}
            className="flex items-center gap-1.5 w-full text-left font-bold text-slate-900 dark:text-zinc-100 hover:text-emerald-600 dark:hover:text-emerald-400 py-0.5"
          >
            {expandedSubstation ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-400" />
            )}
            <Zap className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>{ENTERPRISE_CONFIG.SUBSTATION_NAME}</span>
            <Badge variant="healthy" className="ml-auto text-[9px]">
              ONLINE (33kV)
            </Badge>
          </button>

          {expandedSubstation && (
            <div className="pl-4 ml-1.5 border-l border-slate-200 dark:border-zinc-800 mt-1 space-y-2">
              {/* LEVEL 2: DTR (Distribution Transformer) */}
              <div>
                <button
                  onClick={() => setExpandedDtr(!expandedDtr)}
                  className="flex items-center gap-1.5 w-full text-left font-semibold text-slate-800 dark:text-zinc-200 hover:text-emerald-600 dark:hover:text-emerald-300 py-0.5"
                >
                  {expandedDtr ? (
                    <ChevronDown className="h-3 w-3 text-slate-400 dark:text-zinc-400" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-slate-400 dark:text-zinc-400" />
                  )}
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500">[DTR]</span>
                  <span>{ENTERPRISE_CONFIG.DTR_NAME}</span>
                  <span className="ml-auto text-[10px] text-slate-500 dark:text-zinc-400 tabular-nums">
                    {networkSnapshot ? `${networkSnapshot.dtr.kva.toFixed(1)} kVA` : "2.4 kVA"}
                  </span>
                </button>

                {/* LEVEL 3: Feeders */}
                {expandedDtr && (
                  <div className="pl-4 ml-1.5 border-l border-slate-200 dark:border-zinc-800 mt-1 space-y-1.5">
                    {/* Render Feeders from Network Snapshot */}
                    {networkSnapshot ? (
                      networkSnapshot.topology.feeders.map((f) => {
                        const isExpanded = !!expandedFeeders[f.id];
                        const poles = networkSnapshot.nodes.filter((n) => n.feederId === f.id);
                        const hasFault = networkSnapshot.detections.some((d) => d.feederId === f.id);

                        return (
                          <div key={f.id} className="space-y-1">
                            <button
                              onClick={() => toggleFeeder(f.id)}
                              className="flex items-center gap-1.5 w-full text-left font-medium text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100 py-0.5"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3 text-slate-400" />
                              ) : (
                                <ChevronRight className="h-3 w-3 text-slate-400" />
                              )}
                              <Layers className="h-3 w-3" style={{ color: f.color }} />
                              <span>{f.name}</span>
                              <Badge
                                variant={hasFault ? "destructive" : "outline"}
                                className="ml-auto text-[9px] py-0"
                              >
                                {hasFault ? "TRIP" : `${poles.length} POLES`}
                              </Badge>
                            </button>

                            {/* LEVEL 4: Poles */}
                            {isExpanded && (
                              <div className="pl-4 ml-1.5 border-l border-slate-200 dark:border-zinc-800 mt-0.5 space-y-0.5">
                                {poles.map((pole) => {
                                  const isSelected =
                                    selectedPoleId?.toLowerCase() === pole.id.toLowerCase() ||
                                    (pole.isLive && (selectedPoleId === "Pole-A" || selectedPoleId === "Pole 1" || selectedPoleId === "P1") && pole.id === "F1-P01") ||
                                    (pole.isLive && (selectedPoleId === "Pole-B" || selectedPoleId === "Pole 2" || selectedPoleId === "P2") && pole.id === "F1-P02");
                                  const isPoleTripped = pole.status === "ALARM";

                                  return (
                                    <div
                                      key={pole.id}
                                      onClick={() => onSelectPole && onSelectPole(pole.id)}
                                      className={`flex items-center justify-between p-1 rounded-sm cursor-pointer transition-colors text-[11px] ${
                                        isSelected
                                          ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-800 dark:text-emerald-300 font-bold"
                                          : pole.isLive
                                          ? "bg-emerald-500/5 hover:bg-emerald-500/10 border border-transparent"
                                          : "hover:bg-slate-100 dark:hover:bg-zinc-800/60 border border-transparent"
                                      }`}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span
                                          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                            isPoleTripped
                                              ? "bg-rose-500 animate-ping"
                                              : pole.isLive
                                              ? "bg-emerald-400 animate-pulse"
                                              : "bg-slate-400"
                                          }`}
                                        />
                                        <span>{pole.label}</span>
                                        {pole.isLive && (
                                          <span className="text-[8.5px] bg-emerald-500/20 text-emerald-500 border border-emerald-500/40 px-1 rounded-xs font-bold">
                                            {pole.id === "F1-P01" ? "INCOMER" : "OUTGOING"}
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-slate-400 tabular-nums text-[10px]">
                                        {pole.phases.R.v.toFixed(0)}V • {pole.phases.R.i.toFixed(2)}A
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      /* Fallback 2-Pole Display */
                      <>
                        <div
                          onClick={() => onSelectPole && onSelectPole("F1-P01")}
                          className="flex items-center justify-between p-1.5 rounded-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-400" />
                            <span>F1-P01 // Substation Incomer</span>
                            <Badge variant="healthy" className="text-[8px] py-0">ENERGIZED</Badge>
                          </div>
                          <span className="text-slate-400 tabular-nums">
                            {telemetry?.p1 ? `${telemetry.p1.i.toFixed(2)}A | ${telemetry.p1.v.toFixed(0)}V` : "--"}
                          </span>
                        </div>

                        <div
                          onClick={() => onSelectPole && onSelectPole("F1-P02")}
                          className="flex items-center justify-between p-1.5 rounded-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${isLiveFault ? "bg-rose-500" : "bg-emerald-400"}`} />
                            <span>F1-P02 // Feeder Section Terminal</span>
                            <Badge variant="healthy" className="text-[8px] py-0">ENERGIZED</Badge>
                          </div>
                          <span className="text-slate-400 tabular-nums">
                            {telemetry?.p2 ? `${telemetry.p2.i.toFixed(2)}A | ${telemetry.p2.v.toFixed(0)}V` : "--"}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Summary */}
      <div className="border-t border-slate-200 dark:border-zinc-800 px-3 py-1.5 bg-slate-50 dark:bg-zinc-950/60 flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400">
        <span>ACTIVE SUBSTATIONS: 1/1</span>
        <span>
          {networkSnapshot ? "TOTAL POLES: 28 DISTRIBUTION NODES" : "TOTAL POLES: 2 METERED NODES"}
        </span>
      </div>
    </div>
  );
});
