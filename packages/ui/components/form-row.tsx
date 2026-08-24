"use client";

import { Children, cloneElement, isValidElement, useId, type ReactNode } from "react";
import { cn } from "../lib/utils";

export interface FieldProps {
  label?: ReactNode;
  required?: boolean;
  error?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Explicit id for the control. Omit to have one generated. */
  htmlFor?: string;
}

/**
 * Single labelled form field. Use inside FormRow or on its own.
 *
 * The label is programmatically bound to the control: if the only child is an
 * element without its own `id`, this injects the generated one and points
 * `htmlFor` at it. Previously the `<label>` had no `htmlFor` and didn't wrap
 * `children`, so it named nothing at all (WCAG 1.3.1 / 4.1.2).
 *
 * `required` is conveyed three ways, not just by a red glyph: the asterisk
 * (hidden from AT), visually-hidden "(required)" text in the label, and
 * `aria-required` on the control itself (WCAG 1.4.1 / 3.3.2).
 */
export function Field({ label, required, error, hint, children, className, htmlFor }: FieldProps) {
  const generatedId = useId();
  const only = Children.count(children) === 1 ? Children.only(children) : null;
  const childProps = isValidElement(only)
    ? (only.props as { id?: string; "aria-required"?: boolean | "true" | "false" })
    : undefined;
  const controlId = htmlFor ?? childProps?.id ?? generatedId;

  // Only clone when we're actually adding something, so a child that already
  // manages its own id/aria stays untouched.
  const control =
    isValidElement(only) && (!childProps?.id || (required && childProps["aria-required"] === undefined))
      ? cloneElement(only, {
          ...(childProps?.id ? {} : { id: controlId }),
          ...(required && childProps?.["aria-required"] === undefined ? { "aria-required": true } : {}),
        } as Record<string, unknown>)
      : children;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <label htmlFor={controlId} className="text-xs font-medium text-gray-700">
          {label}
          {required && (
            <>
              <span aria-hidden="true" className="text-red-500 ml-0.5">*</span>
              <span className="sr-only"> (required)</span>
            </>
          )}
        </label>
      )}
      {control}
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
