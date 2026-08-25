"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../lib/utils";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, error, rows = 3, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          "w-full px-3 py-1.5 text-sm border rounded-lg bg-white resize-y",
          "focus:outline-none focus:ring-1 focus:ring-accent-700",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          error ? "border-red-300 focus:ring-red-400" : "border-gray-200",
          className,
        )}
        {...rest}
      />
    );
  },
);
