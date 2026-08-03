"use client";

import { useApiQuery } from "@/lib/api-client";
import { INDUSTRIES, TECHNOLOGIES } from "@/lib/library/constants";

interface Vocabulary {
  industries: string[];
  technologies: string[];
}

/**
 * The org's open vocabularies — seed suggestions merged with every value the org
 * has actually used. See app/api/vocabulary/route.ts.
 *
 * Falls back to the compile-time constants while loading or if the request
 * fails, so a form is never left with an empty suggestion list. React Query
 * dedupes across the several fields that call this on one page.
 */
export function useVocabulary(): Vocabulary & { isLoading: boolean } {
  const { data, isLoading } = useApiQuery<Vocabulary>(["vocabulary"], "/api/vocabulary");

  return {
    industries: data?.industries ?? [...INDUSTRIES],
    technologies: data?.technologies ?? [...TECHNOLOGIES],
    isLoading,
  };
}

/** Query key to invalidate after saving a record that may introduce a new term. */
export const VOCABULARY_KEY = ["vocabulary"] as const;
