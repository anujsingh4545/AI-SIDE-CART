# Side Cart — Storefront Runtime Design (hackathon edition)

**Date:** 2026-07-20
**Scope:** the storefront runtime only — `cart.js`, `cart.css`, and the app embed
block inside `extensions/ai-side-cart/`. The admin editor and any AI features are
separate future specs. No calls to our own server; no framework; no build step.

One sentence to keep in mind throughout:

> **Detect a change → fetch the real cart → render the spec against it.**

---

## 1. What ships

```
extensions/ai-side-cart/
├── blocks/side-cart.liquid     app embed block (target: body) — injects data, mounts JS
├── assets/cart-spec.js         hackathon spec → window.__SC_SPEC__  (temporary, see §2)
├── assets/cart.js              the entire runtime
└── assets/cart.css             static styles, 100% CSS-variable driven
```

The template example files (`blocks/star_rating.liquid`, `snippets/stars.liquid`,
`assets/thumbs-up.png`) are deleted.

### side-cart.liquid — injects data, mounts, nothing else

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

{% schema %}{ "name": "Side Cart", "target": "body", "settings": [] }{% endschema %}
```

- **`#sc-spec`** — the merchant's cart design from the app metafield (production path).
- **`#sc-ctx`** — runtime facts Liquid knows and JS shouldn't guess: locale/market-aware
  routes root (e.g. `/en-gb/`), money format, currency, checkout URL. Always emitted.

The design arrives inline with the page — there is never a request to our server to
render the cart. If our server is down, live carts keep working.

## 2. Spec resolution (hackathon decision)

`boot()` resolves the spec in this order:

1. Parse `#sc-spec` (metafield path). If present and valid JSON → use it.
2. Else fall back to `window.__SC_SPEC__`, defined by `assets/cart-spec.js`.
3. Else: silent no-op — nothing renders, the theme's own cart is untouched.

`cart-spec.js` is a plain script (no ES modules — assets load as classic scripts) that
assigns the full hackathon spec (Appendix A) to `window.__SC_SPEC__`. When the admin
editor exists and publishes to the metafield, `cart-spec.js` is deleted and nothing
else changes.

## 3. The mental model — one loop

```
        ┌──────────────────────────────────────────────────────────┐
        │                                                          │
   (§4) DETECT ─────► (§5) FETCH /cart.js ─────► (§6) RENDER ──────┘
   intercept add        cart = source of truth      spec → HTML
   /change/update        (+ diff add response
   /clear                 for item-added event)
        ▲                                              │
        │                                              ▼
        └────────────── (§7) INTERACT ◄────────  user clicks a
             our own write to /cart/*.js          [data-action]
```

1. **We never track cart state ourselves.** `/cart.js` is the single source of truth;
   every render is built from a fresh copy. No optimistic updates, no drift.
2. **Detection and rendering are decoupled.** Anything that changes the cart — our
   drawer, a PDP button, a third-party upsell app — flows through the same loop.
3. **The spec only describes layout.** `cart.js` never hardcodes which blocks exist.

## 4. DETECT — how we know the cart changed

Two independent detectors doing two different jobs:

| Detector | Watches | Purpose |
|---|---|---|
| **Network detector** (request interception) | cart-mutation requests + responses | catch adds/changes from anywhere |
| **Click detector** (selectors) | the theme's cart icon | open our drawer instead of `/cart` |

### 4.1 Network detector — fetch/XHR interception (LOCKED)

> **DECISION LOCKED: interception, not PerformanceObserver.** Interception exposes the
> `/cart/add.js` response body, which is what lets us know exactly what and how many
> were added (for the `item-added` event). PerformanceObserver only exposes URLs.
> Any residual "PerformanceObserver" wording in earlier drafts is stale — interception
> is the mechanism everywhere, and `suppressDetection()` means setting
> `interceptorPaused` around our own writes.

