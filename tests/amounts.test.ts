import { describe, expect, it } from "vitest";
import { fromBaseUnits, quoteRate, toBaseUnits } from "@/lib/amounts";

describe("exact token amount conversion", () => {
  it("converts decimals without floating point arithmetic", () => expect(toBaseUnits("12.345", 7)).toBe("123450000"));
  it("rejects excess token precision", () => expect(() => toBaseUnits("1.00000001", 7)).toThrow(/7 decimal/));
  it("formats integer base units", () => expect(fromBaseUnits("123450000", 7)).toBe("12.345"));
  it("computes a display rate with bigint arithmetic", () => expect(quoteRate("10000000", 7, "2500000", 6)).toBe("2.5"));
  it("rejects malformed decimals", () => expect(() => toBaseUnits("1e3", 7)).toThrow(/valid decimal/));
  it("formats zero-decimal and invalid values", () => { expect(fromBaseUnits("42", 0)).toBe("42"); expect(fromBaseUnits("bad", 7)).toBe("—"); });
  it("does not divide by zero", () => expect(quoteRate("0", 7, "1", 7)).toBe("—"));
});
