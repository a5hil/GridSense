"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Layers,
  Power,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GridTelemetry, PoleData } from "@/lib/types";

interface FeederAssetTreeProps {
  telemetry: GridTelemetry | null;
  selectedPoleId?: string;
  onSelectPole?: (poleId: string) => void;
}

export function FeederAssetTree({
  telemetry,
  selectedPoleId,
  onSelectPole,
}: FeederAssetTreeProps) {
  const [expandedSubstation, setExpandedSubstation] = React.useState(true);
  const [expandedFeeder, setExpandedFeeder] = React.useState(true);
  const [expandedDtr, setExpandedDtr] = React.useState(true);

  const isFault = telemetry?.fault || (telemetry?.idiff ?? 0) >= (telemetry?.trip_limit ?? 0.35);

  return (
    <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1012] rounded-sm flex flex-col h-full overflow-hidden text-xs font-mono shadow-xs dark:shadow-none transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 px-3 py-2 bg-slate-50 dark:bg-zinc-950/70">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span className="font-semibold uppercase tracking-wider text-slate-800 dark:text-zinc-200">
            DISTRIBUTION ASSET HIERARCHY
          </span>
        </div>
        <Badge variant="outline" className="text-[10px]">
          DISCOM TREE
        </Badge>
      </div>

      {/* Hierarchical Tree Body */}
      <div className="p-3 space-y-2 overflow-y-auto max-h-[300px]">
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
            <span>Angamaly 33/11kV Substation</span>
            <Badge variant="healthy" className="ml-auto text-[9px]">
              ONLINE (33kV)
            </Badge>
          </button>

          {/* LEVEL 2: Feeders */}
          {expandedSubstation && (
            <div className="pl-4 ml-1.5 border-l border-slate-200 dark:border-zinc-800 mt-1 space-y-1.5">
              {/* Feeder 04 (Monitored Active Feeder) */}
              <div>
                <button
                  onClick={() => setExpandedFeeder(!expandedFeeder)}
                  className="flex items-center gap-1.5 w-full text-left font-semibold text-slate-800 dark:text-zinc-200 hover:text-emerald-600 dark:hover:text-emerald-300 py-0.5"
                >
                  {expandedFeeder ? (
                    <ChevronDown className="h-3 w-3 text-slate-400 dark:text-zinc-400" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-slate-400 dark:text-zinc-400" />
                  )}
                  <Layers className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  <span>Feeder 04 (Sector 4 Primary)</span>
                  <Badge
                    variant={isFault ? "destructive" : "healthy"}
                    className="ml-auto text-[9px]"
                  >
                    {isFault ? "TRIP" : "SUPERVISED"}
                  </Badge>
                </button>

                {/* LEVEL 3: Distribution Transformers (DTR) */}
                {expandedFeeder && (
                  <div className="pl-4 ml-1.5 border-l border-slate-200 dark:border-zinc-800 mt-1 space-y-1">
                    <div>
                      <button
                        onClick={() => setExpandedDtr(!expandedDtr)}
                        className="flex items-center gap-1.5 w-full text-left text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100 py-0.5"
                      >
                        {expandedDtr ? (
                          <ChevronDown className="h-3 w-3 text-slate-400 dark:text-zinc-400" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-slate-400 dark:text-zinc-400" />
                        )}
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500">[DTR]</span>
                        <span>DTR-01 (250 kVA, 11kV/415V)</span>
                        <span className="ml-auto text-[10px] text-slate-500 dark:text-zinc-400 tabular-nums">
                          {telemetry && telemetry.p1 ? ((telemetry.p1.v * telemetry.p1.i) / 1000).toFixed(2) : "0.00"} kVA
                        </span>
                      </button>

                      {/* LEVEL 4: Poles & Edge Nodes */}
                      {expandedDtr && (
                        <div className="pl-4 ml-1.5 border-l border-slate-200 dark:border-zinc-800 mt-1 space-y-1">
                          {/* Pole 1 */}
                          <div
                            onClick={() => onSelectPole && onSelectPole("Pole-A")}
                            className={`flex items-center justify-between p-1.5 rounded-sm cursor-pointer transition-colors ${
                              selectedPoleId === "Pole-A"
                                ? "bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700"
                                : "hover:bg-slate-50 dark:hover:bg-zinc-900 border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                              <span className="font-semibold text-slate-900 dark:text-zinc-100">
                                Pole 1 // Incomer (Node A)
                              </span>
                            </div>
                            <span className="text-slate-500 dark:text-zinc-400 tabular-nums">
                              {telemetry?.p1 ? `${telemetry.p1.i.toFixed(2)}A | ${telemetry.p1.v.toFixed(0)}V` : "0.00A | 0V"}
                            </span>
                          </div>

                          {/* Pole 2 */}
                          <div
                            onClick={() => onSelectPole && onSelectPole("Pole-B")}
                            className={`flex items-center justify-between p-1.5 rounded-sm cursor-pointer transition-colors ${
                              selectedPoleId === "Pole-B"
                                ? "bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700"
                                : "hover:bg-slate-50 dark:hover:bg-zinc-900 border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  isFault ? "bg-rose-500 animate-pulse" : "bg-emerald-400"
                                }`}
                              />
                              <span
                                className={`font-semibold ${
                                  isFault ? "text-rose-300" : "text-zinc-100"
                                }`}
                              >
                                Pole 2 // Outgoing (Node B)
                              </span>
                            </div>
                            <span
                              className={`tabular-nums ${
                                isFault ? "text-rose-400 font-bold" : "text-zinc-400"
                              }`}
                            >
                              {telemetry?.p2 ? `${telemetry.p2.i.toFixed(2)}A | ${telemetry.p2.v.toFixed(0)}V` : "0.00A | 0V"}
                            </span>
                          </div>

                          {/* Planned Spur Pole */}
                          <div className="flex items-center justify-between p-1 text-zinc-500">
                            <div className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                              <span>Pole 3 // Branch Spur (Planned)</span>
                            </div>
                            <span className="text-[10px]">[FUTURE]</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Other Feeders (Simulated Distribution Grid Depth) */}
              <div className="flex items-center justify-between py-1 text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  <span>Feeder 01 (Hostel Sector)</span>
                </div>
                <span className="text-[10px] text-zinc-500">HEALTHY (18.2 A)</span>
              </div>

              <div className="flex items-center justify-between py-1 text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  <span>Feeder 02 (Auditorium &amp; Labs)</span>
                </div>
                <span className="text-[10px] text-zinc-500">HEALTHY (24.1 A)</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Summary */}
      <div className="border-t border-zinc-800 px-3 py-1.5 bg-zinc-950/60 flex items-center justify-between text-[10px] text-zinc-400">
        <span>ACTIVE SUBSTATIONS: 1/1</span>
        <span>TOTAL MONITORED POLES: 2</span>
      </div>
    </div>
  );
}
