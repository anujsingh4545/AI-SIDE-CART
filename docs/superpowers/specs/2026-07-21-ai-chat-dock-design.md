# AI Chat Dock ("AI Stylist") — Storefront + Dummy SSE Backend Design

**Date:** 2026-07-21
**Status:** Approved design.
**Reference:** Shopify's `shop-chat-agent` repo (`/Users/asifmalik/workspaces/skailama_hackathon/shop-chat-agent`) — we adopt its widget architecture (own chat.js/chat.css theme-extension assets) and its SSE wire protocol verbatim, but transport via App Proxy (no CORS/tunnel URLs) and config via our JSON-spec pattern instead of liquid block settings.
**Relationship to the cart:** built ON the side-cart v2 architecture (`2026-07-21-side-cart-v2-web-components-design.md`). The cart runtime gains exactly one new registered block (CHAT_LAUNCHER); everything else is a separate runtime.

---

## A. What ships

```
extensions/ai-side-cart/
├── assets/chat.js            chat runtime: own classic-script IIFE, own shadow root
├── assets/chat.css           chat styles, injected INTO the chat shadow root (cssUrl pattern)
├── assets/chat-spec.js       window.__SC_CHAT_SPEC__ fallback (until metafield/editor exists)
├── assets/cart.js            + ScChatLauncher block class + one registry line (only cart change)
├── assets/cart-spec.js       + CHAT_LAUNCHER footer block config
└── blocks/side-cart.liquid   + emits #sc-chat-spec (app.metafields.cart.published_chat_spec
                                when present) + chatUrl in #sc-ctx + loads chat-spec.js/chat.js

app/routes/proxy.chat.jsx     dummy SSE endpoint (canned responses; Claude/MCP later)
shopify.app.toml              [app_proxy]: prefix "apps", subpath "ai-cart" → storefront path
                              /apps/ai-cart/chat proxies to the app route
```

One app embed enables cart + chat. Load order: `cart-spec.js`, `chat-spec.js`, `cart.js`, `chat.js` (all defer, classic scripts).

## B. CHAT_LAUNCHER — a normal cart block (cart spec, footer)

New `ScChatLauncher` (`<sc-chat-launcher>`) in cart.js: one subclass + one `BLOCK_ELEMENTS`
entry (the v2 OCP path). Renders the black pill: avatar dot (`props.avatarEmoji`), bold
`props.title`, smaller `props.subtitle` (reduced-opacity of textColor — no new style key),
chevron `›`. Schema inside the CART spec's footer, sibling of the other footer blocks:

```js
CHAT_LAUNCHER: {
  enabled: true,
  order: 1,                                  // above DISCOUNT_CODE, per mockup
  props: {
    title: "Chat with our AI stylist",
    subtitle: "Get pairing ideas, size & order help",
    avatarEmoji: "◆",
  },
  style: { bgColor: "#111111", textColor: "#FFFFFF", borderRadius: 14 },  // via existing VAR_MAP
}
```

Click action: `window.SideCartChat && window.SideCartChat.open()`. If chat.js didn't load
(or chat spec missing → chat never mounts), the launcher renders `""` (fail-closed like every
block; check `window.SideCartChat` in template).

## C. Chat dock — own runtime mirroring the cart's architecture

`chat.js` = classic-script IIFE registering `<sc-chat-dock>` inside its own shadow root on a
host `#sc-chat-root` that chat.js creates and appends to `document.body` at boot (the liquid
block only ships data + scripts). All v2 hardening carried over: sentinel child on the host,
`:host{display:block!important}`, critical inline CSS first (dock off-screen, no transition),
then `<link href=chatCssUrl>`.

Internal units (SRP, small classes):
- **ChatStore (EventTarget)** — conversation state (`messages[]`, `streaming` flag,
  `conversationId` ⟷ sessionStorage `scChatConversationId`) + transport (`send(message)`
  POSTs and consumes SSE). Events: `chat:message` (append), `chat:chunk` (streaming text),
  `chat:state` (streaming/idle), `chat:products`, `chat:error`.
- **`<sc-chat-dock>`** — header (avatar, title, statusText, close ✕), scrollable
  messages region, composer (input + send). Append-only rendering: messages append; a
  streaming assistant message updates one element's textContent per chunk (no morph needed —
  no re-render fragility class exists in an append-only UI). Quick-reply chips render after
  the welcome message; clicking one sends it as a user message. Product results render as
  cards (image, title, price, "Add +" button). Body scroll-lock + overscroll containment
  same as the cart drawer.

