/**
 * Lead rejection reasons.
 *
 * A closed vocabulary rather than free text alone, because the point of recording
 * why pre-sales declined a lead is to aggregate it: "how many did we turn down for
 * lack of capacity this quarter" is the question worth answering, and prose cannot
 * be counted. `reasonText` carries the specifics on top of the category.
 *
 * Lives in lib/ rather than beside the route because Next.js route files may only
 * export handlers and route config — exporting a constant from one fails the build
 * with an unhelpful type error. The decision route and the review UI both need
 * these, so they belong here.
 *
 * Client-safe: no server imports.
 */

export const REJECTION_REASONS = [
  "not-our-capability",
  "no-capacity",
  "budget-too-low",
  "timeline-unrealistic",
  "poor-strategic-fit",
  "unqualified-buyer",
  "incumbent-locked",
  "requirement-still-unclear",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const REJECTION_REASON_LABEL: Record<RejectionReason, string> = {
  "not-our-capability": "Outside our capability",
  "no-capacity": "No delivery capacity in the window",
  "budget-too-low": "Budget below viable threshold",
  "timeline-unrealistic": "Timeline not achievable",
  "poor-strategic-fit": "Poor strategic fit",
  "unqualified-buyer": "Buyer not qualified / no authority",
  "incumbent-locked": "Incumbent effectively locked in",
  "requirement-still-unclear": "Requirement still unclear after follow-up",
};
