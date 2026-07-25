import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  addWorkspaceMember,
  createProduct,
} from "~/test/factories";
import { getDecryptedKey } from "~/server/utils/credentialHelper";

describe("integration router — Sentry", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("createSentryIntegration", () => {
    it("owner connects Sentry: persists integration, encrypted secret, and product config", async () => {
      const owner = await createUser(db);
      const workspace = await createWorkspace(db, { ownerId: owner.id });
      const product = await createProduct(db, {
        workspaceId: workspace.id,
        createdById: owner.id,
      });
      const caller = createTestCaller(owner.id);

      const result = await caller.integration.createSentryIntegration({
        workspaceId: workspace.id,
        productId: product.id,
      });

      expect(result.configured).toBe(true);
      expect(result.productName).toBe(product.name);
      expect(result.webhookUrl).toContain(`/api/webhooks/sentry/${result.webhookId}`);
      expect(result.webhookSecret).toBeTruthy();

      const integration = await db.integration.findFirst({
        where: { provider: "sentry", workspaceId: workspace.id },
        include: { credentials: true },
      });
      expect(integration).not.toBeNull();
      expect(integration!.webhookId).toBe(result.webhookId);
      expect(
        (integration!.providerConfig as { productId?: string }).productId,
      ).toBe(product.id);

      // Exactly one secret credential, and it round-trips to the returned value.
      const secretCred = integration!.credentials.filter(
        (c) => c.keyType === "WEBHOOK_SECRET",
      );
      expect(secretCred).toHaveLength(1);
      expect(getDecryptedKey(secretCred[0]!)).toBe(result.webhookSecret);
    });

    it("rejects a non-owner/admin member with FORBIDDEN", async () => {
      const owner = await createUser(db);
      const member = await createUser(db);
      const workspace = await createWorkspace(db, { ownerId: owner.id });
      await addWorkspaceMember(db, workspace.id, member.id, "member");
      const product = await createProduct(db, {
        workspaceId: workspace.id,
        createdById: owner.id,
      });
      const caller = createTestCaller(member.id);

      await expect(
        caller.integration.createSentryIntegration({
          workspaceId: workspace.id,
          productId: product.id,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("rejects a destination product from another workspace", async () => {
      const owner = await createUser(db);
      const workspace = await createWorkspace(db, { ownerId: owner.id });
      const otherWorkspace = await createWorkspace(db, { ownerId: owner.id });
      const foreignProduct = await createProduct(db, {
        workspaceId: otherWorkspace.id,
        createdById: owner.id,
      });
      const caller = createTestCaller(owner.id);

      await expect(
        caller.integration.createSentryIntegration({
          workspaceId: workspace.id,
          productId: foreignProduct.id,
        }),
      ).rejects.toThrow(/product not found/i);
    });

    it("re-connecting replaces the prior config transactionally (no orphans)", async () => {
      const owner = await createUser(db);
      const workspace = await createWorkspace(db, { ownerId: owner.id });
      const product = await createProduct(db, {
        workspaceId: workspace.id,
        createdById: owner.id,
      });
      const caller = createTestCaller(owner.id);

      const first = await caller.integration.createSentryIntegration({
        workspaceId: workspace.id,
        productId: product.id,
      });
      const second = await caller.integration.createSentryIntegration({
        workspaceId: workspace.id,
        productId: product.id,
      });

      expect(second.webhookId).not.toBe(first.webhookId);

      const integrations = await db.integration.findMany({
        where: { provider: "sentry", workspaceId: workspace.id },
      });
      expect(integrations).toHaveLength(1);

      // Exactly one secret remains, tied to the surviving integration — the
      // replaced integration's credential was cascade-deleted with it.
      const allSecretCreds = await db.integrationCredential.findMany({
        where: { keyType: "WEBHOOK_SECRET" },
      });
      expect(allSecretCreds).toHaveLength(1);
      expect(allSecretCreds[0]!.integrationId).toBe(integrations[0]!.id);
    });
  });

  describe("getWorkspaceSentryStatus", () => {
    it("reports configured + product, and never leaks the secret", async () => {
      const owner = await createUser(db);
      const workspace = await createWorkspace(db, { ownerId: owner.id });
      const product = await createProduct(db, {
        workspaceId: workspace.id,
        createdById: owner.id,
      });
      const caller = createTestCaller(owner.id);

      await caller.integration.createSentryIntegration({
        workspaceId: workspace.id,
        productId: product.id,
      });

      const status = await caller.integration.getWorkspaceSentryStatus({
        workspaceId: workspace.id,
      });

      expect(status.configured).toBe(true);
      if (status.configured) {
        expect(status.productId).toBe(product.id);
        expect(status.productName).toBe(product.name);
        expect(status.webhookUrl).toContain("/api/webhooks/sentry/");
        // The secret must not appear anywhere in the status payload.
        expect(JSON.stringify(status)).not.toMatch(/webhookSecret/i);
      }
    });

    it("returns not-configured when nothing is set up", async () => {
      const owner = await createUser(db);
      const workspace = await createWorkspace(db, { ownerId: owner.id });
      const caller = createTestCaller(owner.id);

      const status = await caller.integration.getWorkspaceSentryStatus({
        workspaceId: workspace.id,
      });
      expect(status.configured).toBe(false);
    });
  });

  describe("removeWorkspaceSentry", () => {
    it("removes the integration and cascades its credentials", async () => {
      const owner = await createUser(db);
      const workspace = await createWorkspace(db, { ownerId: owner.id });
      const product = await createProduct(db, {
        workspaceId: workspace.id,
        createdById: owner.id,
      });
      const caller = createTestCaller(owner.id);

      await caller.integration.createSentryIntegration({
        workspaceId: workspace.id,
        productId: product.id,
      });
      await caller.integration.removeWorkspaceSentry({
        workspaceId: workspace.id,
      });

      const integrations = await db.integration.findMany({
        where: { provider: "sentry", workspaceId: workspace.id },
      });
      expect(integrations).toHaveLength(0);

      const creds = await db.integrationCredential.findMany({
        where: { keyType: "WEBHOOK_SECRET" },
      });
      expect(creds).toHaveLength(0);
    });
  });
});
