"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  ExternalLink, LogOut, Loader2, LayoutGrid,
  MessageSquare, CheckSquare, TrendingUp, HardHat, UserCog,
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
  role: string;
}

interface MemberData {
  orgName: string;
  orgLogoUrl: string | null;
  member: { name: string; role: string };
  apps: AppEntry[];
}

export default function MemberAppsPage() {
  const { data: session } = useSession();
  const [data, setData]     = useState<MemberData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/member/apps")
      .then((r) => r.json())
      .then((res) => { if (res.success) setData(res.data); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-bg-secondary)]">
      {/* Top bar */}
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
          <span className="text-sm text-[var(--color-text-secondary)]">{session?.user?.email}</span>
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
        ) : (
          <>
            {/* Welcome */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
                Welcome back{data?.member.name ? `, ${data.member.name.split(" ")[0]}` : ""}!
              </h1>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Here are the applications you have access to in{" "}
                <strong className="text-[var(--color-text-primary)]">{data?.orgName}</strong>.
              </p>
            </div>

            {/* App grid */}
            {data?.apps.length === 0 ? (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-12 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-neutral-100)]">
                  <LayoutGrid className="h-6 w-6 text-[var(--color-text-tertiary)]" />
                </div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">No applications assigned yet</p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  Contact your organisation administrator to get access to applications.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data?.apps.map((app) => {
                  const meta = APP_META[app.slug];
                  const Icon = meta?.icon ?? LayoutGrid;
                  const isExternal = app.baseUrl && app.baseUrl !== "#";

                  return (
                    <div
                      key={app.id}
                      className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 flex flex-col gap-4 hover:border-[var(--color-secondary)] hover:shadow-md transition-all"
                    >
                      {/* Icon + name */}
                      <div className="flex items-center gap-3">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta?.bg ?? "bg-[var(--color-neutral-100)]"}`}>
                          <Icon className={`h-5 w-5 ${meta?.color ?? "text-[var(--color-text-secondary)]"}`} />
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--color-text-primary)]">{app.name}</p>
                          <p className="text-xs text-[var(--color-text-tertiary)] capitalize">
                            Role: <span className="font-medium text-[var(--color-text-secondary)]">{app.role}</span>
                          </p>
                        </div>
                      </div>

                      {/* CTA */}
                      {isExternal ? (
                        <a
                          href={`/api/member/sso-redirect?appId=${app.id}`}
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
            )}
          </>
        )}
      </main>
    </div>
  );
}
