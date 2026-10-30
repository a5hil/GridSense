import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { isFault?: boolean; isUnacked?: boolean }
>(({ className, isFault, isUnacked, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-sm border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0d10] text-slate-900 dark:text-zinc-100 transition-colors shadow-xs dark:shadow-none",
      isFault && "border-rose-500 bg-rose-50/80 dark:bg-rose-950/20 ring-1 ring-rose-500/30",
      isFault && isUnacked && "animate-pulse",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center justify-between border-b border-slate-200/80 dark:border-zinc-800/80 px-3.5 py-2.5",
      className
    )}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-zinc-200",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-[11px] text-slate-500 dark:text-zinc-500 font-mono", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-3.5", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center justify-between border-t border-slate-200/80 dark:border-zinc-800/80 px-3.5 py-2 text-[11px] text-slate-600 dark:text-zinc-400 font-mono bg-slate-50 dark:bg-zinc-950/40",
      className
    )}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
