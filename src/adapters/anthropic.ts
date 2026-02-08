import { anthropicText } from "@tanstack/ai-anthropic";
import type { ModelConfig } from "../types.js";

export function createAnthropicAdapter(config: ModelConfig) {
  return anthropicText(config.model as any);
}
