import { env } from "../env.server";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import type { LlmProvider } from "./types";

/** Select the active provider from env. Swap with LLM_PROVIDER — no code change. */
export function getProvider(): LlmProvider {
  return env.llmProvider === "anthropic" ? anthropicProvider : geminiProvider;
}
