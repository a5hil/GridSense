"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, User, Zap, AlertTriangle, Eye, EyeOff, KeyRound, Clock, ShieldAlert, PhoneCall, X } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useDashboard } from "@/context/DashboardContext";
import { HairlineTransmissionGrid } from "@/components/scada/HairlineTransmissionGrid";

// Indian Standard Time (IST) 24-hour formatter (primary console timezone)
const IST_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

// UTC / Zulu 24-hour formatter (secondary SCADA reference)
const UTC_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export default function LoginPage() {
  const router = useRouter();
  const { setCurrentUser } = useDashboard();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lockoutSec, setLockoutSec] = useState<number | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [istTime, setIstTime] = useState<string>("");
  const [utcTime, setUtcTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setIstTime(IST_TIME_FORMATTER.format(now));
      setUtcTime(UTC_TIME_FORMATTER.format(now));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSec === null || lockoutSec <= 0) return;
    const timer = setInterval(() => {
      setLockoutSec((prev) => {
        if (prev === null || prev <= 1) {
          setErrorMsg(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSec]);

  const handleLogin = async (u = username, p = password) => {
    if (lockoutSec && lockoutSec > 0) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });

      const data = await res.json();

      // Handle Rate Limiting / Lockout (HTTP 429)
      if (res.status === 429) {
        const retryHeader = res.headers.get("Retry-After");
        const seconds = retryHeader ? parseInt(retryHeader, 10) : 60;
        setLockoutSec(isNaN(seconds) ? 60 : seconds);
        setErrorMsg(data.error || "Terminal locked due to excessive authentication attempts.");
        setIsLoading(false);
        return;
      }

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
    if (lockoutSec && lockoutSec > 0) return;
    setUsername("operator");
    setPassword("gridsense123");
    setErrorMsg(null);
  };

  const isLocked = lockoutSec !== null && lockoutSec > 0;

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-[#050608] text-slate-900 dark:text-[#fafafa] flex flex-col justify-between p-3 md:p-4 font-mono select-none transition-colors overflow-hidden">
      {/* 0. ISOMETRIC HAIRLINE TRANSMISSION GRID BACKGROUND (z-index: 0) */}
      <HairlineTransmissionGrid />

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

          {/* Real-time IST / UTC timestamp tracker */}
          <div
            suppressHydrationWarning
            className="h-8 flex items-center gap-2 px-2.5 rounded-sm border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-950/80 text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums hidden sm:flex font-mono shadow-2xs"
          >
            <Clock className="h-3 w-3 text-slate-400 dark:text-zinc-500 shrink-0" />
            <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 tracking-wider">
              IST:
            </span>
            <span className="text-slate-900 dark:text-zinc-200 font-bold">{istTime || "--:--:--"}</span>
            <span className="text-[10px] text-slate-400 dark:text-zinc-600 font-medium">
              ({utcTime || "--:--:--"} UTC)
            </span>
          </div>
        </div>
      </header>

      {/* 2. CENTER OPERATOR AUTHENTICATION CARD (z-index: 10) */}
      <main className="relative z-10 flex-1 flex items-center justify-center min-[900px]:max-[1500px]:justify-start min-[900px]:max-[1500px]:pl-12 min-[1500px]:justify-center p-4">
        <div id="login-card" className="w-full max-w-md border border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0c0d10]/95 backdrop-blur-md p-8 rounded-sm shadow-2xl transition-colors">
          <div className="mb-6 pb-3 border-b border-slate-200 dark:border-zinc-800">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100">
              OPERATOR AUTHENTICATION
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 leading-relaxed">
              Authorized substation personnel only.
            </p>
          </div>

          {/* Lockout notification banner */}
          {isLocked && (
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700/80 text-amber-800 dark:text-amber-200 text-xs rounded-sm flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold tracking-wider uppercase">TERMINAL ACCESS LOCKED</div>
                <div className="mt-0.5 text-[11px] leading-relaxed">
                  Too many failed authentication attempts. Access suspended for security.
                </div>
                <div className="mt-1.5 font-bold text-amber-700 dark:text-amber-300 text-[11px]">
                  Lockout clears in: <span className="tabular-nums font-mono">{lockoutSec}s</span>
                </div>
              </div>
            </div>
          )}

          {/* Standard error banner */}
          {errorMsg && !isLocked && (
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
                USERNAME
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 dark:text-zinc-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Enter username"
                  autoComplete="username"
                  required
                  disabled={isLoading || isAuthorized || isLocked}
                  className={`w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-zinc-950 border ${
                    errorMsg && !isLocked
                      ? "border-rose-400 dark:border-rose-600/80 focus:border-rose-500"
                      : "border-slate-300 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500"
                  } text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 rounded-sm font-mono outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 dark:text-zinc-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                  disabled={isLoading || isAuthorized || isLocked}
                  className={`w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-zinc-950 border ${
                    errorMsg && !isLocked
                      ? "border-rose-400 dark:border-rose-600/80 focus:border-rose-500"
                      : "border-slate-300 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500"
                  } text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 rounded-sm font-mono outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                />
                <button
                  type="button"
                  disabled={isLoading || isAuthorized || isLocked}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Quick Demo Modes helper and fill trigger */}
            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-slate-400 dark:text-zinc-500">Quick Demo Modes:</span>
              <button
                type="button"
                disabled={isLocked}
                onClick={fillDemoCredentials}
                className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>Fill operator credentials</span>
              </button>
            </div>

            {/* High-contrast solid green rectangular action button */}
            <button
              type="submit"
              disabled={isLoading || isAuthorized || isLocked}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold text-xs tracking-wider uppercase rounded-sm shadow-sm transition-all flex items-center justify-center gap-2 border border-emerald-400/30 cursor-pointer disabled:cursor-not-allowed"
            >
              {isLoading || isAuthorized ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>AUTHORIZING DISPATCH SESSION...</span>
                </>
              ) : isLocked ? (
                <span>TERMINAL LOCKED ({lockoutSec}s)</span>
              ) : (
                <span>AUTHORIZE DISPATCH ACCESS</span>
              )}
            </button>
          </form>

          {/* Contact Administrator link */}
          <div className="mt-5 pt-4 border-t border-slate-200 dark:border-zinc-800 text-center">
            <button
              type="button"
              onClick={() => setShowContactModal(true)}
              className="text-[11px] text-slate-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <PhoneCall className="h-3 w-3" />
              <span>Need dispatch clearance? Contact Administrator</span>
            </button>
          </div>
        </div>
      </main>

      {/* 3. CONTACT ADMINISTRATOR MODAL */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-6 rounded-sm shadow-2xl space-y-4 font-mono">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100">
                  SUBSTATION DISPATCH SUPPORT
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 dark:text-zinc-300 space-y-2.5">
              <div>
                <span className="text-[10px] uppercase text-slate-400 dark:text-zinc-500 block">Station:</span>
                <span className="font-semibold text-slate-900 dark:text-zinc-100">Angamaly 33/11kV Substation</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 dark:text-zinc-500 block">Duty Engineer Desk:</span>
                <span className="font-semibold text-slate-900 dark:text-zinc-100">Ext. 4410 (Feeder Control Room)</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 dark:text-zinc-500 block">SCADA Admin Email:</span>
                <span className="font-semibold text-slate-900 dark:text-zinc-100">dispatch@gridsense.internal</span>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/80 text-[11px] text-slate-400 dark:text-zinc-500 leading-relaxed">
                If your terminal is rate-limited or your badge ID is unassigned, contact the shift supervisor for SOE authorization.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowContactModal(false)}
              className="w-full py-2 bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-900 dark:text-zinc-200 text-xs font-bold rounded-sm border border-slate-300 dark:border-zinc-700 transition-colors cursor-pointer"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* 4. FOOTER PROTOCOL NOTICE */}
      <footer className="relative z-10 text-center py-2 text-[10px] text-slate-400 dark:text-zinc-600 font-mono tracking-wider">
        GRIDSENSE ADMS v2.0 • SUBSTATION DISPATCH GATEWAY • IEC 60870-5-104 DATA MODEL
      </footer>
    </div>
  );
}