We wrap `window.fetch` and `window.XMLHttpRequest`; the real request always runs
untouched and we *react* to the response. The four endpoints: `POST
/cart/add|change|update|clear` (`.js` optional; query strings and locale/market
prefixes like `/en-gb/cart/add.js` tolerated). Cart contents still always come from a
fresh `GET /cart.js` — the intercepted response is used only to compute *what changed*.

**Pipeline for every request:**

```
patched fetch/XHR → build requestInfo {url, body, method, headers}
  → evaluate(requestInfo):
       · method must be POST
       · classify: match endpoint (ENDPOINTS regexes) + parseBody
       · PREDICATES[endpoint](info): is this a REAL change?
  → shouldIntercept = isInteresting
                   && !isOurRequest(headers)   // our writes carry X-Side-Cart
                   && !interceptorPaused        // set while WE mutate from the drawer
                   && !urlHasIgnore(url)        // side_cart_ignore=true opt-out
                   && !urlHasOcu(url)           // other apps' ocu param opt-out
  → if shouldIntercept: run REAL request → handlePostRequest(response.clone())
    else:               passthrough, untouched
```

**Endpoint classification.** `parseBody` reads JSON / urlencoded / multipart (and
`ReadableStream` via `new Response(stream)`) and computes `hasOnlyUselessKeys` — true
when the body touches only non-cart keys (`note`, `sections`, `attributes`, `discount`,
`currency`). `PREDICATES`: **add** interesting if body has non-empty `items` or a
top-level `id`; **update** unless `updates` is empty or only-useless-keys; **change**
unless only-useless-keys; **clear** always.

**Guards (every one load-bearing):**

| Guard | Stops |
|---|---|
| `isOurRequest(headers)` | our own `/cart.js` + writes re-entering → infinite loop. Mandatory. |
| `interceptorPaused` | our drawer's programmatic writes self-triggering |
| `urlHasIgnore` | explicit `side_cart_ignore=true` opt-out |
| `urlHasOcu` | other cart/upsell apps' `ocu`-tagged requests |
| `urlNeverOpens` | `opens_cart=never` → still refresh, but don't auto-open |

**Interceptor contract (fetch AND xhr):** run the real request unconditionally; only
the reaction is conditional; any thrown error degrades to an untouched request (whole
body in try/catch, fall back to the saved original `_fetch = window.fetch.bind(window)`).
Never block or alter an outgoing request.

**handlePostRequest — open + diff + refetch:**

1. `!response.ok` → return.
2. If `!neverOpen` and not on `/cart` page → `openDrawer()` (also closes native drawer, §4.4).
3. DIFF (add only): normalise the response to an item list (single item ·
   `{items:[...]}` · array); for each, find the matching line in `window.__sideCartLast`
   by `variant_id`; `quantityAdded = item.quantity − previousQty`; if > 0 → dispatch
   `side-cart:item-added` `{item, quantityAdded}`.
4. `await refreshCart()` — `GET /cart.js` → render → stash `__sideCartLast` for the
   next diff.

`refreshCart` MUST send `X-Side-Cart: 1` (so `isOurRequest` skips it),
`Cache-Control: no-cache`, and MUST set `window.__sideCartLast = cart` on every call.
Only `add` yields a readable "what was added"; change/update/clear are covered by the
refetch.

**Invariants:** (1) the real request always runs; (2) the own-request guard is
mandatory; (3) `__sideCartLast` is set on every refresh; (4) reactions never throw into
theme code; (5) nothing here touches `/checkout`; (6) `interceptorPaused` wraps
drawer-driven writes.

### 4.2 Click detector — cart-icon selectors

One delegated capture-phase listener on `document`; a click matching a cart-icon
selector prevents navigation and opens our drawer. Clicks inside `#sc-root` are ignored.

