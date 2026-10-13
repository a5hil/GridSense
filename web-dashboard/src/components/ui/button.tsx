import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-sm text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50 select-none uppercase tracking-wider",
  {
    variants: {
      variant: {
        default:
          "bg-zinc-100 text-zinc-900 shadow-none hover:bg-zinc-200 border border-zinc-200",
        destructive:
          "bg-rose-950/80 text-rose-300 border border-rose-700 hover:bg-rose-900 hover:text-rose-100",
        outline:
          "border border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100",
        secondary:
          "bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700",
        ghost: "hover:bg-zinc-800 hover:text-zinc-100",
        emerald:
          "bg-emerald-950/80 text-emerald-300 border border-emerald-600 hover:bg-emerald-900 hover:text-emerald-100",
        amber:
          "bg-amber-950/80 text-amber-300 border border-amber-600 hover:bg-amber-900 hover:text-amber-100",
      },
      size: {
        default: "h-8 px-3 py-1",
        sm: "h-7 px-2.5 text-[11px]",
        lg: "h-9 px-4 text-xs",
        icon: "h-7 w-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
