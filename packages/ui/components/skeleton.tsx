"use client";

import { cn } from "../lib/utils";
import type { CSSProperties } from "react";

// -- Base pulse skeleton --

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div className={cn("animate-pulse rounded bg-gray-100", className)} style={style} />
  );
}

// -- Table row skeleton --

export function TableRowSkeleton({ cols = 6 }: { cols?: number }) {
  return (
    <tr className="border-b border-gray-100">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-3.5 w-full" style={{ width: `${60 + (i % 3) * 20}%` }} />
        </td>
      ))}
    </tr>
  );
}

// -- Full table skeleton (header + rows) --

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full h-full overflow-hidden">
      {/* Header shimmer */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-200 bg-gray-50">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {/* Row shimmers */}
      <table className="w-full">
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRowSkeleton key={i} cols={cols} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -- Card skeleton --

export function CardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 space-y-2.5 animate-pulse">
      <Skeleton className="h-2.5 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-1.5 w-full rounded-full" />
    </div>
  );
}

// -- Section skeleton (heading + cards row) --

export function CardRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
