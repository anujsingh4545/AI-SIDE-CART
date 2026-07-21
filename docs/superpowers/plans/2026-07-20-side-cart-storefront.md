# Side Cart Storefront Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete storefront side-cart runtime — `cart.js`, `cart.css`, `cart-spec.js`, and the app embed block — inside `extensions/ai-side-cart/`, per `docs/superpowers/specs/2026-07-20-side-cart-storefront-design.md`.

**Architecture:** One vanilla-JS IIFE (`cart.js`) implementing a single loop: DETECT (fetch/XHR interception + cart-icon clicks) → FETCH (`GET /cart.js` as the only source of truth) → RENDER (spec regions → registry of pure block functions → `innerHTML`) → INTERACT (one delegated listener routing on `data-action`). Styling is one static stylesheet driven entirely by `--sc-*` CSS variables.

**Tech Stack:** Shopify theme app extension (app embed block), Liquid, vanilla JS (classic script, no modules, no build step), CSS. Tested live via `shopify app dev` against a Dawn dev store.

## Global Constraints

- Classic scripts only — no ES modules, no imports, no build step. `cart.js` is one IIFE.
- The interceptor ALWAYS runs the real request; only the reaction is conditional; every reaction path is wrapped in try/catch so nothing throws into theme code.
- Every one of our own network calls (reads AND writes) sends header `X-Side-Cart: 1`.
- Every drawer-driven cart write happens inside `pausedWrite()` (sets `interceptorPaused` for its duration).
- `window.__sideCartLast = cart` is set on EVERY cart refresh (the add-diff depends on it).
- `esc()` every string from the spec or Shopify before it enters HTML; escape first, substitute after. Unknown template var → `—`. Unknown block type → `""`.
- Money is integer cents; format only via `ctx.moneyFormat`.
- Nothing in any code path may touch `/checkout` except the explicit `checkout` action navigation.
- Degrade a block, never the cart; degrade the cart, never the page. Missing spec → silent no-op.
- All URLs are built from `ctx.root` (locale/market-aware), never hardcoded `/`.
- **Code style — modular, open-closed, meaningful names.** The runtime is one file but must be organized as small, single-purpose functions grouped by section banners (`/* §N … */`). Every "many cases" concern is DATA + one generic engine, extended by adding entries, never by editing logic: block types → `registry`, style keys → `VAR_MAP`, cart endpoints → `ENDPOINT_MATCHERS`, interception guards → `INTERCEPT_GUARDS`, native drawers → `NATIVE_CART_SELECTORS` + closer steps, header bubbles → `COUNT_SYNC_TARGETS`, cart-icon links → `CART_LINK_SELECTORS`. Use descriptive variable names everywhere (`blockProps`, not `p`; `actionTarget`, not `t`; `requestInfo`, not `info`) — where a plan snippet abbreviates, the implementer must expand the name.
- **Testing:** no JS test infra exists for theme-extension assets; per spec §10 every task is verified live in the browser (`shopify app dev`, Dawn dev store, app embed enabled). Follow each task's verification steps exactly before committing.

**One-time setup (before Task 1):** run `npm run dev` (wraps `shopify app dev`) once, open the preview URL, and in the dev store's theme editor (Online Store → Themes → Customize → App embeds) enable the "Side Cart" embed after Task 1 lands. Keep `npm run dev` running through all tasks — asset changes hot-reload.

---

### Task 1: Extension cleanup + embed block + drawer shell

**Files:**
- Delete: `extensions/ai-side-cart/blocks/star_rating.liquid`, `extensions/ai-side-cart/snippets/stars.liquid`, `extensions/ai-side-cart/assets/thumbs-up.png`
- Create: `extensions/ai-side-cart/blocks/side-cart.liquid`
- Create: `extensions/ai-side-cart/assets/cart-spec.js`
- Create: `extensions/ai-side-cart/assets/cart.js`
- Create: `extensions/ai-side-cart/assets/cart.css`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `#sc-root` containing `#sc-overlay` + `#side-cart` with `#sc-header/#sc-body/#sc-footer`; `window.__SC_SPEC__` (full spec object); `window.SideCart = {open, close, refresh}`; internal `openDrawer()`, `closeDrawer()`, `readJson(id)`, `spec`, `ctx`, `root`, `_fetch`; CSS class `sc-open` on `#sc-root` shows the drawer. Later tasks add code at the marked `/* §N */` regions inside the same IIFE.

- [ ] **Step 1: Delete the template example files**

```bash
git rm extensions/ai-side-cart/blocks/star_rating.liquid extensions/ai-side-cart/snippets/stars.liquid extensions/ai-side-cart/assets/thumbs-up.png
```

Also open `extensions/ai-side-cart/shopify.extension.toml` and confirm it declares a theme extension (`type = "theme"` or `type = "theme_app_extension"`). Do not change it if so.

- [ ] **Step 2: Create `extensions/ai-side-cart/blocks/side-cart.liquid`**

```liquid
{%- assign spec = app.metafields.cart.published_spec -%}
{%- if spec -%}
  <script type="application/json" id="sc-spec">{{ spec.value | json }}</script>
{%- endif -%}
<script type="application/json" id="sc-ctx">{
  "root":        {{ routes.root_url | json }},
  "moneyFormat": {{ shop.money_format | json }},
  "currency":    {{ cart.currency.iso_code | json }},
  "locale":      {{ request.locale.iso_code | json }},
  "checkoutUrl": "/checkout"
}</script>
<div id="sc-root"></div>
<link rel="stylesheet" href="{{ 'cart.css' | asset_url }}">
<script src="{{ 'cart-spec.js' | asset_url }}" defer></script>
<script src="{{ 'cart.js' | asset_url }}" defer></script>

{% schema %}
{
  "name": "Side Cart",
  "target": "body",
  "settings": []
}
{% endschema %}
```

- [ ] **Step 3: Create `extensions/ai-side-cart/assets/cart-spec.js`** — the full hackathon spec from the design doc's Appendix A, verbatim, as a classic script:

```js
/* Hackathon default spec. Deleted once the admin editor publishes to the
   app metafield (#sc-spec wins whenever it is present). Money in cents. */
window.__SC_SPEC__ = {
  general: {
    bgColor: "#FFFFFF", textColor: "#111111",
    accentColor: "#6D28D9", accentTextColor: "#FFFFFF", radius: 10,
  },
  header: {
    TOP_BAR: {
      enabled: true,
      props: { title: "My cart", showItemCount: true },
    },
    TIMER: {
      enabled: true,
      props: {
        timeLimit: 45,
        title: "Cart expires in {{timer}} ⏰",
        resetTimerProductAddedToCart: true,
        removeCartItemsTimerEnds: false,
      },
      style: { text: "#6D28D9", bgColor: "#EDE4FA" },
    },
    PROGRESS_BAR: {
      enabled: true,
      props: {
        unlockedBy: "CART_TOTAL",
        defaultText: "Add {{needed}} to unlock {{next}}!",
        unlockedText: "🎉 {{unlocked}} unlocked!",
        allUnlockedText: "All rewards unlocked 🎉",
        rules: [
          { label: "10% off",       type: "DISCOUNT",      unlockAt: 100000 },
          { label: "Free gift",     type: "FREE_GIFT",     unlockAt: 200000,
            product: {
              productId: "gid://shopify/Product/889900",
              variantId: "gid://shopify/ProductVariant/345543",
            } },
          { label: "Free shipping", type: "FREE_SHIPPING", unlockAt: 300000 },
        ],
      },
      style: { barColor: "#6D28D9", bgColor: "#EDE4FA" },
    },
  },
  body: {
    PRODUCTS_IN_CART: {
      enabled: true,
      props: {
        showVariantSelector: true,
        showQuantitySelector: true,
        showSingleItemPrice: false,
        emptyText: "Your cart is empty.",
      },
      style: {
        imageSize: 64, verticalSpacing: 10, titleColor: "#111111",
        discountBadgeTextColor: "#2E7D32", discountBadgeBgColor: "#DFF3E4",
      },
    },
  },
  footer: {
    style: { bgColor: "#FFFFFF", verticalSpacing: 10 },
    DISCOUNT_CODE: {
      enabled: true,
      props: { placeholderTitle: "Discount code", buttonText: "Apply" },
      style: {
        buttonColor: "#FFFFFF", buttonBgColor: "#6D28D9",
        discountLabelColor: "#2E7D32", discountBgColor: "#DFF3E4",
        crossIconColor: "#2E7D32",
      },
    },
    ORDER_NOTES: {
      enabled: false,
      props: { title: "Add special instructions", textAreaPlaceholder: "Your order notes" },
      style: { titleColor: "#111111", titleSize: 12 },
    },
    SUBTOTAL: {
      enabled: true,
      props: { title: "Subtotal", showOriginalPrice: false },
      style: { titleColor: "#111111", originalColor: "#999999", discountedColor: "#111111" },
    },
    CHECKOUT_BUTTON: {
      enabled: true,
      props: { title: "Checkout • {{cart_total}}" },
      style: { fontSize: 16, bgColor: "#6D28D9", textColor: "#FFFFFF", borderRadius: 10 },
    },
    TRUST_BADGES: {
      enabled: true,
      props: { badges: [{ title: "🔒 Secure payments" }, { title: "↩️ 30-day returns" }] },
      style: { textSize: 11, textColor: "#666666" },
    },
    PAYMENT_METHODS: {
      enabled: false,
      props: { icons: ["VISA", "MC", "UPI", "AMEX"] },
      style: {
        textColor: "#666666", bgColor: "#FFFFFF",
        fontSize: 9, borderRadius: 5, borderColor: "#DDDDDD",
      },
    },
  },
};
```

