# Side Cart v2 (Custom Elements + Store + Morph) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the side-cart runtime into the v2 architecture — `SideCartStore` (single source of truth), block custom elements with pure `template()` methods, Shopify-style `morph()` in-place DOM updates, and the v1 detection layer ported verbatim — per `docs/superpowers/specs/2026-07-21-side-cart-v2-web-components-design.md`.

**Architecture:** One classic-script asset, six internally-layered units (utils → morph → store → blocks → detect → boot) with strict downward dependencies. Blocks subscribe to the store's `sc:update` and morph themselves in place, which structurally eliminates the v1 re-render bugs. Detection logic (interceptor contract, guards, PO net, suppression) is copied verbatim from v1 `cart.js` into classes.

**Tech Stack:** Vanilla JS custom elements (no build step, classic script), Shadow DOM (outer root only), CSS from the existing untouched `cart.css`.

## Global Constraints

- **NO GIT COMMITS. Ever. By anyone.** The user commits personally. Every task ends at a "Checkpoint" step: stop, report status + verification evidence, and let the user commit before the next task starts. Never run `git add`/`git commit`/`git rm`. Use plain `rm`/`mv` for file operations.
- Build in a scratch asset `extensions/ai-side-cart/assets/cart-v2.js`. The live `cart.js` (v1) is NOT touched until Task 7 swaps the content. `cart.css`, `cart-spec.js`, and `blocks/side-cart.liquid` are never modified.
- One classic-script IIFE, `"use strict"`, `let`/`const` only (zero `var`), no modules/imports, no dependencies.
- `const _fetch = window.fetch.bind(window)` saved before anything; all our own requests use `_fetch` and send `X-Side-Cart: 1`.
- `esc()` every spec/Shopify string before it enters HTML; escape first, substitute after; unknown template var → `—`; unknown block type → skipped; a throwing `template()` renders that block empty (fail-closed).
- Money in cents formatted via `ctx.moneyFormat` with thousands grouping; `rule.unlockAt` authored in major units (`ruleThreshold` = ×100 for money, raw for QUANTITY).
- Outer shadow root on `#sc-root` with: unslotted sentinel `<span>` child (defeats `div:empty{display:none}`), critical inline `<style>` FIRST in the shadow (`:host{display:block!important}`, drawer `translateX(100%)` with NO transition — flicker-free load), then `<link>` to `ctx.cssUrl`.
- Drawer width `min(100vw, 525px)`. Regions `#sc-header/#sc-body/#sc-footer` keep their v1 ids and grid CSS classes so `cart.css` applies unchanged. Blocks carry classes `sc-block sc-blk-<TYPE>` on the custom element itself.
- Detection invariants (verbatim from v1): real request ALWAYS runs and its exact promise is returned; reactions never throw into theme code; only `/cart/add|change|update|clear` matched; nothing touches `/checkout` except the checkout action; guards `X-Side-Cart` header / busy depth / `side_cart_ignore` / `ocu` / `opens_cart=never`.
- Public surface unchanged: `window.SideCart = { root, open, close, refresh }`; document events `side-cart:open/close/updated/item-added`.
- SOLID: blocks depend only on the store's public API (`cart`, `write`, `refresh`, `fetchProduct`, events) and shared utils; detect classes depend on the store + an `openDrawer` callback; nothing reaches into another unit's internals.
- **Testing:** `node --check` after every edit; pure functions get throwaway node scripts (never saved/committed); DOM/behavior verified in the v2 harness at `/tmp/sc-harness-v2` (Task 1 creates it) by pasting the given snippets into the browser console (or driving them via chrome-devtools MCP). Task 7 verifies on the live dev store.

**Reference:** v1 logic lives in `extensions/ai-side-cart/assets/cart.js` (git HEAD). When a task says "verbatim from v1", open that file and copy the named function's body, adapting only identifiers named in the task.

---

## File structure

```
extensions/ai-side-cart/assets/cart-v2.js   scratch build (Tasks 1–6), single IIFE:
  §1 utils        esc, groupThousands, money, fill/tvars-free template helpers, cookies,
                  numericIdFromGid, styleVars/VAR_MAP, icons, progress helpers, collectDiscounts
  §2 morph        morph(), morphChildren(), morphNode(), syncAttributes(), syncFormState()
  §3 store        SideCartStore (refresh/setCart/write/fetchProduct + free-gift + count-sync)
  §4 blocks       SideCartBlock base, 10 subclasses, BLOCK_ELEMENTS, defineBlocks(), createBlock()
  §5 detect       CartInterceptor, CartMutationObserverNet, NativeCartSuppressor, CartIconClicks
  §6 boot         parse → shadow → skeleton → mount → wire → refresh   (runs last)
/tmp/sc-harness-v2/index.html                stubbed-Shopify harness loading cart-v2.js
extensions/ai-side-cart/assets/cart.js      REPLACED in Task 7 with cart-v2.js content
```

---

### Task 1: Scaffold, utils, morph + v2 harness

**Files:**
- Create: `extensions/ai-side-cart/assets/cart-v2.js`
- Create: `/tmp/sc-harness-v2/index.html` (+ start a static server)

**Interfaces:**
- Consumes: v1 `cart.js` for verbatim util bodies.
- Produces (used by every later task): `esc(v)`, `groupThousands(s)`, `money(cents)` (reads module `ctx`), `readJson(id)`, `styleVars(style)`, `numericIdFromGid(gid)`, cookie helpers `readTimerDeadline()/writeTimerDeadline(ms)/stampFreshDeadline(props)`, icons `TRASH_ICON/TAG_ICON/BAG_ICON`, progress helpers `progressRules(spec)/progressTotal(spec,cart)/ruleThreshold(spec,rule)/segmentedFillPercent(total,thresholds)`, discount helper `collectDiscounts(cart)`, and `morph(rootEl,newHtml)` with keyed reconciliation + form-state protection. Module-level `let spec = null; let ctx = null;` assigned by boot (Task 6); `window.__SC_TEST__` hook exposing pure fns for tests.

- [ ] **Step 1: Create `cart-v2.js` with the IIFE scaffold + §1 utils**

Open v1 `extensions/ai-side-cart/assets/cart.js` and copy the bodies of: `esc`, `groupThousands`, `money`, `readJson`, `VAR_MAP` + `styleVars`, `numericIdFromGid`, the three icons (`TRASH_ICON`, `TAG_ICON`, `BAG_ICON`), timer cookie helpers (`readTimerDeadline`, `writeTimerDeadline`, and `stampFreshDeadline` reworked to take `props`), `segmentedFillPercent`, and `collectDiscounts` — into this structure. Adapt only as shown (progress helpers take `spec`/`cart` parameters instead of module globals; `collectDiscounts` takes `cart`):

```js
/* Side Cart v2 — custom elements + SideCartStore + morph. Single classic script. */
(function () {
  "use strict";

  const _fetch = window.fetch.bind(window);   // saved BEFORE any patching (§5)

  // assigned once by boot (§6); read at call time by money()/blocks/store
  let spec = null;
  let ctx = null;

  /* ---------- §1 utils ---------- */
  // esc, groupThousands, money, readJson              ← verbatim from v1
  // VAR_MAP, styleVars                                ← verbatim from v1
  // numericIdFromGid                                  ← verbatim from v1
  // TRASH_ICON, TAG_ICON, BAG_ICON                    ← verbatim from v1
  // TIMER_COOKIE_NAME, readTimerDeadline, writeTimerDeadline  ← verbatim from v1
  function stampFreshDeadline(props) {
    writeTimerDeadline(Date.now() + (Number(props.timeLimit) || 30) * 60000);
  }

  // progress helpers — v1 logic, parameterized (no module-global spec/cart reads)
  function progressBlockOf(theSpec) {
    const block = theSpec && theSpec.header && theSpec.header.PROGRESS_BAR;
    return block && block.enabled && block.props && Array.isArray(block.props.rules) ? block : null;
  }
  function progressRules(theSpec) {
    const block = progressBlockOf(theSpec);
    if (!block) return [];
    return block.props.rules.slice().sort(function (a, b) { return a.unlockAt - b.unlockAt; });
  }
  function progressTotal(theSpec, cart) {
    const block = progressBlockOf(theSpec);
    if (!cart || !block) return 0;
    return block.props.unlockedBy === "QUANTITY" ? cart.item_count : cart.total_price;
  }
  function ruleThreshold(theSpec, rule) {
    const block = progressBlockOf(theSpec);
    const value = Number(rule.unlockAt) || 0;
    return block && block.props.unlockedBy === "QUANTITY" ? value : value * 100;
  }
  // segmentedFillPercent(total, thresholds)           ← verbatim from v1
  // collectDiscounts(cart)                            ← v1 body, `cart` as parameter

  /* ---------- §2 morph ---------- */   // Step 2
  /* ---------- §3 store ---------- */   // Task 2
  /* ---------- §4 blocks ---------- */  // Tasks 3–5
  /* ---------- §5 detect ---------- */  // Task 6
  /* ---------- §6 boot ---------- */    // Task 6

  // test hook — lets the harness/console reach pure units without polluting prod API
  window.__SC_TEST__ = { esc, money, groupThousands, styleVars, segmentedFillPercent,
    ruleThreshold: (s, r) => ruleThreshold(s, r), morph: null /* set in Step 2 */,
    setCtx: (c) => { ctx = c; }, setSpec: (s) => { spec = s; } };
})();
```

