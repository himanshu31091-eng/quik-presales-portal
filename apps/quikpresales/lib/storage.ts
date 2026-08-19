import { put } from "@vercel/blob";

/**
 * Vercel Blob storage. Metadata rows live in PsDocument; bytes never touch
 * Postgres.
 *
 * Server-upload (the browser POSTs the file to us, we forward it) is capped by
 * Vercel's ~4.5 MB request body limit. That covers typical proposals and most
 * RFPs. Larger RFPs need the client-upload token flow, which requires a
 * webhook callback — deferred rather than half-built.
 */

export const MAX_UPLOAD_BYTES = 4_500_000;

export const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "application/zip",
]);

export const DOCUMENT_CATEGORIES = [
  "rfp",
  "proposal",
  "sow",
  "architecture",
  "demo-script",
  "reference",
  "other",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/**
 * Strip anything that could escape the intended key prefix or confuse the CDN.
 * The org id is always the first path segment, so a crafted filename must not
 * be able to climb out of it.
 */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  return base.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
}

/** Tenant-scoped blob key: orgId first so a download check can verify prefix. */
export function buildBlobKey(orgId: string, engagementId: string, filename: string): string {
  return `${orgId}/${engagementId}/${Date.now()}-${sanitizeFilename(filename)}`;
}

/**
 * True when `blobUrl` belongs to `orgId`. Called before handing a stored URL
 * back to a client so a leaked or guessed document id cannot serve another
 * tenant's file.
 */
export function isOwnedByOrg(blobUrl: string, orgId: string): boolean {
  try {
    return new URL(blobUrl).pathname.replace(/^\/+/, "").startsWith(`${orgId}/`);
  } catch {
    return false;
  }
}

export async function uploadDocument(
  orgId: string,
  engagementId: string,
  file: File,
): Promise<{ url: string; key: string }> {
  const key = buildBlobKey(orgId, engagementId, file.name);
  const blob = await put(key, file, { access: "public", addRandomSuffix: false });
  return { url: blob.url, key };
}

/** Blob key for a knowledge asset attachment — not engagement-scoped. */
export function buildKnowledgeBlobKey(orgId: string, filename: string): string {
  return `${orgId}/knowledge/${Date.now()}-${sanitizeFilename(filename)}`;
}

export async function uploadKnowledgeAsset(
  orgId: string,
  file: File,
): Promise<{ url: string; key: string }> {
  const key = buildKnowledgeBlobKey(orgId, file.name);
  const blob = await put(key, file, { access: "public", addRandomSuffix: false });
  return { url: blob.url, key };
}