Note: the `FREE_GIFT` variant GID here is a placeholder from the spec — Task 6's verification step replaces it with a real variant GID from the dev store.

- [ ] **Step 4: Create `extensions/ai-side-cart/assets/cart.css`** — static skeleton, every merchant-controllable value reads a `--sc-*` variable:

```css
/* Side Cart — static stylesheet. No merchant colors here; everything reads --sc-* */
#sc-root {
  --sc-bg: #fff; --sc-text: #111; --sc-accent: #6d28d9; --sc-accent-text: #fff;
  --sc-radius: 10px; --sc-img: 64px; --sc-gap: 10px; --sc-border: #ddd;
  --sc-title: inherit; --sc-title-size: 14px; --sc-font-size: 14px;
  --sc-original: #999; --sc-discounted: inherit;
  --sc-badge-text: #2e7d32; --sc-badge-bg: #dff3e4;
}
#sc-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.4);
  opacity: 0; pointer-events: none; transition: opacity .25s; z-index: 999998;
}
#side-cart {
  position: fixed; top: 0; right: 0; height: 100%;
  width: min(420px, 100vw); background: var(--sc-bg); color: var(--sc-text);
  transform: translateX(100%); transition: transform .25s ease; z-index: 999999;
  display: flex; flex-direction: column;
  box-shadow: -8px 0 24px rgba(0,0,0,.12); font-size: var(--sc-font-size);
}
#sc-root.sc-open #side-cart { transform: none; }
#sc-root.sc-open #sc-overlay { opacity: 1; pointer-events: auto; }
#sc-header { flex: none; }
#sc-body { flex: 1 1 auto; overflow-y: auto; }
#sc-footer { flex: none; background: var(--sc-bg); border-top: 1px solid var(--sc-border); }
.sc-block { padding: var(--sc-gap) 16px; background: var(--sc-bg); color: var(--sc-text); }

/* TOP_BAR */
.sc-topbar { display: flex; align-items: center; justify-content: space-between; }
.sc-topbar .sc-title { font-weight: 600; font-size: 16px; }
.sc-close { background: none; border: 0; font-size: 18px; cursor: pointer; color: inherit; }

/* TIMER */
.sc-blk-TIMER .sc-timer { text-align: center; padding: 6px; border-radius: var(--sc-radius); background: var(--sc-bg); color: var(--sc-text); }

/* PROGRESS_BAR */
.sc-progress { border-radius: var(--sc-radius); padding: 8px; background: var(--sc-bg); }
.sc-progress-text { margin: 0 0 8px; text-align: center; }
.sc-track { position: relative; height: 8px; border-radius: 4px; background: rgba(0,0,0,.08); }
.sc-fill { height: 100%; border-radius: 4px; background: var(--sc-accent); transition: width .3s; }
.sc-milestone {
  position: absolute; top: 50%; width: 14px; height: 14px; border-radius: 50%;
  transform: translate(-50%, -50%); background: #fff; border: 2px solid var(--sc-accent);
}
.sc-milestone.sc-done { background: var(--sc-accent); }

/* PRODUCTS_IN_CART */
.sc-lines { list-style: none; margin: 0; padding: 0; }
.sc-line { display: flex; gap: 10px; padding: var(--sc-gap) 0; border-bottom: 1px solid var(--sc-border); }
.sc-img { width: var(--sc-img); height: var(--sc-img); object-fit: cover; border-radius: var(--sc-radius); background: #f4f4f4; flex: none; }
.sc-line-main { flex: 1 1 auto; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sc-line-title { color: var(--sc-title); font-weight: 500; }
.sc-variant { color: #777; font-size: 12px; }
.sc-variant-select { font-size: 12px; max-width: 160px; }
.sc-qty { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--sc-border); border-radius: var(--sc-radius); width: max-content; }
.sc-qty button { border: 0; background: none; padding: 4px 10px; cursor: pointer; font-size: 14px; color: inherit; }
.sc-line-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: none; }
.sc-remove { background: none; border: 0; color: #999; font-size: 11px; text-decoration: underline; cursor: pointer; }
.sc-badge { color: var(--sc-badge-text); background: var(--sc-badge-bg); font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.sc-empty { text-align: center; color: #777; padding: 32px 0; }

/* DISCOUNT_CODE */
.sc-disc-row { display: flex; gap: 8px; }
.sc-disc-row input { flex: 1; padding: 8px; border: 1px solid var(--sc-border); border-radius: var(--sc-radius); }
.sc-apply { padding: 8px 16px; border: 0; border-radius: var(--sc-radius); background: var(--sc-accent); color: var(--sc-accent-text); cursor: pointer; }
.sc-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.sc-chip { display: inline-flex; align-items: center; gap: 6px; color: var(--sc-badge-text); background: var(--sc-badge-bg); padding: 2px 8px; border-radius: 999px; font-size: 12px; }
.sc-chip button { border: 0; background: none; cursor: pointer; color: var(--sc-badge-text); }

/* ORDER_NOTES */
.sc-notes-toggle { background: none; border: 0; cursor: pointer; color: var(--sc-title); font-size: var(--sc-title-size); padding: 0; }
.sc-notes textarea { width: 100%; min-height: 60px; margin-top: 6px; border: 1px solid var(--sc-border); border-radius: var(--sc-radius); padding: 8px; }

/* SUBTOTAL */
.sc-subtotal { display: flex; justify-content: space-between; font-weight: 600; color: var(--sc-title); }
.sc-original { color: var(--sc-original); font-weight: 400; margin-right: 6px; }
.sc-discounted { color: var(--sc-discounted); }

/* CHECKOUT_BUTTON */
.sc-checkout {
  display: block; width: 100%; padding: 12px; border: 0; cursor: pointer;
  border-radius: var(--sc-radius); background: var(--sc-accent);
  color: var(--sc-accent-text); font-size: var(--sc-font-size); font-weight: 600;
}

/* TRUST_BADGES / PAYMENT_METHODS */
.sc-trust { display: flex; justify-content: center; gap: 16px; color: var(--sc-text); font-size: var(--sc-font-size); }
.sc-pay { display: flex; justify-content: center; gap: 6px; }
.sc-pay span { border: 1px solid var(--sc-border); border-radius: var(--sc-radius); padding: 2px 6px; font-size: var(--sc-font-size); color: var(--sc-text); background: var(--sc-bg); }
```

- [ ] **Step 5: Create `extensions/ai-side-cart/assets/cart.js`** — the IIFE shell with open/close. The `/* §N */` comment markers are where later tasks insert code; keep them.

```js
/* Side Cart runtime — single classic-script IIFE. No modules, no build. */
(function () {
  "use strict";

  var _fetch = window.fetch.bind(window); // saved BEFORE any patching (Task 4)

  function $(id) { return document.getElementById(id); }

  function readJson(id) {
    var el = $(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  var spec = readJson("sc-spec") || window.__SC_SPEC__ || null;
  var ctx = readJson("sc-ctx") || { root: "/", moneyFormat: "{{amount}}", currency: "", locale: "", checkoutUrl: "/checkout" };
  var root = $("sc-root");
  if (!spec || !root) return; // no spec / no mount → silent no-op, theme cart untouched

  var cart = null;
  var notesOpen = false;
  var interceptorPaused = false;

  root.innerHTML =
    '<div id="sc-overlay" data-action="close"></div>' +
    '<aside id="side-cart" role="dialog" aria-modal="true" aria-label="Cart">' +
    '<div id="sc-header"></div><div id="sc-body"></div><div id="sc-footer"></div>' +
    '</aside>';

  function openDrawer() {
    root.classList.add("sc-open");
    document.dispatchEvent(new CustomEvent("side-cart:open"));
  }
  function closeDrawer() {
    root.classList.remove("sc-open");
    document.dispatchEvent(new CustomEvent("side-cart:close"));
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDrawer();
  });

  /* §2 render core */
  /* §3 products + writes */
  /* §4 detect */
  /* §5 count-sync */
  /* §6 progress + free gift */
  /* §7 timer */
  /* §8 footer blocks */
  /* §9 variant selector */

  root.addEventListener("click", function (e) {
    var t = e.target.closest("[data-action]");
    if (!t) return;
    route(t.dataset.action, t, e);
  });

  function route(action, t, e) {
    switch (action) {
      case "close": closeDrawer(); break;
    }
  }

  window.SideCart = { open: openDrawer, close: closeDrawer, refresh: function () {} };
})();
```

- [ ] **Step 6: Verify in browser**

With `npm run dev` running: open the preview storefront, enable the "Side Cart" app embed in the theme editor if not yet enabled, reload. In DevTools console run:

```js
window.SideCart.open()
```

Expected: an empty white drawer slides in from the right with a dimmed overlay; `window.SideCart.close()` and ESC slide it out; clicking the overlay closes it. No console errors. The theme is otherwise untouched.

- [ ] **Step 7: Commit**

```bash
git add -A extensions/ai-side-cart
git commit -m "feat(side-cart): extension cleanup, app embed block, drawer shell"
```

---

