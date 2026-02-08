import { geminiText } from "@tanstack/ai-gemini";
import type { ModelConfig } from "../types.js";

export function createGeminiAdapter(config: ModelConfig) {
  return geminiText(config.model as any);
}
