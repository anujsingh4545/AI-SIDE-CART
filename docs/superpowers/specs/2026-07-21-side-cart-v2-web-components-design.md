# Side Cart v2 — Web-Component Architecture (custom elements + store + morph)

**Date:** 2026-07-21
**Status:** Approved design. Supersedes the rendering architecture of
`2026-07-20-side-cart-storefront-design.md`; preserves its DETECT layer contracts verbatim.
**Why:** v1 (`cart.js`, ~1,170 lines, one IIFE) works but is one giant file, rebuilds the whole
drawer's `innerHTML` on every cart change (the root cause of the input-focus / animation /
spinner bugs we patched individually), is not Shopify-idiomatic, and adding a block touches
three places. v2 is built for production: modular, Shopify-conventional (custom elements,
morph-based updates like Dawn's section rendering), and extensible under SOLID.

**Constraints carried over from v1 (unchanged):**
- One asset file `cart.js` (classic script, no build step), one `cart.css`, `cart-spec.js`
  fallback, app embed block injecting `#sc-spec` / `#sc-ctx`.
- Outer **shadow root** on `#sc-root` (theme CSS isolation), `:host` guards, the `div:empty`
  sentinel + `display:block!important` fix, critical inline CSS for flicker-free load.
- Drawer width `min(100vw, 525px)`. `let`/`const` only. `esc()` everything. Money in cents,
  `unlockAt` authored in major units (×100 in `ruleThreshold`).
- The DETECT invariants (§E below) are ported **verbatim in logic** — same algorithm, new
  packaging. Every bug fixed in v1 must still pass (regression list §H).

---

## A. Layered architecture (one file, six units, top→bottom)

```
cart.js
├── 1. utils        esc, money/groupThousands, cookies, numericIdFromGid, fill/tvars
├── 2. morph        morph(el, html) — in-place DOM reconciliation (~80 lines)
├── 3. store        SideCartStore — single source of truth, EventTarget
├── 4. blocks       SideCartBlock base class + one subclass per block type + registry
├── 5. detect       CartInterceptor, CartMutationObserverNet, NativeCartSuppressor,
│                   CartIconClicks  (v1 logic verbatim)
└── 6. boot         read spec/ctx → shadow → skeleton → mount blocks → start detect
```

Dependency rule (SOLID-D): each unit depends only on units above it. Blocks depend on the
store's public API and morph; they never touch the network, the interceptor, or each other.

## B. SideCartStore — single source of truth (SRP)

`class SideCartStore extends EventTarget`, one instance created at boot.

```js
store.cart                 // last known cart (read-only by convention)
store.spec, store.ctx      // parsed config
store.busy                 // pausedWriteDepth > 0 (drives sc-busy UI)
store.refresh()            // GET {root}cart.js (X-Side-Cart, retries, 204 fallback) → setCart
store.setCart(cart)        // stash __sideCartLast, run engines, dispatchEvent('sc:update')
store.write(path, body)    // THE only cart-mutation path (v1 pausedWrite verbatim:
                           //   depth++, lastOwnWriteAt, X-Side-Cart, .catch(null).finally(depth--))
                           //   also dispatches 'sc:busy' on depth 0↔1 transitions
```

Events on the store: `sc:update` (cart replaced), `sc:busy` (write in flight / settled).
Engines that must run on every cart change — **free-gift** and **count-sync** — run inside
`setCart` (exact v1 logic: `_sc_gift` property, re-entry guard, `ruleThreshold`,
COUNT_SYNC_TARGETS config). Public surface unchanged: `window.SideCart = { root, open, close,
refresh }` plus document events `side-cart:open/close/updated/item-added`.

**Blocks mutate the cart only via `store.write`** — interceptor suppression, busy state, and
the PO-net own-write timestamp stay centralized (SRP + DIP: blocks depend on the store
abstraction, not on fetch).

## C. morph(rootEl, newHtml) — Shopify-style in-place updates

Dependency-free reconciliation, the v2 answer to v1's full `innerHTML` swaps:

- Parse `newHtml` into a detached tree; walk old/new children pairwise.
- Match by `data-key` when present (line items key on `item.key`), else by tag name + index.
- Same node: sync attributes (add/update/remove), recurse into children; replace only on
  tag mismatch; append/remove tail nodes.
- **Input protection:** for the active (focused) element, never overwrite `value` /
  `checked` / selection; for other inputs, set the property (not just the attribute).
- Because unchanged nodes are preserved, CSS transitions (progress fill), spinners
  (`sc-loading`), and focus survive every update with **no special-case code** — this
  structurally deletes v1's `snapshotInputs/restoreInputs`, `lastFillPercent` double-rAF,
  and per-control state juggling. (The fill still animates: morph updates the width
  attribute on the *existing* element, so the CSS transition fires naturally.)

## D. Blocks — custom elements (OCP: add a block = add a class + a registry line)

```js
class SideCartBlock extends HTMLElement {
  // set by createBlock(): this.store, this.config ({enabled, props, style})
  connectedCallback()    // applies styleVars(config.style) to itself, subscribes to
                         // 'sc:update' + 'sc:busy', first render, then this.mounted()
  disconnectedCallback() // unsubscribe, this.unmounted()
  update()               // morph(this, this.template(this.store.cart))
  template(cart)         // ABSTRACT — pure, esc-safe HTML string (readable, like v1)
  mounted() {} unmounted() {}   // optional one-time wiring (timers, lazy fetches)
}
```

One subclass per spec type, registered once:

| Spec type | Element | Notes beyond template() |
|---|---|---|
| TOP_BAR | `<sc-top-bar>` | close button click |
| TIMER | `<sc-timer>` | owns cookie + 1s interval in mounted()/unmounted(); v1 timer logic (reset-on-add via sc:update, clear-on-expiry, renders "" past deadline) |
| PROGRESS_BAR | `<sc-progress-bar>` | even markers `(i+1)/N`, segmentedFillPercent, last marker right-aligned, unlock-flash state local to the element |
| PRODUCTS_IN_CART | `<sc-products>` | lines keyed `data-key=item.key`; qty input/stepper, trash, lazy variant selector (productCache + swapVariant-with-merge, verbatim); empty state (bag icon, flex-centered) |
| DISCOUNT_CODE | `<sc-discount-code>` | apply/remove via store.write({discount}); input survives via morph |
| ORDER_NOTES | `<sc-order-notes>` | open/closed state local; save note on blur |
| SUBTOTAL | `<sc-subtotal>` | collectDiscounts() (cart-level + line-level) rows + total |
| CHECKOUT_BUTTON | `<sc-checkout-button>` | navigates ctx.checkoutUrl; disabled+dimmed on sc:busy; continue-shopping |
| TRUST_BADGES | `<sc-trust-badges>` | cosmetic |
| PAYMENT_METHODS | `<sc-payment-methods>` | cosmetic |

Registry maps spec TYPE → tag name: `BLOCK_ELEMENTS = { TOP_BAR: "sc-top-bar", ... }`.
`createBlock(type, config, store)` instantiates, assigns deps, returns the element. Unknown
type → `null` (fail-closed, as v1). A throwing `template()` is caught by the base class →
block renders empty; never breaks the drawer (LSP: every subclass honors the same contract).

**Interactions are component-local** (each element wires listeners on itself in the base
`connectedCallback` via a small `this.actions = { "qty": fn, ... }` map the subclass
declares — delegated *within* the element, so morph never re-binds anything). The v1
whitelisted `data-action` attribute convention is kept for markup.

**Empty-cart mode:** boot/store toggles `sc-empty-cart` on the host; blocks other than
TOP_BAR and PRODUCTS_IN_CART render `""` from their template when `cart.item_count === 0`
(base class handles this via a `showsWhenEmpty` static flag — OCP, no core edits per block).

## E. Detect layer — v1 logic verbatim, repackaged (classes, same contracts)

- `CartInterceptor` — patches fetch/XHR. **Contract unchanged:** `_fetch` saved before
  patching; real request ALWAYS runs and its exact promise is returned; reactions are
  try/caught; ENDPOINT_MATCHERS/PREDICATES/NON_CART_BODY_KEYS/INTERCEPT_GUARDS configs;
  add-response diff → `side-cart:item-added`; then `store.refresh()`.
- `CartMutationObserverNet` — PerformanceObserver safety net with `lastOwnWriteAt` /
  `lastCartReactionAt` timestamps (catches adds that bypass the patch).
- `NativeCartSuppressor` — 3 layers (CSS hide with `:not(#side-cart)`, JS close incl.
  close-button clicks, MutationObserver keep-shut).
- `CartIconClicks` — capture-phase document listener, CART_LINK_SELECTORS, ignores #sc-root.

All selector/endpoint/guard lists remain **data-driven configs** (OCP: new themes/apps are
entries, not logic edits).

## F. Boot sequence (order is load-bearing, runs at end of file)

1. Parse `#sc-spec` → fallback `window.__SC_SPEC__`; parse `#sc-ctx`; missing → silent no-op.
2. Shadow root on `#sc-root` (+ sentinel child, critical inline CSS, stylesheet link).
3. `customElements.define()` all blocks (guarded against double-define).
4. Build skeleton (`#sc-overlay`, `#side-cart` with header/body/footer as grid regions) and
   mount enabled blocks per region in spec order via `createBlock`.
5. Instantiate store engines config; start `CartInterceptor`, PO net, suppressor, icon clicks.
6. `store.refresh()` — first paint.

Open/close: unchanged (host `.sc-open`, `:host(.sc-open)` CSS, ESC, overlay click).

## G. SOLID + patterns summary (applied, not decorative)

- **S**RP: store = state+network; morph = reconciliation; each element = one block; each
  detect class = one detection concern.
- **O**CP: new block = subclass + registry entry; new theme selectors/endpoints/guards = data.
- **L**SP: every block honors the `template()/mounted()` contract; base class enforces
  fail-closed rendering.
- **I**SP: blocks see only `{cart, spec, ctx, write, busy}`; detect classes see only
  `store.refresh` + document events.
- **D**IP: blocks depend on the store abstraction; store depends on `_fetch`, not on the
  patched global.
- Patterns used where they earn their keep: **Observer** (store events), **Template Method**
  (SideCartBlock base), **Registry/Factory** (`BLOCK_ELEMENTS` + `createBlock`), **Facade**
  (`window.SideCart`), **Strategy-as-data** (guards, predicates, count-sync appliers).
  No pattern is introduced without a current consumer (YAGNI).

## H. Regression checklist (every v1 fix must still pass before v2 is done)

1. Add-to-cart from theme (fetch captured pre-patch) opens drawer — PO net.
2. No interception loop: our writes triple-vetoed (X-Side-Cart, busy depth, `_fetch` direct).
3. `div:empty` themes: host visible (sentinel + `display:block!important`).
4. No load flicker (critical CSS first paint, drawer off-screen, no transition).
5. Boot order: no config read before assignment (all classes defined before boot runs).
6. Variant swap merges into existing target line (Navy→Black ⇒ Black 2).
7. Single-variant products: no variant label/picker.
8. Discounts shown in BOTH places (line pill % + footer rows, cart-level + line-level).
9. Progress: even markers any rule count, dollar `unlockAt` (×100), segmented fill,
   smooth fill animation, last marker right-aligned.
10. Qty: editable center input commits on blur/Enter; spinners on qty/remove; checkout+apply
    dimmed while busy; typed discount text survives updates (now via morph, not patches).
11. Empty state vertically centered below header; functional blocks hidden.
12. Timer copy/behavior; count-sync bubble; note save doesn't reopen drawer.
13. Continue-shopping visible (own color); money comma-grouped; title hyperlinked.

Verification stays as in v1: harness for fast iteration + the live dev store for
end-to-end (interception, PO net, suppression can only be trusted live).

## I. Migration

Single PR replacing `cart.js` content (same asset name — embed block, cart.css,
cart-spec.js untouched). v1 is preserved by git history; no feature flags. The regression
checklist (§H) gates completion.

## J. Explicitly out of scope

Upsell/recommendations block, shipping-protection toggle, ES-module split, per-block shadow
roots, any admin/editor work. The spec JSON contract is unchanged — v1 specs render
identically on v2.
