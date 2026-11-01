"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { StatusBar } from "@/components/StatusBar";

export function AppLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login";

  // Login page renders without dashboard frame
  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 dark:bg-[#08090b] text-slate-900 dark:text-[#fafafa] font-mono select-none transition-colors">
      {/* 1. Left-aligned Collapsible Sidebar */}
      <Sidebar />

      {/* 2. Main Content Column with Top Header, Scrollable Main, and Bottom Status Bar */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        {/* Streamlined Top Header */}
        <Header />

        {/* Central <main> content area that dynamically resizes with sidebar */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 sm:p-3 bg-slate-100 dark:bg-[#08090b] flex flex-col">
          {children}
        </main>

        {/* Persistent Bottom Status Bar */}
        <StatusBar />
      </div>
    </div>
  );
}
