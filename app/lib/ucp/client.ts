import { env } from "../env.server";
import type {
  AppliedDiscount,
  Cart,
  CartLine,
  Money,
  Product,
} from "./types";

/**
 * Client for Shopify's UCP Storefront MCP (`/api/mcp`) — auth-free JSON-RPC.
 * This is the customer-facing commerce path: catalog search + cart ops +
 * native checkout URL. No storefront token required.
 *
 * Two response quirks handled here, both discovered by probing the live store:
 *  1. Responses may be plain JSON or SSE (`data:` framed) — we parse both.
 *  2. search_catalog returns prices in MINOR units (299900 = ₹2999) while the
 *     cart returns MAJOR unit strings ("2999.0"). We normalize to major.
 */

let rpcId = 0;

async function mcpCall<T>(method: string, params?: unknown): Promise<T> {
  const body = { jsonrpc: "2.0", id: ++rpcId, method, ...(params ? { params } : {}) };
  const res = await fetch(env.ucpEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`UCP HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  let text = await res.text();
  // Unwrap SSE framing if present.
  if (text.includes("data:") && text.trimStart().startsWith("event:")) {
    text = text
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("");
  } else if (text.trimStart().startsWith("data:")) {
    text = text
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("");
  }
  const json = JSON.parse(text);
  if (json.error) {
    throw new Error(`UCP RPC error: ${JSON.stringify(json.error).slice(0, 300)}`);
  }
  return json.result as T;
}

/** Call a UCP tool and parse the inner JSON payload it returns as text. */
async function mcpTool<T>(name: string, args: unknown): Promise<T> {
  const result = await mcpCall<{ content: Array<{ type: string; text: string }> }>(
    "tools/call",
    { name, arguments: args },
  );
  const textPart = result.content.find((c) => c.type === "text");
  if (!textPart) throw new Error(`UCP tool ${name} returned no text content`);
  return JSON.parse(textPart.text) as T;
}

// ---- money normalization ----
function moneyMinor(m?: { amount: number | string; currency: string } | null): Money | null {
  if (!m || m.amount == null) return null;
  return { amount: Number(m.amount) / 100, currency: m.currency };
}
function moneyMajor(m?: { amount: number | string; currency: string } | null): Money | null {
  if (!m || m.amount == null) return null;
  return { amount: Number(m.amount), currency: m.currency };
}

// ---- raw UCP shapes (partial, only fields we read) ----
type RawSearchProduct = {
  id: string;
  title: string;
  description?: { html?: string };
  price_range?: { min?: { amount: number; currency: string } };
  media?: Array<{ type: string; url: string }>;
  variants?: Array<{
    id: string;
    title?: string;
    price?: { amount: number; currency: string };
    availability?: { available: boolean };
    options?: Array<{ name: string; label: string }>;
    media?: Array<{ type: string; url: string }>;
  }>;
};

type RawCart = {
  id: string;
  checkout_url: string;
  total_quantity: number;
  cost?: {
    subtotal_amount?: { amount: string; currency: string };
    total_amount?: { amount: string; currency: string };
  };
  discounts?: {
    codes?: Array<{ code: string; applicable: boolean }>;
    applied_discounts?: Array<{
      code?: string;
      title?: string;
      discounted_amount?: { amount: string; currency: string };
    }>;
  };
  lines?: Array<{
    id: string;
    quantity: number;
    cost?: {
      subtotal_amount?: { amount: string; currency: string };
      total_amount?: { amount: string; currency: string };
    };
    merchandise?: {
      id: string;
      title: string;
      product?: { id: string; title: string };
    };
  }>;
};

function variantLabel(v: NonNullable<RawSearchProduct["variants"]>[number]): string {
  const opts = (v.options ?? []).map((o) => o.label).filter(Boolean);
  const joined = opts.join(" / ").trim();
  if (joined && joined.toLowerCase() !== "default title") return joined;
  return v.title && v.title.toLowerCase() !== "default title" ? v.title : "";
}

function mapProduct(p: RawSearchProduct): Product {
  const rawVariants = p.variants ?? [];
  const variants = rawVariants.map((v) => ({
    id: v.id,
    label: variantLabel(v),
    available: v.availability?.available ?? true,
  }));
  const hasOptions = variants.filter((v) => v.label).length > 1;
  const firstAvailable = rawVariants.find((v) => v.availability?.available !== false) ?? rawVariants[0];
  const image = p.media?.find((m) => m.type === "image")?.url ?? firstAvailable?.media?.[0]?.url ?? null;
  // Product is available if ANY variant is purchasable.
  const available = rawVariants.some((v) => v.availability?.available !== false);
  return {
    id: p.id,
    title: p.title,
    description: p.description?.html ?? "",
    url: null,
    image,
    price: moneyMinor(p.price_range?.min ?? firstAvailable?.price ?? null),
    compareAtPrice: null, // UCP search does not expose compareAtPrice
    available,
    variantId: firstAvailable?.id ?? null,
    variants,
    hasOptions,
  };
}

function mapCart(c: RawCart): Cart {
  const lines: CartLine[] = (c.lines ?? []).map((l) => {
    const qty = l.quantity || 1;
    const linePrice = moneyMajor(l.cost?.total_amount ?? l.cost?.subtotal_amount ?? null);
    return {
      lineId: l.id,
      variantId: l.merchandise?.id ?? "",
      productId: l.merchandise?.product?.id ?? null,
      title: l.merchandise?.product?.title ?? l.merchandise?.title ?? "Item",
      image: null, // UCP cart lines carry no image; resolved via get_product_details
      quantity: qty,
      unitPrice: linePrice ? { amount: linePrice.amount / qty, currency: linePrice.currency } : null,
      linePrice,
    };
  });
  // UCP reports order-level discounts as one allocation PER line. Aggregate
  // back to a single row per code so the cart shows "WELCOME10  − ₹189.80" once.
  const byCode = new Map<string, { code: string; amount: number; currency: string }>();
  for (const d of c.discounts?.applied_discounts ?? []) {
    const code = d.code ?? d.title ?? "";
    if (!code || !d.discounted_amount) continue;
    const cur = byCode.get(code) ?? { code, amount: 0, currency: d.discounted_amount.currency };
    cur.amount += Number(d.discounted_amount.amount);
    byCode.set(code, cur);
  }
  const applied: AppliedDiscount[] = [...byCode.values()].map((d) => ({
    code: d.code,
    amount: { amount: d.amount, currency: d.currency },
  }));
  return {
    id: c.id,
    checkoutUrl: c.checkout_url,
    totalQuantity: c.total_quantity ?? lines.reduce((s, l) => s + l.quantity, 0),
    subtotal: moneyMajor(c.cost?.subtotal_amount ?? null),
    total: moneyMajor(c.cost?.total_amount ?? null),
    lines,
    discountCodes: c.discounts?.codes ?? [],
    appliedDiscounts: applied,
  };
}

const country = () => env.storefrontCountry;

// UCP cart lines have no image, so resolve product images by id and cache them
// for the process lifetime (product images rarely change).
const productImageCache = new Map<string, string | null>();
async function productImage(productId: string): Promise<string | null> {
  if (productImageCache.has(productId)) return productImageCache.get(productId) ?? null;
  try {
    const data = await mcpTool<{ product?: { image_url?: string; images?: Array<{ url?: string }> } }>(
      "get_product_details",
      { product_id: productId },
    );
    const url = data.product?.image_url ?? data.product?.images?.[0]?.url ?? null;
    productImageCache.set(productId, url);
    return url;
  } catch {
    return null;
  }
}

/** Fill in cart line images (UCP omits them) by looking up each product once. */
async function enrichCartImages(cart: Cart | null): Promise<Cart | null> {
  if (!cart || !cart.lines.length) return cart;
  const ids = [...new Set(cart.lines.map((l) => l.productId).filter((id): id is string => !!id))];
  const imgs = new Map<string, string | null>();
  await Promise.all(ids.map(async (id) => imgs.set(id, await productImage(id))));
  for (const l of cart.lines) if (l.productId && !l.image) l.image = imgs.get(l.productId) ?? null;
  return cart;
}

/** Search the live catalog. Keep queries short/keyword — long queries over-constrain. */
export async function searchCatalog(query: string, limit = 8): Promise<Product[]> {
  const data = await mcpTool<{ products?: RawSearchProduct[] }>("search_catalog", {
    catalog: { query, context: { address_country: country() } },
  });
  return (data.products ?? []).slice(0, limit).map(mapProduct);
}

type UpdateArgs = {
  cartId?: string;
  addItems?: Array<{ variantId: string; quantity: number }>;
  updateItems?: Array<{ lineId: string; quantity: number }>;
  removeLineIds?: string[];
  discountCodes?: string[];
};

/** Create or mutate a cart. No cartId => new cart. Returns normalized cart + any errors. */
export async function updateCart(
  args: UpdateArgs,
): Promise<{ cart: Cart | null; errors: unknown }> {
  const payload: Record<string, unknown> = {
    buyer_identity: { country_code: country() },
  };
  if (args.cartId) payload.cart_id = args.cartId;
  if (args.addItems?.length)
    payload.add_items = args.addItems.map((i) => ({
      product_variant_id: i.variantId,
      quantity: i.quantity,
    }));
  if (args.updateItems?.length)
    payload.update_items = args.updateItems.map((i) => ({ id: i.lineId, quantity: i.quantity }));
  if (args.removeLineIds?.length) payload.remove_line_ids = args.removeLineIds;
  if (args.discountCodes) payload.discount_codes = args.discountCodes;

  const data = await mcpTool<{ cart?: RawCart; errors?: unknown }>("update_cart", payload);
  const cart = data.cart ? await enrichCartImages(mapCart(data.cart)) : null;
  return { cart, errors: data.errors ?? null };
}

/** Read current cart state by id. */
export async function getCart(cartId: string): Promise<Cart | null> {
  const data = await mcpTool<{ cart?: RawCart }>("get_cart", { cart_id: cartId });
  return data.cart ? await enrichCartImages(mapCart(data.cart)) : null;
}
