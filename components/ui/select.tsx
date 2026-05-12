import { forwardRef, type SelectHTMLAttributes } from "react";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={`w-full appearance-none rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-white/20 ${className}`}
        {...rest}
      >
        {children}
      </select>
    );
  },
);
