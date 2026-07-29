"use client";

import { useState } from "react";
import { Button, Input, Select, Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from "@quikit/ui";
import { api, useApiQuery, useApiMutation, formatDate, type Paginated } from "@/lib/api-client";
import {
  PageHeader,
  TableShell,
  EmptyRow,
  Loading,
  ErrorNote,
  StatusPill,
} from "@/components/ui-kit";
import { TEMPLATE_KINDS, INDUSTRIES } from "@/lib/library/constants";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

interface TemplateRow {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  industry: string | null;
  technology: string | null;
  isActive: boolean;
  version: number;
  updatedAt: string;
}

export default function TemplatesPage() {
  const { can } = useMyPermissions();
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const params = new URLSearchParams({ limit: "100" });
  if (kind) params.set("kind", kind);
  if (search) params.set("search", search);

  const { data, isLoading, error } = useApiQuery<Paginated<TemplateRow>>(
    ["templates", kind, search],
    `/api/templates?${params}`,
  );

  return (
    <div>
      <PageHeader
        title="Templates"
        subtitle="Reusable discovery, SOW, architecture, pricing and proposal skeletons"
        actions={
          can("templates", "create") ? (
            <Button onClick={() => setCreating(true)}>New Template</Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          options={[
            { value: "", label: "All kinds" },
            ...TEMPLATE_KINDS.map((k) => ({ value: k, label: k.replace(/-/g, " ") })),
          ]}
          className="max-w-[200px]"
        />
      </div>

      {error ? <ErrorNote error={error} /> : null}

      {isLoading ? (
        <Loading />
      ) : (
        <TableShell headers={["Name", "Kind", "Industry", "Version", "Active", "Updated"]}>
          {(data?.data.length ?? 0) === 0 ? (
            <EmptyRow colSpan={6} message="No templates yet." />
          ) : (
            data?.data.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-gray-900">{t.name}</p>
                  {t.description ? (
                    <p className="text-xs text-gray-500">{t.description}</p>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 capitalize text-gray-600">
                  {t.kind.replace(/-/g, " ")}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{t.industry ?? "—"}</td>
                <td className="px-4 py-2.5 text-gray-600">v{t.version}</td>
                <td className="px-4 py-2.5">
                  <StatusPill status={t.isActive ? "ready" : "outdated"} label={t.isActive ? "active" : "inactive"} />
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500">{formatDate(t.updatedAt)}</td>
              </tr>
            ))
          )}
        </TableShell>
      )}

      {creating ? <CreateTemplateModal onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function CreateTemplateModal({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<string>(TEMPLATE_KINDS[0]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");

  const create = useApiMutation(
    (body: Record<string, unknown>) => api.post("/api/templates", body),
    [["templates"], ["dashboard"]],
  );

  return (
    <Modal open onOpenChange={onClose}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>New Template</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <Select
            label="Kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            options={TEMPLATE_KINDS.map((k) => ({ value: k, label: k.replace(/-/g, " ") }))}
          />
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Select
            label="Industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            options={[
              { value: "", label: "Any" },
              ...INDUSTRIES.map((i) => ({ value: i, label: i })),
            ]}
          />
          {create.error ? <ErrorNote error={create.error} /> : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={name.trim().length < 2 || create.isPending}
            onClick={() =>
              create.mutate(
                {
                  kind,
                  name,
                  ...(description ? { description } : {}),
                  ...(industry ? { industry } : {}),
                  content: {},
                },
                { onSuccess: onClose },
              )
            }
          >
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
