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
  Wrench,
  Shield,
  Phone,
  MessageSquare,
  AlertTriangle,
  Send,
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

  // OMS Escalation Policy States (Kerala KSEB Outage Soak Model)
  const [soakDurationMinutes, setSoakDurationMinutes] = useState<number>(15);
  const [safetyOverrideEnabled, setSafetyOverrideEnabled] = useState<boolean>(true);
  const [linemanPhone, setLinemanPhone] = useState<string>("+919037129026");
  const [notifyOnEscalation, setNotifyOnEscalation] = useState<boolean>(true);
  const [telegramBotToken, setTelegramBotToken] = useState<string>("");
  const [telegramChatId, setTelegramChatId] = useState<string>("");
  const [telegramEnabled, setTelegramEnabled] = useState<boolean>(true);
  const [testStatus, setTestStatus] = useState<{ loading: boolean; success?: boolean; message?: string } | null>(null);

  // Load existing OMS settings
  React.useEffect(() => {
    fetch("/api/oms/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data?.settings) {
          if (typeof data.settings.soakDurationMinutes === "number") {
            setSoakDurationMinutes(data.settings.soakDurationMinutes);
          }
          if (typeof data.settings.safetyOverrideEnabled === "boolean") {
            setSafetyOverrideEnabled(data.settings.safetyOverrideEnabled);
          }
          if (typeof data.settings.linemanPhone === "string") {
            setLinemanPhone(data.settings.linemanPhone);
          }
          if (typeof data.settings.notifyOnEscalation === "boolean") {
            setNotifyOnEscalation(data.settings.notifyOnEscalation);
          }
          if (typeof data.settings.telegramBotToken === "string") {
            setTelegramBotToken(data.settings.telegramBotToken);
          }
          if (typeof data.settings.telegramChatId === "string") {
            setTelegramChatId(data.settings.telegramChatId);
          }
          if (typeof data.settings.telegramEnabled === "boolean") {
            setTelegramEnabled(data.settings.telegramEnabled);
          }
        }
      })
      .catch((err) => console.error("Failed to load OMS settings:", err));
  }, []);

  const handleTestTelegram = async () => {
    setTestStatus({ loading: true });
    try {
      const res = await fetch("/api/oms/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_telegram",
          botToken: telegramBotToken,
          chatId: telegramChatId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestStatus({ loading: false, success: true, message: `Ping sent! Check your Telegram app.` });
      } else {
        setTestStatus({ loading: false, success: false, message: data.error || "Failed to contact Telegram bot" });
      }
    } catch (err: any) {
      setTestStatus({ loading: false, success: false, message: err?.message || "Network error" });
    }
  };

  const handleSave = async () => {
    try {
      await fetch("/api/oms/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soakDurationMinutes,
          safetyOverrideEnabled,
          linemanPhone,
          notifyOnEscalation,
          telegramBotToken,
          telegramChatId,
          telegramEnabled,
        }),
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    } catch (err) {
      console.error("Save error:", err);
    }
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

        {/* SECTION 4: OUTAGE MANAGEMENT SYSTEM (OMS) & ESCALATION POLICY */}
        <Card className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] shadow-sm rounded-sm md:col-span-2">
          <CardHeader className="pb-3 border-b border-slate-200 dark:border-zinc-800/80">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <Wrench className="h-4 w-4 text-amber-500" />
                <span>Outage Management &amp; Soak Escalation Policy (KSEB Field Dispatch)</span>
              </CardTitle>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-xs border border-emerald-500/30">
                CEA SEC 44 &amp; IEEE 1366
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Soak Duration */}
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                  Outage Soak Duration (Observation Window)
                </label>
                <span className="text-amber-600 dark:text-amber-400 font-bold text-xs tabular-nums">
                  {soakDurationMinutes} Minutes
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                Incidents are monitored before notifying the operator or dispatching linemen. If power is restored naturally within this window (e.g. routine local maintenance), the event is auto-archived with zero lineman dispatch.
              </p>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
                {[
                  { label: "1m (Demo)", val: 1 },
                  { label: "2m (Demo)", val: 2 },
                  { label: "5m", val: 5 },
                  { label: "15m (Std)", val: 15 },
                  { label: "30m", val: 30 },
                  { label: "60m", val: 60 },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => setSoakDurationMinutes(item.val)}
                    className={`py-1.5 px-2 rounded-sm border text-center text-xs font-mono transition-all cursor-pointer ${
                      soakDurationMinutes === item.val
                        ? "bg-amber-500 text-white font-bold border-amber-600 shadow-xs"
                        : "bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-400"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Telegram Automated Dispatch Configuration */}
            <div className="space-y-3 md:col-span-3 border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 p-3.5 rounded-sm">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-cyan-500" />
                  <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-wider">
                    KSEB Field Dispatch // Telegram Bot Integration (Automated Alerting)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                    Silent Background Alerts • No Browser Redirects
                  </span>
                  <button
                    type="button"
                    onClick={() => setTelegramEnabled(!telegramEnabled)}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-xs border transition-all cursor-pointer ${
                      telegramEnabled
                        ? "bg-cyan-600 text-white border-cyan-700"
                        : "bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-300 dark:border-zinc-700"
                    }`}
                  >
                    {telegramEnabled ? "TELEGRAM ACTIVE" : "DISABLED"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* Bot Token */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                    Telegram Bot Token (@BotFather)
                  </label>
                  <input
                    type="password"
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    placeholder="e.g. 7489201923:AAHkL78eM..."
                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-sm text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-cyan-500"
                  />
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                    Create a free bot on Telegram by messaging <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-cyan-600 dark:text-cyan-400 underline">@BotFather</a>.
                  </p>
                </div>

                {/* Chat ID */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                    Telegram Chat ID / Lineman Group ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      placeholder="e.g. 987654321 or -100123456789"
                      className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-sm text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-cyan-500"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleTestTelegram}
                      disabled={testStatus?.loading || !telegramBotToken || !telegramChatId}
                      className="h-8 text-xs shrink-0 border-cyan-500/50 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/40"
                    >
                      {testStatus?.loading ? "Pinging..." : "Test Bot ➔"}
                    </Button>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                    Message <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="text-cyan-600 dark:text-cyan-400 underline">@userinfobot</a> to get your Chat ID or add the bot to a line crew group.
                  </p>
                </div>
              </div>

              {testStatus && (
                <div
                  className={`p-2 rounded-xs text-xs flex items-center justify-between border ${
                    testStatus.success
                      ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 text-emerald-800 dark:text-emerald-300"
                      : "bg-rose-50 dark:bg-rose-950/30 border-rose-500 text-rose-800 dark:text-rose-300"
                  }`}
                >
                  <span>{testStatus.message}</span>
                  <button
                    type="button"
                    onClick={() => setTestStatus(null)}
                    className="text-[10px] underline ml-2 opacity-70 hover:opacity-100"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>

            {/* Safety Critical Override Toggle */}
            <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/60 p-3 rounded-sm space-y-2 md:col-span-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-rose-500" />
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                      Safety Critical Override: Immediate Escalation for Physical Conductor Breaks
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 block">
                      When active, broken conductor trips (ANSI 46BC) bypass the soak period immediately due to public electrocution hazards.
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSafetyOverrideEnabled(!safetyOverrideEnabled)}
                  className={`px-3 py-1 text-xs font-bold rounded-sm border transition-all cursor-pointer ${
                    safetyOverrideEnabled
                      ? "bg-rose-600 text-white border-rose-700 shadow-xs"
                      : "bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-300 dark:border-zinc-700"
                  }`}
                >
                  {safetyOverrideEnabled ? "OVERRIDE ACTIVE (IMMEDIATE)" : "OVERRIDE DISABLED"}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 5: SUBSTATION & RTU COMMS PARAMETERS */}
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
