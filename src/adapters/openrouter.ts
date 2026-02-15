import { openRouterText } from "@tanstack/ai-openrouter";
import type { ModelConfig } from "../types.js";

export function createOpenRouterAdapter(config: ModelConfig) {
  return openRouterText(config.model as any);
}
