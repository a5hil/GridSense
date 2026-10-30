import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase transition-colors font-mono select-none border",
  {
    variants: {
      variant: {
        default:
          "border-slate-300 bg-slate-100 text-slate-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
        secondary:
          "border-slate-200 bg-slate-100 text-slate-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400",
        outline:
          "border-slate-300 text-slate-700 dark:border-zinc-700 dark:text-zinc-400 bg-transparent",
        healthy:
          "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-600/50 dark:bg-emerald-950/40 dark:text-emerald-400",
        warning:
          "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-600/50 dark:bg-amber-950/40 dark:text-amber-400",
        destructive:
          "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-600/60 dark:bg-rose-950/50 dark:text-rose-300",
        trip:
          "border-rose-500 bg-rose-600 text-white dark:bg-rose-900 dark:text-rose-100 font-bold animate-pulse",
        crypto:
          "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-600/50 dark:bg-cyan-950/40 dark:text-cyan-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
