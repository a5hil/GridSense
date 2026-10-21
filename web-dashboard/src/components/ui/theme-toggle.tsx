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
      className={`h-7 px-2 font-mono text-[11px] gap-1.5 transition-colors border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
        className || ""
      }`}
    >
      {theme === "dark" ? (
        <>
          <Sun className="h-3.5 w-3.5 text-amber-400" />
          <span className="hidden sm:inline">DAY LIGHT</span>
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5 text-indigo-500" />
          <span className="hidden sm:inline">SCADA DARK</span>
        </>
      )}
    </Button>
  );
}
