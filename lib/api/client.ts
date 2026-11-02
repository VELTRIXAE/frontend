import { config } from "@/lib/config";
import { marketSchema, marketsResponseSchema, networkStatusSchema, overviewSchema, poolSchema, poolSnapshotSchema, portfolioHistoryResponseSchema, preparedSwapSchema, priceSnapshotSchema, quoteRequestSchema, quoteSchema, tokenSchema, tokensResponseSchema, transactionStatusSchema, type QuoteRequest } from "./schemas";
import { z } from "zod";

const errorEnvelopeSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export class ApiError extends Error {
  constructor(message: string, public status: number, public code = "API_ERROR", public retryable = false) {
    super(message); this.name = "ApiError";
  }
}

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit, retries = 1): Promise<T> {
  if (!config.apiUrl) throw new ApiError("VELTRIXAE API is not configured.", 503, "NOT_CONFIGURED");
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const timeout = AbortSignal.timeout(12_000);
      const signal = init?.signal ? AbortSignal.any([timeout, init.signal]) : timeout;
      const response = await fetch(new URL(`/api/v1/${path}`, config.apiUrl), {
        ...init,
        headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
        signal,
        cache: "no-store",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsedError = errorEnvelopeSchema.safeParse(body);
        throw new ApiError(parsedError.success ? parsedError.data.error.message : `Request failed (${response.status}).`, response.status, parsedError.success ? parsedError.data.error.code : "API_ERROR", response.status >= 500);
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new ApiError("The API returned an invalid response.", 502, "INVALID_RESPONSE");
      return parsed.data;
    } catch (error) {
      lastError = error;
      if (init?.signal?.aborted) throw error;
      const retryable = error instanceof ApiError ? error.retryable : error instanceof TypeError;
      if (!retryable || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 350 * 2 ** attempt));
    }
  }
  if (lastError instanceof ApiError) throw lastError;
  if (lastError instanceof DOMException && lastError.name === "TimeoutError") throw new ApiError("The VELTRIXAE API timed out.", 504, "REQUEST_TIMEOUT", true);
  throw new ApiError("The VELTRIXAE API could not be reached.", 503, "API_UNAVAILABLE", true);
}

export const api = {
  tokens: (signal?: AbortSignal) => request("tokens", tokensResponseSchema, { signal }),
  pools: (signal?: AbortSignal) => request("pools", poolSnapshotSchema, { signal }),
  pool: (id: string, signal?: AbortSignal) => request(`pools/${encodeURIComponent(id)}`, z.object({ pool: poolSchema }), { signal }),
  quote: (payload: QuoteRequest, signal?: AbortSignal) => request("quotes", quoteSchema, { method: "POST", body: JSON.stringify(quoteRequestSchema.parse(payload)), signal }, 0),
  prepareSwap: (payload: QuoteRequest, publicKey: string, signal?: AbortSignal) => request("swaps/prepare", preparedSwapSchema, { method: "POST", body: JSON.stringify({ quote: quoteRequestSchema.parse(payload), publicKey }), signal }, 0),
  markets: (signal?: AbortSignal) => request("markets", marketsResponseSchema, { signal }),
  transaction: (hash: string, signal?: AbortSignal) => request(`transactions/${encodeURIComponent(hash)}`, transactionStatusSchema, { signal }),
  network: (signal?: AbortSignal) => request("network/status", networkStatusSchema, { signal }),
  overview: (signal?: AbortSignal) => request("analytics/overview", overviewSchema, { signal }),
  prices: (signal?: AbortSignal) => request("prices", priceSnapshotSchema, { signal }),
  portfolioHistory: (signal?: AbortSignal) => request("portfolio/history", portfolioHistoryResponseSchema, { signal }),
};

export const apiSchemas = { tokenSchema, marketSchema, priceSnapshotSchema, portfolioHistoryResponseSchema };
