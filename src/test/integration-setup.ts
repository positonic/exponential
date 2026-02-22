import { vi, beforeAll, afterAll, afterEach } from "vitest";
import { startTestDatabase, stopTestDatabase, truncateAllTables } from "./test-db";

// Skip env validation and set dummy env vars for modules that read them at import time
process.env.SKIP_ENV_VALIDATION = "true";
process.env.AUTH_SECRET = "test-secret-for-integration-tests";
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "sk-test-dummy-key-for-integration-tests";
process.env.GOOGLE_CLIENT_ID = "test";
process.env.GOOGLE_CLIENT_SECRET = "test";
process.env.MASTRA_API_URL = "http://localhost:4111";

// Mock next-auth and related modules that depend on Next.js runtime
vi.mock("next-auth", () => ({
  default: () => ({
    auth: () => null,
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));

vi.mock("~/server/auth", () => ({
  auth: () => null,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("~/server/db", async () => {
  const { getTestDb } = await import("./test-db");
  // Return a Proxy so that module-level singletons (e.g. SprintAnalyticsService)
  // can capture `db` at import time without throwing. All property access on the
  // proxy is forwarded to the real PrismaClient once the test DB is started.
  const lazyDb = new Proxy(
    {},
    {
      get(_target, prop) {
        const realDb = getTestDb();
        const value = realDb[prop as keyof typeof realDb];
        if (typeof value === "function") {
          return value.bind(realDb);
        }
        return value;
      },
    },
  );
  return { db: lazyDb };
});

beforeAll(async () => {
  await startTestDatabase();
}, 120000); // 2 min timeout for container startup + migrations

afterEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await stopTestDatabase();
});