```js
const CART_LINK_SEL =
  'a[href$="/cart"], a[href*="/cart?"], a[href*="/cart#"], #cart-icon-bubble, ' +
  '.header__icon--cart, [data-cart-icon], [data-drawer-toggle="cart"]';
```

The list is permanently extendable — new themes add entries.

### 4.3 (Optional) ATC form handling — reload-y themes only

Only for themes that full-page-reload on add: intercept `submit` on
`form[action$="/cart/add"]`, `suppressDetection()`, POST the FormData to
`{root}cart/add.js`, then `openDrawer()`. Behind a per-theme flag; never universal.
Not needed for Dawn — out of hackathon scope unless the demo theme requires it.

### 4.4 Disable the theme's native cart drawer

Three layers, called once at boot as `disableNativeCart()`:

1. **Hide (CSS, always).** One injected `<style>` force-hides known native selectors
   (`cart-drawer`, `cart-notification`, `#CartDrawer`, `.mini-cart`, `#slidecart`, …),
   each guarded with `:not(#side-cart)`.
2. **Close (JS).** A per-selector closer list calls each drawer's real close path
   (`el.close()`, remove `is-open`, click `.drawer__close`, …) and strips body
   scroll-lock classes (`overflow-hidden`, `js-drawer-open`, `t4s-lock-scroll`, …).
3. **Keep shut.** A `MutationObserver` on those elements watches
   `open`/`aria-hidden`/`class` and re-closes anything that re-opens itself.

Both lists are permanently extendable.

## 5. FETCH — the real cart

```
onCartMutation() → getCart() → setCart(cart) → render()
```

- `getCart()`: `GET {root}cart.js` with `Cache-Control: no-cache` and `X-Side-Cart: 1`.
  Retry ≤ 3× on network error / 5xx with small backoff. A `204` falls back to an empty
  `POST {root}cart/update.js`.
- Cart contents come only from `/cart.js` — never scraped from theme DOM.
- `setCart(cart)` stores it, runs the free-gift check (§8), re-renders, and syncs the
  theme's count bubble. Prices are cents; format via `#sc-ctx.moneyFormat`.

## 6. RENDER — spec → HTML

### 6.1 Spec shape

```js
spec = {
  general: { bgColor, textColor, accentColor, accentTextColor, radius },
  header:  { TOP_BAR, TIMER, PROGRESS_BAR },
  body:    { PRODUCTS_IN_CART },
  footer:  { style, DISCOUNT_CODE, ORDER_NOTES, SUBTOTAL,
             CHECKOUT_BUTTON, TRUST_BADGES, PAYMENT_METHODS },
}
// every block: { enabled, props:{settings}, style?:{looks} }
// UPPERCASE keys are block types · a region's lowercase "style" = region-level looks
```

The full hackathon spec with every prop/style key is Appendix A — it is the contract
the renderer implements.

### 6.2 The registry

One object mapping each UPPERCASE type to a pure function `(block) => htmlString`.
The contract:

1. **Pure.** Reads `block.props`, `block.style`, the current `cart`. No `document.*`,
   no listeners, no fetch, no await.
2. **Interactivity via attributes only.** Blocks render `data-action="…"`; §7 owns all
   behavior.
3. **Fail-closed.** Dispatch is `registry[type]?.(block) ?? ""` wrapped in try/catch.
   Unknown type → nothing. A throwing block → nothing. A broken block never breaks
   the cart.

Adding a block type = adding one registry function.

### 6.3 Render pipeline

Full re-render on every cart change (Shopify returns the whole cart; a few-hundred-node
drawer is fast):

```js
function render() {
  applyTokens();                                   // general → CSS vars on #sc-root
  for (const region of ["header", "body", "footer"]) {
    const host = document.getElementById("sc-" + region);
    if (spec[region].style) applyStyle(host, spec[region].style);
    host.innerHTML = Object.entries(spec[region])
      .filter(([k, b]) => k !== "style" && b.enabled && registry[k])
      .map(([k, b]) => wrap(k, b, safe(registry[k], b)))
      .join("");
  }
  restoreInputs();          // discount/notes fields keep typed values across re-render
  syncCartCount(cart.item_count);
}
```

