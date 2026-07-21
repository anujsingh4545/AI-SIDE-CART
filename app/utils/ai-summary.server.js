import { getAnthropicClient } from "./anthropic-client.server.js";
import cartSpec from "../constants/cart-spec.js";

// ── Describe available features to the AI ─────────────────────
function buildFeaturesContext(spec) {
  const lines = [];

  const { body, footer } = spec;

  // Body
  if (body.TIMER)
    lines.push(
      `TIMER — urgency countdown, e.g. "Cart expires in ${body.TIMER.props.timeLimit} mins". ` +
      `Can reset on product add. Currently ${body.TIMER.enabled ? "ON" : "OFF"}.`,
    );

  if (body.PROGRESS_BAR)
    lines.push(
      `PROGRESS_BAR — spend-to-unlock bar with 3 milestones (discount, free shipping, free gift). ` +
      `Currently ${body.PROGRESS_BAR.enabled ? "ON" : "OFF"}.`,
    );

  if (body.PRODUCTS_IN_CART)
    lines.push(
      `PRODUCTS_IN_CART (body) — cart line items with variant & quantity selectors, ` +
      `discount badge on discounted items. Always ON.`,
    );

  // Footer
  if (footer.DISCOUNT_CODE)
    lines.push(
      `DISCOUNT_CODE (footer) — inline discount code field, surfaces existing active discounts. ` +
      `Currently ${footer.DISCOUNT_CODE.enabled ? "ON" : "OFF"}.`,
    );

  if (footer.ORDER_NOTES)
    lines.push(
      `ORDER_NOTES (footer) — special instructions text area. ` +
      `Currently ${footer.ORDER_NOTES.enabled ? "ON" : "OFF"}.`,
    );

  if (footer.SUBTOTAL)
    lines.push(
      `SUBTOTAL (footer) — subtotal row, optional strikethrough original price. ` +
      `Currently ${footer.SUBTOTAL.enabled ? "ON" : "OFF"}.`,
    );

  if (footer.CHECKOUT_BUTTON)
    lines.push(
      `CHECKOUT_BUTTON (footer) — prominent CTA with dynamic total, e.g. "Checkout • ₹1,240". ` +
      `Currently ${footer.CHECKOUT_BUTTON.enabled ? "ON" : "OFF"}.`,
    );

  if (footer.TRUST_BADGES)
    lines.push(
      `TRUST_BADGES (footer) — small trust signals below checkout, e.g. "🔒 Secure payments", "↩️ 30-day returns". ` +
      `Currently ${footer.TRUST_BADGES.enabled ? "ON" : "OFF"}.`,
    );

  if (footer.PAYMENT_METHODS)
    lines.push(
      `PAYMENT_METHODS (footer) — payment icons (VISA, MC, UPI, AMEX). ` +
      `Currently ${footer.PAYMENT_METHODS.enabled ? "ON" : "OFF"}.`,
    );

  return lines.join("\n");
}

// ── System prompt ──────────────────────────────────────────────
function buildSystemPrompt(spec) {
  const features = buildFeaturesContext(spec);

  return `You are a cart optimization AI for a Shopify slide-cart app.
You have already drafted a cart for this store based on their data.
Write a 2-sentence plain-text summary of what you found and what you set up.

OUTPUT FORMAT: Plain text only — 2 sentences, no JSON, no code, no markdown, no bullet points, no structured data whatsoever.

Available cart features (you chose which ones to highlight based on the store data):
${features}

Rules:
- 2 sentences max, under 40 words total
- Sentence 1: the sharpest insight from the store data (pick 1–2 numbers)
- Sentence 2: which specific feature(s) you turned on and why, tied to their data
- Tone: direct, confident, like a smart analyst — no filler, no fluff
- Do NOT start with "Based on", "I see", "It looks like"
- Do NOT mention all features — only the 1–2 most relevant to this store's numbers
- Do NOT output JSON, objects, arrays, or any structured format — plain sentences only
- PROGRESS_BAR rules: always keep all 3 rules (DISCOUNT, FREE_SHIPPING, FREE_GIFT) — you may adjust unlockAt thresholds and labels to fit the store's AOV, but never remove a rule
- PROGRESS_BAR currency: all monetary values are in USD ($). When unlockedBy is "CART_TOTAL", unlockAt is in cents (e.g. 5000 = $50.00). When unlockedBy is "QUANTITY", unlockAt is a raw item count
- Do NOT use ₹ or any currency other than $ when referencing cart values`;
}

// ── Main export ────────────────────────────────────────────────
export async function generateScanSummary(scanData) {
  if (!getAnthropicClient()) return null;

  const {
    productCount,
    orderCount,
    aov,
    abandonmentRate,
    discountCount,
    slowMovingCount,
    currencySymbol,
  } = scanData;

  const storeContext = [
    `Products in catalog: ${productCount}`,
    `Orders (last 30 days): ${orderCount}`,
    `Average order value: ${currencySymbol}${aov?.toLocaleString() ?? "unknown"}`,
    `Cart abandonment rate: ${abandonmentRate != null ? `${abandonmentRate}%` : "unknown"}`,
    `Active discounts: ${discountCount}`,
    `Slow-moving stock (has inventory, no recent sales): ${slowMovingCount} products`,
  ].join("\n");

  try {
    const client = getAnthropicClient();
    const res = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 100,
      system: buildSystemPrompt(cartSpec),
      messages: [{ role: "user", content: storeContext }],
    });
    return res.content[0]?.text?.trim() ?? null;
  } catch (e) {
    console.error("[ai-summary]", e?.message ?? e);
    return null;
  }
}
