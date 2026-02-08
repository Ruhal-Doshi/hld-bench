import type { ModelConfig } from "../types.js";
import { createOpenAIAdapter } from "./openai.js";
import { createAnthropicAdapter } from "./anthropic.js";
import { createGeminiAdapter } from "./gemini.js";

/**
 * Create a TanStack AI text adapter for the given model config.
 * Built-in providers: openai, anthropic, gemini.
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
    default:
      // For unknown providers, fall back to OpenAI-compatible adapter
      // (many providers like OpenRouter, Together, etc. use OpenAI-compatible APIs)
      return createOpenAIAdapter(config);
  }
}
