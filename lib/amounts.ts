export function toBaseUnits(value: string, decimals: number): string {
  const match = value.trim().match(/^(\d+)(?:\.(\d*))?$/);
  if (!match) throw new Error("Enter a valid decimal amount.");
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) throw new Error(`This asset supports up to ${decimals} decimal places.`);
  const units = `${match[1]}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  return units || "0";
}

export function fromBaseUnits(value: string, decimals: number, maximumFractionDigits = decimals): string {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  if (!/^\d+$/.test(digits)) return "—";
  const padded = digits.padStart(decimals + 1, "0");
  const integer = decimals ? padded.slice(0, -decimals) : padded;
  const fraction = decimals ? padded.slice(-decimals).slice(0, maximumFractionDigits).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

export function quoteRate(amountIn: string, inputDecimals: number, amountOut: string, outputDecimals: number, precision = 6): string {
  const denominator = BigInt(amountIn) * 10n ** BigInt(outputDecimals);
  if (denominator === 0n) return "—";
  const numerator = BigInt(amountOut) * 10n ** BigInt(inputDecimals) * 10n ** BigInt(precision);
  return fromBaseUnits((numerator / denominator).toString(), precision, precision);
}

export interface PoolReserves {
  reserveA: string;
  reserveB: string;
  totalShares: string;
}

export interface DepositRatio {
  /** Base units of token B required to match the given amount of token A at the current reserve ratio. */
  amountB: string;
  /** Base units of token A required to match the given amount of token B at the current reserve ratio. */
  amountA: string;
  /** Ratio of reserve A to reserve B expressed as a decimal string. */
  ratio: string;
}

function parseBaseUnits(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) throw new Error("Amount must be a non-negative integer in base units.");
  return BigInt(trimmed);
}

function assertPositiveReserves(reserves: PoolReserves): void {
  if (parseBaseUnits(reserves.reserveA) <= 0n || parseBaseUnits(reserves.reserveB) <= 0n) {
    throw new Error("Pool reserves are empty; a new pool must be initialized first.");
  }
}

/**
 * Compute the matching deposit amount for the opposite token given the current reserves.
 * Uses floor division so the computed amount never exceeds the pool ratio.
 */
export function calculateDepositRatio(reserves: PoolReserves, amount: string, side: "A" | "B", precision = 6): DepositRatio {
  assertPositiveReserves(reserves);
  const reserveA = parseBaseUnits(reserves.reserveA);
  const reserveB = parseBaseUnits(reserves.reserveB);
  const input = parseBaseUnits(amount);
  if (input <= 0n) throw new Error("Deposit amount must be greater than zero.");

  const amountA = side === "A" ? input : (input * reserveA) / reserveB;
  const amountB = side === "B" ? input : (input * reserveB) / reserveA;

  const scale = 10n ** BigInt(precision);
  const ratio = fromBaseUnits(((reserveA * scale) / reserveB).toString(), precision, precision);

  return { amountA: amountA.toString(), amountB: amountB.toString(), ratio };
}

/**
 * Expected pool shares minted for a deposit, proportional to the deposit relative to reserves.
 * Returns "0" when the pool has no shares yet (initial deposit handled by caller).
 */
export function calculateExpectedShares(reserves: PoolReserves, depositA: string, depositB: string): string {
  assertPositiveReserves(reserves);
  const reserveA = parseBaseUnits(reserves.reserveA);
  const reserveB = parseBaseUnits(reserves.reserveB);
  const totalShares = parseBaseUnits(reserves.totalShares);
  const a = parseBaseUnits(depositA);
  const b = parseBaseUnits(depositB);
  if (a <= 0n || b <= 0n) throw new Error("Both deposit amounts must be greater than zero.");
  if (totalShares <= 0n) return "0";

  const sharesFromA = (a * totalShares) / reserveA;
  const sharesFromB = (b * totalShares) / reserveB;
  return (sharesFromA < sharesFromB ? sharesFromA : sharesFromB).toString();
}

/**
 * Compute the minimum acceptable output given a quoted amount and a slippage tolerance in basis points.
 * Uses floor division so the minimum never exceeds the quote.
 */
export function calculateMinimumOutput(quotedAmount: string, slippageBps: number): string {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
    throw new Error("Slippage must be an integer between 0 and 10000 basis points.");
  }
  const quoted = parseBaseUnits(quotedAmount);
  const bps = BigInt(slippageBps);
  return ((quoted * (10_000n - bps)) / 10_000n).toString();
}

/**
 * Expected amounts returned when removing a given number of pool shares.
 * Returns proportional amounts of both reserves.
 */
export function calculateWithdrawalAmounts(reserves: PoolReserves, shares: string): { amountA: string; amountB: string } {
  assertPositiveReserves(reserves);
  const totalShares = parseBaseUnits(reserves.totalShares);
  if (totalShares <= 0n) throw new Error("Pool has no outstanding shares.");
  const burn = parseBaseUnits(shares);
  if (burn <= 0n) throw new Error("Withdrawal amount must be greater than zero.");
  if (burn > totalShares) throw new Error("Cannot remove more shares than are outstanding.");

  const reserveA = parseBaseUnits(reserves.reserveA);
  const reserveB = parseBaseUnits(reserves.reserveB);
  return {
    amountA: ((burn * reserveA) / totalShares).toString(),
    amountB: ((burn * reserveB) / totalShares).toString(),
  };
}

/**
 * Validate a requested deposit against the caller's balance and the pool reserves.
 * Returns a list of actionable error messages; empty when the deposit is valid.
 */
export function validateDepositAmounts(
  reserves: PoolReserves,
  depositA: string,
  depositB: string,
  balanceA: string,
  balanceB: string,
): string[] {
  const errors: string[] = [];
  const a = parseBaseUnits(depositA);
  const b = parseBaseUnits(depositB);
  if (a <= 0n) errors.push("Deposit amount for the first asset must be greater than zero.");
  if (b <= 0n) errors.push("Deposit amount for the second asset must be greater than zero.");
  if (a > parseBaseUnits(balanceA)) errors.push("Insufficient balance for the first asset. Reduce the deposit amount.");
  if (b > parseBaseUnits(balanceB)) errors.push("Insufficient balance for the second asset. Reduce the deposit amount.");
  if (parseBaseUnits(reserves.reserveA) <= 0n || parseBaseUnits(reserves.reserveB) <= 0n) {
    errors.push("Pool reserves are empty; a new pool must be initialized first.");
  }
  return errors;
}

/**
 * Validate a requested withdrawal against the caller's share balance.
 * Returns a list of actionable error messages; empty when the withdrawal is valid.
 */
export function validateWithdrawalAmount(reserves: PoolReserves, shares: string, shareBalance: string): string[] {
  const errors: string[] = [];
  const burn = parseBaseUnits(shares);
  if (burn <= 0n) errors.push("Withdrawal amount must be greater than zero.");
  if (burn > parseBaseUnits(shareBalance)) errors.push("Insufficient pool shares. Reduce the withdrawal amount.");
  if (burn > parseBaseUnits(reserves.totalShares)) errors.push("Cannot remove more shares than are outstanding.");
  return errors;
}