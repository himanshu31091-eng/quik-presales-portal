"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApiQuery } from "@/lib/api-client";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  formatMinorUnits,
  sumInCurrency,
  type CurrencyMeta,
} from "@/lib/currency/currencies";

interface RatesResponse {
  base: string;
  asOf: string;
  source: "live" | "fallback";
  rates: Record<string, number>;
  currencies: CurrencyMeta[];
  defaultCurrency: string;
}

const STORAGE_KEY = "quikpresales.displayCurrency";

/**
 * The currency the user is viewing figures in, plus the helpers to render them.
 *
 * The choice is per-user and cosmetic, so it lives in localStorage rather than on
 * the server — no round trip, no schema change, and it survives a reload. Stored
 * amounts are never rewritten; conversion happens at display time only, so the
 * underlying record always keeps the currency it was actually sold in.
 */
export function useDisplayCurrency() {
  const [displayCurrency, setDisplayCurrencyState] = useState(DEFAULT_CURRENCY);

  // Read after mount: localStorage does not exist during SSR, and seeding state
  // from it directly would make the server and client markup disagree.
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && CURRENCIES.some((c) => c.code === saved)) setDisplayCurrencyState(saved);
  }, []);

  const setDisplayCurrency = useCallback((code: string) => {
    setDisplayCurrencyState(code);
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // Private browsing or a full quota — the choice just won't persist.
    }
  }, []);

  const { data } = useApiQuery<RatesResponse>(["currency", "rates"], "/api/currency/rates");

  // Memoised: these are `??` fallbacks, so without it a fresh object identity
  // every render invalidates the callbacks below and re-renders every consumer.
  const rates = useMemo(() => data?.rates ?? {}, [data?.rates]);
  const currencies = useMemo(() => data?.currencies ?? [...CURRENCIES], [data?.currencies]);

  const displayExponent = useMemo(
    () => currencies.find((c) => c.code === displayCurrency)?.exponent ?? 2,
    [currencies, displayCurrency],
  );

  /** Render one amount that is already in `displayCurrency`. */
  const format = useCallback(
    (minorUnits: string | null | undefined, currency: string = displayCurrency) =>
      formatMinorUnits(minorUnits, currency),
    [displayCurrency],
  );

  /**
   * Render an amount stored in `from`, converted into the display currency.
   * Falls back to the original currency when no rate is available, rather than
   * showing a wrong number.
   */
  const formatConverted = useCallback(
    (minorUnits: string | null | undefined, from: string | null | undefined) => {
      const source = (from ?? DEFAULT_CURRENCY).toUpperCase();
      if (!minorUnits) return "—";
      if (source === displayCurrency) return formatMinorUnits(minorUnits, source);

      const { totalMajor, unconverted } = sumInCurrency(
        [{ currency: source, minorUnits }],
        displayCurrency,
        rates,
      );
      if (unconverted.length > 0) return formatMinorUnits(minorUnits, source);

      return formatMinorUnits(
        String(Math.round(totalMajor * 10 ** displayExponent)),
        displayCurrency,
      );
    },
    [displayCurrency, rates, displayExponent],
  );

  /** Total several per-currency buckets into the display currency. */
  const formatTotal = useCallback(
    (buckets: { currency: string | null; minorUnits: string | null }[] | undefined) => {
      if (!buckets || buckets.length === 0) return formatMinorUnits("0", displayCurrency);

      const { totalMajor, unconverted } = sumInCurrency(buckets, displayCurrency, rates);
      const text = formatMinorUnits(String(Math.round(totalMajor * 10 ** displayExponent)), displayCurrency);

      // Say so rather than under-reporting silently.
      return unconverted.length > 0 ? `${text} + ${unconverted.join(", ")}` : text;
    },
    [displayCurrency, rates, displayExponent],
  );

  return {
    displayCurrency,
    setDisplayCurrency,
    currencies,
    rates,
    /** "live" or "fallback" — surfaced so a stale rate is never presented as current. */
    rateSource: data?.source,
    rateAsOf: data?.asOf,
    format,
    formatConverted,
    formatTotal,
  };
}
