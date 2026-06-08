import { expect, test, type Page } from "@playwright/test";
import { installMockApi } from "./mockApi";

const strongPassword = "E2ePremium!2026";

const views = [
  { id: "overview", path: "/", heading: "Overview" },
  { id: "terminal", path: "/terminal", heading: "Live Terminal" },
  { id: "strategies", path: "/strategies", heading: "Strategy Feed" },
  { id: "signals", path: "/signals", heading: "Signal Terminal" },
  { id: "market", path: "/market", heading: "Market Analysis" },
  { id: "agents", path: "/agents", heading: "Agent Network" },
  { id: "vault", path: "/vault", heading: "API Vault" },
  { id: "risk", path: "/risk", heading: "Risk Manager" },
  { id: "positions", path: "/positions", heading: "Positions" },
  { id: "incidents", path: "/incidents", heading: "Incidents" },
  { id: "readiness", path: "/readiness", heading: "Live Readiness" },
  { id: "operations", path: "/operations-command", heading: "Command Center" },
  { id: "portfolio", path: "/portfolio", heading: "Portfolio" },
  { id: "forensics", path: "/forensics", heading: "Forensic Audit" },
  { id: "approvals", path: "/approvals", heading: "Approvals" },
  { id: "disaster", path: "/disaster-recovery", heading: "Recovery" },
  { id: "compliance", path: "/compliance", heading: "Compliance" },
  { id: "evidence", path: "/test-evidence", heading: "Evidence" },
  { id: "ops", path: "/ops", heading: "Ops" },
  { id: "settings", path: "/settings", heading: "Settings" }
] as const;

test.describe("MA Core institutional console", () => {
  test.beforeEach(async ({ page }) => {
    if (process.env.E2E_MOCK_API === "true") {
      await installMockApi(page);
    }
    await registerOperator(page);
  });

  test("operator can navigate every institutional page from the sidebar", async ({ page }) => {
    for (const view of views) {
      await page.getByTestId(`nav-${view.id}`).click();
      await expect(page).toHaveURL(new RegExp(`${escapeRegExp(view.path)}$`));
      await expect(page.getByTestId(`view-${view.id}`)).toBeVisible();
      await expect(page.getByRole("heading", { name: view.heading, exact: true })).toBeVisible();
      await expectNoClientRuntimeError(page);
    }
  });

  test("command palette, drawers, toasts and exports are actionable", async ({ page }) => {
    await page.getByTestId("command-bar-trigger").click();
    await page.getByPlaceholder("Search command, page, pair, agent").fill("signal");
    await page.getByTestId("command-open-signals").click();
    await expect(page.getByTestId("view-signals")).toBeVisible();

    await page.getByTestId("nav-overview").click();
    await page.getByRole("button", { name: /Active Agents/i }).click();
    await expect(page.getByTestId("detail-drawer")).toBeVisible();
    await page.getByLabel("Close detail drawer").click();
    await expect(page.getByTestId("detail-drawer")).toHaveCount(0);

    await page.getByTestId("notification-drawer-trigger").click();
    await expect(page.getByTestId("notification-drawer")).toBeVisible();
    await page.getByLabel("Close notifications drawer").click();
    await expect(page.getByTestId("notification-drawer")).toHaveCount(0);

    await page.getByTestId("nav-terminal").click();
    await page.getByRole("button", { name: /Pause/i }).click();
    await page.getByRole("button", { name: /Resume/i }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export/i }).first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/ma-core-events\.json|ma-core-signals\.csv/);
    await expectNoClientRuntimeError(page);
  });

  test("vault validation, risk controls and settings controls expose real feedback", async ({ page }) => {
    await page.getByTestId("nav-vault").click();
    await page.getByRole("button", { name: /Validate & encrypt/i }).click();
    await expect(page.getByText(/API key/i)).toBeVisible();

    await page.getByTestId("nav-risk").click();
    await page.getByRole("button", { name: /Save policy/i }).click();
    await expect(page.getByText(/Risk policy saved/i)).toBeVisible();

    await page.getByTestId("nav-settings").click();
    await page.getByRole("button", { name: /Compact/i }).click();
    await page.getByRole("button", { name: /Operator alerts/i }).click();
    await page.getByRole("button", { name: /Save settings/i }).click();
    await expect(page.getByText(/Settings saved/i)).toBeVisible();
    await expectNoClientRuntimeError(page);
  });


  test("primary interactive controls are visible and enabled on every console page", async ({ page }) => {
    for (const view of views) {
      await page.goto(view.path);
      await expect(page.getByTestId(`view-${view.id}`)).toBeVisible();
      const buttons = page.getByRole("button");
      const count = await buttons.count();
      expect(count).toBeGreaterThan(3);
      for (let index = 0; index < Math.min(count, 14); index += 1) {
        await expect(buttons.nth(index)).toBeEnabled();
      }
      await expectNoClientRuntimeError(page);
    }
  });

  test("@visual captures pixel QA evidence for the approved institutional layout", async ({ page }) => {
    await assertVisualIntegrity(page, "overview", "/", "Overview");
    await assertVisualIntegrity(page, "terminal", "/terminal", "Live Terminal");
    await assertVisualIntegrity(page, "signals", "/signals", "Signal Terminal");
    await assertVisualIntegrity(page, "positions", "/positions", "Positions");
    await assertVisualIntegrity(page, "incidents", "/incidents", "Incidents");
    await assertVisualIntegrity(page, "readiness", "/readiness", "Live Readiness");
    await assertVisualIntegrity(page, "operations", "/operations-command", "Command Center");
    await assertVisualIntegrity(page, "portfolio", "/portfolio", "Portfolio");
    await assertVisualIntegrity(page, "forensics", "/forensics", "Forensic Audit");
    await assertVisualIntegrity(page, "ops", "/ops", "Ops");
  });
});

async function registerOperator(page: Page): Promise<void> {
  const email = `operator-${Date.now()}-${Math.random().toString(16).slice(2)}@ma-core.local`;
  await page.goto("/");
  await page.getByTestId("auth-mode-register").click();
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(strongPassword);
  await page.getByRole("button", { name: /Create Secure Account/i }).click();
  await expect(page.getByTestId("view-overview")).toBeVisible({ timeout: 20_000 });
}

async function assertVisualIntegrity(page: Page, id: string, path: string, heading: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByTestId(`view-${id}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  const measurements = await page.evaluate(() => {
    const body = document.body;
    const root = document.documentElement;
    const panels = Array.from(document.querySelectorAll("section, aside, main, button")).length;
    const horizontalOverflow = Math.max(body.scrollWidth, root.scrollWidth) - root.clientWidth;
    const background = window.getComputedStyle(body).backgroundColor;
    return { panels, horizontalOverflow, background };
  });
  expect(measurements.panels).toBeGreaterThan(30);
  expect(measurements.horizontalOverflow).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `test-results/visual-qa/${id}-1680x945.png`, fullPage: true });
}

async function expectNoClientRuntimeError(page: Page): Promise<void> {
  const errorBanner = page.getByText(/Unhandled Runtime Error|Application error|Hydration failed/i);
  await expect(errorBanner).toHaveCount(0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