### 6.4 Styling — CSS variables only

`cart.css` is static, no merchant colors; every value reads `var(--sc-*)`.

- `general` → variables on `#sc-root` (drawer-wide defaults).
- `block.style` → variables inline on that block's wrapper, shadowing the globals for
  that block only. Browser inheritance does the cascade.

One small map converts spec style keys to variable names (`bgColor→--sc-bg`,
`barColor→--sc-accent`, `imageSize→--sc-img`, …). One static stylesheet, zero
generated CSS.

### 6.5 Block behaviors (props → HTML)

- **TOP_BAR** — title + optional `• {count}` + ✕ (`data-action="close"`).
- **TIMER** — `props.title` with `{{timer}}` in a `[data-sc-timer]` span so the 1 s
  tick updates just that span. Renders `""` past expiry.
- **PROGRESS_BAR** — one message line in one of three modes (default / just-unlocked /
  all-unlocked), a fill bar (`total ÷ lastRule.unlockAt`), one milestone marker per
  rule. **Rules of type `DISCOUNT` and `FREE_SHIPPING` are display-only** — messaging
  and milestones; the actual money is a Shopify automatic discount configured by the
  merchant. Only `FREE_GIFT` triggers cart writes (§8).
- **PRODUCTS_IN_CART** — maps `cart.items`: image (`style.imageSize`), title, variant
  UI (§6.6), qty stepper (`data-action="qty"`), price, remove (`data-action="remove"`).
  Lines with the `_sc_gift` property show a FREE badge and no controls. Empty cart →
  `props.emptyText`.
- **DISCOUNT_CODE** — input + apply (`data-action="apply-discount"`); applied codes
  (from the cart's `discount_codes`) render as removable chips
  (`data-action="remove-discount"`).
- **ORDER_NOTES** — collapsible title (`data-action="toggle-notes"`) + textarea saved
  on blur (`data-action="save-note"` → `POST cart/update.js {note}` — a useless-keys
  body, so the interceptor correctly ignores it).
- **SUBTOTAL** — label + total; optional struck-through original when discounted.
- **CHECKOUT_BUTTON** — `data-action="checkout"`; title binds `{{cart_total}}`.
- **TRUST_BADGES** — centered row of `props.badges[].title` (emoji lives in the title).
- **PAYMENT_METHODS** — `props.icons` as small pills (cosmetic).

Template variables — `{{cart_total}} {{count}} {{timer}} {{needed}} {{next}}
{{unlocked}}` — are computed live from the cart and progress rules; unknown vars render
`—`; every string is HTML-escaped before substitution.

### 6.6 Variant selector (session decision: full dropdown)

`PRODUCTS_IN_CART.props.showVariantSelector: true` renders a real selector:

- **Lazy product data.** On first render of a line, show the static
  `item.variant_title`; kick off `GET {root}products/{handle}.js`, cached per handle in
  a `Map`. When it resolves, the next render upgrades the line to a
  `<select data-action="variant" data-line-variant="{id}">` listing the product's
  variants (sold-out ones `disabled`). Each product fetches at most once per page life.
- **Swap.** On `change` (the delegated listener handles `change` as well as `click`):
  `suppressDetection()` → one `POST {root}cart/update.js`
  `{updates: {[oldVariantId]: 0, [newVariantId]: lineQty}}` → refetch. One request,
  no intermediate render.
- **Degradation.** Product fetch fails → line keeps the static label. Gift lines
  (`_sc_gift`) never get a selector.

## 7. INTERACT — clicks back into cart changes

All behavior in one delegated listener on `#sc-root` routing on `data-action` (plus a
`change` handler for the variant selector, a `blur` handler for notes, ESC to close):

```js
case "qty":             suppressDetection(); changeQty(line, qty);   break;
case "remove":          suppressDetection(); changeQty(line, 0);     break;
case "variant":         suppressDetection(); swapVariant(oldId, newId, qty); break;
case "apply-discount":  applyDiscount(readInput("sc-disc-input"));   break;
case "remove-discount": applyDiscount("");                           break;
case "toggle-notes":    notesOpen = !notesOpen; render();            break;
case "checkout":        location.href = ctx.checkoutUrl;             break;
case "close":           closeDrawer();                               break;
```

Delegation survives every `innerHTML` replacement and is the security choke point —
blocks can only *request* whitelisted actions. Every cart-writing action calls
`suppressDetection()` first so our own write doesn't bounce back through DETECT.

**Discount codes (session decision):** `applyDiscount(code)` = `POST
{root}cart/update.js` with `{discount: code}` (empty string removes), `X-Side-Cart`
header, then refetch. No `/discount/{code}` redirect tricks.

## 8. The engines

**Timer.** Per-visitor deadline in a first-party cookie (`_sc_timer_end`), never on any
server. One `setInterval(1s)` updates the `[data-sc-timer]` span.
`resetTimerProductAddedToCart` re-stamps the cookie when the item count grows;
`removeCartItemsTimerEnds` clears the cart at zero. One interval for the whole app;
no-op when the timer block is disabled.

**Free-gift.** Runs inside `setCart`, before render. For each `FREE_GIFT` rule: if the
cart crossed `unlockAt` and the gift isn't present, add it (`/cart/add.js` with a
`_sc_gift` line property, under `suppressDetection()`); if it dropped below and it's
present, remove it. A re-entry guard prevents loops. **The spec stores GIDs
(`gid://shopify/ProductVariant/123…`); the engine parses the numeric tail for the AJAX
call.** The gift's price is made free by a Shopify automatic discount — JS adds the
item, Shopify prices it; money is never client-side.

