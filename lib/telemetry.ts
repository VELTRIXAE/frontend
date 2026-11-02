// lib/telemetry.ts
//
// Privacy-conscious telemetry utilities.
//
// Responsibilities:
//   - Scrub wallet secrets, signed XDR, and sensitive account data before
//     anything is reported.
//   - Report frontend errors and web vitals to a configurable sink.
//   - Correlate frontend errors with backend request identifiers.
//
// Design notes:
//   - Telemetry is disabled by default and only enabled when an explicit
//     endpoint is configured (see `TELEMETRY_ENDPOINT`).
//   - All payloads pass through `scrubTelemetryPayload` before being sent.
//   - No wallet secrets, signed XDR, or sensitive account data may ever leave
//     the browser. Scrubbing is best-effort defense-in-depth on top of callers
//     never passing secrets in the first place.

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type TelemetryLevel = "debug" | "info" | "warning" | "error" | "fatal";

export interface WebVitalMetric {
  /** Metric name, e.g. "CLS", "FID", "LCP", "FCP", "TTFB", "INP". */
  name: string;
  /** Metric value. */
  value: number;
  /** Rating as reported by web-vitals, e.g. "good" | "needs-improvement" | "poor". */
  rating?: string;
  /** Delta since the last report for this metric, if available. */
  delta?: number;
  /** Metric identifier. */
  id?: string;
  /** Navigation type, e.g. "navigate" | "reload" | "back-forward-cache". */
  navigationType?: string;
}

export interface TelemetryContext {
  /** Backend request identifier (e.g. `X-Request-Id`) for correlation. */
  requestId?: string;
  /** Trace identifier propagated from the backend, if present. */
  traceId?: string;
  /** Route or page path (without query string). */
  route?: string;
  /** Release / build identifier. */
  release?: string;
  /** Environment name, e.g. "production" | "staging" | "preview". */
  environment?: string;
  /** Arbitrary additional, already-safe metadata. */
  [key: string]: unknown;
}

export interface TelemetryErrorReport {
  level: TelemetryLevel;
  message: string;
  name?: string;
  stack?: string;
  /** Component or subsystem that produced the error. */
  source?: string;
  context?: TelemetryContext;
  /** Timestamp in milliseconds since epoch. */
  timestamp: number;
}

export interface TelemetryEvent {
  type: "error" | "web-vital" | "event";
  payload: Record<string, unknown>;
  context?: TelemetryContext;
  timestamp: number;
}

export interface TelemetryOptions {
  /** Endpoint that receives telemetry. When unset, telemetry is disabled. */
  endpoint?: string;
  /** Release / build identifier attached to every event. */
  release?: string;
  /** Environment name attached to every event. */
  environment?: string;
  /** Sampling rate for non-error events (0..1). Errors are always sampled. */
  sampleRate?: number;
  /** Maximum number of events buffered before flushing. */
  maxBufferSize?: number;
  /** Flush interval in milliseconds. */
  flushIntervalMs?: number;
  /** Whether to install global error handlers. Defaults to true. */
  captureGlobalErrors?: boolean;
  /** Custom fetch implementation (useful for tests). */
  fetchImpl?: typeof fetch;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const REDACTED = "[REDACTED]";

/** Keys whose values must never be reported. */
const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /secret/i,
  /private[_-]?key/i,
  /seed/i,
  /mnemonic/i,
  /passphrase/i,
  /password/i,
  /signature/i,
  /signed[_-]?xdr/i,
  /xdr/i,
  /envelope/i,
  /auth[_-]?token/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /bearer/i,
  /cookie/i,
  /authorization/i,
  /session/i,
  /api[_-]?key/i,
  /account[_-]?id/i,
  /public[_-]?key/i,
  /wallet/i,
  /address/i,
  /balance/i,
];

/** String patterns that look like secrets or signed payloads. */
const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  // Stellar secret seeds (S... 56 chars).
  /\bS[A-Z2-7]{55}\b/g,
  // Stellar public keys (G... 56 chars).
  /\bG[A-Z2-7]{55}\b/g,
  // Base64 blobs that look like signed XDR envelopes (long base64 strings).
  /\b[A-Za-z0-9+/]{120,}={0,2}\b/g,
  // Bearer tokens.
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  // JWT-like tokens.
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  // Hex-encoded secrets of significant length.
  /\b[0-9a-fA-F]{64,}\b/g,
];

const DEFAULT_MAX_BUFFER_SIZE = 20;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_SAMPLE_RATE = 1;

/* -------------------------------------------------------------------------- */
/* Scrubbing                                                                  */
/* -------------------------------------------------------------------------- */

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function scrubString(value: string): string {
  let result = value;
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  return result;
}

/**
 * Recursively scrub a value so it is safe to transmit.
 *
 * - Sensitive keys are replaced with `[REDACTED]`.
 * - Strings are scanned for secret-like patterns.
 * - Functions, symbols, and other non-serializable values are dropped.
 * - Depth and array length are bounded to avoid runaway payloads.
 */
