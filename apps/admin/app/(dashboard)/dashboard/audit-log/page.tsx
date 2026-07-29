import { ClipboardList, Search, Filter, Download } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  CREATE: "text-green-600 bg-green-50",
  UPDATE: "text-blue-600 bg-blue-50",
  DELETE: "text-red-500 bg-red-50",
  INVITE: "text-purple-600 bg-purple-50",
  ACCESS: "text-amber-600 bg-amber-50",
};

export default function AuditLogPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Audit Log</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            Track all administrative actions across your organisation
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors">
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <input
            type="text"
            placeholder="Search by user or action…"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-2 pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
          />
        </div>
        <select className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]">
          <option value="">All actions</option>
          <option>CREATE</option>
          <option>UPDATE</option>
          <option>DELETE</option>
          <option>INVITE</option>
          <option>ACCESS</option>
        </select>
        <select className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]">
          <option value="">All resources</option>
          <option>membership</option>
          <option>team</option>
          <option>role</option>
          <option>app</option>
          <option>settings</option>
        </select>
        <select className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]">
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              <th className="py-3 pl-5 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Timestamp
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                User
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Action
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Resource
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5} className="py-16 text-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-neutral-100)]">
                    <ClipboardList className="h-5 w-5 text-[var(--color-text-tertiary)]" />
                  </div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">No audit events yet</p>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Admin actions will be recorded here automatically
                  </p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
