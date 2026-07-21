import { getCart } from "../ucp/client";
import { getProvider } from "./provider";
import { buildSystemPrompt } from "./systemPrompt";
import { COMMERCE_TOOLS, executeTool, type ToolContext } from "./tools";
import type { ChatResult, LlmMessage } from "./types";

export type IncomingMessage = { role: "user" | "assistant"; content: string };

const MAX_STEPS = 6;

/**
 * Run one customer turn: interpret intent, call commerce tools as needed, and
 * return the structured payload the drawer renders (reply + products + cart).
 * Conversation history + cartId are supplied by the client each turn (session
 * lives in the drawer, not the server — no persistence, per spec).
 */
export async function runChat(input: {
  history: IncomingMessage[];
  cartId: string | null;
}): Promise<ChatResult> {
  const provider = getProvider();
  const ctx: ToolContext = { cartId: input.cartId, seen: {}, recommended: [], cart: null };

  // Hydrate current cart so the model knows what's already in it.
  if (ctx.cartId) {
    try {
      ctx.cart = await getCart(ctx.cartId);
    } catch {
      ctx.cart = null;
    }
  }

  const messages: LlmMessage[] = input.history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let finalText = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    const system = buildSystemPrompt(ctx.cart);
    const turn = await provider.generate({ system, messages, tools: COMMERCE_TOOLS });

    if (turn.text) finalText = turn.text;

    if (turn.toolCalls.length === 0) break;

    messages.push({ role: "assistant", content: turn.text, toolCalls: turn.toolCalls });

    const results = [];
    for (const tc of turn.toolCalls) {
      const content = await executeTool(tc.name, tc.args, ctx);
      results.push({ id: tc.id, name: tc.name, content });
    }
    messages.push({ role: "tool", toolResults: results });
  }

  return {
    reply: finalText || "Sorry, I did not catch that. Could you rephrase?",
    products: ctx.recommended,
    cart: ctx.cart,
    checkoutUrl: ctx.cart?.checkoutUrl ?? null,
    cartId: ctx.cartId,
  };
}
