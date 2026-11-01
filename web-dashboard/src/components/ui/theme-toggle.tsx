"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      title={theme === "dark" ? "Switch to Day Light Mode" : "Switch to SCADA Dark Mode"}
      className={`h-8 px-2.5 rounded-sm font-mono text-[10px] font-bold tracking-wider gap-1.5 transition-colors border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-950/80 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900 shadow-2xs cursor-pointer ${
        className || ""
      }`}
    >
      {theme === "dark" ? (
        <>
          <Sun className="h-3.5 w-3.5 text-amber-500" />
          <span className="hidden sm:inline">DAY LIGHT</span>
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5 text-indigo-400" />
          <span className="hidden sm:inline">SCADA DARK</span>
        </>
      )}
    </Button>
  );
}
