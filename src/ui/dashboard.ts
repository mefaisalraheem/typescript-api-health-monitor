import { ApiHealthMonitor } from "../monitor.js";
import { renderTextReport } from "../reporter.js";
import type { EndpointConfig, HealthReport } from "../types.js";

const DEMO_ENDPOINTS: EndpointConfig[] = [
  {
    id: "jsonplaceholder",
    url: "https://jsonplaceholder.typicode.com/posts/1",
    method: "GET",
    timeoutMs: 5000,
    degradedThresholdMs: 400,
  },
  {
    id: "github-api",
    url: "https://api.github.com/zen",
    method: "GET",
    timeoutMs: 5000,
    degradedThresholdMs: 400,
  },
  {
    id: "httpbin",
    url: "https://httpbin.org/get",
    method: "GET",
    timeoutMs: 5000,
    degradedThresholdMs: 400,
  },
];

const monitor = new ApiHealthMonitor();
for (const ep of DEMO_ENDPOINTS) monitor.addEndpoint(ep);

const app = document.getElementById("app")!;

app.innerHTML = `
  <div class="app">
    <header class="header">
      <div>
        <h1>API Health Monitor</h1>
        <div class="subtitle">Live endpoint uptime &amp; response time tracking</div>
      </div>
      <button id="run" class="btn primary">Run all checks</button>
    </header>
    <div id="summary" class="summary"></div>
    <div class="card">
      <div class="card-header">
        <h2>Endpoints</h2>
        <span id="last-run" class="subtitle"></span>
      </div>
      <div id="table-wrap"><div class="empty">No probes yet — click "Run all checks"</div></div>
    </div>
    <div class="footer">Runs entirely in your browser · typed with TypeScript</div>
  </div>
`;

const runBtn = document.getElementById("run") as HTMLButtonElement;
const summaryEl = document.getElementById("summary")!;
const tableWrap = document.getElementById("table-wrap")!;
const lastRunEl = document.getElementById("last-run")!;

function renderSummary(report: HealthReport | null): void {
  if (!report) {
    summaryEl.innerHTML = `
      <div class="stat"><div class="label">Overall Uptime</div><div class="value">—</div></div>
      <div class="stat"><div class="label">Endpoints</div><div class="value">${monitor.listEndpoints().length}</div></div>
      <div class="stat"><div class="label">Status</div><div class="value">—</div></div>
    `;
    return;
  }
  const upCount = report.endpoints.filter((e) => e.lastStatus === "up").length;
  const status = report.allUp
    ? `<span class="badge up">Healthy</span>`
    : `<span class="badge degraded">Attention</span>`;
  summaryEl.innerHTML = `
    <div class="stat"><div class="label">Overall Uptime</div><div class="value">${report.overallUptimePercent}%</div></div>
    <div class="stat"><div class="label">Endpoints Up</div><div class="value">${upCount} / ${report.endpoints.length}</div></div>
    <div class="stat"><div class="label">Status</div><div class="value">${status}</div></div>
  `;
}

function renderTable(report: HealthReport): void {
  const rows = report.endpoints
    .map((m) => {
      const ep = monitor.listEndpoints().find((e) => e.id === m.endpointId)!;
      const barClass =
        m.lastStatus === "down"
          ? "down"
          : m.lastStatus === "degraded"
            ? "degraded"
            : "";
      return `
      <tr>
        <td>
          <div class="endpoint-id">${escapeHtml(ep.id)}</div>
          <div class="endpoint-url">${escapeHtml(ep.method)} ${escapeHtml(ep.url)}</div>
        </td>
        <td><span class="badge ${m.lastStatus}">${m.lastStatus}</span></td>
        <td>
          <div class="mono">${m.uptimePercent}%</div>
          <div class="uptime-bar ${barClass}"><span style="width:${m.uptimePercent}%"></span></div>
        </td>
        <td class="mono">${m.avgResponseTimeMs} ms</td>
        <td class="mono">${m.p95ResponseTimeMs} ms</td>
        <td class="mono">${m.totalProbes}</td>
      </tr>`;
    })
    .join("");

  tableWrap.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Endpoint</th>
          <th>Status</th>
          <th>Uptime</th>
          <th>Avg</th>
          <th>P95</th>
          <th>Probes</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function runAll(): Promise<void> {
  runBtn.disabled = true;
  runBtn.innerHTML = `<span class="spinner"></span>Running…`;
  try {
    await monitor.probeAll();
    const report = monitor.report();
    renderSummary(report);
    renderTable(report);
    lastRunEl.textContent = `Last run: ${new Date(report.generatedAt).toLocaleTimeString()}`;
    // Expose text report for debugging in console
    // eslint-disable-next-line no-console
    console.log(renderTextReport(report));
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Run all checks";
  }
}

runBtn.addEventListener("click", () => void runAll());
renderSummary(null);

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}