### Task 2: Render core — tokens, registry, TOP_BAR / SUBTOTAL / CHECKOUT_BUTTON, cart fetch

**Files:**
- Modify: `extensions/ai-side-cart/assets/cart.js` (fill the `/* §2 render core */` region; extend `route()`)

**Interfaces:**
- Consumes: `spec`, `ctx`, `root`, `cart`, `_fetch`, `openDrawer/closeDrawer` from Task 1.
- Produces: `esc(v)`, `money(cents)`, `tvars()`, `fill(tpl, vars)`, `styleVars(style)`, `applyTokens()`, `wrap(type, block, inner)`, `safe(fn, block)`, `render()`, `getCart()`, `setCart(next)`, `refreshCart()`, and stubs `checkFreeGift()`, `syncCartCount(count)`, `restoreInputs()`, `snapshotInputs()`, `timerText()`, `progressVars()` (fleshed out in Tasks 5–8). Registry object `registry` keyed by UPPERCASE type. Later tasks add entries to `registry` and `VAR_MAP` only.

- [ ] **Step 1: Insert the render core at `/* §2 render core */`**

```js
  /* §2 render core */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(cents) {
    var n = (Number(cents || 0) / 100).toFixed(2);
    var whole = String(Math.round(Number(cents || 0) / 100));
    var out = String(ctx.moneyFormat || "{{amount}}");
    out = out.replace(/\{\{\s*amount_no_decimals[^}]*\}\}/g, whole)
             .replace(/\{\{\s*amount[^}]*\}\}/g, n);
    return out.replace(/<[^>]*>/g, ""); // some shops wrap the format in HTML spans
  }

  // stubs — real implementations land in Tasks 5–8; render() calls them from day one
  function checkFreeGift() {}                       // Task 6
  function syncCartCount(count) {}                  // Task 5
  function snapshotInputs() {}                      // Task 8
  function restoreInputs() {}                       // Task 8
  function timerText() { return ""; }               // Task 7
  function progressVars() { return {}; }            // Task 6

  function tvars() {
    var v = {
      cart_total: money(cart ? cart.total_price : 0),
      count: cart ? cart.item_count : 0,
      timer: timerText(),
    };
    var pv = progressVars();
    for (var k in pv) v[k] = pv[k];
    return v;
  }

  // Escape the WHOLE template first, then substitute already-safe values.
  function fill(tpl, vars) {
    return esc(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, function (_, k) {
      return k in vars ? esc(vars[k]) : "—";
    });
  }

  var VAR_MAP = {
    bgColor: "--sc-bg", textColor: "--sc-text", text: "--sc-text",
    accentColor: "--sc-accent", accentTextColor: "--sc-accent-text",
    barColor: "--sc-accent", buttonBgColor: "--sc-accent", buttonColor: "--sc-accent-text",
    titleColor: "--sc-title", titleSize: "--sc-title-size",
    imageSize: "--sc-img", verticalSpacing: "--sc-gap",
    fontSize: "--sc-font-size", textSize: "--sc-font-size",
    borderRadius: "--sc-radius", radius: "--sc-radius", borderColor: "--sc-border",
    originalColor: "--sc-original", discountedColor: "--sc-discounted",
    discountBadgeTextColor: "--sc-badge-text", discountBadgeBgColor: "--sc-badge-bg",
    discountLabelColor: "--sc-badge-text", discountBgColor: "--sc-badge-bg",
    crossIconColor: "--sc-badge-text",
  };

  function styleVars(style) {
    if (!style) return "";
    return Object.keys(style)
      .filter(function (k) { return VAR_MAP[k]; })
      .map(function (k) {
        var v = style[k];
        return VAR_MAP[k] + ":" + esc(typeof v === "number" ? v + "px" : v);
      })
      .join(";");
  }

  function applyTokens() {
    root.style.cssText = styleVars(spec.general || {});
  }

  function wrap(type, block, inner) {
    if (!inner) return "";
    var vars = styleVars(block.style);
    return '<div class="sc-block sc-blk-' + esc(type) + '"' +
      (vars ? ' style="' + vars + '"' : "") + ">" + inner + "</div>";
  }

  function safe(fn, block) {
    try { return fn(block) || ""; } catch (e) { return ""; } // broken block never breaks the cart
  }

  var registry = {
    TOP_BAR: TOP_BAR,
    SUBTOTAL: SUBTOTAL,
    CHECKOUT_BUTTON: CHECKOUT_BUTTON,
  };

  function TOP_BAR(block) {
    var p = block.props || {};
    var count = p.showItemCount && cart
      ? ' <span class="sc-count">• ' + cart.item_count + "</span>" : "";
    return '<div class="sc-topbar"><span class="sc-title">' + esc(p.title) + count +
      '</span><button class="sc-close" data-action="close" aria-label="Close">✕</button></div>';
  }

  function SUBTOTAL(block) {
    var p = block.props || {};
    if (!cart) return "";
    var original = p.showOriginalPrice && cart.original_total_price > cart.total_price
      ? '<s class="sc-original">' + money(cart.original_total_price) + "</s>" : "";
    return '<div class="sc-subtotal"><span>' + esc(p.title) + "</span><span>" + original +
      '<span class="sc-discounted">' + money(cart.total_price) + "</span></span></div>";
  }

  function CHECKOUT_BUTTON(block) {
    return '<button class="sc-checkout" data-action="checkout">' +
      fill((block.props || {}).title, tvars()) + "</button>";
  }

  function render() {
    snapshotInputs();
    applyTokens();
    ["header", "body", "footer"].forEach(function (region) {
      var host = $("sc-" + region);
      var blocks = spec[region] || {};
      if (blocks.style) host.style.cssText = styleVars(blocks.style);
      host.innerHTML = Object.keys(blocks)
        .filter(function (k) { return k !== "style" && blocks[k] && blocks[k].enabled && registry[k]; })
        .map(function (k) { return wrap(k, blocks[k], safe(registry[k], blocks[k])); })
        .join("");
    });
    restoreInputs();
    syncCartCount(cart ? cart.item_count : 0);
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function getCart(attempt) {
    attempt = attempt || 0;
    return _fetch(ctx.root + "cart.js", {
      headers: { "X-Side-Cart": "1", "Cache-Control": "no-cache" },
    }).then(function (res) {
      if (res.status === 204) {
        return _fetch(ctx.root + "cart/update.js", {
          method: "POST",
          headers: { "X-Side-Cart": "1", "Content-Type": "application/json" },
          body: "{}",
        }).then(function (r2) { return r2.json(); });
      }
      if (!res.ok && res.status >= 500 && attempt < 3) {
        return wait(200 * (attempt + 1)).then(function () { return getCart(attempt + 1); });
      }
      return res.json();
    }).catch(function () {
      if (attempt < 3) return wait(200 * (attempt + 1)).then(function () { return getCart(attempt + 1); });
      return null; // keep last good cart
    });
  }

  function setCart(next) {
    if (!next) return;                 // fetch failed → keep last good cart
    cart = next;
    window.__sideCartLast = next;      // the add-diff (Task 4) depends on this
    checkFreeGift();
    render();
    document.dispatchEvent(new CustomEvent("side-cart:updated", { detail: { cart: cart } }));
  }

  function refreshCart() {
    return getCart().then(setCart);
  }

  refreshCart(); // boot: first paint
```

- [ ] **Step 2: Extend `route()` and `window.SideCart`** — replace the Task-1 versions at the bottom of the IIFE with:

```js
  function route(action, t, e) {
    switch (action) {
      case "close": closeDrawer(); break;
      case "checkout": location.href = ctx.checkoutUrl || "/checkout"; break;
    }
  }

  window.SideCart = { open: openDrawer, close: closeDrawer, refresh: refreshCart };
```

- [ ] **Step 3: Verify in browser**

Reload the storefront, run `window.SideCart.open()`. Expected: header shows "My cart" (no bullet count yet if cart empty — count renders as `• 0`), footer shows "Subtotal" with a formatted `₹0.00`-style price and a purple "Checkout • ₹0.00" button. Clicking Checkout navigates to `/checkout`. Add an item via a PDP, reload, reopen: subtotal and the checkout button total match the theme cart's total; TIMER/PROGRESS_BAR/PRODUCTS blocks are absent (not yet in the registry) but nothing errors. Verify escaping: temporarily set `window.__SC_SPEC__.header.TOP_BAR.props.title = '<img src=x onerror=alert(1)>'` in console followed by `SideCart.refresh()` — the title renders as literal text, no alert.

- [ ] **Step 4: Commit**

```bash
git add extensions/ai-side-cart/assets/cart.js
git commit -m "feat(side-cart): render core, registry, tokens, first three blocks"
```

---

### Task 3: PRODUCTS_IN_CART + qty/remove writes

**Files:**
- Modify: `extensions/ai-side-cart/assets/cart.js` (fill `/* §3 products + writes */`; add `PRODUCTS_IN_CART` to `registry`; extend `route()`)

**Interfaces:**
- Consumes: `esc`, `money`, `registry`, `render`, `setCart`, `refreshCart`, `cart`, `ctx`, `_fetch`, `interceptorPaused` from Tasks 1–2.
- Produces: `pausedWrite(path, body)` → Promise<cartJson|null> (POST with `X-Side-Cart` header, `interceptorPaused` true for its duration — EVERY later cart write uses this); `changeQty(line, qty)`; `variantHtml(item, p)` (static label now; Task 9 replaces it); block `PRODUCTS_IN_CART`; `data-action="qty"|"remove"` handled with `data-line` (1-based line index) and `data-qty`.

