"use client";

import { useState } from "react";
import { Button, Checkbox } from "@quikit/ui";
import { api, useApiQuery, useApiMutation } from "@/lib/api-client";
import { PageHeader, Panel, Loading, ErrorNote } from "@/components/ui-kit";

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  permissions: string[];
  memberCount: number;
}

interface PermissionTree {
  actions: string[];
  modules: {
    key: string;
    label: string;
    leaves: { resource: string; label: string; actions: string[] }[];
  }[];
  seededRoles: string[];
}

export default function RolesPage() {
  const roles = useApiQuery<RoleRow[]>(["roles"], "/api/roles");
  const tree = useApiQuery<PermissionTree>(["roles", "permissions"], "/api/roles/permissions");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (roles.isLoading || tree.isLoading) return <Loading />;
  if (roles.error) return <ErrorNote error={roles.error} />;
  if (tree.error) return <ErrorNote error={tree.error} />;

  const selected = roles.data?.find((r) => r.id === selectedId) ?? roles.data?.[0] ?? null;

  // Same split the Admin Portal uses — purely on `isSystem`. Exactly one role
  // (`admin`) is a system role in every QuikIT app; the rest are custom.
  const systemRoles = (roles.data ?? []).filter((r) => r.isSystem);
  const customRoles = (roles.data ?? []).filter((r) => !r.isSystem);

  function roleButton(r: RoleRow) {
    return (
      <li key={r.id}>
        <button
          type="button"
          onClick={() => setSelectedId(r.id)}
          className={`w-full rounded px-2 py-1.5 text-left text-sm ${
            selected?.id === r.id
              ? "bg-accent-50 font-medium text-accent-700"
              : "text-gray-700 hover:bg-gray-50"
          }`}
        >
          {r.name}
          <span className="ml-1 text-xs text-gray-400">({r.memberCount})</span>
          {r.isDefault ? <span className="ml-1 text-xs text-accent-600">· default</span> : null}
        </button>
      </li>
    );
  }

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Grants are additive. Org admins and holders of the admin role bypass these checks."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="space-y-4">
          <Panel title="System Roles">
            <p className="mb-2 text-xs text-gray-400">Cannot be deleted or renamed</p>
            {systemRoles.length ? (
              <ul className="space-y-1">{systemRoles.map(roleButton)}</ul>
            ) : (
              <p className="text-sm text-gray-400">None</p>
            )}
          </Panel>

          <Panel title={`Custom Roles${customRoles.length ? ` (${customRoles.length})` : ""}`}>
            {customRoles.length ? (
              <ul className="space-y-1">{customRoles.map(roleButton)}</ul>
            ) : (
              <p className="text-sm text-gray-400">None</p>
            )}
          </Panel>
        </div>

        <div className="lg:col-span-3">
          {selected && tree.data ? (
            <PermissionMatrix role={selected} tree={tree.data} />
          ) : (
            <Panel>
              <p className="text-sm text-gray-400">Select a role.</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function PermissionMatrix({ role, tree }: { role: RoleRow; tree: PermissionTree }) {
  const [granted, setGranted] = useState<Set<string>>(new Set(role.permissions));
  const [dirty, setDirty] = useState(false);

  // Re-seed when the selected role changes.
  const [lastRoleId, setLastRoleId] = useState(role.id);
  if (lastRoleId !== role.id) {
    setLastRoleId(role.id);
    setGranted(new Set(role.permissions));
    setDirty(false);
  }

  const save = useApiMutation(
    (grants: { resource: string; action: string }[]) =>
      api.patch(`/api/roles/${role.id}`, { grants }),
    [["roles"], ["me", "permissions"]],
  );

  function toggle(resource: string, action: string) {
    const key = `${resource}:${action}`;
    const next = new Set(granted);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setGranted(next);
    setDirty(true);
  }

  return (
    <Panel
      title={`${role.name}${role.isSystem ? " (system role)" : ""}`}
      actions={
        dirty ? (
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                Array.from(granted).map((k) => {
                  const [resource, action] = k.split(":");
                  return { resource, action };
                }),
                { onSuccess: () => setDirty(false) },
              )
            }
          >
            {save.isPending ? "Saving…" : "Save grants"}
          </Button>
        ) : null
      }
    >
      {role.description ? (
        <p className="mb-4 text-sm text-gray-500">{role.description}</p>
      ) : null}
      {save.error ? <ErrorNote error={save.error} /> : null}

      <div className="space-y-5">
        {tree.modules.map((module) => (
          <div key={module.key}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {module.label}
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {module.leaves.map((leaf) => (
                    <tr key={leaf.resource}>
                      <td className="w-56 py-2 pr-4 text-gray-700">{leaf.label}</td>
                      {leaf.actions.map((action) => (
                        <td key={action} className="px-3 py-2">
                          <label className="flex items-center gap-1.5 text-xs text-gray-600">
                            <Checkbox
                              checked={granted.has(`${leaf.resource}:${action}`)}
                              onChange={() => toggle(leaf.resource, action)}
                            />
                            {action}
                          </label>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
