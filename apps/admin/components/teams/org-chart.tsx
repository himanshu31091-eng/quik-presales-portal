"use client";

import { Users } from "lucide-react";
import type { TeamRow } from "./create-team-modal";

export default function OrgChart({ teams: _teams }: { teams: TeamRow[] }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] border-dashed py-20 flex flex-col items-center gap-3">
      <Users className="h-10 w-10 text-[var(--color-text-tertiary)]" />
      <p className="text-sm text-[var(--color-text-secondary)]">Org chart view is not available</p>
    </div>
  );
}
