import { afterEach, describe, expect, it, vi } from "vitest";

const configMock = vi.hoisted(() => ({ config: { apiUrl: "https://api.example" as string | undefined } }));
vi.mock("@/lib/config", () => configMock);
import { api, ApiError } from "@/lib/api/client";

const json = (body: unknown, status = 200, requestId = "req-response") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-request-id": requestId } });
const token = { contract: "C_TOKEN", symbol: "TKN", name: "Token", decimals: 7, verification: "onchain-metadata-only" };

describe("VELTRIXAE API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the versioned API prefix and validates responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ tokens: [token] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.tokens()).resolves.toEqual({ tokens: [token] });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.example/api/v1/tokens");
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("x-request-id")).toBeTruthy();
  });

  it("rejects invalid successful payloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ tokens: [{ symbol: "missing contract" }] })));
    await expect(api.tokens()).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
  });

  it("preserves backend error provenance", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({
      error: { code: "RATE_LIMITED", message: "Slow down", requestId: "req-backend", retryable: false },
    }, 429)));
    await expect(api.tokens()).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      requestId: "req-backend",
    });
  });

  it("never fabricates data when the API is unconfigured", async () => {
    const original = configMock.config.apiUrl;
    configMock.config.apiUrl = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(api.tokens()).rejects.toBeInstanceOf(ApiError);
      await expect(api.tokens()).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      configMock.config.apiUrl = original;
    }
  });
});