export function scrubTelemetryValue(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return "[TRUNCATED]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  const type = typeof value;

  if (type === "string") {
    return scrubString(value as string);
  }

  if (type === "number" || type === "boolean") {
    return value;
  }

  if (type === "bigint") {
    return (value as bigint).toString();
  }

  if (type === "function" || type === "symbol") {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => scrubTelemetryValue(item, depth + 1));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message),
      stack: value.stack ? scrubString(value.stack) : undefined,
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (type === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        result[key] = REDACTED;
        continue;
      }
      const scrubbed = scrubTelemetryValue(entry, depth + 1);
      if (scrubbed !== undefined) {
        result[key] = scrubbed;
      }
    }
    return result;
  }

  return undefined;
}

/**
 * Scrub an arbitrary telemetry payload. Always returns a plain object safe to
 * serialize and transmit.
 */
export function scrubTelemetryPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const scrubbed = scrubTelemetryValue(payload);
  if (scrubbed && typeof scrubbed === "object" && !Array.isArray(scrubbed)) {
    return scrubbed as Record<string, unknown>;
  }
  return {};
}

/* -------------------------------------------------------------------------- */
/* Request ID correlation                                                     */
/* -------------------------------------------------------------------------- */

const REQUEST_ID_HEADER = "x-request-id";
const TRACE_ID_HEADER = "x-trace-id";

/**
 * Extract backend request identifiers from a `Response` or `Headers` object.
 */
export function extractRequestIds(
  source: Response | Headers | undefined | null,
): Pick<TelemetryContext, "requestId" | "traceId"> {
  if (!source) {
    return {};
  }

  const headers = source instanceof Headers ? source : source.headers;
  if (!headers || typeof headers.get !== "function") {
    return {};
  }

  const requestId = headers.get(REQUEST_ID_HEADER) ?? undefined;
  const traceId = headers.get(TRACE_ID_HEADER) ?? undefined;

  return {
    requestId: requestId ? scrubString(requestId) : undefined,
    traceId: traceId ? scrubString(traceId) : undefined,
  };
}

/**
 * Wrap a fetch implementation so that backend request identifiers are captured
 * and made available for correlation with subsequent error reports.
 */
export function createCorrelatedFetch(
  baseFetch: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const response = await baseFetch(input, init);
    const ids = extractRequestIds(response);
    if (ids.requestId || ids.traceId) {
      lastRequestContext = { ...lastRequestContext, ...ids };
    }
    return response;
  };
}

let lastRequestContext: Pick<TelemetryContext, "requestId" | "traceId"> = {};

/**
 * Return the most recently observed backend request identifiers.
 */
export function getLastRequestContext(): Pick<
  TelemetryContext,
  "requestId" | "traceId"
> {
  return { ...lastRequestContext };
}

/**
 * Manually record backend request identifiers for correlation.
 */
