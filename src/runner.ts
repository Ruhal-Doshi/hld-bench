import { chat } from "@tanstack/ai";
import ora from "ora";
import { createAdapter } from "./adapters/index.js";
import { validateEnvForModel, getOutputDir } from "./config.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { writeRunResult } from "./output/writer.js";
import { createTimer } from "./utils/timer.js";
import { log } from "./utils/logger.js";
import { HLDOutputSchema } from "./types.js";
import type { ModelConfig, Problem, RunResult, HLDOutput } from "./types.js";

const MAX_RETRIES = 2;

/**
 * Attempt to parse & validate a raw LLM text response into HLDOutput.
 * Tries to extract JSON from markdown code fences if needed.
 */
function tryParseOutput(raw: string): { data?: HLDOutput; error?: string } {
  // Try to extract JSON from code fences or raw text
  let jsonStr = raw;
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) jsonStr = fenceMatch[1];

  try {
    const parsed = JSON.parse(jsonStr);
    const result = HLDOutputSchema.safeParse(parsed);
    if (result.success) {
      return { data: result.data };
    }
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    return { error: `Validation failed:\n${issues}` };
  } catch {
    return { error: "Response is not valid JSON" };
  }
}

/**
 * Run a single benchmark: one problem against one model.
 * Retries up to MAX_RETRIES times, feeding validation errors back to the LLM.
 */
async function runSingle(
  problem: Problem,
  modelConfig: ModelConfig,
  onStatus?: (msg: string) => void,
): Promise<RunResult> {
  validateEnvForModel(modelConfig);

  const adapter = createAdapter(modelConfig);
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(problem);

  const timer = createTimer();

  // Anthropic defaults to maxTokens=1024 which truncates HLD JSON output.
  // Use a generous limit for all providers to ensure complete responses.
  const maxTokens = 16384;

  // First attempt: use TanStack AI's built-in outputSchema
  try {
    const output = await chat({
      adapter,
      systemPrompts: [systemPrompt],
      messages: [
        { role: "user", content: [{ type: "text", content: userPrompt }] },
      ],
      outputSchema: HLDOutputSchema,
      maxTokens,
    });

    return {
      meta: {
        problem: problem.key,
        model: modelConfig.id,
        provider: modelConfig.provider,
        timestamp: new Date().toISOString(),
        durationMs: timer.elapsed(),
      },
      output,
    };
  } catch (firstErr) {
    // If it's not a validation error, don't retry
    const errMsg =
      firstErr instanceof Error ? firstErr.message : String(firstErr);
    if (
      !errMsg.includes("Validation failed") &&
      !errMsg.includes("Invalid input")
    ) {
      throw firstErr;
    }
    onStatus?.(
      `schema validation failed, retrying with error feedback (1/${MAX_RETRIES})...`,
    );
  }

  // Retry loop: ask for raw JSON and validate manually, feeding errors back
  const messages: Array<{ role: "user" | "assistant"; content: any }> = [
    { role: "user", content: [{ type: "text", content: userPrompt }] },
  ];

  // Add explicit JSON schema instruction since outputSchema failed
  const schemaHint = `\n\nIMPORTANT: Respond with a single raw JSON object (no code fences, no markdown). The JSON MUST have these top-level keys: "title", "overview", "requirements", "components", "dataFlow", "architectureDiagram", "dataStorage", "apiDesign", "scalabilityStrategy", "tradeoffs". All fields are required.`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // stream: false returns Promise<string> instead of AsyncIterable<StreamChunk>
      const rawText = await chat({
        adapter,
        systemPrompts: [systemPrompt + schemaHint],
        messages,
        maxTokens,
        stream: false as const,
      });

      const { data, error } = tryParseOutput(rawText);

      if (data) {
        return {
          meta: {
            problem: problem.key,
            model: modelConfig.id,
            provider: modelConfig.provider,
            timestamp: new Date().toISOString(),
            durationMs: timer.elapsed(),
          },
          output: data,
        };
      }

      // Feed error back for next attempt
      if (attempt < MAX_RETRIES) {
        messages.push({
          role: "assistant",
          content: [{ type: "text", content: rawText }],
        });
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              content: `Your JSON response failed validation:\n${error}\n\nPlease fix the errors and return the corrected JSON. Return ONLY the raw JSON object, no code fences.`,
            },
          ],
        });
        onStatus?.(
          `retry ${attempt + 1}/${MAX_RETRIES} — feeding back validation errors...`,
        );
      } else {
        throw new Error(
          `Validation failed after ${MAX_RETRIES} retries: ${error}`,
        );
      }
    } catch (retryErr) {
      if (attempt === MAX_RETRIES) throw retryErr;
      const msg =
        retryErr instanceof Error ? retryErr.message : String(retryErr);
      onStatus?.(`attempt ${attempt} failed: ${msg.slice(0, 80)}...`);
    }
  }

  throw new Error("All retry attempts exhausted");
}

/**
 * Run the full benchmark: iterate problems × models.
 */
export async function runBenchmark(
  problems: Problem[],
  models: ModelConfig[],
): Promise<void> {
  const outputDir = getOutputDir();
  const totalRuns = problems.length * models.length;
  let completed = 0;
  let failed = 0;

  log.info(
    `Starting benchmark: ${problems.length} problem(s) × ${models.length} model(s) = ${totalRuns} run(s)`,
  );
  log.dim(`Output directory: ${outputDir}`);
  console.log();

  for (const problem of problems) {
    log.info(`Problem: ${problem.title} (${problem.key})`);

    for (const model of models) {
      const spinner = ora({
        text: `${model.displayName} — generating HLD...`,
        prefixText: "  ",
      }).start();

      try {
        const result = await runSingle(problem, model, (status) => {
          spinner.text = `${model.displayName} — ${status}`;
        });
        const runDir = writeRunResult(outputDir, result);

        spinner.succeed(
          `${model.displayName} — done in ${result.meta.durationMs}ms → ${runDir}`,
        );
        completed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        spinner.fail(`${model.displayName} — failed: ${message}`);
        failed++;
      }
    }

    console.log();
  }

  // Summary
  log.info("─".repeat(50));
  log.success(`Completed: ${completed}/${totalRuns}`);
  if (failed > 0) {
    log.error(`Failed: ${failed}/${totalRuns}`);
  }
}
