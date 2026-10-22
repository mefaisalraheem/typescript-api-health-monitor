# TypeScript API Health Monitor

> Monitor API endpoints, record response times, detect failures, and display uptime reports with typed configuration.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-vitest-green?logo=vitest&logoColor=white)](https://vitest.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Zero Runtime Deps](https://img.shields.io/badge/runtime%20deps-0-brightgreen)]()

A lightweight, **type-safe** library for monitoring HTTP endpoints. Track uptime, measure response times, detect failures, and generate health reports — with a clean white-theme dashboard included.

Demonstrates **generics**, **strict type safety**, **interfaces**, **robust error handling**, and **automated tests**.

---

## ✨ Features

- **Fully typed configuration** — every endpoint, probe, and report is a strict TypeScript interface
- **Uptime tracking** — success/failure ratios with per-endpoint and overall aggregates
- **Response time metrics** — avg, min, max, and **p95** latency
- **Failure detection** — HTTP status validation, `expectedStatus` override, network error capture
- **Timeout handling** — graceful cancellation via `AbortController`
- **Degraded state** — flag slow-but-successful responses against a threshold
- **Rolling history** — bounded memory with configurable `historyLimit`
- **Deterministic testing** — injectable `fetcher` and `now` for flake-free tests
- **White-theme dashboard** — clean, minimal UI with live probes
- **Zero runtime dependencies** — uses native `fetch`, `AbortController`, `Response`

---

## 📦 Installation

```bash
npm install


npm run dev


Open http://localhost:5173 and click Run all checks.


🚀 Quick Start
ts
import { ApiHealthMonitor, renderTextReport } from "typescript-api-health-monitor";

const monitor = new ApiHealthMonitor();

monitor
  .addEndpoint({
    id: "github",
    url: "https://api.github.com/zen",
    method: "GET",
    timeoutMs: 3000,
    degradedThresholdMs: 500,
  })
  .addEndpoint({
    id: "healthz",
    url: "https://example.com/health",
    method: "GET",
    timeoutMs: 2000,
    expectedStatus: 200,
  });

// Probe all endpoints concurrently
const results = await monitor.probeAll();

// Print a friendly report
console.log(renderTextReport(monitor.report()));


Sample output:


API Health Report — 2026-10-22T12:00:00.000Z
Overall uptime: 100%  |  All up: true

ENDPOINT              STATUS      UPTIME    AVG(ms)   P95(ms)   PROBES
------------------------------------------------------------------------
github                🟢 up       100%      212.4     305       4
healthz               🟢 up       100%      48.1      62        4



🧠 Core Concepts
ApiHealthMonitor
The central class. Create one monitor per app/process:

ts
const monitor = new ApiHealthMonitor({
  historyLimit: 100,          // probes retained per endpoint
  fetcher: customFetch,       // optional: inject your own
  now: () => Date.now(),      // optional: deterministic clock
});
EndpointConfig
Every endpoint is strictly typed:

ts
interface EndpointConfig<TBody = unknown> {
  readonly id: string;
  readonly url: string;
  readonly method: HttpMethod;
  readonly timeoutMs: number;
  readonly body?: TBody;
  readonly expectedStatus?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly degradedThresholdMs?: number;
}
ProbeResult
Each probe returns an immutable, serializable snapshot:

ts
{
  endpointId: "github",
  timestamp: 1729579200000,
  status: "up",              // "up" | "degraded" | "down"
  responseTimeMs: 212.4,
  httpStatus: 200,
  error: null,
}
EndpointMetrics
Aggregated stats per endpoint, including p95 latency and uptime ratio.

HealthReport
The top-level report returned by monitor.report():

ts
{
  generatedAt: 1729579200000,
  endpoints: [ /* EndpointMetrics[] */ ],
  overallUptimePercent: 100,
  allUp: true,
}
🧪 Testing
bash
npm test           # run once
npm run test:watch # watch mode
Tests inject a fake fetcher and clock so they never hit the network:

ts
const monitor = new ApiHealthMonitor({
  fetcher: async () => new Response("{}", { status: 200 }),
  now: () => Date.now(),
});
15 tests cover:

endpoint registration & duplicate rejection

successful probes, non-2xx, and network errors

expectedStatus override

degraded detection via degradedThresholdMs

timeout / abort handling

uptime aggregation

historyLimit enforcement

full report generation

text / JSON reporter output

🎨 White-Theme Dashboard
The included dashboard (src/ui/dashboard.ts) renders a live monitor with:

Pure white background with subtle #e2e8f0 borders and soft shadows

Color-coded status badges: 🟢 up · 🟡 degraded · 🔴 down

Uptime progress bars per endpoint

Response-time columns (avg + p95)

One-click "Run all checks" using native fetch

Start it with:

bash
npm run dev


📁 Project Structure
text
typescript-api-health-monitor/
├── index.html                 # Dashboard entry
├── src/
│   ├── types.ts               # All public interfaces
│   ├── monitor.ts             # ApiHealthMonitor implementation
│   ├── reporter.ts            # Text + JSON reporters
│   ├── index.ts               # Public API barrel
│   └── ui/
│       ├── styles.css         # White theme
│       └── dashboard.ts       # Browser dashboard
├── tests/
│   ├── monitor.test.ts
│   └── reporter.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts


🔧 API Reference
new ApiHealthMonitor(options?)

Option	Type	Default	Description
historyLimit	number	100	Max probes retained per endpoint
fetcher	Fetcher	globalThis.fetch	Custom HTTP implementation
now	() => number	Date.now	Injectable clock for testing
Methods
Method	Returns	Description
addEndpoint(config)	this	Register an endpoint (throws on duplicate)
removeEndpoint(id)	boolean	Remove an endpoint and its history
listEndpoints()	ReadonlyArray<EndpointConfig>	All registered endpoints
probe(id)	Promise<ProbeResult>	Run a single probe
probeAll()	Promise<ReadonlyArray<ProbeResult>>	Run all probes concurrently
getHistory(id)	ReadonlyArray<ProbeResult>	Rolling probe history
getMetrics(id)	EndpointMetrics	Aggregated stats
report()	HealthReport	Full health report

🛡️ Error Handling
The monitor never throws from probe() or probeAll() — errors are captured inside ProbeResult:

Scenario	status	error
2xx response	up	null
4xx / 5xx response	down	"Unexpected HTTP status 500"
Network error	down	Error message
Timeout	down	"Aborted"
Slow success	degraded	null
Only configuration errors throw:

empty id

duplicate id

unknown endpoint referenced in probe() / getMetrics()

📄 License
MIT © Malik Faisal Raheem

🤝 Contributing

Issues and PRs welcome. Please run npm run typecheck && npm test before submitting.