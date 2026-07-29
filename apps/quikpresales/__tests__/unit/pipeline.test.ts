import { describe, it, expect } from "vitest";
import {
  ACTIVE_STAGES,
  STAGE_ORDER,
  canTransition,
  closedStatusFor,
  isStage,
  isTerminal,
} from "@/lib/pipeline";

describe("engagement stage machine", () => {
  it("treats only won and lost as terminal", () => {
    expect(isTerminal("won")).toBe(true);
    expect(isTerminal("lost")).toBe(true);
    expect(ACTIVE_STAGES.every((s) => !isTerminal(s))).toBe(true);
  });

  it("rejects unknown stages on either side", () => {
    expect(canTransition("nonsense", "demo")).toMatchObject({ ok: false, status: 400 });
    expect(canTransition("demo", "nonsense")).toMatchObject({ ok: false, status: 400 });
  });

  it("allows a forward move", () => {
    expect(canTransition("qualification", "discovery").ok).toBe(true);
  });

  it("allows skipping stages forward", () => {
    // Real deals skip PoC or demo routinely; blocking it would push users to
    // fake the intermediate transitions.
    expect(canTransition("qualification", "proposal").ok).toBe(true);
  });

  it("rejects a backward move with 400", () => {
    const result = canTransition("proposal", "discovery");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it("rejects a no-op move", () => {
    expect(canTransition("demo", "demo")).toMatchObject({ ok: false, status: 400 });
  });

  it("allows closing to won or lost from any active stage", () => {
    for (const stage of ACTIVE_STAGES) {
      expect(canTransition(stage, "won").ok).toBe(true);
      expect(canTransition(stage, "lost").ok).toBe(true);
    }
  });

  it("refuses to move a closed engagement, with 409", () => {
    expect(canTransition("won", "proposal")).toMatchObject({ ok: false, status: 409 });
    expect(canTransition("lost", "won")).toMatchObject({ ok: false, status: 409 });
  });

  it("derives closedStatus from the target stage", () => {
    expect(closedStatusFor("won")).toBe("won");
    expect(closedStatusFor("lost")).toBe("lost");
    expect(closedStatusFor("demo")).toBe("open");
  });

  it("recognises every declared stage", () => {
    expect(STAGE_ORDER.every(isStage)).toBe(true);
    expect(isStage("not-a-stage")).toBe(false);
  });
});
