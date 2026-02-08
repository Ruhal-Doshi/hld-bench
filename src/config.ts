import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { ModelConfig, Problem, Provider } from "./types.js";
import { BUILTIN_PROVIDERS, ModelsFileSchema, ProblemSchema } from "./types.js";
import type { BuiltinProvider } from "./types.js";
import { log } from "./utils/logger.js";

// ─── Environment / API Keys ──────────────────────────────────────────────────

/** Default env var names for built-in providers */
const BUILTIN_ENV_KEYS: Record<BuiltinProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

/** Resolve the env var name for a model config */
export function resolveEnvVar(config: ModelConfig): string | undefined {
  if (config.envVar) return config.envVar;
  if ((BUILTIN_PROVIDERS as readonly string[]).includes(config.provider)) {
    return BUILTIN_ENV_KEYS[config.provider as BuiltinProvider];
  }
  // Custom provider — try <PROVIDER>_API_KEY convention
  return `${config.provider.toUpperCase()}_API_KEY`;
}

export function validateEnvForModel(config: ModelConfig): void {
  const envVar = resolveEnvVar(config);
  if (envVar && !process.env[envVar]) {
    throw new Error(
      `Missing environment variable: ${envVar} (required for ${config.provider} model ${config.id})`,
    );
  }
}

// ─── Default Models ──────────────────────────────────────────────────────────

export const DEFAULT_MODELS: ModelConfig[] = [
  // OpenAI — Frontier
  { id: "gpt-5.2", provider: "openai", model: "gpt-5.2", displayName: "GPT-5.2" },
  { id: "gpt-5-mini", provider: "openai", model: "gpt-5-mini", displayName: "GPT-5 Mini" },
  { id: "gpt-4.1", provider: "openai", model: "gpt-4.1", displayName: "GPT-4.1" },
  // Anthropic
  { id: "claude-opus-4-6", provider: "anthropic", model: "claude-opus-4-6", displayName: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-5", provider: "anthropic", model: "claude-sonnet-4-5", displayName: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5", provider: "anthropic", model: "claude-haiku-4-5", displayName: "Claude Haiku 4.5" },
  { id: "claude-sonnet-4", provider: "anthropic", model: "claude-sonnet-4-20250514", displayName: "Claude Sonnet 4" },
  // Gemini
  { id: "gemini-3-pro-preview", provider: "gemini", model: "gemini-3-pro-preview", displayName: "Gemini 3 Pro Preview" },
  { id: "gemini-3-flash-preview", provider: "gemini", model: "gemini-3-flash-preview", displayName: "Gemini 3 Flash Preview" },
  { id: "gemini-2.5-pro", provider: "gemini", model: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro" },
  { id: "gemini-2.0-flash", provider: "gemini", model: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash" },
];

// ─── Models Config File Loading ──────────────────────────────────────────────

export function loadModels(configPath?: string): ModelConfig[] {
  // If explicit path provided, it must exist
  if (configPath) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Models config file not found: ${configPath}`);
    }
    return parseModelsFile(configPath);
  }

  // Auto-detect models.yaml in project root
  const autoPath = path.join(getProjectRoot(), "models.yaml");
  if (fs.existsSync(autoPath)) {
    log.dim(`Loading models from ${autoPath}`);
    return parseModelsFile(autoPath);
  }

  // Fallback to defaults
  return DEFAULT_MODELS;
}

function parseModelsFile(filePath: string): ModelConfig[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const raw = parse(content);
  const result = ModelsFileSchema.safeParse(raw);

  if (!result.success) {
    throw new Error(`Invalid models config file: ${result.error.message}`);
  }

  return result.data.models;
}

// ─── Problem Loading ─────────────────────────────────────────────────────────

export function loadProblems(problemsDir: string): Problem[] {
  if (!fs.existsSync(problemsDir)) {
    throw new Error(`Problems directory not found: ${problemsDir}`);
  }

  const files = fs
    .readdirSync(problemsDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  if (files.length === 0) {
    throw new Error(`No problem files found in: ${problemsDir}`);
  }

  const problems: Problem[] = [];

  for (const file of files) {
    const filePath = path.join(problemsDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const raw = parse(content);
    const result = ProblemSchema.safeParse(raw);

    if (!result.success) {
      log.warn(
        `Skipping invalid problem file ${file}: ${result.error.message}`,
      );
      continue;
    }

    problems.push(result.data);
  }

  return problems;
}

// ─── Paths ───────────────────────────────────────────────────────────────────

export function getProjectRoot(): string {
  return process.cwd();
}

export function getProblemsDir(): string {
  return path.join(getProjectRoot(), "problems");
}

export function getOutputDir(): string {
  return path.join(getProjectRoot(), "output");
}
