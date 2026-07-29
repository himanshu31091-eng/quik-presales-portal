"use client";

/**
 * Super Admin: User Detail — /platform-users/:id
 *
 * View user profile, memberships, and app access.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, Shield, Building2, AppWindow } from "lucide-react";
import { EmptyState, Skeleton, CardSkeleton, useConfirm } from "@quikit/ui";

interface MembershipInfo {
  id: string;
  orgName: string;
  tenantSlug: string;
  role: string;
  status: string;
}

interface AppAccessInfo {
  id: string;
  appName: string;
  appSlug: string;
  orgName: string;
}

interface UserDetail {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
  lastSignInAt: string | null;
  createdAt: string;
  memberships: MembershipInfo[];
  appAccess: AppAccessInfo[];
}

const roleBadge: Record<string, string> = {
  admin: "bg-purple-50 text-purple-700",
  team_head: "bg-indigo-50 text-indigo-700",
  member: "bg-gray-100 text-gray-600",
  owner: "bg-indigo-50 text-indigo-700",
};

const statusDot: Record<string, string> = {
  active: "bg-green-500",
  suspended: "bg-red-500",
  invited: "bg-amber-500",
};

const statusColor: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  suspended: "bg-red-50 text-red-700",
  invited: "bg-amber-50 text-amber-700",
};

export default function UserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const confirm = useConfirm();

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(() => {
    setLoading(true);
    fetch(`/api/super/users/${userId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setUser(j.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  async function handleToggleSuperAdmin() {
    if (!user) return;
    const isRevoke = user.isSuperAdmin;
    const fullName = `${user.firstName} ${user.lastName}`;
    if (
      !(await confirm({
        title: isRevoke ? `Revoke super admin from ${fullName}?` : `Grant super admin to ${fullName}?`,
        description: isRevoke
          ? "They will lose platform-wide administrative access immediately."
          : "They will gain full platform-wide administrative access across every org.",
        confirmLabel: isRevoke ? "Revoke" : "Grant",
        tone: "danger",
      }))
    )
      return;
    try {
      const res = await fetch(`/api/super/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSuperAdmin: !user.isSuperAdmin }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to update");
      fetchUser();
    } catch {
      // silent
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-7 w-64" />
        </div>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <Link href="/platform-users" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> Platform Users
        </Link>
        <EmptyState icon={Users} message="User not found." />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Back link */}
      <Link href="/platform-users" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" /> Platform Users
      </Link>

      {/* Title area */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">{user.firstName} {user.lastName}</h1>
          {user.isSuperAdmin && (
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 font-medium">
              <Shield className="h-3 w-3" /> Super Admin
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Profile */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Profile</h2>
            </div>
            <div className="px-5 py-4">
              {/* Avatar + name */}
              <div className="flex flex-col items-center mb-5">
                <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xl mb-3">
                  {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                </div>
                <p className="text-sm font-semibold text-gray-900">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-gray-500 mt-0.5">{user.email}</p>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-y-4 border-t border-gray-100 pt-4">
                <div className="col-span-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</p>
                  <p className="text-sm text-gray-900 mt-1">{user.email}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Super Admin</p>
                  <div className="mt-1">
                    {user.isSuperAdmin ? (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 font-medium">
                        <Shield className="h-3 w-3" /> Yes
                      </span>
                    ) : (
                      <span className="text-sm text-gray-500">No</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Sign In</p>
                  <p className="text-sm text-gray-900 mt-1">
                    {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "Never"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</p>
                  <p className="text-sm text-gray-900 mt-1">{new Date(user.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

              <button
                onClick={handleToggleSuperAdmin}
                className={`mt-5 w-full px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  user.isSuperAdmin
                    ? "text-red-600 border-red-200 hover:bg-red-50"
                    : "text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                }`}
              >
                {user.isSuperAdmin ? "Remove Super Admin" : "Grant Super Admin"}
              </button>
            </div>
          </div>
        </div>

        {/* Right column: Memberships + App Access */}
        <div className="lg:col-span-2 space-y-6">
          {/* Organization Memberships */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900">Organization Memberships</h2>
              </div>
              <span className="text-xs text-gray-400">{user.memberships.length} total</span>
            </div>
            {user.memberships.length === 0 ? (
              <EmptyState icon={Building2} message="No memberships." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Organization</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {user.memberships.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-sm text-gray-900 font-medium">{m.orgName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{m.tenantSlug}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${roleBadge[m.role] || "bg-gray-100 text-gray-600"}`}>
                          {m.role.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusColor[m.status] || "bg-gray-100 text-gray-600"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusDot[m.status] || "bg-gray-400"}`} />
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* App Access */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AppWindow className="h-4 w-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900">App Access</h2>
              </div>
              <span className="text-xs text-gray-400">{user.appAccess.length} total</span>
            </div>
            {user.appAccess.length === 0 ? (
              <EmptyState icon={AppWindow} message="No app access records." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">App</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Organization</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {user.appAccess.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-sm text-gray-900 font-medium">{a.appName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{a.appSlug}</p>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">{a.orgName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
