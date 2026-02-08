import { chat } from "@tanstack/ai";
import ora from "ora";
import { createAdapter } from "./adapters/index.js";
import { validateEnvForModel, getOutputDir } from "./config.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { writeRunResult } from "./output/writer.js";
import { createTimer } from "./utils/timer.js";
import { log } from "./utils/logger.js";
import { HLDOutputSchema } from "./types.js";
import type { ModelConfig, Problem, RunResult } from "./types.js";

/**
 * Run a single benchmark: one problem against one model.
 */
async function runSingle(problem: Problem, modelConfig: ModelConfig): Promise<RunResult> {
  validateEnvForModel(modelConfig);

  const adapter = createAdapter(modelConfig);
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(problem);

  const timer = createTimer();

  const output = await chat({
    adapter,
    systemPrompts: [systemPrompt],
    messages: [
      { role: "user", content: [{ type: "text", content: userPrompt }] },
    ],
    outputSchema: HLDOutputSchema,
  });

  const durationMs = timer.elapsed();

  return {
    meta: {
      problem: problem.key,
      model: modelConfig.id,
      provider: modelConfig.provider,
      timestamp: new Date().toISOString(),
      durationMs,
    },
    output,
  };
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

  log.info(`Starting benchmark: ${problems.length} problem(s) × ${models.length} model(s) = ${totalRuns} run(s)`);
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
        const result = await runSingle(problem, model);
        const runDir = writeRunResult(outputDir, result);

        spinner.succeed(`${model.displayName} — done in ${result.meta.durationMs}ms → ${runDir}`);
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
