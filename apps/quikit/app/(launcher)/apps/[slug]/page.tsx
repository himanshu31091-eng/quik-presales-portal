"use client";

/**
 * App Detail — /apps/[slug]
 *
 * Shows full details for a single app: description, status, features,
 * and a prominent "Launch" or "Enable" button. This is the page users
 * land on when they want more info before launching.
 */

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ChevronLeft, ExternalLink, Plus, CheckCircle2, Clock,
  Sparkles, Shield, Users,
} from "lucide-react";
import Link from "next/link";

interface AppDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  baseUrl: string;
  status: string;
  installed: boolean;
  role?: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  active: { label: "Active", icon: CheckCircle2, color: "text-green-600 bg-green-50 border-green-200" },
  beta: { label: "Beta", icon: Sparkles, color: "text-purple-600 bg-purple-50 border-purple-200" },
  coming_soon: { label: "Coming Soon", icon: Clock, color: "text-amber-600 bg-amber-50 border-amber-200" },
};

const ICON_FALLBACKS: Record<string, string> = {
  quikscale: "📊",
  admin: "⚙️",
};

export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const slug = params.slug as string;

  const [app, setApp] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin =
    session?.user?.membershipRole === "admin" ||
    session?.user?.membershipRole === "super_admin";

  useEffect(() => {
    fetch(`/api/apps/launcher`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          const found = j.data.find((a: AppDetail) => a.slug === slug);
          setApp(found ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleEnable() {
    if (!app) return;
    const res = await fetch("/api/apps/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: app.id }),
    });
    const j = await res.json();
    if (j.success) {
      setApp((prev) => (prev ? { ...prev, installed: true } : prev));
    }
  }

  function handleLaunch() {
    if (app) window.location.href = app.baseUrl;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Loading…
      </div>
    );
  }

  if (!app) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">App not found.</p>
        <Link href="/apps" className="text-indigo-600 text-sm hover:underline">
          ← Back to Apps
        </Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG.active;
  const StatusIcon = statusCfg.icon;
  const icon = app.iconUrl ?? ICON_FALLBACKS[app.slug] ?? "📦";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <Link
          href="/apps"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Apps
        </Link>

        <div className="bg-white border border-gray-200 rounded-2xl p-8">
          {/* Header */}
          <div className="flex items-start gap-5 mb-6">
            <div className="h-20 w-20 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center text-4xl flex-shrink-0">
              {app.iconUrl ? (
                <img src={app.iconUrl} alt={app.name} className="h-full w-full rounded-2xl object-cover" />
              ) : (
                icon
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-900">{app.name}</h1>
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${statusCfg.color}`}>
                  <StatusIcon className="h-3 w-3" />
                  {statusCfg.label}
                </span>
              </div>
              {app.description && (
                <p className="text-sm text-gray-600 leading-relaxed">
                  {app.description}
                </p>
              )}
            </div>
          </div>

          {/* Info cards */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">URL</p>
              <p className="text-xs text-gray-700 font-mono truncate">{app.baseUrl}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Access</p>
              <p className="text-xs text-gray-700">
                {app.installed ? (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-3 w-3" /> Installed
                  </span>
                ) : (
                  "Not installed"
                )}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Auth</p>
              <p className="text-xs text-gray-700 flex items-center gap-1">
                <Shield className="h-3 w-3 text-gray-400" /> OAuth2 via QuikIT
              </p>
            </div>
          </div>

          {/* Action */}
          <div className="flex items-center gap-3">
            {app.installed ? (
              <button
                onClick={handleLaunch}
                disabled={app.status === "coming_soon"}
                className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50"
              >
                <ExternalLink className="h-4 w-4" />
                Launch {app.name}
              </button>
            ) : isAdmin ? (
              <button
                onClick={handleEnable}
                disabled={app.status === "coming_soon"}
                className="flex items-center gap-2 px-6 py-3 text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition-colors disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Enable for your organization
              </button>
            ) : (
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Contact your admin to enable this app.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
