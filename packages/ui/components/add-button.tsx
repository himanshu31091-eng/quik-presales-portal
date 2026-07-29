"use client";

import { Plus } from "lucide-react";
import { cn } from "../lib/utils";

interface AddButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function AddButton({
  onClick,
  children,
  className,
  disabled,
}: AddButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
    >
      <Plus className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}
