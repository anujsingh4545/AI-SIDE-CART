import { authenticate } from "../../shopify.server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are an AI assistant helping Shopify merchants customize their side cart. You can read and update the cart configuration spec.

Spec shape:
{
  status: "draft" | "active",
  general: { bgColor, textColor, accentColor, accentTextColor, radius },
  header: {
    order: string[],
    TOP_BAR:      { enabled, props: { title, showItemCount } },
    TIMER:        { enabled, props: { timeLimit, title, resetTimerProductAddedToCart, removeCartItemsTimerEnds }, style: { text, bgColor } },
    PROGRESS_BAR: { enabled, props: { unlockedBy, defaultText, unlockedText, rules: [{ label, type, unlockAt }] }, style: { barColor, bgColor } }
  },
  body: {
    order: string[],
    PRODUCTS_IN_CART: { enabled, props: { showVariantSelector, showQuantitySelector, showSingleItemPrice, emptyText }, style: { imageSize, verticalSpacing, titleColor, discountBadgeTextColor, discountBadgeBgColor } }
  },
  footer: {
    order: string[],
    DISCOUNT_CODE:    { enabled, props: { placeholderTitle, buttonText }, style: { buttonColor, buttonBgColor, discountLabelColor, discountBgColor, crossIconColor } },
    ORDER_NOTES:      { enabled, props: { title, textAreaPlaceholder }, style: { titleColor, titleSize } },
    SUBTOTAL:         { enabled, props: { title, showOriginalPrice }, style: { titleColor, originalColor, discountedColor } },
    CHECKOUT_BUTTON:  { enabled, props: { title }, style: { fontSize, bgColor, textColor, borderRadius } },
    TRUST_BADGES:     { enabled, props: { badges: [{ title }] }, style: { textSize, textColor } },
    PAYMENT_METHODS:  { enabled, props: { icons: string[] }, style: { textColor, bgColor, fontSize, borderRadius, borderColor } }
  }
}

ALWAYS respond with valid JSON — no markdown, no code fences, just raw JSON:
{
  "message": "Friendly 1–2 sentence explanation of what changed, or why no change was needed.",
  "spec": <complete updated spec object, or null if nothing changed>
}

Rules:
- Colors must be valid hex codes.
- Always return the full spec even when only one field changed.
- If the request is unclear or impossible, set spec to null and explain in message.`;

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const { messages, spec } = await request.json();

  // Inject current spec into the first user message for context
  const anthropicMessages = messages.map((m, i) => {
    if (i === 0 && m.role === "user") {
      return {
        role: "user",
        content: `Current cart spec:\n${JSON.stringify(spec)}\n\n${m.content}`,
      };
    }
    return { role: m.role, content: m.content };
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8096,
    system: SYSTEM_PROMPT,
    messages: anthropicMessages,
  });

  const text = response.content[0].text.trim();

  try {
    const parsed = JSON.parse(text);
    return { message: parsed.message ?? "Done!", spec: parsed.spec ?? null };
  } catch {
    // Strip accidental markdown fences and retry
    const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    try {
      const parsed = JSON.parse(cleaned);
      return { message: parsed.message ?? "Done!", spec: parsed.spec ?? null };
    } catch {
      return { message: text, spec: null };
    }
  }
};

export default function Chat() {
  return null;
}
