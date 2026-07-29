"use client";

import { useState } from "react";
import { Button, Input, Select, Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from "@quikit/ui";
import { api, useApiQuery, useApiMutation, type Paginated } from "@/lib/api-client";
import { PageHeader, Panel, StatusPill, Loading, ErrorNote } from "@/components/ui-kit";
import { INDUSTRIES, TECHNOLOGIES } from "@/lib/library/constants";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

interface DemoRow {
  id: string;
  industry: string;
  technology: string;
  title: string;
  description: string | null;
  recordingUrl: string | null;
  blobUrl: string | null;
  status: string;
  feedbackScore: number | null;
  feedbackCount: number;
  tags: string[];
}

export default function DemosPage() {
  const { can } = useMyPermissions();
  const [industry, setIndustry] = useState("");
  const [technology, setTechnology] = useState("");
  const [creating, setCreating] = useState(false);

  const params = new URLSearchParams({ limit: "100" });
  if (industry) params.set("industry", industry);
  if (technology) params.set("technology", technology);

  const { data, isLoading, error } = useApiQuery<Paginated<DemoRow>>(
    ["demos", industry, technology],
    `/api/demos?${params}`,
  );

  return (
    <div>
      <PageHeader
        title="Demo Library"
        subtitle="Demos by industry × technology, with satisfaction scores"
        actions={
          can("demos", "create") ? <Button onClick={() => setCreating(true)}>New Demo</Button> : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          options={[
            { value: "", label: "All industries" },
            ...INDUSTRIES.map((i) => ({ value: i, label: i })),
          ]}
          className="max-w-[200px]"
        />
        <Select
          value={technology}
          onChange={(e) => setTechnology(e.target.value)}
          options={[
            { value: "", label: "All technologies" },
            ...TECHNOLOGIES.map((t) => ({ value: t, label: t })),
          ]}
          className="max-w-[200px]"
        />
      </div>

      {error ? <ErrorNote error={error} /> : null}

      {isLoading ? (
        <Loading />
      ) : (data?.data.length ?? 0) === 0 ? (
        <Panel>
          <p className="py-6 text-center text-sm text-gray-400">No demos match these filters.</p>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.data.map((d) => (
            <DemoCard key={d.id} demo={d} canRate={can("demos", "update")} />
          ))}
        </div>
      )}

      {creating ? <CreateDemoModal onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function DemoCard({ demo, canRate }: { demo: DemoRow; canRate: boolean }) {
  const rate = useApiMutation(
    (rating: number) => api.patch(`/api/demos/${demo.id}`, { rating }),
    [["demos"], ["dashboard"]],
  );

  return (
    <Panel>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{demo.title}</h3>
        <StatusPill status={demo.status} />
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {demo.industry} · {demo.technology}
      </p>
      {demo.description ? (
        <p className="mt-2 line-clamp-3 text-sm text-gray-600">{demo.description}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {demo.blobUrl ? (
          <a href={demo.blobUrl} target="_blank" rel="noreferrer" className="text-accent-600 hover:underline">
            Deck
          </a>
        ) : null}
        {demo.recordingUrl ? (
          <a href={demo.recordingUrl} target="_blank" rel="noreferrer" className="text-accent-600 hover:underline">
            Recording
          </a>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
        <span className="text-xs text-gray-500">
          {demo.feedbackScore !== null
            ? `${demo.feedbackScore.toFixed(1)} / 5 · ${demo.feedbackCount} rating(s)`
            : "Not yet rated"}
        </span>
        {canRate ? (
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                disabled={rate.isPending}
                onClick={() => rate.mutate(n)}
                className="text-sm text-gray-300 transition-colors hover:text-amber-400 disabled:opacity-50"
                aria-label={`Rate ${n} out of 5`}
              >
                ★
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function CreateDemoModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [industry, setIndustry] = useState<string>(INDUSTRIES[0]);
  const [technology, setTechnology] = useState<string>(TECHNOLOGIES[0]);
  const [description, setDescription] = useState("");

  const create = useApiMutation(
    (body: Record<string, unknown>) => api.post("/api/demos", body),
    [["demos"], ["dashboard"]],
  );

  return (
    <Modal open onOpenChange={onClose}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>New Demo</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          <Select
            label="Industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            options={INDUSTRIES.map((i) => ({ value: i, label: i }))}
          />
          <Select
            label="Technology"
            value={technology}
            onChange={(e) => setTechnology(e.target.value)}
            options={TECHNOLOGIES.map((t) => ({ value: t, label: t }))}
          />
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
                { title, industry, technology, ...(description ? { description } : {}) },
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
