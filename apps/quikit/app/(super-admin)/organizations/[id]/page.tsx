"use client";

/**
 * Super Admin: Organization Detail — /organizations/:id
 *
 * View and manage a single tenant. Edit info, suspend, view members and stats.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Pencil, Users, Layers, AppWindow, Plus, Search } from "lucide-react";
import { SlidePanel, EmptyState, Select, Skeleton, CardSkeleton, Pagination, useConfirm } from "@quikit/ui";
import {
  INVITE_METHOD,
  MEMBERSHIP_ROLES,
  MEMBERSHIP_ROLE_LABELS,
  validateSsoEmail,
} from "@quikit/shared";
import { HealthPanel } from "./components/HealthPanel";
import { AppAccessPanel } from "./components/AppAccessPanel";
import { BillingPanel } from "./components/BillingPanel";
import { AnalyticsPanel } from "./components/AnalyticsPanel";
import { ImpersonatePanel } from "./components/ImpersonatePanel";

interface MemberInfo {
  id: string;
  role: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  billingEmail: string | null;
  createdAt: string;
  _count: { users: number; teams: number; userAppAccess: number };
  users: MemberInfo[];
}

const PLANS = ["startup", "growth", "enterprise"];

const planBadge: Record<string, string> = {
  startup: "bg-indigo-50 text-indigo-700",
  growth: "bg-purple-50 text-purple-700",
  enterprise: "bg-amber-50 text-amber-700",
};

const roleBadge: Record<string, string> = {
  super_admin: "bg-amber-50 text-amber-700",
  org_admin: "bg-purple-50 text-purple-700",
  app_admin: "bg-indigo-50 text-indigo-700",
  member: "bg-gray-100 text-gray-600",
  // legacy values still seen on older rows
  admin: "bg-purple-50 text-purple-700",
  team_head: "bg-indigo-50 text-indigo-700",
};

// Display labels for this page. We override the shared MEMBERSHIP_ROLE_LABELS
// for the member tier ("User") so the org-detail view reads "Member" — matching
// the rest of the org-management surfaces.
const ROLE_LABELS: Record<string, string> = {
  [MEMBERSHIP_ROLES.SUPER_ADMIN]: MEMBERSHIP_ROLE_LABELS[MEMBERSHIP_ROLES.SUPER_ADMIN],
  [MEMBERSHIP_ROLES.ORG_ADMIN]: MEMBERSHIP_ROLE_LABELS[MEMBERSHIP_ROLES.ORG_ADMIN],
  [MEMBERSHIP_ROLES.APP_ADMIN]: MEMBERSHIP_ROLE_LABELS[MEMBERSHIP_ROLES.APP_ADMIN],
  [MEMBERSHIP_ROLES.MEMBER]: "Member",
};

// Roles a Super Admin can assign / switch between from this page.
const EDITABLE_ROLES: { value: string; label: string }[] = [
  { value: MEMBERSHIP_ROLES.ORG_ADMIN, label: ROLE_LABELS[MEMBERSHIP_ROLES.ORG_ADMIN] },
  { value: MEMBERSHIP_ROLES.MEMBER, label: ROLE_LABELS[MEMBERSHIP_ROLES.MEMBER] },
];

function roleLabelFor(role: string): string {
  return ROLE_LABELS[role] ?? role.replace("_", " ");
}

export default function OrgDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const confirm = useConfirm();

  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Inline edit
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", plan: "", billingEmail: "" });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Add member. firstName/lastName intentionally omitted — captured on the
  // member's first login via the /complete-profile flow.
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberForm, setMemberForm] = useState<{
    email: string;
    role: string;
    inviteMethod: string;
  }>({ email: "", role: MEMBERSHIP_ROLES.MEMBER, inviteMethod: INVITE_METHOD.NATIVE });
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState("");

  // Inline role editing on the members table.
  const [roleSavingUserId, setRoleSavingUserId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState("");

  // Paginated members list (the org-detail endpoint only returns the 10 most
  // recent; this pages through every member of the org).
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [membersPage, setMembersPage] = useState(1);
  const [membersTotalPages, setMembersTotalPages] = useState(1);
  const [membersTotal, setMembersTotal] = useState(0);
  // searchInput is what the user types; membersSearch is the debounced value
  // actually sent to the API.
  const [searchInput, setSearchInput] = useState("");
  const [membersSearch, setMembersSearch] = useState("");
  const MEMBERS_PER_PAGE = 10;

  // Debounce the search box and reset to the first page on a new query.
  useEffect(() => {
    const t = setTimeout(() => {
      setMembersSearch(searchInput.trim());
      setMembersPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchMembers = useCallback(() => {
    const qs = new URLSearchParams({
      page: String(membersPage),
      limit: String(MEMBERS_PER_PAGE),
    });
    if (membersSearch) qs.set("search", membersSearch);
    fetch(`/api/super/orgs/${orgId}/members?${qs.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setMembers(j.data);
          setMembersTotalPages(j.pagination.totalPages);
          setMembersTotal(j.pagination.total);
        }
      })
      .catch(() => {});
  }, [orgId, membersPage, membersSearch]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const fetchOrg = useCallback(() => {
    setLoading(true);
    fetch(`/api/super/orgs/${orgId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setOrg(j.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  function startEdit() {
    if (!org) return;
    setEditForm({ name: org.name, plan: org.plan, billingEmail: org.billingEmail || "" });
    setEditError("");
    setEditMode(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/super/orgs/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to update");
      setEditMode(false);
      fetchOrg();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSuspend() {
    if (!org) return;
    if (!(await confirm({ title: `Suspend "${org.name}"?`, description: "This will disable access for all members of the organization until it is restored.", confirmLabel: "Suspend", tone: "danger" }))) return;
    try {
      const res = await fetch(`/api/super/orgs/${orgId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to suspend");
      fetchOrg();
    } catch {
      // silent
    }
  }

  async function handleReactivate() {
    if (!org) return;
    if (!(await confirm({ title: `Reactivate "${org.name}"?`, description: "This will restore platform access for all members of the organization.", confirmLabel: "Reactivate", tone: "default" }))) return;
    try {
      const res = await fetch(`/api/super/orgs/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to reactivate");
      fetchOrg();
    } catch {
      // silent
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setMemberError("");

    // FR-SA-004 — client-side SSO domain check before hitting the API.
    if (memberForm.inviteMethod === INVITE_METHOD.SSO) {
      const err = validateSsoEmail(memberForm.email);
      if (err) {
        setMemberError(err);
        return;
      }
    }

    setAddingMember(true);
    try {
      const res = await fetch(`/api/super/orgs/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(memberForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to add member");
      setAddMemberOpen(false);
      setMemberForm({ email: "", role: MEMBERSHIP_ROLES.MEMBER, inviteMethod: INVITE_METHOD.NATIVE });
      fetchOrg();
      // Jump to the first page so the newest member (ordered desc) is visible.
      if (membersPage === 1) fetchMembers();
      else setMembersPage(1);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRoleChange(member: MemberInfo, newRole: string) {
    if (newRole === member.role) return;
    const memberName = `${member.user.firstName} ${member.user.lastName}`.trim() || member.user.email;
    const ok = await confirm({
      title: `Change role to ${roleLabelFor(newRole)}?`,
      description:
        `${memberName} will be set to ${roleLabelFor(newRole)}. This also updates their access inside ` +
        `the organization's apps (admin everywhere for Org Admin, standard access for Member). ` +
        `Admin Portal access reflects the change on their next sign-in (within ~5 minutes).`,
      confirmLabel: "Change role",
    });
    if (!ok) return;

    setRoleSavingUserId(member.user.id);
    setRoleError("");
    try {
      const res = await fetch(`/api/super/orgs/${orgId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.user.id, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to change role");
      fetchMembers();
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : "Failed to change role");
    } finally {
      setRoleSavingUserId(null);
    }
  }

  if (loading) {
    return (
      <div className="p-8 md:p-10 space-y-6">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-8 w-72" />
        </div>
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="p-6">
        <Link href="/organizations" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> Organizations
        </Link>
        <EmptyState icon={Building2} message="Organization not found." />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-10">
      {/* Back link */}
      <Link href="/organizations" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" /> Organizations
      </Link>

      {/* Title area */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 md:mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">{org.name}</h1>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${planBadge[org.plan] || "bg-gray-100 text-gray-600"}`}>
            {org.plan}
          </span>
          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${
            org.status === "active" ? "bg-green-50 text-green-700" : org.status === "suspended" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-600"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              org.status === "active" ? "bg-green-500" : org.status === "suspended" ? "bg-red-500" : "bg-gray-400"
            }`} />
            {org.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Info card */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Organization Info</h2>
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
                    <Select
                      label="Plan"
                      value={editForm.plan}
                      onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                      options={[
                        { value: "startup", label: "Startup" },
                        { value: "growth", label: "Growth" },
                        { value: "enterprise", label: "Enterprise" },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Billing Email</label>
                    <input
                      type="email"
                      value={editForm.billingEmail}
                      onChange={(e) => setEditForm({ ...editForm, billingEmail: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
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
                      <p className="text-sm text-gray-900 mt-1">{org.name}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Slug</p>
                      <p className="text-sm text-gray-900 font-mono mt-1">{org.slug}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Plan</p>
                      <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium capitalize mt-1 ${planBadge[org.plan] || "bg-gray-100 text-gray-600"}`}>
                        {org.plan}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</p>
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize mt-1 ${
                        org.status === "active" ? "bg-green-50 text-green-700" : org.status === "suspended" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          org.status === "active" ? "bg-green-500" : org.status === "suspended" ? "bg-red-500" : "bg-gray-400"
                        }`} />
                        {org.status}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Billing Email</p>
                      <p className="text-sm text-gray-900 mt-1">{org.billingEmail || "Not set"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</p>
                      <p className="text-sm text-gray-900 mt-1">{new Date(org.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {org.status === "active" && (
                    <button
                      onClick={handleSuspend}
                      className="mt-5 w-full px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Suspend Organization
                    </button>
                  )}
                  {org.status === "suspended" && (
                    <button
                      onClick={handleReactivate}
                      className="mt-5 w-full px-4 py-2 text-sm font-medium text-green-700 border border-green-200 rounded-lg hover:bg-green-50 transition-colors"
                    >
                      Reactivate Organization
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Stats + Members */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Stats</h2>
            </div>
            <div className="px-5 py-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Users className="h-5 w-5 text-indigo-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{org._count.users}</p>
                  <p className="text-xs font-medium text-gray-500 mt-0.5">Members</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Layers className="h-5 w-5 text-purple-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{org._count.teams}</p>
                  <p className="text-xs font-medium text-gray-500 mt-0.5">Teams</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <AppWindow className="h-5 w-5 text-amber-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{org._count.userAppAccess}</p>
                  <p className="text-xs font-medium text-gray-500 mt-0.5">App Access</p>
                </div>
              </div>
            </div>
          </div>

          {/* Members */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-900">Members</h2>
                <span className="text-xs text-gray-400">{membersTotal} total</span>
              </div>
              <button
                onClick={() => setAddMemberOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Member
              </button>
            </div>
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by name, email, or role…"
                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
                />
              </div>
            </div>
            {roleError && (
              <p className="mx-5 mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{roleError}</p>
            )}
            {membersTotal === 0 ? (
              <EmptyState
                icon={Users}
                message={membersSearch ? "No members match your search." : "No members yet."}
              />
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {members.map((m) => {
                    const fullName = `${m.user.firstName} ${m.user.lastName}`.trim();
                    const isSuperAdmin = m.role === MEMBERSHIP_ROLES.SUPER_ADMIN;
                    const isEditable = EDITABLE_ROLES.some((r) => r.value === m.role);
                    return (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-sm text-gray-900 font-medium">
                        {fullName || <span className="text-gray-400 italic">Pending first sign-in</span>}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500">{m.user.email}</td>
                      <td className="px-5 py-3">
                        {isSuperAdmin || !isEditable ? (
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${roleBadge[m.role] || "bg-gray-100 text-gray-600"}`}>
                            {roleLabelFor(m.role)}
                          </span>
                        ) : (
                          <select
                            value={m.role}
                            disabled={roleSavingUserId === m.user.id}
                            onChange={(e) => handleRoleChange(m, e.target.value)}
                            aria-label={`Role for ${fullName || m.user.email}`}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
                          >
                            {EDITABLE_ROLES.map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
            {membersTotalPages > 1 && (
              <div className="px-5 py-3 border-t border-gray-100">
                <Pagination
                  page={membersPage}
                  totalPages={membersTotalPages}
                  total={membersTotal}
                  limit={MEMBERS_PER_PAGE}
                  onPageChange={setMembersPage}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SA Phase B/C/D panels */}
      <div className="mt-6 space-y-6">
        <HealthPanel orgId={orgId} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AppAccessPanel orgId={orgId} />
          <BillingPanel orgId={orgId} />
        </div>
        <ImpersonatePanel orgId={orgId} members={org.users} />
        <AnalyticsPanel orgId={orgId} />
      </div>

      {/* Add Member slide-in panel */}
      <SlidePanel
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        title="Add Member"
        subtitle={`Invite a user to ${org.name}`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setAddMemberOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-member-form"
              disabled={addingMember}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {addingMember ? "Adding..." : "Add Member"}
            </button>
          </div>
        }
      >
        <form id="add-member-form" onSubmit={handleAddMember} className="space-y-5">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Email <span className="text-red-400">*</span></label>
            <input
              type="email"
              required
              placeholder="user@example.com"
              value={memberForm.email}
              onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
            />
          </div>
          <div>
            <Select
              label="Role"
              value={memberForm.role}
              onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}
              options={EDITABLE_ROLES}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Invitation Method</label>
            <div className="space-y-2">
              <label className="flex items-start gap-2.5 border border-gray-200 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="inviteMethod"
                  value={INVITE_METHOD.SSO}
                  checked={memberForm.inviteMethod === INVITE_METHOD.SSO}
                  onChange={() => setMemberForm({ ...memberForm, inviteMethod: INVITE_METHOD.SSO })}
                  className="mt-0.5"
                />
                <span className="text-sm text-gray-700">
                  <strong>SSO</strong> — Google or Microsoft sign-in (no password)
                </span>
              </label>
              <label className="flex items-start gap-2.5 border border-gray-200 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="inviteMethod"
                  value={INVITE_METHOD.NATIVE}
                  checked={memberForm.inviteMethod === INVITE_METHOD.NATIVE}
                  onChange={() => setMemberForm({ ...memberForm, inviteMethod: INVITE_METHOD.NATIVE })}
                  className="mt-0.5"
                />
                <span className="text-sm text-gray-700">
                  <strong>Native Email</strong> — a temporary password is generated and emailed
                </span>
              </label>
            </div>
          </div>
          {memberError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{memberError}</p>
          )}
        </form>
      </SlidePanel>
    </div>
  );
}
