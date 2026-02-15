# HLD-Bench Data Format Specification

This document describes the data structures produced by HLD-Bench so that external tools (visualizers, scoring apps, dashboards) can reliably consume them.

---

## Versioning

Every versioned artifact includes a `_version` field (or is implicitly versioned by this spec). When the shape of a structure changes, bump its version so consumers can detect and adapt.

| Artifact            | Current Version | Description                        |
| ------------------- | --------------- | ---------------------------------- |
| Problem YAML        | `1`             | Input problem definition           |
| `meta.json`         | `1`             | Run metadata (timing, model, etc.) |
| `raw-response.json` | `1`             | Structured LLM output              |
| Output directory    | `1`             | Per-run file layout                |

---

## 1. Problem YAML (v1)

Each problem lives in `problems/<key>.yaml`.

```yaml
# problems/design-chatgpt.yaml
version: 1 # format version — bump when structure changes
key: design-chatgpt # unique slug, used in directory names
title: "Design a ChatGPT-like Web Application"
description: |
  Multi-line problem statement describing what to design,
  including scale targets and feature requirements.
constraints: # optional
  - "Streaming responses must start within 500ms"
  - "Must support 100K concurrent WebSocket connections per region"
tags: # optional
  - web-application
  - real-time
scoringParameters: # optional — dimensions for public voting/scoring
  - name: "Scalability & Performance"
    description: "Can the system handle the stated scale targets?"
    weight: 20
  - name: "Diagram Quality"
    description: "Are the diagrams clear and accurate?"
    weight: 10
  # weights should sum to 100
```

### Fields

| Field                             | Type       | Required | Description                                                 |
| --------------------------------- | ---------- | -------- | ----------------------------------------------------------- |
| `version`                         | `integer`  | Yes      | Format version (currently `1`). Bump when structure changes |
| `key`                             | `string`   | Yes      | Unique identifier, used as directory name prefix            |
| `title`                           | `string`   | Yes      | Human-readable problem title                                |
| `description`                     | `string`   | Yes      | Full problem statement with context and scale               |
| `constraints`                     | `string[]` | No       | Specific constraints or SLAs                                |
| `tags`                            | `string[]` | No       | Categorization tags                                         |
| `scoringParameters`               | `array`    | No       | Dimensions for public scoring (see sub-fields below)        |
| `scoringParameters[].name`        | `string`   | Yes      | Short label for this scoring dimension                      |
| `scoringParameters[].description` | `string`   | Yes      | What voters should evaluate                                 |
| `scoringParameters[].weight`      | `number`   | Yes      | Relative weight, 1-100 (all weights should sum to 100)      |

---

## 2. Output Directory Layout (v1)

Each benchmark run produces a directory under `output/`:

```
output/
├── {problem-key}-{model-id}/        # e.g. design-chatgpt-gpt-5
│   ├── meta.json                    # Run metadata
│   ├── raw-response.json            # Full structured LLM output
│   ├── architecture.mmd             # Sanitized Mermaid architecture diagram
│   ├── data-flow.mmd                # Sanitized Mermaid data-flow diagram
│   └── design.md                    # Human-readable markdown summary
├── {problem-key}-{model-id}/        # Another model...
│   └── ...
└── report.html                      # Aggregated HTML report (all runs)
```

### Directory naming convention

`{problem.key}-{model.id}` — for example `design-chatgpt-claude-opus-4-6`.

Both values come from the problem YAML (`key`) and `models.yaml` (`id`).

---

## 3. `meta.json` (v1)

Run metadata. Written once per benchmark run.

```jsonc
{
  "version": 1, // meta format version (META_VERSION constant)
  "problem": "design-chatgpt", // problem key (matches YAML key)
  "model": "gpt-5", // model id (matches models.yaml id)
  "provider": "openai", // provider name
  "timestamp": "2026-02-08T05:24:53.618Z", // ISO 8601
  "durationMs": 320904, // wall-clock time in milliseconds
}
```

### Fields

| Field        | Type     | Description                                     |
| ------------ | -------- | ----------------------------------------------- |
| `version`    | `number` | Meta format version (currently `1`)             |
| `problem`    | `string` | Problem key — joins back to `problems/*.yaml`   |
| `model`      | `string` | Model id — joins back to `models.yaml`          |
| `provider`   | `string` | Provider name (`openai`, `anthropic`, `gemini`) |
| `timestamp`  | `string` | ISO 8601 UTC timestamp of when the run started  |
| `durationMs` | `number` | Total generation time in milliseconds           |