**Count-sync.** After every render, update the theme's own header count bubble via a
selector config, each entry `{ selector, type, attribute?, showClass? }`:

```
text      → el.textContent = count (+ unhide)      e.g. #CartCount
attribute → el.setAttribute(attr, count)           e.g. [data-cart-count]
toggle    → el.classList.toggle(showClass, count>0) e.g. Dawn's .cart-count-bubble
```

## 9. Cross-cutting rules

**Security.** `esc()` every string from the spec or Shopify before it enters HTML;
template substitution escapes first, fills after. No `eval`, no dynamic script. The
fetch/XHR wrappers always run the real request and degrade to passthrough on any error.
Unknown block type → `""`. Unknown template var → `—`.

**Failure philosophy — degrade a block, never the cart; degrade the cart, never the
page.** Missing spec → silent no-op, theme cart intact. Bad JSON → silent no-op. A
registry function throws → that block renders empty. A Cart AJAX call fails → keep the
last good cart, log, next action retries. Our server down → storefront unaffected.
Nothing in the code path can touch `/checkout`.

**Performance.** One JS file, one CSS file, no web fonts, one interval, a few delegated
listeners, fixed-position drawer (no page reflow). The interceptors add one cheap guard
check per request.

**Public surface.** `window.SideCart = { open, close, refresh }`. Events on `document`:
`side-cart:open`, `side-cart:close`, `side-cart:updated`, `side-cart:item-added`.

## 10. Testing (session decision)

`shopify app dev` against a dev store running **Dawn**, app embed enabled in the theme
editor. Each build step is verified live on the storefront: interception via Dawn's PDP
add-to-cart, native-drawer suppression via Dawn's `cart-notification`/`cart-drawer`,
count-sync via `.cart-count-bubble`, discounts against a real automatic discount.

## 11. Build order

