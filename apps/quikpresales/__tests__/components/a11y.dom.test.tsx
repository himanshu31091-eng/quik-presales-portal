// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Select,
  Checkbox,
  Field,
  Textarea,
} from "@quikit/ui";
import { expectNoA11yViolations, runAxe } from "../helpers/axe";
import {
  PageHeader,
  Panel,
  StatusPill,
  TableShell,
  EmptyRow,
  Loading,
  ErrorNote,
} from "@/components/ui-kit";

/**
 * Accessibility regression tests.
 *
 * These lock in the fixes from the WCAG 2.1 AA remediation so they cannot
 * silently regress. Two layers:
 *   1. axe over rendered markup — catches missing names/roles/labels.
 *   2. explicit assertions on the specific attributes each fix added, because
 *      axe does not fail on a *missing* aria-labelledby if the dialog has some
 *      other accessible name, and we want the exact wiring pinned.
 *
 * Not covered here (documented so the gap is visible, not implied away):
 * colour contrast (no layout in jsdom) and keyboard interaction sequences.
 */

// This project runs Vitest without `globals: true`, so React Testing Library
// cannot auto-register its own afterEach(cleanup) — without this, mounted DOM
// accumulates across cases in the file and queries match elements from earlier
// tests.
afterEach(cleanup);

