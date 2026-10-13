import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase transition-colors font-mono select-none border",
  {
    variants: {
      variant: {
        default:
          "border-zinc-700 bg-zinc-800 text-zinc-300",
        secondary:
          "border-zinc-800 bg-zinc-900 text-zinc-400",
        outline:
          "border-zinc-700 text-zinc-400 bg-transparent",
        healthy:
          "border-emerald-600/50 bg-emerald-950/40 text-emerald-400",
        warning:
          "border-amber-600/50 bg-amber-950/40 text-amber-400",
        destructive:
          "border-rose-600/60 bg-rose-950/50 text-rose-300 animate-pulse",
        trip:
          "border-rose-500 bg-rose-900 text-rose-100 font-bold animate-pulse",
        crypto:
          "border-cyan-600/50 bg-cyan-950/40 text-cyan-400",
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
