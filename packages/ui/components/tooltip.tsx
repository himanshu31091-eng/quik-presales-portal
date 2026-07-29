"use client";

import { useState, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Base tooltip primitive.
 *
 * Handles the boilerplate shared by domain-specific tooltips:
 *   - Hover state + position calculation via getBoundingClientRect
 *   - Portal to document.body so table overflow clipping doesn't hide it
 *   - SSR safety (only renders after document is available)
 *   - Fixed positioning with a small offset below the trigger
 *   - Dark background (bg-gray-900) and small white text
 */
export type TooltipArrow = "left" | "center";

export interface TooltipProps {
  /** Content rendered inside the tooltip. If undefined/null, the tooltip
   *  is disabled and the trigger renders alone. */
  content: ReactNode;
  /** Trigger element -- the tooltip anchors to its bounding box. */
  children: ReactNode;
  /** Tailwind width class. Default "w-52". */
  widthClass?: string;
  /** Arrow alignment relative to the trigger. Default "left". */
  arrow?: TooltipArrow;
  /** Extra classes on the trigger wrapper (layout control). */
  triggerClassName?: string;
  /** Extra classes on the tooltip box (padding, radius, etc.). */
  contentClassName?: string;
}

export function Tooltip({
  content,
  children,
  widthClass = "w-52",
  arrow = "left",
  triggerClassName = "",
  contentClassName = "",
}: TooltipProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  if (content === undefined || content === null || content === false) {
    return <>{children}</>;
  }

  function handleEnter() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos(
      arrow === "center"
        ? { top: r.bottom + 6, left: r.left + r.width / 2 }
        : { top: r.bottom + 6, left: r.left }
    );
  }

  const baseContentClass =
    "bg-gray-900 text-white text-xs rounded-lg shadow-lg pointer-events-none";
  const arrowOffsetStyle =
    arrow === "center"
      ? { transform: "translateX(-50%)" as const }
      : {};
  const arrowClass =
    arrow === "center"
      ? "absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900"
      : "absolute bottom-full left-4 border-4 border-transparent border-b-gray-900";

  return (
    <div
      ref={ref}
      className={`relative ${triggerClassName}`}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && typeof document !== "undefined" &&
        createPortal(
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, ...arrowOffsetStyle }}
            className={`${widthClass} ${baseContentClass} ${contentClassName}`.trim()}
          >
            <div className={arrowClass} />
            {content}
          </div>,
          document.body
        )}
    </div>
  );
}
