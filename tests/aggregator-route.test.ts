import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/aggregator/[...path]/route";

type Handler = (request: NextRequest, context: { params: Promise<{ path: string[] }> }) => Promise<Response>;

const ORIGIN = "https://api.example";

const jsonResponse = (body: unknown, status = 200, requestId?: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...(requestId ? { "x-request-id": requestId } : {}) },
  });

const call = (
  path: string[],
  init: { method?: "GET" | "POST"; body?: string; search?: string; headers?: Record<string, string> } = {},
) => {
  const method = init.method ?? "GET";
  const request = new NextRequest(`https://app.example/api/aggregator/${path.join("/")}${init.search ?? ""}`, {
    method,
    body: init.body,
    headers: init.headers,
  });
  const handler: Handler = method === "POST" ? POST : GET;
  return handler(request, { params: Promise.resolve({ path }) });
};

const fetchMock = () => {
  const mock = vi.fn();
  vi.stubGlobal("fetch", mock);
  return mock;
};

const errorCode = async (response: Response) => {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
};

describe("aggregator proxy route", () => {
  beforeEach(() => {
    vi.stubEnv("VELTRIXAE_API_URL", ORIGIN);
    vi.stubEnv("NEXT_PUBLIC_VELTRIXAE_API_URL", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards an allowlisted GET with its query string and upstream status", async () => {
    const mock = fetchMock().mockResolvedValue(jsonResponse({ tokens: [] }, 200, "req-upstream"));

    const response = await call(["tokens"], { search: "?limit=5" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("req-upstream");
    await expect(response.json()).resolves.toEqual({ tokens: [] });

    const [url, init] = mock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("https://api.example/api/v1/tokens?limit=5");
    expect(init).toMatchObject({ method: "GET", cache: "no-store", redirect: "error" });
    const headers = new Headers(init.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
  });

  it("forwards a quote POST body as JSON", async () => {
    const mock = fetchMock().mockResolvedValue(jsonResponse({ quote: {} }, 201, "req-quote"));

    const response = await call(["quotes"], { method: "POST", body: '{"amount":"1"}' });

    expect(response.status).toBe(201);
    const [url, init] = mock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("https://api.example/api/v1/quotes");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"amount":"1"}');
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("does not forward browser credentials to the aggregator", async () => {
    const mock = fetchMock().mockResolvedValue(jsonResponse({}));

    await call(["tokens"], { headers: { cookie: "session=abc", authorization: "Bearer secret" } });

    const headers = new Headers((mock.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
  });

  it.each(["admin", "tokens/extra", "pools/not-a-contract"])(
    "rejects the unsupported endpoint %s without calling upstream",
    async (path: string) => {
      const mock = fetchMock();

      const response = await call([path]);

      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(errorCode(response)).resolves.toBe("NOT_FOUND");
      expect(mock).not.toHaveBeenCalled();
    },
  );

  it("rejects a write endpoint over GET and a read endpoint over POST", async () => {
    const mock = fetchMock();

    const write = await call(["quotes"]);
    expect(write.status).toBe(405);
    await expect(errorCode(write)).resolves.toBe("METHOD_NOT_ALLOWED");

    const read = await call(["tokens"], { method: "POST", body: "{}" });
    expect(read.status).toBe(405);
    await expect(errorCode(read)).resolves.toBe("METHOD_NOT_ALLOWED");

    expect(mock).not.toHaveBeenCalled();
  });

  it("reports the missing backend configuration", async () => {
    vi.stubEnv("VELTRIXAE_API_URL", "");
    const mock = fetchMock();

    const response = await call(["tokens"]);

    expect(response.status).toBe(503);
    await expect(errorCode(response)).resolves.toBe("NOT_CONFIGURED");
    expect(mock).not.toHaveBeenCalled();
  });

  it.each(["http://api.example", "https://user:secret@api.example"])(
    "rejects the unsafe backend URL %s",
    async (origin: string) => {
      vi.stubEnv("VELTRIXAE_API_URL", origin);
      const mock = fetchMock();

      const response = await call(["tokens"]);

      expect(response.status).toBe(503);
      await expect(errorCode(response)).resolves.toBe("INVALID_CONFIG");
      expect(mock).not.toHaveBeenCalled();
    },
  );

  it("allows a local HTTP backend", async () => {
    vi.stubEnv("VELTRIXAE_API_URL", "http://127.0.0.1:3100");
    const mock = fetchMock().mockResolvedValue(jsonResponse({ status: "ok" }));

    const response = await call(["health"]);

    expect(response.status).toBe(200);
    expect(String(mock.mock.calls[0][0])).toBe("http://127.0.0.1:3100/api/v1/health");
  });

  it("accepts a body at the size limit and rejects one byte more", async () => {
    const mock = fetchMock().mockResolvedValue(jsonResponse({ quote: {} }));

    const accepted = await call(["quotes"], { method: "POST", body: "a".repeat(16384) });
    expect(accepted.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(1);

    const rejected = await call(["quotes"], { method: "POST", body: "a".repeat(16385) });
    expect(rejected.status).toBe(413);
    await expect(errorCode(rejected)).resolves.toBe("INVALID_REQUEST");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("maps a non-JSON upstream response to INVALID_UPSTREAM", async () => {
    fetchMock().mockResolvedValue(
      new Response("<html>maintenance</html>", { status: 200, headers: { "content-type": "text/html" } }),
    );

    const response = await call(["tokens"]);

    expect(response.status).toBe(502);
    await expect(errorCode(response)).resolves.toBe("INVALID_UPSTREAM");
  });

  it.each([["fetch failed"], ["unexpected redirect"]])(
    "maps the upstream transport failure (%s) to API_UNAVAILABLE",
    async (reason: string) => {
      fetchMock().mockRejectedValue(new TypeError(reason));

      const response = await call(["tokens"]);

      expect(response.status).toBe(503);
      await expect(errorCode(response)).resolves.toBe("API_UNAVAILABLE");
    },
  );
});
