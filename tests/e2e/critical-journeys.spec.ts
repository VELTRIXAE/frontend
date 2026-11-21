import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SUPPORTED_ASSET = {
  symbol: "USDC",
  name: "USD Coin",
  issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  contractId: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  decimals: 7,
};

const UNSUPPORTED_ASSET = {
  symbol: "USDC",
  name: "USD Coin (unsupported issuer)",
  issuer: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  decimals: 7,
};

async function mockTestnetServices(page: Page) {
  await page.route("**/api/aggregator/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const readiness = {
      network: "testnet", mainnetEnabled: false, custody: "none", submitsTransactions: false,
      checkedAt: Date.now(), networkVerified: true, ledger: 123,
      deployment: { status: "verified", code: null },
      liquidity: { status: "empty", pools: 0, fundedPools: 0, code: null },
      aggregator: { status: "not-deployed" }, quotesAvailable: false,
      swapPreparationAvailable: false, blockers: ["NO_POOLS", "AGGREGATOR_NOT_DEPLOYED"],
    };
    const body = path.endsWith("/readiness") ? readiness : path.endsWith("/tokens") ? { tokens: [SUPPORTED_ASSET] } :
      { error: { code: "NOT_CONFIGURED", message: "Endpoint unavailable in this fixture." } };
    await route.fulfill({ status: path.endsWith("/readiness") || path.endsWith("/tokens") ? 200 : 503,
      contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("https://horizon-testnet.stellar.org/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/assets")) {
      const records = [SUPPORTED_ASSET, UNSUPPORTED_ASSET].map((asset) => ({
        asset_type: "credit_alphanum4",
        asset_code: asset.symbol,
        asset_issuer: asset.issuer,
        contract_id: asset.contractId,
        num_accounts: 10,
        amount: "1000.0000000",
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ _embedded: { records }, _links: {} }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        core_latest_ledger: 123,
        history_latest_ledger: 123,
        network_passphrase: "Test SDF Network ; September 2015",
      }),
    });
  });
}

async function openSwap(page: Page) {
  await page.goto("/app/swap");
  await expect(page).toHaveURL(/\/app\/swap$/);
  const trigger = page.getByRole("button", { name: /select asset|choose asset/i }).first();
  await expect(trigger).toBeVisible();
  return trigger;
}

async function expectDropdownInViewport(page: Page) {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  if (!box || !viewport) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await mockTestnetServices(page);
});

test("navigates from the landing page into the application", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Trade Beyond");
  await page.getByRole("link", { name: /launch app/i }).first().click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("keeps Mainnet disabled and Testnet restrictions visible", async ({ page }) => {
  await page.goto("/app/settings");
  await expect(page.getByText("Testnet only", { exact: true })).toBeVisible();
  await expect(page.locator(".setting-card").filter({ hasText: "Network" }).getByText("Stellar Testnet", { exact: true })).toBeVisible();
  await expect(page.getByText("Mainnet is intentionally disabled.")).toBeVisible();
});

test("navigates to swaps and blocks unverified contract writes", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("link", { name: /advanced swap/i }).click();
  await expect(page).toHaveURL(/\/app\/swap$/);
  const writeWarning = page.getByRole("alert").filter({ hasText: "Write actions disabled" });
  await expect(writeWarning).toBeVisible();
  await expect(writeWarning).toContainText("no deployed aggregator yet");
  await expect(page.getByText("Stellar Testnet verified", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare swap", exact: true })).toHaveCount(0);
});

test("landing and application routes have no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("asset dropdown opens via keyboard, focuses search and returns focus on Escape", async ({ page }) => {
  const trigger = await openSwap(page);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const search = page.getByRole("searchbox").first();
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Space");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("searchbox").first()).toBeFocused();
  await page.getByRole("button", { name: /close/i }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("asset dropdown selects a supported asset once and closes", async ({ page }) => {
  const trigger = await openSwap(page);
  await trigger.click();
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  const supported = dialog.getByRole("option", { name: new RegExp(SUPPORTED_ASSET.issuer) }).first();
  await expect(supported).toBeEnabled();
  await supported.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toContainText(SUPPORTED_ASSET.symbol);
});

test("unsupported discovered assets stay disabled and cannot be selected", async ({ page }) => {
  const trigger = await openSwap(page);
  await trigger.click();
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  const unsupported = dialog.getByRole("option", { name: new RegExp(UNSUPPORTED_ASSET.issuer) }).first();
  await expect(unsupported).toBeDisabled();
  await unsupported.click({ force: true });
  await expect(dialog).toBeVisible();
  await expect(trigger).not.toContainText(UNSUPPORTED_ASSET.issuer);
});

for (const viewport of [
  { name: "mobile-375", width: 375, height: 667 },
  { name: "desktop", width: 1280, height: 800 },
]) {
  test(`asset dropdown stays in viewport and scrolls at ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const trigger = await openSwap(page);
    await trigger.click();
    await expectDropdownInViewport(page);
    const list = page.getByRole("listbox").first();
    await expect(list).toBeVisible();
    const overflow = await list.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    if (overflow) {
      await list.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      const scrolled = await list.evaluate((el) => el.scrollTop > 0);
      expect(scrolled).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`asset-dropdown-${viewport.name}.png`), fullPage: false });
    await expectNoSeriousViolations(page);
  });
}
