import { runChat } from "../lib/llm/loop";

/**
 * POST /api/chat — the customer-facing brain.
 * Body: { messages: [{role, content}], cartId?: string }
 * Returns: { reply, products, cart, checkoutUrl, cartId }
 *
 * CORS-open because the drawer runs on the storefront origin (and the
 * standalone demo page), which differ from the app's tunnel origin.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// Preflight + any GET (health check).
export async function loader({ request }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return json({ ok: true, service: "ai-side-cart chat" });
}

export async function action({ request }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages || messages.length === 0) {
    return json({ error: "messages[] required" }, 400);
  }

  // Keep only well-formed user/assistant text turns.
  const history = messages
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
    .map((m) => ({ role: m.role, content: m.content }));

  const cartId = typeof body?.cartId === "string" && body.cartId ? body.cartId : null;

  try {
    const result = await runChat({ history, cartId });
    return json(result);
  } catch (e) {
    console.error("[api/chat] error", e);
    return json({ error: e instanceof Error ? e.message : "chat failed" }, 500);
  }
}
