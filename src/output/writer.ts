import fs from "node:fs";
import path from "node:path";
import type { HLDOutput, RunMeta, RunResult } from "../types.js";
import { log } from "../utils/logger.js";

/**
 * Normalize Mermaid diagram source: LLMs often return literal `\n`
 * instead of real newlines inside structured output strings.
 */
export function normalizeMermaid(src: string): string {
  // Replace literal two-char sequences `\n` and `\t` with real whitespace
  return src.replace(/\\n/g, "\n").replace(/\\t/g, "  ");
}

/**
 * Sanitize a Mermaid diagram to fix common LLM mistakes:
 * - Unquoted parentheses / special chars in flowchart [] node labels
 * - Trailing % or %% comment fragments
 * - Stray code fence markers
 *
 * This is applied AFTER normalizeMermaid.
 */
export function sanitizeMermaid(src: string): string {
  let result = normalizeMermaid(src);

  // Remove wrapping code fences if the LLM included them
  result = result.replace(/^```mermaid\s*\n/i, "").replace(/\n```\s*$/, "");

  // Remove trailing % or %% (sometimes appended by LLMs)
  result = result.replace(/[\s%]+$/, "");

  // Collapse multi-line node labels: a newline inside ["..."] breaks Mermaid
  result = result.replace(/\["([^"]*?)"\]/gs, (_match, inner: string) => {
    return `["${inner.replace(/\n\s*/g, " ").trim()}"]`;
  });

  // Replace & with 'and' inside quoted labels (Mermaid can't handle & in flowcharts)
  result = result.replace(/\["([^"]*?)"\]/g, (_match, inner: string) => {
    return `["${inner.replace(/&/g, "and")}"]`;
  });

  // Fix flowchart node labels with unquoted special chars.
  // Matches: ID[Label text (with parens) more text]
  // Replaces with: ID["Label text (with parens) more text"]
  // Only for single-bracket labels (not [( )] which is valid cylinder syntax).
  result = result.replace(
    /(?<=\w)\[(?!\[|\(|")((?:[^\]"]*\([^)]*\)[^\]"]*)+)\]/g,
    (_match, inner: string) => `["${inner}"]`,
  );

  // Fix subgraph titles with parentheses or special chars.
  // Mermaid requires: subgraph id ["title"] when title has special chars.
  // LLMs often write: subgraph Some Title (Details)
  // Convert to: subgraph SomeTitle["Some Title (Details)"]
  result = result.replace(
    /^(\s*)subgraph\s+((?:(?!\[).)*\([^)]*\).*?)$/gm,
    (_match, indent: string, title: string) => {
      const trimmed = title.trim();
      // Generate a safe ID by removing non-alphanumeric chars
      const safeId = trimmed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 30);
      return `${indent}subgraph ${safeId}["${trimmed}"]`;
    },
  );

  // Remove escaped quotes inside already-quoted labels: ["text \"inner\" text"] -> ["text inner text"]
  result = result.replace(/\\\\?"/g, "'");

  // Fix sequence diagram participants with spaces that aren't declared
  if (/^sequenceDiagram/m.test(result)) {
    // Collect declared participant names (the alias, i.e. left side of `as`)
    const declared = new Set<string>();
    for (const m of result.matchAll(/^\s*participant\s+(\S+)/gm)) {
      declared.add(m[1]);
    }
    // Also collect aliases used in `as` patterns
    for (const m of result.matchAll(/^\s*participant\s+\S+\s+as\s+/gm)) {
      // already captured the id above
    }

    // Find multi-word participant names in arrow lines that aren't declared.
    // Arrow patterns: A->>B:, A-->>B:, A-)B:, etc.
    const undeclared = new Map<string, string>();
    const arrowRe =
      /^(\s*)(\S+)\s*(--?>?>|--?>?>>[+-]?|->>?[+-]?|-[)x]|--[)x])\s*(.+?)\s*:/gm;
    for (const m of result.matchAll(arrowRe)) {
      const target = m[4].trim();
      if (
        (target.includes(" ") || /[^a-zA-Z0-9_]/.test(target)) &&
        !declared.has(target)
      ) {
        const safeId = target.replace(/[^a-zA-Z0-9]/g, "_");
        undeclared.set(target, safeId);
      }
    }
    // Also check the source side (less common but possible)
    const arrowReSrc =
      /^(\s*)(.+?)\s*(--?>?>|--?>?>>[+-]?|->>?[+-]?|-[)x]|--[)x])\s*(\S+)\s*:/gm;
    for (const m of result.matchAll(arrowReSrc)) {
      const source = m[2].trim();
      if (
        (source.includes(" ") || /[^a-zA-Z0-9_]/.test(source)) &&
        !declared.has(source) &&
        !undeclared.has(source)
      ) {
        const safeId = source.replace(/[^a-zA-Z0-9]/g, "_");
        undeclared.set(source, safeId);
      }
    }

    // Replace occurrences and add participant declarations
    if (undeclared.size > 0) {
      const declarations: string[] = [];
      for (const [name, safeId] of undeclared) {
        declarations.push(`    participant ${safeId} as "${name}"`);
        // Replace all occurrences in arrow lines (both as source and target)
        result = result.replaceAll(name, safeId);
      }
      // Insert declarations after "sequenceDiagram" line
      result = result.replace(
        /^(sequenceDiagram\s*\n)/m,
        `$1${declarations.join("\n")}\n`,
      );
    }
  }

  return result;
}