- [ ] **Step 2: Add §2 morph (complete code)**

```js
  /* ---------- §2 morph — Shopify-style in-place DOM reconciliation ---------- */
  function morph(rootEl, newHtml) {
    const template = document.createElement("template");
    template.innerHTML = newHtml;
    morphChildren(rootEl, template.content);
  }

  function nodeKey(node) {
    return node.nodeType === 1 && node.hasAttribute("data-key") ? node.getAttribute("data-key") : null;
  }

  function compatible(oldNode, newNode) {
    if (oldNode.nodeType !== newNode.nodeType) return false;
    if (oldNode.nodeType !== 1) return true;                 // text/comment: pair by position
    if (oldNode.tagName !== newNode.tagName) return false;
    return nodeKey(oldNode) === nodeKey(newNode);            // keyed only matches same key
  }

  function morphChildren(oldParent, newParent) {
    const keyedOld = new Map();
    Array.from(oldParent.children).forEach(function (el) {
      const key = nodeKey(el);
      if (key) keyedOld.set(key, el);
    });
    const newNodes = Array.from(newParent.childNodes);
    let cursor = oldParent.firstChild;
    newNodes.forEach(function (newNode) {
      const key = nodeKey(newNode);
      let match = null;
      if (key && keyedOld.has(key)) match = keyedOld.get(key);
      else if (cursor && compatible(cursor, newNode)) match = cursor;
      if (match) {
        if (match === cursor) cursor = cursor.nextSibling;
        else oldParent.insertBefore(match, cursor);          // keyed node moved into place
        morphNode(match, newNode);
      } else {
        oldParent.insertBefore(newNode, cursor);             // adopt brand-new node
      }
    });
    while (cursor) { const next = cursor.nextSibling; oldParent.removeChild(cursor); cursor = next; }
  }

  function morphNode(oldNode, newNode) {
    if (oldNode.nodeType !== 1) {
      if (oldNode.nodeValue !== newNode.nodeValue) oldNode.nodeValue = newNode.nodeValue;
      return;
    }
    syncAttributes(oldNode, newNode);
    syncFormState(oldNode, newNode);
    if (oldNode.tagName !== "TEXTAREA") morphChildren(oldNode, newNode);
  }

  function syncAttributes(oldEl, newEl) {
    Array.from(oldEl.attributes).forEach(function (attr) {
      if (!newEl.hasAttribute(attr.name)) oldEl.removeAttribute(attr.name);
    });
    Array.from(newEl.attributes).forEach(function (attr) {
      if (oldEl.getAttribute(attr.name) !== attr.value) oldEl.setAttribute(attr.name, attr.value);
    });
  }

  function isFocused(el) { return el.getRootNode().activeElement === el; }

  /* Form-state rules (regression #10 depends on these):
     - focused control: never touched (typing/selection survives every update)
     - INPUT with data-sync-value (e.g. qty): value property synced from template when unfocused
     - INPUT without it (e.g. discount code): typed value preserved even when unfocused
     - checkbox/radio: checked synced when unfocused; TEXTAREA never recursed, value only
       synced when it carries data-sync-value; SELECT value synced when unfocused */
  function syncFormState(oldEl, newEl) {
    const tag = oldEl.tagName;
    if (tag === "INPUT") {
      if (isFocused(oldEl)) return;
      if (newEl.hasAttribute("data-sync-value") && oldEl.value !== newEl.value) oldEl.value = newEl.value;
      if (oldEl.type === "checkbox" || oldEl.type === "radio") oldEl.checked = newEl.checked;
    } else if (tag === "TEXTAREA") {
      if (!isFocused(oldEl) && newEl.hasAttribute("data-sync-value")) oldEl.value = newEl.textContent;
    } else if (tag === "SELECT") {
      if (!isFocused(oldEl) && newEl.value && oldEl.value !== newEl.value) oldEl.value = newEl.value;
    }
  }
```

Then set the test hook: `window.__SC_TEST__.morph = morph;`

- [ ] **Step 3: Verify utils with a throwaway node script (do not save it)**

Run (adjust nothing — the hook pattern makes the IIFE parse in node with a `window` stub):

```bash
cd /Users/asifmalik/workspaces/skailama_hackathon/AI-SIDE-CART
node --check extensions/ai-side-cart/assets/cart-v2.js
node -e '
global.window = {}; global.document = undefined;
try { require("./extensions/ai-side-cart/assets/cart-v2.js"); } catch (e) { /* DOM-dependent parts unused */ }
const T = global.window.__SC_TEST__;
T.setCtx({ moneyFormat: "Rs. {{amount}}" });
console.log("esc:", T.esc("<img onerror=1>") === "&lt;img onerror=1&gt;");
console.log("money:", T.money(125990) === "Rs. 1,259.90");
console.log("segFill 0 rules:", T.segmentedFillPercent(0, []) === 0);
console.log("segFill mid:", Math.round(T.segmentedFillPercent(62996, [50000, 100000, 150000, 200000])) === 31);
console.log("segFill done:", T.segmentedFillPercent(999999, [100]) === 100);
'
```

Expected: all `true`. (62996 with thresholds [50000..200000]: one full segment = 25%, plus (62996−50000)/50000 ≈ 0.26 of the next 25% ≈ 31%.)

- [ ] **Step 4: Create the v2 harness**

Write `/tmp/sc-harness-v2/index.html`:

```html
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:system-ui;background:#f6f6f8;height:100vh}</style>
<script>
(function(){
  const EMPTY = /[?&]empty=1/.test(location.search);
  let CART = EMPTY ? { item_count:0, currency:"INR", total_price:0, original_total_price:0,
      total_discount:0, cart_level_discount_applications:[], items:[], discount_codes:[], note:"" }
    : { item_count:3, currency:"INR", total_price:62996, original_total_price:125990,
      total_discount:62994, note:"",
      cart_level_discount_applications:[],
      discount_codes:[{ code:"SAVE10", applicable:true }],
      items:[
        { key:"L1", id:1, variant_id:101, product_id:11, quantity:2, handle:"snowboard",
          product_title:"The Multi-managed Snowboard", variant_title:"Navy",
          url:"/products/snowboard?variant=101", product_has_only_default_variant:false,
          original_price:62995, final_price:31498, original_line_price:125990,
          final_line_price:62996, total_discount:62994,
          line_level_discount_allocations:[{ amount:62994, discount_application:{ title:"big savings" } }],
          image:"", properties:{} },
        { key:"L2", id:2, variant_id:999, product_id:22, quantity:1, handle:"beanie",
          product_title:"Free Winter Beanie", variant_title:null,
          url:"/products/beanie", product_has_only_default_variant:true,
          original_price:0, final_price:0, original_line_price:0, final_line_price:0,
          total_discount:0, line_level_discount_allocations:[], image:"",
          properties:{ _sc_gift:"true" } }
      ] };
  const PRODUCT = { title:"The Multi-managed Snowboard", handle:"snowboard",
    variants:[{ id:101, title:"Navy", available:true }, { id:102, title:"Black", available:true },
              { id:103, title:"Olive", available:false }] };
  const real = window.fetch.bind(window);
  window.__HARNESS_CART = () => CART;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const respond = (data) => new Promise(res => setTimeout(() =>
      res(new Response(JSON.stringify(data), { status:200, headers:{ "Content-Type":"application/json" } })), 400));
    if (url.indexOf("/products/") > -1 && url.indexOf(".js") > -1) return respond(PRODUCT);
    if (url.indexOf("/cart/") > -1 || url.indexOf("/cart.js") > -1) return respond(CART);
    return real(input, init);
  };
})();
</script>
</head><body>
<script type="application/json" id="sc-ctx">{"root":"/","moneyFormat":"Rs. {{amount}}","currency":"INR","locale":"en","checkoutUrl":"/checkout","cssUrl":"cart.css"}</script>
<div id="sc-root"></div>
<script src="cart-spec.js"></script>
<script src="cart-v2.js"></script>
<script>window.addEventListener("load", () => setTimeout(() => window.SideCart && window.SideCart.open(), 400));</script>
</body></html>
```

