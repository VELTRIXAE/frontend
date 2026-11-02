import { describe, expect, it } from "vitest";
import { fromBaseUnits, quoteRate, toBaseUnits } from "@/lib/amounts";
import {
  calculateDepositRatio,
  calculateExpectedShares,
  calculateMinimumOutputs,
  checkSufficientBalance,
} from "@/lib/liquidity";

describe("exact token amount conversion", () => {
  it("converts decimals without floating point arithmetic", () => expect(toBaseUnits("12.345", 7)).toBe("123450000"));
  it("rejects excess token precision", () => expect(() => toBaseUnits("1.00000001", 7)).toThrow(/7 decimal/));
  it("formats integer base units", () => expect(fromBaseUnits("123450000", 7)).toBe("12.345"));
  it("computes a display rate with bigint arithmetic", () => expect(quoteRate("10000000", 7, "2500000", 6)).toBe("2.5"));
  it("rejects malformed decimals", () => expect(() => toBaseUnits("1e3", 7)).toThrow(/valid decimal/));
  it("formats zero-decimal and invalid values", () => { expect(fromBaseUnits("42", 0)).toBe("42"); expect(fromBaseUnits("bad", 7)).toBe("—"); });
  it("does not divide by zero", () => expect(quoteRate("0", 7, "1", 7)).toBe("—"));
});

describe("deposit ratio calculation", () => {
  it("derives the paired deposit amount from reserves", () => {
    // reserves 1000 / 2000, depositing 100 of token A => 200 of token B
    const ratio = calculateDepositRatio("100", "1000", "2000");
    expect(ratio).toBe("200");
  });

  it("rounds paired deposits up to avoid under-depositing", () => {
    // 3 * 1000 / 7 = 428.57 => ceil 429
    const ratio = calculateDepositRatio("3", "7", "1000");
    expect(ratio).toBe("429");
  });

  it("returns zero when the deposit amount is zero", () => {
    expect(calculateDepositRatio("0", "1000", "2000")).toBe("0");
  });

  it("throws when reserves are zero", () => {
    expect(() => calculateDepositRatio("100", "0", "2000")).toThrow(/reserve/i);
    expect(() => calculateDepositRatio("100", "1000", "0")).toThrow(/reserve/i);
  });

  it("rejects malformed reserve values", () => {
    expect(() => calculateDepositRatio("100", "bad", "2000")).toThrow(/reserve/i);
  });
});

describe("expected pool share calculation", () => {
  it("computes shares proportional to existing supply", () => {
    // deposit 100 into reserve 1000 with supply 5000 => 500 shares
    expect(calculateExpectedShares("100", "1000", "5000")).toBe("500");
  });

  it("floors fractional shares", () => {
    // 3 * 5000 / 7 = 2142.85 => floor 2142
    expect(calculateExpectedShares("3", "7", "5000")).toBe("2142");
  });

  it("returns zero shares for a zero deposit", () => {
    expect(calculateExpectedShares("0", "1000", "5000")).toBe("0");
  });

  it("throws when the reserve is zero", () => {
    expect(() => calculateExpectedShares("100", "0", "5000")).toThrow(/reserve/i);
  });

  it("throws when total supply is zero", () => {
    expect(() => calculateExpectedShares("100", "1000", "0")).toThrow(/supply/i);
  });
});

describe("minimum output calculation", () => {
  it("applies slippage tolerance with floor rounding", () => {
    // 1000 with 1% slippage => 990
    expect(calculateMinimumOutputs("1000", 100)).toBe("990");
  });

  it("floors fractional minimums", () => {
    // 999 * (10000 - 100) / 10000 = 989.01 => 989
    expect(calculateMinimumOutputs("999", 100)).toBe("989");
  });

  it("returns the full amount with zero slippage", () => {
    expect(calculateMinimumOutputs("1000", 0)).toBe("1000");
  });

  it("rejects out-of-range slippage", () => {
    expect(() => calculateMinimumOutputs("1000", -1)).toThrow(/slippage/i);
    expect(() => calculateMinimumOutputs("1000", 10000)).toThrow(/slippage/i);
  });
});

describe("balance sufficiency checks", () => {
  it("passes when balance covers the required amount", () => {
    expect(checkSufficientBalance("1000", "1000")).toEqual({ ok: true });
    expect(checkSufficientBalance("1500", "1000")).toEqual({ ok: true });
  });

  it("reports an actionable insufficient balance error", () => {
    const result = checkSufficientBalance("500", "1000");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/insufficient balance/i);
      expect(result.error).toMatch(/500/);
      expect(result.error).toMatch(/1000/);
    }
  });

  it("rejects malformed balances", () => {
    const result = checkSufficientBalance("bad", "1000");
    expect(result.ok).toBe(false);
  });
});