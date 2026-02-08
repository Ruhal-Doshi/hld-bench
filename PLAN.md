# HLD-Bench — High-Level Design Benchmark for LLMs

> An open-source benchmark that evaluates LLMs on their ability to produce high-level system designs (HLD). Powered by [TanStack AI](https://tanstack.com/ai) (alpha).

---

## 1. Problem Statement

There are many coding benchmarks (HumanEval, SWE-Bench, etc.) but almost none that measure an LLM's ability to **architect systems** — which is arguably the higher-value skill. HLD-Bench fills that gap.

Given a problem prompt (e.g. _"Design Uber"_ or _"Build a ChatGPT clone using only Google Cloud infra"_), each LLM must produce:

- A structured **high-level design** (components, data flow, storage, APIs)
- **Mermaid.js diagrams** (architecture, sequence, data-flow)
- Justification of **trade-offs** and **constraints**

Results are saved to disk for human review and comparison across models.

---

## 2. Decisions Made

| Decision          | Choice                            |
| ----------------- | --------------------------------- |
| Language          | TypeScript (strict)               |
| Package manager   | pnpm                              |
| AI SDK            | TanStack AI (`@tanstack/ai` v0.x) |
| LLM providers     | OpenAI, Anthropic, Google Gemini  |
| Diagram tool      | Mermaid.js (diagram-as-code)      |
| Evaluation        | Manual review (v1)                |
| Scope             | CLI tool (no web UI for now)      |
| Schema validation | Zod v4                            |

---

## 3. Architecture Overview

```
hld-bench/
├── src/
│   ├── index.ts              # CLI entry point (commander.js)
│   ├── config.ts             # Load & validate config / env vars
│   ├── types.ts              # Shared types & Zod schemas
│   ├── runner.ts             # Orchestrator: iterate problems × models
│   ├── prompt.ts             # System & user prompt construction
│   ├── adapters/
│   │   ├── index.ts          # Factory: model key → TanStack adapter
│   │   ├── openai.ts         # OpenAI adapter setup
│   │   ├── anthropic.ts      # Anthropic adapter setup
│   │   └── gemini.ts         # Gemini adapter setup
│   ├── output/
│   │   ├── writer.ts         # Write structured results to disk
│   │   └── mermaid.ts        # Render Mermaid → SVG/PNG (via mmdc CLI)
│   └── utils/
│       ├── logger.ts         # Structured console logging
│       └── timer.ts          # Execution time tracking
├── problems/                 # Problem bank (YAML/JSON files)
│   ├── design-uber.yaml
│   ├── design-chatgpt.yaml
│   └── ...
├── output/                   # Generated results (git-ignored)
│   └── <key>-<model-name>/
│       ├── design.md         # Full HLD markdown
│       ├── architecture.mmd  # Mermaid source
│       ├── architecture.svg  # Rendered diagram
│       └── meta.json         # Timing, token usage, model info
├── package.json
├── tsconfig.json
├── .env.example
├── PLAN.md                   # ← You are here
└── README.md
```

---

## 4. Core Concepts

### 4.1 Problem Definition

Each problem is a YAML file in `problems/`:

```yaml
key: design-uber
title: "Design Uber"
description: |
  Design a ride-sharing platform like Uber that supports:
  - Real-time driver/rider matching
  - Live location tracking
  - Surge pricing
  - Payment processing
  Scale: 50M monthly active users, 10M rides/day
constraints:
  - Must handle geographic distribution across 60+ countries
  - P99 latency for matching < 2 seconds
tags:
  - distributed-systems
  - real-time
  - geospatial
```

### 4.2 Structured Output Schema (Zod)

TanStack AI's `chat()` with `outputSchema` lets us enforce a structured response. The LLM must return:

```typescript
const HLDOutputSchema = z.object({
  title: z.string().describe("Title of the system design"),
  overview: z.string().describe("1-2 paragraph executive summary"),
  requirements: z.object({
    functional: z.array(z.string()),
    nonFunctional: z.array(z.string()),
  }),
  components: z.array(
    z.object({
      name: z.string(),
      responsibility: z.string(),
      techChoice: z.string().describe("Concrete technology or service"),
      justification: z.string(),
    }),
  ),
  dataFlow: z.string().describe("Mermaid sequence/flow diagram source"),
  architectureDiagram: z
    .string()
    .describe("Mermaid architecture diagram source"),
  dataStorage: z.array(
    z.object({
      store: z.string(),
      type: z.enum(["sql", "nosql", "cache", "queue", "blob", "search"]),
      justification: z.string(),
    }),
  ),
  apiDesign: z.array(
    z.object({
      endpoint: z.string(),
      method: z.enum(["GET", "POST", "PUT", "DELETE", "WS"]),
      description: z.string(),
    }),
  ),
  scalabilityStrategy: z
    .string()
    .describe("How the system scales horizontally/vertically"),
  tradeoffs: z.array(
    z.object({
      decision: z.string(),
      pros: z.array(z.string()),
      cons: z.array(z.string()),
    }),
  ),
});
```

### 4.3 TanStack AI Integration

We use **only the server-side** `@tanstack/ai` package with provider adapters — no React, no client, no HTTP server needed.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai/adapters";
import { anthropicText } from "@tanstack/ai-anthropic/adapters";
import { geminiText } from "@tanstack/ai-gemini/adapters";

// Structured output mode (returns typed object, no streaming)
const result = await chat({
  adapter: openaiText("gpt-4o"),
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ],
  outputSchema: HLDOutputSchema,
});
```

Key TanStack AI features we leverage:

- **`chat()` with `outputSchema`** — Returns a fully typed, validated JSON object matching our Zod schema
- **Runtime adapter switching** — Same `chat()` call works across OpenAI, Anthropic, Gemini by swapping only the adapter
- **Tree-shakeable adapters** — Import only `openaiText`, `anthropicText`, `geminiText` as needed
- **Structured outputs** — Provider-native structured output APIs (OpenAI `json_schema`, Anthropic tool-based, Gemini `responseSchema`) handled automatically

### 4.4 Prompt Strategy

Two-part prompt:

**System prompt** — Sets the role as a senior architect, defines output expectations, Mermaid diagram requirements, and constraints awareness.

**User prompt** — Injects the problem description, constraints, and any problem-specific context.

The system prompt will instruct the LLM to produce valid Mermaid syntax inside the `dataFlow` and `architectureDiagram` fields.

---

## 5. CLI Interface

```bash
# Run all problems against all configured models
pnpm run bench

