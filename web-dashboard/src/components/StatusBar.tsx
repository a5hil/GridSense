"use client";

import React from "react";
import { useDashboard } from "@/context/DashboardContext";

export function StatusBar() {
  const { connectedSSE, networkSnapshot } = useDashboard();

  const totalPoles = networkSnapshot?.nodes?.filter((n) => n.id !== "DTR-01")?.length || 28;

  return (
    <footer className="h-8 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0a0b0e] px-3 sm:px-4 text-[10px] text-slate-500 dark:text-zinc-400 flex items-center justify-between font-mono shrink-0 select-none z-30 transition-colors">
      {/* LEFT: COMPACT PILL-SHAPED SECONDARY SYSTEM STATES */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {/* 1. SCADA Link Pill */}
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-sm border ${
            connectedSSE
              ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/60 text-emerald-700 dark:text-emerald-400"
              : "bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-700/60 text-rose-700 dark:text-rose-400"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connectedSSE
                ? "bg-emerald-500 dark:bg-emerald-400 animate-ping"
                : "bg-rose-500 animate-bounce"
            }`}
          />
          <span className="font-bold uppercase tracking-wider">
            {connectedSSE ? "SCADA LINK ACTIVE" : "LINK OFFLINE"}
          </span>
        </div>
      </div>

      {/* RIGHT: SECONDARY TELEMETRY STATS */}
      <div className="hidden md:flex items-center gap-3 text-slate-500 dark:text-zinc-400 shrink-0">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>{totalPoles} POLES SUPERVISED</span>
        </span>
        <span>•</span>
        <span>SAMPLING: 50.0 Hz</span>
        <span>•</span>
        <span className="text-slate-600 dark:text-zinc-400">IEC 61850 / IEEE C37.118</span>
      </div>
    </footer>
  );
}
