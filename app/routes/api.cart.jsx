import { getCart, updateCart } from "../lib/ucp/client";

/**
 * POST /api/cart — deterministic cart ops for drawer button clicks
 * (Add / remove / change qty / apply discount / refresh). No LLM involved.
 * Body: { action, cartId?, variantId?, lineId?, quantity?, code? }
 * Returns: { cart, errors? }
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

export async function loader({ request }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return json({ ok: true, service: "ai-side-cart cart" });
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

  const { action, cartId, variantId, lineId, quantity, code, codes } = body ?? {};

  try {
    let result;
    switch (action) {
      case "add":
        if (!variantId) return json({ error: "variantId required" }, 400);
        result = await updateCart({
          cartId: cartId || undefined,
          addItems: [{ variantId, quantity: typeof quantity === "number" ? quantity : 1 }],
        });
        break;
      case "setqty":
        if (!cartId || !lineId) return json({ error: "cartId and lineId required" }, 400);
        result = await updateCart({
          cartId,
          updateItems: [{ lineId, quantity: Number(quantity ?? 0) }],
        });
        break;
      case "remove":
        if (!cartId || !lineId) return json({ error: "cartId and lineId required" }, 400);
        result = await updateCart({ cartId, removeLineIds: [lineId] });
        break;
      case "discount": {
        if (!cartId) return json({ error: "cartId required" }, 400);
        // Full desired set of codes (Shopify replaces the set). Supports stacking + removal.
        const set = Array.isArray(codes) ? codes.map(String) : code ? [String(code)] : [];
        result = await updateCart({ cartId, discountCodes: set });
        break;
      }
      case "get": {
        if (!cartId) return json({ cart: null });
        const cart = await getCart(cartId);
        return json({ cart });
      }
      default:
        return json({ error: `unknown action ${action}` }, 400);
    }
    return json({ cart: result.cart, errors: result.errors });
  } catch (e) {
    console.error("[api/cart] error", e);
    return json({ error: e instanceof Error ? e.message : "cart op failed" }, 500);
  }
}
