import type { Cart, Product } from "../ucp/types";

/** A tool the model can call. `parameters` is JSON Schema. */
export type LlmTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/** A tool call the model requested. */
export type LlmToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** Opaque provider metadata that MUST be echoed back (Gemini 3 thoughtSignature). */
  thoughtSignature?: string;
};

/** Normalized conversation message, provider-agnostic. */
export type LlmMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: LlmToolCall[] }
  | { role: "tool"; toolResults: Array<{ id: string; name: string; content: string }> };

/** One model turn: optional text + any tool calls it wants executed. */
export type LlmTurn = {
  text: string;
  toolCalls: LlmToolCall[];
};

export type GenerateOptions = {
  system: string;
  messages: LlmMessage[];
  tools: LlmTool[];
};

export interface LlmProvider {
  readonly name: string;
  generate(opts: GenerateOptions): Promise<LlmTurn>;
}

/** The structured payload the drawer consumes. */
export type ChatResult = {
  reply: string;
  products: Product[];
  cart: Cart | null;
  checkoutUrl: string | null;
  cartId: string | null;
};
