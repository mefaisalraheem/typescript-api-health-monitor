import type {
  EndpointConfig,
  EndpointMetrics,
  EndpointStatus,
  Fetcher,
  HealthReport,
  MonitorOptions,
  ProbeResult,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_HISTORY_LIMIT = 100;
const DEFAULT_DEGRADED_MS = 1_000;

/**
 * `ApiHealthMonitor` — generic, type-safe API endpoint monitor.
 *
 * @example
 * const monitor = new ApiHealthMonitor();
 * monitor.addEndpoint({ id: "gh", url: "...", method: "GET", timeoutMs: 3000 });
 * const result = await monitor.probe("gh");
 */
export class ApiHealthMonitor<TBodies extends Record<string, unknown> = {}> {
  private readonly endpoints = new Map<string, EndpointConfig>();
  private readonly history = new Map<string, ProbeResult[]>();
  private readonly historyLimit: number;
  private readonly fetcher: Fetcher;
  private readonly now: () => number;

  constructor(options: MonitorOptions = {}) {
    this.historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
    this.fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? (() => Date.now());
  }

  /** Register an endpoint. Throws on duplicate id. */
  addEndpoint<TBody = TBodies[keyof TBodies]>(
    config: EndpointConfig<TBody>
  ): this {
    if (!config.id.trim()) {
      throw new Error("Endpoint id must be a non-empty string");
    }
    if (this.endpoints.has(config.id)) {
      throw new Error(`Endpoint "${config.id}" already registered`);
    }
    this.endpoints.set(config.id, {
      ...config,
      timeoutMs: config.timeoutMs || DEFAULT_TIMEOUT_MS,
    });
    this.history.set(config.id, []);
    return this;
  }

  /** Remove an endpoint and its history. Returns true if it existed. */
  removeEndpoint(id: string): boolean {
    this.history.delete(id);
    return this.endpoints.delete(id);
  }

  listEndpoints(): ReadonlyArray<EndpointConfig> {
    return [...this.endpoints.values()];
  }

  /**
   * Probe one endpoint and record the result.
   * Never throws for network/HTTP errors — errors are captured in the result.
   */
  async probe(id: string): Promise<ProbeResult> {
    const config = this.endpoints.get(id);
    if (!config) {
      throw new Error(`Unknown endpoint "${id}"`);
    }

    const started = this.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    let httpStatus: number | null = null;
    let error: string | null = null;
    let status: EndpointStatus = "up";

    try {
      const init: RequestInit = {
        method: config.method,
        signal: controller.signal,
        ...(config.headers ? { headers: { ...config.headers } } : {}),
        ...(config.body !== undefined && config.method !== "GET" && config.method !== "HEAD"
          ? { body: JSON.stringify(config.body) }
          : {}),
      };

      const response = await this.fetcher(config.url, init);
      httpStatus = response.status;

      const expected = config.expectedStatus;
      const isOk = expected !== undefined
        ? response.status === expected
        : response.status >= 200 && response.status < 300;

      if (!isOk) {
        status = "down";
        error = `Unexpected HTTP status ${response.status}`;
      }
    } catch (err) {
      status = "down";
      error = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }

    const responseTimeMs = Math.max(0, this.now() - started);
    const degradedAt = config.degradedThresholdMs ?? DEFAULT_DEGRADED_MS;

    if (status === "up" && responseTimeMs > degradedAt) {
      status = "degraded";
    }

    const result: ProbeResult = Object.freeze({
      endpointId: id,
      timestamp: this.now(),
      status,
      responseTimeMs,
      httpStatus,
      error,
    });

    this.record(result);
    return result;
  }

  /** Probe all registered endpoints concurrently. */
  async probeAll(): Promise<ReadonlyArray<ProbeResult>> {
    return Promise.all([...this.endpoints.keys()].map((id) => this.probe(id)));
  }

  /** Get the recorded history for one endpoint (newest last). */
  getHistory(id: string): ReadonlyArray<ProbeResult> {
    return Object.freeze([...(this.history.get(id) ?? [])]);
  }

  /** Get aggregated metrics for one endpoint. */
  getMetrics(id: string): EndpointMetrics {
    if (!this.endpoints.has(id)) {
      throw new Error(`Unknown endpoint "${id}"`);
    }
    return this.computeMetrics(id, this.history.get(id) ?? []);
  }

  /** Generate a full health report across all endpoints. */
  report(): HealthReport {
    const endpoints = [...this.endpoints.keys()].map((id) =>
      this.computeMetrics(id, this.history.get(id) ?? [])
    );

    const overallUptimePercent =
      endpoints.length === 0
        ? 100
        : round2(
            endpoints.reduce((sum, m) => sum + m.uptimePercent, 0) /
              endpoints.length
          );

    return Object.freeze({
      generatedAt: this.now(),
      endpoints: Object.freeze(endpoints),
      overallUptimePercent,
      allUp: endpoints.every((m) => m.lastStatus === "up"),
    });
  }

  // ------------------------------------------------------------------ internals

  private record(result: ProbeResult): void {
    const list = this.history.get(result.endpointId) ?? [];
    list.push(result);
    if (list.length > this.historyLimit) {
      list.splice(0, list.length - this.historyLimit);
    }
    this.history.set(result.endpointId, list);
  }

  private computeMetrics(
    id: string,
    history: ReadonlyArray<ProbeResult>
  ): EndpointMetrics {
    const total = history.length;
    if (total === 0) {
      return {
        endpointId: id,
        totalProbes: 0,
        successCount: 0,
        failureCount: 0,
        degradedCount: 0,
        uptimePercent: 0,
        avgResponseTimeMs: 0,
        minResponseTimeMs: 0,
        maxResponseTimeMs: 0,
        p95ResponseTimeMs: 0,
        lastStatus: "down",
        lastCheckedAt: null,
      };
    }

    const successCount = history.filter((r) => r.status !== "down").length;
    const failureCount = total - successCount;
    const degradedCount = history.filter((r) => r.status === "degraded").length;
    const times = history.map((r) => r.responseTimeMs).sort((a, b) => a - b);
    const last = history[total - 1]!;

    return {
      endpointId: id,
      totalProbes: total,
      successCount,
      failureCount,
      degradedCount,
      uptimePercent: round2((successCount / total) * 100),
      avgResponseTimeMs: round2(times.reduce((a, b) => a + b, 0) / total),
      minResponseTimeMs: times[0]!,
      maxResponseTimeMs: times[total - 1]!,
      p95ResponseTimeMs: percentile(times, 0.95),
      lastStatus: last.status,
      lastCheckedAt: last.timestamp,
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function percentile(sorted: ReadonlyArray<number>, p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}