- [ ] **Step 1: Insert at `/* §3 products + writes */`**

```js
  /* §3 products + writes */
  function pausedWrite(path, body) {
    interceptorPaused = true;
    return _fetch(ctx.root + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Side-Cart": "1" },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.ok ? res.json() : null;
    }).catch(function () {
      return null;
    }).finally(function () {
      interceptorPaused = false;
    });
  }

  function changeQty(line, qty) {
    return pausedWrite("cart/change.js", { line: Number(line), quantity: Math.max(0, Number(qty)) })
      .then(function (next) { next ? setCart(next) : refreshCart(); });
  }

  function variantHtml(item, p) {
    if (!p.showVariantSelector || !item.variant_title) return "";
    return '<span class="sc-variant">' + esc(item.variant_title) + "</span>";
  }

  function lineHtml(item, line, p) {
    var gift = item.properties && item.properties._sc_gift;
    var img = item.image
      ? '<img class="sc-img" src="' + esc(item.image) + '" alt="" loading="lazy">'
      : '<span class="sc-img"></span>';
    var qty = !gift && p.showQuantitySelector
      ? '<span class="sc-qty">' +
        '<button data-action="qty" data-line="' + line + '" data-qty="' + (item.quantity - 1) + '" aria-label="Decrease">−</button>' +
        "<span>" + item.quantity + "</span>" +
        '<button data-action="qty" data-line="' + line + '" data-qty="' + (item.quantity + 1) + '" aria-label="Increase">+</button>' +
        "</span>"
      : "";
    var price = gift
      ? '<span class="sc-badge">FREE</span>'
      : '<span class="sc-price">' + money(p.showSingleItemPrice ? item.final_price : item.final_line_price) + "</span>";
    var remove = gift ? ""
      : '<button class="sc-remove" data-action="remove" data-line="' + line + '">Remove</button>';
    return '<li class="sc-line">' + img +
      '<div class="sc-line-main"><span class="sc-line-title">' + esc(item.product_title) + "</span>" +
      variantHtml(item, p) + qty + "</div>" +
      '<div class="sc-line-side">' + price + remove + "</div></li>";
  }

  function PRODUCTS_IN_CART(block) {
    var p = block.props || {};
    if (!cart || !cart.items || !cart.items.length) {
      return '<p class="sc-empty">' + esc(p.emptyText || "Your cart is empty.") + "</p>";
    }
    return '<ul class="sc-lines">' + cart.items.map(function (item, i) {
      return lineHtml(item, i + 1, p);
    }).join("") + "</ul>";
  }
```

- [ ] **Step 2: Register the block and extend `route()`**