---

## 4. `raw-response.json` (v1)

The full structured output from the LLM, validated against `HLDOutputSchema` (Zod). This is the single source of truth — `*.mmd` and `design.md` are derived from it.

```jsonc
{
  "title": "ChatGPT-like Web Application",
  "overview": "1-2 paragraph executive summary...",

  "requirements": {
    "functional": ["User authentication", "Multi-turn conversations", ...],
    "nonFunctional": ["< 500ms TTFT", "100K concurrent connections", ...]
  },

  "components": [
    {
      "name": "API Gateway",
      "responsibility": "Route and authenticate requests",
      "techChoice": "Kong / NGINX",
      "justification": "Proven at scale, supports rate limiting"
    }
    // ...more components
  ],

  "dataFlow": "sequenceDiagram\n  ...",           // raw Mermaid source
  "architectureDiagram": "graph TD\n  ...",        // raw Mermaid source

  "dataStorage": [
    {
      "store": "PostgreSQL",
      "type": "sql",                               // enum: sql|nosql|cache|queue|blob|search
      "justification": "ACID transactions for user data"
    }
    // ...more stores
  ],

  "apiDesign": [
    {
      "endpoint": "/api/v1/chat",
      "method": "POST",                            // enum: GET|POST|PUT|DELETE|PATCH|WS
      "description": "Send a message and stream response"
    }
    // ...more endpoints
  ],

  "scalabilityStrategy": "Horizontal scaling via...",

  "tradeoffs": [
    {
      "decision": "WebSockets over SSE",
      "pros": ["Bidirectional", "Lower latency"],
      "cons": ["More complex infra", "Harder to load balance"]
    }
    // ...more tradeoffs
  ]
}
```

### Fields

| Field                         | Type       | Description                                                   |
| ----------------------------- | ---------- | ------------------------------------------------------------- |
| `title`                       | `string`   | System design title                                           |
| `overview`                    | `string`   | Executive summary (1-2 paragraphs)                            |
| `requirements.functional`     | `string[]` | Key functional requirements                                   |
| `requirements.nonFunctional`  | `string[]` | Non-functional requirements (latency, scale, etc.)            |
| `components`                  | `array`    | Major system components (see sub-fields below)                |
| `components[].name`           | `string`   | Component name                                                |
| `components[].responsibility` | `string`   | What the component does                                       |
| `components[].techChoice`     | `string`   | Concrete technology chosen                                    |
| `components[].justification`  | `string`   | Why this technology was chosen                                |
| `dataFlow`                    | `string`   | Mermaid diagram source (sequence/flowchart) showing data flow |
| `architectureDiagram`         | `string`   | Mermaid diagram source showing system topology                |
| `dataStorage`                 | `array`    | Storage choices (see sub-fields below)                        |
| `dataStorage[].store`         | `string`   | Storage system name (e.g. PostgreSQL, Redis)                  |
| `dataStorage[].type`          | `enum`     | One of: `sql`, `nosql`, `cache`, `queue`, `blob`, `search`    |
| `dataStorage[].justification` | `string`   | Why this storage was chosen                                   |
| `apiDesign`                   | `array`    | Key API endpoints (see sub-fields below)                      |
| `apiDesign[].endpoint`        | `string`   | API path (e.g. `/api/v1/chat`)                                |
| `apiDesign[].method`          | `enum`     | One of: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `WS`         |
| `apiDesign[].description`     | `string`   | What this endpoint does                                       |
| `scalabilityStrategy`         | `string`   | Free-text description of scaling approach                     |
| `tradeoffs`                   | `array`    | Architectural tradeoffs (see sub-fields below)                |
| `tradeoffs[].decision`        | `string`   | The decision made                                             |
| `tradeoffs[].pros`            | `string[]` | Advantages                                                    |
| `tradeoffs[].cons`            | `string[]` | Disadvantages or risks                                        |

---

## 5. Derived Files

These files are **derived** from `raw-response.json` and do not contain new data. They exist for convenience and can be regenerated with `pnpm run bench regenerate`.

