"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  ExternalLink, LogOut, Loader2, LayoutGrid, ShieldCheck,
  MessageSquare, CheckSquare, TrendingUp, HardHat, UserCog, ChevronRight,
} from "lucide-react";

const APP_META: Record<string, { icon: React.ElementType; color: string; bg: string; gradient: string }> = {
  quiksocial:      { icon: MessageSquare, color: "text-blue-600",   bg: "bg-blue-50",   gradient: "from-blue-500 to-blue-600" },
  quiktrack:       { icon: CheckSquare,   color: "text-green-600",  bg: "bg-green-50",  gradient: "from-green-500 to-green-600" },
  quikscale:       { icon: TrendingUp,    color: "text-purple-600", bg: "bg-purple-50", gradient: "from-purple-500 to-purple-600" },
  constructionerp: { icon: HardHat,       color: "text-amber-600",  bg: "bg-amber-50",  gradient: "from-amber-500 to-amber-600" },
  hrms:            { icon: UserCog,       color: "text-rose-600",   bg: "bg-rose-50",   gradient: "from-rose-500 to-rose-600" },
};

interface AppEntry {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  iconUrl: string | null;
}

interface LauncherData {
  orgName: string;
  orgLogoUrl: string | null;
  user: { name: string; email: string };
  apps: AppEntry[];
}

export default function LauncherPage() {
  const router              = useRouter();
  const { data: session }   = useSession();
  const [data, setData]     = useState<LauncherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);

  useEffect(() => {
    fetch("/api/launcher")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setData(res.data);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const firstName = data?.user.name?.split(" ")[0] ?? session?.user?.name?.split(" ")[0] ?? "";

  return (
    <div className="min-h-screen bg-[var(--color-bg-secondary)]">
      {/* Header */}
      <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-extrabold text-[var(--color-secondary)]">QuikIT</span>
          {data?.orgName && (
            <>
              <span className="text-[var(--color-text-tertiary)]">/</span>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">{data.orgName}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--color-text-secondary)]">
            {data?.user.email ?? session?.user?.email}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--color-secondary)]" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <p className="text-sm text-[var(--color-text-secondary)]">Failed to load launcher. Please refresh.</p>
          </div>
        ) : (
          <>
            {/* Welcome */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
                Welcome back{firstName ? `, ${firstName}` : ""}!
              </h1>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Choose where you want to go in{" "}
                <strong className="text-[var(--color-text-primary)]">{data?.orgName}</strong>.
              </p>
            </div>

            {/* Admin portal — featured card */}
            <div className="mb-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Administration
              </p>
              <button
                onClick={() => router.push("/dashboard")}
                className="group w-full rounded-2xl border-2 border-[var(--color-secondary)] bg-gradient-to-r from-[var(--color-secondary-light)] to-white p-5 text-left hover:shadow-lg hover:from-[var(--color-secondary-light)] transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-secondary)] shadow-sm">
                    <ShieldCheck className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--color-text-primary)] text-base">Admin Portal</p>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                      Manage members, teams, apps, roles and settings for {data?.orgName}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-[var(--color-secondary)] shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            </div>

            {/* Apps */}
            {(data?.apps.length ?? 0) > 0 && (
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  Applications
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data?.apps.map((app) => {
                    const meta      = APP_META[app.slug];
                    const Icon      = meta?.icon ?? LayoutGrid;
                    const isExternal = app.baseUrl && app.baseUrl !== "#";

                    return (
                      <div
                        key={app.id}
                        className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 flex flex-col gap-4 hover:border-[var(--color-secondary)] hover:shadow-md transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta?.bg ?? "bg-[var(--color-neutral-100)]"}`}>
                            <Icon className={`h-5 w-5 ${meta?.color ?? "text-[var(--color-text-secondary)]"}`} />
                          </div>
                          <div>
                            <p className="font-semibold text-[var(--color-text-primary)]">{app.name}</p>
                            <p className="text-xs text-[var(--color-text-tertiary)]">Admin access</p>
                          </div>
                        </div>

                        {isExternal ? (
                          <a
                            href={`/api/launcher/sso-redirect?appId=${app.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${meta?.gradient ?? "from-[var(--color-secondary)] to-[var(--color-secondary-dark)]"} px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity`}
                          >
                            Open {app.name}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <button
                            disabled
                            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--color-neutral-100)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-tertiary)] cursor-not-allowed"
                          >
                            Coming Soon
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
