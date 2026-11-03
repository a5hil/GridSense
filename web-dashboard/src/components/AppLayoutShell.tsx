"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { StatusBar } from "@/components/StatusBar";

export function AppLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentUser, isAuthChecking } = useDashboard();
  const isAuthPage = pathname === "/login";

  // Login page renders without dashboard frame
  if (isAuthPage) {
    return <>{children}</>;
  }

  // Strict SCADA Access Gate: Block dashboard rendering if unauthenticated or checking session
  if (isAuthChecking || !currentUser) {
    return (
      <div className="h-screen w-screen bg-slate-100 dark:bg-[#08090b] flex flex-col items-center justify-center font-mono text-xs text-slate-500 dark:text-zinc-500 gap-3 select-none">
        <div className="h-5 w-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="tracking-wider uppercase text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
          Verifying Operator Dispatch Session...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100 dark:bg-[#08090b] text-slate-900 dark:text-[#fafafa] font-mono select-none transition-colors">
      {/* 1. Main Viewport Row: Left Sidebar + Central Content Area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left-aligned Collapsible Sidebar */}
        <Sidebar />

        {/* Main Content Column with Top Header and Scrollable Main */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
          <Header />

          {/* Central <main> content area that dynamically resizes with sidebar */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 sm:p-3 bg-slate-100 dark:bg-[#08090b] flex flex-col">
            {children}
          </main>
        </div>
      </div>

      {/* 2. Persistent Edge-to-Edge Bottom Industrial Status Dock */}
      <StatusBar />
    </div>
  );
}
