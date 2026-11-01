import { config } from "@/lib/config";
import { assetSchema, poolSchema, quoteRequestSchema, quoteSchema, transactionBuildSchema, type QuoteRequest } from "./schemas";
import { z } from "zod";

export class ApiError extends Error { constructor(message: string, public status: number, public retryable = false) { super(message); } }

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit, retries = 2): Promise<T> {
  if (!config.apiUrl) throw new ApiError("VELTRIXAE API is not configured.", 503);
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${config.apiUrl}${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers }, signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new ApiError(`Request failed (${response.status}).`, response.status, response.status >= 500);
      return schema.parse(await response.json());
    } catch (error) {
      lastError = error;
      const retryable = error instanceof ApiError ? error.retryable : error instanceof TypeError;
      if (!retryable || attempt === retries) break;
      await new Promise(resolve => setTimeout(resolve, 350 * 2 ** attempt));
    }
  }
  if (lastError instanceof z.ZodError) throw new ApiError("The API returned an invalid response.", 502);
  if (lastError instanceof ApiError) throw lastError;
  throw new ApiError("The VELTRIXAE API could not be reached.", 503, true);
}

export const api = {
  assets: () => request("/v1/assets", z.array(assetSchema)),
  pools: () => request("/v1/pools", z.array(poolSchema)),
  quote: (payload: QuoteRequest) => request("/v1/swap/quote", quoteSchema, { method: "POST", body: JSON.stringify(quoteRequestSchema.parse(payload)) }),
  buildSwap: (quoteId: string, account: string) => request("/v1/swap/build", transactionBuildSchema, { method: "POST", body: JSON.stringify({ quoteId, account }) }),
  submit: (signedXdr: string) => request("/v1/transactions/submit", z.object({ hash: z.string(), ledger: z.number().optional() }), { method: "POST", body: JSON.stringify({ signedXdr }) }, 0),
};
