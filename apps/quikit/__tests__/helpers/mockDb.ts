import { vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Deep-mocked Prisma client shared across all test files.
export const mockDb: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

// Mock both import paths used in the quikit codebase.
// We avoid vi.importActual("@quikit/database") because the package-level
// module initializer constructs a real PrismaClient (which needs DATABASE_URL).
// Instead we re-export everything from @prisma/client (enums, Prisma namespace)
// and override `db` with our mock.
vi.mock("@quikit/database", async () => {
  const prismaClient = await vi.importActual<typeof import("@prisma/client")>(
    "@prisma/client"
  );
  return { ...prismaClient, db: mockDb };
});

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

export function resetMockDb() {
  mockReset(mockDb);
}
