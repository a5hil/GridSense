"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, User, Zap, AlertTriangle, Eye, EyeOff, KeyRound } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useDashboard } from "@/context/DashboardContext";

export default function LoginPage() {
  const router = useRouter();
  const { setCurrentUser } = useDashboard();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="min-h-screen bg-slate-100 dark:bg-[#08090b] text-slate-900 dark:text-[#fafafa] flex flex-col justify-between p-3 md:p-4 font-mono select-none transition-colors">
      {/* Background Subtle Substation Grid Aesthetics */}
      <div className="absolute inset-0 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />

      {/* 1. TOP SCADA HEADER BAR */}
      <header className="relative z-10 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-3.5 rounded-sm flex items-center justify-between shadow-xs dark:shadow-none transition-colors">
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

        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <div
            suppressHydrationWarning
            className="border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-2.5 py-1 rounded-sm text-[11px] text-slate-600 dark:text-zinc-400 tabular-nums hidden sm:block"
          >
            CLOCK (IST): <span className="text-slate-900 dark:text-zinc-200 font-bold">{clockTime || "--:--:--"}</span>
          </div>
        </div>
      </header>

      {/* 2. CENTER OPERATOR AUTHENTICATION CARD */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] p-8 rounded-sm shadow-xl transition-colors">
          <div className="mb-6 pb-3 border-b border-slate-200 dark:border-zinc-800">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100">
              OPERATOR AUTHENTICATION
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
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
                Operator ID / Username
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
                Keyphrase / Password
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
                  className="absolute right-3.5 top-3 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Quick Demo Fill Pill (convenient for lab bench evaluations) */}
            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-slate-400 dark:text-zinc-500">Bench Demo Mode:</span>
              <button
                type="button"
                onClick={fillDemoCredentials}
                className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 font-bold transition-colors cursor-pointer"
              >
                <KeyRound className="h-3 w-3" />
                <span>Fill Operator Credentials</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading || isAuthorized}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold text-xs tracking-wider uppercase rounded-sm shadow-sm transition-all flex items-center justify-center gap-2 border border-emerald-400/30 cursor-pointer"
            >
              {isLoading || isAuthorized ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Authorizing Session...</span>
                </>
              ) : (
                <span>Authorize Dispatch Access</span>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
