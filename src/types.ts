import { z } from "zod";

// ─── Problem Definition ───────────────────────────────────────────────────────

export const ScoringParameterSchema = z.object({
  name: z.string().describe("Short name for the scoring dimension"),
  description: z
    .string()
    .describe("What voters should evaluate for this parameter"),
  weight: z
    .number()
    .min(1)
    .max(100)
    .describe("Relative weight (all weights should sum to 100)"),
});

export const ProblemSchema = z.object({
  version: z
    .number()
    .int()
    .min(1)
    .describe(
      "Schema version of this problem file. Bump when fields change so consumers can detect format.",
    ),
  key: z
    .string()
    .describe("Unique identifier for the problem, e.g. 'design-uber'"),
  title: z.string().describe("Human-readable title"),
  description: z.string().describe("Full problem statement with context"),
  constraints: z
    .array(z.string())
    .optional()
    .describe("Specific constraints or requirements"),
  tags: z.array(z.string()).optional().describe("Categorization tags"),
  scoringParameters: z
    .array(ScoringParameterSchema)
    .optional()
    .describe(
      "Dimensions on which the public can score/vote on each solution. Weights should sum to 100.",
    ),
});

export type Problem = z.infer<typeof ProblemSchema>;

// ─── HLD Structured Output ───────────────────────────────────────────────────

export const HLDOutputSchema = z.object({
  title: z.string().describe("Title of the system design"),
  overview: z
    .string()
    .describe("1-2 paragraph executive summary of the design"),
  requirements: z.object({
    functional: z.array(z.string()).describe("Key functional requirements"),
    nonFunctional: z
      .array(z.string())
      .describe("Key non-functional requirements (scalability, latency, etc.)"),
  }),
  components: z
    .array(
      z.object({
        name: z.string().describe("Component name"),
        responsibility: z.string().describe("What this component does"),
        techChoice: z
          .string()
          .describe("Concrete technology or service chosen"),
        justification: z.string().describe("Why this technology was chosen"),
      }),
    )
    .describe("Major system components"),
  dataFlow: z
    .string()
    .describe(
      "Mermaid.js sequence or flowchart diagram source showing data flow between components. Must be valid Mermaid syntax.",
    ),
  architectureDiagram: z
    .string()
    .describe(
      "Mermaid.js architecture/block diagram source showing system topology. Must be valid Mermaid syntax.",
    ),
  dataStorage: z
    .array(
      z.object({
        store: z
          .string()
          .describe("Storage system name (e.g. PostgreSQL, Redis, S3)"),
        type: z
          .enum(["sql", "nosql", "cache", "queue", "blob", "search"])
          .describe("Category of storage"),
        justification: z.string().describe("Why this storage was chosen"),
      }),
    )
    .describe("Data storage choices"),
  apiDesign: z
    .array(
      z.object({
        endpoint: z.string().describe("API endpoint path"),
        method: z
          .enum(["GET", "POST", "PUT", "DELETE", "PATCH", "WS"])
          .describe("HTTP method or WS for WebSocket"),
        description: z.string().describe("What this endpoint does"),
      }),
    )
    .describe("Key API endpoints"),
  scalabilityStrategy: z
    .string()
    .describe("How the system scales horizontally and vertically"),
  tradeoffs: z
    .array(
      z.object({
        decision: z.string().describe("The architectural decision made"),
        pros: z.array(z.string()).describe("Advantages of this decision"),
        cons: z.array(z.string()).describe("Disadvantages or risks"),
      }),
    )
    .describe("Key trade-offs and their reasoning"),
});

export type HLDOutput = z.infer<typeof HLDOutputSchema>;

// ─── Model Configuration ─────────────────────────────────────────────────────

export const BUILTIN_PROVIDERS = ["openai", "anthropic", "gemini"] as const;
export type BuiltinProvider = (typeof BUILTIN_PROVIDERS)[number];

/** Provider can be a built-in or any custom string (for OpenRouter, Ollama, etc.) */
export type Provider = string;

export const ModelConfigSchema = z.object({
  id: z
    .string()
    .describe("Unique model identifier used in CLI, e.g. 'gpt-5.2'"),
  provider: z
    .string()
    .describe("Provider name: openai, anthropic, gemini, or custom"),
  model: z.string().describe("Model name to pass to the provider API"),
  displayName: z.string().describe("Human-readable display name"),
  envVar: z
    .string()
    .optional()
    .describe(
      "Custom env var name for API key (auto-resolved for built-in providers)",
    ),
});

export const ModelsFileSchema = z.object({
  models: z.array(ModelConfigSchema),
});

export interface ModelConfig {
  id: string;
  provider: Provider;
  model: string;
  displayName: string;
  envVar?: string;
}

// ─── Run Metadata ────────────────────────────────────────────────────────────

export interface RunMeta {
  version: number;
  problem: string;
  model: string;
  provider: Provider;
  timestamp: string;
  durationMs: number;
}

// ─── Run Result ──────────────────────────────────────────────────────────────

/** Current meta.json schema version */
export const META_VERSION = 1;

/** Current raw-response.json schema version */
export const OUTPUT_VERSION = 1;

export interface RunResult {
  meta: RunMeta;
  output: HLDOutput;
}
