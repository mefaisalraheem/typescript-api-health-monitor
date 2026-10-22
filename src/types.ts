/**
 * Core types for the API health monitor.
 * All configuration is strictly typed and immutable by convention.
 */

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type EndpointStatus = "up" | "down" | "degraded";

export type Fetcher = (
  url: string,
  init: RequestInit
) => Promise<Response>;

/** Typed, immutable endpoint configuration. */
export interface EndpointConfig<TBody = unknown> {
  readonly id: string;
  readonly url: string;
  readonly method: HttpMethod;
  readonly timeoutMs: number;
  /** Optional body payload for methods that support it. */
  readonly body?: TBody;
  /** Expected HTTP status; defaults to any 2xx. */
  readonly expectedStatus?: number;
  /** Custom headers. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Threshold in ms above which a successful call is "degraded". */
  readonly degradedThresholdMs?: number;
}

/** A single recorded probe result. */
export interface ProbeResult {
  readonly endpointId: string;
  readonly timestamp: number;
  readonly status: EndpointStatus;
  readonly responseTimeMs: number;
  readonly httpStatus: number | null;
  readonly error: string | null;
}

/** Aggregated metrics for one endpoint. */
export interface EndpointMetrics {
  readonly endpointId: string;
  readonly totalProbes: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly degradedCount: number;
  readonly uptimePercent: number;
  readonly avgResponseTimeMs: number;
  readonly minResponseTimeMs: number;
  readonly maxResponseTimeMs: number;
  readonly p95ResponseTimeMs: number;
  readonly lastStatus: EndpointStatus;
  readonly lastCheckedAt: number | null;
}

export interface MonitorOptions {
  /** Max probes retained per endpoint in the rolling window. */
  readonly historyLimit?: number;
  /** Injectable fetch implementation (useful for tests). */
  readonly fetcher?: Fetcher;
  /** Clock function for deterministic tests. */
  readonly now?: () => number;
}

export interface HealthReport {
  readonly generatedAt: number;
  readonly endpoints: ReadonlyArray<EndpointMetrics>;
  readonly overallUptimePercent: number;
  readonly allUp: boolean;
}