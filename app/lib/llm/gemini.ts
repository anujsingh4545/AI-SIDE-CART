import { GoogleGenAI } from "@google/genai";
import { env } from "../env.server";
import type { GenerateOptions, LlmMessage, LlmProvider, LlmToolCall, LlmTurn } from "./types";

/**
 * Gemini adapter. Maps our provider-agnostic messages/tools to the Gemini
 * generateContent format (functionDeclarations / functionCall / functionResponse).
 * Gemini contents use only "user" and "model" roles; tool results are sent back
 * as functionResponse parts inside a "user" content.
 */

function toGeminiContents(messages: LlmMessage[]) {
  const contents: Array<{ role: string; parts: unknown[] }> = [];
  for (const m of messages) {
    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    } else if (m.role === "assistant") {
      const parts: unknown[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls ?? []) {
        // Gemini 3 thinking models require the original thoughtSignature to be
        // echoed back on the functionCall part, or the next call 400s.
        const part: Record<string, unknown> = {
          functionCall: { name: tc.name, args: tc.args },
        };
        if (tc.thoughtSignature) part.thoughtSignature = tc.thoughtSignature;
        parts.push(part);
      }
      if (parts.length) contents.push({ role: "model", parts });
    } else {
      // tool results -> functionResponse parts in a user content
      const parts = m.toolResults.map((r) => ({
        functionResponse: { name: r.name, response: { output: safeParse(r.content) } },
      }));
      contents.push({ role: "user", parts });
    }
  }
  return contents;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { text: s };
  }
}

let client: GoogleGenAI | null = null;
function getClient() {
  if (!client) client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  return client;
}

export const geminiProvider: LlmProvider = {
  name: "gemini",
  async generate(opts: GenerateOptions): Promise<LlmTurn> {
    const ai = getClient();
    const res = await ai.models.generateContent({
      model: env.geminiModel,
      contents: toGeminiContents(opts.messages),
      config: {
        systemInstruction: opts.system,
        tools: [
          {
            functionDeclarations: opts.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters as never,
            })),
          },
        ],
        toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        temperature: 0.4,
      },
    });

    const parts = res.candidates?.[0]?.content?.parts ?? [];
    let text = "";
    const toolCalls: LlmToolCall[] = [];
    parts.forEach((p: any, i: number) => {
      if (p.text) text += p.text;
      if (p.functionCall) {
        toolCalls.push({
          id: `${p.functionCall.name}-${i}`,
          name: p.functionCall.name,
          args: (p.functionCall.args ?? {}) as Record<string, unknown>,
          thoughtSignature: p.thoughtSignature,
        });
      }
    });
    return { text: text.trim(), toolCalls };
  },
};
