import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the wallet hook so we can assert on signature requests.
const mockSignTransaction = jest.fn();
const mockWallet = {
  connected: true,
  publicKey: 'GABCDEF1234567890',
  signTransaction: mockSignTransaction,
};

jest.mock('../src/hooks/useWallet', () => ({
  useWallet: () => mockWallet,
}));

// Mock the aggregator client.
const mockFetchQuote = jest.fn();
jest.mock('../src/services/aggregator', () => ({
  fetchQuote: (...args: unknown[]) => mockFetchQuote(...args),
}));

// Mock the transaction builder / simulator.
const mockBuildTransaction = jest.fn();
const mockSimulateTransaction = jest.fn();
jest.mock('../src/services/swapTransaction', () => ({
  buildTransaction: (...args: unknown[]) => mockBuildTransaction(...args),
  simulateTransaction: (...args: unknown[]) => mockSimulateTransaction(...args),
}));

// Mock submission + reconciliation.
const mockSubmitTransaction = jest.fn();
const mockReconcileTransaction = jest.fn();
jest.mock('../src/services/submission', () => ({
  submitTransaction: (...args: unknown[]) => mockSubmitTransaction(...args),
  reconcileTransaction: (...args: unknown[]) => mockReconcileTransaction(...args),
}));

// Import the component under test AFTER mocks are registered.
import { SwapWidget } from '../src/components/SwapWidget';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FUTURE = Date.now() + 60_000;
const PAST = Date.now() - 60_000;

function makeQuote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quote-1',
    expiresAt: FUTURE,
    amountIn: '100',
    amountOut: '95',
    minReceived: '94',
    priceImpact: '0.5',
    slippage: '1',
    route: [
      { from: 'XLM', to: 'USDC', dex: 'SDEX' },
      { from: 'USDC', to: 'AQUA', dex: 'AquaRouter' },
    ],
    xdr: 'AAAA...unsigned-xdr',
    ...overrides,
  };
}

const SIMULATION_SUCCESS = {
  success: true,
  xdr: 'AAAA...simulated-xdr',
  minReceived: '94',
  priceImpact: '0.5',
  slippage: '1',
  route: [{ from: 'XLM', to: 'USDC', dex: 'SDEX' }],
};

const SIMULATION_FAILURE = {
  success: false,
  error: 'Simulation failed: insufficient liquidity',
};

const SUBMISSION_SUCCESS = {
  success: true,
  hash: 'abc123hash',
  explorerUrl: 'https://stellar.expert/explorer/testnet/tx/abc123hash',
};

const SUBMISSION_FAILURE = {
  success: false,
  error: 'Submission failed: tx_bad_seq',
  explorerUrl: 'https://stellar.expert/explorer/testnet/tx/def456hash',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderAndRequestQuote() {
  render(<SwapWidget />);
  fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '100' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /get quote|review swap/i }));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockWallet.connected = true;
  mockWallet.publicKey = 'GABCDEF1234567890';
});

describe('SwapWidget – quote expiry', () => {
  it('rejects an expired quote and offers re-quoting', async () => {
    mockFetchQuote.mockResolvedValueOnce(makeQuote({ expiresAt: PAST }));

    await renderAndRequestQuote();

    // Expired quote must not allow signing.
    expect(mockSignTransaction).not.toHaveBeenCalled();

    // An expiry message and a re-quote control should be shown.
    expect(await screen.findByText(/quote (has )?expired/i)).toBeInTheDocument();
    const requoteBtn = screen.getByRole('button', { name: /re-?quote/i });
    expect(requoteBtn).toBeInTheDocument();

    // Re-quoting fetches a fresh quote.
    mockFetchQuote.mockResolvedValueOnce(makeQuote({ id: 'quote-2', expiresAt: FUTURE }));
    await act(async () => {
      fireEvent.click(requoteBtn);
    });

    await waitFor(() => {
      expect(mockFetchQuote).toHaveBeenCalledTimes(2);
    });
    expect(mockSignTransaction).not.toHaveBeenCalled();
  });
});

