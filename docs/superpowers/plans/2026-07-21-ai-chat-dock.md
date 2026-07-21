# AI Chat Dock ("AI Stylist") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AI chat dock per `docs/superpowers/specs/2026-07-21-ai-chat-dock-design.md` — own `chat.js`/`chat.css`/`chat-spec.js` runtime with `<sc-chat-dock>`, a `CHAT_LAUNCHER` block in the cart footer, and a dummy App-Proxy SSE backend speaking the final wire format.

**Architecture:** Chat is a second, independent runtime (own IIFE, own shadow root on a self-created `#sc-chat-root`) that talks to the cart only via `window.SideCart`/`window.SideCartChat` facades and document events. `ChatStore` (EventTarget) owns conversation state + SSE transport; the dock is append-only UI (no morph needed). The dummy Remix route streams canned SSE using the shop-chat-agent event vocabulary, so the storefront is final from day one.

**Tech Stack:** Vanilla JS custom element (classic script, no build), Shadow DOM, SSE over Shopify App Proxy, Remix route (dependency-free `Response`/`ReadableStream`).

## Global Constraints

- **NO GIT COMMITS. Ever. By anyone.** Every task ends at a "Checkpoint — STOP, do not commit" step; the user reviews and commits. Never run `git add`/`git commit`/`git rm`. Plain `rm`/`mv` only.
- Classic-script IIFEs, `"use strict"`, `let`/`const` only, no modules/imports in storefront assets, no dependencies anywhere (the Remix route uses only web-standard globals).
- `esc()` every spec/server string entering chat HTML; streamed chunks render via `textContent` only (no HTML injection path). Nothing in chat touches `/checkout`. Chat NEVER patches fetch/XHR.
- Chat uses `window.fetch` at call time (NOT an early-bound `_fetch`): product-card adds to `/cart/add.js` deliberately go through the cart's patched fetch WITHOUT the `X-Side-Cart` header so the cart's detection refreshes the drawer; the SSE POST to `chatUrl` doesn't match cart endpoints so the interceptor passes it through untouched.
- Chat shadow-root hardening (same lessons as the cart): sentinel `<span>` child on the host, critical inline `<style>` FIRST (`:host{display:block!important}`, dock hidden with `visibility:hidden;opacity:0` — no load flicker), then `<link>` to `chatCssUrl`.
- Layout: mobile (max-width: 480px) dock is `right:0; width:100vw` covering the cart; desktop (min-width: 481px) dock is `right:480px; width:min(100vw - 480px, 420px)` beside the cart. Same `z-index: 2147483647` as the cart — `#sc-chat-root` is appended to `document.body` AFTER the cart's host, so it paints on top on mobile.
- Choreography: launcher opens chat (cart stays open); `‹` closes chat only; `✕` closes chat AND cart (`window.SideCart.close()`); ESC closes chat first via a CAPTURE-phase document keydown that calls `event.stopImmediatePropagation()` when chat is open (so the cart's bubble-phase ESC never fires on that press).
- SSE wire format (shop-chat-agent vocabulary, exact): request `POST {chatUrl}` headers `Content-Type: application/json`, `Accept: text/event-stream`, body `{message, conversation_id}`; response frames `data: {json}\n\n` with types `id {conversation_id}` / `chunk {chunk}` / `message_complete` / `end_turn` / `error {error}` / `rate_limit_exceeded` / `product_results {products}`. `conversation_id` persisted in `sessionStorage` key `scChatConversationId`.
- Spec resolution: `#sc-chat-spec` (metafield) → `window.__SC_CHAT_SPEC__` (chat-spec.js) → missing = chat silently never mounts AND the cart's launcher stays hidden.
- Chat CSS tokens use the `--scc-*` namespace (separate from the cart's `--sc-*`).
- Do NOT touch the v2 cart runtime beyond exactly: `ScChatLauncher` class + `CHAT_LAUNCHER` registry/defineBlocks entries in `cart.js`, launcher styles appended to `cart.css`, `CHAT_LAUNCHER` block added to `cart-spec.js` footer (preserve the user's existing spec content byte-for-byte otherwise), and the liquid/ctx additions listed in Task 2.
- **Testing:** `node --check` after every storefront edit; the Remix route is verified with a real node import test (no server needed); UI verified in the existing harness `/tmp/sc-harness-v2` (server :8899) extended with a chat SSE stub — console snippets given per task. Final live-store verification requires `shopify app deploy`/dev restart for the App Proxy to exist (noted in Task 4).

**Reference for patterns:** cart v2 runtime `extensions/ai-side-cart/assets/cart.js` (esc/readJson/hardening/boot patterns) and `/Users/asifmalik/workspaces/skailama_hackathon/shop-chat-agent` (SSE parsing reference — ours is written fresh below, same protocol).

---

## File structure

```
shopify.app.toml                              + [app_proxy] block            (Task 1)
app/routes/proxy.chat.jsx                     dummy SSE endpoint             (Task 1)
extensions/ai-side-cart/assets/chat-spec.js   window.__SC_CHAT_SPEC__        (Task 2)
extensions/ai-side-cart/assets/chat.css       dock styles (--scc-*)          (Task 2)
extensions/ai-side-cart/blocks/side-cart.liquid  + chat spec/ctx/scripts     (Task 2)
extensions/ai-side-cart/assets/chat.js        ChatStore + <sc-chat-dock> + boot (Task 3)
extensions/ai-side-cart/assets/cart.js        + ScChatLauncher               (Task 4)
extensions/ai-side-cart/assets/cart.css       + .sc-chat-launcher styles     (Task 4)
extensions/ai-side-cart/assets/cart-spec.js   + CHAT_LAUNCHER footer block   (Task 4)
```

---

### Task 1: Dummy SSE backend (App Proxy + Remix route)

**Files:**
- Modify: `shopify.app.toml` (add `[app_proxy]`)
- Create: `app/routes/proxy.chat.jsx`

**Interfaces:**
- Consumes: nothing.
- Produces: storefront path `/apps/ai-cart/chat` → app route `/proxy/chat`. Route exports `action({request})` (POST → SSE stream) and `loader()` (405 JSON). Event vocabulary per Global Constraints. Task 3's ChatStore consumes exactly this.

- [ ] **Step 1: Add the App Proxy to `shopify.app.toml`**

Read the file; find the current `application_url = "..."` value. Append this block at the end, substituting the SAME url:

```toml
[app_proxy]
url = "<application_url value>/proxy"
subpath = "ai-cart"
prefix = "apps"
```

(With `automatically_update_urls_on_dev` the CLI rewrites `url` per dev session; the storefront always uses the stable path `/apps/ai-cart/chat`.)

- [ ] **Step 2: Create `app/routes/proxy.chat.jsx` (complete code, dependency-free)**

```jsx
/**
 * Dummy AI-chat SSE endpoint behind the App Proxy (/apps/ai-cart/chat → /proxy/chat).
 * Streams canned responses using the FINAL wire format (shop-chat-agent event
 * vocabulary), so the storefront never changes when Claude/MCP replaces this.
 * Proxy signature verification is intentionally out of scope for the dummy.
 */

const CANNED_REPLIES = [
  "Great pick — the Sand blazer leans relaxed-tailored. I'd pair it with a tonal knit and a clean leather loafer to keep it polished. Here are two that work with what you have:",
  "For sizing, this brand runs slightly roomy — most people take one size down from their usual. If you're between sizes, the smaller one will drape better.",
  "I can help with orders too! Once your order ships you'll get a tracking link by email. Anything else you'd like me to check?",
];

const DEMO_PRODUCTS = [
  { title: "Merino Crew Knit", price: "Rs. 88.00", image: "", url: "/products/skcomill02", variant_id: 47829864775991 },
  { title: "Leather Loafer", price: "Rs. 210.00", image: "", url: "/products/ezra-arthur-medium-nylon-tote-navy", variant_id: 47829864513847 },
];

let replyCursor = 0;

function pickReply(message) {
  if (/size|fit/i.test(message || "")) return CANNED_REPLIES[1];
  if (/order|track|ship/i.test(message || "")) return CANNED_REPLIES[2];
  if (/look|pair|match|shoe|top|style/i.test(message || "")) return CANNED_REPLIES[0];
  const reply = CANNED_REPLIES[replyCursor % CANNED_REPLIES.length];
  replyCursor += 1;
  return reply;
}

function wantsProducts(message) {
  return /look|pair|match|shoe|top|style/i.test(message || "");
}

function sseFrame(data) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function streamChat(request) {
  let body = {};
  try { body = await request.json(); } catch (e) { /* empty body → defaults */ }
  const conversationId = body.conversation_id || crypto.randomUUID();
  const reply = pickReply(body.message);
  const includeProducts = wantsProducts(body.message);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) => controller.enqueue(encoder.encode(sseFrame(data)));
      try {
        send({ type: "id", conversation_id: conversationId });
        const words = reply.split(" ");
        for (let i = 0; i < words.length; i++) {
          send({ type: "chunk", chunk: (i === 0 ? "" : " ") + words[i] });
          await delay(40);
        }
        send({ type: "message_complete" });
        if (includeProducts) send({ type: "product_results", products: DEMO_PRODUCTS });
        send({ type: "end_turn" });
      } catch (e) {
        send({ type: "error", error: "stream failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

export async function action({ request }) {
  return streamChat(request);
}

export async function loader() {
  return new Response(JSON.stringify({ error: "POST only" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 3: Verify the route with a real node test (no server; do not save the script)**

Node cannot import `.jsx` extensions directly (`ERR_UNKNOWN_FILE_EXTENSION`); copy the file to a temp `.mjs` first and import THAT (identical content — plain JS):

```bash
cp app/routes/proxy.chat.jsx /tmp/proxy.chat.test.mjs
cd /Users/asifmalik/workspaces/skailama_hackathon/AI-SIDE-CART
node --input-type=module -e '
const mod = await import("/tmp/proxy.chat.test.mjs");
const req = new Request("http://x/proxy/chat", { method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "what pairs with this look?", conversation_id: null }) });
const res = await mod.action({ request: req });
console.log("content-type:", res.headers.get("Content-Type"));
const text = await res.text();
const types = [...text.matchAll(/"type":"(\w+)"/g)].map(m => m[1]);
console.log("first:", types[0], "| has chunk:", types.includes("chunk"),
  "| complete:", types.includes("message_complete"),
  "| products:", types.includes("product_results"), "| last:", types[types.length - 1]);
console.log("conversation id echoed:", /"conversation_id":"[0-9a-f-]{36}"/.test(text));
'
```

Expected output:
```
content-type: text/event-stream
first: id | has chunk: true | complete: true | products: true | last: end_turn
conversation id echoed: true
```

Also run the same with `message: "hello"` — expect `products: false`.

- [ ] **Step 4: Checkpoint — STOP. Do not commit.** Report the toml diff + node test output. The user commits.

---

### Task 2: Chat spec, chat.css, liquid wiring, harness stub

**Files:**
- Create: `extensions/ai-side-cart/assets/chat-spec.js`
- Create: `extensions/ai-side-cart/assets/chat.css`
- Modify: `extensions/ai-side-cart/blocks/side-cart.liquid`
- Modify: `/tmp/sc-harness-v2/index.html` (chat SSE stub + chat script tags)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `window.__SC_CHAT_SPEC__` (shape below — Task 3 reads it); `#sc-ctx` gains `"chatUrl"` and `"chatCssUrl"`; `#sc-chat-spec` emitted when the metafield exists; chat.css class contract Task 3's markup must match: `.scc-dock/.scc-header/.scc-back/.scc-avatar/.scc-head-text/.scc-title/.scc-status/.scc-close/.scc-messages/.scc-msg.user|.assistant/.scc-chips/.scc-chip/.scc-typing/.scc-products/.scc-product/.scc-product-img/.scc-product-info/.scc-product-title/.scc-product-price/.scc-product-add/.scc-composer/.scc-input/.scc-send`.

- [ ] **Step 1: Create `extensions/ai-side-cart/assets/chat-spec.js`**

```js
/* Hackathon default chat spec. Deleted once the admin editor publishes to the
   cart.published_chat_spec metafield (#sc-chat-spec wins whenever present). */
window.__SC_CHAT_SPEC__ = {
  general: {
    bgColor: "#FAF7F2",
    textColor: "#111111",
    accentColor: "#9A6B53",
    accentTextColor: "#FFFFFF",
    radius: 14,
  },
  header: {
    title: "AI Stylist",
    statusText: "Online · replies instantly",
    avatarEmoji: "◆",
  },
  conversation: {
    welcomeMessage: "Hi! I'm your personal stylist. I can pull looks together, help with sizing, or check on an order. What can I help with?",
    quickReplies: ["Complete this look", "What's my size?", "Track my order"],
    inputPlaceholder: "Ask anything…",
    errorText: "Sorry, I couldn't process your request. Please try again later.",
  },
};
```

- [ ] **Step 2: Create `extensions/ai-side-cart/assets/chat.css` (complete)**

```css
/* AI Chat Dock — injected INTO the chat shadow root. Tokens: --scc-* (set on :host by boot). */
:host {
  display: block !important;
  --scc-bg: #faf7f2; --scc-text: #111; --scc-accent: #9a6b53; --scc-accent-text: #fff;
  --scc-radius: 14px; --scc-line: #e9e4dc; --scc-muted: #8a8a8a; --scc-surface: #fff;
  color: var(--scc-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px; line-height: 1.45;
}
*, *::before, *::after { box-sizing: border-box; }

.scc-dock {
  position: fixed; top: 0; height: 100%; right: 0; width: 100vw;
  background: var(--scc-bg); z-index: 2147483647;
  display: flex; flex-direction: column;
  visibility: hidden; opacity: 0; transform: translateX(24px);
  transition: opacity .22s ease, transform .22s ease, visibility 0s linear .22s;
  box-shadow: -10px 0 40px rgba(0,0,0,.14);
}
:host(.scc-open) .scc-dock {
  visibility: visible; opacity: 1; transform: none;
  transition: opacity .22s ease, transform .22s ease;
}
@media (min-width: 481px) {
  .scc-dock { right: 480px; width: min(100vw - 480px, 420px); }
}

/* header */
.scc-header { flex: none; display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: var(--scc-surface); box-shadow: 0 1px 0 var(--scc-line); }
.scc-back, .scc-close { background: none; border: 1px solid var(--scc-line); width: 34px; height: 34px; border-radius: 50%; cursor: pointer; font-size: 16px; line-height: 1; color: var(--scc-text); flex: none; }
.scc-back:hover, .scc-close:hover { background: rgba(0,0,0,.04); }
.scc-avatar { width: 38px; height: 38px; border-radius: 50%; background: #111; color: var(--scc-accent); display: flex; align-items: center; justify-content: center; font-size: 16px; flex: none; }
.scc-head-text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.scc-title { font-weight: 700; font-size: 15px; }
.scc-status { font-size: 12px; color: var(--scc-muted); }
.scc-status::before { content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #22a06b; margin-right: 5px; }

/* messages */
.scc-messages { flex: 1 1 auto; overflow-y: auto; overscroll-behavior: contain; padding: 16px 14px; display: flex; flex-direction: column; gap: 10px; }
.scc-msg { max-width: 85%; padding: 10px 14px; border-radius: var(--scc-radius); white-space: pre-wrap; word-wrap: break-word; }
.scc-msg.assistant { align-self: flex-start; background: var(--scc-surface); border: 1px solid var(--scc-line); border-top-left-radius: 4px; }
.scc-msg.user { align-self: flex-end; background: var(--scc-accent); color: var(--scc-accent-text); border-bottom-right-radius: 4px; }
.scc-day { align-self: center; font-size: 12px; color: var(--scc-muted); }

/* quick replies */
.scc-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.scc-chip { border: 1px solid var(--scc-line); background: var(--scc-surface); border-radius: 999px; padding: 8px 14px; font-size: 13px; cursor: pointer; color: var(--scc-text); }
.scc-chip:hover { border-color: var(--scc-accent); }

/* typing indicator */
.scc-typing { align-self: flex-start; display: flex; gap: 4px; padding: 12px 14px; background: var(--scc-surface); border: 1px solid var(--scc-line); border-radius: var(--scc-radius); border-top-left-radius: 4px; }
.scc-typing i { width: 6px; height: 6px; border-radius: 50%; background: var(--scc-muted); animation: scc-blink 1.2s infinite; }
.scc-typing i:nth-child(2) { animation-delay: .2s; }
.scc-typing i:nth-child(3) { animation-delay: .4s; }
@keyframes scc-blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }

/* product cards */
.scc-products { display: flex; flex-direction: column; gap: 8px; max-width: 85%; }
.scc-product { display: flex; align-items: center; gap: 10px; background: var(--scc-surface); border: 1px solid var(--scc-line); border-radius: var(--scc-radius); padding: 10px; }
.scc-product-img { width: 48px; height: 48px; border-radius: 8px; background: #eee7dd; object-fit: cover; flex: none; }
.scc-product-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.scc-product-title { font-weight: 700; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scc-product-price { font-size: 12px; color: var(--scc-muted); }
.scc-product-add { flex: none; border: 0; background: #111; color: #fff; border-radius: 999px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
.scc-product-add[disabled] { opacity: .6; cursor: default; }

/* composer */
.scc-composer { flex: none; display: flex; gap: 10px; padding: 12px 14px; background: var(--scc-bg); }
.scc-input { flex: 1; min-width: 0; height: 48px; border: 1px solid var(--scc-line); border-radius: 999px; padding: 0 18px; font-size: 14px; background: var(--scc-surface); color: var(--scc-text); }
.scc-input:focus { outline: none; border-color: var(--scc-accent); }
.scc-send { flex: none; width: 48px; height: 48px; border: 0; border-radius: 50%; background: var(--scc-accent); color: var(--scc-accent-text); font-size: 18px; cursor: pointer; }
.scc-send[disabled] { opacity: .5; cursor: default; }
```

- [ ] **Step 3: Update `extensions/ai-side-cart/blocks/side-cart.liquid`**

Replace the current data/script section so it reads (keep the schema block unchanged; note the two ctx additions, the chat spec emit, and the two new script tags AFTER cart.js):

```liquid
{%- assign spec = app.metafields.cart.published_spec -%}
{%- if spec -%}
  <script type="application/json" id="sc-spec">{{ spec.value | json }}</script>
{%- endif -%}
{%- assign chat_spec = app.metafields.cart.published_chat_spec -%}
{%- if chat_spec -%}
  <script type="application/json" id="sc-chat-spec">{{ chat_spec.value | json }}</script>
{%- endif -%}
<script type="application/json" id="sc-ctx">{
  "root":        {{ routes.root_url | json }},
  "moneyFormat": {{ shop.money_format | json }},
  "currency":    {{ cart.currency.iso_code | json }},
  "locale":      {{ request.locale.iso_code | json }},
  "checkoutUrl": "/checkout",
  "cssUrl":      {{ 'cart.css' | asset_url | json }},
  "chatUrl":     "/apps/ai-cart/chat",
  "chatCssUrl":  {{ 'chat.css' | asset_url | json }}
}</script>
<div id="sc-root"></div>
<script src="{{ 'cart-spec.js' | asset_url }}" defer></script>
<script src="{{ 'chat-spec.js' | asset_url }}" defer></script>
<script src="{{ 'cart.js' | asset_url }}" defer></script>
<script src="{{ 'chat.js' | asset_url }}" defer></script>
```

- [ ] **Step 4: Extend the harness with the chat stub**

Edit `/tmp/sc-harness-v2/index.html`:
(a) inside the fetch-stub IIFE, add this branch BEFORE the `/cart/` branch:

```js
  if (url.indexOf("/apps/ai-cart/chat") > -1) {
    const enc = new TextEncoder();
    const frames = [
      { type: "id", conversation_id: "harness-conv-1" },
      { type: "chunk", chunk: "Great" }, { type: "chunk", chunk: " pick" },
      { type: "chunk", chunk: " — here" }, { type: "chunk", chunk: " are two" },
      { type: "chunk", chunk: " that work:" },
      { type: "message_complete" },
      { type: "product_results", products: [
        { title: "Merino Crew Knit", price: "Rs. 88.00", image: "", url: "/products/knit", variant_id: 101 },
        { title: "Leather Loafer", price: "Rs. 210.00", image: "", url: "/products/loafer", variant_id: 102 },
      ] },
      { type: "end_turn" },
    ];
    const stream = new ReadableStream({
      async start(c) {
        for (const f of frames) {
          c.enqueue(enc.encode("data: " + JSON.stringify(f) + "\n\n"));
          await new Promise(r => setTimeout(r, 120));
        }
        c.close();
      },
    });
    return Promise.resolve(new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
  }
```

(b) update the ctx JSON to add `"chatUrl":"/apps/ai-cart/chat","chatCssUrl":"chat.css"`;
(c) add `<script src="chat-spec.js"></script>` after cart-spec.js and `<script src="chat.js"></script>` after cart.js (chat.js won't exist until Task 3 — a 404 script tag is harmless in the interim);
(d) copy assets: `cp extensions/ai-side-cart/assets/chat-spec.js extensions/ai-side-cart/assets/chat.css /tmp/sc-harness-v2/`.

- [ ] **Step 5: Verify**

```bash
node --check extensions/ai-side-cart/assets/chat-spec.js
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8899/chat.css   # 200 after cp
```

In the browser at `http://localhost:8899/` (reload): cart still fully works (no console errors besides the expected chat.js 404), and in the console `window.__SC_CHAT_SPEC__.header.title === "AI Stylist"` → true.

- [ ] **Step 6: Checkpoint — STOP. Do not commit.** Report; user commits.

---

### Task 3: chat.js — ChatStore, `<sc-chat-dock>`, boot + facade

**Files:**
- Create: `extensions/ai-side-cart/assets/chat.js` (complete file below)
- Modify: `/tmp/sc-harness-v2/` (copy the new asset)

**Interfaces:**
- Consumes: `window.__SC_CHAT_SPEC__` / `#sc-chat-spec` (Task 2 shape), `#sc-ctx.chatUrl/chatCssUrl`, the chat.css class contract (Task 2), the SSE vocabulary (Task 1).
- Produces: `window.SideCartChat = { root, open, close }`; document events `sc-chat:ready`, `sc-chat:open`, `sc-chat:close`. Task 4's launcher calls `window.SideCartChat.open()` and re-renders on `sc-chat:ready`.

- [ ] **Step 1: Create `extensions/ai-side-cart/assets/chat.js` (complete code)**

```js
/* Side Cart — AI Chat Dock. Independent runtime: own IIFE, own shadow root.
   Talks to the cart ONLY via window.SideCart / window.SideCartChat + document events. */
(function () {
  "use strict";

  /* ---------- utils (own copies — no imports across runtimes) ---------- */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function readJson(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  const CHAT_VAR_MAP = {
    bgColor: "--scc-bg", textColor: "--scc-text", accentColor: "--scc-accent",
    accentTextColor: "--scc-accent-text", radius: "--scc-radius",
  };

  function chatTokens(general) {
    if (!general) return "";
    return Object.keys(general)
      .filter(function (key) { return CHAT_VAR_MAP[key]; })
      .map(function (key) {
        const value = general[key];
        return CHAT_VAR_MAP[key] + ":" + esc(typeof value === "number" ? value + "px" : value);
      })
      .join(";");
  }

  /* ---------- ChatStore — conversation state + SSE transport (SRP) ---------- */
  class ChatStore extends EventTarget {
    constructor(spec, ctx) {
      super();
      this.spec = spec;
      this.ctx = ctx;
      this.streaming = false;
      this.conversationId = sessionStorage.getItem("scChatConversationId") || null;
    }

    send(text) {
      const message = String(text || "").trim();
      if (this.streaming || !message) return Promise.resolve();
      const self = this;
      this.streaming = true;
      this.dispatchEvent(new CustomEvent("chat:user", { detail: { text: message } }));
      this.dispatchEvent(new CustomEvent("chat:state", { detail: { streaming: true } }));
      // window.fetch at call time (possibly the cart's patched fetch — chatUrl is not a
      // cart endpoint, so the interceptor passes it through untouched)
      return window.fetch(this.ctx.chatUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
        body: JSON.stringify({ message: message, conversation_id: this.conversationId }),
      }).then(function (response) {
        if (!response.ok || !response.body) throw new Error("chat http " + response.status);
        return self._consumeStream(response.body);
      }).catch(function () {
        self.dispatchEvent(new CustomEvent("chat:error"));
      }).finally(function () {
        self.streaming = false;
        self.dispatchEvent(new CustomEvent("chat:state", { detail: { streaming: false } }));
      });
    }

    _consumeStream(body) {
      const self = this;
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      function pump() {
        return reader.read().then(function (result) {
          if (result.done) return undefined;
          buffer += decoder.decode(result.value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() || "";
          frames.forEach(function (frame) {
            if (frame.indexOf("data: ") !== 0) return;
            try { self._handleEvent(JSON.parse(frame.slice(6))); } catch (e) { /* skip bad frame */ }
          });
          return pump();
        });
      }
      return pump();
    }

    _handleEvent(data) {
      switch (data.type) {
        case "id":
          if (data.conversation_id) {
            this.conversationId = data.conversation_id;
            sessionStorage.setItem("scChatConversationId", data.conversation_id);
          }
          break;
        case "chunk":
          this.dispatchEvent(new CustomEvent("chat:chunk", { detail: { chunk: data.chunk || "" } }));
          break;
        case "message_complete":
          this.dispatchEvent(new CustomEvent("chat:complete"));
          break;
        case "product_results":
          this.dispatchEvent(new CustomEvent("chat:products", { detail: { products: data.products || [] } }));
          break;
        case "error":
        case "rate_limit_exceeded":
          this.dispatchEvent(new CustomEvent("chat:error"));
          break;
        // "end_turn": stream close already resets state in send()'s finally
      }
    }
  }

  /* ---------- <sc-chat-dock> — append-only UI (no morph needed) ---------- */
  class ScChatDock extends HTMLElement {
    connectedCallback() {
      const header = this.spec.header || {};
      const conversation = this.spec.conversation || {};
      this.innerHTML =
        '<div class="scc-dock">' +
          '<header class="scc-header">' +
            '<button class="scc-back" aria-label="Back to cart">‹</button>' +
            '<span class="scc-avatar">' + esc(header.avatarEmoji || "◆") + "</span>" +
            '<div class="scc-head-text"><span class="scc-title">' + esc(header.title || "AI Assistant") + "</span>" +
            '<span class="scc-status">' + esc(header.statusText || "") + "</span></div>" +
            '<button class="scc-close" aria-label="Close">✕</button>' +
          "</header>" +
          '<div class="scc-messages"></div>' +
          '<form class="scc-composer">' +
            '<input class="scc-input" type="text" placeholder="' + esc(conversation.inputPlaceholder || "Ask anything…") + '" autocomplete="off">' +
            '<button class="scc-send" type="submit" aria-label="Send">↑</button>' +
          "</form>" +
        "</div>";

      this._messages = this.querySelector(".scc-messages");
      this._input = this.querySelector(".scc-input");
      this._sendBtn = this.querySelector(".scc-send");
      this._streamEl = null;
      this._typingEl = null;

      this._wire();
      this._subscribe();
      this._welcome(conversation);
    }

    _wire() {
      const self = this;
      this.querySelector(".scc-back").addEventListener("click", function () {
        self.requestClose(false);   // back: chat only — cart stays
      });
      this.querySelector(".scc-close").addEventListener("click", function () {
        self.requestClose(true);    // ✕: chat AND cart
      });
      this.querySelector(".scc-composer").addEventListener("submit", function (event) {
        event.preventDefault();
        const text = self._input.value;
        self._input.value = "";
        self.store.send(text);
      });
      // product Add + / quick replies (delegated — appended content)
      this._messages.addEventListener("click", function (event) {
        const chip = event.target.closest(".scc-chip");
        if (chip) { self.store.send(chip.textContent); const chips = chip.closest(".scc-chips"); if (chips) chips.remove(); return; }
        const addBtn = event.target.closest(".scc-product-add");
        if (addBtn && !addBtn.disabled) self._addToCart(addBtn);
      });
    }

    _subscribe() {
      const self = this;
      this.store.addEventListener("chat:user", function (e) { self._bubble("user", e.detail.text); self._showTyping(); });
      this.store.addEventListener("chat:chunk", function (e) {
        self._hideTyping();
        if (!self._streamEl) self._streamEl = self._bubble("assistant", "");
        self._streamEl.textContent += e.detail.chunk;   // textContent only — no injection path
        self._scroll();
      });
      this.store.addEventListener("chat:complete", function () { self._streamEl = null; });
      this.store.addEventListener("chat:products", function (e) { self._products(e.detail.products); });
      this.store.addEventListener("chat:error", function () {
        self._hideTyping();
        self._streamEl = null;
        self._bubble("assistant", (self.spec.conversation && self.spec.conversation.errorText) ||
          "Sorry, I couldn't process your request. Please try again later.");
      });
      this.store.addEventListener("chat:state", function (e) {
        self._sendBtn.disabled = e.detail.streaming;
      });
    }

    _welcome(conversation) {
      const day = document.createElement("div");
      day.className = "scc-day";
      const now = new Date();
      day.textContent = "Today · " + now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      this._messages.appendChild(day);
      if (conversation.welcomeMessage) this._bubble("assistant", conversation.welcomeMessage);
      const replies = conversation.quickReplies || [];
      if (replies.length) {
        const chips = document.createElement("div");
        chips.className = "scc-chips";
        replies.forEach(function (label) {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "scc-chip";
          chip.textContent = label;
          chips.appendChild(chip);
        });
        this._messages.appendChild(chips);
      }
    }

    _bubble(role, text) {
      const el = document.createElement("div");
      el.className = "scc-msg " + role;
      el.textContent = text;
      this._messages.appendChild(el);
      this._scroll();
      return el;
    }

    _showTyping() {
      if (this._typingEl) return;
      this._typingEl = document.createElement("div");
      this._typingEl.className = "scc-typing";
      this._typingEl.innerHTML = "<i></i><i></i><i></i>";
      this._messages.appendChild(this._typingEl);
      this._scroll();
    }

    _hideTyping() {
      if (this._typingEl) { this._typingEl.remove(); this._typingEl = null; }
    }

    _products(products) {
      if (!products.length) return;
      const wrap = document.createElement("div");
      wrap.className = "scc-products";
      products.forEach(function (product) {
        const card = document.createElement("div");
        card.className = "scc-product";
        card.innerHTML =
          (product.image ? '<img class="scc-product-img" src="' + esc(product.image) + '" alt="">' : '<span class="scc-product-img"></span>') +
          '<div class="scc-product-info"><span class="scc-product-title">' + esc(product.title) + "</span>" +
          '<span class="scc-product-price">' + esc(product.price) + "</span></div>" +
          '<button class="scc-product-add" data-variant-id="' + esc(product.variant_id) + '">Add +</button>';
        wrap.appendChild(card);
      });
      this._messages.appendChild(wrap);
      this._scroll();
    }

    _addToCart(button) {
      const variantId = Number(button.dataset.variantId);
      if (!variantId) return;
      button.disabled = true;
      const original = button.textContent;
      // NO X-Side-Cart header, through window.fetch — the CART's detection pipeline
      // treats this as an external add and refreshes the drawer/count/progress itself.
      window.fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: variantId, quantity: 1 }),
      }).then(function (response) {
        button.textContent = response.ok ? "Added ✓" : "Failed";
      }).catch(function () {
        button.textContent = "Failed";
      }).finally(function () {
        setTimeout(function () { button.textContent = original; button.disabled = false; }, 1600);
      });
    }

    _scroll() { this._messages.scrollTop = this._messages.scrollHeight; }

    requestClose(closeCartToo) {
      this.dispatchEvent(new CustomEvent("scc:close-request", {
        bubbles: true, composed: true, detail: { closeCartToo: !!closeCartToo },
      }));
    }
  }

  /* ---------- boot — chat mounts itself; missing spec = silent no-op ---------- */
  function boot() {
    const spec = readJson("sc-chat-spec") || window.__SC_CHAT_SPEC__ || null;
    const cartCtx = readJson("sc-ctx") || {};
    if (!spec) return;   // no chat spec → chat never mounts, launcher stays hidden

    const ctx = {
      chatUrl: cartCtx.chatUrl || "/apps/ai-cart/chat",
      chatCssUrl: cartCtx.chatCssUrl || "",
    };

    let host = document.getElementById("sc-chat-root");
    if (!host) {
      host = document.createElement("div");
      host.id = "sc-chat-root";
      document.body.appendChild(host);   // AFTER the cart's host → paints on top on mobile
    }
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    if (!host.firstChild) host.appendChild(document.createElement("span"));   // div:empty guard
    host.style.cssText = chatTokens(spec.general);

    // critical CSS: dock exists but is invisible until .scc-open — zero load flicker
    const CRITICAL_CSS =
      ":host{display:block!important}" +
      "*{box-sizing:border-box}" +
      ".scc-dock{position:fixed;top:0;right:0;height:100%;width:100vw;background:#fff;" +
      "z-index:2147483647;display:flex;flex-direction:column;visibility:hidden;opacity:0}" +
      "@media (min-width:481px){.scc-dock{right:480px;width:min(100vw - 480px,420px)}}" +
      ":host(.scc-open) .scc-dock{visibility:visible;opacity:1}";
    shadow.innerHTML =
      "<style>" + CRITICAL_CSS + "</style>" +
      (ctx.chatCssUrl ? '<link rel="stylesheet" href="' + esc(ctx.chatCssUrl) + '">' : "");

    if (!customElements.get("sc-chat-dock")) customElements.define("sc-chat-dock", ScChatDock);
    const store = new ChatStore(spec, ctx);
    const dock = document.createElement("sc-chat-dock");
    dock.store = store;
    dock.spec = spec;
    shadow.appendChild(dock);

    function open() {
      host.classList.add("scc-open");
      document.dispatchEvent(new CustomEvent("sc-chat:open"));
      const input = dock.querySelector(".scc-input");
      if (input && window.matchMedia("(min-width: 481px)").matches) input.focus();
    }
    function close() {
      host.classList.remove("scc-open");
      document.dispatchEvent(new CustomEvent("sc-chat:close"));
    }

    shadow.addEventListener("scc:close-request", function (event) {
      close();
      if (event.detail && event.detail.closeCartToo && window.SideCart) window.SideCart.close();
    });

    // ESC precedence: CAPTURE phase; when chat is open, close it and stop the cart's
    // bubble-phase ESC handler from also firing on the same press.
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && host.classList.contains("scc-open")) {
        event.stopImmediatePropagation();
        close();
      }
    }, true);

    window.SideCartChat = { root: shadow, open: open, close: close };
    window.__SCC_TEST__ = { store: store, ChatStore: ChatStore };   // harness/test hook
    document.dispatchEvent(new CustomEvent("sc-chat:ready"));
  }

  boot();
})();
```

- [ ] **Step 2: Verify**

```bash
cd /Users/asifmalik/workspaces/skailama_hackathon/AI-SIDE-CART
node --check extensions/ai-side-cart/assets/chat.js
grep -c '\bvar\b' extensions/ai-side-cart/assets/chat.js   # expect 0
cp extensions/ai-side-cart/assets/chat.js /tmp/sc-harness-v2/
```

In the browser at `http://localhost:8899/` (hard reload), console:

```js
(async () => {
  const r = { ready: typeof window.SideCartChat === "object" };
  window.SideCartChat.open();
  const host = document.getElementById("sc-chat-root");
  const sr = window.SideCartChat.root;
  r.opened = host.classList.contains("scc-open");
  r.welcome = sr.querySelector(".scc-msg.assistant").textContent.startsWith("Hi! I'm your personal stylist");
  r.chips = sr.querySelectorAll(".scc-chip").length === 3;
  // send a message through the stubbed SSE
  await window.__SCC_TEST__.store.send("what pairs with this look?");
  await new Promise(res => setTimeout(res, 300));
  const bubbles = [...sr.querySelectorAll(".scc-msg")];
  r.userBubble = bubbles.some(b => b.classList.contains("user") && /pairs with/.test(b.textContent));
  r.streamedText = bubbles.some(b => b.classList.contains("assistant") && /Great pick — here are two that work:/.test(b.textContent));
  r.productCards = sr.querySelectorAll(".scc-product").length === 2;
  r.sendReenabled = sr.querySelector(".scc-send").disabled === false;
  r.conversationSaved = sessionStorage.getItem("scChatConversationId") === "harness-conv-1";
  // ESC closes chat but NOT the cart
  window.SideCart.open();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  r.escClosedChatOnly = !host.classList.contains("scc-open") &&
    document.getElementById("sc-root").classList.contains("sc-open");
  return r;
})()
```

Expected: every key `true`. Then click a product "Add +" manually: the button flips to "Added ✓" and the CART drawer's line/count refresh (the stub returns the same cart, so watch for the refresh request in the interceptor rather than a count change — no error, no loop). No console errors.

- [ ] **Step 3: Checkpoint — STOP. Do not commit.** Report the console object; user commits.

---

### Task 4: CHAT_LAUNCHER cart block + end-to-end choreography + live checklist

**Files:**
- Modify: `extensions/ai-side-cart/assets/cart.js` (one class + two registry entries)
- Modify: `extensions/ai-side-cart/assets/cart.css` (launcher styles appended)
- Modify: `extensions/ai-side-cart/assets/cart-spec.js` (CHAT_LAUNCHER block in footer — preserve ALL existing content; only insert the new block)
- Modify: `/tmp/sc-harness-v2/` (copy updated assets)

**Interfaces:**
- Consumes: cart v2 block contract (`SideCartBlock`, `BLOCK_ELEMENTS`, `defineBlocks` map in boot), `window.SideCartChat.open()`, document event `sc-chat:ready` (Task 3).
- Produces: `<sc-chat-launcher>` rendering the black pill in the cart footer; the complete feature working end-to-end.

- [ ] **Step 1: Add `ScChatLauncher` to cart.js §4 (place with the other Sc* classes, complete code)**

```js
  class ScChatLauncher extends SideCartBlock {
    template() {
      // fail-closed: chat runtime absent (script failed / chat spec missing) → hide entirely
      if (!window.SideCartChat) return "";
      const blockProps = this.props;
      return '<button class="sc-chat-launcher" data-action="open-chat">' +
        '<span class="sc-chat-avatar">' + esc(blockProps.avatarEmoji || "◆") + "</span>" +
        '<span class="sc-chat-text"><span class="sc-chat-title">' + esc(blockProps.title) + "</span>" +
        (blockProps.subtitle ? '<span class="sc-chat-subtitle">' + esc(blockProps.subtitle) + "</span>" : "") +
        "</span><span class=\"sc-chat-chevron\">›</span></button>";
    }

    mounted() {
      // chat.js loads AFTER cart.js: first render may precede window.SideCartChat.
      // Re-render once when the chat runtime announces itself.
      const self = this;
      if (!window.SideCartChat) {
        document.addEventListener("sc-chat:ready", function () { self.update(); }, { once: true });
      }
    }

    get actions() {
      return { click: {
        "open-chat": function () { if (window.SideCartChat) window.SideCartChat.open(); },
      } };
    }
  }
```

Register it: add `CHAT_LAUNCHER: "sc-chat-launcher",` to `BLOCK_ELEMENTS` and `"sc-chat-launcher": ScChatLauncher,` to boot's `defineBlocks({...})` map.

- [ ] **Step 2: Append launcher styles to `extensions/ai-side-cart/assets/cart.css`**

```css
/* CHAT_LAUNCHER — black pill opening the AI chat dock; colors come from the block's
   style (bgColor/textColor/borderRadius) via the standard --sc-* wrapper vars */
.sc-chat-launcher { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; border: 0; cursor: pointer; border-radius: var(--sc-radius); background: var(--sc-bg); color: var(--sc-text); text-align: left; font-family: inherit; }
.sc-chat-launcher:hover { filter: brightness(1.12); }
.sc-chat-avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--sc-accent); color: var(--sc-accent-text); display: flex; align-items: center; justify-content: center; font-size: 14px; flex: none; }
.sc-chat-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.sc-chat-title { font-weight: 700; font-size: 14px; }
.sc-chat-subtitle { font-size: 12px; opacity: .75; }
.sc-chat-chevron { opacity: .7; font-size: 16px; flex: none; }
```

- [ ] **Step 3: Add the CHAT_LAUNCHER block to `extensions/ai-side-cart/assets/cart-spec.js`**

Insert into the `footer:` object ABOVE `DISCOUNT_CODE` (matching the mockup position), preserving every existing entry and the user's `order` fields convention (use an `order` value that sorts it above DISCOUNT_CODE if the file uses ordering):

```js
    CHAT_LAUNCHER: {
      enabled: true,
      props: {
        title: "Chat with our AI stylist",
        subtitle: "Get pairing ideas, size & order help",
        avatarEmoji: "◆",
      },
      style: { bgColor: "#111111", textColor: "#FFFFFF", borderRadius: 14 },
    },
```

- [ ] **Step 4: Verify end-to-end in the harness**

```bash
node --check extensions/ai-side-cart/assets/cart.js
node --check extensions/ai-side-cart/assets/cart-spec.js
cp extensions/ai-side-cart/assets/cart.js extensions/ai-side-cart/assets/cart.css extensions/ai-side-cart/assets/cart-spec.js /tmp/sc-harness-v2/
```

Hard-reload `http://localhost:8899/`, console:

```js
(async () => {
  const cartSr = document.getElementById("sc-root").shadowRoot;
  const chatHost = document.getElementById("sc-chat-root");
  const r = {};
  const launcher = cartSr.querySelector("sc-chat-launcher .sc-chat-launcher");
  r.launcherVisible = !!launcher && /Chat with our AI stylist/.test(launcher.textContent);
  launcher.click();
  r.chatOpened = chatHost.classList.contains("scc-open");
  r.cartStillOpen = document.getElementById("sc-root").classList.contains("sc-open");
  // ‹ back: chat closes, cart stays
  window.SideCartChat.root.querySelector(".scc-back").click();
  r.backClosedChatOnly = !chatHost.classList.contains("scc-open") &&
    document.getElementById("sc-root").classList.contains("sc-open");
  // ✕: both close
  window.SideCartChat.open();
  window.SideCartChat.root.querySelector(".scc-close").click();
  await new Promise(res => setTimeout(res, 100));
  r.xClosedBoth = !chatHost.classList.contains("scc-open") &&
    !document.getElementById("sc-root").classList.contains("sc-open");
  return r;
})()
```

Expected: all `true`. Then emulate mobile (device toolbar ~390px wide): open cart → launcher → chat covers the full viewport over the cart; `‹` reveals the cart again. No console errors in either viewport.

- [ ] **Step 5: LIVE store verification (needs the App Proxy deployed)**

Ask the user to restart `shopify app dev` (or run `shopify app deploy`) so the new `[app_proxy]` + assets go live. Then on `https://asif-development-store.myshopify.com` (password `1`), any product page:

1. Open the cart → black "Chat with our AI stylist" pill renders in the footer above the discount row.
2. Click it → desktop: chat panel appears beside the cart, welcome + 3 quick-reply chips.
3. Send "what pairs with this look?" → typing dots → word-by-word streamed reply → 2 product cards.
4. Click "Add +" on a card → button flips "Added ✓" AND the cart drawer updates with the product (detection pipeline reacted; no loop in the Network tab — exactly one follow-up `/cart.js`).
5. `‹` → chat closes, cart stays. Reopen chat, `✕` → both close. ESC with both open → chat closes first, cart stays; second ESC closes the cart.
6. Mobile emulation: chat covers the cart 100%; closing reveals the cart.
7. Hard reload: no flicker from either runtime, no console errors; `sessionStorage.scChatConversationId` persists across messages (same conversation id in the second request's payload).

- [ ] **Step 6: Final checkpoint — STOP. Do not commit.** Report the harness console object + the live checklist pass/fail per item. The user reviews the working tree and commits.

---

## Execution notes for the controller

- Tasks are sequential. After every task: stop at the checkpoint, never commit — the user commits.
- The cart runtime must remain byte-identical except the exact Task-4 touchpoints (Global Constraints); reviewers should diff-check that no other cart code changed.
- `cart-spec.js` is user-owned and frequently hand-tuned — Task 4's edit must be a pure insertion; if its current shape differs from expectations (e.g. different rules), do NOT normalize it.
- If the live App Proxy 404s after deploy, the toml `[app_proxy]` url likely doesn't match the current application_url — re-check Task 1 Step 1 before debugging anything else.
- Body scroll-lock: the chat deliberately does NOT manage `document.body.overflow` itself — its only entry point is the launcher inside the open cart, and the cart already locks/unlocks the page (`‹` keeps the cart open → still locked; `✕` closes the cart → cart unlocks). The dock's own scroll areas use `overscroll-behavior: contain`. If a future entry point opens chat without the cart, add a lock to chat's open()/close() then.
