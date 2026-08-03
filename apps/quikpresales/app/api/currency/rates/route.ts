import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { okSerialized } from "@/lib/api/responses";
import { getRates } from "@/lib/currency/rates";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/currency/currencies";

/**
 * GET /api/currency/rates — current exchange rates plus the currency list the
 * pickers offer.
 *
 * Behind `withOrgAuth` even though rates are not tenant data: this is an
 * authenticated app, and leaving an endpoint that makes an outbound HTTP call
 * open to anonymous traffic is a free amplification vector.
 *
 * `source` is either "live" or "fallback" and the UI surfaces it, so nobody reads
 * a converted pipeline figure without knowing whether the rate behind it is
 * current.
 */
export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async () => {
  const { base, rates, asOf, source } = await getRates();

  // Trim the 166-currency feed to what the pickers offer, so the payload stays
  // small and the client cannot pick a currency we have no exponent for.
  const offered: Record<string, number> = {};
  for (const { code } of CURRENCIES) {
    const rate = rates[code];
    if (typeof rate === "number" && Number.isFinite(rate)) offered[code] = rate;
  }

  return okSerialized({
    base,
    asOf,
    source,
    rates: offered,
    currencies: CURRENCIES,
    defaultCurrency: DEFAULT_CURRENCY,
  });
});
