"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Button, Input, Select, Textarea, ToggleSwitch } from "@quikit/ui";
import { api, useApiQuery, useApiMutation } from "@/lib/api-client";
import { PageHeader, Panel, Loading, ErrorNote, ComboField } from "@/components/ui-kit";
import { TEMPLATE_KINDS } from "@/lib/library/constants";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import { useVocabulary } from "@/lib/hooks/useVocabulary";
import { DEFAULT_SECTIONS, parseSections, normaliseSections, type ProposalSection } from "@/lib/proposals/sections";

interface TemplateDetail {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  content: unknown;
  industry: string | null;
  technology: string | null;
  isActive: boolean;
  version: number;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "section"
  );
}

export default function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useMyPermissions();
  const { industries, technologies } = useVocabulary();

  const { data, isLoading, error } = useApiQuery<TemplateDetail>(
    ["template", id],
    `/api/templates/${id}`,
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<string>(TEMPLATE_KINDS[0]);
  const [industry, setIndustry] = useState("");
  const [technology, setTechnology] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [sections, setSections] = useState<ProposalSection[]>([]);
  const [rawContent, setRawContent] = useState("{}");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Re-seed the editor whenever the underlying record changes identity (id) or
  // reloads. Keyed loosely — this page has no concurrent-editor concern like
  // proposal versions do, so a plain data-arrival effect is enough.
  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setDescription(data.description ?? "");
    setKind(data.kind);
    setIndustry(data.industry ?? "");
    setTechnology(data.technology ?? "");
    setIsActive(data.isActive);
    if (data.kind === "proposal") {
      setSections(parseSections(data.content));
    } else {
      setRawContent(JSON.stringify(data.content ?? {}, null, 2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-seed when the fetched record itself changes
  }, [data]);

  const update = useApiMutation(
    (payload: Record<string, unknown>) => api.patch(`/api/templates/${id}`, payload),
    [["templates"], ["template", id]],
  );

  const canEdit = can("templates", "update");

  if (isLoading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;

  function addSection() {
    setSections((prev) => [
      ...prev,
      { slug: slugify(`section-${prev.length + 1}`), title: "", html: "" },
    ]);
  }

  function moveSection(index: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSection(index: number, patch: Partial<ProposalSection>) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  const emptySections = sections.some((s) => !s.title.trim() || !s.slug.trim());
  const duplicateSlugs = new Set(sections.map((s) => s.slug)).size !== sections.length;
  const sectionsInvalid = kind === "proposal" && sections.length > 0 && (emptySections || duplicateSlugs);

  function handleSave() {
    setJsonError(null);
    let content: unknown;
    if (kind === "proposal") {
      content = normaliseSections(sections);
    } else {
      try {
        content = rawContent.trim() ? JSON.parse(rawContent) : {};
      } catch {
        setJsonError("Content must be valid JSON.");
        return;
      }
    }
    update.mutate({
      name,
      description: description || null,
      kind,
      industry: industry || null,
      technology: technology || null,
      isActive,
      content,
    });
  }

  return (
    <div>
      <PageHeader
        title={data.name}
        subtitle={`v${data.version} · ${data.kind.replace(/-/g, " ")}`}
        actions={
          canEdit ? (
            <Button
              onClick={handleSave}
              disabled={update.isPending || name.trim().length < 2 || sectionsInvalid}
            >
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          ) : null
        }
      />

      {update.error ? (
        <div className="mb-4">
          <ErrorNote error={update.error} />
        </div>
      ) : null}
      {sectionsInvalid ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Every section needs a title and a unique slug before this can be saved.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Panel title="Details">
            <div className="space-y-4">
              <Input
                label="Name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canEdit}
              />
              <Input
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canEdit}
              />
              <Select
                label="Kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                options={TEMPLATE_KINDS.map((k) => ({ value: k, label: k.replace(/-/g, " ") }))}
                disabled={!canEdit}
              />
              <ComboField
                label="Industry"
                value={industry}
                onChange={setIndustry}
                options={industries}
                placeholder="Leave blank for Any — or type your own"
              />
              <ComboField
                label="Technology"
                value={technology}
                onChange={setTechnology}
                options={technologies}
                placeholder="Leave blank for Any — or type your own"
              />
              <ToggleSwitch checked={isActive} onChange={setIsActive} label="Active" disabled={!canEdit} />
            </div>
          </Panel>
        </div>

        <div className="space-y-5 lg:col-span-2">
          {kind === "proposal" ? (
            <Panel
              title="Sections"
              actions={
                canEdit ? (
                  <div className="flex items-center gap-2">
                    {sections.length === 0 ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSections(DEFAULT_SECTIONS.map((s) => ({ ...s, html: "" })))}
                      >
                        Start from default sections
                      </Button>
                    ) : null}
                    <Button size="sm" variant="secondary" onClick={addSection}>
                      <Plus className="h-3.5 w-3.5" />
                      Add section
                    </Button>
                  </div>
                ) : null
              }
            >
              {sections.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">
                  No sections yet. A proposal created from this template falls back to the default
                  skeleton until you add some here.
                </p>
              ) : (
                <div className="space-y-3">
                  {sections.map((s, i) => (
                    <div key={i} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center gap-2">
                        <Input
                          value={s.title}
                          onChange={(e) => updateSection(i, { title: e.target.value })}
                          placeholder="Section title"
                          className="flex-1"
                          disabled={!canEdit}
                        />
                        <Input
                          value={s.slug}
                          onChange={(e) => updateSection(i, { slug: slugify(e.target.value) })}
                          placeholder="slug"
                          className="w-36 shrink-0 font-mono text-xs"
                          disabled={!canEdit}
                        />
                        {canEdit ? (
                          <div className="flex shrink-0 items-center">
                            <button
                              type="button"
                              onClick={() => moveSection(i, -1)}
                              disabled={i === 0}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                              title="Move up"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSection(i, 1)}
                              disabled={i === sections.length - 1}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                              title="Move down"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSection(i)}
                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              title="Remove section"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <Textarea
                        className="mt-2"
                        rows={4}
                        aria-label={`${s.title || `Section ${i + 1}`} — content`}
                        value={s.html}
                        onChange={(e) => updateSection(i, { html: e.target.value })}
                        placeholder="Section content — p, ul/ol/li, strong, em, table, blockquote, code are kept; everything else is stripped on save."
                        disabled={!canEdit}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : (
            <Panel title="Content (JSON)">
              <p className="mb-2 text-xs text-gray-400">
                This template kind has no defined content shape used anywhere in the product yet —
                author whatever structured JSON your own downstream use fits.
              </p>
              <Textarea
                rows={16}
                aria-label="Template content (JSON)"
                value={rawContent}
                onChange={(e) => setRawContent(e.target.value)}
                className="font-mono text-xs"
                disabled={!canEdit}
              />
              {jsonError ? <p className="mt-1 text-xs text-red-600">{jsonError}</p> : null}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
