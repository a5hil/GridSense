"use client";

import * as React from "react";
import { AlertTriangle, X, CheckCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ToastItem {
  id: string;
  title: string;
  description: string;
  type?: "destructive" | "warning" | "success" | "info";
  persistent?: boolean;
  timestamp: string;
  onAcknowledge?: () => void;
}

interface ToastContextType {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, "id" | "timestamp">) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const addToast = React.useCallback(
    (toast: Omit<ToastItem, "id" | "timestamp">) => {
      const id = Math.random().toString(36).substring(2, 9);
      const timestamp = new Date().toLocaleTimeString();
      const newToast: ToastItem = { ...toast, id, timestamp };

      setToasts((prev) => {
        // Enforce max 1 destructive alarm toast: if a destructive toast already exists, ignore new destructive additions
        if (toast.type === "destructive") {
          const hasDestructive = prev.some((t) => t.type === "destructive");
          if (hasDestructive) {
            return prev;
          }
        }
        // Prevent duplicate persistent toasts by title
        if (
          toast.persistent &&
          prev.some((t) => t.title === toast.title)
        ) {
          return prev;
        }
        // Limit max toasts to 2
        return [...prev.slice(-1), newToast];
      });

      // Auto dismiss only if NOT persistent
      if (!toast.persistent) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 5000);
      }

      return id;
    },
    []
  );

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAll = React.useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearAll }}>
      {children}
      {/* Toast Render Viewport */}
      <div
        aria-live="assertive"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-h-screen w-full max-w-md flex-col gap-2 p-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex flex-col gap-2 rounded-sm border border-l-4 p-3.5 shadow-2xl transition-all bg-white dark:bg-[#0c0d10]",
              toast.type === "destructive" &&
                "border-rose-500/80 border-l-rose-600 text-rose-900 dark:text-rose-100 ring-1 ring-rose-500/40",
              toast.type === "warning" &&
                "border-amber-500/70 border-l-amber-500 text-amber-900 dark:text-amber-100",
              toast.type === "success" &&
                "border-emerald-500/70 border-l-emerald-500 text-emerald-900 dark:text-emerald-100",
              (!toast.type || toast.type === "info") &&
                "border-slate-300 dark:border-zinc-700 border-l-cyan-500 text-slate-900 dark:text-zinc-100"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {toast.type === "destructive" && (
                  <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-500 animate-bounce shrink-0" />
                )}
                {toast.type === "warning" && (
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0" />
                )}
                {toast.type === "success" && (
                  <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-500 shrink-0" />
                )}
                <span className="text-xs font-bold uppercase tracking-wider font-mono">
                  {toast.title}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono tabular-nums shrink-0">
                {toast.timestamp}
              </span>
            </div>

            <p className="text-xs font-mono text-slate-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {toast.description}
            </p>

            <div className="mt-1 flex items-center justify-between border-t border-slate-200 dark:border-zinc-800 pt-2">
              {toast.persistent ? (
                <div className="flex w-full items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-rose-600 dark:text-rose-400 font-bold">
                    [REQ OPERATOR ACK]
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="font-mono text-xs font-bold px-3 py-1 bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                    onClick={() => {
                      if (toast.onAcknowledge) toast.onAcknowledge();
                      removeToast(toast.id);
                    }}
                  >
                    ACKNOWLEDGE
                  </Button>
                </div>
              ) : (
                <div className="flex w-full justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 cursor-pointer"
                    onClick={() => removeToast(toast.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
