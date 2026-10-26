"use client";

import React from "react";
import { Sun, Moon, Volume2, VolumeX, Radio, Shield } from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import { useDashboard } from "@/context/DashboardContext";

export function StatusBar() {
  const { theme, toggleTheme } = useTheme();
  const {
    connectedSSE,
    isAudioMuted,
    toggleAudioMuted,
    networkSnapshot,
  } = useDashboard();

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

        {/* 2. Environment (Day Light / Night) Toggle Pill */}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to Day Light Mode" : "Switch to SCADA Dark Mode"}
          className="flex items-center gap-1 px-2 py-0.5 rounded-sm border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
        >
          {theme === "dark" ? (
            <>
              <Moon className="h-3 w-3 text-indigo-400" />
              <span>NIGHT DISPATCH</span>
            </>
          ) : (
            <>
              <Sun className="h-3 w-3 text-amber-500" />
              <span>DAY LIGHT</span>
            </>
          )}
        </button>

        {/* 3. Alarm Horn Toggle Pill */}
        <button
          onClick={toggleAudioMuted}
          title={isAudioMuted ? "Alarm Horn Silenced (Click to Activate)" : "Alarm Horn Active (Click to Silence)"}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-sm border transition-colors cursor-pointer ${
            isAudioMuted
              ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/60 text-amber-700 dark:text-amber-300"
              : "bg-slate-50 dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300"
          }`}
        >
          {isAudioMuted ? (
            <>
              <VolumeX className="h-3 w-3 text-amber-500" />
              <span>ALARM HORN: SILENCED</span>
            </>
          ) : (
            <>
              <Volume2 className="h-3 w-3 text-emerald-500" />
              <span>ALARM HORN: ACTIVE</span>
            </>
          )}
        </button>
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
