import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Deterministic fixtures
 * ----------------------
 * All network traffic is intercepted so tests never hit real APIs or wallets.
 * No private keys or real funds are involved anywhere in this suite.
 */

const TOKENS = [
  { symbol: 'ETH', name: 'Ether', address: '0x0000000000000000000000000000000000000000', decimals: 18, chainId: 1 },
  { symbol: 'USDC', name: 'USD Coin', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6, chainId: 1 },
  { symbol: 'DAI', name: 'Dai Stablecoin', address: '0x6b175474e89094c44da98b954eedeac495271d0f', decimals: 18, chainId: 1 },
];

const QUOTE_FIXTURE = {
  id: 'quote-fixture-1',
  fromToken: TOKENS[0],
  toToken: TOKENS[1],
  fromAmount: '1000000000000000000',
  toAmount: '2450000000',
  priceImpact: '0.12',
  route: ['ETH', 'USDC'],
  gasEstimate: '150000',
  expiresAt: '2099-01-01T00:00:00.000Z',
};

const SIMULATION_FIXTURE = {
  success: true,
  gasUsed: '142000',
  balanceChanges: [
    { token: 'ETH', amount: '-1000000000000000000' },
    { token: 'USDC', amount: '2450000000' },
  ],
  warnings: [],
};

const WALLET_ADDRESS = '0x1111111111111111111111111111111111111111';

type MockOptions = {
  quoteStatus?: number;
  quoteDelayMs?: number;
  simulationStatus?: number;
  simulationSuccess?: boolean;
  failFirstQuote?: boolean;
};

async function installApiMocks(page: Page, options: MockOptions = {}) {
  const {
    quoteStatus = 200,
    quoteDelayMs = 0,
    simulationStatus = 200,
    simulationSuccess = true,
    failFirstQuote = false,
  } = options;

  let quoteCalls = 0;

  await page.route('**/api/tokens**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tokens: TOKENS }),
    });
  });

  await page.route('**/api/quote**', async (route: Route) => {
    quoteCalls += 1;
    if (quoteDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, quoteDelayMs));
    }
    if (failFirstQuote && quoteCalls === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Service temporarily unavailable' }),
      });
      return;
    }
    if (quoteStatus !== 200) {
      await route.fulfill({
        status: quoteStatus,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Quote failed' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(QUOTE_FIXTURE),
    });
  });

  await page.route('**/api/simulate**', async (route: Route) => {
    if (simulationStatus !== 200) {
      await route.fulfill({
        status: simulationStatus,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Simulation failed' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...SIMULATION_FIXTURE, success: simulationSuccess }),
    });
  });
}

/**
 * Deterministic wallet fixture injected before any app code runs.
 * Simulates an EIP-1193 provider without any real keys.
 */
async function installWalletMock(page: Page, opts: { rejectSigning?: boolean } = {}) {
  const { rejectSigning = false } = opts;
  await page.addInitScript(
    ({ address, reject }) => {
      const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
      const provider = {
        isMetaMask: true,
        selectedAddress: address,
        chainId: '0x1',
        async request({ method }: { method: string; params?: unknown[] }) {
          switch (method) {
            case 'eth_requestAccounts':
            case 'eth_accounts':
              return [address];
            case 'eth_chainId':
              return '0x1';
            case 'net_version':
              return '1';
            case 'wallet_switchEthereumChain':
              return null;
            case 'eth_sendTransaction':
            case 'eth_signTypedData_v4':
            case 'personal_sign':
              if (reject) {
                const err = new Error('User rejected the request.');
                (err as unknown as { code: number }).code = 4001;
                throw err;
              }
              return '0x' + 'ab'.repeat(32);
            default:
              return null;
          }
        },
        on(event: string, handler: (...args: unknown[]) => void) {
          (listeners[event] ||= []).push(handler);
        },
        removeListener(event: string, handler: (...args: unknown[]) => void) {
          listeners[event] = (listeners[event] || []).filter((h) => h !== handler);
        },
      };
      (window as unknown as { ethereum: unknown }).ethereum = provider;
    },
    { address: WALLET_ADDRESS, reject: rejectSigning },
  );
}

async function gotoApp(page: Page) {
  await page.goto('/app');
  await expect(page.getByRole('main')).toBeVisible();
}

async function connectWallet(page: Page) {
  const connectButton = page.getByRole('button', { name: /connect wallet/i });
  if (await connectButton.isVisible().catch(() => false)) {
    await connectButton.click();
  }
  await expect(page.getByText(/0x1111…1111|0x1111111111111111111111111111111111111111/i).first()).toBeVisible();
}

async function selectToken(page: Page, side: 'from' | 'to', symbol: string) {
  const trigger = page.getByTestId(`${side}-token-select`);
  await trigger.click();
  const option = page.getByRole('option', { name: new RegExp(symbol, 'i') });
  await option.click();
  await expect(trigger).toContainText(symbol);
}

