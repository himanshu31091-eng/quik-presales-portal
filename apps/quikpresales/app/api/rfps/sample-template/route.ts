import { NextResponse } from "next/server";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";

const withRfpAuth = withOrgAuthForModule("rfp");

/** GET /api/rfps/sample-template — a static sample RFP outline, as .docx. */
export const GET = withRfpAuth(async ({ orgId, userId }) => {
  const denied = await requirePermission(userId, orgId, "rfp", "view");
  if (denied) return denied;

  const { buildRfpSampleTemplateDocx } = await import("@/lib/export/rfp-template");
  const body = await buildRfpSampleTemplateDocx();

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="sample-rfp-template.docx"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
});
