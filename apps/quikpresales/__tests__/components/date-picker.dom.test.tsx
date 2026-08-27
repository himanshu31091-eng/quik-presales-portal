// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DatePicker } from "@quikit/ui";
import { expectNoA11yViolations } from "../helpers/axe";

/**
 * Keyboard navigation for the calendar grid (WCAG 2.1.1).
 *
 * This component is not currently rendered anywhere in QuikPreSales, so there
 * is no browser path to exercise it — these tests are the verification, not a
 * supplement to it. They drive real key events and assert where DOM focus
 * actually lands.
 */

afterEach(cleanup);

/** Pin "today" so month/year arithmetic is deterministic. */
const TODAY = new Date("2026-03-17T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Renders the picker, opens it, and returns the dialog. */
function openPicker(props: Partial<React.ComponentProps<typeof DatePicker>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <DatePicker value="2026-03-17" onChange={onChange} {...props} />,
  );
  // The trigger shows the short form ("17 Mar 2026"); only the day cells use
  // the spelled-out month.
  fireEvent.click(trigger());
  const dialog = screen.getByRole("dialog", { name: /choose date/i });
  return { ...utils, dialog, onChange };
}

/** The picker's trigger button, whichever label it is currently showing. */
function trigger(): HTMLElement {
  return screen.getByRole("button", { name: /Mar 2026|Select date/i });
}

/** The ISO date of whichever day cell currently holds DOM focus. */
function focusedISO(): string | null {
  return document.activeElement?.getAttribute("data-iso") ?? null;
}

function press(dialog: HTMLElement, key: string, opts: { shiftKey?: boolean } = {}) {
  fireEvent.keyDown(document.activeElement ?? dialog, { key, bubbles: true, ...opts });
}

describe("DatePicker calendar keyboard navigation", () => {
  it("opens with focus on the selected date", () => {
    openPicker();
    expect(focusedISO()).toBe("2026-03-17");
  });

  it("falls back to today when nothing is selected", () => {
    openPicker({ value: "" });
    expect(focusedISO()).toBe("2026-03-17");
  });

  it("moves by day with Left/Right", () => {
    const { dialog } = openPicker();
    press(dialog, "ArrowRight");
    expect(focusedISO()).toBe("2026-03-18");
    press(dialog, "ArrowLeft");
    press(dialog, "ArrowLeft");
    expect(focusedISO()).toBe("2026-03-16");
  });

  it("moves by week with Up/Down", () => {
    const { dialog } = openPicker();
    press(dialog, "ArrowDown");
    expect(focusedISO()).toBe("2026-03-24");
    press(dialog, "ArrowUp");
    press(dialog, "ArrowUp");
    expect(focusedISO()).toBe("2026-03-10");
  });

  it("jumps to the start and end of the week with Home/End", () => {
    // 17 Mar 2026 is a Tuesday; with weekStartDay=0 the week runs Sun 15 – Sat 21.
    const { dialog } = openPicker();
    press(dialog, "Home");
    expect(focusedISO()).toBe("2026-03-15");
    press(dialog, "End");
    expect(focusedISO()).toBe("2026-03-21");
  });

  it("respects weekStartDay for Home/End", () => {
    // Monday-start: the week containing Tue 17 runs Mon 16 – Sun 22.
    const { dialog } = openPicker({ weekStartDay: 1 });
    press(dialog, "Home");
    expect(focusedISO()).toBe("2026-03-16");
    press(dialog, "End");
    expect(focusedISO()).toBe("2026-03-22");
  });

  it("moves by month with PageUp/PageDown and by year with Shift", () => {
    const { dialog } = openPicker();
    press(dialog, "PageDown");
    expect(focusedISO()).toBe("2026-04-17");
    press(dialog, "PageUp");
    press(dialog, "PageUp");
    expect(focusedISO()).toBe("2026-02-17");
    press(dialog, "PageDown", { shiftKey: true });
    expect(focusedISO()).toBe("2027-02-17");
  });

  it("clamps the day when the target month is shorter", () => {
    // 31 Mar -> Feb has no 31st, so it must land on the 28th, not overflow to Mar 3.
    const { dialog } = openPicker({ value: "2026-03-31" });
    press(dialog, "PageUp");
    expect(focusedISO()).toBe("2026-02-28");
  });

  it("pulls the visible month along when arrowing past the edge", () => {
    const { dialog } = openPicker({ value: "2026-03-31" });
    press(dialog, "ArrowRight");
    expect(focusedISO()).toBe("2026-04-01");
    // The header should now read April, not March.
    expect(screen.getByText(/April 2026/)).toBeInTheDocument();
  });

  it("keeps exactly one day cell in the tab order", () => {
    const { dialog } = openPicker();
    const tabbable = Array.from(dialog.querySelectorAll("[data-iso]")).filter(
      (el) => el.getAttribute("tabindex") === "0",
    );
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0].getAttribute("data-iso")).toBe("2026-03-17");

    // ...and it follows the roving focus rather than staying put.
    press(dialog, "ArrowRight");
    const nowTabbable = Array.from(dialog.querySelectorAll("[data-iso]")).filter(
      (el) => el.getAttribute("tabindex") === "0",
    );
    expect(nowTabbable).toHaveLength(1);
    expect(nowTabbable[0].getAttribute("data-iso")).toBe("2026-03-18");
  });

  it("commits the focused date with Enter", () => {
    const { dialog, onChange } = openPicker();
    press(dialog, "ArrowRight");
    // A real <button> fires click on Enter; jsdom needs the click dispatched.
    fireEvent.click(document.activeElement!);
    expect(onChange).toHaveBeenCalledWith("2026-03-18");
  });

  it("closes on Escape and returns focus to the trigger", () => {
    const { dialog } = openPicker();
    press(dialog, "Escape");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});

