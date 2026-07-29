"use client";

import { type ReactNode } from "react";
import { cn } from "../lib/utils";

export interface FieldProps {
  label?: ReactNode;
  required?: boolean;
  error?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Single labelled form field. Use inside FormRow or on its own. */
export function Field({ label, required, error, hint, children, className }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <label className="text-xs font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <span className="text-[11px] text-red-600">{error}</span>
      ) : hint ? (
        <span className="text-[11px] text-gray-500">{hint}</span>
      ) : null}
    </div>
  );
}

export interface FormRowProps {
  /** Number of equal-width columns. Defaults to 2. */
  cols?: 1 | 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}

/** Horizontal row of fields — wraps on small screens. */
export function FormRow({ cols = 2, children, className }: FormRowProps) {
  const gridCls =
    cols === 1 ? "grid-cols-1" :
    cols === 2 ? "grid-cols-1 md:grid-cols-2" :
    cols === 3 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" :
    "grid-cols-1 md:grid-cols-2 lg:grid-cols-4";
  return <div className={cn("grid gap-3", gridCls, className)}>{children}</div>;
}

export interface FormSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Logical grouping of fields — optional title + body. */
export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <section className={cn("space-y-3", className)}>
      {(title || description) && (
        <header>
          {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </header>
      )}
      <div className="space-y-3">{children}</div>
    </section>
  );
}
