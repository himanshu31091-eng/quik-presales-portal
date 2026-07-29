"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@quikit/ui";
import { applyAccentColor } from "@quikit/ui";
import { api, useApiQuery, useApiMutation } from "@/lib/api-client";
import { PageHeader, Panel, Loading, ErrorNote } from "@/components/ui-kit";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import { useOrgInfo } from "@/lib/hooks/useOrgInfo";

interface ThemeSettings {
  accentColor: string | null;
  themeMode: string | null;
}

/** The platform's preset accents — same swatch set the other apps expose. */
const ACCENTS = [
  { hex: "#0066cc", name: "Blue" },
  { hex: "#6366f1", name: "Indigo" },
  { hex: "#7c3aed", name: "Violet" },
  { hex: "#0d9488", name: "Teal" },
  { hex: "#16a34a", name: "Green" },
  { hex: "#ea580c", name: "Orange" },
  { hex: "#e11d48", name: "Rose" },
  { hex: "#475569", name: "Slate" },
];

export default function SettingsPage() {
  const { can, isAdmin } = useMyPermissions();
  const org = useOrgInfo();
  const { data, isLoading, error } = useApiQuery<ThemeSettings>(
    ["settings", "company"],
    "/api/settings/company",
  );

  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (data?.accentColor) setSelected(data.accentColor);
  }, [data?.accentColor]);

  const save = useApiMutation(
    (accentColor: string) => api.patch("/api/settings/company", { accentColor }),
    [["settings", "company"]],
  );

  function choose(hex: string) {
    setSelected(hex);
    // Apply immediately so the change is visible without a reload; the PATCH
    // persists it for the next session.
    applyAccentColor(hex);
    save.mutate(hex);
  }

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle={org?.name ? `Organization: ${org.name}` : undefined}
      />

      {error ? <ErrorNote error={error} /> : null}

      <Panel title="Appearance">
        <p className="mb-4 text-sm text-gray-500">
          Your accent colour. Applies to you across QuikPreSales, not to the whole
          organization.
        </p>
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.hex}
              type="button"
              onClick={() => choose(a.hex)}
              disabled={save.isPending}
              title={a.name}
              aria-label={`Use ${a.name} accent`}
              aria-pressed={selected === a.hex}
              className={`h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 disabled:opacity-50 ${
                selected === a.hex ? "border-gray-900" : "border-transparent"
              }`}
              style={{ backgroundColor: a.hex }}
            />
          ))}
        </div>
        {save.error ? (
          <div className="mt-3">
            <ErrorNote error={save.error} />
          </div>
        ) : null}
      </Panel>

      {can("settings", "manage") || isAdmin ? (
        <Panel title="Administration">
          <ul className="divide-y divide-gray-100">
            <li className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Roles &amp; Permissions</p>
                <p className="text-xs text-gray-500">
                  Grant matrix for the six pre-sales roles, plus any custom roles.
                </p>
              </div>
              <Link href="/settings/roles">
                <Button size="sm" variant="secondary">
                  Manage
                </Button>
              </Link>
            </li>
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
