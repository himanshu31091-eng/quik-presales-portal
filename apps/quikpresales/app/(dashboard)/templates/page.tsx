"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Button, Input, Select, Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from "@quikit/ui";
import { api, useApiQuery, useApiMutation, formatDate, type Paginated } from "@/lib/api-client";
import {
  PageHeader,
  TableShell,
  EmptyRow,
  Loading,
  ErrorNote,
  StatusPill,
  ComboField,
} from "@/components/ui-kit";
import { TEMPLATE_KINDS } from "@/lib/library/constants";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import { useVocabulary, VOCABULARY_KEY } from "@/lib/hooks/useVocabulary";

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
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

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
        <TableShell headers={["Name", "Kind", "Industry", "Version", "Active", "Updated", ""]}>
          {(data?.data.length ?? 0) === 0 ? (
            <EmptyRow colSpan={7} message="No templates yet." />
          ) : (
            data?.data.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link href={`/templates/${t.id}`} className="font-medium text-gray-900 hover:underline">
                    {t.name}
                  </Link>
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
                <td className="px-4 py-2.5 text-right">
                  {can("templates", "delete") ? (
                    <button
                      type="button"
                      title="Delete"
                      onClick={() => setDeleting({ id: t.id, name: t.name })}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))
          )}
        </TableShell>
      )}

      {creating ? <CreateTemplateModal onClose={() => setCreating(false)} /> : null}
      {deleting ? (
        <DeleteTemplateModal
          id={deleting.id}
          name={deleting.name}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}

function CreateTemplateModal({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<string>(TEMPLATE_KINDS[0]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const { industries } = useVocabulary();

  const create = useApiMutation(
    (body: Record<string, unknown>) => api.post("/api/templates", body),
    [["templates"], ["dashboard"], VOCABULARY_KEY],
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
          <ComboField
            label="Industry"
            value={industry}
            onChange={setIndustry}
            options={industries}
            placeholder="Leave blank for Any — or type your own"
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

function DeleteTemplateModal({
  id,
  name,
  onClose,
}: {
  id: string;
  name: string;
  onClose: () => void;
}) {
  const del = useApiMutation(() => api.del(`/api/templates/${id}`), [["templates"]]);

  return (
    <Modal open onOpenChange={onClose}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Delete this template?</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">&ldquo;{name}&rdquo;</span> will no longer
            appear in the Templates list or be selectable when creating a proposal. Existing
            proposals already created from it keep their own copy of the content.
          </p>
          {del.error ? (
            <div className="mt-3">
              <ErrorNote error={del.error} />
            </div>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={del.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={del.isPending}
            onClick={() => del.mutate(undefined, { onSuccess: onClose })}
          >
            {del.isPending ? "Deleting…" : "Delete"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