| File               | Source Field          | Processing                      |
| ------------------ | --------------------- | ------------------------------- |
| `architecture.mmd` | `architectureDiagram` | `sanitizeMermaid()` applied     |
| `data-flow.mmd`    | `dataFlow`            | `sanitizeMermaid()` applied     |
| `design.md`        | All fields + `meta`   | Rendered into readable Markdown |

### `sanitizeMermaid()` pipeline

The raw Mermaid from the LLM goes through these fixes before being written to `.mmd` files:

1. Normalize literal `\n` to actual newlines
2. Strip markdown code fences (` ```mermaid ... ``` `)
3. Strip trailing `%` characters
4. Collapse multi-line labels into single lines
5. Replace `&` with `and` (breaks Mermaid parsing)
6. Auto-quote node labels containing parentheses
7. Fix subgraph titles with special characters
8. Replace escaped quotes (`\"`) with single quotes
9. Auto-declare multi-word sequence diagram participants

---

## 6. How `report.html` Merges Data

The HTML report is a **self-contained single file** that aggregates all runs. Here's how data flows:

```
output/
├── run-A/meta.json + raw-response.json  ─┐
├── run-B/meta.json + raw-response.json  ─┼─▶  report.ts  ─▶  report.html
├── run-C/meta.json + raw-response.json  ─┘
```

1. **Scan** — `loadRuns()` reads every subdirectory in `output/`, loading `meta.json` and `raw-response.json` from each
2. **Group** — Runs are grouped by `meta.problem` so the report can show per-problem comparisons
3. **Inline** — Mermaid diagram source (`dataFlow`, `architectureDiagram`) is embedded directly into the HTML as `<pre class="mermaid">` blocks (after sanitization)
4. **Render** — Mermaid.js v11 (loaded from CDN) renders diagrams client-side; failures show a fallback with copy/open-in-mermaid.live buttons
5. **Self-contained** — The `.mmd` files are **not** fetched; all data comes from `raw-response.json`. The report works as a standalone static file

---

## 7. For Visualizer Consumers

### Loading a single run

```typescript
// Read one run
const meta = JSON.parse(
  fs.readFileSync("output/design-chatgpt-gpt-5/meta.json", "utf-8"),
);
const output = JSON.parse(
  fs.readFileSync("output/design-chatgpt-gpt-5/raw-response.json", "utf-8"),
);
// meta.problem + meta.model identify the run
// output contains all 10 structured fields
```

### Loading all runs

```typescript
// Scan output/ for directories containing both meta.json and raw-response.json
const dirs = fs
  .readdirSync("output/", { withFileTypes: true })
  .filter((d) => d.isDirectory());

const runs = dirs.map((dir) => ({
  meta: JSON.parse(fs.readFileSync(`output/${dir.name}/meta.json`, "utf-8")),
  output: JSON.parse(
    fs.readFileSync(`output/${dir.name}/raw-response.json`, "utf-8"),
  ),
}));
```

### Joining to problem definition

```typescript
import yaml from "yaml";

const problem = yaml.parse(
  fs.readFileSync(`problems/${meta.problem}.yaml`, "utf-8"),
);
// problem.title, problem.description, problem.constraints, problem.tags
```

### Version detection

All versioned artifacts now carry an explicit `version` field. Consumers should check it before processing:

```typescript
// meta.json — version field (added in v1.2)
const metaVersion = meta.version ?? 1; // fallback for older runs without version

// problem YAML — version field (added in v1.2)
const problemVersion = problem.version ?? 1;

// raw-response.json — check expected keys for structural version
const V1_KEYS = [
  "title",
  "overview",
  "requirements",
  "components",
  "dataFlow",
  "architectureDiagram",
  "dataStorage",
  "apiDesign",
  "scalabilityStrategy",
  "tradeoffs",
];

const isV1 = V1_KEYS.every((key) => key in output);
```

> **Backward compatibility:** Runs generated before v1.2 do not have `version` in `meta.json`. Consumers should default to `1` when the field is absent.

---

## Changelog

| Version | Date       | Changes                                               |
| ------- | ---------- | ----------------------------------------------------- |
| v1      | 2026-02-08 | Initial format spec                                   |
| v1.1    | 2026-02-15 | Added `scoringParameters` to Problem YAML (optional)  |
| v1.2    | 2026-02-15 | Added `version` field to Problem YAML and `meta.json` |