async function enterAmount(page: Page, amount: string) {
  const input = page.getByTestId('from-amount-input');
  await input.fill(amount);
}

test.describe('Critical user journeys', () => {
  test.beforeEach(async ({ page }) => {
    await installWalletMock(page);
    await installApiMocks(page);
  });

  test('navigates from landing to application', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const launch = page.getByRole('link', { name: /launch app|get started|open app/i }).first();
    await launch.click();

    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('selects tokens and requests a quote', async ({ page }) => {
    await gotoApp(page);
    await connectWallet(page);

    await selectToken(page, 'from', 'ETH');
    await selectToken(page, 'to', 'USDC');
    await enterAmount(page, '1');

    const quoteRequest = page.waitForResponse((res) => res.url().includes('/api/quote'));
    await page.getByRole('button', { name: /get quote|review/i }).click();
    const response = await quoteRequest;
    expect(response.status()).toBe(200);

    await expect(page.getByTestId('quote-output')).toContainText('2,450');
    await expect(page.getByTestId('price-impact')).toBeVisible();
  });

  test('simulates a transaction before signing', async ({ page }) => {
    await gotoApp(page);
    await connectWallet(page);

    await selectToken(page, 'from', 'ETH');
    await selectToken(page, 'to', 'USDC');
    await enterAmount(page, '1');
    await page.getByRole('button', { name: /get quote|review/i }).click();
    await expect(page.getByTestId('quote-output')).toBeVisible();

    const simRequest = page.waitForResponse((res) => res.url().includes('/api/simulate'));
    await page.getByRole('button', { name: /simulate|review transaction/i }).click();
    const response = await simRequest;
    expect(response.status()).toBe(200);

    await expect(page.getByTestId('simulation-result')).toContainText(/success|no warnings/i);
  });

  test('handles signing rejection gracefully', async ({ page }) => {
    await installWalletMock(page, { rejectSigning: true });
    await gotoApp(page);
    await connectWallet(page);

    await selectToken(page, 'from', 'ETH');
    await selectToken(page, 'to', 'USDC');
    await enterAmount(page, '1');
    await page.getByRole('button', { name: /get quote|review/i }).click();
    await expect(page.getByTestId('quote-output')).toBeVisible();

    await page.getByRole('button', { name: /simulate|review transaction/i }).click();
    await expect(page.getByTestId('simulation-result')).toBeVisible();

    await page.getByRole('button', { name: /confirm|sign|swap/i }).click();

    await expect(page.getByRole('alert')).toContainText(/rejected|cancelled/i);
    // App remains usable after rejection.
    await expect(page.getByTestId('from-amount-input')).toBeEnabled();
  });

  test('recovers from a transient quote failure', async ({ page }) => {
    await installApiMocks(page, { failFirstQuote: true });
    await gotoApp(page);
    await connectWallet(page);

    await selectToken(page, 'from', 'ETH');
    await selectToken(page, 'to', 'USDC');
    await enterAmount(page, '1');

    await page.getByRole('button', { name: /get quote|review/i }).click();
    await expect(page.getByRole('alert')).toContainText(/unavailable|failed|try again/i);

    // Retry succeeds deterministically.
    await page.getByRole('button', { name: /retry|get quote|review/i }).click();
    await expect(page.getByTestId('quote-output')).toContainText('2,450');
  });

  test('shows error state when simulation fails', async ({ page }) => {
    await installApiMocks(page, { simulationSuccess: false });
    await gotoApp(page);
    await connectWallet(page);

    await selectToken(page, 'from', 'ETH');
    await selectToken(page, 'to', 'USDC');
    await enterAmount(page, '1');
    await page.getByRole('button', { name: /get quote|review/i }).click();
    await expect(page.getByTestId('quote-output')).toBeVisible();

    await page.getByRole('button', { name: /simulate|review transaction/i }).click();
    await expect(page.getByTestId('simulation-result')).toContainText(/fail|warning|revert/i);
  });
});

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await installWalletMock(page);
    await installApiMocks(page);
  });

  test('landing page has no critical accessibility violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });

  test('application route has no critical accessibility violations', async ({ page }) => {
    await gotoApp(page);
    await connectWallet(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});

test.describe('Responsive regressions', () => {
  const breakpoints = [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 800 },
  ];

  for (const bp of breakpoints) {
    test(`landing renders at ${bp.name} (${bp.width}x${bp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page).toHaveScreenshot(`landing-${bp.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
      });
    });

    test(`application renders at ${bp.name} (${bp.width}x${bp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await installWalletMock(page);
      await installApiMocks(page);
      await gotoApp(page);
      await connectWallet(page);
      await expect(page).toHaveScreenshot(`app-${bp.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});