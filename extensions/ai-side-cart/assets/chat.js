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
          buffer = buffer.replace(/\r\n/g, "\n");   // tolerate CRLF-framing SSE backends
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
            '<span class="scc-avatar">' + esc(header.avatarEmoji || "◆") + "</span>" +
            '<div class="scc-head-text"><span class="scc-title">' + esc(header.title || "AI Assistant") + "</span>" +
            '<span class="scc-status">' + esc(header.statusText || "") + "</span></div>" +
            '<button class="scc-close" aria-label="Close">✕</button>' +
          "</header>" +
          '<div class="scc-messages"></div>' +
          '<form class="scc-composer"><div class="scc-inputbar">' +
            '<input class="scc-input" type="text" placeholder="' + esc(conversation.inputPlaceholder || "Ask anything…") + '" autocomplete="off">' +
            '<button class="scc-send" type="submit" aria-label="Send">' +
              '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
                '<path class="scc-arrow" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.625 11.1 12 7.5m0 0 3.375 3.6M12 7.5v9"></path>' +
                '<rect class="scc-square" width="8" height="8" x="8" y="8" rx="2" fill="currentColor"></rect>' +
              "</svg></button></div>" +
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
      this.querySelector(".scc-close").addEventListener("click", function () {
        self.requestClose();        // ✕: chat only — the cart drawer stays open
      });
      this.querySelector(".scc-composer").addEventListener("submit", function (event) {
        event.preventDefault();
        const text = self._input.value;
        self._input.value = "";
        self.store.send(text);
      });
      // product Add + / try-asking suggestions (delegated — appended content)
      this._messages.addEventListener("click", function (event) {
        const suggestion = event.target.closest(".scc-suggestion");
        if (suggestion) { self.store.send(suggestion.dataset.text); return; }
        const addBtn = event.target.closest(".scc-product-add");
        if (addBtn && !addBtn.disabled) self._addToCart(addBtn);
      });
    }

    _subscribe() {
      const self = this;
      this.store.addEventListener("chat:user", function (e) {
        self._leaveInitialState();
        self._bubble("user", e.detail.text);
        self._showTyping();
      });
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

    /* Initial (empty) state: centered hero + "TRY ASKING" suggestion rows.
       Cleared by _leaveInitialState() when the first message is sent. */
    _welcome(conversation) {
      const header = this.spec.header || {};
      const hero = document.createElement("div");
      hero.className = "scc-hero";
      hero.innerHTML =
        '<span class="scc-hero-avatar">' + esc(header.avatarEmoji || "◆") + "</span>" +
        '<span class="scc-hero-title">' + esc(conversation.heroTitle || "Hi, I'm your stylist") + "</span>" +
        '<span class="scc-hero-subtitle">' + esc(conversation.heroSubtitle || conversation.welcomeMessage || "") + "</span>";
      this._messages.appendChild(hero);

      const replies = conversation.quickReplies || [];
      if (replies.length) {
        const tryWrap = document.createElement("div");
        tryWrap.className = "scc-try";
        const label = document.createElement("span");
        label.className = "scc-try-label";
        label.textContent = conversation.tryAskingLabel || "Try asking";
        tryWrap.appendChild(label);
        replies.forEach(function (text) {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "scc-suggestion";
          row.dataset.text = text;
          row.innerHTML = '<span class="scc-sugg-text">' + esc(text) + '</span><span class="scc-sugg-chevron">›</span>';
          tryWrap.appendChild(row);
        });
        this._messages.appendChild(tryWrap);
      }
    }

    _leaveInitialState() {
      const hero = this._messages.querySelector(".scc-hero");
      const tryWrap = this._messages.querySelector(".scc-try");
      if (!hero && !tryWrap) return;
      if (hero) hero.remove();
      if (tryWrap) tryWrap.remove();
      const day = document.createElement("div");
      day.className = "scc-day";
      const now = new Date();
      day.textContent = "Today · " + now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      this._messages.appendChild(day);
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

    requestClose() {
      this.dispatchEvent(new CustomEvent("scc:close-request", { bubbles: true, composed: true }));
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
      "z-index:2147483647;display:flex;flex-direction:column;visibility:hidden;transform:translateX(100%)}" +
      "@media (min-width:900px){.scc-dock{right:0;width:min(100vw - 480px,380px)}}" +
      ":host(.scc-open) .scc-dock{visibility:visible;transform:none}";
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
      if (input && window.matchMedia("(min-width: 900px)").matches) input.focus();
    }
    function close() {
      host.classList.remove("scc-open");
      document.dispatchEvent(new CustomEvent("sc-chat:close"));
    }

    shadow.addEventListener("scc:close-request", function () {
      close();   // chat only — the cart drawer is never closed from the chat
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
