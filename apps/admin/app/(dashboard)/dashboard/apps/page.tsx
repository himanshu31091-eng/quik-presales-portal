import { LayoutGrid, ExternalLink, Settings, Users } from "lucide-react";
import Badge from "@/components/ui/badge";

// Placeholder — real data fetched when wiring logic
const APP_COLORS = [
  "bg-blue-50 text-blue-600",
  "bg-purple-50 text-purple-600",
  "bg-green-50 text-green-600",
  "bg-amber-50 text-amber-600",
  "bg-rose-50 text-rose-600",
];


export default function AppsPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Applications</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            Configure access and settings for each application
          </p>
        </div>
      </div>

      {/* Access matrix link */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-secondary-light)]">
              <Users className="h-5 w-5 text-[var(--color-secondary)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">User Access Matrix</p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Manage which members have access to which apps
              </p>
            </div>
          </div>
          <button className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors">
            Open Matrix
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Empty state */}
      <div className="rounded-xl border border-[var(--color-border)] border-dashed bg-[var(--color-bg-primary)] py-20 flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-neutral-100)]">
          <LayoutGrid className="h-6 w-6 text-[var(--color-text-tertiary)]" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">No applications configured</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Applications registered in QuikIT will appear here for configuration
          </p>
        </div>
      </div>
    </div>
  );
}