describe('SwapWidget – user rejection', () => {
  it('does not submit when the user rejects the signature request', async () => {
    mockFetchQuote.mockResolvedValueOnce(makeQuote());
    mockBuildTransaction.mockResolvedValueOnce({ xdr: 'AAAA...built-xdr' });
    mockSimulateTransaction.mockResolvedValueOnce(SIMULATION_SUCCESS);
    mockSignTransaction.mockRejectedValueOnce(new Error('User rejected the request'));

    await renderAndRequestQuote();

    // Signing only happens after a successful simulation.
    await waitFor(() => {
      expect(mockSimulateTransaction).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign|confirm swap/i }));
    });

    await waitFor(() => {
      expect(mockSignTransaction).toHaveBeenCalledTimes(1);
    });

    // No submission after rejection.
    expect(mockSubmitTransaction).not.toHaveBeenCalled();
    expect(await screen.findByText(/rejected|cancell?ed/i)).toBeInTheDocument();
  });
});

describe('SwapWidget – simulation failure', () => {
  it('does not request a signature when simulation fails', async () => {
    mockFetchQuote.mockResolvedValueOnce(makeQuote());
    mockBuildTransaction.mockResolvedValueOnce({ xdr: 'AAAA...built-xdr' });
    mockSimulateTransaction.mockResolvedValueOnce(SIMULATION_FAILURE);

    await renderAndRequestQuote();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign|confirm swap/i }));
    });

    await waitFor(() => {
      expect(mockSimulateTransaction).toHaveBeenCalledTimes(1);
    });

    // Critical acceptance criterion: no signature before successful simulation.
    expect(mockSignTransaction).not.toHaveBeenCalled();
    expect(mockSubmitTransaction).not.toHaveBeenCalled();

    expect(await screen.findByText(/simulation failed/i)).toBeInTheDocument();
  });
});

describe('SwapWidget – submission failure', () => {
  it('shows a failure state with an explorer link when submission fails', async () => {
    mockFetchQuote.mockResolvedValueOnce(makeQuote());
    mockBuildTransaction.mockResolvedValueOnce({ xdr: 'AAAA...built-xdr' });
    mockSimulateTransaction.mockResolvedValueOnce(SIMULATION_SUCCESS);
    mockSignTransaction.mockResolvedValueOnce({ signedXdr: 'AAAA...signed-xdr' });
    mockSubmitTransaction.mockResolvedValueOnce(SUBMISSION_FAILURE);
    mockReconcileTransaction.mockResolvedValueOnce({ status: 'failed' });

    await renderAndRequestQuote();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign|confirm swap/i }));
    });

    await waitFor(() => {
      expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText(/submission failed|transaction failed/i)).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /explorer|view transaction/i });
    expect(link).toHaveAttribute('href', SUBMISSION_FAILURE.explorerUrl);
  });
});

describe('SwapWidget – successful swap', () => {
  it('shows min received, price impact, slippage and route before signing', async () => {
    mockFetchQuote.mockResolvedValueOnce(makeQuote());
    mockBuildTransaction.mockResolvedValueOnce({ xdr: 'AAAA...built-xdr' });
    mockSimulateTransaction.mockResolvedValueOnce(SIMULATION_SUCCESS);
    mockSignTransaction.mockResolvedValueOnce({ signedXdr: 'AAAA...signed-xdr' });
    mockSubmitTransaction.mockResolvedValueOnce(SUBMISSION_SUCCESS);
    mockReconcileTransaction.mockResolvedValueOnce({ status: 'success' });

    await renderAndRequestQuote();

    // Details must be visible before any signature request.
    expect(mockSignTransaction).not.toHaveBeenCalled();
    expect(await screen.findByText(/min(imum)? received/i)).toBeInTheDocument();
    expect(screen.getByText(/price impact/i)).toBeInTheDocument();
    expect(screen.getByText(/slippage/i)).toBeInTheDocument();
    expect(screen.getByText(/route/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign|confirm swap/i }));
    });

    await waitFor(() => {
      expect(mockSignTransaction).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);
    });

    const link = await screen.findByRole('link', { name: /explorer|view transaction/i });
    expect(link).toHaveAttribute('href', SUBMISSION_SUCCESS.explorerUrl);
  });
});