1. Shell + open/close + `cart.css` skeleton (a drawer that slides, empty). ~30 min
2. Boot (spec resolution §2) → tokens → TOP_BAR + SUBTOTAL + CHECKOUT_BUTTON. ~1 h
3. PRODUCTS_IN_CART (static variant label) + click listener (qty/remove). ~1–2 h
4. **DETECT:** fetch/XHR interception + guards + click-to-open + native-drawer
   suppression. ← **demo-ready here.** ~1–2 h
5. Count-sync. ~30 min
6. PROGRESS_BAR (3 modes + milestones) + free-gift engine. ~1–2 h
7. TIMER (cookie + interval). ~45 min
8. DISCOUNT_CODE / ORDER_NOTES / TRUST_BADGES / PAYMENT_METHODS + polish. ~1 h
9. Variant selector (lazy product fetch + swap). ~2 h

---

## Appendix A — the hackathon spec (the renderer's contract)

Ships as `assets/cart-spec.js`, assigning this object to `window.__SC_SPEC__`
(classic script, not an ES module). Money in cents. `{{vars}}`: `{{cart_total}}
{{count}} {{timer}} {{needed}} {{next}} {{unlocked}}`.

```js
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
        timeLimit: 45,                              // minutes
        title: "Cart expires in {{timer}} ⏰",
        resetTimerProductAddedToCart: true,
        removeCartItemsTimerEnds: false,
      },
      style: { text: "#6D28D9", bgColor: "#EDE4FA" },
    },
    PROGRESS_BAR: {
      enabled: true,
      props: {
        unlockedBy: "CART_TOTAL",                   // "CART_TOTAL" | "QUANTITY"
        // ONE message line, THREE modes — exactly one shown at a time:
        //   defaultText     → chasing next reward; {{needed}} = next.unlockAt − total,
        //                     {{next}} = first still-locked rule's label
        //   unlockedText    → brief flash when a threshold is crossed
        //   allUnlockedText → past the LAST rule
        defaultText: "Add {{needed}} to unlock {{next}}!",
        unlockedText: "🎉 {{unlocked}} unlocked!",
        allUnlockedText: "All rewards unlocked 🎉",
        // ascending by unlockAt; DISCOUNT & FREE_SHIPPING display-only (§6.5)
        rules: [
          { label: "10% off",       type: "DISCOUNT",      unlockAt: 100000 },
          { label: "Free gift",     type: "FREE_GIFT",     unlockAt: 200000,
            product: {
              productId: "gid://shopify/Product/889900",
              variantId: "gid://shopify/ProductVariant/345t43",  // numeric tail used for /cart/add.js
            } },
          { label: "Free shipping", type: "FREE_SHIPPING", unlockAt: 300000 },
        ],
        // next = rules.find(r => total < r.unlockAt)
        // !next → allUnlockedText · justCrossed → unlockedText · else defaultText
        // bar % = total / rules.at(-1).unlockAt · each rule = a milestone marker
      },
      style: { barColor: "#6D28D9", bgColor: "#EDE4FA" },
    },
  },

  body: {
    PRODUCTS_IN_CART: {
      enabled: true,
      props: {
        showVariantSelector: true,        // full dropdown, §6.6
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

## Appendix B — decisions log (this session)

| # | Decision | Choice |
|---|---|---|
| 1 | Session scope | Storefront runtime only |
| 2 | Spec source (pre-editor) | `#sc-spec` metafield if present, else bundled `cart-spec.js` → `window.__SC_SPEC__` |
| 3 | DISCOUNT / FREE_SHIPPING rules | Display-only; money via Shopify automatic discounts |
| 4 | Discount code apply | `POST cart/update.js {discount}` + refetch |
| 5 | Variant selector | Full dropdown: lazy cached `/products/{handle}.js` + one-request `update.js` swap |
| 6 | Detection mechanism | fetch/XHR interception (locked); all "PerformanceObserver" mentions in the source doc are stale |
| 7 | Test environment | `shopify app dev` + dev store on Dawn |
