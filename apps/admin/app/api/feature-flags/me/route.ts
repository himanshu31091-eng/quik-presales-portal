import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { getDisabledModules } from "@quikit/auth/feature-gate";

export const GET = withAdminAuth(async ({ orgId }) => {
  // Use the appSlug "admin" — same slug the shared @quikit/auth feature gate
  // reads from `AppModuleFlag` rows.
  const disabled = await getDisabledModules(orgId, "admin");
  return NextResponse.json({ success: true, data: { disabled: Array.from(disabled) } });
});
