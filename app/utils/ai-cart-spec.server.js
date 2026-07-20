import { getAnthropicClient } from "./anthropic-client.server.js";
import defaultCartSpec from "../constants/cart-spec.js";

function buildSystemPrompt(aiSummary) {
  const summaryBlock = aiSummary
    ? `\nIMPORTANT — you already told the merchant this:\n"${aiSummary}"\nYour spec decisions MUST be consistent with that summary. If you said the timer is on, enable it. If you mentioned discounts, enable DISCOUNT_CODE. Do not contradict yourself.\n`
    : "";

  return `You are a Shopify cart configuration AI.
Given store analytics and theme settings, fill every key in a CartSpec JSON schema for a slide-cart.
${summaryBlock}
Rules — follow every one strictly:
- Return ONLY valid JSON. No markdown, no code fences, no comments, no explanation.
- Keep EVERY key from the input schema. Never delete a key.

enabled true/false — decide based on store data:
  TIMER: true if abandonmentRate > 50
  PROGRESS_BAR: true if aov is available (set unlockAt to ceil(aov * 1.2) in cents)
  DISCOUNT_CODE: true if discountCount > 0
  ORDER_NOTES: true if productCount > 200
  PAYMENT_METHODS: true if discountCount = 0
  TRUST_BADGES: always true

Colors — if themeSettings has recognizable color keys, use them. If nothing useful is found, keep the schema defaults exactly as-is.
  Common Shopify keys: colors_accent_1, colors_accent_2, colors_background_1, colors_background_2,
    colors_text, colors_button_label_1, colors_button_background_1.
  Map when found:
    accentColor / button bgColor / bar color → colors_accent_1 or colors_button_background_1
    bgColor / footer bgColor → colors_background_1
    textColor / title colors → colors_text
    accentTextColor / button textColor → colors_button_label_1
  If themeSettings is empty or keys are unrecognizable, leave all color fields at their schema default values.

PROGRESS_BAR.unlockAt: ceil(aov * 1.2) converted to cents.
TIMER.timeLimit: 30 if abandonmentRate > 70, else 45.
Text/copy: short, punchy, modern D2C tone.
All money values are in cents.`;
}

export async function generateCartSpec(scanData, themeData, aiSummary) {
  if (!getAnthropicClient()) return defaultCartSpec;

  const payload = JSON.stringify(
    {
      scanData,
      themeSettings: themeData?.settings ?? {},
      schema: defaultCartSpec,
    },
    null,
    2,
  );

  try {
    const client = getAnthropicClient();
    const res = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      system: buildSystemPrompt(aiSummary),
      messages: [{ role: "user", content: payload }],
    });

    const text = res.content[0]?.text?.trim();
    if (!text) return defaultCartSpec;

    const cleaned = text.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "");
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("[ai-cart-spec]", e?.message ?? e);
    return defaultCartSpec;
  }
}
