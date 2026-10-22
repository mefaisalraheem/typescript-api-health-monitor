import { describe, expect, it, vi } from "vitest";
import { ApiHealthMonitor } from "../src/monitor.js";
import type { Fetcher } from "../src/types.js";

function fakeFetcher(
  impl: (url: string, init: RequestInit) => Promise<Response>
): Fetcher {
  return impl as Fetcher;
}

function makeResponse(status: number): Response {
  return new Response("{}", { status });
}

describe("ApiHealthMonitor", () => {
  it("registers endpoints and rejects duplicates", () => {
    const monitor = new ApiHealthMonitor();
    monitor.addEndpoint({ id: "a", url: "https://x", method: "GET", timeoutMs: 1000 });
    expect(() =>
      monitor.addEndpoint({ id: "a", url: "https://y", method: "GET", timeoutMs: 1000 })
    ).toThrow(/already registered/);
  });

  it("rejects empty id", () => {
    const monitor = new ApiHealthMonitor();
    expect(() =>
      monitor.addEndpoint({ id: "  ", url: "https://x", method: "GET", timeoutMs: 1000 })
    ).toThrow(/non-empty/);
  });

  it("probes an endpoint and records success", async () => {
    let t = 0;
    const monitor = new ApiHealthMonitor({
      fetcher: fakeFetcher(async () => makeResponse(200)),
      now: () => {
        t += 100;
        return t;
      },
    });
    monitor.addEndpoint({ id: "a", url: "https://x", method: "GET", timeoutMs: 1000 });
    const result = await monitor.probe("a");
    expect(result.status).toBe("up");
    expect(result.httpStatus).toBe(200);
    expect(result.error).toBeNull();
  });

  it("marks non-2xx responses as down", async () => {
    const monitor = new ApiHealthMonitor({
      fetcher: fakeFetcher(async () => makeResponse(500)),
      now: () => Date.now(),
    });
    monitor.addEndpoint({ id: "a", url: "https://x", method: "GET", timeoutMs: 1000 });
    const result = await monitor.probe("a");
    expect(result.status).toBe("down");
    expect(result.error).toMatch(/500/);
  });

  it("respects expectedStatus", async () => {
    const monitor = new ApiHealthMonitor({
      fetcher: fakeFetcher(async () => makeResponse(418)),
      now: () => Date.now(),
    });
    monitor.addEndpoint({
      id: "a",
      url: "https://x",
      method: "GET",
      timeoutMs: 1000,
      expectedStatus: 418,
    });
    const result = await monitor.probe("a");
    expect(result.status).toBe("up");
  });

  it("captures network errors as down", async () => {
    const monitor = new ApiHealthMonitor({
      fetcher: fakeFetcher(async () => {
        throw new Error("boom");
      }),
      now: () => Date.now(),
    });
    monitor.addEndpoint({ id: "a", url: "https://x", method: "GET", timeoutMs: 1000 });
    const result = await monitor.probe("a");
    expect(result.status).toBe("down");
    expect(result.error).toBe("boom");
  });

  it("marks slow-but-ok responses as degraded", async () => {
    let t = 0;
    const monitor = new ApiHealthMonitor({
      fetcher: fakeFetcher(async () => makeResponse(200)),
      now: () => {
        t += 800;
        return t;
      },
    });
    monitor.addEndpoint({
      id: "a",
      url: "https://x",
      method: "GET",
      timeoutMs: 2000,
      degradedThresholdMs: 500,
    });
    const result = await monitor.probe("a");
    expect(result.status).toBe("degraded");
  });

  it("throws for unknown endpoint probes", async () => {
    const monitor = new ApiHealthMonitor();
    await expect(monitor.probe("nope")).rejects.toThrow(/Unknown/);
  });

  it("computes uptime metrics correctly", async () => {
    let call = 0;
    const monitor = new ApiHealthMonitor({
      fetcher: fakeFetcher(async () => {
        call += 1;
        return makeResponse(call === 2 ? 500 : 200);
      }),
      now: () => Date.now(),
    });
    monitor.addEndpoint({ id: "a", url: "https://x", method: "GET", timeoutMs: 1000 });
    await monitor.probe("a");
    await monitor.probe("a");
    await monitor.probe("a");
    await monitor.probe("a");
    const metrics = monitor.getMetrics("a");
    expect(metrics.totalProbes).toBe(4);
    expect(metrics.failureCount).toBe(1);
    expect(metrics.uptimePercent).toBe(75);
  });

  it("respects historyLimit", async () => {
    const monitor = new ApiHealthMonitor({
      fetcher: fakeFetcher(async () => makeResponse(200)),
      now: () => Date.now(),
      historyLimit: 3,
    });
    monitor.addEndpoint({ id: "a", url: "https://x", method: "GET", timeoutMs: 1000 });
    for (let i = 0; i < 5; i += 1) await monitor.probe("a");
    expect(monitor.getHistory("a")).toHaveLength(3);
  });

  it("produces a report with overall uptime", async () => {
    let call = 0;
    const monitor = new ApiHealthMonitor({
      fetcher: fakeFetcher(async () => {
        call += 1;
        return makeResponse(call === 1 ? 200 : 500);
      }),
      now: () => Date.now(),
    });
    monitor.addEndpoint({ id: "a", url: "https://x", method: "GET", timeoutMs: 1000 });
    monitor.addEndpoint({ id: "b", url: "https://y", method: "GET", timeoutMs: 1000 });
    await monitor.probeAll();
    const report = monitor.report();
    expect(report.endpoints).toHaveLength(2);
    expect(report.allUp).toBe(false);
    expect(report.overallUptimePercent).toBe(50);
  });

  it("removes endpoints", () => {
    const monitor = new ApiHealthMonitor();
    monitor.addEndpoint({ id: "a", url: "https://x", method: "GET", timeoutMs: 1000 });
    expect(monitor.removeEndpoint("a")).toBe(true);
    expect(monitor.removeEndpoint("a")).toBe(false);
    expect(monitor.listEndpoints()).toHaveLength(0);
  });

  it("aborts on timeout", async () => {
    const monitor = new ApiHealthMonitor({
      fetcher: fakeFetcher(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError"))
            );
          })
      ),
      now: () => Date.now(),
    });
    monitor.addEndpoint({ id: "a", url: "https://x", method: "GET", timeoutMs: 20 });
    const result = await monitor.probe("a");
    expect(result.status).toBe("down");
    expect(result.error).toBeTruthy();
  });
});