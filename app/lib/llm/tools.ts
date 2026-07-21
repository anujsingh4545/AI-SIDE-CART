import { searchCatalog, updateCart, getCart } from "../ucp/client";
import type { Cart, Product } from "../ucp/types";
import type { LlmTool } from "./types";

/** Commerce tools exposed to the model. snake_case for cross-provider friendliness. */
export const COMMERCE_TOOLS: LlmTool[] = [
  {
    name: "search_catalog",
    description:
      "Search the live store catalog. Use SHORT keyword queries (e.g. 'hiking backpack', 'trail shoes'). Returns in-stock products with a product_id, price, and available sizes. Only in-stock products are returned.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Short keyword search, e.g. 'trail shoes'" },
        max_price: { type: "number", description: "Optional max unit price in INR." },
      },
      required: ["query"],
    },
  },
  {
    name: "recommend_products",
    description:
      "Show product cards in the drawer for the products you are recommending RIGHT NOW. Pass the product_ids (from search_catalog) you mention in your reply. Only pass in-stock products you actually recommend. Call this whenever you suggest products so the customer can add them. Do NOT pass products already in the cart.",
    parameters: {
      type: "object",
      properties: {
        product_ids: { type: "array", items: { type: "string" }, description: "product_id values to show as cards" },
      },
      required: ["product_ids"],
    },
  },
  {
    name: "add_to_cart",
    description:
      "Add a product to the cart. Prefer variant_id when a specific size is chosen; otherwise pass product_id and the default variant is used.",
    parameters: {
      type: "object",
      properties: {
        product_id: { type: "string" },
        variant_id: { type: "string" },
        quantity: { type: "integer", description: "default 1" },
      },
    },
  },
  {
    name: "set_quantity",
    description: "Change a cart line's quantity. Quantity 0 removes it.",
    parameters: {
      type: "object",
      properties: { line_id: { type: "string" }, quantity: { type: "integer" } },
      required: ["line_id", "quantity"],
    },
  },
  {
    name: "remove_from_cart",
    description: "Remove a cart line by line_id.",
    parameters: {
      type: "object",
      properties: { line_id: { type: "string" } },
      required: ["line_id"],
    },
  },
  {
    name: "apply_discount",
    description: "Apply a discount code to the cart (e.g. WELCOME10, MONSOON20). Returns whether it was accepted.",
    parameters: {
      type: "object",
      properties: { code: { type: "string" } },
      required: ["code"],
    },
  },
  {
    name: "view_cart",
    description: "Get current cart contents, totals, and checkout URL.",
    parameters: { type: "object", properties: {} },
  },
];

/** Mutable state threaded through a single chat turn's tool executions. */
export type ToolContext = {
  cartId: string | null;
  /** Every product seen via search this turn, keyed by product_id. */
  seen: Record<string, Product>;
  /** Products the model explicitly chose to show as cards. */
  recommended: Product[];
  cart: Cart | null;
};

function productForModel(p: Product) {
  const sizes = p.hasOptions
    ? p.variants.filter((v) => v.available && v.label).map((v) => ({ size: v.label, variant_id: v.id }))
    : [];
  return {
    product_id: p.id,
    title: p.title,
    price: p.price ? `INR ${p.price.amount}` : "n/a",
    ...(sizes.length ? { sizes } : {}),
  };
}

function cartForModel(cart: Cart | null) {
  if (!cart) return { empty: true };
  return {
    total_quantity: cart.totalQuantity,
    subtotal: cart.subtotal ? `INR ${cart.subtotal.amount}` : null,
    total: cart.total ? `INR ${cart.total.amount}` : null,
    lines: cart.lines.map((l) => ({ line_id: l.lineId, title: l.title, quantity: l.quantity })),
    discounts: cart.discountCodes,
    checkout_url: cart.checkoutUrl,
  };
}

/** Resolve a variant id from either an explicit variant_id or a product_id (default variant). */
function resolveVariant(ctx: ToolContext, args: Record<string, unknown>): string | null {
  if (typeof args.variant_id === "string" && args.variant_id) return args.variant_id;
  if (typeof args.product_id === "string" && ctx.seen[args.product_id]) {
    return ctx.seen[args.product_id].variantId;
  }
  return null;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  try {
    switch (name) {
      case "search_catalog": {
        const query = String(args.query ?? "").trim();
        const maxPrice = typeof args.max_price === "number" ? args.max_price : undefined;
        let products = await searchCatalog(query, 10);
        // Only surface in-stock products.
        products = products.filter((p) => p.available);
        if (maxPrice != null) products = products.filter((p) => !p.price || p.price.amount <= maxPrice);
        products.forEach((p) => (ctx.seen[p.id] = p));
        return JSON.stringify({ products: products.map(productForModel) });
      }
      case "recommend_products": {
        const ids = Array.isArray(args.product_ids) ? args.product_ids.map(String) : [];
        const chosen = ids.map((id) => ctx.seen[id]).filter((p): p is Product => !!p && p.available);
        // Append (dedupe) so multiple recommend calls in a turn accumulate.
        for (const p of chosen) {
          if (!ctx.recommended.find((r) => r.id === p.id)) ctx.recommended.push(p);
        }
        return JSON.stringify({ shown: chosen.map((p) => p.title) });
      }
      case "add_to_cart": {
        const variantId = resolveVariant(ctx, args);
        if (!variantId) return JSON.stringify({ ok: false, error: "unknown product/variant" });
        const quantity = typeof args.quantity === "number" ? args.quantity : 1;
        const { cart, errors } = await updateCart({
          cartId: ctx.cartId ?? undefined,
          addItems: [{ variantId, quantity }],
        });
        if (cart) { ctx.cart = cart; ctx.cartId = cart.id; }
        return JSON.stringify({ ok: !!cart, errors, cart: cartForModel(cart) });
      }
      case "set_quantity": {
        if (!ctx.cartId) return JSON.stringify({ ok: false, error: "no cart yet" });
        const { cart, errors } = await updateCart({
          cartId: ctx.cartId,
          updateItems: [{ lineId: String(args.line_id ?? ""), quantity: Number(args.quantity ?? 0) }],
        });
        if (cart) ctx.cart = cart;
        return JSON.stringify({ ok: !!cart, errors, cart: cartForModel(cart) });
      }
      case "remove_from_cart": {
        if (!ctx.cartId) return JSON.stringify({ ok: false, error: "no cart yet" });
        const { cart, errors } = await updateCart({
          cartId: ctx.cartId,
          removeLineIds: [String(args.line_id ?? "")],
        });
        if (cart) ctx.cart = cart;
        return JSON.stringify({ ok: !!cart, errors, cart: cartForModel(cart) });
      }
      case "apply_discount": {
        const code = String(args.code ?? "").trim();
        if (!ctx.cartId) return JSON.stringify({ ok: false, error: "cart is empty; add an item first" });
        const { cart, errors } = await updateCart({ cartId: ctx.cartId, discountCodes: [code] });
        if (cart) ctx.cart = cart;
        const applicable = cart?.discountCodes.find((d) => d.code.toUpperCase() === code.toUpperCase())?.applicable;
        return JSON.stringify({ ok: !!cart, applicable: applicable ?? false, errors, cart: cartForModel(cart) });
      }
      case "view_cart": {
        if (!ctx.cartId) return JSON.stringify({ empty: true });
        const cart = await getCart(ctx.cartId);
        if (cart) ctx.cart = cart;
        return JSON.stringify({ cart: cartForModel(cart) });
      }
      default:
        return JSON.stringify({ error: `unknown tool ${name}` });
    }
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
  }
}
