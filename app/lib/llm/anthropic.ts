import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env.server";
import type { GenerateOptions, LlmMessage, LlmProvider, LlmToolCall, LlmTurn } from "./types";

/**
 * Anthropic (Claude Haiku) adapter — the production customer-path model.
 * Maps our messages/tools to Anthropic's tool_use / tool_result blocks.
 * Not active until LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY are set.
 */

function toAnthropicMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const content: Anthropic.ContentBlockParam[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls ?? []) {
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args });
      }
      out.push({ role: "assistant", content });
    } else {
      out.push({
        role: "user",
        content: m.toolResults.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.id,
          content: r.content,
        })),
      });
    }
  }
  return out;
}

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

export const anthropicProvider: LlmProvider = {
  name: "anthropic",
  async generate(opts: GenerateOptions): Promise<LlmTurn> {
    const anthropic = getClient();
    const res = await anthropic.messages.create({
      model: env.anthropicModel,
      max_tokens: 1024,
      system: opts.system,
      messages: toAnthropicMessages(opts.messages),
      tools: opts.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool.InputSchema,
      })),
    });

    let text = "";
    const toolCalls: LlmToolCall[] = [];
    for (const block of res.content) {
      if (block.type === "text") text += block.text;
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          args: block.input as Record<string, unknown>,
        });
      }
    }
    return { text: text.trim(), toolCalls };
  },
};
