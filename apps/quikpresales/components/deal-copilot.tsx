"use client";

import { useState } from "react";
import { Button } from "@quikit/ui";
import { api, useApiMutation } from "@/lib/api-client";
import { Panel } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * Deal copilot panel.
 *
 * A short list of grounded actions plus a free-text question box. Every answer is
 * generated from what the portal actually holds about this deal, and the panel
 * shows what it was grounded in — so a thin answer is explainable rather than
 * mysterious.
 *
 * Actions that are not backed by working machinery are deliberately absent rather
 * than present-and-broken. "Create architecture diagram" appears in the design but
 * there is no diagram engine, and a button that always fails is worse than no
 * button.
 */

interface CopilotResponse {
  task: string;
  answer: string;
  isStub: boolean;
  grounding: {
    requirements: number;
    answeredRequirements: number;
    proposals: number;
    estimates: number;
    demosDelivered: number;
    activityEvents: number;
    hasRequirementBrief: boolean;
  };
}

const ACTIONS: { task: string; label: string; hint: string }[] = [
  { task: "summarise", label: "Summarise this deal", hint: "Where it stands, in a paragraph" },
  { task: "win-strategy", label: "Suggest a win strategy", hint: "What will decide it, and what to do" },
  { task: "followup-email", label: "Draft a follow-up email", hint: "Based only on what has happened" },
  { task: "competitor-analysis", label: "Analyse the competition", hint: "Positioning against named competitors" },
  { task: "executive-summary", label: "Prepare an executive summary", hint: "For leadership, under 120 words" },
];

export function DealCopilot({ engagementId }: { engagementId: string }) {
  const [question, setQuestion] = useState("");
  const [active, setActive] = useState<string | null>(null);

  const run = useApiMutation<CopilotResponse, { task: string; question?: string }>(
    (vars) => api.post(`/api/engagements/${engagementId}/copilot`, vars),
  );

  function fire(task: string, q?: string) {
    setActive(task);
    run.mutate({ task, ...(q ? { question: q } : {}) });
  }

  const result = run.data;

  return (
    <Panel title="AI Copilot">
      <p className="-mt-1 mb-3 text-xs text-gray-500">
        Answers come only from what this portal holds about the deal.
      </p>

      <div className="space-y-1.5">
        {ACTIONS.map((a) => (
          <button
            key={a.task}
            type="button"
            onClick={() => fire(a.task)}
            disabled={run.isPending}
            className={cn(
              "w-full rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-60",
              active === a.task && run.isPending
                ? "border-accent-300 bg-accent-50"
                : "border-gray-200 bg-white hover:border-accent-200 hover:bg-accent-50/50",
            )}
          >
            <span className="block text-sm font-medium text-gray-900">{a.label}</span>
            <span className="block text-xs text-gray-500">{a.hint}</span>
          </button>
        ))}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim().length >= 3) fire("ask", question.trim());
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about this deal…"
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-700"
        />
        <Button size="sm" disabled={run.isPending || question.trim().length < 3}>
          Ask
        </Button>
      </form>

      {run.isPending ? (
        <p className="mt-3 text-sm text-gray-500">Thinking…</p>
      ) : null}

      {run.error ? (
        <p className="mt-3 rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {(run.error as Error).message}
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 border-t border-gray-100 pt-3">
          {result.isStub ? (
            <p className="mb-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
              AI is not configured in this environment.
            </p>
          ) : null}

          {/* Whitespace preserved: the model returns plain prose and short lists,
              and re-parsing it as markdown would fight its own instructions. */}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
            {result.answer}
          </p>

          {!result.isStub ? (
            <p className="mt-3 text-[11px] text-gray-400">
              Grounded in {result.grounding.requirements} requirement(s)
              {result.grounding.requirements > 0
                ? ` (${result.grounding.answeredRequirements} answered)`
                : ""}
              , {result.grounding.proposals} proposal(s), {result.grounding.estimates} estimate(s),{" "}
              {result.grounding.demosDelivered} demo(s) and {result.grounding.activityEvents} activity
              event(s)
              {result.grounding.hasRequirementBrief ? ", plus the submitted brief" : ""}.
            </p>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
