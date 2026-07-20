import Anthropic from "@anthropic-ai/sdk";

let _client = null;

export function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}
