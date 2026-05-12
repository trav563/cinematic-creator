import type { LabelHTMLAttributes } from "react";

export function Label({ className = "", ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`block text-xs font-medium uppercase tracking-wide text-[var(--muted)] ${className}`}
      {...rest}
    />
  );
}