**Layout & choreography (per mockups):**
- Desktop: fixed panel sliding in LEFT-adjacent to the cart drawer — `right: 480px`
  (the cart's width), `width: min(100vw - 480px, 420px)`; cart and chat visible side by side.
- Mobile (≤ 480px viewport): `right: 0; width: 100vw` — covers the cart fully.
- `✕` → close chat ONLY; the cart drawer always stays open.
  Opening chat never closes the cart. ESC closes the chat first
  if open, else the cart: chat.js registers its keydown listener in CAPTURE phase and, when
  the chat is open, calls `event.stopImmediatePropagation()` after closing — so the cart's
  existing bubble-phase ESC handler never fires on that press.
- Public surface: `window.SideCartChat = { root, open, close }`; document events
  `sc-chat:open`, `sc-chat:close`. Cart↔chat communicate ONLY via these facades/events (DIP).

**Add-to-cart from chat product cards:** plain `fetch("/cart/add.js", …)` WITHOUT the
`X-Side-Cart` header — deliberately, so the cart's existing detection pipeline treats it as
an external add: drawer refreshes, count-sync/free-gift/progress all react. Zero new coupling.

## D. Chat spec (the separate schema)

`#sc-chat-spec` JSON (metafield `cart.published_chat_spec` later; `chat-spec.js` fallback now):

```js
window.__SC_CHAT_SPEC__ = {
  general: { bgColor: "#FAF7F2", textColor: "#111111", accentColor: "#9A6B53",
             accentTextColor: "#FFFFFF", radius: 14 },
  header: { title: "AI Stylist", statusText: "Online · replies instantly", avatarEmoji: "◆" },
  conversation: {
    welcomeMessage: "Hi! I'm your personal stylist. I can pull looks together, help with sizing, or check on an order. What can I help with?",
    quickReplies: ["Complete this look", "What's my size?", "Track my order"],
    inputPlaceholder: "Ask anything…",
    errorText: "Sorry, I couldn't process your request. Please try again later.",
  },
};
```

Resolution: `#sc-chat-spec` (metafield) → `window.__SC_CHAT_SPEC__` → missing = chat never
mounts and the launcher hides. Tokens map to `--scc-*` CSS vars on the chat host (chat.css is
static, variable-driven — same theming engine as the cart, separate namespace).

## E. Transport + dummy backend (final wire format from day one)

- `#sc-ctx` gains `"chatUrl": "/apps/ai-cart/chat"` (App Proxy path; same-origin, no CORS).
- Request: `POST chatUrl`, `Content-Type: application/json`, `Accept: text/event-stream`,
  body `{ message, conversation_id }`.
- Response: SSE (`data: {json}\n\n`) with the shop-chat-agent event vocabulary, parsed
  identically to the reference: `id {conversation_id}` (stored to sessionStorage),
  `chunk {chunk}` (append to streaming message), `message_complete`, `end_turn`,
  `error {error}`, `product_results {products:[{title, price, image, url, variant_id}]}`.
- Widget behavior: typing indicator until first chunk; send disabled while streaming; `error`
  event OR network failure → errorText bubble; stream always ends the streaming state.
- Dummy `app/routes/proxy.chat.jsx`: validates the proxy signature is OUT of scope for the
  dummy (hackathon); streams canned scripted responses — rotating replies chunked word-by-word
  with ~40ms delays, and when the user message matches /look|pair|match|shoe|top/i it also
  emits one `product_results` with 2 hardcoded demo products (title/price/image/variant_id
  from the dev store). Generates a `conversation_id` (crypto.randomUUID) when absent and
  echoes it in the `id` event. Replacing this with Claude+MCP later touches only this file.

## F. Failure philosophy, security, testing

Same rules as the cart: missing chat spec/host → silent no-op; launcher hides when
`window.SideCartChat` is absent; `esc()` every spec/server string entering chat HTML
(chunks render via textContent — no HTML injection path); nothing in chat touches
`/checkout`; the chat never patches fetch/XHR (only the cart's interceptor does).
Testing: harness gains a chatUrl SSE stub (canned events through the existing fetch stub)
for fast iteration; live dev store verifies the real App Proxy route end-to-end.
NO COMMITS by implementers — the user commits.

## G. Out of scope

Real Claude/MCP backend, proxy signature verification, auth flows, conversation history
restore (route shape allows `?history=true` later), admin editor for the chat spec, cart
runtime changes beyond ScChatLauncher.
