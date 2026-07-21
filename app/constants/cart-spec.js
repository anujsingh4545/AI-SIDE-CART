/**
 * cart-spec.js — default CartSpec shipped with the app.
 *
 * Envelope shape for every block:
 *   blockName: { order, enabled, props, style? }
 *
 * · 3 regions: header / body / footer
 * · `order` on each block = 0-based priority index; section-level `order` array
 *   is kept in sync and is the source of truth for render order
 * · Money in cents (250 = $2.50)
 * · Template vars: {{cart_total}} {{count}} {{timer}} {{needed}}
 */

const cartSpec = {

  status: "draft", // active | draft

  general: {
    bgColor: "#FFFFFF",
    textColor: "#111111",
    radius: 10,
  },

  /* ── HEADER ──────────────────────────────────────────────── */
  header: {

    TOP_BAR: {
      order: 0,
      enabled: true,
      props: {
        title: "My cart",
        showItemCount: true,
      },
    },
  },

  /* ── BODY ────────────────────────────────────────────────── */
  body: {

    TIMER: {
      order: 0,
      enabled: true,
      props: {
        timeLimit: 45,                            // mins
        title: "Your cart will expire in {{timer}} ⏰",
        resetTimerProductAddedToCart: true,
        removeCartItemsTimerEnds: false,
      },
      style: {
        text: "#6D28D9",
        bgColor: "#EDE4FA",
      },
    },

    PROGRESS_BAR: {
      order: 1,
      enabled: true,
      props: {
        unlockedBy: "CART_TOTAL",                 // "CART_TOTAL" | "QUANTITY"
        unlockAt: 200000,                         // cents
        defaultText: "{{last_unlocked}} Add {{needed}} to unlock your {{next_unlocked}}!",
        unlockedText: "🎉 Free gift unlocked!",
        rules: [
          { label: "🏷️ 10% off", type: "DISCOUNT", unlockAt: 70000 },
          { label: "🚚 Free shipping", type: "FREE_SHIPPING", unlockAt: 140000 },
          {
            label: "🎁 Free gift", type: "FREE_GIFT", unlockAt: 280000,
            product: {
              productId: null,
              variantId: null,
            }
          },
        ],
      },
      style: {
        barColor: "#6D28D9",
        bgColor: "#ffffff",
      },
    },

    PRODUCTS_IN_CART: {
      order: 2,
      enabled: true,
      props: {
        showVariantSelector: true,
        showQuantitySelector: true,
        showSingleItemPrice: false,
        emptyText: "Your cart is empty.",
      },
      style: {
        imageSize: 64,
        verticalSpacing: 10,
        titleColor: "#111111",
        discountBadgeTextColor: "#2E7D32",
        discountBadgeBgColor: "#DFF3E4",
      },
    },
  },

  /* ── FOOTER ──────────────────────────────────────────────── */
  footer: {

    style: {
      bgColor: "#FFFFFF",
      verticalSpacing: 10,
    },

    CHAT_LAUNCHER: {
      order: 0,
      enabled: true,
      props: {
        title: "Chat with our AI stylist",
        subtitle: "Get pairing ideas, size & order help",
        avatarEmoji: "◆",
      },
      style: { bgColor: "#111111", textColor: "#FFFFFF", borderRadius: 14 },
    },

    DISCOUNT_CODE: {
      order: 1,
      enabled: true,
      props: {
        placeholderTitle: "Discount code",
        buttonText: "Apply",
      },
      style: {
        buttonColor: "#FFFFFF",
        buttonBgColor: "#6D28D9",
        discountLabelColor: "#2E7D32",
        discountBgColor: "#DFF3E4",
        crossIconColor: "#2E7D32",
      },
    },

    ORDER_NOTES: {
      order: 2,
      enabled: false,
      props: {
        title: "Add special instructions",
        textAreaPlaceholder: "Your order notes",
      },
      style: {
        titleColor: "#111111",
        titleSize: 12,
      },
    },

    SUBTOTAL: {
      order: 3,
      enabled: true,
      props: {
        title: "Subtotal",
        showOriginalPrice: false,
      },
      style: {
        titleColor: "#111111",
        originalColor: "#999999",
        discountedColor: "#111111",
      },
    },

    CHECKOUT_BUTTON: {
      order: 4,
      enabled: true,
      props: {
        title: "Checkout • {{cart_total}}",
      },
      style: {
        fontSize: 13,
        bgColor: "#6D28D9",
        textColor: "#FFFFFF",
        borderRadius: 8,
      },
    },

    TRUST_BADGES: {
      order: 5,
      enabled: true,
      props: {
        badges: [
          { title: "🔒 Secure payments" },
          { title: "↩️ 30-day returns" },
        ],
      },
      style: {
        textSize: 11,
        textColor: "#666666",
      },
    },

    PAYMENT_METHODS: {
      order: 6,
      enabled: false,
      props: {
        icons: ["VISA", "MC", "UPI", "AMEX"],          // default selected
      },
      style: {
        textColor: "#666666",
        bgColor: "#FFFFFF",
        fontSize: 9,
        borderRadius: 5,
        borderColor: "#DDDDDD",
      },
    },
  },
};

export default cartSpec;