Then copy assets and serve:

```bash
mkdir -p /tmp/sc-harness-v2
cp extensions/ai-side-cart/assets/cart.css extensions/ai-side-cart/assets/cart-spec.js extensions/ai-side-cart/assets/cart-v2.js /tmp/sc-harness-v2/
(cd /tmp/sc-harness-v2 && python3 -m http.server 8899 >/dev/null 2>&1 &)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8899/   # expect 200
```

(Re-run the `cp` line after every cart-v2.js edit in later tasks.)

- [ ] **Step 5: Verify morph in the browser harness**

Open `http://localhost:8899/` and run in the console (drawer won't render yet — that's Task 3; only the morph hook is under test):

```js
(() => {
  const m = window.__SC_TEST__.morph;
  const el = document.createElement("div");
  el.innerHTML = '<ul><li data-key="a">A <input value="x"></li><li data-key="b">B</li></ul>';
  const input = el.querySelector("input");
  input.value = "typed-by-user";
  const liA = el.querySelector('[data-key="a"]');
  m(el, '<ul><li data-key="b">B2</li><li data-key="a">A2 <input value="x"></li></ul>');
  const order = [...el.querySelectorAll("li")].map(li => li.getAttribute("data-key")).join(",");
  return {
    keyedReorderPreservesNode: el.querySelector('[data-key="a"]') === liA,   // true
    order,                                                                    // "b,a"
    textUpdated: el.querySelector('[data-key="b"]').textContent === "B2",     // true
    typedValueSurvives: el.querySelector("input").value === "typed-by-user",  // true (no data-sync-value)
  };
})()
```

Expected: `{keyedReorderPreservesNode: true, order: "b,a", textUpdated: true, typedValueSurvives: true}`.

- [ ] **Step 6: Checkpoint — STOP. Do not commit.** Report: files created, node test output, morph console output. The user reviews and commits.

---

### Task 2: SideCartStore (state, network, engines)

**Files:**
- Modify: `extensions/ai-side-cart/assets/cart-v2.js` (fill `/* ---------- §3 store ---------- */`)

**Interfaces:**
- Consumes: `_fetch`, utils (`numericIdFromGid`, `progressRules`, `progressTotal`, `ruleThreshold`), module `spec`/`ctx`.
- Produces (every block and detect class depends on these exact members):
  `class SideCartStore extends EventTarget` with `cart` (object|null), `spec`, `ctx`,
  `busy` (getter, bool), `lastOwnWriteAt` (number), `lastCartReactionAt` (number),
  `refresh() → Promise`, `setCart(cart) → void`, `write(path, body) → Promise<cartJson|null>`,
  `fetchProduct(handle) → Promise<productJson>` (rejects on !ok). Events dispatched on the
  store: `"sc:update"`, `"sc:busy"` (detail `{busy}`). Document event `side-cart:updated`.
  Side effects in `setCart`: `window.__sideCartLast = cart`, free-gift engine, count-sync.

- [ ] **Step 1: Write §3 (complete code — the network/engine bodies are v1 verbatim, reshaped into methods)**

Copy from v1 `cart.js`: the `getCart` retry/204 body, the `pausedWrite` body, `COUNT_SYNC_TARGETS` + `COUNT_SYNC_APPLIERS` + `syncCartCount` body, and the `checkFreeGift` body. Adapt identifiers exactly as shown:

```js
  /* ---------- §3 store — single source of truth (SRP; blocks depend only on this API) ---------- */
  class SideCartStore extends EventTarget {
    constructor(theSpec, theCtx) {
      super();
      this.spec = theSpec;
      this.ctx = theCtx;
      this.cart = null;
      this.lastOwnWriteAt = 0;       // read by the PO net (§5): "our write, ignore"
      this.lastCartReactionAt = 0;   // shared dedupe between interceptor and PO net
      this._writeDepth = 0;
      this._freeGiftBusy = false;
    }

    get busy() { return this._writeDepth > 0; }

    refresh() {
      const self = this;
      return this._getCart(0).then(function (cart) { self.setCart(cart); });
    }

    _getCart(attempt) {
      // v1 getCart() verbatim: GET {ctx.root}cart.js with X-Side-Cart + no-cache headers,
      // retry ≤3 on network error/5xx with 200ms*n backoff, 204 → empty POST cart/update.js,
      // resolve null on final failure (keep last good cart). Replace `ctx` with `this.ctx`
      // and recurse via `this._getCart(attempt + 1)`.
    }

    setCart(next) {
      if (!next) return;                       // failed fetch → keep last good cart
      this.cart = next;
      window.__sideCartLast = next;            // the interceptor's add-diff depends on this
      this._checkFreeGift();
      this._syncCartCount();
      this.dispatchEvent(new CustomEvent("sc:update"));
      document.dispatchEvent(new CustomEvent("side-cart:updated", { detail: { cart: this.cart } }));
    }

    write(path, body) {
      const self = this;
      this._writeDepth += 1;
      this.lastOwnWriteAt = Date.now();
      if (this._writeDepth === 1) this._emitBusy();
      return _fetch(this.ctx.root + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Side-Cart": "1" },
        body: JSON.stringify(body),
      }).then(function (res) { return res.ok ? res.json() : null; })
        .catch(function () { return null; })
        .finally(function () {
          self._writeDepth -= 1;
          if (self._writeDepth === 0) self._emitBusy();
        });
    }

    fetchProduct(handle) {
      return _fetch(this.ctx.root + "products/" + handle + ".js", { headers: { "X-Side-Cart": "1" } })
        .then(function (res) {
          if (!res.ok) throw new Error("product fetch " + res.status);
          return res.json();
        });
    }

    _emitBusy() {
      this.dispatchEvent(new CustomEvent("sc:busy", { detail: { busy: this.busy } }));
    }

    _checkFreeGift() {
      // v1 checkFreeGift() verbatim with these renames:
      //   freeGiftBusy → this._freeGiftBusy · cart → this.cart
      //   sortedProgressRules() → progressRules(this.spec)
      //   progressTotal() → progressTotal(this.spec, this.cart)
      //   ruleThreshold(rule) → ruleThreshold(this.spec, rule)
      //   pausedWrite(...) → this.write(...) · refreshCart() → this.refresh()
      //   setCart(nextCart) → this.setCart(nextCart)
    }

    _syncCartCount() {
      // v1 COUNT_SYNC_TARGETS + COUNT_SYNC_APPLIERS as module consts above the class,
      // v1 syncCartCount(count) body here with count = this.cart ? this.cart.item_count : 0.
    }
  }
```

Also expose for tests: `window.__SC_TEST__.SideCartStore = SideCartStore;`

- [ ] **Step 2: `node --check`, refresh harness, verify the store in the console**

```bash
node --check extensions/ai-side-cart/assets/cart-v2.js
cp extensions/ai-side-cart/assets/cart-v2.js /tmp/sc-harness-v2/
```

Open `http://localhost:8899/` and run:

```js
(async () => {
  const T = window.__SC_TEST__;
  const store = new T.SideCartStore(window.__SC_SPEC__, { root: "/", moneyFormat: "Rs. {{amount}}" });
  let updates = 0, busyEvents = [];
  store.addEventListener("sc:update", () => updates++);
  store.addEventListener("sc:busy", (e) => busyEvents.push(e.detail.busy));
  await store.refresh();
  const w = store.write("cart/change.js", { line: 1, quantity: 3 });
  const busyDuring = store.busy;
  await w;
  return {
    gotCart: !!store.cart && store.cart.item_count === 3,
    lastStashed: window.__sideCartLast === store.cart,
    updates: updates >= 1,
    busyDuring,                         // true
    busySettled: store.busy === false,  // true
    busyEvents,                         // [true, false]
    ownWriteStamped: store.lastOwnWriteAt > 0,
  };
})()
```

