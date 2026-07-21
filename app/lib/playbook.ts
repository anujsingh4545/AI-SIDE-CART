/**
 * Merchant playbook — HARDCODED on purpose.
 *
 * Per the build spec, the merchant-facing "diagnosis + playbook" model is out
 * of scope; we hardcode its output as if it had already run. The customer model
 * reads this to know which offers to surface, what to upsell, and the free-
 * shipping threshold. Swapping to a real merchant model later means replacing
 * this object's source — nothing else changes.
 *
 * The offers below are REAL, active discount codes on the connected store
 * (created + verified applicable), so the assistant surfaces working discounts.
 */

export type Offer = {
  code: string;
  label: string;
  /** Natural-language blurb the model can say to the customer. */
  pitch: string;
  /** Optional minimum subtotal (INR) before it's worth mentioning. */
  minSubtotal?: number;
};

export type Playbook = {
  storeName: string;
  currency: string;
  currencySymbol: string;
  /** Free shipping above this subtotal (INR). Used to nudge cart-building. */
  freeShippingThreshold: number;
  /** Product themes the merchant wants pushed / cross-sold. */
  pushThemes: string[];
  /** Cheap add-on keywords to suggest near checkout. */
  addOnKeywords: string[];
  /** Active offers to surface unprompted when relevant. */
  offers: Offer[];
  tone: string;
};

export const playbook: Playbook = {
  storeName: "the store",
  currency: "INR",
  currencySymbol: "₹",
  freeShippingThreshold: 2500,
  pushThemes: ["hiking", "outdoor", "trail gear"],
  addOnKeywords: ["water bottle", "cap", "socks", "sunglasses"],
  offers: [
    {
      code: "WELCOME10",
      label: "10% off your order",
      pitch: "You can take 10% off your whole order with code WELCOME10.",
    },
    {
      code: "MONSOON20",
      label: "20% off orders over ₹1,500",
      pitch:
        "Our Monsoon Sale gives 20% off when you spend ₹1,500 or more — code MONSOON20.",
      minSubtotal: 1500,
    },
  ],
  tone: "Friendly, concise, and helpful — like a knowledgeable shop associate. Never pushy.",
};

/** Compact, model-friendly description of the playbook for the system prompt. */
export function playbookForPrompt(): string {
  const offers = playbook.offers
    .map(
      (o) =>
        `- ${o.code}: ${o.label}${o.minSubtotal ? ` (min ₹${o.minSubtotal})` : ""} — say: "${o.pitch}"`,
    )
    .join("\n");
  return [
    `Store currency: ${playbook.currency} (${playbook.currencySymbol}).`,
    `Free shipping over ₹${playbook.freeShippingThreshold}.`,
    `Emphasize: ${playbook.pushThemes.join(", ")}.`,
    `Good low-cost add-ons to suggest: ${playbook.addOnKeywords.join(", ")}.`,
    `ACTIVE OFFERS (mention the relevant one naturally; these codes really work):`,
    offers,
  ].join("\n");
}
