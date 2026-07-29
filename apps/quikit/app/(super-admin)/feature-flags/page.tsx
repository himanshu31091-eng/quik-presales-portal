"use client";

/**
 * Super Admin → App Feature Flags (index)
 *
 * Simple grid of apps. Click one to drill into its module tree + per-tenant
 * toggle view. Keeps the app-first mental model from the original spec
 * while the per-tenant selection happens on the drill-in page.
 */

import Link from "next/link";
import { ToggleRight, ChevronRight } from "lucide-react";
import { MODULE_REGISTRY } from "@quikit/shared/moduleRegistry";

/** Friendly display name per app slug. Falls back to titlecased slug. */
const APP_LABELS: Record<string, string> = {
  quikscale: "QuikScale",
  quikinfra: "QuikInfra",
  admin: "Admin Portal",
};

function labelFor(slug: string): string {
  return APP_LABELS[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

function moduleStats(appSlug: string): { parents: number; sub: number } {
  const app = MODULE_REGISTRY.find((a) => a.appSlug === appSlug);
  if (!app) return { parents: 0, sub: 0 };
  const parents = app.modules.filter((m) => !m.parentKey).length;
  return { parents, sub: app.modules.length - parents };
}

export default function FeatureFlagsIndexPage() {
  return (
    <div className="p-4 md:p-10">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-slate-900">App Feature Flags</h1>
        <p className="text-sm text-slate-500 mt-2">
          Pick an app to enable or disable modules per tenant. New modules ship enabled by default.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
        {MODULE_REGISTRY.map((app) => {
          const stats = moduleStats(app.appSlug);
          return (
            <Link
              key={app.appSlug}
              href={`/feature-flags/${app.appSlug}`}
              className="group bg-white/70 backdrop-blur-sm rounded-2xl border border-white/60 shadow-sm hover:shadow-md hover:border-amber-300 transition-all p-6 flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-lg">
                {labelFor(app.appSlug).charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900 group-hover:text-amber-700 transition-colors">
                  {labelFor(app.appSlug)}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  <code className="font-mono">{app.appSlug}</code>
                  <span className="mx-1.5">·</span>
                  {stats.parents} modules
                  {stats.sub > 0 && (
                    <>
                      <span className="mx-1">·</span>
                      {stats.sub} sub-modules
                    </>
                  )}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-amber-600 transition-colors flex-shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
