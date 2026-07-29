/**
 * Room names are the single source of truth for fan-out scoping. The `org:`
 * prefix makes cross-tenant delivery impossible even on a logic bug, because a
 * socket authenticated for org A is only ever joined to `org:A:*` rooms.
 */
export function channelRoom(orgId: string, channelId: string): string {
  return `org:${orgId}:channel:${channelId}`;
}

export function userRoom(orgId: string, userId: string): string {
  return `org:${orgId}:user:${userId}`;
}
