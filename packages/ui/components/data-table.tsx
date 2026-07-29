"use client";

import { type ReactNode, useMemo } from "react";

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

export interface DataTableColumn<T> {
  /** Unique key for the column */
  key: string;
  /** Header content — string or ReactNode (e.g. with ColMenu) */
  label: ReactNode;
  /** Fixed width in px. Omit for flex column that fills remaining space. */
  width?: number;
  /** Text alignment */
  align?: "left" | "center" | "right";
  /** Sticky column — sticks to left edge on horizontal scroll */
  sticky?: boolean;
  /** Z-index for sticky columns (default 20, use 35 for always-frozen) */
  stickyZ?: number;
  /** Extra className on <th> only */
  thClassName?: string;
  /** Extra className on <td> — string or function for per-row styling */
  tdClassName?: string | ((row: T, rowIndex: number) => string);
  /** Render cell content */
  render: (row: T, rowIndex: number) => ReactNode;
}

export interface DataTableProps<T> {
  /** Column definitions */
  columns: DataTableColumn<T>[];
  /** Row data */
  data: T[];
  /** Unique key for each row */
  rowKey: (row: T, index: number) => string;
  /** Extra className on <tr> — string or per-row function */
  rowClassName?: string | ((row: T, index: number) => string);
  /** Sticky thead (default: true) */
  stickyHeader?: boolean;
  /** Extra className on <table> wrapper */
  className?: string;
  /** Extra inline styles on <table> */
  tableStyle?: React.CSSProperties;
  /** Message when data is empty */
  emptyMessage?: string;
  /** Number of columns to span for empty state */
  emptyColSpan?: number;
}

/* ═══════════════════════════════════════════════
   Style Constants
   ═══════════════════════════════════════════════ */

/** Base <th> classes for all tables across the app */
export const TH_BASE =
  "px-3 py-2 text-xs font-semibold text-gray-500 bg-accent-50 border-b border-gray-200 select-none";

/** Base <td> classes for all tables across the app */
export const TD_BASE = "px-3 py-2 text-xs text-gray-700 border-b border-gray-100";

/* ═══════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════ */

export function DataTable<T>({
  columns,
  data,
  rowKey,
  rowClassName,
  stickyHeader = true,
  className,
  tableStyle,
  emptyMessage = "No data found",
  emptyColSpan,
}: DataTableProps<T>) {
  // Compute sticky left offsets
  const stickyOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    let left = 0;
    for (const col of columns) {
      if (col.sticky && col.width) {
        offsets.set(col.key, left);
        left += col.width;
      }
    }
    return offsets;
  }, [columns]);

  const lastIdx = columns.length - 1;

  return (
    <table
      className={[
        "border-separate border-spacing-0 text-xs",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ tableLayout: "fixed", minWidth: "100%", ...tableStyle }}
    >
      {/* Column widths */}
      <colgroup>
        {columns.map((col) => (
          <col
            key={col.key}
            style={col.width ? { width: col.width } : undefined}
          />
        ))}
      </colgroup>

      {/* Header */}
      <thead className={stickyHeader ? "sticky top-0 z-30" : undefined}>
        <tr>
          {columns.map((col, i) => {
            const isLast = i === lastIdx;
            const align = col.align ?? "left";
            const stickyLeft = stickyOffsets.get(col.key);
            const isSticky = col.sticky && stickyLeft != null;

            return (
              <th
                key={col.key}
                data-col-key={col.key}
                className={[
                  TH_BASE,
                  !isLast && "border-r",
                  align === "center" && "text-center",
                  align === "right" && "text-right",
                  isSticky && `sticky z-[${col.stickyZ ?? 35}]`,
                  col.thClassName,
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={isSticky ? { left: stickyLeft } : undefined}
              >
                {col.label}
              </th>
            );
          })}
        </tr>
      </thead>

      {/* Body */}
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td
              colSpan={emptyColSpan ?? columns.length}
              className="text-center py-12 text-xs text-gray-400"
            >
              {emptyMessage}
            </td>
          </tr>
        ) : (
          data.map((row, rowIdx) => {
            const rClass =
              typeof rowClassName === "function"
                ? rowClassName(row, rowIdx)
                : rowClassName ?? "";

            return (
              <tr
                key={rowKey(row, rowIdx)}
                className={[
                  "hover:bg-blue-50/30 transition-colors",
                  rClass,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {columns.map((col, i) => {
                  const isLast = i === lastIdx;
                  const align = col.align ?? "left";
                  const stickyLeft = stickyOffsets.get(col.key);
                  const isSticky = col.sticky && stickyLeft != null;
                  const extraTd =
                    typeof col.tdClassName === "function"
                      ? col.tdClassName(row, rowIdx)
                      : col.tdClassName ?? "";

                  return (
                    <td
                      key={col.key}
                      className={[
                        TD_BASE,
                        !isLast && "border-r",
                        align === "center" && "text-center",
                        align === "right" && "text-right",
                        isSticky && "sticky bg-inherit",
                        extraTd,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={isSticky ? { left: stickyLeft, zIndex: col.stickyZ ?? 20 } : undefined}
                    >
                      {col.render(row, rowIdx)}
                    </td>
                  );
                })}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
