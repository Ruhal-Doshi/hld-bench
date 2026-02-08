#!/usr/bin/env node

import "dotenv/config";
import { config as dotenvLocal } from "dotenv";
dotenvLocal({ path: ".env.local", override: true });

import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import {
  DEFAULT_MODELS,
  getOutputDir,
  getProblemsDir,
  loadModels,
  loadProblems,
} from "./config.js";
import { runBenchmark } from "./runner.js";
import { generateReport } from "./output/report.js";
import { regenerateOutputs } from "./output/regenerate.js";
import { log } from "./utils/logger.js";

const program = new Command();

program
  .name("hld-bench")
  .description("Benchmark LLMs on high-level system design")
  .version("0.1.0");

program
  .command("run")
  .description("Run the HLD benchmark")
  .option("-p, --problem <key>", "Run only the specified problem (by key)")
  .option("-m, --model <id>", "Run only the specified model (by id)")
  .option("-c, --config <path>", "Path to models.yaml config file")
  .option(
    "--problems-dir <path>",
    "Path to problems directory",
    getProblemsDir(),
  )
  .action(async (opts) => {
    try {
      // Load problems
      let problems = loadProblems(opts.problemsDir);

      if (opts.problem) {
        problems = problems.filter((p) => p.key === opts.problem);
        if (problems.length === 0) {
          log.error(`Problem not found: ${opts.problem}`);
          process.exit(1);
        }
      }

      // Load models (from config file or defaults)
      let models = loadModels(opts.config);

      if (opts.model) {
        models = models.filter((m) => m.id === opts.model);
        if (models.length === 0) {
          const allModels = loadModels(opts.config);
          log.error(
            `Model not found: ${opts.model}. Available: ${allModels.map((m) => m.id).join(", ")}`,
          );
          process.exit(1);
        }
      }

      await runBenchmark(problems, models);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List available problems and models")
  .option(
    "--problems-dir <path>",
    "Path to problems directory",
    getProblemsDir(),
  )
  .option("-c, --config <path>", "Path to models.yaml config file")
  .action((opts) => {
    try {
      const problems = loadProblems(opts.problemsDir);

      console.log("\n📋 Problems:\n");
      for (const p of problems) {
        console.log(`  ${p.key.padEnd(25)} ${p.title}`);
        if (p.tags && p.tags.length > 0) {
          console.log(`  ${"".padEnd(25)} tags: ${p.tags.join(", ")}`);
        }
      }

      const models = loadModels(opts.config);
      console.log("\n🤖 Models:\n");
      for (const m of models) {
        console.log(`  ${m.id.padEnd(25)} ${m.displayName} (${m.provider})`);
      }

      console.log();
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("report")
  .description("Generate an HTML report from benchmark results")
  .option(
    "-o, --output <dir>",
    "Output directory containing results",
    getOutputDir(),
  )
  .action((opts) => {
    try {
      const reportPath = generateReport(opts.output);
      if (reportPath) {
        log.success(`Report generated: ${reportPath}`);
        log.dim("Run `pnpm run bench serve` to view in browser");
      }
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("regenerate")
  .description(
    "Regenerate .mmd and design.md files from raw-response.json (no LLM calls)",
  )
  .option(
    "-o, --output <dir>",
    "Output directory containing results",
    getOutputDir(),
  )
  .action((opts) => {
    try {
      const count = regenerateOutputs(opts.output);
      if (count > 0) {
        log.success(`Regenerated outputs for ${count} run(s)`);
      } else {
        log.warn("No runs found to regenerate");
      }
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("serve")
  .description("Serve the output directory and open the report in your browser")
  .option(
    "-o, --output <dir>",
    "Output directory containing results",
    getOutputDir(),
  )
  .option("-p, --port <port>", "Port to serve on", "8765")
  .action(async (opts) => {
    const reportFile = path.join(opts.output, "report.html");
    if (!fs.existsSync(reportFile)) {
      log.warn("No report.html found. Generating report first...");
      generateReport(opts.output);
    }
    const port = opts.port;
    const url = `http://localhost:${port}/report.html`;
    log.info(`Serving ${opts.output} on ${url}`);
    log.dim("Press Ctrl+C to stop");

    const { createServer } = await import("node:http");
    const server = createServer((req, res) => {
      const safePath = (req.url ?? "/").split("?")[0].replace(/\.\./g, "");
      const filePath = path.join(
        opts.output,
        safePath === "/" ? "/report.html" : safePath,
      );
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".html": "text/html",
        ".json": "application/json",
        ".mmd": "text/plain",
        ".md": "text/markdown",
        ".css": "text/css",
        ".js": "text/javascript",
      };
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] ?? "application/octet-stream",
      });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(Number(port), () => {
      log.success(`Server running at ${url}`);
      // Try to open browser
      import("node:child_process")
        .then(({ exec }) => exec(`open ${url}`))
        .catch(() => {});
    });
  });

// Default: show help
program.action(() => {
  program.help();
});

program.parse();
