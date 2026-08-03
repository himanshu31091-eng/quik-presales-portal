"use client";

import { formatMinorUnits } from "@/lib/currency/currencies";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";

/**
 * Thin client for this app's `{ success, data }` envelope.
 *
 * Every route returns the same shape, so unwrapping it once here means no
 * component has to remember to check `success` — a failed request throws and
 * React Query surfaces it as `error`.
 */

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const json = (await res.json().catch(() => null)) as
    | { success: boolean; data?: T; error?: string }
    | null;

  if (!res.ok || !json?.success) {
    throw new ApiError(json?.error ?? `Request failed (${res.status})`, res.status);
  }
  return json.data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** GET with sensible defaults for this app's read-mostly screens. */
export function useApiQuery<T>(key: QueryKey, path: string, enabled = true) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => api.get<T>(path),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Mutation that invalidates the given key prefixes on success, so lists and
 * detail views refresh without each caller wiring up its own invalidation.
 */
export function useApiMutation<TData, TVars>(
  fn: (vars: TVars) => Promise<TData>,
  invalidate: QueryKey[] = [],
) {
  const qc = useQueryClient();
  return useMutation<TData, Error, TVars>({
    mutationFn: fn,
    onSuccess: () => {
      invalidate.forEach((key) => void qc.invalidateQueries({ queryKey: key }));
    },
  });
}

/** Download a file from a POST endpoint that streams bytes back. */
export async function downloadFile(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(json?.error ?? `Export failed (${res.status})`, res.status);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? "download";

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Minor-units string → display string, e.g. "45000000" + INR → "₹4,50,000".
 *
 * Delegates to the currency module so the divisor comes from the currency's own
 * exponent. This used to divide by 100 unconditionally, which reported every
 * zero-decimal currency (JPY, KRW) as 1/100th of its real value and every
 * three-decimal one (KWD, BHD) as 10x. Callers that already know the record's
 * currency get the right answer by passing it; the default stays INR.
 *
 * For a figure that should be shown in the *reader's* chosen currency rather
 * than the record's, use `formatConverted` from `useDisplayCurrency` instead.
 */
export function formatMoney(minorUnits: string | null | undefined, currency = "INR"): string {
  return formatMinorUnits(minorUnits, currency);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
