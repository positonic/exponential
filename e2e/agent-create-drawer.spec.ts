/**
 * `/settings/agents/new` opens the create drawer over the agents list, and one
 * submit creates the agent, adds it to a workspace and shows its first key.
 *
 * `npx exponential-mcp init` links straight here, so the deep link has to work
 * from a cold load. See dev-docs/AGENT_VISUAL_TESTING.md.
 */
import { test, expect } from "@playwright/test";
import { loadFixture } from "./fixture-data";

const fixture = loadFixture();

/** First hit on a `next dev` route pays the compile + client fetch cost. */
const FIRST_PAINT_TIMEOUT = 60_000;

test.describe("Agents settings — create drawer", () => {
  test("creates an agent with a workspace and a key in one step", async ({ page }) => {
    const agentName = `E2E agent ${Date.now()}`;

    await page.goto("/settings/agents/new");
    const drawer = page.getByRole("dialog", { name: "New external agent" });
    await expect(drawer).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    // The list renders behind the drawer.
    await expect(page.getByRole("heading", { name: "External agents" })).toBeVisible();

    await drawer.getByLabel("Name").fill(agentName);
    await drawer.getByRole("textbox", { name: "Workspaces" }).click();
    await page.getByRole("option", { name: fixture.otherWorkspaceName }).click();
    await expect(drawer.getByLabel("Key label")).toHaveValue("default");
    await test.info().attach("agent-create-drawer", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    await drawer.getByRole("button", { name: "Create agent" }).click();

    const keyDrawer = page.getByRole("dialog", { name: "Copy your key now" });
    await expect(keyDrawer).toBeVisible();
    await expect(keyDrawer.getByText(/^exp_agent_/)).toBeVisible();
    await test.info().attach("agent-create-key", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    await keyDrawer.getByRole("button", { name: "Done" }).click();
    await expect(page).toHaveURL(/\/settings\/agents$/);
    await expect(keyDrawer).toBeHidden();

    // The new card carries the workspace and the key without a second step.
    const card = page.locator(".mantine-Paper-root").filter({ hasText: agentName });
    await expect(card.getByText(fixture.otherWorkspaceName)).toBeVisible();
    await expect(card.getByRole("cell", { name: "default" })).toBeVisible();

    // Clean up so reruns against the same dev DB don't pile up agents.
    await card.getByRole("button", { name: /Delete agent/ }).click();
    await expect(page.getByText(agentName)).toHaveCount(0);
  });

  test("New agent links to the deep link, and Cancel returns to the list", async ({ page }) => {
    await page.goto("/settings/agents");
    await page.getByRole("link", { name: "New agent" }).click();
    await expect(page).toHaveURL(/\/settings\/agents\/new$/);

    const drawer = page.getByRole("dialog", { name: "New external agent" });
    await expect(drawer).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await drawer.getByRole("button", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/settings\/agents$/);
    await expect(drawer).toBeHidden();
  });
});