# Run a specific problem against all models
pnpm run bench --problem design-uber

# Run all problems against a specific model
pnpm run bench --model gpt-4o

# Run one problem against one model
pnpm run bench --problem design-uber --model claude-sonnet-4

# List available problems
pnpm run bench --list

# Render Mermaid diagrams from existing output (without re-running LLMs)
pnpm run render
```

Under the hood this is `tsx src/index.ts` via a `package.json` script.

---

## 6. Output Structure

Each run produces a directory: `output/<problem-key>-<model-name>/`

```
output/design-uber-gpt-4o/
├── design.md              # Full rendered markdown of the HLD
├── architecture.mmd       # Raw Mermaid source for architecture diagram
├── data-flow.mmd          # Raw Mermaid source for data-flow diagram
├── architecture.svg       # Rendered SVG (via @mermaid-js/mermaid-cli)
├── data-flow.svg          # Rendered SVG
├── raw-response.json      # Full structured JSON from the LLM
└── meta.json              # Metadata about the run
```

**meta.json** example:

```json
{
  "problem": "design-uber",
  "model": "gpt-4o",
  "provider": "openai",
  "timestamp": "2026-02-06T12:00:00Z",
  "durationMs": 14523,
  "tokensUsed": {
    "prompt": 1200,
    "completion": 3400
  }
}
```

---

## 7. Model Configuration

Models are defined in a config file or passed via CLI. Default set:

| Provider  | Models                                   |
| --------- | ---------------------------------------- |
| OpenAI    | `gpt-4o`, `gpt-4o-mini`, `o1`, `o3-mini` |
| Anthropic | `claude-sonnet-4`, `claude-sonnet-4-5`   |
| Gemini    | `gemini-2.0-flash`, `gemini-2.5-pro`     |

API keys are read from environment variables:

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
```

---

## 8. Tech Stack / Dependencies

| Package                   | Purpose                               |
| ------------------------- | ------------------------------------- |
| `@tanstack/ai`            | Core AI SDK (chat, structured output) |
| `@tanstack/ai-openai`     | OpenAI adapter                        |
| `@tanstack/ai-anthropic`  | Anthropic adapter                     |
| `@tanstack/ai-gemini`     | Gemini adapter                        |
| `zod`                     | Schema definition & validation        |
| `commander`               | CLI argument parsing                  |
| `yaml`                    | Parse problem YAML files              |
| `chalk`                   | Terminal coloring                     |
| `ora`                     | Spinner for long-running operations   |
| `@mermaid-js/mermaid-cli` | Render `.mmd` → SVG/PNG               |
| `tsx`                     | Run TypeScript directly               |
| `typescript`              | Type checking                         |

---

## 9. Implementation Phases

### Phase 1 — Scaffolding & Core (current)

- [x] Create plan document
- [ ] Initialize pnpm project with TypeScript
- [ ] Define types & Zod schemas (`types.ts`)
- [ ] Build adapter factory (`adapters/`)
- [ ] Implement prompt builder (`prompt.ts`)
- [ ] Implement runner (`runner.ts`) — iterate problems × models
- [ ] Implement output writer (`output/writer.ts`)
- [ ] Wire up CLI (`index.ts`)
- [ ] Create 3 sample problems in `problems/`
- [ ] Add `.env.example`, `README.md`

### Phase 2 — Diagrams & Polish

- [ ] Mermaid rendering pipeline (`.mmd` → `.svg`)
- [ ] Rich `design.md` template generation from structured output
- [ ] Progress reporting (ora spinners, summary table)
- [ ] Error handling & retries (per-model failures don't halt the run)
- [ ] Token usage tracking in `meta.json`

### Phase 3 — Expand & Compare

- [ ] More problems (10-15 curated HLD problems)
- [ ] Side-by-side comparison report (HTML or markdown table)
- [ ] Add Ollama adapter for local open-source models
- [ ] Optional LLM-as-judge evaluation scoring
- [ ] GitHub Actions workflow for automated runs

---

## 10. Open Questions / Future Ideas

1. **Evaluation rubric** — When we add LLM-as-judge, what dimensions to score? (completeness, correctness, scalability awareness, diagram quality, trade-off depth)
2. **Multi-turn mode** — Allow follow-up prompts (e.g., "Now add authentication to your design") to test iterative design ability
3. **Constraint variations** — Same problem but different constraints (e.g., "Design Uber but for a single city" vs "global scale")
4. **Cost tracking** — Log per-run cost estimates based on token pricing
5. **Leaderboard** — Auto-generated comparison page (GitHub Pages?)

---

## 11. Getting Started (after implementation)

```bash
git clone https://github.com/<org>/hld-bench
cd hld-bench
pnpm install
cp .env.example .env   # Add your API keys
pnpm run bench          # Run the full benchmark
```
