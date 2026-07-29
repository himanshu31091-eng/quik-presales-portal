import { describe, it, expect } from "vitest";
import {
  canTransitionStatus,
  isTerminalStatus,
  requiresApproval,
  PROPOSAL_STATUSES,
} from "@/lib/proposals/status";

describe("proposal status machine", () => {
  it("walks the happy path draft → approved", () => {
    expect(canTransitionStatus("draft", "internal-review").ok).toBe(true);
    expect(canTransitionStatus("internal-review", "customer-review").ok).toBe(true);
    expect(canTransitionStatus("customer-review", "approved").ok).toBe(true);
  });

  it("allows returning to draft from either review state", () => {
    expect(canTransitionStatus("internal-review", "draft").ok).toBe(true);
    expect(canTransitionStatus("customer-review", "draft").ok).toBe(true);
  });

  it("does not allow skipping review entirely", () => {
    const result = canTransitionStatus("draft", "approved");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it("only flags `approved` as needing the approve permission", () => {
    expect(requiresApproval("approved")).toBe(true);
    for (const s of PROPOSAL_STATUSES.filter((s) => s !== "approved")) {
      expect(requiresApproval(s)).toBe(false);
    }
  });

  it("treats won and lost as terminal", () => {
    expect(isTerminalStatus("won")).toBe(true);
    expect(isTerminalStatus("lost")).toBe(true);
    expect(canTransitionStatus("won", "draft")).toMatchObject({ ok: false, status: 409 });
  });

  it("allows won/lost only from approved", () => {
    expect(canTransitionStatus("approved", "won").ok).toBe(true);
    expect(canTransitionStatus("approved", "lost").ok).toBe(true);
    expect(canTransitionStatus("draft", "won").ok).toBe(false);
  });
});
