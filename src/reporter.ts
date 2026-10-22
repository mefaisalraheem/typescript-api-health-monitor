import type { EndpointMetrics, HealthReport } from "./types.js";

const STATUS_BADGE: Record<string, string> = {
  up: "🟢",
  degraded: "🟡",
  down: "🔴",
};

/** Render an ASCII report (useful for CI logs / CLI). */
export function renderTextReport(report: HealthReport): string {
  const lines: string[] = [];
  lines.push(`API Health Report — ${new Date(report.generatedAt).toISOString()}`);
  lines.push(`Overall uptime: ${report.overallUptimePercent}%  |  All up: ${report.allUp}`);
  lines.push("");
  lines.push(
    pad("ENDPOINT", 22) +
      pad("STATUS", 12) +
      pad("UPTIME", 10) +
      pad("AVG(ms)", 10) +
      pad("P95(ms)", 10) +
      pad("PROBES", 8)
  );
  lines.push("-".repeat(72));
  for (const m of report.endpoints) {
    lines.push(
      pad(m.endpointId, 22) +
        pad(`${STATUS_BADGE[m.lastStatus] ?? "?"} ${m.lastStatus}`, 12) +
        pad(`${m.uptimePercent}%`, 10) +
        pad(String(m.avgResponseTimeMs), 10) +
        pad(String(m.p95ResponseTimeMs), 10) +
        pad(String(m.totalProbes), 8)
    );
  }
  return lines.join("\n");
}

/** Serialize a report to JSON (safe for storage/transport). */
export function toJSON(report: HealthReport): string {
  return JSON.stringify(report, null, 2);
}

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s.padEnd(len, " ");
}