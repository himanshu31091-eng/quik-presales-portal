/**
 * Live exchange rates.
 *
 * Server-only. Rates are fetched from a public feed, cached in module scope, and
 * fall back to a bundled snapshot if the feed is unreachable — so a dashboard
 * never fails to render because a third party is down, and never shows a
 * converted figure without saying how fresh the rate behind it is.
 *
 * Deliberately not stored in the database: a rates table means editing
 * packages/database, which app teams cannot do. Module-scope caching is the right
 * fit anyway — rates change daily, warm lambdas reuse the cache, and a cold start
 * costs one HTTP call.
 */

/** Rates are quoted against this base: `rates[X]` = X per 1 USD. */
export const RATE_BASE = "USD";

const FEED_URL = `https://open.er-api.com/v6/latest/${RATE_BASE}`;

/** Rates move daily; an hour keeps a busy dashboard to one call per instance. */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Don't let a hanging feed hold a request open. */
const FETCH_TIMEOUT_MS = 4000;

export interface RateSet {
  base: string;
  rates: Record<string, number>;
  /** When the rates were published (feed) or bundled (fallback). */
  asOf: string;
  source: "live" | "fallback";
}

/**
 * Bundled fallback, captured 2026-08-03. Only the currencies offered in pickers.
 *
 * Deliberately reported as `source: "fallback"` with its own `asOf`, so the UI can
 * mark converted figures as approximate. Showing a stale number *labelled* stale
 * is far better than showing nothing on a leadership dashboard — and far better
 * than showing it unlabelled.
 */
const FALLBACK: RateSet = {
  base: RATE_BASE,
  asOf: "2026-08-03",
  source: "fallback",
  rates: {
    USD: 1,
    INR: 95.48,
    EUR: 0.8667,
    GBP: 0.7417,
    AED: 3.6725,
    SAR: 3.75,
    AUD: 1.5106,
    CAD: 1.3652,
    CHF: 0.8093,
    SGD: 1.2905,
    ZAR: 17.81,
    JPY: 158.02,
    KRW: 1381.5,
    KWD: 0.3064,
    BHD: 0.376,
  },
};

let cache: { value: RateSet; fetchedAt: number } | null = null;

/** Reset the module cache. Tests only. */
export function __resetRatesCache(): void {
  cache = null;
}

function isFresh(entry: { fetchedAt: number } | null): boolean {
  return entry !== null && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

/**
 * Current rates, cached. Never throws and never returns an empty set — on any
 * failure the caller gets the bundled snapshot flagged as `fallback`.
 */
export async function getRates(): Promise<RateSet> {
  if (isFresh(cache)) return cache!.value;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(FEED_URL, {
      signal: controller.signal,
      // Next would otherwise cache this route-side and defeat the TTL above.
      cache: "no-store",
    }).finally(() => clearTimeout(timer));

    if (!response.ok) throw new Error(`feed returned ${response.status}`);

    const body = (await response.json()) as {
      result?: string;
      base_code?: string;
      time_last_update_utc?: string;
      rates?: Record<string, number>;
    };

    if (body.result !== "success" || !body.rates || typeof body.rates.USD !== "number") {
      throw new Error("feed payload was not usable");
    }

    const value: RateSet = {
      base: body.base_code ?? RATE_BASE,
      rates: body.rates,
      asOf: body.time_last_update_utc ?? new Date().toISOString(),
      source: "live",
    };

    cache = { value, fetchedAt: Date.now() };
    return value;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console -- a silent fall back to stale rates on a
    // money-facing screen is worth a log line.
    console.error(`[currency] live rates unavailable, using bundled snapshot: ${message}`);

    // Cache the fallback briefly too, so one outage doesn't mean an outbound
    // request on every single dashboard load.
    cache = { value: FALLBACK, fetchedAt: Date.now() - CACHE_TTL_MS / 2 };
    return FALLBACK;
  }
}
