"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  User,
  Zap,
  AlertTriangle,
  Eye,
  EyeOff,
  ShieldCheck,
  Radio,
  Activity,
  Cpu,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("operator");
  const [password, setPassword] = useState("gridsense123");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [clockTime, setClockTime] = useState<string>("");

  useEffect(() => {
    setClockTime(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    const interval = setInterval(() => {
      setClockTime(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async (u = username, p = password) => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Authentication failed");
        setIsLoading(false);
        return;
      }

      setIsAuthorized(true);
      router.push("/");
      router.refresh();
    } catch {
      setErrorMsg("Network error communicating with authentication service");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#09090b] text-slate-900 dark:text-[#fafafa] flex flex-col justify-between p-3 md:p-4 font-mono select-none transition-colors">
      {/* Background Subtle Substation Grid Aesthetics */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />

      {/* 1. TOP SCADA HEADER BAR - IDENTICAL FORMAT TO MAIN DASHBOARD */}
      <header className="relative z-10 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1012] p-3 rounded-sm flex flex-wrap items-center justify-between gap-3 shadow-xs dark:shadow-none transition-colors">
        {/* Left: Branding & System Name */}
        <div className="flex items-center gap-3">
          <div className="p-2 border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 rounded-sm">
            <Zap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100">
                GRIDSENSE ADMS // 415V/230V LT DISTRIBUTION DISPATCH CONSOLE
              </h1>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-zinc-400">
              ANGAMALY 33/11kV PRIMARY SUBSTATION • FEEDER 04 SUPERVISORY DESK
            </div>
          </div>
        </div>

        {/* Right: Real-time Telemetry & Gateway Status Indicators */}
        <div className="flex items-center gap-3">
          <Badge
            variant="healthy"
            className="flex items-center gap-1.5 py-1 text-[11px]"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-ping" />
            <span>SCADA GATEWAY READY</span>
          </Badge>

          <div
            suppressHydrationWarning
            className="border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-2.5 py-1 rounded-sm text-[11px] text-slate-600 dark:text-zinc-400 tabular-nums"
          >
            CLOCK (IST): <span className="text-slate-900 dark:text-zinc-200">{clockTime || "--:--:--"}</span>
          </div>
        </div>
      </header>

      {/* 2. CENTER SCADA DISPATCH TERMINAL - 2-COLUMN INDUSTRIAL WORKSTATION */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-2 sm:p-4 my-auto">
        <div className="w-full max-w-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1012] rounded-sm shadow-xl grid grid-cols-1 md:grid-cols-12 overflow-hidden transition-colors">
          
          {/* Left Column: Substation Telemetry Radar & Supervised Assets Preview */}
          <div className="md:col-span-5 bg-slate-50 dark:bg-[#0a0b0d] p-5 sm:p-6 border-b md:border-b-0 md:border-r border-slate-200 dark:border-zinc-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200 dark:border-zinc-800/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" />
                  SUBSTATION BUS
                </span>
                <span className="text-[9px] px-1.5 py-0.5 bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 rounded-xs font-mono">
                  ONLINE
                </span>
              </div>

              {/* Substation Feeder Matrix Metrics */}
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/80 rounded-sm">
                  <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Substation</span>
                  <span className="font-bold text-slate-800 dark:text-zinc-200 text-[11px]">Angamaly 33/11kV</span>
                </div>

                <div className="flex items-center justify-between p-2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/80 rounded-sm">
                  <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Transformer</span>
                  <span className="font-bold text-slate-800 dark:text-zinc-200 text-[11px]">DTR-01 (250 kVA)</span>
                </div>

                <div className="flex items-center justify-between p-2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/80 rounded-sm">
                  <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Supervised Poles</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">28 Poles (Feeders 1-3)</span>
                </div>

                <div className="flex items-center justify-between p-2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/80 rounded-sm">
                  <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Protection Scheme</span>
                  <span className="font-bold text-cyan-600 dark:text-cyan-400 text-[11px]">ANSI 87L Differential</span>
                </div>
              </div>
            </div>

            {/* Live 3-Phase Nominal Indicator */}
            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-zinc-800/80">
              <div className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Phase Bus Monitoring</span>
                <span className="text-[9px] text-emerald-500 font-bold">50.0 Hz</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                <div className="bg-white dark:bg-zinc-950 border border-red-500/30 p-1 rounded-sm">
                  <div className="text-red-500 font-bold">Φ R</div>
                  <div className="text-slate-700 dark:text-zinc-300 font-mono text-[9px]">230.2V</div>
                </div>
                <div className="bg-white dark:bg-zinc-950 border border-amber-500/30 p-1 rounded-sm">
                  <div className="text-amber-500 font-bold">Φ Y</div>
                  <div className="text-slate-700 dark:text-zinc-300 font-mono text-[9px]">229.8V</div>
                </div>
                <div className="bg-white dark:bg-zinc-950 border border-blue-500/30 p-1 rounded-sm">
                  <div className="text-blue-500 font-bold">Φ B</div>
                  <div className="text-slate-700 dark:text-zinc-300 font-mono text-[9px]">230.1V</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Operator Authentication Form */}
          <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-center">
            <div className="mb-5 pb-3 border-b border-slate-200 dark:border-zinc-800">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>OPERATOR AUTHENTICATION</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                Enter authorized credentials to initialize the supervisory desk.
              </p>
            </div>

            {errorMsg && (
              <div className="mb-4 p-2.5 bg-rose-50 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-200 text-xs rounded-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500 dark:text-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                  Operator ID / Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-zinc-500" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="operator"
                    autoComplete="username"
                    required
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 rounded-sm font-mono outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                  Keyphrase / Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-zinc-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    required
                    className="w-full pl-9 pr-10 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 rounded-sm font-mono outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || isAuthorized}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold text-xs tracking-wider uppercase rounded-sm shadow-xs transition-all flex items-center justify-center gap-2 border border-emerald-400/30"
              >
                {isLoading || isAuthorized ? (
                  <>
                    <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Logging in...</span>
                  </>
                ) : (
                  <span>AUTHENTICATE DISPATCH SESSION</span>
                )}
              </button>
            </form>

            {/* Subtle Console Hint */}
            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-zinc-800/80 flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-500">
              <span>DEFAULT ACCESS: <strong className="text-slate-700 dark:text-zinc-300">operator / gridsense123</strong></span>
              <span>ROLE: DISPATCHER</span>
            </div>
          </div>
        </div>
      </main>

      {/* 3. BOTTOM SCADA FOOTER BAR */}
      <footer className="relative z-10 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1012] px-4 py-2 rounded-sm text-[10px] text-slate-500 dark:text-zinc-500 flex flex-wrap items-center justify-between shadow-xs dark:shadow-none transition-colors">
        <div>
          <span>GRIDSENSE SCADA ADMS • IEC 61850 &amp; IEEE C37.118 COMPLIANT</span>
        </div>
        <div className="flex items-center gap-3">
          <span>SECURITY: HMAC-SHA256 SIGNED</span>
          <span>•</span>
          <span>DISTRIBUTION ADMS v2.0</span>
        </div>
      </footer>
    </div>
  );
}
