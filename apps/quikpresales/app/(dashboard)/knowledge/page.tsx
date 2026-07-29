"use client";

import { useState } from "react";
import { Button, Input, Select, Textarea, Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from "@quikit/ui";
import { api, useApiQuery, useApiMutation, formatDate, type Paginated } from "@/lib/api-client";
import { PageHeader, Panel, Loading, ErrorNote } from "@/components/ui-kit";
import { KNOWLEDGE_KINDS, INDUSTRIES } from "@/lib/library/constants";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

interface KnowledgeRow {
  id: string;
  kind: string;
  title: string;
  industry: string | null;
  technology: string | null;
  tags: string[];
  updatedAt: string;
  snippet?: string | null;
}

export default function KnowledgePage() {
  const { can } = useMyPermissions();
  const [kind, setKind] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  // Two endpoints: browse when there's no query, full-text search when there is.
  const searching = query.trim().length >= 2;

  const browseParams = new URLSearchParams({ limit: "100" });
  if (kind) browseParams.set("kind", kind);

  const searchParams = new URLSearchParams({ q: query.trim(), limit: "50" });
  if (kind) searchParams.set("kind", kind);

  const browse = useApiQuery<Paginated<KnowledgeRow>>(
    ["knowledge", kind],
    `/api/knowledge?${browseParams}`,
    !searching,
  );
  const search = useApiQuery<{ results: KnowledgeRow[]; total: number }>(
    ["knowledge", "search", query, kind],
    `/api/knowledge/search?${searchParams}`,
    searching,
  );

  const rows = searching ? (search.data?.results ?? []) : (browse.data?.data ?? []);
  const isLoading = searching ? search.isLoading : browse.isLoading;
  const error = searching ? search.error : browse.error;

  return (
    <div>
      <PageHeader
        title="Knowledge Repository"
        subtitle="Case studies, references, security docs, battle cards and FAQs — used to ground AI proposal drafting"
        actions={
          can("knowledge", "create") ? (
            <Button onClick={() => setCreating(true)}>New Asset</Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Search title, body and tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          options={[
            { value: "", label: "All kinds" },
            ...KNOWLEDGE_KINDS.map((k) => ({ value: k, label: k.replace(/-/g, " ") })),
          ]}
          className="max-w-[200px]"
        />
      </div>

      {error ? <ErrorNote error={error} /> : null}

      {isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Panel>
          <p className="py-6 text-center text-sm text-gray-400">
            {searching ? `Nothing matches "${query}".` : "No knowledge assets yet."}
          </p>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((a) => (
            <Panel key={a.id}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900">{a.title}</h3>
                <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600">
                  {a.kind.replace(/-/g, " ")}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {[a.industry, a.technology].filter(Boolean).join(" · ") || "General"}
              </p>
              {a.snippet ? <p className="mt-2 text-sm text-gray-600">{a.snippet}</p> : null}
              {a.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {a.tags.map((t) => (
                    <span key={t} className="rounded bg-accent-50 px-1.5 py-0.5 text-xs text-accent-700">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="mt-2 text-xs text-gray-400">Updated {formatDate(a.updatedAt)}</p>
            </Panel>
          ))}
        </div>
      )}

      {creating ? <CreateAssetModal onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function CreateAssetModal({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<string>(KNOWLEDGE_KINDS[0]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [industry, setIndustry] = useState("");
  const [tags, setTags] = useState("");

  const create = useApiMutation(
    (payload: Record<string, unknown>) => api.post("/api/knowledge", payload),
    [["knowledge"], ["dashboard"]],
  );

  return (
    <Modal open onOpenChange={onClose}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>New Knowledge Asset</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <Select
            label="Kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            options={KNOWLEDGE_KINDS.map((k) => ({ value: k, label: k.replace(/-/g, " ") }))}
          />
          <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          <div>
            <label htmlFor="knowledge-body" className="mb-1 block text-sm font-medium text-gray-700">
              Body
            </label>
            <Textarea
              id="knowledge-body"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="The content AI drafting will draw on."
            />
          </div>
          <Select
            label="Industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            options={[
              { value: "", label: "General" },
              ...INDUSTRIES.map((i) => ({ value: i, label: i })),
            ]}
          />
          <Input
            label="Tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="comma, separated"
          />
          {create.error ? <ErrorNote error={create.error} /> : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={title.trim().length < 2 || create.isPending}
            onClick={() =>
              create.mutate(
                {
                  kind,
                  title,
                  ...(body ? { body } : {}),
                  ...(industry ? { industry } : {}),
                  tags: tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
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