describe("DatePicker min/max handling", () => {
  it("marks out-of-range days aria-disabled but still focusable", () => {
    // A `disabled` attribute would make these unfocusable and trap arrow-key
    // navigation at the boundary, so the component uses aria-disabled instead.
    const { dialog } = openPicker({ value: "2026-03-17", min: "2026-03-10", max: "2026-03-20" });
    const outOfRange = dialog.querySelector('[data-iso="2026-03-25"]')!;
    expect(outOfRange.getAttribute("aria-disabled")).toBe("true");
    expect(outOfRange.hasAttribute("disabled")).toBe(false);

    press(dialog, "ArrowDown"); // 17 -> 24, past max
    expect(focusedISO()).toBe("2026-03-24");
  });

  it("does not select an out-of-range day", () => {
    const { dialog, onChange } = openPicker({ value: "2026-03-17", min: "2026-03-10", max: "2026-03-20" });
    fireEvent.click(dialog.querySelector('[data-iso="2026-03-25"]')!);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });
});

describe("DatePicker accessibility tree", () => {
  it("exposes grid semantics with named days", () => {
    const { dialog } = openPicker();
    expect(dialog.querySelector('[role="grid"]')).not.toBeNull();
    // 6 week rows + 1 header row
    expect(dialog.querySelectorAll('[role="row"]')).toHaveLength(7);
    expect(dialog.querySelectorAll('[role="columnheader"]')).toHaveLength(7);
    // The visible text is just "17" — the accessible name must carry the rest.
    expect(screen.getByRole("gridcell", { name: "17 March 2026" })).toBeInTheDocument();
    expect(dialog.querySelector('[aria-current="date"]')?.getAttribute("data-iso")).toBe("2026-03-17");
  });

  it("has no axe violations while open", async () => {
    const { dialog } = openPicker();
    // axe schedules its own work on timers, so it never resolves under the fake
    // clock this file installs for deterministic dates. The calendar has already
    // rendered against the pinned date by now, so handing back the real clock
    // here costs nothing.
    vi.useRealTimers();
    await expectNoA11yViolations(dialog);
  }, 20_000);
});
