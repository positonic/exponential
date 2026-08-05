import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
  process.env.MASTRA_API_URL ??= "http://localhost:4111";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_opts?: unknown) {
      // intentionally empty
    }
  },
}));

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

const blobMocks = vi.hoisted(() => ({
  uploadToBlob: vi.fn(),
  deleteFromBlob: vi.fn(),
}));
vi.mock("~/lib/blob", () => blobMocks);

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = {
  current: null,
};
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
  return dbHolder.current;
}
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get(_target, property) {
        const mock = getDbMock() as unknown as Record<string | symbol, unknown>;
        return mock[property];
      },
    },
  );
  return { db: proxy };
});

import { createMockCaller } from "~/test/trpc-helpers";

const OWNER_ID = "owner-1";
const AGENT_ID = "agent-1";
const SHADOW_ID = "shadow-1";
const OLD_AVATAR_URL = "https://blob.example/old.png";
const NEW_AVATAR_URL = "https://blob.example/new.png";
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

function caller(db: DeepMockProxy<PrismaClient>) {
  return createMockCaller({
    userId: OWNER_ID,
    db: db as unknown as PrismaClient,
  });
}

function arrangeOwnedAgent(db: DeepMockProxy<PrismaClient>) {
  db.user.findUnique.mockResolvedValue({ isAgent: false } as never);
  db.externalAgent.findFirst.mockResolvedValue({
    id: AGENT_ID,
    ownerId: OWNER_ID,
    shadowUserId: SHADOW_ID,
    shadowUser: { id: SHADOW_ID, image: OLD_AVATAR_URL },
  } as never);
}

describe("externalAgent.uploadAvatar", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    vi.clearAllMocks();
    arrangeOwnedAgent(db);
    blobMocks.uploadToBlob.mockResolvedValue({ url: NEW_AVATAR_URL });
    blobMocks.deleteFromBlob.mockResolvedValue(undefined);
    db.user.update.mockResolvedValue({ image: NEW_AVATAR_URL } as never);
  });

  it("stores the avatar on the agent's shadow user so it appears across the app", async () => {
    const result = await caller(db).externalAgent.uploadAvatar({
      agentId: AGENT_ID,
      base64Data: Buffer.from("avatar").toString("base64"),
      contentType: "image/png",
    });

    expect(result).toEqual({ avatarUrl: NEW_AVATAR_URL });
    expect(db.externalAgent.findFirst).toHaveBeenCalledWith({
      where: { id: AGENT_ID, ownerId: OWNER_ID },
      include: { shadowUser: { select: { id: true, image: true } } },
    });
    expect(blobMocks.uploadToBlob).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/^external-agent-avatars\/agent-1-\d+\.png$/),
      "image/png",
    );
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: SHADOW_ID },
      data: { image: NEW_AVATAR_URL },
      select: { image: true },
    });
    expect(blobMocks.deleteFromBlob).toHaveBeenCalledWith(OLD_AVATAR_URL);
  });

  it("rejects uploads for an agent the caller does not own", async () => {
    db.externalAgent.findFirst.mockResolvedValue(null);

    await expect(
      caller(db).externalAgent.uploadAvatar({
        agentId: "someone-elses-agent",
        base64Data: Buffer.from("avatar").toString("base64"),
        contentType: "image/png",
      }),
    ).rejects.toThrow(/Agent not found/);

    expect(blobMocks.uploadToBlob).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("rejects images larger than 3MB before uploading them", async () => {
    await expect(
      caller(db).externalAgent.uploadAvatar({
        agentId: AGENT_ID,
        base64Data: Buffer.alloc(MAX_AVATAR_BYTES + 1).toString("base64"),
        contentType: "image/png",
      }),
    ).rejects.toThrow(/3MB or smaller/);

    expect(blobMocks.uploadToBlob).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("removes the newly uploaded blob if persisting its URL fails", async () => {
    db.user.update.mockRejectedValue(new Error("database unavailable"));

    await expect(
      caller(db).externalAgent.uploadAvatar({
        agentId: AGENT_ID,
        base64Data: Buffer.from("avatar").toString("base64"),
        contentType: "image/webp",
      }),
    ).rejects.toThrow(/database unavailable/);

    expect(blobMocks.deleteFromBlob).toHaveBeenCalledWith(NEW_AVATAR_URL);
    expect(blobMocks.deleteFromBlob).not.toHaveBeenCalledWith(OLD_AVATAR_URL);
  });
});

describe("externalAgent.delete avatar cleanup", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    vi.clearAllMocks();
    arrangeOwnedAgent(db);
    db.$transaction.mockResolvedValue([] as never);
    db.user.delete.mockResolvedValue({ id: SHADOW_ID } as never);
    blobMocks.deleteFromBlob.mockResolvedValue(undefined);
  });

  it("deletes the avatar blob when the unused shadow user is deleted", async () => {
    const result = await caller(db).externalAgent.delete({ agentId: AGENT_ID });

    expect(result).toEqual({ success: true, shadowUserRetained: false });
    expect(blobMocks.deleteFromBlob).toHaveBeenCalledWith(OLD_AVATAR_URL);
  });

  it("keeps the avatar when authored content requires retaining attribution", async () => {
    db.user.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", {
        code: "P2003",
        clientVersion: "test",
      }),
    );

    const result = await caller(db).externalAgent.delete({ agentId: AGENT_ID });

    expect(result).toEqual({ success: true, shadowUserRetained: true });
    expect(blobMocks.deleteFromBlob).not.toHaveBeenCalled();
  });
});

describe("externalAgent.list", () => {
  it("returns the shadow-user avatar URL used by the settings UI", async () => {
    const db = getDbMock();
    mockReset(db);
    db.user.findUnique.mockResolvedValue({ isAgent: false } as never);
    db.externalAgent.findMany.mockResolvedValue([
      {
        id: AGENT_ID,
        name: "Hermes",
        description: null,
        createdAt: new Date("2026-08-05T12:00:00Z"),
        shadowUserId: SHADOW_ID,
        keys: [],
        shadowUser: {
          id: SHADOW_ID,
          image: NEW_AVATAR_URL,
          workspaceMemberships: [],
        },
      },
    ] as never);

    const result = await caller(db).externalAgent.list();

    expect(result).toEqual([
      expect.objectContaining({
        id: AGENT_ID,
        shadowUserId: SHADOW_ID,
        avatarUrl: NEW_AVATAR_URL,
      }),
    ]);
  });
});
