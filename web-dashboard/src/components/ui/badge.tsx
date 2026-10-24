import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-normal transition-colors select-none border",
  {
    variants: {
      variant: {
        default:
          "border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300",
        secondary:
          "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400",
        outline:
          "border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-transparent",
        healthy:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 dark:border-emerald-500/30",
        warning:
          "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-400 dark:border-amber-500/30",
        destructive:
          "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400 dark:border-rose-500/40 font-semibold",
        trip:
          "border-rose-600 bg-rose-600 text-white dark:bg-rose-600 dark:text-white font-bold animate-pulse shadow-sm",
        crypto:
          "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-400 dark:border-sky-500/30",
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
