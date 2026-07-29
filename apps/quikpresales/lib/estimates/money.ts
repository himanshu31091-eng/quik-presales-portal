/**
 * Money handling for cost estimates.
 *
 * Everything is BigInt paise (the smallest currency unit) end to end. Floats
 * are never used for money — a rate of ₹1,234.56 stored as a float and
 * multiplied by a fractional quantity drifts, and an estimate that doesn't
 * foot is worse than no estimate.
 *
 * `quantity` IS a float (0.5 days, 1.5 FTE), so line amounts are computed as
 * `round(rate * quantity)` with the rounding done once, in one place.
 */

/** Compute a line amount in paise. Always server-side — never trust a client total. */
export function computeLineAmount(ratePaise: bigint, quantity: number): bigint {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0n;

  // Scale the float quantity to an integer before touching BigInt, so the only
  // rounding is this one deliberate step rather than an implicit truncation.
  const SCALE = 10_000n;
  const scaledQty = BigInt(Math.round(quantity * Number(SCALE)));
  const scaled = ratePaise * scaledQty;

  // Round half-up on the final division.
  const half = SCALE / 2n;
  return (scaled + half) / SCALE;
}

/** Sum line amounts. */
export function sumAmounts(amounts: bigint[]): bigint {
  return amounts.reduce((acc, a) => acc + a, 0n);
}

/** Parse a client-supplied paise string. Rejects anything non-integral. */
export function parsePaise(value: string): bigint | null {
  if (!/^\d{1,18}$/.test(value)) return null;
  return BigInt(value);
}

/** Paise → major units as a Number, for spreadsheet cells only. */
export function paiseToMajorNumber(paise: bigint): number {
  return Number(paise) / 100;
}

/** Human-readable, e.g. 123456789n → "1,234,567.89". */
export function formatPaise(paise: bigint): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const major = abs / 100n;
  const minor = abs % 100n;
  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}.${minor.toString().padStart(2, "0")}`;
}
