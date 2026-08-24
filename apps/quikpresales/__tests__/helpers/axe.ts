import { axe } from "vitest-axe";
import type { AxeResults, Result } from "axe-core";

/**
 * Shared axe runner for component accessibility tests.
 *
 * Scope note: axe in jsdom checks the accessibility *tree* — roles, names,
 * states, label association, ARIA validity. It cannot check colour contrast
 * (jsdom computes no layout and resolves no Tailwind classes) and it cannot
 * verify keyboard behaviour. Those two remain manual, so a green run here is
 * not a claim of WCAG conformance — it is a regression guard on the classes of
 * defect axe can actually see.
 */

/** Rules axe cannot evaluate meaningfully under jsdom, so they'd only add noise. */
const JSDOM_UNSUPPORTED = ["color-contrast"] as const;

export interface A11yOptions {
  /** Extra rule ids to disable for this specific case, each with a reason. */
  disable?: string[];
}

export async function runAxe(container: Element, options: A11yOptions = {}): Promise<AxeResults> {
  const off = [...JSDOM_UNSUPPORTED, ...(options.disable ?? [])];
  return (await axe(container, {
    rules: Object.fromEntries(off.map((id) => [id, { enabled: false }])),
  })) as AxeResults;
}

/** Compact, readable failure text — axe's own output is far too verbose to assert on. */
export function formatViolations(violations: Result[]): string {
  if (violations.length === 0) return "no violations";
  return violations
    .map((v) => {
      const targets = v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(", ");
      return `[${v.impact ?? "unknown"}] ${v.id}: ${v.help} → ${targets}`;
    })
    .join("\n");
}

/** Assert zero axe violations, with a message that names what actually failed. */
export async function expectNoA11yViolations(container: Element, options?: A11yOptions) {
  const results = await runAxe(container, options);
  if (results.violations.length > 0) {
    throw new Error(`axe found ${results.violations.length} violation(s):\n${formatViolations(results.violations)}`);
  }
}