export function setRequestContext(
  context: Pick<TelemetryContext, "requestId" | "traceId">,
): void {
  lastRequestContext = {
    requestId: context.requestId ? scrubString(context.requestId) : undefined,
    traceId: context.traceId ? scrubString(context.traceId) : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Telemetry client                                                           */
/* -------------------------------------------------------------------------- */

export class TelemetryClient {
  private readonly endpoint?: string;
  private readonly release?: string;
  private readonly environment?: string;
  private readonly sampleRate: number;
  private readonly maxBufferSize: number;
  private readonly flushIntervalMs: number;
  private readonly fetchImpl: typeof fetch;
  private buffer: TelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private globalHandlersInstalled = false;

  constructor(options: TelemetryOptions = {}) {
    this.endpoint = options.endpoint;
    this.release = options.release;
    this.environment = options.environment;
    this.sampleRate = clamp(options.sampleRate ?? DEFAULT_SAMPLE_RATE, 0, 1);
    this.maxBufferSize = Math.max(1, options.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE);
    this.flushIntervalMs = Math.max(
      250,
      options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
    );
    this.fetchImpl = options.fetchImpl ?? fetch;

    if (options.captureGlobalErrors !== false) {
      this.installGlobalHandlers();
    }

    if (this.enabled) {
      this.startFlushTimer();
    }
  }

  /** Whether telemetry is configured and will transmit events. */
  get enabled(): boolean {
    return typeof this.endpoint === "string" && this.endpoint.length > 0;
  }

  /** Report an error, correlating with the last known backend request ID. */
  reportError(
    error: unknown,
    context: TelemetryContext = {},
    level: TelemetryLevel = "error",
  ): void {
    const normalized = normalizeError(error);
    const mergedContext: TelemetryContext = {
      ...getLastRequestContext(),
      release: this.release,
      environment: this.environment,
      ...context,
    };

    const report: TelemetryErrorReport = {
      level,
      message: scrubString(normalized.message),
      name: normalized.name,
      stack: normalized.stack ? scrubString(normalized.stack) : undefined,
      source: context.source as string | undefined,
      context: scrubTelemetryPayload(mergedContext) as TelemetryContext,
      timestamp: Date.now(),
    };

    this.enqueue({
      type: "error",
      payload: report as unknown as Record<string, unknown>,
      context: report.context,
      timestamp: report.timestamp,
    });
  }

  /** Report a web vitals metric. */
  reportWebVital(metric: WebVitalMetric, context: TelemetryContext = {}): void {
    if (!this.shouldSample()) {
      return;
    }

    const mergedContext: TelemetryContext = {
      ...getLastRequestContext(),
      release: this.release,
      environment: this.environment,
      ...context,
    };

    this.enqueue({
      type: "web-vital",
      payload: scrubTelemetryPayload({
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
        delta: metric.delta,
        id: metric.id,
        navigationType: metric.navigationType,
      }),
      context: scrubTelemetryPayload(mergedContext) as TelemetryContext,
      timestamp: Date.now(),
    });
  }

  /** Report a generic, already-safe event. */
  reportEvent(
    name: string,
    data: Record<string, unknown> = {},
    context: TelemetryContext = {},
  ): void {
    if (!this.shouldSample()) {
      return;
    }

    const mergedContext: TelemetryContext = {
      ...getLastRequestContext(),
      release: this.release,
      environment: this.environment,
      ...context,
    };

    this.enqueue({
      type: "event",
      payload: scrubTelemetryPayload({ name, ...data }),
      context: scrubTelemetryPayload(mergedContext) as TelemetryContext,
      timestamp: Date.now(),
    });
  }

  /** Flush any buffered events immediately. */
  async flush(): Promise<void> {
    if (!this.enabled || this.buffer.length === 0) {
      return;
    }

    const events = this.buffer;
    this.buffer = [];

    try {
      await this.fetchImpl(this.endpoint as string, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events }),
        keepalive: true,
      });
    } catch {
      // Telemetry must never throw into application code. Drop on failure.
    }
  }

  /** Stop timers and flush remaining events. */
  async dispose(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  private shouldSample(): boolean {
    if (this.sampleRate >= 1) {
      return true;
    }
    if (this.sampleRate <= 0) {
      return false;
    }
    return Math.random() < this.sampleRate;
  }

  private enqueue(event: TelemetryEvent): void {
    if (!this.enabled) {
      return;
    }

    this.buffer.push(event);

    if (this.buffer.length >= this.maxBufferSize) {
      void this.flush();
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer || typeof setInterval !== "function") {
      return;
    }
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
    // Do not keep the process alive solely for telemetry.
    const timer = this.flushTimer as unknown as { unref?: () => void };
    if (typeof timer.unref === "function") {
      timer.unref();
    }
  }

  private installGlobalHandlers(): void {
    if (this.globalHandlersInstalled || typeof window === "undefined") {
      return;
    }
    this.globalHandlersInstalled = true;

    window.addEventListener("error", (event) => {
      this.reportError(event.error ?? event.message, {
        source: "window.error",
        route: safeLocationPath(),
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      this.reportError(event.reason, {
        source: "window.unhandledrejection",
        route: safeLocationPath(),
      });
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function normalizeError(error: unknown): {
  name?: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

function safeLocationPath(): string | undefined {
  if (typeof window === "undefined" || !window.location) {
    return undefined;
  }
  // Never report query strings or hashes; they may contain sensitive data.
  return window.location.pathname;
}

/* -------------------------------------------------------------------------- */
/* Default singleton                                                          */
/* -------------------------------------------------------------------------- */

let defaultClient: TelemetryClient | null = null;

/**
 * Return the shared telemetry client, creating it on first use.
 *
 * The endpoint is read from `NEXT_PUBLIC_TELEMETRY_ENDPOINT` (or
 * `TELEMETRY_ENDPOINT`). When unset, telemetry is disabled.
 */
export function getTelemetryClient(): TelemetryClient {
  if (defaultClient) {
    return defaultClient;
  }

  const env =
    typeof process !== "undefined" && process.env ? process.env : ({} as NodeJS.ProcessEnv);

  defaultClient = new TelemetryClient({
    endpoint:
      env.NEXT_PUBLIC_TELEMETRY_ENDPOINT ??
      env.TELEMETRY_ENDPOINT ??
      undefined,
    release: env.NEXT_PUBLIC_RELEASE ?? env.RELEASE ?? undefined,
    environment:
      env.NEXT_PUBLIC_ENVIRONMENT ?? env.NODE_ENV ?? undefined,
  });

  return defaultClient;
}

/** Convenience wrapper for reporting an error via the default client. */
export function reportError(
  error: unknown,
  context: TelemetryContext = {},
  level: TelemetryLevel = "error",
): void {
  getTelemetryClient().reportError(error, context, level);
}

/** Convenience wrapper for reporting a web vital via the default client. */
export function reportWebVital(
  metric: WebVitalMetric,
  context: TelemetryContext = {},
): void {
  getTelemetryClient().reportWebVital(metric, context);
}

/** Convenience wrapper for reporting a generic event via the default client. */
export function reportEvent(
  name: string,
  data: Record<string, unknown> = {},
  context: TelemetryContext = {},
): void {
  getTelemetryClient().reportEvent(name, data, context);
}