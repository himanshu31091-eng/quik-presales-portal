/**
 * Shared Prisma select shape and formatter for /api/teams and /api/teams/[id].
 *
 * NOTE on standalone-vs-monorepo differences:
 *   - Standalone schema had `Team.members UserTeam[]`; shared schema names
 *     the same relation `userTeams`.
 *   - Standalone schema had `Team.apps TeamApp[]` for team→app linking;
 *     shared schema has no `TeamApp` model yet. Until the migration in
 *     MIGRATION_NOTES.md happens, `apps` is returned as an empty array.
 */

export const teamSelect = (orgId: string) =>
  ({
    id: true,
    name: true,
    slug: true,
    color: true,
    createdAt: true,
    _count: { select: { userTeams: true } },
    userTeams: {
      select: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            appAccess: {
              where: { orgId },
              select: { app: { select: { slug: true } } },
            },
          },
        },
      },
      take: 5,
    },
  } as const);

export function formatTeam(team: {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  createdAt: Date;
  _count: { userTeams: number };
  userTeams: Array<{
    user: {
      firstName: string;
      lastName: string;
      appAccess: Array<{ app: { slug: string } }>;
    };
  }>;
}) {
  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    color: team.color,
    memberCount: team._count.userTeams,
    members: team.userTeams.map((m) => ({
      name: `${m.user.firstName} ${m.user.lastName}`.trim(),
    })),
    // Team→app linking is pending TeamApp schema migration.
    apps: [] as Array<{ slug: string; name: string }>,
    createdAt: team.createdAt.toISOString(),
  };
}
