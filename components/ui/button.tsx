import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-400",
  secondary: "bg-[var(--surface-2)] text-foreground hover:bg-zinc-800 border border-[var(--border)]",
  ghost: "hover:bg-[var(--surface-2)] text-foreground",
  danger: "bg-red-600 text-white hover:bg-red-500",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", className = "", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...rest}
    />
  );
});
