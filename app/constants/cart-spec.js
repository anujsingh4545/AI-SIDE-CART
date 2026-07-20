/**
 * cart-spec.js — default CartSpec shipped with the app.
 *
 * Envelope shape for every block:
 *   blockName: { enabled, props, style? }
 *
 * · 3 regions: header / body / footer
 * · Render order is fixed in the storefront renderer
 * · Money in cents (250 = ₹2.50)
 * · Template vars: {{cart_total}} {{count}} {{timer}} {{needed}}
 */

const cartSpec = {

  status : "draft", // active | draft

  general: {
    bgColor: "#FFFFFF",
    textColor: "#111111",
    accentColor: "#6D28D9",
    accentTextColor: "#FFFFFF",
    radius: 10,
  },

  /* ── HEADER ──────────────────────────────────────────────── */
  header: {

    order: ["TOP_BAR", "TIMER", "PROGRESS_BAR"],

    TOP_BAR: {
      enabled: true,
      props: {
        title: "My cart",
        showItemCount: true,
      },
    },

    TIMER: {
      enabled: true,
      props: {
        timeLimit: 45,                            // mins
        title: "Cart expires in {{timer}} ⏰",
        resetTimerProductAddedToCart: true,
        removeCartItemsTimerEnds: false,
      },
      style: {
        text: "#6D28D9",
        bgColor: "#EDE4FA",
      },
    },

    PROGRESS_BAR: {
      enabled: true,
      props: {
        unlockedBy: "CART_TOTAL",                 // "CART_TOTAL" | "QUANTITY"
        unlockAt: 200000,                         // cents
        defaultText: "Add {{needed}} to unlock your free gift!",
        unlockedText: "🎉 Free gift unlocked!",
        rules: [
          { label: "10% off", type: "DISCOUNT", unlockAt: 10000 },
          {
            label: "Free gift", type: "FREE_GIFT", unlockAt: 20000,
            product: {                                            // ← required for FREE_GIFT; added FREE when crossed
              productId: "gid://shopify/Product/889900",
              variantId: "gid://shopify/ProductVariant/345t43",   // the variant actually added via /cart/add.js
            }
          },
          { label: "Free shipping", type: "FREE_SHIPPING", unlockAt: 30000 },
        ],
      },
      style: {
        barColor: "#6D28D9",
        bgColor: "#EDE4FA",
      },
    },
  },

  /* ── BODY ────────────────────────────────────────────────── */
  body: {

    order: ["PRODUCTS_IN_CART"],

    PRODUCTS_IN_CART: {
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

    order: ["DISCOUNT_CODE", "ORDER_NOTES", "SUBTOTAL", "CHECKOUT_BUTTON", "TRUST_BADGES", "PAYMENT_METHODS"],

    style: {
      bgColor: "#FFFFFF",
      verticalSpacing: 10,
    },

    DISCOUNT_CODE: {
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
      enabled: true,
      props: {
        title: "Checkout • {{cart_total}}",
      },
      style: {
        fontSize: 16,
        bgColor: "#6D28D9",
        textColor: "#FFFFFF",
        borderRadius: 10,
      },
    },

    TRUST_BADGES: {
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
