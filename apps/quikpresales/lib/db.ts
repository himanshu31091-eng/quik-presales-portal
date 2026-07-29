/**
 * Re-exports the shared Prisma client. Always import from "@/lib/db" inside
 * this app — never import directly from "@quikit/database" in route or
 * component code (the indirection lets us swap clients in tests).
 */
export { db } from "@quikit/database";
