import type { ModelConfig } from "../types.js";
import { createOpenAIAdapter } from "./openai.js";
import { createAnthropicAdapter } from "./anthropic.js";
import { createGeminiAdapter } from "./gemini.js";
import { createOpenRouterAdapter } from "./openrouter.js";

/**
 * Create a TanStack AI text adapter for the given model config.
 * Built-in providers: openai, anthropic, gemini, openrouter.
 * For custom providers, uses the OpenAI-compatible adapter (works with OpenRouter, etc.).
 */
export function createAdapter(config: ModelConfig) {
  switch (config.provider) {
    case "openai":
      return createOpenAIAdapter(config);
    case "anthropic":
      return createAnthropicAdapter(config);
    case "gemini":
      return createGeminiAdapter(config);
    case "openrouter":
      return createOpenRouterAdapter(config);
    default:
      // For unknown providers, fall back to OpenAI-compatible adapter
      // (many providers like Together, etc. use OpenAI-compatible APIs)
      return createOpenAIAdapter(config);
  }
}
