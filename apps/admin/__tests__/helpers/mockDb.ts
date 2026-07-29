import { vi } from "vitest";

// Mock session store
let _session: Record<string, unknown> | null = null;

export function setSession(session: Record<string, unknown> | null) {
  _session = session;
}

// Mock Prisma DB
export const mockDb = {
  membership: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
  },
  team: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  userTeam: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  app: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  userAppAccess: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    groupBy: vi.fn(),
  },
  apiCall: {
    create: vi.fn().mockResolvedValue({}),
  },
  $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
};

// Wire mocks into modules
vi.mock("@quikit/database", () => ({ db: mockDb }));
vi.mock("@/lib/db", () => ({ db: mockDb }));

vi.mock("next-auth", () => ({
  default: vi.fn(),
  getServerSession: vi.fn(() => Promise.resolve(_session)),
}));
