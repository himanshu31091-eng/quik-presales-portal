"use client";

/**
 * Super Admin: App Detail — /app-registry/:id
 *
 * View app details, OAuth client configuration, and access stats.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LayoutGrid, Key, ExternalLink, Users, ShieldOff, Pencil, RotateCw, Trash2 } from "lucide-react";
import { EmptyState, Skeleton, CardSkeleton, useConfirm } from "@quikit/ui";

interface OAuthClient {
  clientId: string;
  redirectUris: string[];
  scopes: string[];
}

interface AppDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  baseUrl: string;
  status: string;
  createdAt: string;
  oauthClient: OAuthClient | null;
  accessCount: number;
}

const statusDot: Record<string, string> = {
  active: "bg-green-500",
  coming_soon: "bg-amber-500",
  disabled: "bg-gray-400",
};

const statusColor: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  coming_soon: "bg-amber-50 text-amber-700",
  disabled: "bg-gray-100 text-gray-600",
};

function statusLabel(status: string) {
  if (status === "coming_soon") return "Coming Soon";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function AppDetailPage() {
  const params = useParams();
  const appId = params.id as string;
  const confirm = useConfirm();

  const [app, setApp] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Inline edit
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", slug: "", baseUrl: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // OAuth client management
  const [creatingOAuth, setCreatingOAuth] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [rotatingSecret, setRotatingSecret] = useState(false);

  const fetchApp = useCallback(() => {
    setLoading(true);
    fetch(`/api/super/apps/${appId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setApp(j.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [appId]);

  useEffect(() => {
    fetchApp();
  }, [fetchApp]);

  function startEdit() {
    if (!app) return;
    setEditForm({
      name: app.name,
      slug: app.slug,
      baseUrl: app.baseUrl,
      description: app.description || "",
    });
    setEditError("");
    setEditMode(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/super/apps/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to update");
      setEditMode(false);
      fetchApp();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable() {
    if (!app) return;
    if (!(await confirm({ title: `Disable "${app.name}"?`, description: "This app will no longer be reachable to any tenant until re-enabled.", confirmLabel: "Disable", tone: "danger" }))) return;
    try {
      const res = await fetch(`/api/super/apps/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "disabled" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to disable");
      fetchApp();
    } catch {
      // silent
    }
  }

  async function handleConfigureOAuth() {
    if (!app) return;
    setCreatingOAuth(true);
    setNewSecret(null);
    try {
      // Derive the redirect URI from the app's registered baseUrl so it
      // matches the environment the app actually runs in (prod host in
      // prod, localhost in local dev). Previous version hard-coded
      // http://localhost:${port} which broke SSO for any app registered
      // on a non-local origin.
      let redirectUri: string;
      try {
        const u = new URL(app.baseUrl);
        // Preserve scheme, host, and port from the registered baseUrl;
        // append the NextAuth callback path.
        redirectUri = `${u.origin}/api/auth/callback/quikit`;
      } catch {
        // baseUrl wasn't a valid URL — surface the error via the thrown
        // response below rather than silently defaulting to something broken.
        throw new Error(
          "App baseUrl is not a valid URL; fix it before configuring OAuth.",
        );
      }
      const res = await fetch(`/api/super/apps/${appId}/oauth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirectUris: [redirectUri] }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to configure OAuth");
      setNewSecret(data.data.clientSecret);
      fetchApp();
    } catch {
      // silent
    } finally {
      setCreatingOAuth(false);
    }
  }

  async function handleRotateSecret() {
    if (!app) return;
    setRotatingSecret(true);
    setNewSecret(null);
    try {
      const res = await fetch(`/api/super/apps/${appId}/oauth`, {
        method: "PATCH",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to rotate secret");
      setNewSecret(data.data.clientSecret);
      fetchApp();
    } catch {
      // silent
    } finally {
      setRotatingSecret(false);
    }
  }

  async function handleRemoveOAuth() {
    if (!app) return;
    if (!(await confirm({ title: "Remove OAuth client?", description: "This will break any existing integrations using this client. Users will not be able to sign in via this app until the client is recreated.", confirmLabel: "Remove", tone: "danger" }))) return;
    try {
      const res = await fetch(`/api/super/apps/${appId}/oauth`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to remove OAuth client");
      setNewSecret(null);
      fetchApp();
    } catch {
      // silent
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-7 w-64" />
        </div>
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="p-6">
        <Link href="/app-registry" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> App Registry
        </Link>
        <EmptyState icon={LayoutGrid} message="App not found." />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Back link */}
      <Link href="/app-registry" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" /> App Registry
      </Link>

      {/* Title area */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">{app.name}</h1>
          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[app.status] || "bg-gray-100 text-gray-600"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${statusDot[app.status] || "bg-gray-400"}`} />
            {statusLabel(app.status)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: App info */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">App Info</h2>
              {!editMode && (
                <button onClick={startEdit} className="px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                  Edit
                </button>
              )}
            </div>
            <div className="px-5 py-4">
              {editMode ? (
                <form onSubmit={handleSave} className="space-y-4">
                  {editError && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editError}</div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Name</label>
                    <input
                      type="text"
                      required
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Slug</label>
                    <input
                      type="text"
                      required
                      value={editForm.slug}
                      onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Base URL</label>
                    <input
                      type="url"
                      required
                      value={editForm.baseUrl}
                      onChange={(e) => setEditForm({ ...editForm, baseUrl: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button type="button" onClick={() => setEditMode(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                      Cancel
                    </button>
                    <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors">
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-y-4">
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Name</p>
                      <p className="text-sm text-gray-900 mt-1">{app.name}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Slug</p>
                      <p className="text-sm text-gray-900 font-mono mt-1">{app.slug}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Base URL</p>
                      <a
                        href={app.baseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 hover:underline mt-1"
                      >
                        {app.baseUrl} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</p>
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium mt-1 ${statusColor[app.status] || "bg-gray-100 text-gray-600"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusDot[app.status] || "bg-gray-400"}`} />
                        {statusLabel(app.status)}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</p>
                      <p className="text-sm text-gray-900 mt-1">{new Date(app.createdAt).toLocaleDateString()}</p>
                    </div>
                    {app.description && (
                      <div className="col-span-2">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</p>
                        <p className="text-sm text-gray-900 mt-1">{app.description}</p>
                      </div>
                    )}
                  </div>
                  {app.status === "active" && (
                    <button
                      onClick={handleDisable}
                      className="mt-5 w-full px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Disable App
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right column: OAuth + Stats */}
        <div className="lg:col-span-2 space-y-6">
          {/* OAuth Client */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Key className="h-4 w-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">OAuth Client</h2>
            </div>
            <div className="px-5 py-4">
              {app.oauthClient ? (
                <div>
                  <div className="grid grid-cols-2 gap-y-4">
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Client ID</p>
                      <p className="text-sm text-gray-900 font-mono bg-gray-50 px-3 py-1.5 rounded-lg mt-1 inline-block">{app.oauthClient.clientId}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Redirect URIs</p>
                      <div className="space-y-1">
                        {app.oauthClient.redirectUris.map((uri, i) => (
                          <p key={i} className="text-sm text-gray-900 font-mono bg-gray-50 px-3 py-1.5 rounded-lg">{uri}</p>
                        ))}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Scopes</p>
                      <div className="flex flex-wrap gap-1.5">
                        {app.oauthClient.scopes.map((scope) => (
                          <span key={scope} className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full font-medium">
                            {scope}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* New secret display */}
                  {newSecret && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
                      <p className="text-xs font-semibold text-amber-800 mb-2">Client Secret (copy now — shown only once)</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-white border border-amber-200 rounded px-3 py-2 text-sm font-mono text-gray-900 select-all">{newSecret}</code>
                        <button onClick={() => navigator.clipboard.writeText(newSecret)} className="px-3 py-2 text-xs font-medium text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-100">Copy</button>
                      </div>
                    </div>
                  )}

                  {/* OAuth action buttons */}
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                    <button
                      onClick={handleRotateSecret}
                      disabled={rotatingSecret}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      {rotatingSecret ? "Rotating..." : "Rotate Secret"}
                    </button>
                    <button
                      onClick={handleRemoveOAuth}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove OAuth
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <EmptyState
                    icon={Key}
                    message="No OAuth client configured for this app."
                    action={{
                      label: creatingOAuth ? "Configuring..." : "Configure OAuth",
                      onClick: handleConfigureOAuth,
                    }}
                  />

                  {/* New secret display after creation */}
                  {newSecret && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4 text-left mx-6">
                      <p className="text-xs font-semibold text-amber-800 mb-2">Client Secret (copy now — shown only once)</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-white border border-amber-200 rounded px-3 py-2 text-sm font-mono text-gray-900 select-all">{newSecret}</code>
                        <button onClick={() => navigator.clipboard.writeText(newSecret)} className="px-3 py-2 text-xs font-medium text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-100">Copy</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Access Stats */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Access Stats</h2>
            </div>
            <div className="px-5 py-4">
              <div className="bg-gray-50 rounded-lg p-4 text-center inline-block min-w-[120px]">
                <div className="flex items-center justify-center mb-2">
                  <Users className="h-5 w-5 text-indigo-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{app.accessCount}</p>
                <p className="text-xs font-medium text-gray-500 mt-0.5">User-Organization Pairs</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
