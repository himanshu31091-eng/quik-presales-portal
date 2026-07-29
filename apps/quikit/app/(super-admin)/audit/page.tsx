"use client";

/**
 * Super Admin: Audit Log — /audit
 *
 * Filterable, paginated audit log viewer for platform-wide actions.
 * Tracks all create/update/suspend/disable/membership/OAuth operations.
 */

import { useState, useEffect, useCallback } from "react";
import { FileText, Filter, ChevronDown, ChevronRight } from "lucide-react";
import { Pagination, EmptyState, FilterPicker, TableSkeleton } from "@quikit/ui";
import type { FilterOption } from "@quikit/ui";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  orgId: string | null;
  oldValues: string | null;
  newValues: string | null;
  createdAt: string;
}

const actionOptions: FilterOption[] = [
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "suspend", label: "Suspend" },
  { value: "disable", label: "Disable" },
  { value: "add_member", label: "Add Member" },
  { value: "toggle_super_admin", label: "Toggle Super Admin" },
  { value: "rotate_secret", label: "Rotate Secret" },
  { value: "delete", label: "Delete" },
];

const entityOptions: FilterOption[] = [
  { value: "tenant", label: "Organization" },
  { value: "app", label: "App" },
  { value: "user", label: "User" },
  { value: "membership", label: "Membership" },
  { value: "oauth_client", label: "OAuth Client" },
];

const actionBadgeStyles: Record<string, string> = {
  create: "bg-green-50 text-green-700",
  update: "bg-blue-50 text-blue-700",
  suspend: "bg-red-50 text-red-700",
  disable: "bg-gray-100 text-gray-600",
  add_member: "bg-purple-50 text-purple-700",
  toggle_super_admin: "bg-amber-50 text-amber-700",
  rotate_secret: "bg-indigo-50 text-indigo-700",
};

function ActionBadge({ action }: { action: string }) {
  const style = actionBadgeStyles[action] || "bg-gray-100 text-gray-600";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style}`}>
      {action.replace(/_/g, " ")}
    </span>
  );
}

function truncateId(id: string) {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}...`;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "25");
    if (actionFilter) params.set("action", actionFilter);
    if (entityFilter) params.set("entityType", entityFilter);
    if (dateFrom) params.set("startDate", dateFrom);
    if (dateTo) params.set("endDate", dateTo);

    fetch(`/api/super/audit?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setLogs(j.data);
          setTotalPages(j.pagination.totalPages);
          setTotal(j.pagination.total);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, actionFilter, entityFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [actionFilter, entityFilter, dateFrom, dateTo]);

  const dateCls =
    "border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-40";

  return (
    <div>
      {/* Page header */}
      <div className="px-4 pt-6 pb-5 md:px-10 md:pt-10">
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-slate-900">Audit Log</h1>
        <p className="text-sm text-slate-500 mt-2">
          Track all platform-wide administrative actions
        </p>
      </div>

      {/* Filter bar */}
      <div className="px-4 md:px-6 py-3 border-b border-gray-200 flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-gray-400" />
        <FilterPicker
          value={actionFilter}
          onChange={setActionFilter}
          options={actionOptions}
          allLabel="All Actions"
          placeholder="Filter by action"
        />
        <FilterPicker
          value={entityFilter}
          onChange={setEntityFilter}
          options={entityOptions}
          allLabel="All Entities"
          placeholder="Filter by entity"
        />
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end sm:gap-1.5 text-xs text-gray-500">
          <label className="flex items-center gap-1.5">
            <span>From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={dateCls}
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span>To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={dateCls}
            />
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="px-4 md:px-6 py-4">
        {loading ? (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <TableSkeleton rows={10} cols={5} />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState icon={FileText} message="No audit entries found." />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Date/Time
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Action
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Entity Type
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Entity ID
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Actor ID
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination page={page} totalPages={totalPages} total={total} limit={25} onPageChange={setPage} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Audit row with expandable diff viewer ────────────────────────────── */

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = Boolean(entry.oldValues || entry.newValues);

  return (
    <>
      <tr
        className={`hover:bg-gray-50/60 transition-colors ${hasDiff ? "cursor-pointer" : ""}`}
        onClick={() => hasDiff && setExpanded((v) => !v)}
      >
        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
          <div className="inline-flex items-center gap-1">
            {hasDiff ? (
              expanded ? <ChevronDown className="h-3 w-3 text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-400" />
            ) : (
              <span className="w-3" />
            )}
            {new Date(entry.createdAt).toLocaleString()}
          </div>
        </td>
        <td className="px-4 py-3">
          <ActionBadge action={entry.action} />
        </td>
        <td className="px-4 py-3 text-gray-600 capitalize">
          {entry.entityType.replace(/_/g, " ")}
        </td>
        <td className="px-4 py-3">
          <span className="font-mono text-xs text-gray-500" title={entry.entityId}>
            {truncateId(entry.entityId)}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="font-mono text-xs text-gray-500" title={entry.actorId}>
            {truncateId(entry.actorId)}
          </span>
        </td>
      </tr>
      {expanded && hasDiff && (
        <tr className="bg-gray-50/60">
          <td colSpan={5} className="px-4 py-3">
            <DiffView oldJson={entry.oldValues} newJson={entry.newValues} />
          </td>
        </tr>
      )}
    </>
  );
}

function parseJson(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function DiffView({ oldJson, newJson }: { oldJson: string | null; newJson: string | null }) {
  const oldVal = parseJson(oldJson);
  const newVal = parseJson(newJson);

  // Key-level diff: union of both objects' keys
  if (oldVal && typeof oldVal === "object" && newVal && typeof newVal === "object") {
    const keys = Array.from(new Set([...Object.keys(oldVal as object), ...Object.keys(newVal as object)])).sort();
    return (
      <div className="space-y-1 text-xs font-mono">
        {keys.map((k) => {
          const before = (oldVal as Record<string, unknown>)[k];
          const after = (newVal as Record<string, unknown>)[k];
          const changed = JSON.stringify(before) !== JSON.stringify(after);
          return (
            <div key={k} className="grid grid-cols-[150px_1fr_1fr] gap-2 items-start">
              <span className="text-gray-500">{k}</span>
              <span className={`px-2 py-1 rounded ${changed && before !== undefined ? "bg-red-100 text-red-900" : "text-gray-400"}`}>
                {before === undefined ? "—" : JSON.stringify(before)}
              </span>
              <span className={`px-2 py-1 rounded ${changed ? "bg-green-100 text-green-900" : "text-gray-500"}`}>
                {after === undefined ? "—" : JSON.stringify(after)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback: side-by-side JSON blobs
  return (
    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
      <div>
        <div className="text-gray-500 mb-1">Before</div>
        <pre className="bg-red-50 text-red-900 p-2 rounded overflow-x-auto">{oldJson ?? "—"}</pre>
      </div>
      <div>
        <div className="text-gray-500 mb-1">After</div>
        <pre className="bg-green-50 text-green-900 p-2 rounded overflow-x-auto">{newJson ?? "—"}</pre>
      </div>
    </div>
  );
}
