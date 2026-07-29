import { vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

/**
 * Deep-mocked Prisma client. Every model/method is auto-stubbed; each test
 * seeds what it needs, e.g. `mockDb.psEngagement.findFirst.mockResolvedValue(...)`.
 */
export const mockDb: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

/**
 * Both import paths must be mocked. Route handlers import `db` from
 * "@/lib/db", which re-exports "@quikit/database" — mocking only one leaves
 * the other pointing at a real client that needs DATABASE_URL.
 *
 * Enums come from @prisma/client via importActual rather than from
 * @quikit/database, so requiring them doesn't instantiate PrismaClient.
 */
vi.mock("@quikit/database", async () => {
  const prismaClient = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
  return { ...prismaClient, db: mockDb };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));

/**
 * `$transaction(async tx => …)` runs the callback against the same mock, so a
 * handler's transactional writes are observable on `mockDb` exactly as if they
 * had run outside a transaction.
 */
export function stubTransaction() {
  // `$transaction` is overloaded (callback form and array form); the deep mock
  // surfaces the union, which no single implementation signature satisfies.
  // Cast the mock rather than the argument so both forms stay handled.
  const tx = mockDb.$transaction as unknown as {
    mockImplementation: (fn: (arg: unknown) => Promise<unknown>) => void;
  };
  tx.mockImplementation(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (client: typeof mockDb) => Promise<unknown>)(mockDb)
      : Promise.all(arg as unknown[]),
  );
}

export function resetMockDb() {
  mockReset(mockDb);
  stubTransaction();
}
