/**
 * Thin read-only chat queries against the central `@quikit/database` client.
 *
 * The standalone gateway imported `assertMembership` from `@quikit/auth` and
 * `listChannelIdsForMember` / `listMemberUserIdsForChannels` from
 * `@quikit/database`. Those importable helpers do NOT exist in the merged
 * monorepo — membership is done inline in `apps/quikchat/lib/server/*`. So the
 * gateway owns these queries, mirroring the app's query shapes exactly. The
 * gateway is read-only: it never writes a domain row.
 */
import { db } from "@quikit/database";

/**
 * Assert that `userId` may act on `channelId` within `orgId`. Resolves on
 * success; **throws** on failure (channel not in org, or no member row).
 *
 * Throwing (not returning a boolean) is deliberate and load-bearing: the socket
 * `join` handler is `try { await assertMembership(...); await socket.join(...) }
 * catch { Forbidden }`. A boolean-returning helper ported into that shape would
 * let a non-member fall through to `socket.join` — an authz bypass. A plain
 * `Error` is fine; the `join` catch is type-agnostic (we intentionally do NOT
 * import the app's `HttpError`). Mirrors `apps/quikchat/lib/authz.ts`.
 */
export async function assertMembership(
  orgId: string,
  channelId: string,
  userId: string,
): Promise<void> {
  const channel = await db.qcChannel.findUnique({ where: { id: channelId } });
  if (!channel || channel.orgId !== orgId) {
    throw new Error("forbidden");
  }
  const member = await db.qcChannelMember.findUnique({
    where: { orgId_channelId_userId: { orgId, channelId, userId } },
  });
  if (!member) {
    throw new Error("forbidden");
  }
}

/**
 * Channel ids a user is a member of (auto-join on connect). Org-scoped.
 * Mirrors the membership lookup in `channels.service.ts#listForUser`.
 */
export async function listChannelIdsForMember(orgId: string, userId: string): Promise<string[]> {
  const rows = await db.qcChannelMember.findMany({
    where: { orgId, userId },
    select: { channelId: true },
  });
  return rows.map((r) => r.channelId);
}

/**
 * Distinct member user-ids across a set of channels (presence snapshot).
 * Mirrors the member fan-out in `channels.service.ts#discover`.
 */
export async function listMemberUserIdsForChannels(
  orgId: string,
  channelIds: string[],
): Promise<string[]> {
  if (channelIds.length === 0) return [];
  const rows = await db.qcChannelMember.findMany({
    where: { orgId, channelId: { in: channelIds } },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}