Expected: all true, `busyEvents` = `[true, false]`. (The harness's `?empty=1` variant and the free-gift path get their integration exercise in Tasks 5–7; the gift line in the stub cart means `_checkFreeGift` finds the gift present and no-ops — no network loop. If a loop occurs — repeated `/cart/add` in the network tab — the verbatim port of the `_freeGiftBusy` guard is wrong; fix before proceeding.)

- [ ] **Step 3: Checkpoint — STOP. Do not commit.** Report store console output; user commits.

---

### Task 3: SideCartBlock base, registry, simple blocks, boot v0

**Files:**
- Modify: `extensions/ai-side-cart/assets/cart-v2.js` (fill part of §4 + a first, detect-less §6 boot)

**Interfaces:**
- Consumes: store (Task 2), morph + utils (Task 1).
- Produces: `class SideCartBlock extends HTMLElement` — contract for ALL block subclasses:
  instance fields `store`, `config` (assigned by `createBlock` before connect); getters
  `props`; lifecycle `connectedCallback/disconnectedCallback` (subscribe/unsubscribe
  `sc:update`, apply `styleVars(config.style)` to self, wire delegated listeners, first
  render, `mounted()/unmounted()`); hooks `template(cart) → string` (pure), `beforeRender()`,
  `updated()`, `mounted()`, `unmounted()`; `get actions()` → `{ click?: {name: fn},
  change?: {...}, blur?: {...}, keydown?: {...} }` routed via `[data-action]` closest-match;
  static `showsWhenEmpty` (default false — template skipped, renders "" when
  `cart.item_count === 0`); `update()` = beforeRender → template (try/caught → "") → morph → updated.
  Plus: `BLOCK_ELEMENTS` map (TOP_BAR→sc-top-bar, TIMER→sc-timer, PROGRESS_BAR→sc-progress-bar,
  PRODUCTS_IN_CART→sc-products, DISCOUNT_CODE→sc-discount-code, ORDER_NOTES→sc-order-notes,
  SUBTOTAL→sc-subtotal, CHECKOUT_BUTTON→sc-checkout-button, TRUST_BADGES→sc-trust-badges,
  PAYMENT_METHODS→sc-payment-methods), `defineBlocks()`, `createBlock(type, config, store) →
  element|null`. Blocks request drawer close by dispatching bubbling+composed `"sc:close-request"`.
  Boot v0 produces: shadow root w/ critical CSS + skeleton (`#sc-overlay`, `#side-cart` >
  `#sc-header/#sc-body/#sc-footer`), mounted enabled blocks per region in spec order,
  `window.SideCart = { root, open, close, refresh }`, open/close on host `.sc-open`,
  document events `side-cart:open/close`, ESC + overlay close, `sc-empty-cart` and drawer
  `sc-busy` class subscriptions.

- [ ] **Step 1: Write the base class + registry (complete code)**

```js
  /* ---------- §4 blocks — Template Method base + Registry/Factory (OCP) ---------- */
  class SideCartBlock extends HTMLElement {
    static showsWhenEmpty = false;

    connectedCallback() {
      const self = this;
      this._onUpdate = function () { self.update(); };
      this.store.addEventListener("sc:update", this._onUpdate);
      if (this.config && this.config.style) this.style.cssText = styleVars(this.config.style);
      this._wire("click"); this._wire("change"); this._wire("keydown");
      this._wire("blur", true);   // blur doesn't bubble — capture phase
      this.update();
      this.mounted();
    }

    disconnectedCallback() {
      this.store.removeEventListener("sc:update", this._onUpdate);
      this.unmounted();
    }

    update() {
      let html = "";
      try {
        this.beforeRender();
        const cart = this.store.cart;
        const emptyCart = !cart || !cart.items || cart.items.length === 0;
        if (!emptyCart || this.constructor.showsWhenEmpty) html = this.template(cart) || "";
      } catch (err) { html = ""; }               // a broken block never breaks the drawer
      morph(this, html);
      this.updated();
    }

    get props() { return (this.config && this.config.props) || {}; }

    /* hooks for subclasses */
    template() { return ""; }
    beforeRender() {} updated() {} mounted() {} unmounted() {}
    get actions() { return {}; }

    _wire(kind, capture) {
      const self = this;
      this.addEventListener(kind, function (event) {
        const handlers = self.actions[kind];
        if (!handlers) return;
        const target = event.target.closest ? event.target.closest("[data-action]") : null;
        if (!target || !self.contains(target)) return;
        const fn = handlers[target.dataset.action];
        if (fn) fn.call(self, target, event);
      }, !!capture);
    }

    requestClose() {
      this.dispatchEvent(new CustomEvent("sc:close-request", { bubbles: true, composed: true }));
    }
  }

  const BLOCK_ELEMENTS = {
    TOP_BAR: "sc-top-bar", TIMER: "sc-timer", PROGRESS_BAR: "sc-progress-bar",
    PRODUCTS_IN_CART: "sc-products", DISCOUNT_CODE: "sc-discount-code",
    ORDER_NOTES: "sc-order-notes", SUBTOTAL: "sc-subtotal",
    CHECKOUT_BUTTON: "sc-checkout-button", TRUST_BADGES: "sc-trust-badges",
    PAYMENT_METHODS: "sc-payment-methods",
  };

  function defineBlocks(classes) {   // classes: { "sc-top-bar": ScTopBar, ... } built at boot
    Object.keys(classes).forEach(function (tag) {
      if (!customElements.get(tag)) customElements.define(tag, classes[tag]);
    });
  }

  function createBlock(type, config, store) {
    const tag = BLOCK_ELEMENTS[type];
    if (!tag || !customElements.get(tag)) return null;   // unknown type → fail-closed
    const el = document.createElement(tag);
    el.store = store;
    el.config = config;
    el.classList.add("sc-block", "sc-blk-" + type);
    return el;
  }
```

- [ ] **Step 2: Write the five simple blocks (complete code — templates are v1 HTML verbatim)**

The inner HTML strings are copied from v1's `TOP_BAR`, `SUBTOTAL` (+`collectDiscounts` rows), `CHECKOUT_BUTTON`, `TRUST_BADGES`, `PAYMENT_METHODS` functions — unchanged markup so `cart.css` applies as-is.

```js
  class ScTopBar extends SideCartBlock {
    static showsWhenEmpty = true;
    template(cart) {
      const count = this.props.showItemCount && cart
        ? ' <span class="sc-count">• ' + cart.item_count + "</span>" : "";
      return '<div class="sc-topbar"><span class="sc-title">' + esc(this.props.title) + count +
        '</span><button class="sc-close" data-action="close" aria-label="Close">✕</button></div>';
    }
    get actions() { return { click: { close: function () { this.requestClose(); } } }; }
  }

  class ScSubtotal extends SideCartBlock {
    template(cart) {
      if (!cart) return "";
      const discountRows = collectDiscounts(cart).map(function (d) {
        return '<div class="sc-disc-line"><span class="sc-disc-label">Discounts</span>' +
          '<span class="sc-disc-chip">' + TAG_ICON + " " + esc(d.title) + "</span>" +
          '<span class="sc-disc-amt">-' + money(d.amount) + "</span></div>";
      }).join("");
      const original = this.props.showOriginalPrice && cart.original_total_price > cart.total_price
        ? '<s class="sc-original">' + money(cart.original_total_price) + "</s>" : "";
      return '<div class="sc-summary">' + discountRows +
        '<div class="sc-subtotal"><span>' + esc(this.props.title) + "</span><span>" + original +
        '<span class="sc-discounted">' + money(cart.total_price) + "</span></span></div></div>";
    }
  }

  class ScCheckoutButton extends SideCartBlock {
    template(cart) {
      const title = esc(this.props.title || "").replace(/\{\{\s*cart_total\s*\}\}/g,
        esc(money(cart ? cart.total_price : 0)));
      return '<button class="sc-checkout" data-action="checkout">' + title + "</button>" +
        '<button class="sc-continue" data-action="close">continue shopping</button>';
    }
    get actions() {
      return { click: {
        checkout: function () { location.href = this.store.ctx.checkoutUrl || "/checkout"; },
        close: function () { this.requestClose(); },
      } };
    }
  }

  class ScTrustBadges extends SideCartBlock {
    template() {
      const badges = this.props.badges || [];
      if (!badges.length) return "";
      return '<div class="sc-trust">' + badges.map(function (b) {
        return "<span>" + esc(b.title) + "</span>";
      }).join("") + "</div>";
    }
  }

  class ScPaymentMethods extends SideCartBlock {
    template() {
      const icons = this.props.icons || [];
      if (!icons.length) return "";
      return '<div class="sc-pay">' + icons.map(function (label) {
        return "<span>" + esc(label) + "</span>";
      }).join("") + "</div>";
    }
  }
```

- [ ] **Step 3: Write boot v0 (§6 — complete code; detect wiring lands in Task 6)**

```js
  /* ---------- §6 boot — runs LAST; everything above is defined by now ---------- */
  const CRITICAL_CSS =
    ":host{display:block!important}" +
    "*{box-sizing:border-box}" +
    "#sc-overlay{position:fixed;inset:0;background:rgba(17,17,17,.45);opacity:0;pointer-events:none;z-index:2147483646}" +
    "#side-cart{position:fixed;top:0;right:0;height:100%;width:min(100vw,525px);background:#fff;" +
    "transform:translateX(100%);z-index:2147483647;display:flex;flex-direction:column}" +
    ":host(.sc-open) #side-cart{transform:none}" +
    ":host(.sc-open) #sc-overlay{opacity:1;pointer-events:auto}";

  function boot() {
    spec = readJson("sc-spec") || window.__SC_SPEC__ || null;
    ctx = readJson("sc-ctx") || { root: "/", moneyFormat: "{{amount}}", currency: "", locale: "", checkoutUrl: "/checkout" };
    const host = document.getElementById("sc-root");
    if (!spec || !host) return;                        // silent no-op, theme cart untouched

    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    if (!host.firstChild) host.appendChild(document.createElement("span"));   // div:empty guard
    shadow.innerHTML =
      "<style>" + CRITICAL_CSS + "</style>" +
      (ctx.cssUrl ? '<link rel="stylesheet" href="' + esc(ctx.cssUrl) + '">' : "") +
      '<div id="sc-overlay" data-action="close"></div>' +
      '<aside id="side-cart" role="dialog" aria-modal="true" aria-label="Cart">' +
      '<div id="sc-header"></div><div id="sc-body"></div><div id="sc-footer"></div></aside>';

    host.style.cssText = styleVars(spec.general || {});   // tokens inherit across the shadow

    const store = new SideCartStore(spec, ctx);

    defineBlocks({
      "sc-top-bar": ScTopBar, "sc-subtotal": ScSubtotal, "sc-checkout-button": ScCheckoutButton,
      "sc-trust-badges": ScTrustBadges, "sc-payment-methods": ScPaymentMethods,
      // Task 4 adds: "sc-timer": ScTimer, "sc-progress-bar": ScProgressBar
      // Task 5 adds: "sc-products": ScProducts, "sc-discount-code": ScDiscountCode, "sc-order-notes": ScOrderNotes
    });

    ["header", "body", "footer"].forEach(function (region) {
      const regionHost = shadow.getElementById("sc-" + region);
      const blocks = spec[region] || {};
      if (blocks.style) regionHost.style.cssText = styleVars(blocks.style);
      Object.keys(blocks).forEach(function (type) {
        if (type === "style" || !blocks[type] || !blocks[type].enabled) return;
        const el = createBlock(type, blocks[type], store);
        if (el) regionHost.appendChild(el);
      });
    });

    function openDrawer() { host.classList.add("sc-open"); document.dispatchEvent(new CustomEvent("side-cart:open")); }
    function closeDrawer() { host.classList.remove("sc-open"); document.dispatchEvent(new CustomEvent("side-cart:close")); }

    shadow.addEventListener("sc:close-request", closeDrawer);
    shadow.getElementById("sc-overlay").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

    const drawer = shadow.getElementById("side-cart");
    store.addEventListener("sc:busy", function (e) { drawer.classList.toggle("sc-busy", e.detail.busy); });
    store.addEventListener("sc:update", function () {
      const empty = !store.cart || store.cart.item_count === 0;
      host.classList.toggle("sc-empty-cart", empty);
    });

    // Task 6 wires here: interceptor, PO net, native suppressor, cart-icon clicks

    window.SideCart = { root: shadow, open: openDrawer, close: closeDrawer,
      refresh: function () { return store.refresh(); } };
    window.__SC_TEST__.store = store;
    store.refresh();   // first paint
  }
  boot();
```

- [ ] **Step 4: Verify in the harness**

```bash
node --check extensions/ai-side-cart/assets/cart-v2.js
cp extensions/ai-side-cart/assets/cart-v2.js /tmp/sc-harness-v2/
```

Open `http://localhost:8899/` — drawer should slide open with: centered "My cart • 3" header, subtotal with the "Discounts / big savings / -Rs. 629.94" row and "Rs. 629.96", purple "Checkout • Rs. 629.96" + "continue shopping", trust badges. TIMER/PROGRESS/PRODUCTS absent (later tasks). Console check:

```js
(() => {
  const sr = document.getElementById("sc-root").shadowRoot;
  const topBar = sr.querySelector("sc-top-bar");
  const before = topBar.querySelector(".sc-topbar");
  window.__SC_TEST__.store.dispatchEvent(new CustomEvent("sc:update"));   // force re-render
  return {
    isCustomElement: topBar instanceof HTMLElement && topBar.tagName === "SC-TOP-BAR",
    hasBlockClasses: topBar.classList.contains("sc-blk-TOP_BAR"),
    morphPreservedNode: topBar.querySelector(".sc-topbar") === before,    // true — no rebuild
    closeWorks: (topBar.querySelector("[data-action=close]").click(),
                 !document.getElementById("sc-root").classList.contains("sc-open")),
  };
})()
```

Expected: all `true`. Also verify `http://localhost:8899/?empty=1` shows ONLY the header (other blocks render empty via `showsWhenEmpty`).

- [ ] **Step 5: Checkpoint — STOP. Do not commit.** Report screenshots/console results; user commits.

---

### Task 4: Stateful header blocks — ScTimer + ScProgressBar

**Files:**
- Modify: `extensions/ai-side-cart/assets/cart-v2.js` (§4: two classes; §6: add their two entries to the `defineBlocks({...})` call)

**Interfaces:**
- Consumes: base class contract (Task 3), `readTimerDeadline/writeTimerDeadline/stampFreshDeadline`, `progressRules/progressTotal/ruleThreshold/segmentedFillPercent`, `esc`, `money`, store `write`.
- Produces: `<sc-timer>` and `<sc-progress-bar>` registered in the boot `defineBlocks` map. No other task depends on their internals.

- [ ] **Step 1: Write ScTimer (complete code — v1 timer semantics, element-owned)**

```js
  class ScTimer extends SideCartBlock {
    template() {
      const deadline = readTimerDeadline();
      if (!deadline || Date.now() >= deadline) return "";        // renders nothing past expiry
      const titleHtml = esc(this.props.title).replace(/\{\{\s*timer\s*\}\}/g,
        '<span data-sc-timer>' + this._timerText() + "</span>"); // esc FIRST, then splice span
      return '<div class="sc-timer">' + titleHtml + "</div>";
    }

    mounted() {
      const self = this;
      this._prevCount = null;
      this._expiryHandled = false;
      if (!readTimerDeadline()) stampFreshDeadline(this.props);
      this._interval = setInterval(function () { self._tick(); }, 1000);   // ONE interval app-wide
    }

    unmounted() { clearInterval(this._interval); }

    updated() {   // runs after every morph — reset-on-add (v1 maybeResetTimerOnAdd)
      const count = this.store.cart ? this.store.cart.item_count : 0;
      if (this.props.resetTimerProductAddedToCart && this._prevCount != null && count > this._prevCount) {
        stampFreshDeadline(this.props);
        this._expiryHandled = false;
      }
      this._prevCount = count;
    }

    _timerText() {   // v1 timerText verbatim
      const deadline = readTimerDeadline();
      if (!deadline) return "";
      const msLeft = Math.max(0, deadline - Date.now());
      const minutes = String(Math.floor(msLeft / 60000)).padStart(2, "0");
      const seconds = String(Math.floor((msLeft % 60000) / 1000)).padStart(2, "0");
      return minutes + ":" + seconds;
    }

    _tick() {   // v1 onTimerTick semantics: touch ONE span; expiry handled once
      const span = this.querySelector("[data-sc-timer]");
      if (span) span.textContent = this._timerText();
      const deadline = readTimerDeadline();
      if (deadline && Date.now() >= deadline && !this._expiryHandled) {
        this._expiryHandled = true;
        const self = this;
        if (this.props.removeCartItemsTimerEnds && this.store.cart && this.store.cart.item_count > 0) {
          this.store.write("cart/clear.js", {}).then(function (cleared) {
            if (cleared) self.store.setCart(cleared);
          });
        } else {
          this.update();   // morph removes the band
        }
      }
    }
  }
```

- [ ] **Step 2: Write ScProgressBar (complete code — v1 math verbatim, flash state local)**

```js
  class ScProgressBar extends SideCartBlock {
    constructor() {
      super();
      this._prevTotal = 0;
      this._flash = null;   // { label, expiresAt }
    }

    beforeRender() {   // v1 trackUnlockCrossings, local to the element
      const rules = progressRules(this.store.spec);
      if (!rules.length) return;
      const total = progressTotal(this.store.spec, this.store.cart);
      const self = this;
      const crossed = rules.find(function (rule) {
        const threshold = ruleThreshold(self.store.spec, rule);
        return self._prevTotal < threshold && total >= threshold;
      });
      this._prevTotal = total;
      if (crossed) {
        this._flash = { label: crossed.label, expiresAt: Date.now() + 3000 };
        setTimeout(function () { self._flash = null; self.update(); }, 3000);
      }
    }

    template(cart) {
      const theSpec = this.store.spec;
      const rules = progressRules(theSpec);
      if (!rules.length || !cart) return "";
      const props = this.props;
      const total = progressTotal(theSpec, cart);
      const count = rules.length;
      const self = this;
      const thresholds = rules.map(function (rule) { return ruleThreshold(theSpec, rule); });
      const fillPercent = segmentedFillPercent(total, thresholds);
      const nextRule = rules.find(function (rule, i) { return total < thresholds[i]; });

      let messageTemplate;
      if (!nextRule) messageTemplate = props.allUnlockedText;
      else if (this._flash && Date.now() < this._flash.expiresAt) messageTemplate = props.unlockedText;
      else messageTemplate = props.defaultText;
      const nextIndex = rules.indexOf(nextRule);
      const needed = nextRule ? thresholds[nextIndex] - total : 0;
      const neededText = progressBlockOf(theSpec).props.unlockedBy === "QUANTITY" ? String(needed) : money(needed);
      const message = esc(messageTemplate)
        .replace(/\{\{\s*needed\s*\}\}/g, esc(neededText))
        .replace(/\{\{\s*next\s*\}\}/g, nextRule ? esc(nextRule.label) : "—")
        .replace(/\{\{\s*unlocked\s*\}\}/g, this._flash ? esc(this._flash.label) : "—");

      function markerPct(i) { return ((i + 1) / count) * 100; }
      function edgeShift(i) { return i === count - 1 ? "-100%" : "-50%"; }
      const markers = rules.map(function (rule, i) {
        const reached = total >= thresholds[i];
        return '<span class="sc-milestone' + (reached ? " sc-done" : "") +
          '" style="left:' + markerPct(i) + "%;transform:translate(" + edgeShift(i) + ',-50%)"></span>';
      }).join("");
      const labels = rules.map(function (rule, i) {
        const reached = total >= thresholds[i];
        return '<span class="sc-ms-label' + (reached ? " sc-done" : "") +
          '" style="left:' + markerPct(i) + "%;transform:translateX(" + edgeShift(i) + ')">' +
          esc(rule.label) + "</span>";
      }).join("");

      // NOTE: no data-pct / double-rAF needed in v2 — morph updates the style attribute on
      // the PERSISTENT .sc-fill element, so the CSS width transition animates naturally.
      return '<div class="sc-progress"><p class="sc-progress-text">' + message +
        '</p><div class="sc-track"><div class="sc-fill" style="width:' + fillPercent + '%"></div>' +
        markers + '</div><div class="sc-ms-labels">' + labels + "</div></div>";
    }
  }
```

- [ ] **Step 3: Register both** — in boot's `defineBlocks({...})` add `"sc-timer": ScTimer, "sc-progress-bar": ScProgressBar,`.

- [ ] **Step 4: Verify**

```bash
node --check extensions/ai-side-cart/assets/cart-v2.js
cp extensions/ai-side-cart/assets/cart-v2.js /tmp/sc-harness-v2/
```

Reload `http://localhost:8899/`. Expect the lavender timer band counting down each second (only the span mutates — inspect Elements) and the progress bar with even ring markers + labels. Console check for the **smooth fill** (the v1 jerky-fill regression):

```js
(async () => {
  const sr = document.getElementById("sc-root").shadowRoot;
  const fill = sr.querySelector(".sc-fill");
  const before = fill.getBoundingClientRect().width;
  // simulate a total change → sc:update → morph updates width on the SAME element
  window.__HARNESS_CART().total_price = 150000;
  window.__SC_TEST__.store.setCart(window.__HARNESS_CART());
  const samePersistentNode = sr.querySelector(".sc-fill") === fill;   // morph kept it
  await new Promise(r => setTimeout(r, 150));                          // mid-transition
  const mid = fill.getBoundingClientRect().width;
  await new Promise(r => setTimeout(r, 600));
  const after = fill.getBoundingClientRect().width;
  return { samePersistentNode, animated: mid > before && mid < after, before, mid, after };
})()
```

Expected: `samePersistentNode: true`, `animated: true`. Also verify: markers at `(i+1)/N` percents (`[...sr.querySelectorAll(".sc-milestone")].map(m => m.style.left)`), last marker's `transform` contains `-100%`, and a threshold crossing flashes the unlocked message for ~3s.

- [ ] **Step 5: Checkpoint — STOP. Do not commit.** Report; user commits.

---

### Task 5: Stateful body/footer blocks — ScProducts, ScDiscountCode, ScOrderNotes

**Files:**
- Modify: `extensions/ai-side-cart/assets/cart-v2.js` (§4: three classes; §6: add their three `defineBlocks` entries)

**Interfaces:**
- Consumes: base contract, store (`write`, `refresh`, `setCart`, `fetchProduct`, `cart`), morph form-state rules (`data-sync-value`), icons, `esc/money`, `numericIdFromGid`.
- Produces: `<sc-products>`, `<sc-discount-code>`, `<sc-order-notes>` registered in boot. Markup contracts the CSS relies on (all v1-identical): `.sc-lines > li.sc-line[data-key]`, `.sc-qty` with `sc-loading`, `.sc-remove`, `.sc-variant-select`, `.sc-save`, `.sc-empty`, `.sc-disc-row #sc-disc-input`, `.sc-chips .sc-chip`, `.sc-notes`.

- [ ] **Step 1: Write ScProducts (complete code — v1 lineHtml/variant/swap logic, keyed lines)**

```js
  class ScProducts extends SideCartBlock {
    static showsWhenEmpty = true;

    constructor() {
      super();
      this._productCache = new Map();   // handle → { status: "pending"|"ok"|"error", data }
    }

    template(cart) {
      const props = this.props;
      if (!cart || !cart.items || !cart.items.length) {
        return '<div class="sc-empty">' + BAG_ICON +
          "<span>" + esc(props.emptyText || "Your cart is empty.") + "</span></div>";
      }
      const self = this;
      return '<ul class="sc-lines">' + cart.items.map(function (item, i) {
        return self._lineHtml(item, i + 1, props);
      }).join("") + "</ul>";
    }

    _lineHtml(item, line, props) {
      // v1 lineHtml verbatim with THREE changes:
      //  1. <li class="sc-line" data-key="' + esc(item.key) + '">   ← keyed for morph
      //  2. the qty input gains data-sync-value and uses data-action="qty-input":
      //     '<input class="sc-qty-val" type="number" inputmode="numeric" min="0" step="1" value="' +
      //       item.quantity + '" data-sync-value data-action="qty-input" data-line="' + line +
      //       '" aria-label="Quantity">'
      //  3. variantHtml → this._variantHtml(item, props)
      // Everything else identical: gift FREE badge/no controls, hyperlinked title (item.url),
      // struck was-price + green "You save N%" pill (TAG_ICON), TRASH_ICON remove button
      // with data-action="remove" data-line.
    }

    _variantHtml(item, props) {
      // v1 variantHtml verbatim with renames:
      //   productCache → this._productCache
      //   ensureProductLoaded(handle) → this._ensureProductLoaded(handle)
      // (rules preserved: no selector when !props.showVariantSelector, when
      //  item.product_has_only_default_variant, for gift lines → static label,
      //  when fetch pending/error → static label, when < 2 variants → "")
    }

    _ensureProductLoaded(handle) {
      if (!handle || this._productCache.has(handle)) return;
      this._productCache.set(handle, { status: "pending" });
      const self = this;
      this.store.fetchProduct(handle)
        .then(function (data) { self._productCache.set(handle, { status: "ok", data: data }); self.update(); })
        .catch(function () { self._productCache.set(handle, { status: "error" }); });
    }

    _changeQty(line, qty) {
      const self = this;
      return this.store.write("cart/change.js", { line: Number(line), quantity: Math.max(0, qty) })
        .then(function (next) { next ? self.store.setCart(next) : self.store.refresh(); });
    }

    _swapVariant(oldVariantId, newVariantId, lineQuantity) {
      // v1 swapVariant verbatim (INCLUDING the merge fix: target = existingTargetQty +
      // lineQuantity, gift lines excluded), with cart → this.store.cart,
      // pausedWrite → this.store.write, setCart/refreshCart → this.store.setCart/refresh.
    }

    get actions() {
      return {
        click: {
          qty: function (target) {
            const stepper = target.closest(".sc-qty");
            if (stepper) stepper.classList.add("sc-loading");
            this._changeQty(target.dataset.line, Number(target.dataset.qty));
          },
          remove: function (target) {
            target.classList.add("sc-loading");
            this._changeQty(target.dataset.line, 0);
          },
        },
        change: {
          "qty-input": function (target) {
            const stepper = target.closest(".sc-qty");
            if (stepper) stepper.classList.add("sc-loading");
            this._changeQty(target.dataset.line, parseInt(target.value, 10) || 0);
          },
          variant: function (target) {
            this._swapVariant(Number(target.dataset.oldVariant), Number(target.value),
              Number(target.dataset.lineQty));
          },
        },
        keydown: {
          "qty-input": function (target, event) {
            if (event.key === "Enter") { event.preventDefault(); target.blur(); }
          },
        },
      };
    }
  }
```

- [ ] **Step 2: Write ScDiscountCode + ScOrderNotes (complete code)**

```js
  class ScDiscountCode extends SideCartBlock {
    template(cart) {
      const props = this.props;
      const chips = ((cart && cart.discount_codes) || [])
        .filter(function (d) { return d.applicable !== false; })
        .map(function (d) {
          return '<span class="sc-chip">' + esc(d.code) +
            '<button data-action="remove-discount" aria-label="Remove discount">✕</button></span>';
        }).join("");
      // NOTE: input has NO data-sync-value — morph preserves typed-but-unapplied text
      return '<div class="sc-discount"><div class="sc-disc-row">' +
        '<input id="sc-disc-input" type="text" placeholder="' + esc(props.placeholderTitle) + '">' +
        '<button class="sc-apply" data-action="apply-discount">' + esc(props.buttonText) + "</button>" +
        '</div><div class="sc-chips">' + chips + "</div></div>";
    }

    _applyDiscount(code) {
      const self = this;
      return this.store.write("cart/update.js", { discount: code || "" })
        .then(function (next) { next ? self.store.setCart(next) : self.store.refresh(); });
    }

    get actions() {
      return { click: {
        "apply-discount": function () {
          const input = this.querySelector("#sc-disc-input");
          const code = input && input.value.trim();
          if (!code) return;
          input.value = "";                       // clear synchronously (v1 fix preserved)
          this._applyDiscount(code);
        },
        "remove-discount": function () { this._applyDiscount(""); },
      } };
    }
  }

  class ScOrderNotes extends SideCartBlock {
    constructor() { super(); this._open = false; }

    template(cart) {
      const props = this.props;
      // textarea: NO data-sync-value — typed note text survives morphs until saved
      const textarea = this._open
        ? '<textarea id="sc-notes" data-action="note" placeholder="' + esc(props.textAreaPlaceholder) + '">' +
          esc((cart && cart.note) || "") + "</textarea>"
        : "";
      return '<div class="sc-notes"><button class="sc-notes-toggle" data-action="toggle-notes">' +
        esc(props.title) + " " + (this._open ? "▴" : "▾") + "</button>" + textarea + "</div>";
    }

    get actions() {
      return {
        click: { "toggle-notes": function () { this._open = !this._open; this.update(); } },
        blur: { note: function (target) { this.store.write("cart/update.js", { note: target.value }); } },
      };
    }
  }
```

- [ ] **Step 3: Register** — add to boot's `defineBlocks({...})`: `"sc-products": ScProducts, "sc-discount-code": ScDiscountCode, "sc-order-notes": ScOrderNotes,`.

- [ ] **Step 4: Verify in the harness**

```bash
node --check extensions/ai-side-cart/assets/cart-v2.js
cp extensions/ai-side-cart/assets/cart-v2.js /tmp/sc-harness-v2/
```

Reload `http://localhost:8899/`. Visual: snowboard line (linked title, Navy dropdown after ~1s lazy load, − [2] + editable input, struck price + "You save 50%" pill, trash) and the gift line (FREE badge, no controls, no variant). Console checks:

```js
(async () => {
  const sr = document.getElementById("sc-root").shadowRoot;
  const products = sr.querySelector("sc-products");
  const line = products.querySelector('[data-key="L1"]');

  // 1. spinner survives the in-flight write, morph reuses the keyed node
  const plus = line.querySelectorAll(".sc-qty button")[1];
  plus.click();
  const loadingDuring = line.querySelector(".sc-qty").classList.contains("sc-loading");
  await new Promise(r => setTimeout(r, 600));
  const sameLineNode = products.querySelector('[data-key="L1"]') === line;   // keyed morph reuse
  const loadingCleared = !line.querySelector(".sc-qty").classList.contains("sc-loading");

  // 2. typed discount text survives an unrelated cart update (morph, no data-sync-value)
  const disc = sr.querySelector("#sc-disc-input");
  disc.value = "HALFTYPED";
  window.__SC_TEST__.store.setCart(window.__HARNESS_CART());
  const typedSurvives = sr.querySelector("#sc-disc-input").value === "HALFTYPED";

  // 3. qty input DOES sync from server data (data-sync-value)
  window.__HARNESS_CART().items[0].quantity = 7;
  window.__SC_TEST__.store.setCart(window.__HARNESS_CART());
  const qtySynced = products.querySelector('[data-key="L1"] .sc-qty-val').value === "7";

  return { loadingDuring, sameLineNode, loadingCleared, typedSurvives, qtySynced };
})()
```

Expected: all `true`. Also check `?empty=1`: bag-icon empty state vertically centered, only header visible.

- [ ] **Step 5: Checkpoint — STOP. Do not commit.** Report; user commits.

---

### Task 6: Detect layer (verbatim port into classes) + full boot wiring

**Files:**
- Modify: `extensions/ai-side-cart/assets/cart-v2.js` (fill §5; extend §6 boot)

**Interfaces:**
- Consumes: `_fetch`, store (`busy`, `lastOwnWriteAt`, `lastCartReactionAt`, `refresh`), `window.__sideCartLast`, boot's `openDrawer` callback.
- Produces: `class CartInterceptor { constructor(store, openDrawer); start() }`,
  `class CartMutationObserverNet { constructor(store, openDrawer); start() }`,
  `class NativeCartSuppressor { start() }`, `class CartIconClicks { constructor(openDrawer); start() }`.
  Module-level data configs (verbatim v1): `ENDPOINT_MATCHERS`, `NON_CART_BODY_KEYS`,
  `ENDPOINT_PREDICATES`, `INTERCEPT_GUARDS` (paused guard reads `store.busy`),
  `CART_LINK_SELECTORS`, `NATIVE_CART_SELECTORS`, `NATIVE_CLOSE_BUTTON_SELECTORS`,
  `SCROLL_LOCK_CLASSES`. Document event `side-cart:item-added` from the add-diff.

- [ ] **Step 1: Port §5 from v1 (this step is transcription — v1 §4 is the source of truth)**

Copy from v1 `cart.js` into §5, restructured as shown. **Every body is verbatim**; only the listed identifiers change:

```js
  /* ---------- §5 detect — v1 logic verbatim, repackaged (contracts unchanged) ---------- */
  // ENDPOINT_MATCHERS, NON_CART_BODY_KEYS, classifyEndpoint, parseRequestBody,
  // paramsToObject, hasOnlyNonCartKeys, ENDPOINT_PREDICATES, requestHasOurHeader,
  // urlNeverOpensDrawer                                   ← ALL verbatim from v1, module level

  class CartInterceptor {
    constructor(store, openDrawer) { this.store = store; this.openDrawer = openDrawer; }

    start() { this._patchFetch(); this._patchXhr(); }

    _guardsVeto(requestInfo) {
      // v1 INTERCEPT_GUARDS as a const array ABOVE the class, with ONE change:
      //   the "interceptor-paused" guard's vetoes() returns THIS store's busy flag —
      //   define the array inside the constructor or pass the store in via closure:
      //   { name: "interceptor-paused", vetoes: () => this.store.busy }
      // Then: return INTERCEPT_GUARDS.some(g => { try { return g.vetoes(requestInfo); } catch (e) { return false; } });
    }

    _evaluate(requestInfo) {
      // v1 evaluateRequest verbatim; guard check calls this._guardsVeto(requestInfo)
    }

    _react(requestInfo, response) {
      // v1 reactToResponse verbatim → this._handleMutation(response.clone(), verdict)
    }

    _handleMutation(response, verdict) {
      // v1 handleCartMutationResponse verbatim with renames:
      //   lastCartReactionAt = Date.now() → this.store.lastCartReactionAt = Date.now()
      //   openDrawer() → this.openDrawer()
      //   refreshCart / final refetch → this.store.refresh()
      //   (the add-diff against window.__sideCartLast and the side-cart:item-added
      //    dispatch are UNCHANGED)
    }

    _patchFetch() {
      // v1 installFetchInterceptor verbatim: window.fetch = function(input, init) {
      //   const realRequest = _fetch(input, init);   // ALWAYS runs, exact promise returned
      //   try { ...build requestInfo...; realRequest.then(res => self._react(requestInfo, res)).catch(()=>{}); }
      //   catch (e) { /* passthrough */ }
      //   return realRequest; }
    }

    _patchXhr() {
      // v1 installXhrInterceptor verbatim (open/setRequestHeader/send patches, load listener
      // building the responseLike with .clone() returning itself), reacting via this._react.
    }
  }

  class CartMutationObserverNet {
    constructor(store, openDrawer) { this.store = store; this.openDrawer = openDrawer; }
    start() {
      // v1 installCartMutationObserver + reactToCartMutationUrl verbatim with renames:
      //   lastOwnWriteAt → this.store.lastOwnWriteAt
      //   lastCartReactionAt → this.store.lastCartReactionAt (read AND write)
      //   openDrawer() → this.openDrawer() · refreshCart() → this.store.refresh()
      // (same 2500ms own-write window, 1200ms reaction-dedupe window, classifyEndpoint
      //  + ignore/ocu URL checks, opens_cart=never, /cart page check)
    }
  }

  class NativeCartSuppressor {
    start() {
      // v1 NATIVE_CART_SELECTORS / NATIVE_CLOSE_BUTTON_SELECTORS / SCROLL_LOCK_CLASSES as
      // module consts + v1 disableNativeCart + closeNativeCartElements verbatim
      // (3 layers: :not(#side-cart) CSS hide, JS close incl. close-button clicks +
      //  scroll-lock strip, MutationObserver keep-shut).
    }
  }

  class CartIconClicks {
    constructor(openDrawer) { this.openDrawer = openDrawer; }
    start() {
      // v1 CART_LINK_SELECTORS const + installCartIconClickDetector verbatim
      // (capture-phase document listener, ignores clicks inside #sc-root,
      //  preventDefault + stopPropagation + this.openDrawer()).
    }
  }
```

- [ ] **Step 2: Wire into boot** — replace the `// Task 6 wires here` comment with:

```js
    new CartInterceptor(store, openDrawer).start();
    new CartMutationObserverNet(store, openDrawer).start();
    new NativeCartSuppressor().start();
    new CartIconClicks(openDrawer).start();
```

- [ ] **Step 3: Verify the interceptor contract in the harness**

```bash
node --check extensions/ai-side-cart/assets/cart-v2.js
cp extensions/ai-side-cart/assets/cart-v2.js /tmp/sc-harness-v2/
```

Reload `http://localhost:8899/`, close the drawer (`window.SideCart.close()`), then:

```js
(async () => {
  const host = document.getElementById("sc-root");
  let itemAdded = null;
  document.addEventListener("side-cart:item-added", e => { itemAdded = e.detail; }, { once: true });

  // 1. external add (no X-Side-Cart) → drawer opens (harness stub returns the cart json;
  //    the add-diff sees no qty growth vs __sideCartLast, so itemAdded stays null — fine)
  await window.fetch("/cart/add.js", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: 101, quantity: 1 }) });
  await new Promise(r => setTimeout(r, 900));
  const openedOnAdd = host.classList.contains("sc-open");

  // 2. our own write is vetoed (X-Side-Cart header) — drawer must NOT re-open
  window.SideCart.close();
  await window.fetch("/cart/change.js", { method: "POST",
    headers: { "Content-Type": "application/json", "X-Side-Cart": "1" },
    body: JSON.stringify({ line: 1, quantity: 2 }) });
  await new Promise(r => setTimeout(r, 900));
  const stayedClosedOnOwn = !host.classList.contains("sc-open");

  // 3. note-only body (useless keys) is ignored
  await window.fetch("/cart/update.js", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: "hi" }) });
  await new Promise(r => setTimeout(r, 900));
  const noteIgnored = !host.classList.contains("sc-open");

  // 4. fetch patch returns the REAL promise (identity check via instanceof Response)
  const res = await window.fetch("/cart.js");
  return { openedOnAdd, stayedClosedOnOwn, noteIgnored, realResponse: res instanceof Response };
})()
```

Expected: all `true`. Also confirm in the Network tab that no request loop occurs after any of the above (each add triggers exactly one follow-up `/cart.js` refresh).

- [ ] **Step 4: Checkpoint — STOP. Do not commit.** Report; user commits.

---

### Task 7: Swap into cart.js + full §H regression pass (harness + LIVE store)

**Files:**
- Modify: `extensions/ai-side-cart/assets/cart.js` (replace entire content with cart-v2.js)
- Delete: `extensions/ai-side-cart/assets/cart-v2.js` (plain `rm` — NOT `git rm`)

**Interfaces:**
- Consumes: completed cart-v2.js; the live dev store (`https://asif-development-store.myshopify.com`, password `1`, product `/products/skcomill02`, multi-variant `/products/ezra-arthur-medium-nylon-tote-navy`); running `shopify app dev` (ask the user to restart it if the served bundle is stale — it has lagged before).
- Produces: v2 live as `cart.js`; the completed regression checklist as the task report.

- [ ] **Step 1: Swap**

```bash
cd /Users/asifmalik/workspaces/skailama_hackathon/AI-SIDE-CART
cp extensions/ai-side-cart/assets/cart-v2.js extensions/ai-side-cart/assets/cart.js
rm extensions/ai-side-cart/assets/cart-v2.js
node --check extensions/ai-side-cart/assets/cart.js
grep -c '\bvar\b' extensions/ai-side-cart/assets/cart.js   # expect 0
```

Update the harness to load `cart.js`: `sed -i '' 's/cart-v2.js/cart.js/' /tmp/sc-harness-v2/index.html && cp extensions/ai-side-cart/assets/cart.js /tmp/sc-harness-v2/`.

- [ ] **Step 2: Harness regression sweep (spec §H items testable offline)**

Re-run every console check from Tasks 1–6 against `http://localhost:8899/` and `?empty=1`. All must pass. Additionally verify: money grouping (`Rs. 1,259.90` in the was-price), title is an `<a>`, single-variant gift shows no variant UI, drawer `sc-busy` dims checkout+apply during a write, continue-shopping visible.

- [ ] **Step 3: LIVE store regression sweep (spec §H items needing real Shopify)**

Ask the user to confirm `shopify app dev` is running (and to restart it if the served bundle doesn't contain the marker string `SideCartStore` — check the loaded script source via the browser). Then on `https://asif-development-store.myshopify.com` (password `1`):

1. `/products/skcomill02`: theme Add-to-cart button → drawer opens with the line (PO net; the theme's fetch bypasses the patch). Header cart icon → our drawer opens, Dawn's never appears.
2. Network tab during qty +/−: exactly one `POST /cart/change.js` per click, no `/cart.js` cascade (no loop), spinner in the control during flight, checkout dimmed.
3. `/products/ezra-arthur-medium-nylon-tote-navy`: add Navy(1) + Black(1); in the drawer swap Navy→Black → Black shows quantity **2** (merge fix).
4. Apply discount code `SAVE10` → chip + Discounts row + line pill all appear; remove → restored. A product-level automatic discount shows the line "You save N%" pill AND the footer Discounts row.
5. Progress bar: even markers, fill animates smoothly on qty change, "Add Rs. X to unlock" math correct (dollar unlockAt), last marker inside the track.
6. Timer band counts down; adding an item resets it; empty cart (remove everything) → centered bag empty state, only header visible, header bubble count syncs.
7. Reload the page hard: no flicker (drawer never flashes across the screen), no console errors, `#sc-root` visible (div:empty guard), `window.SideCart.root` is the shadow root.

- [ ] **Step 4: Final checkpoint — STOP. Do not commit.** Report the full §H checklist with pass/fail per item and any deviations. The user reviews the working tree diff and commits.

---

## Execution notes for the controller

- Tasks are strictly sequential (each builds on the previous file state).
- After EVERY task: stop at the checkpoint. **Never commit; never `git add`.** The user commits between tasks (or in batches at their discretion — their call, not the executor's).
- If a "verbatim from v1" instruction is ambiguous because v1 changed, `git log -p extensions/ai-side-cart/assets/cart.js` is the history; prefer the current HEAD version.
- The harness stubs writes by returning the SAME cart object — assertions therefore check UI/flow behavior (spinners, morph reuse, events), not server math. Server math is Task 7's live-store job.