describe("shared Modal accessibility", () => {
  it("exposes dialog semantics with an accessible name from its title", async () => {
    const { container } = render(
      <Modal open onOpenChange={() => {}}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>New Engagement</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <Input label="Title" />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary">Cancel</Button>
            <Button>Create</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    // The accessible name must resolve through aria-labelledby to the title.
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe("New Engagement");

    // Panel is programmatically focusable so focus can be moved into it.
    expect(dialog).toHaveAttribute("tabindex", "-1");

    await expectNoA11yViolations(container);
  });

  it("gives the icon-only close button a name", async () => {
    render(
      <Modal open onOpenChange={() => {}}>
        <ModalContent>
          <ModalHeader onClose={() => {}}>
            <ModalTitle>Bulk Import Leads</ModalTitle>
          </ModalHeader>
          <ModalBody>Body</ModalBody>
        </ModalContent>
      </Modal>,
    );
    expect(screen.getByRole("button", { name: /close modal/i })).toBeInTheDocument();
  });
});

describe("form control labelling", () => {
  it("binds Input, Select and Checkbox labels to their controls", async () => {
    const { container } = render(
      <form>
        <Input label="Estimated revenue" type="number" />
        <Select label="Currency" options={[{ value: "INR", label: "INR" }]} />
        <Checkbox label="My items only" />
      </form>,
    );

    // getByLabelText only resolves when the label is programmatically associated.
    expect(screen.getByLabelText("Estimated revenue")).toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toBeInTheDocument();
    expect(screen.getByLabelText("My items only")).toBeInTheDocument();

    await expectNoA11yViolations(container);
  });

  it("gives two same-labelled Selects distinct ids", () => {
    // Regression: the fallback id was a slug of the label, so both rendered
    // id="status" and the label bound only to the first.
    render(
      <form>
        <Select label="Status" options={[{ value: "a", label: "A" }]} />
        <Select label="Status" options={[{ value: "b", label: "B" }]} />
      </form>,
    );
    const selects = screen.getAllByLabelText("Status");
    expect(selects).toHaveLength(2);
    expect(selects[0].id).not.toBe(selects[1].id);
    expect(selects[0].id).toBeTruthy();
  });

  it("associates an Input's label without the caller passing an id", async () => {
    // Regression: htmlFor and id were both the raw `id` prop, so a caller that
    // passed only `label` produced htmlFor={undefined} / id={undefined} and the
    // label named nothing. axe rated this `critical`.
    const { container } = render(<Input label="Estimated revenue" type="number" />);
    const input = screen.getByLabelText("Estimated revenue");
    expect(input.id).toBeTruthy();
    expect(container.querySelector("label")).toHaveAttribute("for", input.id);
    await expectNoA11yViolations(container);
  });

  it("gives two same-labelled Inputs distinct ids", () => {
    render(
      <form>
        <Input label="Title" />
        <Input label="Title" />
      </form>,
    );
    const inputs = screen.getAllByLabelText("Title");
    expect(inputs).toHaveLength(2);
    expect(inputs[0].id).not.toBe(inputs[1].id);
  });

  it("a Textarea needs an explicit name — bare usage is a violation", async () => {
    // Textarea has no `label` prop, so call sites must supply htmlFor/id or
    // aria-label. This documents the contract and proves axe catches a miss.
    //
    // Deliberately no `placeholder`: axe accepts a placeholder as a last-resort
    // accessible name, so a placeholder-only textarea does NOT trip the `label`
    // rule even though placeholder-as-label is bad practice (it vanishes on
    // input). Relying on axe alone would have hidden that.
    const bare = render(<Textarea rows={2} />);
    const results = await runAxe(bare.container);
    expect(results.violations.map((v) => v.id)).toContain("label");
    bare.unmount();

    // With aria-label it passes — the pattern used at the app's call sites.
    const named = render(<Textarea rows={2} aria-label="Our response to this requirement" />);
    expect(screen.getByLabelText("Our response to this requirement")).toBeInTheDocument();
    await expectNoA11yViolations(named.container);
  });

  it("conveys Field's required state beyond colour alone", async () => {
    const { container } = render(
      <Field label="Requirement" required>
        <input type="text" />
      </Field>,
    );

    // aria-required on the control, not just a red asterisk.
    const input = screen.getByLabelText(/requirement/i);
    expect(input).toHaveAttribute("aria-required", "true");
    // The visually-hidden text is part of the accessible name.
    expect(screen.getByLabelText(/required/i)).toBe(input);

    await expectNoA11yViolations(container);
  });
});

describe("status messages announce themselves", () => {
  it("Loading is a polite live region", () => {
    render(<Loading />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Loading");
  });

  it("ErrorNote is an alert", () => {
    render(<ErrorNote error={new Error("Pipeline fetch failed")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Pipeline fetch failed");
  });
});

describe("page structure primitives", () => {
  it("PageHeader renders the page title as the sole h1", async () => {
    const { container } = render(
      <PageHeader title="Engagements" subtitle="Every opportunity pre-sales is supporting" />,
    );
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Engagements");
    await expectNoA11yViolations(container);
  });

  it("Panel titles are real h2 headings, one level below the page h1", async () => {
    const { container } = render(
      <div>
        <PageHeader title="Reports" />
        <Panel title="Pipeline by stage">
          <p>content</p>
        </Panel>
      </div>,
    );
    expect(container.querySelector("h2")).toHaveTextContent("Pipeline by stage");
    await expectNoA11yViolations(container);
  });

  it("StatusPill pairs its colour with a text label", async () => {
    // WCAG 1.4.1: state must not be conveyed by colour alone.
    const { container } = render(
      <div>
        <StatusPill status="won" />
        <StatusPill status="gap" label="2 blockers open" />
      </div>,
    );
    expect(screen.getByText("won")).toBeInTheDocument();
    expect(screen.getByText("2 blockers open")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("a populated table has no axe violations", async () => {
    const { container } = render(
      <TableShell headers={["Title", "Stage", "Value"]}>
        <tr>
          <td>Acme ERP</td>
          <td>
            <StatusPill status="proposal" label="Proposal" />
          </td>
          <td>₹8,50,000</td>
        </tr>
      </TableShell>,
    );
    await expectNoA11yViolations(container);
  });

  it("an empty table state has no axe violations", async () => {
    const { container } = render(
      <TableShell headers={["Title", "Stage"]}>
        <EmptyRow colSpan={2} message="No engagements match these filters." />
      </TableShell>,
    );
    await expectNoA11yViolations(container);
  });
});
