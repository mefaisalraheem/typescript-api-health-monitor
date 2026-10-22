import { describe, expect, it } from "vitest";
import { renderTextReport, toJSON } from "../src/reporter.js";
import type { HealthReport } from "../src/types.js";

const report: HealthReport = {
  generatedAt: 1_700_000_000_000,
  overallUptimePercent: 100,
  allUp: true,
  endpoints: [
    {
      endpointId: "api",
      totalProbes: 3,
      successCount: 3,
      failureCount: 0,
      degradedCount: 0,
      uptimePercent: 100,
      avgResponseTimeMs: 42.5,
      minResponseTimeMs: 30,
      maxResponseTimeMs: 55,
      p95ResponseTimeMs: 55,
      lastStatus: "up",
      lastCheckedAt: 1_700_000_000_000,
    },
  ],
};

describe("reporter", () => {
  it("renders text report containing key fields", () => {
    const out = renderTextReport(report);
    expect(out).toContain("API Health Report");
    expect(out).toContain("api");
    expect(out).toContain("100%");
    expect(out).toContain("42.5");
  });

  it("serializes to valid JSON", () => {
    const json = toJSON(report);
    const parsed = JSON.parse(json) as HealthReport;
    expect(parsed.endpoints[0]?.endpointId).toBe("api");
    expect(parsed.allUp).toBe(true);
  });
});