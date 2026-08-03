import { DEFAULT_CURRENCY, exponentOf } from "@/lib/currency/currencies";

/**
 * Money handling for cost estimates.
 *
 * Everything is BigInt **minor units** end to end — paise for INR, cents for USD,
 * whole yen for JPY, which has no minor unit at all. Floats are never used for
 * money: a rate of ₹1,234.56 stored as a float and multiplied by a fractional
 * quantity drifts, and an estimate that doesn't foot is worse than no estimate.
 *
 * The number of minor units per major unit is NOT always 100, so anything
 * crossing between the two takes the estimate's `currency` and reads the exponent
 * from it. Hardcoding /100 misreported JPY by 100x and KWD by 10x.
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

/**
 * Minor units → major units as a Number, for spreadsheet cells only.
 *
 * The divisor comes from the currency, not a hardcoded 100: an estimate priced in
 * JPY has no minor unit, so ¥1,000,000 is stored as 1000000 and dividing by 100
 * would export it as ¥10,000. Pass the estimate's own `currency`.
 */
export function minorToMajorNumber(minor: bigint, currency = DEFAULT_CURRENCY): number {
  return Number(minor) / 10 ** exponentOf(currency);
}

/**
 * Human-readable, e.g. 123456789n + INR → "1,234,567.89".
 *
 * Stays BigInt-only — no float division — so a large estimate cannot lose
 * precision on its way to the screen. Decimal places follow the currency, so a
 * JPY total renders as "1,000,000" and a KWD one as "1,234.567".
 */
export function formatMinor(minor: bigint, currency = DEFAULT_CURRENCY): string {
  const exponent = exponentOf(currency);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;

  const divisor = 10n ** BigInt(exponent);
  const major = abs / divisor;
  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = negative ? "-" : "";

  if (exponent === 0) return `${sign}${grouped}`;

  const fraction = (abs % divisor).toString().padStart(exponent, "0");
  return `${sign}${grouped}.${fraction}`;
}
