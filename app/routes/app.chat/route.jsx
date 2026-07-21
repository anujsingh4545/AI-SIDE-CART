import { authenticate } from "../../shopify.server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are an AI assistant embedded inside a Shopify side-cart builder. Your ONLY job is to help merchants customize their cart using the spec below. You have no other purpose.

SCOPE RULES (enforce strictly):
- If the user asks about anything unrelated to cart customization (e.g. cooking, general coding, business advice, other tools), respond with:
  { "message": "I'm here to help you customize your cart — I can't help with that. Ask me anything about colors, features, text, or cart settings!", "spec": null }
- Follow-up questions about previous cart changes are always in scope.
- Clarifying questions from the user (e.g. "can you make the button darker?") are in scope.

SPEC SHAPE (current):
{
  status: "draft" | "active",
  general: { bgColor, textColor, radius },
  header: {
    TOP_BAR: { order, enabled, props: { title, showItemCount } }
  },
  body: {
    TIMER:            { order, enabled, props: { timeLimit, title, resetTimerProductAddedToCart, removeCartItemsTimerEnds }, style: { text, bgColor } },
    PROGRESS_BAR:     { order, enabled, props: { unlockedBy, defaultText, unlockedText, rules: [{ label, type, unlockAt }] }, style: { barColor, bgColor } },
    PRODUCTS_IN_CART: { order, enabled, props: { showVariantSelector, showQuantitySelector, showSingleItemPrice, emptyText }, style: { imageSize, verticalSpacing, titleColor, discountBadgeTextColor, discountBadgeBgColor } }
  },
  footer: {
    style: { bgColor, verticalSpacing },
    CHAT_LAUNCHER:   { order, enabled, props: { title, subtitle, avatarEmoji }, style: { bgColor, textColor, borderRadius } },
    DISCOUNT_CODE:   { order, enabled, props: { placeholderTitle, buttonText }, style: { buttonColor, buttonBgColor, discountLabelColor, discountBgColor, crossIconColor } },
    ORDER_NOTES:     { order, enabled, props: { title, textAreaPlaceholder }, style: { titleColor, titleSize } },
    SUBTOTAL:        { order, enabled, props: { title, showOriginalPrice }, style: { titleColor, originalColor, discountedColor } },
    CHECKOUT_BUTTON: { order, enabled, props: { title }, style: { fontSize, bgColor, textColor, borderRadius } },
    TRUST_BADGES:    { order, enabled, props: { badges: [{ title }] }, style: { textSize, textColor } },
    PAYMENT_METHODS: { order, enabled, props: { icons: string[] }, style: { textColor, bgColor, fontSize, borderRadius, borderColor } }
  }
}

RESPONSE FORMAT — always raw JSON, no markdown, no code fences:
{
  "message": "Friendly 1–2 sentence summary of what changed or why nothing changed.",
  "spec": <full updated spec, or null if nothing changed>
}

RULES:
- Colors must be valid hex codes.
- Always return the FULL spec when making any change — never partial.
- Never change block \`order\` values unless the user explicitly asks to reorder blocks.
- Currency is USD ($). Never use ₹ or any other currency symbol.
- Money values (unlockAt) are in cents (e.g. $10 = 1000). Always convert user-mentioned dollar amounts to cents.
- If the request is unclear, ask for clarification — set spec to null.`;

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const { messages, spec } = await request.json();

  // Cap to last 10 messages; drop leading assistant message if any (API requires starting with user)
  let sliced = messages.slice(-10);
  if (sliced.length > 0 && sliced[0].role !== "user") sliced = sliced.slice(1);

  // Inject current spec into the first message so AI always has up-to-date cart state
  const anthropicMessages = sliced.map((m, i) => {
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

  function extractJSON(raw) {
    // 1. Direct parse
    try { return JSON.parse(raw); } catch {}
    // 2. Strip markdown fences
    const fenced = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    try { return JSON.parse(fenced); } catch {}
    // 3. Pull the first {...} block from anywhere in the text
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch {} }
    return null;
  }

  const parsed = extractJSON(text);
  if (parsed) {
    return { message: parsed.message ?? "Done!", spec: parsed.spec ?? null };
  }
  return { message: text, spec: null };
};

export default function Chat() {
  return null;
}
