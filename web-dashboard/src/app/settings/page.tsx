"use client";

import React, { useState } from "react";
import {
  Settings,
  Sun,
  Moon,
  Clock,
  Sliders,
  ShieldAlert,
  Server,
  Save,
  CheckCircle2,
  RefreshCw,
  Bell,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import { useDashboard } from "@/context/DashboardContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { isAudioMuted, toggleAudioMuted } = useDashboard();

  // Settings form states
  const [refreshRateMs, setRefreshRateMs] = useState<number>(1000);
  const [differentialPickupA, setDifferentialPickupA] = useState<number>(0.35);
  const [tripDelayMs, setTripDelayMs] = useState<number>(150);
  const [undervoltageV, setUndervoltageV] = useState<number>(195.5);
  const [overvoltageV, setOvervoltageV] = useState<number>(253.0);
  const [overcurrentA, setOvercurrentA] = useState<number>(18.0);
  const [substationName, setSubstationName] = useState<string>("Angamaly 33/11kV Substation");
  const [feederId, setFeederId] = useState<string>("FEEDER-04");
  const [gatewayIp, setGatewayIp] = useState<string>("192.168.1.100");
  const [isSaved, setIsSaved] = useState<boolean>(false);

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto font-mono select-none pb-8">
      {/* Page Title & Save Action */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <Settings className="h-4 w-4" />
            <span>SYSTEM CONFIGURATION</span>
          </div>
          <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-zinc-100 mt-1">
            SCADA Parameters &amp; Thresholds
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Configure telemetry refresh rates, protection trip limits, and interface preferences.
          </p>
        </div>

        <Button
          onClick={handleSave}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider gap-2 shadow-sm"
        >
          {isSaved ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-white" />
              <span>SAVED TO EEPROM</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>SAVE CONFIGURATION</span>
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* SECTION 1: UI THEME & DISPLAY PREFERENCES */}
        <Card className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] shadow-sm rounded-sm">
          <CardHeader className="pb-3 border-b border-slate-200 dark:border-zinc-800/80">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <Sun className="h-4 w-4 text-amber-500" />
              <span>UI Theme &amp; Workspace Environment</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-2">
                Active Color Theme
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => theme === "dark" && toggleTheme()}
                  className={`p-3 rounded-sm border text-left transition-all ${
                    theme === "light"
                      ? "bg-slate-100 border-emerald-500 text-slate-900 shadow-sm"
                      : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <Sun className="h-4 w-4 text-amber-500" />
                    <span>Day Light</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-500 mt-1">
                    High-contrast for bright control rooms
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => theme === "light" && toggleTheme()}
                  className={`p-3 rounded-sm border text-left transition-all ${
                    theme === "dark"
                      ? "bg-zinc-900 border-emerald-500 text-zinc-100 shadow-sm"
                      : "bg-slate-50 border-slate-300 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <Moon className="h-4 w-4 text-indigo-400" />
                    <span>SCADA Dark (Default)</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1">
                    OLED black with neon status accents
                  </div>
                </button>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-slate-500 dark:text-zinc-500">
              Current environment mode: <strong className="text-slate-800 dark:text-zinc-200">{theme.toUpperCase()}</strong>. Persisted across browser sessions.
            </div>

            {/* Alarm Horn Audio Annunciator */}
            <div className="pt-3 border-t border-slate-200 dark:border-zinc-800/80">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-2">
                Acoustic Alarm Annunciator Horn
              </label>
              <div className="flex items-center justify-between p-3 rounded-sm border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950">
                <div className="flex items-center gap-3">
                  {isAudioMuted ? (
                    <div className="h-8 w-8 rounded-sm bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                      <VolumeX className="h-4 w-4 text-amber-500" />
                    </div>
                  ) : (
                    <div className="h-8 w-8 rounded-sm bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                      <Volume2 className="h-4 w-4 text-emerald-400" />
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                      <span>{isAudioMuted ? "ALARM HORN: MUTED / SILENCED" : "ALARM HORN: ACTIVE (ARMED)"}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded-xs font-mono font-bold ${
                          isAudioMuted
                            ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40"
                            : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40"
                        }`}
                      >
                        {isAudioMuted ? "SILENCED" : "ONLINE"}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                      Audible annunciator sounds when ANSI 87L differential trip or lockout occurs.
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleAudioMuted}
                  className={`text-xs font-mono font-bold uppercase tracking-wider shrink-0 cursor-pointer ${
                    isAudioMuted
                      ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                      : "border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                  }`}
                >
                  {isAudioMuted ? "UNMUTE HORN" : "SILENCE HORN"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 2: TELEMETRY REFRESH RATE */}
        <Card className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] shadow-sm rounded-sm">
          <CardHeader className="pb-3 border-b border-slate-200 dark:border-zinc-800/80">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-cyan-500" />
              <span>Telemetry Refresh Rate</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
                <span className="text-slate-600 dark:text-zinc-400">STREAM INTERVAL</span>
                <span className="text-cyan-600 dark:text-cyan-400 font-mono">{refreshRateMs} ms ({Math.round(1000 / refreshRateMs)} Hz)</span>
              </div>
              <input
                type="range"
                min="200"
                max="3000"
                step="100"
                value={refreshRateMs}
                onChange={(e) => setRefreshRateMs(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="flex justify-between text-[10px] text-slate-400 dark:text-zinc-600 mt-1">
                <span>Fast (200ms • 5Hz)</span>
                <span>Normal (1000ms • 1Hz)</span>
                <span>Eco (3000ms)</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              {[250, 500, 1000].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setRefreshRateMs(rate)}
                  className={`py-1.5 px-2 rounded-sm border text-center text-xs font-mono transition-colors ${
                    refreshRateMs === rate
                      ? "bg-cyan-50 dark:bg-cyan-950/50 border-cyan-500 text-cyan-700 dark:text-cyan-300 font-bold"
                      : "bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400"
                  }`}
                >
                  {rate} ms
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* SECTION 3: ALARM & PROTECTION THRESHOLDS */}
        <Card className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] shadow-sm rounded-sm md:col-span-2">
          <CardHeader className="pb-3 border-b border-slate-200 dark:border-zinc-800/80">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-500" />
              <span>ANSI Protection Relays &amp; Alarm Pickup Thresholds</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* ANSI 87L Differential Pickup */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
                ANSI 87L Differential Pickup (ΔI)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.05"
                  value={differentialPickupA}
                  onChange={(e) => setDifferentialPickupA(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-sm text-sm font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-rose-500"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">Amperes</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-zinc-500">
                Minimum line differential current to trip breakers (default: 0.350 A).
              </p>
            </div>

            {/* ANSI 87L Trip Delay */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
                ANSI 87L Trip Confirmation Delay
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="25"
                  value={tripDelayMs}
                  onChange={(e) => setTripDelayMs(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-sm text-sm font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-rose-500"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">ms</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-zinc-500">
                Filter duration to prevent nuisance tripping during inrush (default: 150 ms).
              </p>
            </div>

            {/* Overcurrent Trip */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
                ANSI 50/51 Overcurrent Limit
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  value={overcurrentA}
                  onChange={(e) => setOvercurrentA(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-sm text-sm font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-rose-500"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">Amperes</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-zinc-500">
                Instantaneous overcurrent thermal trip boundary (default: 18.0 A).
              </p>
            </div>

            {/* Undervoltage Limit */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
                ANSI 27 Undervoltage Sag Limit
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  value={undervoltageV}
                  onChange={(e) => setUndervoltageV(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-sm text-sm font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-amber-500"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">Volts</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-zinc-500">
                CEA grid nominal −15% lower threshold (default: 195.5 V).
              </p>
            </div>

            {/* Overvoltage Limit */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
                ANSI 59 Overvoltage Swell Limit
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  value={overvoltageV}
                  onChange={(e) => setOvervoltageV(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-sm text-sm font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-amber-500"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">Volts</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-zinc-500">
                CEA grid nominal +10% upper boundary (default: 253.0 V).
              </p>
            </div>

            {/* Neutral Spread */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
                Broken Neutral Spread (Vmax − Vmin)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value="40.0"
                  disabled
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-sm text-sm font-mono text-slate-500 dark:text-zinc-500 outline-none"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">Volts</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-zinc-500">
                Trips when floating neutral causes voltage divergence &gt;40V.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 4: SUBSTATION & RTU COMMS PARAMETERS */}
        <Card className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] shadow-sm rounded-sm md:col-span-2">
          <CardHeader className="pb-3 border-b border-slate-200 dark:border-zinc-800/80">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <Server className="h-4 w-4 text-emerald-500" />
              <span>Substation Gateway &amp; Telemetry Links</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                Primary Substation
              </label>
              <input
                type="text"
                value={substationName}
                onChange={(e) => setSubstationName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-sm text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                Feeder ID
              </label>
              <input
                type="text"
                value={feederId}
                onChange={(e) => setFeederId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-sm text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                Gateway IP / Host
              </label>
              <input
                type="text"
                value={gatewayIp}
                onChange={(e) => setGatewayIp(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-sm text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
