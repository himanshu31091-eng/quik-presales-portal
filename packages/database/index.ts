import { PrismaClient, Prisma } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * Soft-delete middleware extension.
 *
 * Automatically adds `deletedAt: null` to every `findMany`, `findFirst`,
 * `count`, and `findUnique` query on models that have a `deletedAt` column.
 *
 * Models with soft-delete: KPI, Team, Priority, WWWItem, Meeting.
 *
 * Override: pass `{ where: { deletedAt: { not: null } } }` explicitly
 * to query deleted records (e.g., admin trash view).
 */
const SOFT_DELETE_MODELS = new Set([
  "KPI",
  "Team",
  "Priority",
  "WWWItem",
  "Meeting",
]);

function applySoftDeleteMiddleware(client: PrismaClient): PrismaClient {
  return client.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            const where = (args.where ?? {}) as Record<string, unknown>;
            if (!("deletedAt" in where)) {
              args.where = { ...where, deletedAt: null };
            }
          }
          return query(args);
        },
        async findFirst({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            const where = (args.where ?? {}) as Record<string, unknown>;
            if (!("deletedAt" in where)) {
              args.where = { ...where, deletedAt: null };
            }
          }
          return query(args);
        },
        async count({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            const where = (args.where ?? {}) as Record<string, unknown>;
            if (!("deletedAt" in where)) {
              args.where = { ...where, deletedAt: null };
            }
          }
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

const basePrisma =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

// Connection pool shape (see docs/plans/P0-1-db-connection-pooling.md):
//   Runtime (DATABASE_URL)          → pooler in transaction mode.
//                                     connection_limit=1 per lambda; the pooler
//                                     multiplexes across a small backend pool
//                                     (~20-40 slots shared across all lambdas).
//   Migrations (DATABASE_URL_DIRECT, via schema.prisma's directUrl)
//                                   → bypasses the pooler so DDL and advisory
//                                     locks work. Prisma reads it automatically.
// Local dev without a pooler: both env vars can point at the same URL.

if (process.env.NODE_ENV !== "production") {
  global.prisma = basePrisma;
}

/**
 * Extended Prisma client with soft-delete middleware.
 * All `findMany`, `findFirst`, and `count` queries on soft-delete models
 * automatically exclude rows where `deletedAt IS NOT NULL`.
 */
export const db = applySoftDeleteMiddleware(basePrisma);

export * from "@prisma/client";
