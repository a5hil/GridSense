"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, User, Zap, AlertTriangle, Eye, EyeOff, KeyRound, Clock } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useDashboard } from "@/context/DashboardContext";
import {
  HairlineTransmissionGrid,
  LayoutStyle,
} from "@/components/scada/HairlineTransmissionGrid";

// ZULU / GMT 24-hour timestamp formatter for SCADA operator logging
const ZULU_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const LAYOUT_PRESETS: { id: LayoutStyle; label: string; desc: string }[] = [
  {
    id: "corridor",
    label: "01 // HV CORRIDOR",
    desc: "Pure high-voltage transmission right-of-way framing the upper skyline (Towers only connect to towers)",
  },
  {
    id: "lifecycle",
    label: "02 // STEP-DOWN LIFECYCLE",
    desc: "End-to-end electrical path: HV Towers -> Substation Step-Down Transformer -> MV Feeder Poles",
  },
  {
    id: "flanked",
    label: "03 // FLANKED WINGS",
    desc: "Left HV Switching & Right Substation Hub; zero lines crossing behind central login card",
  },
  {
    id: "switchyard",
    label: "04 // SUBSTATION YARD",
    desc: "Panoramic lower-third substation switchyard with dual parallel transformers & gantry incomer",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { setCurrentUser } = useDashboard();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [zuluTime, setZuluTime] = useState<string>("");
  const [layoutStyle, setLayoutStyle] = useState<LayoutStyle>("corridor");

  useEffect(() => {
    const updateTime = () => setZuluTime(ZULU_TIME_FORMATTER.format(new Date()));
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Restore preferred transmission layout preset from storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("gridsense-login-layout") as LayoutStyle | null;
      if (stored && ["corridor", "lifecycle", "flanked", "switchyard"].includes(stored)) {
        setLayoutStyle(stored);
      }
    } catch {}
  }, []);

  const handleSelectLayout = (style: LayoutStyle) => {
    setLayoutStyle(style);
    try {
      localStorage.setItem("gridsense-login-layout", style);
    } catch {}
  };

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

      if (data.user) {
        setCurrentUser(data.user);
      }
      setIsAuthorized(true);

      // Check for redirect return url
      let targetPath = "/";
      if (typeof window !== "undefined") {
        const fromParam = new URLSearchParams(window.location.search).get("from");
        if (fromParam && fromParam.startsWith("/")) {
          targetPath = fromParam;
        }
      }

      router.push(targetPath);
      router.refresh();
    } catch {
      setErrorMsg("Network error communicating with authentication service");
      setIsLoading(false);
    }
  };

  const fillDemoCredentials = () => {
    setUsername("operator");
    setPassword("gridsense123");
    setErrorMsg(null);
  };

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-[#050608] text-slate-900 dark:text-[#fafafa] flex flex-col justify-between p-3 md:p-4 font-mono select-none transition-colors overflow-hidden">
      {/* 0. ISOMETRIC HAIRLINE TRANSMISSION GRID BACKGROUND (z-index: 0) */}
      <HairlineTransmissionGrid layoutStyle={layoutStyle} />

      {/* 1. TOP SCADA HEADER BAR (z-index: 10) */}
      <header className="relative z-10 border border-slate-200/90 dark:border-zinc-800/90 bg-white/95 dark:bg-[#0c0d10]/95 backdrop-blur-md p-3.5 rounded-sm flex items-center justify-between shadow-xs dark:shadow-none transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 rounded-sm">
            <Zap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100">
              GRIDSENSE ADMS
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* SCADA DARK / DAY LIGHT Theme Switcher */}
          <ThemeToggle />

          {/* Real-time ZULU / GMT timestamp tracker */}
          <div
            suppressHydrationWarning
            className="h-8 flex items-center gap-1.5 px-2.5 rounded-sm border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-950/80 text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums hidden sm:flex font-mono shadow-2xs"
          >
            <Clock className="h-3 w-3 text-slate-400 dark:text-zinc-500 shrink-0" />
            <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 tracking-wider">
              ZULU / GMT:
            </span>
            <span className="text-slate-900 dark:text-zinc-200 font-bold">{zuluTime || "--:--:--"}</span>
          </div>
        </div>
      </header>

      {/* 2. CENTER OPERATOR AUTHENTICATION CARD (z-index: 10, protected legibility guardrails) */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md border border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0d10]/95 backdrop-blur-md p-8 rounded-sm shadow-2xl transition-colors">
          <div className="mb-6 pb-3 border-b border-slate-200 dark:border-zinc-800">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100">
              OPERATOR AUTHENTICATION
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 leading-relaxed">
              Authorized substation personnel only. All access is logged to the Sequence of Events (SOE) ledger.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-700/80 text-rose-700 dark:text-rose-200 text-xs rounded-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500 dark:text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
            className="space-y-5"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-2">
                OPERATOR ID / USERNAME
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 dark:text-zinc-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter operator username"
                  autoComplete="username"
                  required
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500 text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 rounded-sm font-mono outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-2">
                KEYPHRASE / PASSWORD
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 dark:text-zinc-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500 text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 rounded-sm font-mono outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Quick Demo Modes helper and emerald fill trigger */}
            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-slate-400 dark:text-zinc-500">Quick Demo Modes:</span>
              <button
                type="button"
                onClick={fillDemoCredentials}
                className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 font-bold transition-colors cursor-pointer"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>Fill operator credentials</span>
              </button>
            </div>

            {/* High-contrast solid green rectangular action button */}
            <button
              type="submit"
              disabled={isLoading || isAuthorized}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold text-xs tracking-wider uppercase rounded-sm shadow-sm transition-all flex items-center justify-center gap-2 border border-emerald-400/30 cursor-pointer"
            >
              {isLoading || isAuthorized ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>AUTHORIZING DISPATCH SESSION...</span>
                </>
              ) : (
                <span>AUTHORIZE DISPATCH ACCESS</span>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* 2.5. SCADA TRANSMISSION LAYOUT PRESET SELECTOR (Interactive Live Switcher) */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-1.5 px-4 pb-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-slate-200/90 dark:border-zinc-800/90 bg-white/90 dark:bg-[#0c0d10]/90 backdrop-blur-md shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 tracking-wider">
            GRID STYLE:
          </span>
          <div className="flex items-center gap-1">
            {LAYOUT_PRESETS.map((p) => {
              const isSelected = layoutStyle === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectLayout(p.id)}
                  title={p.desc}
                  className={`px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-xs transition-all cursor-pointer ${
                    isSelected
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-900"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. FOOTER LEDGER NOTICE */}
      <footer className="relative z-10 text-center py-1 text-[10px] text-slate-400 dark:text-zinc-600 font-mono tracking-wider">
        GRIDSENSE ADMS v2.0 • SUBSTATION DISPATCH GATEWAY • PROTOCOL IEEE C37.118 / IEC 61850
      </footer>
    </div>
  );
}