/**
 * Get the output directory for a specific problem + model run.
 */
export function getRunDir(
  outputBase: string,
  problemKey: string,
  modelId: string,
): string {
  // Sanitize model name for filesystem
  const safeName = modelId.replace(/[^a-zA-Z0-9._-]/g, "-");
  return path.join(outputBase, `${problemKey}-${safeName}`);
}

/**
 * Write the full results of a benchmark run to disk.
 */
export function writeRunResult(outputBase: string, result: RunResult): string {
  const runDir = getRunDir(outputBase, result.meta.problem, result.meta.model);

  // Ensure directory exists
  fs.mkdirSync(runDir, { recursive: true });

  // 1. Write raw structured JSON response
  fs.writeFileSync(
    path.join(runDir, "raw-response.json"),
    JSON.stringify(result.output, null, 2),
  );

  // 2. Write metadata
  fs.writeFileSync(
    path.join(runDir, "meta.json"),
    JSON.stringify(result.meta, null, 2),
  );

  // 3. Write Mermaid diagram sources (sanitize fixes common LLM syntax errors)
  if (result.output.architectureDiagram) {
    fs.writeFileSync(
      path.join(runDir, "architecture.mmd"),
      sanitizeMermaid(result.output.architectureDiagram),
    );
  }

  if (result.output.dataFlow) {
    fs.writeFileSync(
      path.join(runDir, "data-flow.mmd"),
      sanitizeMermaid(result.output.dataFlow),
    );
  }

  // 4. Generate and write design markdown
  const markdown = renderDesignMarkdown(result.output, result.meta);
  fs.writeFileSync(path.join(runDir, "design.md"), markdown);

  return runDir;
}

/**
 * Render the structured HLD output into a readable Markdown document.
 */
function renderDesignMarkdown(output: HLDOutput, meta: RunMeta): string {
  const lines: string[] = [];

  lines.push(`# ${output.title}`);
  lines.push("");
  lines.push(
    `> Generated by **${meta.model}** (${meta.provider}) on ${meta.timestamp}`,
  );
  lines.push(`> Duration: ${meta.durationMs}ms`);
  lines.push("");

  // Overview
  lines.push("## Overview");
  lines.push("");
  lines.push(output.overview);
  lines.push("");

  // Requirements
  lines.push("## Requirements");
  lines.push("");
  lines.push("### Functional");
  for (const req of output.requirements.functional) {
    lines.push(`- ${req}`);
  }
  lines.push("");
  lines.push("### Non-Functional");
  for (const req of output.requirements.nonFunctional) {
    lines.push(`- ${req}`);
  }
  lines.push("");

  // Architecture Diagram
  lines.push("## Architecture Diagram");
  lines.push("");
  lines.push("```mermaid");
  lines.push(sanitizeMermaid(output.architectureDiagram));
  lines.push("```");
  lines.push("");

  // Components
  lines.push("## Components");
  lines.push("");
  for (const comp of output.components) {
    lines.push(`### ${comp.name}`);
    lines.push("");
    lines.push(`- **Responsibility:** ${comp.responsibility}`);
    lines.push(`- **Technology:** ${comp.techChoice}`);
    lines.push(`- **Justification:** ${comp.justification}`);
    lines.push("");
  }

  // Data Flow
  lines.push("## Data Flow");
  lines.push("");
  lines.push("```mermaid");
  lines.push(sanitizeMermaid(output.dataFlow));
  lines.push("```");
  lines.push("");

  // Data Storage
  lines.push("## Data Storage");
  lines.push("");
  lines.push("| Store | Type | Justification |");
  lines.push("|-------|------|---------------|");
  for (const store of output.dataStorage) {
    lines.push(`| ${store.store} | ${store.type} | ${store.justification} |`);
  }
  lines.push("");

  // API Design
  lines.push("## API Design");
  lines.push("");
  lines.push("| Method | Endpoint | Description |");
  lines.push("|--------|----------|-------------|");
  for (const api of output.apiDesign) {
    lines.push(`| ${api.method} | \`${api.endpoint}\` | ${api.description} |`);
  }
  lines.push("");

  // Scalability
  lines.push("## Scalability Strategy");
  lines.push("");
  lines.push(output.scalabilityStrategy);
  lines.push("");

  // Trade-offs
  lines.push("## Trade-offs");
  lines.push("");
  for (const tradeoff of output.tradeoffs) {
    lines.push(`### ${tradeoff.decision}`);
    lines.push("");
    lines.push("**Pros:**");
    for (const pro of tradeoff.pros) {
      lines.push(`- ${pro}`);
    }
    lines.push("");
    lines.push("**Cons:**");
    for (const con of tradeoff.cons) {
      lines.push(`- ${con}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
