import { NextResponse } from "next/server";
import { withMemberAuth } from "@/lib/api/withMemberAuth";
import { db } from "@/lib/db";

export const GET = withMemberAuth(async ({ orgId, userId, role }) => {
  const [membership, appAccess, org] = await Promise.all([
    db.orgMember.findFirst({
      where: { userId, orgId },
      include: { user: { select: { firstName: true, lastName: true } } },
    }),
    db.userAppAccess.findMany({
      where: { userId, orgId },
      include: {
        app: { select: { id: true, name: true, slug: true, baseUrl: true, iconUrl: true } },
      },
    }),
    db.org.findUnique({
      where: { id: orgId },
      select: { name: true, logoUrl: true, brandColor: true },
    }),
  ]);

  const name = membership
    ? `${membership.user.firstName} ${membership.user.lastName}`.trim()
    : "";

  return NextResponse.json({
    success: true,
    data: {
      orgName: org?.name ?? "",
      orgLogoUrl: org?.logoUrl ?? null,
      member: { name, role },
      apps: appAccess.map((a) => ({
        id: a.app.id,
        name: a.app.name,
        slug: a.app.slug,
        baseUrl: resolveBaseUrl(a.app.slug, a.app.baseUrl) || "#",
        iconUrl: a.app.iconUrl ?? null,
        role: a.role,
      })),
    },
  });
});

// App.baseUrl in the DB holds PRODUCTION URLs, so resolve the target the same
// way the switcher/launcher do: per-app env override → DB baseUrl → localhost
// dev fallback. Without this, a local-dev member link points at prod.
const envBaseUrls: Record<string, string | undefined> = {
  quikit: process.env.QUIKIT_URL,
  auth: process.env.NEXT_PUBLIC_AUTH_URL,
  admin: process.env.ADMIN_URL,
  quikscale: process.env.QUIKSCALE_URL,
  quikasset: process.env.QUIKASSET_URL,
  quiktrack: process.env.QUIKTRACK_URL,
  quikvc: process.env.QUIKVC_URL,
  quikinfra: process.env.QUIKINFRA_URL,
  quiksocial: process.env.QUIKSOCIAL_URL,
  quikcrm: process.env.QUIKCRM_URL,
  quikhrms: process.env.QUIKHRMS_URL,
};
const devLocalhostFallbacks: Record<string, string> = {
  quikit: "http://localhost:3000",
  auth: "http://localhost:3001",
  admin: "http://localhost:3002",
  quikscale: "http://localhost:3003",
  quikasset: "http://localhost:3012",
  quiktrack: "http://localhost:3004",
  quikvc: "http://localhost:3005",
  quikinfra: "http://localhost:3006",
  quiksocial: "http://localhost:3007",
  quikcrm: "http://localhost:3008",
  quikhrms: "http://localhost:3009",
};
function resolveBaseUrl(slug: string, dbBaseUrl: string | null | undefined): string {
  const fromEnv = envBaseUrls[slug];
  if (fromEnv) return fromEnv;
  if (dbBaseUrl) return dbBaseUrl;
  if (process.env.NODE_ENV !== "production" && devLocalhostFallbacks[slug]) {
    return devLocalhostFallbacks[slug];
  }
  return "";
}
