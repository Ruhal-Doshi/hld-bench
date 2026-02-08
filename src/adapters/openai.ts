import { openaiText } from "@tanstack/ai-openai";
import type { ModelConfig } from "../types.js";

export function createOpenAIAdapter(config: ModelConfig) {
  return openaiText(config.model as any);
}
