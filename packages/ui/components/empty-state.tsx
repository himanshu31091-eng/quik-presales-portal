"use client";

import type { ElementType } from "react";

interface EmptyStateProps {
  icon: ElementType;
  /** Optional bold headline shown above the message — used for onboarding empty states. */
  title?: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <Icon className="h-10 w-10 text-gray-300 mb-3" />
      {title && (
        <h3 className="text-sm font-semibold text-gray-800 mb-1">{title}</h3>
      )}
      <p className="text-sm text-gray-500 max-w-md">{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 px-4 py-2 text-xs font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-lg transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
