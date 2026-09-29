import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PluginConfig, PrismaClient, WorkspaceUser } from "@prisma/client";
import { resolvePluginStates } from "../resolvePluginStates";

const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

const USER = "user-new-member";
const WORKSPACE = "ws-1";

function config(overrides: Partial<PluginConfig>): PluginConfig {
  return {
    id: "cfg",
    pluginId: "product",
    workspaceId: WORKSPACE,
    userId: USER,
    enabled: true,
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Routes the two pluginConfig.findMany calls: own rows vs. admin rows. */
function mockConfigs(own: PluginConfig[], admin: PluginConfig[]): void {
  db.pluginConfig.findMany.mockImplementation(((args: { where: { userId: unknown } }) =>
    Promise.resolve(typeof args.where.userId === "string" ? own : admin)) as never);
}

beforeEach(() => {
  mockReset(db);
  db.workspaceUser.findUnique.mockResolvedValue({ id: "membership" } as WorkspaceUser);
  db.workspaceUser.findMany.mockResolvedValue([{ userId: "user-owner" }] as WorkspaceUser[]);
});

describe("resolvePluginStates", () => {
  it("inherits a plugin an owner enabled when the member has no row of their own", async () => {
    mockConfigs([], [config({ userId: "user-owner", enabled: true })]);

    const { enabledById, ownConfigs } = await resolvePluginStates(db, USER, WORKSPACE);

    expect(enabledById.get("product")).toBe(true);
    expect(ownConfigs).toEqual([]);
  });

  it("lets the member's own row override the workspace default", async () => {
    mockConfigs(
      [config({ enabled: false })],
      [config({ userId: "user-owner", enabled: true })],
    );

    const { enabledById } = await resolvePluginStates(db, USER, WORKSPACE);

    expect(enabledById.get("product")).toBe(false);
  });

  it("uses the most recent admin choice when admins disagree", async () => {
    // findMany is ordered updatedAt desc, so the first row is the newest.
    mockConfigs(
      [],
      [
        config({ userId: "user-admin", enabled: false }),
        config({ userId: "user-owner", enabled: true }),
      ],
    );

    const { enabledById } = await resolvePluginStates(db, USER, WORKSPACE);

    expect(enabledById.get("product")).toBe(false);
  });

  it("leaves the plugin unresolved when no admin has chosen, so the manifest default applies", async () => {
    mockConfigs([], []);

    const { enabledById } = await resolvePluginStates(db, USER, WORKSPACE);

    expect(enabledById.has("product")).toBe(false);
  });

  it("does not reveal workspace defaults to a non-member", async () => {
    db.workspaceUser.findUnique.mockResolvedValue(null);
    mockConfigs([], [config({ userId: "user-owner", enabled: true })]);

    const { enabledById } = await resolvePluginStates(db, USER, WORKSPACE);

    expect(enabledById.has("product")).toBe(false);
    expect(db.workspaceUser.findMany).not.toHaveBeenCalled();
  });

  it("skips the workspace lookup outside a workspace", async () => {
    mockConfigs([config({ workspaceId: null, pluginId: "crm", enabled: false })], []);

    const { enabledById } = await resolvePluginStates(db, USER, null);

    expect(enabledById.get("crm")).toBe(false);
    expect(db.workspaceUser.findUnique).not.toHaveBeenCalled();
  });
});