Add to `registry` (Task 2's object): `PRODUCTS_IN_CART: PRODUCTS_IN_CART,` — note `registry` is declared before the function definitions are hoisted; since all blocks are function declarations inside the IIFE, adding the key works regardless of order. Replace `route()` with:

```js
  function route(action, t, e) {
    switch (action) {
      case "qty": changeQty(t.dataset.line, Number(t.dataset.qty)); break;
      case "remove": changeQty(t.dataset.line, 0); break;
      case "checkout": location.href = ctx.checkoutUrl || "/checkout"; break;
      case "close": closeDrawer(); break;
    }
  }
```

- [ ] **Step 3: Verify in browser**

Add 2 different products to the cart via PDP, reload, `SideCart.open()`. Expected: both lines render with image, title, variant label, − / qty / + stepper, line price, Remove. Clicking + increments the quantity and the subtotal + checkout total update; − to 0 removes the line; Remove removes the line; emptying the cart shows "Your cart is empty." Network tab: each click is ONE `POST /cart/change.js` with the `X-Side-Cart` request header, followed by no extra `GET /cart.js` (change.js returns the cart). The cart is now functional end-to-end from inside the drawer.

- [ ] **Step 4: Commit**

```bash
git add extensions/ai-side-cart/assets/cart.js
git commit -m "feat(side-cart): PRODUCTS_IN_CART block with qty/remove writes"
```

---

### Task 4: DETECT — fetch/XHR interception, guards, click detector, native-drawer suppression

**Files:**
- Modify: `extensions/ai-side-cart/assets/cart.js` (fill `/* §4 detect */`; add boot calls)

**Interfaces:**
- Consumes: `_fetch`, `interceptorPaused`, `openDrawer`, `refreshCart`, `window.__sideCartLast` from earlier tasks.
- Produces: `installFetchInterceptor()`, `installXhrInterceptor()`, `installCartIconClickDetector()`, `disableNativeCart()` — all called once at boot; `handleCartMutationResponse(response, verdict)`; event `side-cart:item-added` `{item, quantityAdded}` on `document`. Open-closed extension points: `ENDPOINT_MATCHERS`, `ENDPOINT_PREDICATES`, `INTERCEPT_GUARDS`, `CART_LINK_SELECTORS`, `NATIVE_CART_SELECTORS`, `NATIVE_CLOSE_BUTTON_SELECTORS`, `SCROLL_LOCK_CLASSES` — new themes/apps are supported by adding entries only.

- [ ] **Step 1: Insert the classification layer at `/* §4 detect */`**

```js
  /* §4 detect — network interception. THE CONTRACT: the real request ALWAYS runs
     untouched; only our reaction is conditional; any error degrades to passthrough. */

  var ENDPOINT_MATCHERS = {                 // add endpoints here, never edit evaluate()
    add:    /\/cart\/add(\.js)?(\?|$)/,
    change: /\/cart\/change(\.js)?(\?|$)/,
    update: /\/cart\/update(\.js)?(\?|$)/,
    clear:  /\/cart\/clear(\.js)?(\?|$)/,
  };

  var NON_CART_BODY_KEYS = ["note", "sections", "attributes", "discount", "currency"];

  function classifyEndpoint(url) {
    for (var endpointName in ENDPOINT_MATCHERS) {
      if (ENDPOINT_MATCHERS[endpointName].test(url)) return endpointName;
    }
    return null;
  }

  function parseRequestBody(rawBody, headers) {
    try {
      if (!rawBody) return Promise.resolve({});
      if (typeof rawBody === "string") {
        var trimmed = rawBody.trim();
        if (trimmed[0] === "{" || trimmed[0] === "[") return Promise.resolve(JSON.parse(trimmed));
        return Promise.resolve(paramsToObject(new URLSearchParams(rawBody)));
      }
      if (rawBody instanceof URLSearchParams) return Promise.resolve(paramsToObject(rawBody));
      if (typeof FormData !== "undefined" && rawBody instanceof FormData) {
        return Promise.resolve(paramsToObject(rawBody));
      }
      // Request.clone().body, Blob, ArrayBuffer → read as text and re-parse
      return new Response(rawBody).text().then(function (text) {
        return parseRequestBody(text, headers);
      });
    } catch (parseError) { return Promise.resolve({}); }
  }

  function paramsToObject(iterable) {
    var out = {};
    iterable.forEach(function (value, key) { out[key] = value; });
    return out;
  }

  function hasOnlyNonCartKeys(bodyData) {
    var keys = Object.keys(bodyData);
    return keys.length > 0 && keys.every(function (key) {
      return NON_CART_BODY_KEYS.indexOf(key.split("[")[0]) !== -1;
    });
  }

  var ENDPOINT_PREDICATES = {               // "is this a REAL cart change?"
    add: function (bodyData) {
      if (Array.isArray(bodyData.items)) return bodyData.items.length > 0;
      if (bodyData.id != null) return true;
      return Object.keys(bodyData).some(function (key) {
        return key === "id" || key.indexOf("items[") === 0;
      });
    },
    update: function (bodyData) {
      if (hasOnlyNonCartKeys(bodyData)) return false;
      var hasUpdatesObject = bodyData.updates != null;
      var hasUpdatesParams = Object.keys(bodyData).some(function (key) {
        return key.indexOf("updates[") === 0 || key === "updates";
      });
      if (!hasUpdatesObject && !hasUpdatesParams) return false;
      if (hasUpdatesObject && typeof bodyData.updates === "object" &&
          Object.keys(bodyData.updates).length === 0) return false;
      return true;
    },
    change: function (bodyData) { return !hasOnlyNonCartKeys(bodyData); },
    clear: function () { return true; },
  };
```

- [ ] **Step 2: Insert the guard list and evaluator (same region, below Step 1's code)**

```js
  function requestHasOurHeader(headers) {
    if (!headers) return false;
    if (typeof Headers !== "undefined" && headers instanceof Headers) return headers.has("X-Side-Cart");
    return Object.keys(headers).some(function (key) { return key.toLowerCase() === "x-side-cart"; });
  }

  // Every guard is load-bearing (spec §4.1). A guard returning true VETOES the
  // reaction. Extend by adding entries — evaluate() never changes.
  var INTERCEPT_GUARDS = [
    { name: "own-request",       vetoes: function (requestInfo) { return requestHasOurHeader(requestInfo.headers); } },
    { name: "interceptor-paused", vetoes: function () { return interceptorPaused; } },
    { name: "explicit-ignore",   vetoes: function (requestInfo) { return /[?&]side_cart_ignore=true/.test(requestInfo.url); } },
    { name: "other-app-ocu",     vetoes: function (requestInfo) { return /[?&]ocu=/.test(requestInfo.url); } },
  ];

  function urlNeverOpensDrawer(url) { return /[?&]opens_cart=never/.test(url); }

  // → null (ignore) or { endpoint, neverOpen }
  function evaluateRequest(requestInfo) {
    if (String(requestInfo.method || "GET").toUpperCase() !== "POST") return Promise.resolve(null);
    var endpoint = classifyEndpoint(requestInfo.url);
    if (!endpoint) return Promise.resolve(null);
    var vetoed = INTERCEPT_GUARDS.some(function (guard) {
      try { return guard.vetoes(requestInfo); } catch (guardError) { return false; }
    });
    if (vetoed) return Promise.resolve(null);
    return parseRequestBody(requestInfo.body, requestInfo.headers).then(function (bodyData) {
      if (!ENDPOINT_PREDICATES[endpoint](bodyData)) return null;
      return { endpoint: endpoint, neverOpen: urlNeverOpensDrawer(requestInfo.url) };
    });
  }
```

- [ ] **Step 3: Insert the reaction + the two interceptors (same region, below Step 2's code)**

```js
  function handleCartMutationResponse(response, verdict) {
    try {
      if (!response.ok) return Promise.resolve();
      var onCartPage = /\/cart\/?$/.test(location.pathname);
      if (!verdict.neverOpen && !onCartPage) openDrawer();
      var diffDone = Promise.resolve();
      if (verdict.endpoint === "add") {
        diffDone = response.json().then(function (addResponseData) {
          var addedItems = Array.isArray(addResponseData) ? addResponseData
            : Array.isArray(addResponseData.items) ? addResponseData.items
            : [addResponseData];
          var previousCart = window.__sideCartLast;
          addedItems.forEach(function (addedItem) {
            if (!addedItem || addedItem.variant_id == null) return;
            var previousLine = previousCart && previousCart.items && previousCart.items.find(
              function (line) { return line.variant_id === addedItem.variant_id; });
            var quantityAdded = addedItem.quantity - (previousLine ? previousLine.quantity : 0);
            if (quantityAdded > 0) {
              document.dispatchEvent(new CustomEvent("side-cart:item-added", {
                detail: { item: addedItem, quantityAdded: quantityAdded },
              }));
            }
          });
        }).catch(function () {});
      }
      return diffDone.then(refreshCart);      // stashes __sideCartLast for the NEXT diff
    } catch (reactionError) { return Promise.resolve(); } // never throw into theme code
  }

  function reactToResponse(requestInfo, response) {
    evaluateRequest(requestInfo).then(function (verdict) {
      if (verdict) return handleCartMutationResponse(response.clone(), verdict);
    }).catch(function () {});
  }

  function installFetchInterceptor() {
    window.fetch = function (input, init) {
      var realRequest = _fetch(input, init);            // ALWAYS runs, untouched
      try {
        var requestInfo = {
          url: typeof input === "string" ? input : (input && input.url) || "",
          method: (init && init.method) || (input && input.method) || "GET",
          headers: (init && init.headers) || (input && input.headers) || null,
          body: (init && init.body) ||
            (typeof Request !== "undefined" && input instanceof Request ? input.clone().body : null),
        };
        realRequest.then(function (response) { reactToResponse(requestInfo, response); })
                   .catch(function () {});
      } catch (interceptError) { /* degrade to passthrough */ }
      return realRequest;
    };
  }

  function installXhrInterceptor() {
    var xhrProto = window.XMLHttpRequest.prototype;
    var originalOpen = xhrProto.open, originalSend = xhrProto.send,
        originalSetHeader = xhrProto.setRequestHeader;
    xhrProto.open = function (method, url) {
      try { this._sideCart = { method: method, url: String(url), headers: {} }; } catch (e) {}
      return originalOpen.apply(this, arguments);
    };
    xhrProto.setRequestHeader = function (name, value) {
      try { if (this._sideCart) this._sideCart.headers[name] = value; } catch (e) {}
      return originalSetHeader.apply(this, arguments);
    };
    xhrProto.send = function (body) {
      try {
        if (this._sideCart) {
          this._sideCart.body = body;
          var xhr = this;
          xhr.addEventListener("load", function () {
            var responseLike = {
              ok: xhr.status >= 200 && xhr.status < 300,
              json: function () {
                return Promise.resolve().then(function () { return JSON.parse(xhr.responseText); });
              },
              clone: function () { return responseLike; },
            };
            reactToResponse(xhr._sideCart, responseLike);
          });
        }
      } catch (interceptError) { /* degrade to passthrough */ }
      return originalSend.apply(this, arguments);
    };
  }
```

- [ ] **Step 4: Insert the click detector + native-drawer suppression (same region, below Step 3's code)**

```js
  /* Click detector — the theme's cart icon opens OUR drawer. Extend the list per theme. */
  var CART_LINK_SELECTORS =
    'a[href$="/cart"], a[href*="/cart?"], a[href*="/cart#"], #cart-icon-bubble, ' +
    '.header__icon--cart, [data-cart-icon], [data-drawer-toggle="cart"]';

  function installCartIconClickDetector() {
    document.addEventListener("click", function (event) {
      if (event.target.closest("#sc-root")) return;      // never hijack clicks in OUR drawer
      var cartLink = event.target.closest(CART_LINK_SELECTORS);
      if (cartLink) { event.preventDefault(); event.stopPropagation(); openDrawer(); }
    }, true);
  }

  /* Native drawer suppression — three layers (hide / close / keep-shut). All lists
     are extension points; the logic below never changes for a new theme. */
  var NATIVE_CART_SELECTORS = [
    "cart-drawer", "cart-notification", "#CartDrawer", "#CartDrawer-Overlay",
    ".mini-cart", "#slidecart", ".cart-popup",
  ];
  var NATIVE_CLOSE_BUTTON_SELECTORS =
    ".drawer__close, [data-close], .cart-drawer__close, .cart-notification__close";
  var SCROLL_LOCK_CLASSES = [
    "overflow-hidden", "js-drawer-open", "t4s-lock-scroll", "cart-drawer-open",
  ];

  function closeNativeCartElements() {
    NATIVE_CART_SELECTORS.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (nativeEl) {
        try {
          if (typeof nativeEl.close === "function") nativeEl.close();
          nativeEl.removeAttribute("open");
          ["active", "is-open", "animate", "open"].forEach(function (cls) {
            nativeEl.classList.remove(cls);
          });
        } catch (closeError) { /* one drawer failing must not stop the rest */ }
      });
    });
    SCROLL_LOCK_CLASSES.forEach(function (lockClass) {
      document.body.classList.remove(lockClass);
      document.documentElement.classList.remove(lockClass);
    });
  }

  function disableNativeCart() {
    // Layer 1 — hide: one stylesheet, every selector guarded so we never match ourselves
    var hideStyle = document.createElement("style");
    hideStyle.textContent = NATIVE_CART_SELECTORS.map(function (selector) {
      return selector + ":not(#side-cart){display:none!important;visibility:hidden!important}";
    }).join("");
    document.head.appendChild(hideStyle);
    // Layer 2 — close now
    closeNativeCartElements();
    // Layer 3 — keep shut: re-close anything that re-opens itself
    var keepShutObserver = new MutationObserver(closeNativeCartElements);
    NATIVE_CART_SELECTORS.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (nativeEl) {
        keepShutObserver.observe(nativeEl, {
          attributes: true, attributeFilter: ["open", "aria-hidden", "class"],
        });
      });
    });
  }
```

- [ ] **Step 5: Boot the detectors** — immediately after the `refreshCart(); // boot` line from Task 2, add:

```js
  installFetchInterceptor();
  installXhrInterceptor();
  installCartIconClickDetector();
  disableNativeCart();
```

- [ ] **Step 6: Verify in browser — this is the demo-ready gate**

1. On a Dawn PDP, click the theme's own "Add to cart": OUR drawer slides open showing the new line; Dawn's `cart-notification` never appears; console shows no errors.
2. In console, before adding again: `document.addEventListener("side-cart:item-added", e => console.log("added", e.detail))` — adding from the PDP logs `{item, quantityAdded: 1}`.
3. Click the header cart icon anywhere on the store: our drawer opens instead of navigating to `/cart` or opening Dawn's drawer.
4. **Loop check (critical):** with the drawer open, click + on a line and watch the Network tab — exactly one `POST /cart/change.js`; NO cascade of repeated `/cart.js` requests (own-request guard + `interceptorPaused` both working).
5. Save an order note if the theme has one, or run `fetch("/cart/update.js", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({note:"hi"})})` in console: the drawer does NOT auto-open (useless-keys body correctly ignored).
6. Run `fetch("/cart/add.js?side_cart_ignore=true", …)` with a valid item: cart changes but drawer does not react.

- [ ] **Step 7: Commit**

```bash
git add extensions/ai-side-cart/assets/cart.js
git commit -m "feat(side-cart): network interception, click detector, native drawer suppression"
```

---

### Task 5: Count-sync — keep the theme's header bubble correct

**Files:**
- Modify: `extensions/ai-side-cart/assets/cart.js` (fill `/* §5 count-sync */`; replace the Task-2 `syncCartCount` stub)

**Interfaces:**
- Consumes: `render()` already calls `syncCartCount(cart.item_count)` (Task 2).
- Produces: real `syncCartCount(count)`; extension point `COUNT_SYNC_TARGETS` — an array of `{selector, type: "text"|"attribute"|"toggle", attribute?, showClass?}`; new themes are supported by adding entries only.

- [ ] **Step 1: Replace the `syncCartCount` stub** — delete the Task-2 stub line and insert at `/* §5 count-sync */`:

```js
  /* §5 count-sync — we intercept silently, so the theme never learns about
     programmatic changes; we update its own bubble ourselves. Extend per theme. */
  var COUNT_SYNC_TARGETS = [
    { selector: ".cart-count-bubble span[aria-hidden='true']", type: "text" },   // Dawn
    { selector: "#CartCount, .header__cart-count",             type: "text" },
    { selector: "[data-cart-count]", type: "attribute", attribute: "data-cart-count" },
    { selector: ".cart-count-bubble", type: "toggle", showClass: "sc-visible" },  // Dawn dot
  ];

  var COUNT_SYNC_APPLIERS = {
    text: function (el, count) { el.textContent = count; el.removeAttribute("hidden"); },
    attribute: function (el, count, target) { el.setAttribute(target.attribute, count); },
    toggle: function (el, count, target) { el.classList.toggle(target.showClass, count > 0); },
  };

  function syncCartCount(count) {
    COUNT_SYNC_TARGETS.forEach(function (target) {
      document.querySelectorAll(target.selector).forEach(function (el) {
        try { COUNT_SYNC_APPLIERS[target.type](el, count, target); } catch (syncError) {}
      });
    });
  }
```

Note: `syncCartCount` is declared twice if the stub isn't removed — remove the Task-2 stub line `function syncCartCount(count) {}` entirely.

- [ ] **Step 2: Add the toggle CSS** — append to `cart.css`:

```css
/* count-sync: Dawn hides the bubble when empty; we force visibility to track count */
.cart-count-bubble.sc-visible { visibility: visible !important; }
```

- [ ] **Step 3: Verify in browser**

With the drawer open, change quantities and remove lines: Dawn's header count bubble updates on every write without a page reload, and empties (or hides) when the cart is cleared. Add via PDP: bubble and drawer agree.

- [ ] **Step 4: Commit**

```bash
git add extensions/ai-side-cart/assets/cart.js extensions/ai-side-cart/assets/cart.css
git commit -m "feat(side-cart): theme header count-sync"
```

---

### Task 6: PROGRESS_BAR + free-gift engine

**Files:**
- Modify: `extensions/ai-side-cart/assets/cart.js` (fill `/* §6 progress + free gift */`; replace the Task-2 `progressVars` and `checkFreeGift` stubs; add `PROGRESS_BAR` to `registry`; small addition inside `setCart`)

**Interfaces:**
- Consumes: `spec`, `cart`, `money`, `fill`, `tvars`, `esc`, `pausedWrite`, `setCart`, `refreshCart`, `render` from earlier tasks.
- Produces: real `progressVars()` → `{needed, next, unlocked}`; `sortedProgressRules()`; `progressTotal()`; `numericIdFromGid(gid)`; block `PROGRESS_BAR`; free-gift engine `checkFreeGift()` (async, re-entry-guarded by `freeGiftBusy`). Rule types `DISCOUNT` and `FREE_SHIPPING` are display-only; only `FREE_GIFT` writes to the cart (spec decision #3).

- [ ] **Step 1: Insert at `/* §6 progress + free gift */`** and DELETE the Task-2 stubs `progressVars` and `checkFreeGift`:

```js
  /* §6 progress bar + free-gift engine */
  var justUnlockedFlash = null;   // { label, expiresAt } — brief unlockedText flash
  var previousProgressTotal = 0;

  function progressBlock() {
    var block = spec.header && spec.header.PROGRESS_BAR;
    return block && block.enabled && block.props && Array.isArray(block.props.rules) ? block : null;
  }

  function sortedProgressRules() {
    var block = progressBlock();
    if (!block) return [];
    return block.props.rules.slice().sort(function (a, b) { return a.unlockAt - b.unlockAt; });
  }

  function progressTotal() {
    var block = progressBlock();
    if (!cart || !block) return 0;
    return block.props.unlockedBy === "QUANTITY" ? cart.item_count : cart.total_price;
  }

  function formatProgressAmount(amount) {
    var block = progressBlock();
    return block && block.props.unlockedBy === "QUANTITY" ? String(amount) : money(amount);
  }

  function progressVars() {
    var rules = sortedProgressRules();
    if (!rules.length) return {};
    var total = progressTotal();
    var nextRule = rules.find(function (rule) { return total < rule.unlockAt; });
    return {
      needed: nextRule ? formatProgressAmount(nextRule.unlockAt - total) : "",
      next: nextRule ? nextRule.label : "",
      unlocked: justUnlockedFlash ? justUnlockedFlash.label : "",
    };
  }

  // called from setCart (Step 2) — detects a threshold crossing for the flash message
  function trackUnlockCrossings() {
    var rules = sortedProgressRules();
    if (!rules.length) return;
    var total = progressTotal();
    var crossedRule = rules.find(function (rule) {
      return previousProgressTotal < rule.unlockAt && total >= rule.unlockAt;
    });
    previousProgressTotal = total;
    if (crossedRule) {
      justUnlockedFlash = { label: crossedRule.label, expiresAt: Date.now() + 3000 };
      setTimeout(function () { justUnlockedFlash = null; render(); }, 3000);
    }
  }

  function PROGRESS_BAR(block) {
    var rules = sortedProgressRules();
    if (!rules.length || !cart) return "";
    var blockProps = block.props;
    var total = progressTotal();
    var maxUnlockAt = rules[rules.length - 1].unlockAt;
    var fillPercent = Math.min(100, (total / maxUnlockAt) * 100);
    var nextRule = rules.find(function (rule) { return total < rule.unlockAt; });
    var messageTemplate;
    if (!nextRule) messageTemplate = blockProps.allUnlockedText;
    else if (justUnlockedFlash && Date.now() < justUnlockedFlash.expiresAt) messageTemplate = blockProps.unlockedText;
    else messageTemplate = blockProps.defaultText;
    var milestones = rules.map(function (rule) {
      var leftPercent = Math.min(100, (rule.unlockAt / maxUnlockAt) * 100);
      var reached = total >= rule.unlockAt;
      return '<span class="sc-milestone' + (reached ? " sc-done" : "") +
        '" style="left:' + leftPercent + '%" title="' + esc(rule.label) + '"></span>';
    }).join("");
    return '<div class="sc-progress"><p class="sc-progress-text">' + fill(messageTemplate, tvars()) +
      '</p><div class="sc-track"><div class="sc-fill" style="width:' + fillPercent + '%"></div>' +
      milestones + "</div></div>";
  }

  /* Free-gift engine. JS adds/removes the gift LINE; a Shopify automatic discount
     makes its PRICE zero — money is never client-side. The `_sc_gift` line property
     is both the FREE badge marker and how this loop finds its own additions. */
  var freeGiftBusy = false;    // re-entry guard: checkFreeGift runs inside setCart

  function numericIdFromGid(gid) {
    var match = String(gid || "").match(/(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  function checkFreeGift() {
    if (freeGiftBusy || !cart) return;
    var giftRules = sortedProgressRules().filter(function (rule) {
      return rule.type === "FREE_GIFT" && rule.product;
    });
    if (!giftRules.length) return;
    var total = progressTotal();
    giftRules.forEach(function (rule) {
      var giftVariantId = numericIdFromGid(rule.product.variantId);
      if (!giftVariantId) return;
      var giftLineIndex = cart.items.findIndex(function (line) {
        return line.variant_id === giftVariantId && line.properties && line.properties._sc_gift;
      });
      if (total >= rule.unlockAt && giftLineIndex === -1) {
        freeGiftBusy = true;
        pausedWrite("cart/add.js", {
          items: [{ id: giftVariantId, quantity: 1, properties: { _sc_gift: "true" } }],
        }).then(function (added) {
          freeGiftBusy = false;
          if (added) refreshCart();   // state now matches → next check is a no-op
        });
      } else if (total < rule.unlockAt && giftLineIndex !== -1) {
        freeGiftBusy = true;
        pausedWrite("cart/change.js", { line: giftLineIndex + 1, quantity: 0 })
          .then(function (nextCart) {
            freeGiftBusy = false;
            if (nextCart) setCart(nextCart);
          });
      }
    });
  }
```

- [ ] **Step 2: Hook crossing detection into `setCart`** — inside `setCart` (Task 2), add `trackUnlockCrossings();` immediately before the `checkFreeGift();` line:

```js
  function setCart(next) {
    if (!next) return;
    cart = next;
    window.__sideCartLast = next;
    trackUnlockCrossings();
    checkFreeGift();
    render();
    document.dispatchEvent(new CustomEvent("side-cart:updated", { detail: { cart: cart } }));
  }
```

- [ ] **Step 3: Register the block** — add `PROGRESS_BAR: PROGRESS_BAR,` to `registry`.

- [ ] **Step 4: Set up real test data on the dev store**

1. Pick a cheap product on the dev store to be the gift. Get its variant GID: Shopify admin → the product → the variant — or via the app's GraphQL. Replace the placeholder `variantId` (and `productId`) in `assets/cart-spec.js`'s FREE_GIFT rule with the real GIDs.
2. In the dev store admin, create an **automatic discount**: "Buy X get Y" or an amount-off targeting that product, so the gift line prices at 0 when the cart total ≥ the threshold. (The JS only adds the line; Shopify does the money.)
3. If the store currency makes the spec thresholds (₹1000 / ₹2000 / ₹3000 in cents) impractical, lower `unlockAt` values in `cart-spec.js` to amounts reachable with 1–3 test products.

- [ ] **Step 5: Verify in browser**

1. Empty cart → progress bar shows "Add ₹X to unlock 10% off!" with 3 hollow milestone dots and an empty fill.
2. Add items past rule 1: message flashes "🎉 10% off unlocked!" for ~3s, then switches to chasing rule 2; first milestone fills.
3. Cross the FREE_GIFT threshold: the gift line appears automatically with a FREE badge, no qty stepper, no Remove button; Network tab shows one `POST /cart/add.js` with the `X-Side-Cart` header and `_sc_gift` property — and NO interception loop.
4. Remove items to drop below the threshold: the gift line disappears automatically.
5. Cross the last rule: "All rewards unlocked 🎉", bar full.

- [ ] **Step 6: Commit**

```bash
git add extensions/ai-side-cart/assets/cart.js extensions/ai-side-cart/assets/cart-spec.js
git commit -m "feat(side-cart): progress bar with milestones and free-gift engine"
```

---

### Task 7: TIMER — cookie deadline + 1s tick

**Files:**
- Modify: `extensions/ai-side-cart/assets/cart.js` (fill `/* §7 timer */`; replace the Task-2 `timerText` stub; add `TIMER` to `registry`; small addition inside `setCart`)

**Interfaces:**
- Consumes: `spec`, `cart`, `esc`, `root`, `pausedWrite`, `setCart`, `render` from earlier tasks.
- Produces: real `timerText()` → `"MM:SS"` or `""`; `startTimerEngine()` (called once at boot); block `TIMER` rendering `{{timer}}` into a `[data-sc-timer]` span so the tick updates ONE span, not a full render; cookie `_sc_timer_end` (epoch ms, first-party, never on a server).

- [ ] **Step 1: Insert at `/* §7 timer */`** and DELETE the Task-2 stub `timerText`:

```js
  /* §7 timer — per-visitor deadline in a first-party cookie; one interval app-wide */
  var TIMER_COOKIE_NAME = "_sc_timer_end";
  var timerExpiryHandled = false;
  var previousItemCount = null;

  function enabledTimerBlock() {
    var block = spec.header && spec.header.TIMER;
    return block && block.enabled && block.props ? block : null;
  }

  function readTimerDeadline() {
    var match = document.cookie.match(new RegExp("(?:^|; )" + TIMER_COOKIE_NAME + "=(\\d+)"));
    return match ? Number(match[1]) : null;
  }

  function writeTimerDeadline(epochMs) {
    document.cookie = TIMER_COOKIE_NAME + "=" + epochMs + ";path=/;max-age=86400;SameSite=Lax";
  }

  function stampFreshDeadline() {
    var block = enabledTimerBlock();
    if (!block) return;
    writeTimerDeadline(Date.now() + (Number(block.props.timeLimit) || 30) * 60000);
    timerExpiryHandled = false;
  }

  function timerText() {
    var deadline = readTimerDeadline();
    if (!deadline) return "";
    var msLeft = Math.max(0, deadline - Date.now());
    var minutes = String(Math.floor(msLeft / 60000)).padStart(2, "0");
    var seconds = String(Math.floor((msLeft % 60000) / 1000)).padStart(2, "0");
    return minutes + ":" + seconds;
  }

  function TIMER(block) {
    var deadline = readTimerDeadline();
    if (!deadline || Date.now() >= deadline) return "";   // renders nothing past expiry
    // esc the whole title FIRST, then splice the live span in place of {{timer}}
    var titleHtml = esc(block.props.title).replace(/\{\{\s*timer\s*\}\}/g,
      '<span data-sc-timer>' + timerText() + "</span>");
    return '<div class="sc-timer">' + titleHtml + "</div>";
  }

  function onTimerTick() {
    var block = enabledTimerBlock();
    if (!block) return;
    var timerSpan = root.querySelector("[data-sc-timer]");
    if (timerSpan) timerSpan.textContent = timerText();     // 1s tick touches ONE span
    var deadline = readTimerDeadline();
    if (deadline && Date.now() >= deadline && !timerExpiryHandled) {
      timerExpiryHandled = true;
      if (block.props.removeCartItemsTimerEnds && cart && cart.item_count > 0) {
        pausedWrite("cart/clear.js", {}).then(function (clearedCart) {
          if (clearedCart) setCart(clearedCart);
        });
      } else {
        render();   // one full render so TIMER disappears
      }
    }
  }

  function startTimerEngine() {
    if (!enabledTimerBlock()) return;    // no-op when the block is disabled
    if (!readTimerDeadline()) stampFreshDeadline();
    setInterval(onTimerTick, 1000);
  }

  // called from setCart: re-stamp the deadline when the item count GROWS
  function maybeResetTimerOnAdd() {
    var block = enabledTimerBlock();
    var count = cart ? cart.item_count : 0;
    if (block && block.props.resetTimerProductAddedToCart &&
        previousItemCount != null && count > previousItemCount) {
      stampFreshDeadline();
    }
    previousItemCount = count;
  }
```

- [ ] **Step 2: Wire into `setCart` and boot**

In `setCart`, add `maybeResetTimerOnAdd();` immediately after `trackUnlockCrossings();`. In the boot section (after `disableNativeCart();` from Task 4), add `startTimerEngine();`.

- [ ] **Step 3: Register the block** — add `TIMER: TIMER,` to `registry`.

- [ ] **Step 4: Verify in browser**

1. Fresh visit (clear the `_sc_timer_end` cookie in DevTools → Application): drawer header shows "Cart expires in 44:59 ⏰" counting down every second — watch the Elements panel: only the `[data-sc-timer]` span mutates, not the whole drawer.
2. Add a product: the countdown resets to 45:00 (`resetTimerProductAddedToCart`).
3. Set the cookie to `Date.now() + 5000` in console (`document.cookie = "_sc_timer_end=" + (Date.now()+5000) + ";path=/"`), wait 5s: the timer block disappears; cart items remain (since `removeCartItemsTimerEnds: false`). Flip that prop to `true` in `cart-spec.js`, repeat: cart clears at zero via one `POST /cart/clear.js`.

- [ ] **Step 5: Commit**

```bash
git add extensions/ai-side-cart/assets/cart.js
git commit -m "feat(side-cart): countdown timer with cookie deadline"
```

---

### Task 8: Footer blocks — DISCOUNT_CODE, ORDER_NOTES, TRUST_BADGES, PAYMENT_METHODS + input preservation

**Files:**
- Modify: `extensions/ai-side-cart/assets/cart.js` (fill `/* §8 footer blocks */`; replace the Task-2 `snapshotInputs`/`restoreInputs` stubs; add 4 blocks to `registry`; extend `route()`)

**Interfaces:**
- Consumes: `esc`, `cart`, `notesOpen`, `pausedWrite`, `setCart`, `refreshCart`, `render`, `root`, `registry`, `route` from earlier tasks.
- Produces: blocks `DISCOUNT_CODE`, `ORDER_NOTES`, `TRUST_BADGES`, `PAYMENT_METHODS`; `applyDiscount(code)` (empty string removes — spec decision #4: `cart/update.js {discount}`); `saveOrderNote(noteText)`; real `snapshotInputs()`/`restoreInputs()` so typed text survives full re-renders; actions `apply-discount`, `remove-discount`, `toggle-notes`; a capture-phase `blur` listener for notes.

- [ ] **Step 1: Insert at `/* §8 footer blocks */`** and DELETE the Task-2 stubs `snapshotInputs` and `restoreInputs`:

```js
  /* §8 footer blocks */
  function DISCOUNT_CODE(block) {
    var blockProps = block.props || {};
    var appliedChips = ((cart && cart.discount_codes) || [])
      .filter(function (discount) { return discount.applicable !== false; })
      .map(function (discount) {
        return '<span class="sc-chip">' + esc(discount.code) +
          '<button data-action="remove-discount" aria-label="Remove discount">✕</button></span>';
      }).join("");
    return '<div class="sc-discount"><div class="sc-disc-row">' +
      '<input id="sc-disc-input" type="text" placeholder="' + esc(blockProps.placeholderTitle) + '">' +
      '<button class="sc-apply" data-action="apply-discount">' + esc(blockProps.buttonText) + "</button>" +
      '</div><div class="sc-chips">' + appliedChips + "</div></div>";
  }

  function applyDiscount(code) {
    return pausedWrite("cart/update.js", { discount: code || "" })
      .then(function (nextCart) { nextCart ? setCart(nextCart) : refreshCart(); });
  }

  function ORDER_NOTES(block) {
    var blockProps = block.props || {};
    var textareaHtml = notesOpen
      ? '<textarea id="sc-notes" placeholder="' + esc(blockProps.textAreaPlaceholder) + '">' +
        esc((cart && cart.note) || "") + "</textarea>"
      : "";
    return '<div class="sc-notes"><button class="sc-notes-toggle" data-action="toggle-notes">' +
      esc(blockProps.title) + " " + (notesOpen ? "▴" : "▾") + "</button>" + textareaHtml + "</div>";
  }

  function saveOrderNote(noteText) {
    return pausedWrite("cart/update.js", { note: noteText }); // useless-keys body → interceptor ignores it
  }

  function TRUST_BADGES(block) {
    var badges = (block.props && block.props.badges) || [];
    if (!badges.length) return "";
    return '<div class="sc-trust">' + badges.map(function (badge) {
      return "<span>" + esc(badge.title) + "</span>";
    }).join("") + "</div>";
  }

  function PAYMENT_METHODS(block) {
    var icons = (block.props && block.props.icons) || [];
    if (!icons.length) return "";
    return '<div class="sc-pay">' + icons.map(function (iconLabel) {
      return "<span>" + esc(iconLabel) + "</span>";
    }).join("") + "</div>";
  }

  /* input preservation — typed-but-unsubmitted text survives every innerHTML replace */
  var preservedInputs = { discountCode: "", noteText: null };

  function snapshotInputs() {
    var discountInput = $("sc-disc-input");
    if (discountInput) preservedInputs.discountCode = discountInput.value;
    var notesTextarea = $("sc-notes");
    if (notesTextarea) preservedInputs.noteText = notesTextarea.value;
  }

  function restoreInputs() {
    var discountInput = $("sc-disc-input");
    if (discountInput && preservedInputs.discountCode) discountInput.value = preservedInputs.discountCode;
    var notesTextarea = $("sc-notes");
    if (notesTextarea && preservedInputs.noteText != null) notesTextarea.value = preservedInputs.noteText;
  }

  // notes save on blur (capture phase — blur does not bubble)
  root.addEventListener("blur", function (event) {
    if (event.target && event.target.id === "sc-notes") saveOrderNote(event.target.value);
  }, true);
```

- [ ] **Step 2: Register the blocks and extend `route()`**

Add to `registry`: `DISCOUNT_CODE: DISCOUNT_CODE, ORDER_NOTES: ORDER_NOTES, TRUST_BADGES: TRUST_BADGES, PAYMENT_METHODS: PAYMENT_METHODS,`. Replace `route()` with the full action table:

```js
  function route(action, actionTarget, event) {
    switch (action) {
      case "qty": changeQty(actionTarget.dataset.line, Number(actionTarget.dataset.qty)); break;
      case "remove": changeQty(actionTarget.dataset.line, 0); break;
      case "apply-discount": {
        var discountInput = $("sc-disc-input");
        if (discountInput && discountInput.value.trim()) {
          preservedInputs.discountCode = "";
          applyDiscount(discountInput.value.trim());
        }
        break;
      }
      case "remove-discount": applyDiscount(""); break;
      case "toggle-notes": notesOpen = !notesOpen; render(); break;
      case "checkout": location.href = ctx.checkoutUrl || "/checkout"; break;
      case "close": closeDrawer(); break;
    }
  }
```

- [ ] **Step 3: Set up a discount code on the dev store**

In the dev store admin, create a basic **code discount** (e.g. `SAVE10`, 10% off) so apply/remove is testable.

- [ ] **Step 4: Verify in browser**

1. Type `SAVE10`, click Apply: one `POST /cart/update.js` `{discount:"SAVE10"}`, the chip appears, subtotal drops. Click the chip's ✕: discount removed, price restores.
2. Type half a code, then click + on a product line (forces a re-render): the typed text is still in the input (`snapshotInputs`/`restoreInputs`).
3. Enable ORDER_NOTES in `cart-spec.js` (`enabled: true`), reload: collapsed title; click → textarea opens; type, click elsewhere (blur): one `POST /cart/update.js` `{note:…}` and the drawer does NOT re-open or refetch (useless-keys guard). Reload the page: the note persists (comes back from `/cart.js`).
4. Trust badges row renders both badges; enable PAYMENT_METHODS and confirm 4 pills.
5. With `SUBTOTAL.props.showOriginalPrice: true` and a discount applied: struck-through original price beside the discounted total.

- [ ] **Step 5: Commit**

```bash
git add extensions/ai-side-cart/assets/cart.js extensions/ai-side-cart/assets/cart-spec.js
git commit -m "feat(side-cart): discount code, order notes, trust badges, payment methods"
```

---

### Task 9: Variant selector — lazy product fetch + one-request swap

**Files:**
- Modify: `extensions/ai-side-cart/assets/cart.js` (fill `/* §9 variant selector */`; REPLACE Task 3's `variantHtml`; add a `change` listener)

**Interfaces:**
- Consumes: `esc`, `ctx`, `_fetch`, `cart`, `pausedWrite`, `setCart`, `refreshCart`, `render` from earlier tasks.
- Produces: `productCache` (Map: handle → `{status:"pending"|"ok"|"error", data?}`); `ensureProductLoaded(handle)`; `swapVariant(oldVariantId, newVariantId, lineQuantity)`; replacement `variantHtml(item, blockProps)` that upgrades the static label to a `<select data-action="variant">` once product data arrives. Gift lines never get a selector; fetch failure keeps the static label forever (degrade the block, never the cart).

- [ ] **Step 1: Insert at `/* §9 variant selector */`** and DELETE Task 3's `variantHtml`:

```js
  /* §9 variant selector — lazy per-handle product data, single-request swap */
  var productCache = new Map();   // handle → {status, data}

  function ensureProductLoaded(productHandle) {
    if (!productHandle || productCache.has(productHandle)) return;
    productCache.set(productHandle, { status: "pending" });
    _fetch(ctx.root + "products/" + productHandle + ".js", { headers: { "X-Side-Cart": "1" } })
      .then(function (response) {
        if (!response.ok) throw new Error("product fetch " + response.status);
        return response.json();
      })
      .then(function (productData) {
        productCache.set(productHandle, { status: "ok", data: productData });
        render();   // upgrade the static label to a live select
      })
      .catch(function () {
        productCache.set(productHandle, { status: "error" });  // static label stays
      });
  }

  function variantHtml(item, blockProps) {
    if (!blockProps.showVariantSelector || !item.variant_title) return "";
    var isGiftLine = item.properties && item.properties._sc_gift;
    var staticLabel = '<span class="sc-variant">' + esc(item.variant_title) + "</span>";
    if (isGiftLine) return staticLabel;
    var cached = productCache.get(item.handle);
    if (!cached) { ensureProductLoaded(item.handle); return staticLabel; }
    if (cached.status !== "ok" || !Array.isArray(cached.data.variants) ||
        cached.data.variants.length < 2) return staticLabel;
    var options = cached.data.variants.map(function (variant) {
      return '<option value="' + variant.id + '"' +
        (variant.id === item.variant_id ? " selected" : "") +
        (variant.available ? "" : " disabled") + ">" + esc(variant.title) + "</option>";
    }).join("");
    return '<select class="sc-variant-select" data-action="variant" ' +
      'data-old-variant="' + item.variant_id + '" data-line-qty="' + item.quantity + '">' +
      options + "</select>";
  }

  function swapVariant(oldVariantId, newVariantId, lineQuantity) {
    if (!oldVariantId || !newVariantId || oldVariantId === newVariantId) return Promise.resolve();
    var updates = {};
    updates[oldVariantId] = 0;
    updates[newVariantId] = lineQuantity;
    return pausedWrite("cart/update.js", { updates: updates })
      .then(function (nextCart) { nextCart ? setCart(nextCart) : refreshCart(); });
  }

  // <select> fires "change", not "click" — a second delegated listener on the same root
  root.addEventListener("change", function (event) {
    var selectEl = event.target.closest('[data-action="variant"]');
    if (!selectEl) return;
    swapVariant(
      Number(selectEl.dataset.oldVariant),
      Number(selectEl.value),
      Number(selectEl.dataset.lineQty)
    );
  });
```

- [ ] **Step 2: Verify in browser**

1. Add a multi-variant product (Dawn's demo products have sizes/colors). Open the drawer: the line briefly shows the static variant label, then upgrades to a dropdown (one `GET /products/{handle}.js` in the Network tab — and only one, even after further re-renders).
2. Change the variant: exactly one `POST /cart/update.js` with `{updates:{old:0,new:qty}}`; the line swaps, quantity preserved, subtotal updates; no interception loop.
3. A single-variant product shows the plain label (no pointless dropdown, `variants.length < 2`).
4. Sold-out variants appear disabled in the dropdown.
5. Block a product request via DevTools request blocking, reload: the line keeps its static label, everything else works.
6. The free-gift line (cross the threshold first) shows a static label, never a selector.

- [ ] **Step 3: Full-loop regression sweep (final gate)**

Run through the complete demo: PDP add → drawer auto-opens with item-added event → qty/remove → progress bar advances → gift auto-adds with FREE badge → timer ticking → apply/remove discount → note persists → variant swap → header bubble correct throughout → Checkout lands on `/checkout` with the right contents. Console stays clean the entire time.

- [ ] **Step 4: Commit**

```bash
git add extensions/ai-side-cart/assets/cart.js
git commit -m "feat(side-cart): in-cart variant selector with lazy product data"
```

---

## Deferred (explicitly out of scope, from the spec)

- §4.3 ATC form handling for full-page-reload themes — behind a per-theme flag, not needed on Dawn.
- Remote-loaded selector configs for count-sync/native-drawer lists — hackathon ships them inline.
- Admin editor + metafield publishing — separate spec; the `#sc-spec` path already works when the metafield appears.
