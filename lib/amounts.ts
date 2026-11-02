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
