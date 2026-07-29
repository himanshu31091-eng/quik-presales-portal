/**
 * Proposal status machine (spec §4.2).
 *
 *   draft → internal-review → customer-review → approved → won | lost
 *
 * Backward moves to `draft` are allowed from either review state, because a
 * proposal that comes back with comments genuinely returns to drafting. Moving
 * INTO `approved` requires `proposals:approve`; everything else needs
 * `proposals:update`.
 */

export const PROPOSAL_STATUSES = [
  "draft",
  "internal-review",
  "customer-review",
  "approved",
  "won",
  "lost",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "Draft",
  "internal-review": "Internal Review",
  "customer-review": "Customer Review",
  approved: "Approved",
  won: "Won",
  lost: "Lost",
};

/** Allowed target states from each state. */
const ALLOWED: Record<ProposalStatus, readonly ProposalStatus[]> = {
  draft: ["internal-review"],
  "internal-review": ["draft", "customer-review", "approved"],
  "customer-review": ["draft", "internal-review", "approved"],
  approved: ["customer-review", "won", "lost"],
  won: [],
  lost: [],
};

const STATUS_SET = new Set<string>(PROPOSAL_STATUSES);

export function isProposalStatus(value: string): value is ProposalStatus {
  return STATUS_SET.has(value);
}

export function isTerminalStatus(status: ProposalStatus): boolean {
  return ALLOWED[status].length === 0;
}

/** Target states that require the `approve` permission rather than `update`. */
export function requiresApproval(to: ProposalStatus): boolean {
  return to === "approved";
}

export interface StatusCheck {
  ok: boolean;
  reason?: string;
  status?: 400 | 409;
}

export function canTransitionStatus(from: string, to: string): StatusCheck {
  if (!isProposalStatus(from)) {
    return { ok: false, reason: `Unknown current status "${from}"`, status: 400 };
  }
  if (!isProposalStatus(to)) {
    return { ok: false, reason: `Unknown target status "${to}"`, status: 400 };
  }
  if (from === to) {
    return { ok: false, reason: `Proposal is already ${STATUS_LABEL[to]}`, status: 400 };
  }
  if (isTerminalStatus(from)) {
    return {
      ok: false,
      reason: `Proposal is ${STATUS_LABEL[from]} and cannot be moved`,
      status: 409,
    };
  }
  if (!ALLOWED[from].includes(to)) {
    return {
      ok: false,
      reason: `Cannot move from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]}`,
      status: 400,
    };
  }
  return { ok: true };
}
