"use client";

import React, { useState } from "react";
import {
  Settings,
  Sun,
  Moon,
  Clock,
  ShieldAlert,
  Server,
  Save,
  CheckCircle2,
  RefreshCw,
  Volume2,
  VolumeX,
  Wrench,
  Shield,
  Phone,
  Send,
  Zap,
  Activity,
  Sliders,
} from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import { useDashboard } from "@/context/DashboardContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { isAudioMuted, toggleAudioMuted, setScadaSettings } = useDashboard();

  // Settings form states
  const [refreshRateMs, setRefreshRateMs] = useState<number>(1000);
  const [differentialPickupA, setDifferentialPickupA] = useState<number>(0.35);
  const [tripDelayMs, setTripDelayMs] = useState<number>(150);
  const [undervoltageV, setUndervoltageV] = useState<number>(195.5);
  const [overvoltageV, setOvervoltageV] = useState<number>(253.0);
  const [overcurrentA, setOvercurrentA] = useState<number>(18.0);
  const [brokenNeutralSpreadV, setBrokenNeutralSpreadV] = useState<number>(30.0);
  const [substationName, setSubstationName] = useState<string>("Angamaly 33/11kV Substation");
  const [feederId, setFeederId] = useState<string>("FEEDER-04");
  const [gatewayIp, setGatewayIp] = useState<string>("192.168.1.100");
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // OMS Escalation Policy States
  const [soakDurationMinutes, setSoakDurationMinutes] = useState<number>(15);
  const [safetyOverrideEnabled, setSafetyOverrideEnabled] = useState<boolean>(true);
  const [linemanPhone, setLinemanPhone] = useState<string>("+919037129026");
  const [notifyOnEscalation, setNotifyOnEscalation] = useState<boolean>(true);
  const [telegramBotToken, setTelegramBotToken] = useState<string>("");
  const [telegramChatId, setTelegramChatId] = useState<string>("");
  const [telegramEnabled, setTelegramEnabled] = useState<boolean>(true);
  const [testStatus, setTestStatus] = useState<{ loading: boolean; success?: boolean; message?: string } | null>(null);

  // Load existing OMS & SCADA settings from API & localStorage
  React.useEffect(() => {
    fetch("/api/oms/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data?.settings) {
          const s = data.settings;
          if (typeof s.soakDurationMinutes === "number") setSoakDurationMinutes(s.soakDurationMinutes);
          if (typeof s.safetyOverrideEnabled === "boolean") setSafetyOverrideEnabled(s.safetyOverrideEnabled);
          if (typeof s.linemanPhone === "string") setLinemanPhone(s.linemanPhone);
          if (typeof s.notifyOnEscalation === "boolean") setNotifyOnEscalation(s.notifyOnEscalation);
          if (typeof s.telegramBotToken === "string") setTelegramBotToken(s.telegramBotToken);
          if (typeof s.telegramChatId === "string") setTelegramChatId(s.telegramChatId);
          if (typeof s.telegramEnabled === "boolean") setTelegramEnabled(s.telegramEnabled);
          if (typeof s.refreshRateMs === "number") setRefreshRateMs(s.refreshRateMs);
          if (typeof s.differentialPickupA === "number") setDifferentialPickupA(s.differentialPickupA);
          if (typeof s.tripDelayMs === "number") setTripDelayMs(s.tripDelayMs);
          if (typeof s.overcurrentA === "number") setOvercurrentA(s.overcurrentA);
          if (typeof s.undervoltageV === "number") setUndervoltageV(s.undervoltageV);
          if (typeof s.overvoltageV === "number") setOvervoltageV(s.overvoltageV);
          if (typeof s.brokenNeutralSpreadV === "number") setBrokenNeutralSpreadV(s.brokenNeutralSpreadV);
          if (typeof s.substationName === "string") setSubstationName(s.substationName);
          if (typeof s.feederId === "string") setFeederId(s.feederId);
          if (typeof s.gatewayIp === "string") setGatewayIp(s.gatewayIp);
        }
      })
      .catch((err) => console.error("Failed to load OMS settings:", err));

    try {
      const savedRate = localStorage.getItem("gridsense_refresh_rate");
      if (savedRate) setRefreshRateMs(Number(savedRate));
      const savedDiff = localStorage.getItem("gridsense_diff_pickup");
      if (savedDiff) setDifferentialPickupA(Number(savedDiff));
      const savedParams = localStorage.getItem("gridsense_scada_params");
      if (savedParams) {
        const parsed = JSON.parse(savedParams);
        if (typeof parsed.tripDelayMs === "number") setTripDelayMs(parsed.tripDelayMs);
        if (typeof parsed.undervoltageV === "number") setUndervoltageV(parsed.undervoltageV);
        if (typeof parsed.overvoltageV === "number") setOvervoltageV(parsed.overvoltageV);
        if (typeof parsed.overcurrentA === "number") setOvercurrentA(parsed.overcurrentA);
        if (typeof parsed.brokenNeutralSpreadV === "number") setBrokenNeutralSpreadV(parsed.brokenNeutralSpreadV);
        if (typeof parsed.substationName === "string") setSubstationName(parsed.substationName);
        if (typeof parsed.feederId === "string") setFeederId(parsed.feederId);
        if (typeof parsed.gatewayIp === "string") setGatewayIp(parsed.gatewayIp);
      }
    } catch {}
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
        setTestStatus({ loading: false, success: true, message: "Test alert delivered to Telegram successfully!" });
      } else {
        setTestStatus({ loading: false, success: false, message: data.error || "Failed to reach Telegram bot" });
      }
    } catch (err: any) {
      setTestStatus({ loading: false, success: false, message: err?.message || "Network error" });
    }
  };

  const handleSave = async () => {
    try {
      const payload = {
        soakDurationMinutes,
        safetyOverrideEnabled,
        linemanPhone,
        notifyOnEscalation,
        telegramBotToken,
        telegramChatId,
        telegramEnabled,
        refreshRateMs,
        differentialPickupA,
        tripDelayMs,
        overcurrentA,
        undervoltageV,
        overvoltageV,
        brokenNeutralSpreadV,
        substationName,
        feederId,
        gatewayIp,
      };

      const res = await fetch("/api/oms/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.settings) {
        setScadaSettings(data.settings);
      }

      try {
        localStorage.setItem("gridsense_refresh_rate", String(refreshRateMs));
        localStorage.setItem("gridsense_diff_pickup", String(differentialPickupA));
        localStorage.setItem(
          "gridsense_scada_params",
          JSON.stringify({
            tripDelayMs,
            undervoltageV,
            overvoltageV,
            overcurrentA,
            brokenNeutralSpreadV,
            substationName,
            feederId,
            gatewayIp,
          })
        );
      } catch {}

      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    } catch (err) {
      console.error("Save error:", err);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto font-mono select-none pb-8 text-xs">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-zinc-800 pb-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <Settings className="h-3.5 w-3.5" />
            <span>SYSTEM CONFIGURATION</span>
          </div>
          <h1 className="text-lg font-black tracking-tight text-slate-900 dark:text-zinc-100 mt-0.5">
            SCADA Parameters &amp; Thresholds
          </h1>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
            Configure sampling rates, protection thresholds, and automated field dispatch.
          </p>
        </div>

        <Button
          onClick={handleSave}
          className={`h-8 px-4 font-bold text-xs uppercase tracking-wider gap-2 shadow-xs cursor-pointer transition-all ${
            isSaved
              ? "bg-emerald-600 hover:bg-emerald-600 text-white"
              : "bg-emerald-600 hover:bg-emerald-500 text-white"
          }`}
        >
          {isSaved ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <span>CHANGES SAVED</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>SAVE CONFIGURATION</span>
            </>
          )}
        </Button>
      </div>

      {/* SECTION 1: DISPLAY & ENVIRONMENT */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Card 1A: Theme Toggle */}
        <Card className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] shadow-xs rounded-sm">
          <CardHeader className="py-2.5 px-3 border-b border-slate-200 dark:border-zinc-800/80">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Sun className="h-3.5 w-3.5 text-amber-500" />
              <span>Color Theme</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => theme === "dark" && toggleTheme()}
                className={`py-2 px-2.5 rounded-xs border text-center transition-all cursor-pointer ${
                  theme === "light"
                    ? "bg-slate-100 border-emerald-500 text-slate-900 font-bold shadow-xs"
                    : "bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:border-slate-400"
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 text-xs">
                  <Sun className="h-3.5 w-3.5 text-amber-500" />
                  <span>Day Light</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => theme === "light" && toggleTheme()}
                className={`py-2 px-2.5 rounded-xs border text-center transition-all cursor-pointer ${
                  theme === "dark"
                    ? "bg-zinc-900 border-emerald-500 text-zinc-100 font-bold shadow-xs"
                    : "bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:border-slate-400"
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 text-xs">
                  <Moon className="h-3.5 w-3.5 text-indigo-400" />
                  <span>SCADA Dark</span>
                </div>
              </button>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-zinc-500 text-center">
              Active mode: <strong className="text-slate-800 dark:text-zinc-300">{theme.toUpperCase()}</strong>
            </div>
          </CardContent>
        </Card>

        {/* Card 1B: Annunciator Horn */}
        <Card className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] shadow-xs rounded-sm">
          <CardHeader className="py-2.5 px-3 border-b border-slate-200 dark:border-zinc-800/80">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Volume2 className="h-3.5 w-3.5 text-emerald-500" />
              <span>Alarm Horn (Audio)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between p-2 rounded-xs border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950">
              <div className="flex items-center gap-2">
                {isAudioMuted ? (
                  <VolumeX className="h-4 w-4 text-amber-500" />
                ) : (
                  <Volume2 className="h-4 w-4 text-emerald-500" />
                )}
                <div>
                  <div className="font-bold text-xs text-slate-800 dark:text-zinc-200">
                    {isAudioMuted ? "MUTED" : "ARMED"}
                  </div>
                  <div className="text-[9px] text-slate-500 dark:text-zinc-500">
                    {isAudioMuted ? "Audio disabled" : "Audible on fault trip"}
                  </div>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleAudioMuted}
                className={`h-6 px-2 text-[10px] font-bold uppercase cursor-pointer ${
                  isAudioMuted
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50"
                    : "border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-50"
                }`}
              >
                {isAudioMuted ? "Enable" : "Silence"}
              </Button>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-zinc-500 text-center">
              Alerts on ANSI 87L differential breaker trip
            </div>
          </CardContent>
        </Card>

        {/* Card 1C: Sampling Rate */}
        <Card className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] shadow-xs rounded-sm">
          <CardHeader className="py-2.5 px-3 border-b border-slate-200 dark:border-zinc-800/80">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5 text-cyan-500" />
              <span>Telemetry Sampling Rate</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { val: 250, label: "250ms (4Hz)" },
                { val: 500, label: "500ms (2Hz)" },
                { val: 1000, label: "1s (Std)" },
              ].map((rate) => (
                <button
                  key={rate.val}
                  type="button"
                  onClick={() => setRefreshRateMs(rate.val)}
                  className={`py-1.5 px-1 rounded-xs border text-center text-[10px] font-mono cursor-pointer transition-colors ${
                    refreshRateMs === rate.val
                      ? "bg-cyan-50 dark:bg-cyan-950/60 border-cyan-500 text-cyan-700 dark:text-cyan-300 font-bold shadow-xs"
                      : "bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-400"
                  }`}
                >
                  {rate.label}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-zinc-500 text-center">
              Current interval: <strong className="text-cyan-600 dark:text-cyan-400">{refreshRateMs} ms</strong>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SECTION 2: TELEGRAM FIELD DISPATCH INTEGRATION */}
      <Card className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] shadow-xs rounded-sm">
        <CardHeader className="py-2.5 px-3 border-b border-slate-200 dark:border-zinc-800/80 flex flex-row items-center justify-between">
          <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5 text-cyan-500" />
            <span>Telegram Bot Automated Field Alerting</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTelegramEnabled(!telegramEnabled)}
              className={`px-2 py-0.5 text-[9px] font-bold rounded-xs border transition-all cursor-pointer ${
                telegramEnabled
                  ? "bg-cyan-600 text-white border-cyan-700 shadow-xs"
                  : "bg-slate-200 dark:bg-zinc-800 text-slate-500 border-slate-300 dark:border-zinc-700"
              }`}
            >
              {telegramEnabled ? "● ACTIVE" : "○ DISABLED"}
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Bot Token */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
                  Bot Token
                </label>
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  Create via @BotFather ↗
                </a>
              </div>
              <input
                type="password"
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                placeholder="e.g. 7489201923:AAHkL78eM..."
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xs text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-cyan-500"
              />
            </div>

            {/* Chat ID */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
                  Lineman Chat ID or Group ID
                </label>
                <a
                  href="https://t.me/userinfobot"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  Find ID via @userinfobot ↗
                </a>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="e.g. 1995801205 or -100123456789"
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xs text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-cyan-500"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleTestTelegram}
                  disabled={testStatus?.loading || !telegramBotToken || !telegramChatId}
                  className="h-7 text-[10px] font-bold shrink-0 border-cyan-500/50 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 cursor-pointer"
                >
                  {testStatus?.loading ? "Pinging..." : "Test Bot ➔"}
                </Button>
              </div>
            </div>
          </div>

          {/* Test Status Notice */}
          {testStatus && (
            <div
              className={`p-2 rounded-xs text-[11px] flex items-center justify-between border ${
                testStatus.success
                  ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 text-emerald-800 dark:text-emerald-300"
                  : "bg-rose-50 dark:bg-rose-950/30 border-rose-500 text-rose-800 dark:text-rose-300"
              }`}
            >
              <span>{testStatus.message}</span>
              <button
                type="button"
                onClick={() => setTestStatus(null)}
                className="text-[10px] underline ml-2 opacity-70 hover:opacity-100 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 3: OUTAGE SOAK & SAFETY POLICY */}
      <Card className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] shadow-xs rounded-sm">
        <CardHeader className="py-2.5 px-3 border-b border-slate-200 dark:border-zinc-800/80">
          <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            <span>Outage Soak &amp; Public Safety Policy</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-3">
          {/* Soak Duration */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
                Observation Window (Soak Duration)
              </label>
              <span className="text-amber-600 dark:text-amber-400 font-bold text-xs">
                {soakDurationMinutes} Minutes
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {[
                { label: "1 min", val: 1 },
                { label: "2 min", val: 2 },
                { label: "5 min", val: 5 },
                { label: "15 min (Std)", val: 15 },
                { label: "30 min", val: 30 },
                { label: "60 min", val: 60 },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => setSoakDurationMinutes(item.val)}
                  className={`py-1.5 px-2 rounded-xs border text-center text-[10px] font-mono cursor-pointer transition-all ${
                    soakDurationMinutes === item.val
                      ? "bg-amber-500 text-white font-bold border-amber-600 shadow-xs"
                      : "bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-400"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-zinc-500 mt-1">
              Suppresses lineman dispatch if power restores naturally before the timer expires.
            </p>
          </div>

          {/* Safety Critical Override */}
          <div className="border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-2.5 rounded-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Shield className={`h-4 w-4 shrink-0 ${safetyOverrideEnabled ? "text-rose-500" : "text-slate-400"}`} />
              <div>
                <div className="font-bold text-xs text-slate-800 dark:text-zinc-200">
                  Public Safety Override (ANSI 46BC)
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                  Immediately bypasses soak observation for fallen/broken lines to prevent public electrocution.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSafetyOverrideEnabled(!safetyOverrideEnabled)}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-xs border transition-all shrink-0 cursor-pointer ${
                safetyOverrideEnabled
                  ? "bg-rose-600 text-white border-rose-700 shadow-xs"
                  : "bg-slate-200 dark:bg-zinc-800 text-slate-500 border-slate-300 dark:border-zinc-700"
              }`}
            >
              {safetyOverrideEnabled ? "OVERRIDE ENABLED" : "DISABLED"}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 4: ANSI PROTECTION THRESHOLDS */}
      <Card className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] shadow-xs rounded-sm">
        <CardHeader className="py-2.5 px-3 border-b border-slate-200 dark:border-zinc-800/80">
          <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
            <span>Protection Relay Thresholds (ANSI Standards)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {/* ANSI 87L Differential */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
              ANSI 87L Differential (ΔI)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.05"
                value={differentialPickupA}
                onChange={(e) => setDifferentialPickupA(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xs text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-rose-500"
              />
              <span className="absolute right-2.5 top-1.5 text-[10px] text-slate-400">Amperes</span>
            </div>
            <span className="text-[9px] text-slate-400">Default: 0.35 A</span>
          </div>

          {/* ANSI 87L Delay */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
              ANSI 87L Trip Delay
            </label>
            <div className="relative">
              <input
                type="number"
                step="25"
                value={tripDelayMs}
                onChange={(e) => setTripDelayMs(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xs text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-rose-500"
              />
              <span className="absolute right-2.5 top-1.5 text-[10px] text-slate-400">ms</span>
            </div>
            <span className="text-[9px] text-slate-400">Inrush filter (Default: 150 ms)</span>
          </div>

          {/* Overcurrent 50/51 */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
              ANSI 50/51 Overcurrent
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.5"
                value={overcurrentA}
                onChange={(e) => setOvercurrentA(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xs text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-rose-500"
              />
              <span className="absolute right-2.5 top-1.5 text-[10px] text-slate-400">Amperes</span>
            </div>
            <span className="text-[9px] text-slate-400">Thermal trip limit (Default: 18.0 A)</span>
          </div>

          {/* Undervoltage 27 */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
              ANSI 27 Undervoltage Sag
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.5"
                value={undervoltageV}
                onChange={(e) => setUndervoltageV(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xs text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-amber-500"
              />
              <span className="absolute right-2.5 top-1.5 text-[10px] text-slate-400">Volts</span>
            </div>
            <span className="text-[9px] text-slate-400">CEA −15% limit (Default: 195.5 V)</span>
          </div>

          {/* Overvoltage 59 */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
              ANSI 59 Overvoltage Swell
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.5"
                value={overvoltageV}
                onChange={(e) => setOvervoltageV(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xs text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-amber-500"
              />
              <span className="absolute right-2.5 top-1.5 text-[10px] text-slate-400">Volts</span>
            </div>
            <span className="text-[9px] text-slate-400">CEA +10% limit (Default: 253.0 V)</span>
          </div>

          {/* Neutral Voltage Spread */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
              ANSI 59N Broken Neutral Spread
            </label>
            <div className="relative">
              <input
                type="number"
                step="1.0"
                value={brokenNeutralSpreadV}
                onChange={(e) => setBrokenNeutralSpreadV(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xs text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-rose-500"
              />
              <span className="absolute right-2.5 top-1.5 text-[10px] text-slate-400">Volts</span>
            </div>
            <span className="text-[9px] text-slate-400">Floating neutral trip boundary (Default: 30.0 V)</span>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 5: STATION & RTU IDENTITY */}
      <Card className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] shadow-xs rounded-sm">
        <CardHeader className="py-2.5 px-3 border-b border-slate-200 dark:border-zinc-800/80">
          <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-emerald-500" />
            <span>Station &amp; Gateway Parameters</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Primary Substation
            </label>
            <input
              type="text"
              value={substationName}
              onChange={(e) => setSubstationName(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xs text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Feeder Designation
            </label>
            <input
              type="text"
              value={feederId}
              onChange={(e) => setFeederId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xs text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Gateway IP / Host
            </label>
            <input
              type="text"
              value={gatewayIp}
              onChange={(e) => setGatewayIp(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xs text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
