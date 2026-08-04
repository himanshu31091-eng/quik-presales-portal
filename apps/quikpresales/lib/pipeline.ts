/**
 * Engagement stage machine.
 *
 * Stages advance forward only. `won` and `lost` are terminal — once an
 * engagement is closed it cannot be reopened through the transition endpoint
 * (that would silently rewrite win/loss history and the dashboard rollups
 * derived from it).
 *
 * Transitions are POST-only via /api/engagements/[id]/transition. `PATCH` on
 * the engagement resource rejects `stage` outright, so there is exactly one
 * code path that can move an engagement and exactly one place that writes the
 * accompanying timeline + audit rows.
 */

export const STAGE_ORDER = [
  "lead",
  "qualification",
  "discovery",
  "solution-design",
  "demo",
  "poc",
  "proposal",
  "negotiation",
  "won",
  "lost",
  "rejected",
] as const;

export type Stage = (typeof STAGE_ORDER)[number];

/**
 * Stages an engagement can never leave.
 *
 * `rejected` is distinct from `lost` on purpose. A lost deal was pursued and
 * beaten; a rejected lead was never taken on. Folding rejections into `lost`
 * would drag the win rate down with deals pre-sales deliberately declined, so
 * they carry their own closed status and are excluded from win/loss rollups.
 */
export const TERMINAL_STAGES: readonly Stage[] = ["won", "lost", "rejected"];

/** The linear part of the pipeline — everything before the terminal outcomes. */
export const ACTIVE_STAGES: readonly Stage[] = STAGE_ORDER.filter(
  (s) => !TERMINAL_STAGES.includes(s),
);

export const STAGE_LABEL: Record<Stage, string> = {
  lead: "Lead",
  qualification: "Qualification",
  discovery: "Discovery",
  "solution-design": "Solution Design",
  demo: "Demo",
  poc: "PoC",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
  rejected: "Rejected",
};

/** Default probability applied when an engagement enters each stage. */
export const STAGE_PROBABILITY: Record<Stage, number> = {
  lead: 5,
  qualification: 10,
  discovery: 20,
  "solution-design": 35,
  demo: 50,
  poc: 60,
  proposal: 75,
  negotiation: 85,
  won: 100,
  lost: 0,
  rejected: 0,
};

const STAGE_SET = new Set<string>(STAGE_ORDER);

export function isStage(value: string): value is Stage {
  return STAGE_SET.has(value);
}

export function isTerminal(stage: string): boolean {
  return TERMINAL_STAGES.includes(stage as Stage);
}

export interface TransitionCheck {
  ok: boolean;
  /** Present when `ok` is false — safe to surface to the caller. */
  reason?: string;
  /** HTTP status the route should use for this failure. */
  status?: 400 | 409;
}

/**
 * Validate a stage move.
 *
 *   - unknown stage                → 400
 *   - already closed               → 409 (terminal is terminal)
 *   - same stage                   → 400 (no-op, likely a double submit)
 *   - backwards                    → 400
 *   - forward, or to won/lost      → ok
 *
 * Jumping several stages forward at once is allowed: real deals skip PoC or
 * demo routinely, and blocking it would push users to fake the intermediate
 * transitions, polluting the timeline.
 */
export function canTransition(from: string, to: string): TransitionCheck {
  if (!isStage(from)) return { ok: false, reason: `Unknown current stage "${from}"`, status: 400 };
  if (!isStage(to)) return { ok: false, reason: `Unknown target stage "${to}"`, status: 400 };

  if (isTerminal(from)) {
    return {
      ok: false,
      reason: `Engagement is already ${STAGE_LABEL[from]} and cannot be moved`,
      status: 409,
    };
  }

  if (from === to) {
    return { ok: false, reason: `Engagement is already at ${STAGE_LABEL[to]}`, status: 400 };
  }

  // Closing out is always permitted from any active stage.
  if (isTerminal(to)) return { ok: true };

  if (STAGE_ORDER.indexOf(to) < STAGE_ORDER.indexOf(from)) {
    return {
      ok: false,
      reason: `Cannot move backwards from ${STAGE_LABEL[from]} to ${STAGE_LABEL[to]}`,
      status: 400,
    };
  }

  return { ok: true };
}

/**
 * `closedStatus` implied by a target stage.
 *
 * `rejected` gets its own value rather than reusing `lost`, so dashboard win-rate
 * queries — which count `won` against `lost` — never include a lead pre-sales
 * declined to pursue.
 */
export function closedStatusFor(stage: Stage): "open" | "won" | "lost" | "rejected" {
  if (stage === "won") return "won";
  if (stage === "lost") return "lost";
  if (stage === "rejected") return "rejected";
  return "open";
}
