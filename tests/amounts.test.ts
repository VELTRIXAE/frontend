import { describe, expect, it } from "vitest";
import { fromBaseUnits, quoteRate, toBaseUnits } from "@/lib/amounts";

describe("exact token amount conversion", () => {
  it("converts decimals without floating point arithmetic", () => expect(toBaseUnits("12.345", 7)).toBe("123450000"));
  it("rejects excess token precision", () => expect(() => toBaseUnits("1.00000001", 7)).toThrow(/7 decimal/));
  it("formats integer base units", () => expect(fromBaseUnits("123450000", 7)).toBe("12.345"));
  it("computes a display rate with bigint arithmetic", () => expect(quoteRate("10000000", 7, "2500000", 6)).toBe("2.5"));
});
