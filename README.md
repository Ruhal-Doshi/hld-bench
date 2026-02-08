# HLD-Bench

An open-source benchmark that evaluates LLMs on their ability to produce **high-level system designs (HLD)**.

Powered by [TanStack AI](https://tanstack.com/ai) (alpha).

> **Live Results:** 7 models have already been benchmarked against the _"Design ChatGPT"_ problem — [view the report here](https://ruhal-doshi.github.io/hld-bench/report.html).

## What It Does

Given a system design problem (e.g. _"Design ChatGPT"_, _"Design Uber"_), each LLM produces:

- A structured high-level design (components, data flow, storage, APIs)
- Mermaid.js diagrams (architecture + data-flow)
- Trade-off analysis with pros/cons

Results are saved per model and compared side-by-side in an HTML report.

## Quick Start

```bash
# 1. Clone & install
git clone https://github.com/Ruhal-Doshi/hld-bench && cd hld-bench
pnpm install

# 2. Add API keys
cp .env.example .env.local
# Edit .env.local — only fill in providers you want to use:
#   OPENAI_API_KEY=sk-...
#   ANTHROPIC_API_KEY=sk-ant-...
#   GEMINI_API_KEY=AIza...

# 3. Run a single model on one problem (fastest way to try it)
pnpm run bench run -p design-chatgpt -m gpt-5-mini

# 4. View results
pnpm run bench report
pnpm run bench serve          # opens report in browser at localhost:8765
```

That's it. You'll get a full system design with architecture diagrams in ~2 minutes.

### Run More

```bash
# Run all problems × all models
pnpm run bench run

# Run one problem against all models
pnpm run bench run -p design-uber

# Run all problems against one model
pnpm run bench run -m claude-sonnet-4
```

## CLI Reference

```
pnpm run bench run [options]         Run the benchmark
  -p, --problem <key>                Run only one problem
  -m, --model <id>                   Run only one model
  -c, --config <path>                Custom models.yaml file
  --problems-dir <path>              Custom problems directory

pnpm run bench list                  List available problems and models
  -c, --config <path>                Custom models.yaml file

pnpm run bench report                Generate HTML report from results
  -o, --output <dir>                 Custom output directory

pnpm run bench serve                 Serve report in browser (localhost:8765)
  -o, --output <dir>                 Custom output directory
  -p, --port <port>                  Custom port (default: 8765)

pnpm run bench regenerate            Re-derive .mmd and .md from raw JSON
  -o, --output <dir>                 (no LLM calls — useful after sanitizer updates)
```

## Environment Variables

Create a `.env.local` file in the project root (`.env.local` takes priority over `.env`):

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
```

You only need keys for the providers you plan to use. Models without a valid key are skipped automatically.

## Model Configuration

Models are defined in `models.yaml`. If the file is missing, built-in defaults are used.

```yaml
models:
  - id: gpt-5.2
    provider: openai
    model: gpt-5.2
    displayName: "GPT-5.2"

  - id: claude-sonnet-4
    provider: anthropic
    model: claude-sonnet-4-20250514
    displayName: "Claude Sonnet 4"

  # OpenAI-compatible providers with custom env var
  - id: deepseek-v3
    provider: openai
    model: deepseek-chat
    displayName: "DeepSeek V3"
    envVar: DEEPSEEK_API_KEY
```

### Default Models

| Provider  | Models                                                                                 |
| --------- | -------------------------------------------------------------------------------------- |
| OpenAI    | `gpt-5.2`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5.2-pro`, `gpt-5`, `gpt-4.1`               |
| Anthropic | `claude-opus-4-6`, `claude-sonnet-4-5`, `claude-haiku-4-5`, `claude-sonnet-4`          |
| Gemini    | `gemini-3-pro-preview`, `gemini-3-flash-preview`, `gemini-2.5-pro`, `gemini-2.0-flash` |

## Output Structure

Each run produces:

```
output/design-uber-gpt-5.2/
├── raw-response.json      # Full structured JSON from the LLM
├── meta.json              # Timing, model info, provider
├── design.md              # Rendered HLD as readable markdown
├── architecture.mmd       # Mermaid architecture diagram
└── data-flow.mmd          # Mermaid data-flow diagram
```

Run `pnpm run bench report` to generate `output/report.html` with:

- Mermaid diagrams rendered in-browser (dark theme)
- Tabbed comparison of models per problem
- Component tables, API design, trade-off analysis
- Fallback with "Copy source" + mermaid.live link for diagrams that fail to render

> **Note:** Mermaid rendering can be flaky with complex LLM-generated diagrams. If a diagram doesn't render, copy the source and paste it into [mermaid.live](https://mermaid.live) — the raw `.mmd` files are valid Mermaid syntax.

## Adding Problems

Create a YAML file in `problems/`:

```yaml
key: design-my-system
title: "Design My System"
description: |
  Full problem description here...
constraints:
  - "Support 10M DAU"
  - "99.9% uptime"
tags:
  - distributed-systems
  - real-time
```

Three problems are included: `design-chatgpt`, `design-uber`, `design-twitter`.

## Tech Stack

- **[TanStack AI](https://tanstack.com/ai)** — Provider-agnostic AI SDK with structured outputs
- **TypeScript** — Strict mode, ESM, type-safe throughout
- **Zod v4** — Schema validation for problem input and LLM output
- **Mermaid.js v11** — Diagram-as-code in HTML reports
- **Commander** — CLI framework
- **Zero external runtime deps** for serving — built-in Node HTTP server

## License

MIT
