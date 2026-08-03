/**
 * Currency metadata and minor-unit arithmetic.
 *
 * Money is stored as an integer count of **minor units** in `estRevenue`
 * (BigInt). For INR that is paise, for USD cents — but the exponent is not 2
 * everywhere: JPY, KRW and several others have no minor unit at all, so ¥1000 is
 * stored as 1000, not 100000. Dividing by 100 unconditionally, which the app used
 * to do, silently misreports those currencies by 100x.
 *
 * Client-safe: no server imports, so forms and the dashboard can both use it.
 */

export interface CurrencyMeta {
  code: string;
  name: string;
  /** Decimal places. 2 for most, 0 for JPY/KRW/VND, 3 for some Gulf dinars. */
  exponent: number;
}

/**
 * The currencies offered in pickers. Any ISO-4217 code the rates feed knows will
 * still *work* if it reaches the API — this list drives the dropdown and supplies
 * the exponent, which the rates feed does not provide.
 *
 * Ordered with the ones MoreYeahs actually sells in first, then alphabetically.
 */
export const CURRENCIES: readonly CurrencyMeta[] = [
  { code: "INR", name: "Indian Rupee", exponent: 2 },
  { code: "USD", name: "US Dollar", exponent: 2 },
  { code: "EUR", name: "Euro", exponent: 2 },
  { code: "GBP", name: "Pound Sterling", exponent: 2 },
  { code: "AED", name: "UAE Dirham", exponent: 2 },
  { code: "SAR", name: "Saudi Riyal", exponent: 2 },
  { code: "AUD", name: "Australian Dollar", exponent: 2 },
  { code: "CAD", name: "Canadian Dollar", exponent: 2 },
  { code: "CHF", name: "Swiss Franc", exponent: 2 },
  { code: "SGD", name: "Singapore Dollar", exponent: 2 },
  { code: "ZAR", name: "South African Rand", exponent: 2 },
  { code: "JPY", name: "Japanese Yen", exponent: 0 },
  { code: "KRW", name: "South Korean Won", exponent: 0 },
  { code: "KWD", name: "Kuwaiti Dinar", exponent: 3 },
  { code: "BHD", name: "Bahraini Dinar", exponent: 3 },
];

export const DEFAULT_CURRENCY = "INR";

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

/**
 * Decimal places for a currency. Unknown codes fall back to 2, which is right
 * for the overwhelming majority — a wrong guess here misformats, it does not
 * corrupt stored data, because the exponent is applied consistently on the way
 * in and out.
 */
export function exponentOf(currency: string | null | undefined): number {
  return BY_CODE.get((currency ?? DEFAULT_CURRENCY).toUpperCase())?.exponent ?? 2;
}

export function currencyName(code: string): string {
  return BY_CODE.get(code.toUpperCase())?.name ?? code.toUpperCase();
}

export function isKnownCurrency(code: string): boolean {
  return BY_CODE.has(code.toUpperCase());
}

/** Major units (what a user types) → integer minor units (what we store). */
export function toMinorUnits(amount: number, currency: string): bigint {
  const factor = 10 ** exponentOf(currency);
  return BigInt(Math.round(amount * factor));
}

/**
 * Minor units → major units as a number, for formatting and arithmetic.
 *
 * Accepts the string form the API returns for BigInt columns. Returns 0 for
 * anything unparseable rather than NaN, so a bad row cannot poison a total.
 */
export function fromMinorUnits(minor: string | bigint | null | undefined, currency: string): number {
  if (minor === null || minor === undefined || minor === "") return 0;
  const asNumber = typeof minor === "bigint" ? Number(minor) : Number(minor);
  if (!Number.isFinite(asNumber)) return 0;
  return asNumber / 10 ** exponentOf(currency);
}

/**
 * Format minor units for display, honouring the currency's own decimal places.
 *
 * Whole amounts are shown without decimals — a pipeline figure reads better as
 * ₹4,50,000 than ₹4,50,000.00 — but fractional amounts keep them so a converted
 * value is not silently rounded away on screen.
 */
export function formatMinorUnits(
  minor: string | bigint | null | undefined,
  currency: string = DEFAULT_CURRENCY,
  options: { locale?: string } = {},
): string {
  if (minor === null || minor === undefined || minor === "") return "—";
  const value = fromMinorUnits(minor, currency);
  const exponent = exponentOf(currency);
  const hasFraction = Math.abs(value % 1) > Number.EPSILON;

  try {
    return new Intl.NumberFormat(options.locale ?? "en-IN", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: hasFraction ? exponent : 0,
    }).format(value);
  } catch {
    // Intl throws on a code it does not recognise; show the number with the code
    // rather than crashing the page.
    return `${currency.toUpperCase()} ${value.toLocaleString()}`;
  }
}

/**
 * Convert between currencies using rates quoted against a single base.
 *
 * `rates[X]` is "how many X per 1 base". Cross-rate is therefore
 * amount / rates[from] * rates[to]. Returns null when either leg is missing, so
 * callers can show "unavailable" instead of a silently wrong number.
 */
export function convert(
  amountMajor: number,
  from: string,
  to: string,
  rates: Record<string, number>,
): number | null {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return amountMajor;

  const fromRate = rates[f];
  const toRate = rates[t];
  if (!fromRate || !toRate || !Number.isFinite(fromRate) || !Number.isFinite(toRate)) return null;

  return (amountMajor / fromRate) * toRate;
}

/**
 * Sum amounts held in several currencies into one target currency.
 *
 * This is the operation the dashboard needs and previously did not do: it summed
 * the raw minor-unit column across every engagement regardless of currency,
 * which adds paise to cents and yields a meaningless figure the moment a second
 * currency exists.
 *
 * Buckets whose currency cannot be converted are reported in `unconverted` so
 * the UI can say so rather than quietly under-reporting the pipeline.
 */
export function sumInCurrency(
  buckets: { currency: string | null; minorUnits: string | bigint | null }[],
  target: string,
  rates: Record<string, number>,
): { totalMajor: number; unconverted: string[] } {
  let totalMajor = 0;
  const unconverted = new Set<string>();

  for (const bucket of buckets) {
    const currency = (bucket.currency ?? DEFAULT_CURRENCY).toUpperCase();
    const major = fromMinorUnits(bucket.minorUnits, currency);
    if (major === 0) continue;

    const converted = convert(major, currency, target, rates);
    if (converted === null) {
      unconverted.add(currency);
      continue;
    }
    totalMajor += converted;
  }

  return { totalMajor, unconverted: [...unconverted] };
}
