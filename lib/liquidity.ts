const integer = (value: string, label: string): bigint => {
  if (!/^\d+$/.test(value)) throw new Error(`${label} must be a non-negative integer.`);
  return BigInt(value);
};

export function calculateDepositRatio(amount: string, reserveIn: string, reserveOut: string): string {
  const deposit = integer(amount, "Deposit amount");
  const input = integer(reserveIn, "Input reserve");
  const output = integer(reserveOut, "Output reserve");
  if (input === 0n || output === 0n) throw new Error("Pool reserves must be greater than zero.");
  return ((deposit * output + input - 1n) / input).toString();
}

export function calculateExpectedShares(amount: string, reserve: string, totalSupply: string): string {
  const deposit = integer(amount, "Deposit amount");
  const poolReserve = integer(reserve, "Pool reserve");
  const supply = integer(totalSupply, "Pool share supply");
  if (poolReserve === 0n) throw new Error("Pool reserve must be greater than zero.");
  if (supply === 0n) throw new Error("Pool share supply must be greater than zero.");
  return ((deposit * supply) / poolReserve).toString();
}

export function calculateMinimumOutputs(amount: string, slippageBps: number): string {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
    throw new Error("Slippage must be an integer between 0 and 9999 basis points.");
  }
  return ((integer(amount, "Output amount") * BigInt(10_000 - slippageBps)) / 10_000n).toString();
}

export function checkSufficientBalance(balance: string, required: string): { ok: true } | { ok: false; error: string } {
  try {
    const available = integer(balance, "Balance");
    const needed = integer(required, "Required amount");
    return available >= needed
      ? { ok: true }
      : { ok: false, error: `Insufficient balance: ${available} available, ${needed} required.` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid balance." };
  }
}
