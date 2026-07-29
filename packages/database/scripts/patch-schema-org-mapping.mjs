/**
 * Aligns schema.prisma with a DB that was migrated to v4 table/column names
 * (Org, OrgMember, orgId) while keeping Prisma field names tenantId / Tenant / Membership.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "../prisma/schema.prisma");

let s = fs.readFileSync(schemaPath, "utf8");

const lines = s.split("\n");
const out = lines.map((line) => {
  if (line.includes('@map("orgId")')) return line;

  // Scalar tenantId fields only (not targetTenantIds, not relation lines)
  const m = line.match(/^(\s*tenantId)(\s+String)(\?)?(\s*)(.*)$/);
  if (!m) return line;

  const [, indentName, strPart, optional, spaceAfter, rest] = m;
  // relation lines use "tenant Tenant" not "tenantId String"
  const trailing = `${optional ?? ""}${spaceAfter}@map("orgId")${rest ? " " + rest.trimStart() : ""}`;
  return `${indentName}${strPart}${trailing}`;
});

s = out.join("\n");

// Table renames (v4 SQL migration)
s = s.replace(
  /^model Tenant \{/m,
  'model Tenant {\n  @@map("Org")',
);
// Avoid double @@map
s = s.replace(/\n  @@map\("Org"\)\n  @@map\("Org"\)/g, '\n  @@map("Org")');

s = s.replace(/^model Membership \{/m, 'model Membership {\n  @@map("OrgMember")');
s = s.replace(/\n  @@map\("OrgMember"\)\n  @@map\("OrgMember"\)/g, '\n  @@map("OrgMember")');

s = s.replace(/^model TenantAppAccess \{/m, 'model TenantAppAccess {\n  @@map("OrgAppAccess")');
s = s.replace(
  /\n  @@map\("OrgAppAccess"\)\n  @@map\("OrgAppAccess"\)/g,
  '\n  @@map("OrgAppAccess")',
);

fs.writeFileSync(schemaPath, s);
console.log("Updated", schemaPath);
