"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  User,
  Zap,
  Activity,
  AlertTriangle,
  Radio,
  CheckCircle2,
  HardHat,
  Cpu,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";

interface Persona {
  id: string;
  label: string;
  username: string;
  pass: string;
  name: string;
  badge: string;
  role: string;
  color: string;
  bgClass: string;
  borderClass: string;
}

const PERSONAS: Persona[] = [
  {
    id: "op",
    label: "Chief Dispatcher",
    username: "operator",
    pass: "gridsense123",
    name: "K. P. Rajesh",
    badge: "#OP-4412",
    role: "OPERATOR",
    color: "text-emerald-400",
    bgClass: "bg-emerald-950/40 hover:bg-emerald-900/60",
    borderClass: "border-emerald-700/50 hover:border-emerald-500",
  },
  {
    id: "adm",
    label: "Substation In-Charge",
    username: "admin",
    pass: "admin123",
    name: "Er. Anita Varma",
    badge: "#ENG-1002",
    role: "ADMIN",
    color: "text-cyan-400",
    bgClass: "bg-cyan-950/40 hover:bg-cyan-900/60",
    borderClass: "border-cyan-700/50 hover:border-cyan-500",
  },
  {
    id: "line",
    label: "Field Lineman",
    username: "lineman",
    pass: "lineman123",
    name: "Suresh Kumar",
    badge: "#LM-7701",
    role: "FIELD_ENGINEER",
    color: "text-amber-400",
    bgClass: "bg-amber-950/40 hover:bg-amber-900/60",
    borderClass: "border-amber-700/50 hover:border-amber-500",
  },
  {
    id: "audit",
    label: "Viva Examiner",
    username: "auditor",
    pass: "viva2026",
    name: "External Auditor",
    badge: "#AUD-9011",
    role: "AUDITOR",
    color: "text-purple-400",
    bgClass: "bg-purple-950/40 hover:bg-purple-900/60",
    borderClass: "border-purple-700/50 hover:border-purple-500",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [systemTime, setSystemTime] = useState<string>("");

  useEffect(() => {
    setSystemTime(new Date().toLocaleTimeString());
    const interval = setInterval(() => {
      setSystemTime(new Date().toLocaleTimeString());
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

      router.push("/");
      router.refresh();
    } catch {
      setErrorMsg("Network error communicating with authentication service");
      setIsLoading(false);
    }
  };

  const handleSelectPersona = (p: Persona) => {
    setUsername(p.username);
    setPassword(p.pass);
    handleLogin(p.username, p.pass);
  };

  return (
    <div className="min-h-screen bg-[#08090b] text-zinc-100 flex flex-col justify-between font-mono relative overflow-hidden select-none">
      {/* Background Subtle Substation Grid Aesthetics */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-amber-500" />

      {/* TOP SCADA PROTOCOL HEADER */}
      <header className="border-b border-zinc-800/80 bg-[#0d0f12]/80 backdrop-blur-md px-6 py-3.5 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-sm bg-gradient-to-br from-emerald-600 to-cyan-700 flex items-center justify-center shadow-lg shadow-emerald-950/60 border border-emerald-400/30">
            <Zap className="h-4 w-4 text-white fill-white" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-widest text-zinc-100 flex items-center gap-2">
              GRIDSENSE ADMS
              <span className="text-[10px] px-1.5 py-0.2 bg-emerald-950 text-emerald-400 border border-emerald-700/60 rounded">
                SECURE SCADA 2.0
              </span>
            </div>
            <div className="text-[10px] text-zinc-400 tracking-wider">
              ANGAMALY 33/11kV PRIMARY SUBSTATION • FEEDER 04 SUPERVISORY DESK
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4 text-[11px] text-zinc-400">
          <div className="flex items-center gap-1.5">
            <Radio className="h-3 w-3 text-emerald-400 animate-pulse" />
            <span>SUB-GHZ GATEWAY: <strong className="text-zinc-200">READY</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
            <span>CIP-004-6: <strong className="text-zinc-200">ENFORCED</strong></span>
          </div>
        </div>
      </header>

      {/* CENTER AUTHENTICATION DISPATCH CONSOLE */}
      <main className="flex-1 flex items-center justify-center p-4 z-10 my-4">
        <div className="w-full max-w-md bg-[#0f1115]/90 border border-zinc-800 shadow-2xl rounded-sm p-6 backdrop-blur-xl relative">
          
          {/* Header Accent */}
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-zinc-800/80">
            <div>
              <div className="text-xs uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                Dispatch Console Access
              </div>
              <h1 className="text-lg font-bold text-zinc-100 tracking-tight mt-0.5">
                Operator Authentication
              </h1>
            </div>
            <div className="p-2 bg-zinc-900 border border-zinc-800 rounded">
              <KeyRound className="h-5 w-5 text-zinc-400" />
            </div>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-950/80 border border-rose-700/80 text-rose-200 text-xs rounded flex items-start gap-2 shadow-inner">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Operator ID / Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. operator or admin"
                  autoComplete="username"
                  required
                  className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm text-zinc-100 placeholder:text-zinc-600 rounded-sm font-mono outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                SCADA Keyphrase / Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full pl-9 pr-10 py-2 bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm text-zinc-100 placeholder:text-zinc-600 rounded-sm font-mono outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold text-xs tracking-wider uppercase rounded-sm shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 border border-emerald-400/40"
            >
              {isLoading ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Verifying SCADA Credentials...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  <span>Authenticate Dispatch Session</span>
                </>
              )}
            </button>
          </form>

          {/* VIVA DEMO 1-CLICK PERSONA SELECTOR */}
          <div className="mt-6 pt-5 border-t border-zinc-800/80">
            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
              <span>Quick Demo Personas (1-Click Viva Test)</span>
              <span className="text-[9px] px-1 bg-zinc-800 text-zinc-400 rounded">FAST LOGIN</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPersona(p)}
                  disabled={isLoading}
                  className={`p-2.5 border rounded-sm text-left transition-all ${p.bgClass} ${p.borderClass} group`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] font-bold ${p.color}`}>
                      {p.label}
                    </span>
                    <span className="text-[9px] px-1 bg-black/40 text-zinc-400 rounded font-mono">
                      {p.badge}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-300 font-sans truncate">
                    {p.name}
                  </div>
                  <div className="text-[9px] text-zinc-500 truncate font-mono mt-0.5">
                    {p.username} / {p.pass}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-zinc-800/80 bg-[#0d0f12]/80 backdrop-blur-md px-6 py-2.5 text-[10px] text-zinc-500 flex flex-wrap items-center justify-between z-10">
        <div>
          <span>GRIDSENSE SCADA ADMS • IEC 61850 &amp; NERC CIP COMPLIANT</span>
        </div>
        <div className="flex items-center gap-3">
          <span>AES-128-CTR SESSION TOKEN</span>
          <span>•</span>
          <span suppressHydrationWarning>SYSTEM TIME: {systemTime || "--:--:--"}</span>
        </div>
      </footer>
    </div>
  );
}
