/*
 * AI Side Cart — self-contained drawer widget (vanilla JS, Shadow DOM).
 *
 * Used identically by:
 *   - the standalone demo page (/demo.html)
 *   - the Shopify theme app-embed block (Phase 5)
 *
 * Public API:
 *   window.AISideCart.init({ backend, country, theme, autoLauncher })
 *   window.AISideCart.open() / .close() / .toggle()
 *
 * Talks to the app backend:
 *   POST {backend}/api/chat  { messages, cartId } -> { reply, products, cart, checkoutUrl, cartId }
 *   POST {backend}/api/cart  { action, cartId, ... } -> { cart }
 *
 * Shadow DOM isolates our styles from the host theme. Native look (Phase 4) is
 * achieved by setting --aisc-* CSS variables on the host from detected theme.
 */
(function () {
  "use strict";
  if (window.AISideCart && window.AISideCart.__loaded) return;

  const STORE_KEY = "aisc_state_v1";

  const state = {
    backend: "",
    country: "IN",
    open: false,
    view: "chat", // 'chat' | 'cart'
    messages: [], // {role, content, products?}
    cart: null,
    cartId: null,
    productCache: {}, // variantId -> {title, image, price}
    busy: false,
  };

  let els = {}; // shadow element refs

  // ---------- utils ----------
  function money(m) {
    if (!m || m.amount == null) return "";
    const frac = Number(m.amount) % 1 === 0 ? 0 : 2;
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: m.currency || "INR",
        maximumFractionDigits: frac,
        minimumFractionDigits: frac,
      }).format(Number(m.amount));
    } catch {
      return (m.currency || "") + " " + m.amount;
    }
  }

  function persist() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ cartId: state.cartId, messages: state.messages.slice(-30), productCache: state.productCache }),
      );
    } catch {}
  }
  function restore() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      if (s.cartId) state.cartId = s.cartId;
      if (Array.isArray(s.messages)) state.messages = s.messages;
      if (s.productCache) state.productCache = s.productCache;
    } catch {}
  }

  function cacheProducts(products) {
    (products || []).forEach((p) => {
      const entry = { title: p.title, image: p.image, price: p.price };
      // Cache the image under every variant id: the cart line uses the chosen
      // size's variant id, which differs from the product's default variant.
      if (p.variantId) state.productCache[p.variantId] = entry;
      (p.variants || []).forEach((v) => { if (v && v.id) state.productCache[v.id] = entry; });
    });
  }

  async function api(path, body) {
    const res = await fetch(state.backend + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  // ---------- rendering ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function productCardHTML(p) {
    const opts = (p.variants || []).filter((v) => v.label);
    const defVariant = p.variantId || (opts[0] && opts[0].id) || "";
    if (!defVariant) return "";
    const img = p.image ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy">` : `<div class="aisc-noimg"></div>`;
    const hasSizes = p.hasOptions && opts.length > 1;
    const select = hasSizes
      ? `<select class="aisc-size" aria-label="Choose size">${opts
          .map((v) => `<option value="${esc(v.id)}" ${v.available ? "" : "disabled"}>${esc(v.label)}${v.available ? "" : " (sold out)"}</option>`)
          .join("")}</select>`
      : "";
    return `
      <div class="aisc-card" data-product="${esc(p.id)}">
        <div class="aisc-card-img">${img}</div>
        <div class="aisc-card-body">
          <div class="aisc-card-title">${esc(p.title)}</div>
          <div class="aisc-card-price">${money(p.price)}</div>
          ${select}
        </div>
        <button class="aisc-btn aisc-add" data-variant="${esc(defVariant)}" ${p.available === false ? "disabled" : ""}>
          ${p.available === false ? "Sold out" : "Add"}
        </button>
      </div>`;
  }

  function renderMessages() {
    const out = state.messages
      .map((m) => {
        if (m.role === "user") return `<div class="aisc-msg aisc-user"><div class="aisc-bubble">${esc(m.content)}</div></div>`;
        const cards = (m.products && m.products.length)
          ? `<div class="aisc-cards">${m.products.map(productCardHTML).join("")}</div>`
          : "";
        return `<div class="aisc-msg aisc-bot"><div class="aisc-bubble">${esc(m.content)}</div>${cards}</div>`;
      })
      .join("");
    els.thread.innerHTML =
      out ||
      `<div class="aisc-empty">👋 Hi! Tell me what you're shopping for — like <em>"something for hiking under ₹2000"</em>.</div>`;
    if (state.busy) els.thread.insertAdjacentHTML("beforeend", `<div class="aisc-msg aisc-bot"><div class="aisc-bubble aisc-typing"><span></span><span></span><span></span></div></div>`);
    els.thread.scrollTop = els.thread.scrollHeight;
  }

  function lineImage(l) {
    const cached = state.productCache[l.variantId];
    const img = (cached && cached.image) || l.image;
    return img ? `<img src="${esc(img)}" alt="${esc(l.title)}">` : `<div class="aisc-noimg"></div>`;
  }

  function renderCart() {
    const c = state.cart;
    const count = c ? c.totalQuantity : 0;
    els.cartCount.textContent = count;
    els.cartCount.style.display = count > 0 ? "inline-flex" : "none";

    if (!c || !c.lines || !c.lines.length) {
      els.cartBody.innerHTML = `<div class="aisc-empty">Your cart is empty. Head to Chat to find something!</div>`;
      els.cartFoot.innerHTML = "";
      return;
    }
    els.cartBody.innerHTML = c.lines
      .map(
        (l) => `
      <div class="aisc-line" data-line="${esc(l.lineId)}">
        <div class="aisc-line-img">${lineImage(l)}</div>
        <div class="aisc-line-body">
          <div class="aisc-line-title">${esc(l.title)}</div>
          <div class="aisc-line-price">${money(l.linePrice)}</div>
          <div class="aisc-qty">
            <button class="aisc-qbtn" data-act="dec" data-line="${esc(l.lineId)}">−</button>
            <span>${l.quantity}</span>
            <button class="aisc-qbtn" data-act="inc" data-line="${esc(l.lineId)}">+</button>
            <button class="aisc-remove" data-line="${esc(l.lineId)}">Remove</button>
          </div>
        </div>
      </div>`,
      )
      .join("");

    // Shopify convention: one summary row per code (total savings), and the
    // applied code shown as a removable tag.
    const applied = (c.appliedDiscounts || []).filter((d) => d.amount);
    const discountRows = applied
      .map((d) => `<div class="aisc-row aisc-discount"><span>${esc(d.code)}</span><span>&minus;${money(d.amount)}</span></div>`)
      .join("");
    const activeCodes = (c.discountCodes || []).filter((d) => d.applicable);
    const pills = activeCodes.length
      ? `<div class="aisc-pills">${activeCodes
          .map((d) => `<span class="aisc-pill">${esc(d.code)}<button class="aisc-rmdisc" data-code="${esc(d.code)}" aria-label="Remove ${esc(d.code)}">&times;</button></span>`)
          .join("")}</div>`
      : "";

    els.cartFoot.innerHTML = `
      <div class="aisc-discount-input">
        <input type="text" placeholder="Discount code" class="aisc-code" value="">
        <button class="aisc-btn aisc-ghost aisc-apply">Apply</button>
      </div>
      ${pills}
      <div class="aisc-row"><span>Subtotal</span><span>${money(c.subtotal)}</span></div>
      ${discountRows}
      <div class="aisc-row aisc-total"><span>Total</span><span>${money(c.total)}</span></div>
      <button class="aisc-btn aisc-checkout">Checkout</button>
      <div class="aisc-secure">Secure checkout on Shopify</div>`;
  }

  function renderTabs() {
    els.tabChat.classList.toggle("active", state.view === "chat");
    els.tabCart.classList.toggle("active", state.view === "cart");
    els.chatPane.style.display = state.view === "chat" ? "flex" : "none";
    els.cartPane.style.display = state.view === "cart" ? "flex" : "none";
    updateCartBar();
  }

  function render() {
    renderMessages();
    renderCart();
    renderTabs();
    updateCartBar();
    if (state.takeover) syncNativeCount();
  }

  // Mirror OUR cart count onto the store theme's header cart badge(s). Generic
  // selectors cover Horizon/Vision (ref-based) and Dawn-style themes.
  const NATIVE_COUNT_SEL = [
    "[ref='cartBubbleCount']", ".cart-bubble__text-count", ".cart-count-bubble",
    ".cart-count", "[data-cart-count]", ".header__cart-count", ".site-header__cart-count",
    ".cart-item-count", ".js-cart-count",
  ].join(", ");
  function syncNativeCount() {
    const n = state.cart ? state.cart.totalQuantity : 0;
    try {
      // Horizon reads this on page load to restore the badge across navigations.
      sessionStorage.setItem("cart-count", JSON.stringify({ value: String(n), timestamp: Date.now() }));
    } catch (e) {}
    let list;
    try { list = document.querySelectorAll(NATIVE_COUNT_SEL); } catch (e) { return; }
    list.forEach((el) => {
      const target = el.querySelector(".cart-bubble__text-count") || el;
      target.textContent = n > 0 ? String(n) : "";
      el.classList.remove("hidden", "visually-hidden", "is-empty");
      if (n === 0) el.classList.add("hidden");
      // Reveal a containing bubble that themes hide when the native cart is empty.
      const bubble = el.closest(".cart-bubble, .cart-count-bubble, [class*='bubble']");
      if (bubble && n > 0) bubble.classList.remove("hidden", "visually-hidden");
    });
  }

  // ---------- actions ----------
  async function send(text) {
    if (!text.trim() || state.busy) return;
    state.messages.push({ role: "user", content: text });
    state.busy = true;
    renderMessages();
    try {
      const r = await api("/api/chat", {
        messages: state.messages.map((m) => ({ role: m.role, content: m.content })),
        cartId: state.cartId,
      });
      if (r.cartId) state.cartId = r.cartId;
      if (r.cart) state.cart = r.cart;
      cacheProducts(r.products);
      state.messages.push({ role: "assistant", content: r.reply || "…", products: r.products || [] });
    } catch (e) {
      state.messages.push({ role: "assistant", content: "Sorry — I hit a snag reaching the store. Try again?" });
    } finally {
      state.busy = false;
      persist();
      render();
    }
  }

  async function cartOp(body) {
    state.busy = true;
    try {
      const r = await api("/api/cart", Object.assign({ cartId: state.cartId, country: state.country }, body));
      if (r.cart) {
        state.cart = r.cart;
        state.cartId = r.cart.id;
      }
    } catch (e) {
      /* keep prior cart */
    } finally {
      state.busy = false;
      persist();
      render();
    }
  }

  function flashAdded(btn) {
    const old = btn.textContent;
    btn.textContent = "Added";
    btn.classList.add("added");
    setTimeout(() => {
      btn.textContent = old;
      btn.classList.remove("added");
    }, 1200);
  }

  function currentCodes(extra) {
    const set = new Set((state.cart && state.cart.discountCodes ? state.cart.discountCodes : []).map((d) => d.code));
    if (extra) set.add(extra);
    return [...set];
  }

  let toastTimer = null;
  function showToast(msg) {
    // Redundant while the cart is already on screen.
    if (!els.toast || state.view === "cart") return;
    els.toast.querySelector(".aisc-toast-txt").textContent = msg;
    els.toast.classList.remove("aisc-toast-hide");
    els.toast.style.display = "flex";
    // Restart the entrance animation on repeat shows.
    els.toast.style.animation = "none";
    void els.toast.offsetWidth;
    els.toast.style.animation = "";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 3000);
  }
  function hideToast() {
    if (!els.toast) return;
    els.toast.classList.add("aisc-toast-hide");
    setTimeout(() => {
      if (els.toast) { els.toast.style.display = "none"; els.toast.classList.remove("aisc-toast-hide"); }
    }, 200);
  }

  function updateCartBar() {
    if (!els.cartbar) return;
    const n = state.cart ? state.cart.totalQuantity : 0;
    if (n > 0 && state.view === "chat") {
      els.cartbarTxt.textContent = n + (n === 1 ? " item in your cart" : " items in your cart");
      els.cartbar.style.display = "flex";
    } else {
      els.cartbar.style.display = "none";
    }
  }

  // ---------- open/close ----------
  function open() {
    state.open = true;
    els.root.classList.add("aisc-open");
    render();
  }
  function close() {
    state.open = false;
    els.root.classList.remove("aisc-open");
  }
  function toggle() {
    state.open ? close() : open();
  }

  // ---------- build DOM ----------
  function build() {
    const host = document.createElement("div");
    host.id = "ai-side-cart-host";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = TEMPLATE();
    document.body.appendChild(host);

    const $ = (s) => shadow.querySelector(s);
    els = {
      host,
      shadow,
      root: $(".aisc-root"),
      launcher: $(".aisc-launcher"),
      overlay: $(".aisc-overlay"),
      panel: $(".aisc-panel"),
      thread: $(".aisc-thread"),
      input: $(".aisc-input"),
      sendBtn: $(".aisc-send"),
      tabChat: $(".aisc-tab-chat"),
      tabCart: $(".aisc-tab-cart"),
      cartCount: $(".aisc-cart-count"),
      chatPane: $(".aisc-chat-pane"),
      cartPane: $(".aisc-cart-pane"),
      cartBody: $(".aisc-cart-body"),
      cartFoot: $(".aisc-cart-foot"),
      closeBtn: $(".aisc-close"),
      cartbar: $(".aisc-cartbar"),
      cartbarTxt: $(".aisc-cartbar-txt"),
      toast: $(".aisc-toast"),
      toastGo: $(".aisc-toast-go"),
    };

    const goCart = () => { state.view = "cart"; renderTabs(); hideToast(); };

    // events
    els.launcher.addEventListener("click", open);
    els.closeBtn.addEventListener("click", close);
    els.overlay.addEventListener("click", close);
    els.tabChat.addEventListener("click", () => { state.view = "chat"; renderTabs(); });
    els.tabCart.addEventListener("click", () => { state.view = "cart"; renderTabs(); });
    els.cartbar.addEventListener("click", goCart);
    els.toastGo.addEventListener("click", goCart);
    els.sendBtn.addEventListener("click", () => { const v = els.input.value; els.input.value = ""; send(v); });
    els.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); const v = els.input.value; els.input.value = ""; send(v); }
    });

    // delegated clicks (cards, cart controls)
    shadow.addEventListener("click", async (e) => {
      const add = e.target.closest(".aisc-add");
      if (add) {
        const card = add.closest(".aisc-card");
        const sel = card && card.querySelector(".aisc-size");
        const variantId = sel ? sel.value : add.dataset.variant;
        if (!variantId) return;
        flashAdded(add);
        await cartOp({ action: "add", variantId });
        showToast("Added to cart");
        return;
      }
      const q = e.target.closest(".aisc-qbtn");
      if (q) {
        const line = state.cart.lines.find((l) => l.lineId === q.dataset.line);
        if (!line) return;
        const qty = q.dataset.act === "inc" ? line.quantity + 1 : line.quantity - 1;
        await cartOp({ action: "setqty", lineId: q.dataset.line, quantity: qty });
        return;
      }
      const rm = e.target.closest(".aisc-remove");
      if (rm) { await cartOp({ action: "remove", lineId: rm.dataset.line }); return; }
      const apply = e.target.closest(".aisc-apply");
      if (apply) {
        const code = els.cartFoot.querySelector(".aisc-code").value.trim();
        if (code) await cartOp({ action: "discount", codes: currentCodes(code) });
        return;
      }
      const rmDisc = e.target.closest(".aisc-rmdisc");
      if (rmDisc) {
        await cartOp({ action: "discount", codes: currentCodes().filter((c) => c !== rmDisc.dataset.code) });
        return;
      }
      const co = e.target.closest(".aisc-checkout");
      if (co && state.cart && state.cart.checkoutUrl) { window.top.location.href = state.cart.checkoutUrl; }
    });
  }

  async function refreshCart() {
    if (state.cartId) await cartOp({ action: "get" });
  }

  // ---------- native look: read theme styles into --aisc-* vars ----------
  function parseRGB(str) {
    const m = String(str || "").match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    const p = m[1].split(",").map((s) => parseFloat(s.trim()));
    if (p[3] === 0) return null; // fully transparent
    return { r: p[0], g: p[1], b: p[2] };
  }
  function luminance(c) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function rgbStr(c) { return `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`; }

  function findThemeButton() {
    const sels = [
      ".product-form__submit", 'button[name="add"]', '[data-add-to-cart]',
      ".shopify-payment-button__button", ".button--primary", ".btn--primary",
      "button.button", ".button", ".btn", "button[type='submit']",
    ];
    for (const s of sels) {
      const list = document.querySelectorAll(s);
      for (const el of list) {
        const cs = getComputedStyle(el);
        const bg = parseRGB(cs.backgroundColor);
        if (bg && luminance(bg) < 0.92) return { el, cs, bg }; // skip near-white ghost buttons
      }
    }
    return null;
  }

  function detectTheme() {
    if (!els.root) return;
    try {
      const bodyCS = getComputedStyle(document.body);
      const set = (k, v) => v && els.root.style.setProperty(k, v);

      if (bodyCS.fontFamily) set("--aisc-font", bodyCS.fontFamily);
      const fg = parseRGB(bodyCS.color);
      if (fg) {
        set("--aisc-fg", rgbStr(fg));
        // Subtle theme-tinted surfaces so chat bubbles and borders match the store.
        set("--aisc-bubble-bg", `rgba(${fg.r},${fg.g},${fg.b},0.06)`);
        set("--aisc-border", `rgba(${fg.r},${fg.g},${fg.b},0.14)`);
      }

      let bg = parseRGB(getComputedStyle(document.body).backgroundColor)
        || parseRGB(getComputedStyle(document.documentElement).backgroundColor);
      if (bg) set("--aisc-bg", rgbStr(bg));

      // Heading font: many themes pair a display/serif heading with a sans body.
      // Pull it into the drawer's titles so it echoes the store's character.
      const hEl = document.querySelector("h1, h2, .h1, .h2, [class*='title'] h1, [class*='title'] h2");
      if (hEl) {
        const hf = getComputedStyle(hEl).fontFamily;
        if (hf) set("--aisc-heading-font", hf);
      }

      const btn = findThemeButton();
      if (btn) {
        set("--aisc-primary", rgbStr(btn.bg));
        const bfg = parseRGB(btn.cs.color);
        set("--aisc-primary-fg", bfg ? rgbStr(bfg) : (luminance(btn.bg) > 0.5 ? "#111111" : "#ffffff"));
        const rad = parseFloat(btn.cs.borderRadius);
        if (!isNaN(rad)) set("--aisc-radius", Math.min(rad, 16) + "px");
      }
    } catch (e) {}
  }

  // ---------- cart takeover: route native add-to-cart into our cart ----------
  function toGid(id) {
    id = String(id);
    if (id.indexOf("gid://") === 0) return id;
    if (/^\d+$/.test(id)) return "gid://shopify/ProductVariant/" + id;
    return id;
  }
  function extractAdds(body) {
    const out = [];
    const push = (id, q) => { if (id != null && id !== "") out.push({ id: id, quantity: Number(q || 1) || 1 }); };
    try {
      if (typeof FormData !== "undefined" && body instanceof FormData) {
        push(body.get("id"), body.get("quantity"));
      } else if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
        push(body.get("id"), body.get("quantity"));
      } else if (typeof body === "string" && body) {
        try {
          const j = JSON.parse(body);
          if (Array.isArray(j.items)) j.items.forEach((it) => push(it.id, it.quantity));
          else push(j.id, j.quantity);
        } catch (_) {
          const p = new URLSearchParams(body);
          push(p.get("id"), p.get("quantity"));
        }
      }
    } catch (e) {}
    return out;
  }
  async function handleStorefrontAdds(adds) {
    if (!adds || !adds.length) return;
    const og = document.querySelector('meta[property="og:image"]');
    open();
    state.view = "cart";
    renderTabs();
    for (const a of adds) {
      const gid = toGid(a.id);
      if (og && og.content && !state.productCache[gid]) state.productCache[gid] = { image: og.content };
      await cartOp({ action: "add", variantId: gid, quantity: a.quantity });
    }
  }

  function hijackNativeCart() {
    const isAdd = (u) => typeof u === "string" && /\/cart\/add(\.js)?(\?|$|#)/i.test(u);

    // fetch (modern themes)
    const of = window.fetch;
    if (of && !of.__aisc) {
      const wrapped = function (input, init) {
        try {
          const url = typeof input === "string" ? input : (input && input.url) || "";
          const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
          if (method === "POST" && isAdd(url)) {
            const adds = extractAdds((init && init.body) || (input && input.body));
            if (adds.length) {
              handleStorefrontAdds(adds);
              return Promise.resolve(new Response(JSON.stringify({ items: [], sections: {} }), {
                status: 200, headers: { "Content-Type": "application/json" },
              }));
            }
          }
        } catch (e) {}
        return of.apply(this, arguments);
      };
      wrapped.__aisc = true;
      window.fetch = wrapped;
    }

    // XMLHttpRequest (older themes)
    const xo = XMLHttpRequest.prototype.open;
    if (!xo.__aisc) {
      const xs = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        this.__aiscAdd = String(method).toUpperCase() === "POST" && isAdd(url);
        return xo.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function (body) {
        if (this.__aiscAdd) {
          const adds = extractAdds(body);
          if (adds.length) {
            handleStorefrontAdds(adds);
            const self = this;
            try {
              Object.defineProperty(self, "readyState", { value: 4, configurable: true });
              Object.defineProperty(self, "status", { value: 200, configurable: true });
              Object.defineProperty(self, "responseText", { value: '{"items":[],"sections":{}}', configurable: true });
              Object.defineProperty(self, "response", { value: '{"items":[],"sections":{}}', configurable: true });
            } catch (e) {}
            try { if (typeof self.onreadystatechange === "function") self.onreadystatechange(); } catch (e) {}
            try { if (typeof self.onload === "function") self.onload(); } catch (e) {}
            try { self.dispatchEvent(new Event("load")); } catch (e) {}
            return;
          }
        }
        return xs.apply(this, arguments);
      };
      XMLHttpRequest.prototype.open.__aisc = true;
    }

    // plain (non-Ajax) form posts to /cart/add
    document.addEventListener("submit", function (e) {
      const form = e.target;
      if (!form || !form.action || !/\/cart\/add/i.test(form.action)) return;
      const idEl = form.querySelector('[name="id"]');
      if (!idEl || !idEl.value) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const qEl = form.querySelector('[name="quantity"]');
      handleStorefrontAdds([{ id: idEl.value, quantity: Number((qEl && qEl.value) || 1) }]);
    }, true);

    // clicking the theme's cart icon / cart links opens OUR drawer
    document.addEventListener("click", function (e) {
      if (!state.cartSelectors) return;
      let t = null;
      try { t = e.target.closest(state.cartSelectors); } catch (err) { return; }
      if (!t) return;
      // Never hijack an add-to-cart control (handled by the network intercept).
      if (t.closest('[name="add"], .product-form__submit, [data-add-to-cart], .action__cart-add')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openCart();
    }, true);

    // Horizon / Vision themes open a <cart-drawer-component> dialog rather than
    // navigating. Override its open methods so it shows OUR drawer instead.
    try {
      if (window.customElements && customElements.whenDefined) {
        customElements.whenDefined("cart-drawer-component").then(function (Ctor) {
          try {
            Ctor.prototype.open = function () { openCart(); };
            Ctor.prototype.showDialog = function () { openCart(); };
          } catch (e) {}
        }).catch(function () {});
      }
    } catch (e) {}
  }

  function openCart() {
    open();
    state.view = "cart";
    renderTabs();
  }

  // ---------- public init ----------
  function init(opts) {
    opts = opts || {};
    state.backend = (opts.backend || "").replace(/\/$/, "");
    state.country = opts.country || "IN";
    // Built-in cart triggers (covers Horizon/Vision + Dawn-style themes). We
    // always include these and append any custom selectors from the embed.
    var BUILTIN_CART_SEL =
      "[data-testid='cart-drawer-trigger'], [data-testid='cart-icon'], cart-icon, .action__cart, " +
      "a[href='/cart'], a[href$='/cart'], a[href*='/cart?'], #cart-icon-bubble, .cart-count-bubble, " +
      "[data-cart-icon], .header__icon--cart, .cart-link, .js-cart-open";
    state.cartSelectors = opts.cartSelectors ? BUILTIN_CART_SEL + ", " + opts.cartSelectors : BUILTIN_CART_SEL;
    state.takeover = !!opts.takeover;
    restore();
    if (opts.cartId) state.cartId = opts.cartId; // seed (demos / storefront handoff)
    if (opts.view === "cart" || opts.view === "chat") state.view = opts.view;
    build();
    if (opts.theme) applyTheme(opts.theme);
    // Native look: inherit the store theme's fonts/colors/buttons.
    if (opts.autoTheme) {
      detectTheme();
      window.addEventListener("load", detectTheme);
      setTimeout(detectTheme, 1200);
    }
    // Replace the native cart: route all storefront add-to-cart into our cart.
    if (opts.takeover) hijackNativeCart();
    render();
    if (state.cartId) refreshCart();
    if (opts.autoLauncher !== false) els.launcher.style.display = "flex";
    if (opts.open) open();
  }

  // Phase 4 hook: set --aisc-* vars from a detected/declared theme object.
  function applyTheme(theme) {
    const map = {
      "--aisc-primary": theme.primary,
      "--aisc-primary-fg": theme.primaryFg,
      "--aisc-font": theme.font,
      "--aisc-radius": theme.radius,
      "--aisc-fg": theme.fg,
      "--aisc-bg": theme.bg,
      "--aisc-accent": theme.accent,
    };
    Object.entries(map).forEach(([k, v]) => v && els.root.style.setProperty(k, v));
  }

  // ask(): open the drawer and send a message (used by demos and the store trigger).
  function ask(text) {
    open();
    if (text) send(text);
  }

  window.AISideCart = { init, open, close, toggle, ask, applyTheme, __loaded: true };

  // ---------- template (markup + styles) ----------
  function TEMPLATE() {
    return `<style>${CSS()}</style>
    <div class="aisc-root">
      <button class="aisc-launcher" aria-label="Open AI shopping assistant">
        <span class="aisc-launcher-ic">✨</span><span>Ask AI</span>
      </button>
      <div class="aisc-overlay"></div>
      <aside class="aisc-panel" role="dialog" aria-label="AI shopping assistant">
        <header class="aisc-head">
          <div class="aisc-brand"><span class="aisc-brand-ic">✨</span> Shopping Assistant</div>
          <button class="aisc-close" aria-label="Close">✕</button>
        </header>
        <div class="aisc-tabs">
          <button class="aisc-tab aisc-tab-chat active">Chat</button>
          <button class="aisc-tab aisc-tab-cart">Cart <span class="aisc-cart-count">0</span></button>
        </div>
        <section class="aisc-chat-pane">
          <div class="aisc-thread"></div>
          <button class="aisc-cartbar" style="display:none">
            <span class="aisc-cartbar-txt"></span><span class="aisc-cartbar-go">View cart</span>
          </button>
          <div class="aisc-composer">
            <input class="aisc-input" type="text" placeholder="Ask for anything..." />
            <button class="aisc-send aisc-btn" aria-label="Send">Send</button>
          </div>
        </section>
        <section class="aisc-cart-pane">
          <div class="aisc-cart-body"></div>
          <div class="aisc-cart-foot"></div>
        </section>
        <div class="aisc-toast" style="display:none">
          <span class="aisc-toast-txt">Added to cart</span>
          <button class="aisc-toast-go">View cart</button>
        </div>
      </aside>
    </div>`;
  }

  function CSS() {
    return `
    :host, .aisc-root {
      --aisc-bg: #ffffff; --aisc-fg: #1a1a2e; --aisc-muted: #6b7280;
      --aisc-border: #e6e6ef; --aisc-primary: #1a1a2e; --aisc-primary-fg: #ffffff;
      --aisc-accent: #16a34a; --aisc-radius: 12px;
      --aisc-bubble-bg: #f3f3f8;
      --aisc-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      --aisc-heading-font: var(--aisc-font);
    }
    * { box-sizing: border-box; }
    .aisc-root { font-family: var(--aisc-font); color: var(--aisc-fg); }

    .aisc-launcher {
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; display: none;
      align-items: center; gap: 8px; padding: 12px 18px; border: none; cursor: pointer;
      background: var(--aisc-primary); color: var(--aisc-primary-fg);
      border-radius: 999px; font: inherit; font-weight: 600; font-size: 15px;
      box-shadow: 0 6px 24px rgba(0,0,0,.18);
    }
    .aisc-launcher-ic { font-size: 17px; }

    .aisc-overlay {
      position: fixed; inset: 0; background: rgba(15,15,30,.35); opacity: 0; visibility: hidden;
      transition: opacity .25s; z-index: 2147483100;
    }
    .aisc-panel {
      position: fixed; top: 0; right: 0; height: 100%; width: 420px; max-width: 100vw;
      background: var(--aisc-bg); z-index: 2147483200; display: flex; flex-direction: column;
      transform: translateX(100%); transition: transform .28s cubic-bezier(.4,0,.2,1);
      box-shadow: -8px 0 40px rgba(0,0,0,.16);
    }
    .aisc-root.aisc-open .aisc-overlay { opacity: 1; visibility: visible; }
    .aisc-root.aisc-open .aisc-panel { transform: translateX(0); }

    .aisc-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 18px; border-bottom: 1px solid var(--aisc-border);
    }
    .aisc-brand { font-family: var(--aisc-heading-font); font-weight: 700; font-size: 16px; display: flex; align-items: center; gap: 8px; }
    .aisc-card-title, .aisc-line-title { font-family: var(--aisc-heading-font); }
    .aisc-total { font-family: var(--aisc-heading-font); }
    .aisc-close { background: none; border: none; font-size: 18px; cursor: pointer; color: var(--aisc-muted); }

    .aisc-tabs { display: flex; border-bottom: 1px solid var(--aisc-border); }
    .aisc-tab {
      flex: 1; padding: 12px; background: none; border: none; cursor: pointer; font: inherit;
      font-weight: 600; color: var(--aisc-muted); border-bottom: 2px solid transparent;
    }
    .aisc-tab.active { color: var(--aisc-fg); border-bottom-color: var(--aisc-primary); }
    .aisc-cart-count {
      display: none; align-items: center; justify-content: center; min-width: 18px; height: 18px;
      padding: 0 5px; border-radius: 999px; background: var(--aisc-primary); color: var(--aisc-primary-fg);
      font-size: 11px; margin-left: 4px; vertical-align: middle;
    }

    .aisc-chat-pane, .aisc-cart-pane { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .aisc-thread { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .aisc-empty { color: var(--aisc-muted); text-align: center; margin: auto; padding: 24px; line-height: 1.5; }

    .aisc-msg { display: flex; flex-direction: column; max-width: 100%; }
    .aisc-user { align-items: flex-end; }
    .aisc-bot { align-items: flex-start; }
    .aisc-bubble {
      padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.45; max-width: 85%;
      white-space: pre-wrap; word-wrap: break-word;
    }
    .aisc-user .aisc-bubble { background: var(--aisc-primary); color: var(--aisc-primary-fg); border-bottom-right-radius: 4px; }
    .aisc-bot .aisc-bubble { background: var(--aisc-bubble-bg); color: var(--aisc-fg); border-bottom-left-radius: 4px; }

    .aisc-typing { display: inline-flex; gap: 4px; }
    .aisc-typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--aisc-muted); animation: aisc-blink 1.2s infinite both; }
    .aisc-typing span:nth-child(2){animation-delay:.2s} .aisc-typing span:nth-child(3){animation-delay:.4s}
    @keyframes aisc-blink { 0%,80%,100%{opacity:.3} 40%{opacity:1} }

    .aisc-cards { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; width: 100%; }
    .aisc-card {
      display: grid; grid-template-columns: 56px 1fr auto; align-items: center; gap: 10px;
      padding: 8px; border: 1px solid var(--aisc-border); border-radius: var(--aisc-radius); background: var(--aisc-bg);
    }
    .aisc-card-img, .aisc-line-img { width: 56px; height: 56px; border-radius: 8px; overflow: hidden; background: #f0f0f5; }
    .aisc-card-img img, .aisc-line-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .aisc-noimg { width: 100%; height: 100%; background: linear-gradient(135deg,#eee,#f7f7fb); }
    .aisc-card-title { font-size: 13px; font-weight: 600; line-height: 1.3; }
    .aisc-card-price { font-size: 13px; color: var(--aisc-muted); margin-top: 2px; }

    .aisc-btn {
      background: var(--aisc-primary); color: var(--aisc-primary-fg); border: none; cursor: pointer;
      font: inherit; font-weight: 600; font-size: 13px; padding: 8px 14px; border-radius: 999px;
    }
    .aisc-add { padding: 7px 14px; }
    .aisc-add.added { background: var(--aisc-accent); }
    .aisc-add:disabled { opacity: .5; cursor: not-allowed; }
    .aisc-ghost { background: transparent; color: var(--aisc-fg); border: 1px solid var(--aisc-border); }

    .aisc-composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--aisc-border); }
    .aisc-input {
      flex: 1; padding: 11px 14px; border: 1px solid var(--aisc-border); border-radius: 999px;
      font: inherit; font-size: 14px; outline: none; color: var(--aisc-fg); background: var(--aisc-bg);
    }
    .aisc-input:focus { border-color: var(--aisc-primary); }

    .aisc-cart-body { flex: 1; overflow-y: auto; padding: 12px 16px; }
    .aisc-line { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--aisc-border); }
    .aisc-line-body { flex: 1; }
    .aisc-line-title { font-size: 14px; font-weight: 600; }
    .aisc-line-price { font-size: 14px; color: var(--aisc-muted); margin: 2px 0 8px; }
    .aisc-qty { display: flex; align-items: center; gap: 8px; }
    .aisc-qbtn { width: 26px; height: 26px; border: 1px solid var(--aisc-border); background: var(--aisc-bg); border-radius: 6px; cursor: pointer; font-size: 15px; color: var(--aisc-fg); }
    .aisc-remove { margin-left: auto; background: none; border: none; color: var(--aisc-muted); cursor: pointer; font-size: 12px; text-decoration: underline; }

    .aisc-cart-foot { padding: 14px 16px; border-top: 1px solid var(--aisc-border); }
    .aisc-discount-input { display: flex; gap: 8px; margin-bottom: 12px; }
    .aisc-code { flex: 1; padding: 9px 12px; border: 1px solid var(--aisc-border); border-radius: 8px; font: inherit; font-size: 13px; }
    .aisc-row { display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0; }
    .aisc-discount { color: var(--aisc-accent); }
    .aisc-total { font-weight: 700; font-size: 16px; border-top: 1px solid var(--aisc-border); margin-top: 6px; padding-top: 10px; }
    .aisc-checkout { width: 100%; padding: 14px; margin-top: 12px; font-size: 15px; border-radius: var(--aisc-radius); }
    .aisc-secure { text-align: center; font-size: 12px; color: var(--aisc-muted); margin-top: 8px; }

    .aisc-size {
      margin-top: 8px; width: 100%; padding: 7px 10px; font: inherit; font-size: 13px;
      border: 1px solid var(--aisc-border); border-radius: 8px; background: var(--aisc-bg); color: var(--aisc-fg);
    }

    .aisc-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .aisc-pill {
      display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600;
      background: rgba(22,163,74,.1); color: var(--aisc-accent); border: 1px solid rgba(22,163,74,.35);
      padding: 4px 6px 4px 10px; border-radius: 999px;
    }
    .aisc-rmdisc { border: none; background: none; color: var(--aisc-accent); cursor: pointer; font-size: 15px; line-height: 1; padding: 0 2px; }

    .aisc-cartbar {
      display: none; align-items: center; justify-content: space-between; gap: 10px; margin: 0 12px 10px;
      padding: 11px 16px; border: none; cursor: pointer; font: inherit; font-weight: 600; font-size: 14px;
      background: var(--aisc-primary); color: var(--aisc-primary-fg); border-radius: var(--aisc-radius);
    }
    .aisc-cartbar-go { opacity: .85; font-size: 13px; }

    .aisc-toast {
      position: absolute; left: 16px; right: 16px; top: 104px; z-index: 6; display: flex;
      align-items: center; justify-content: space-between; gap: 12px; padding: 11px 12px 11px 16px;
      background: var(--aisc-fg); color: var(--aisc-bg); border-radius: 999px;
      box-shadow: 0 12px 32px rgba(0,0,0,.28); font-size: 14px; font-weight: 600;
      animation: aisc-toast-in .32s cubic-bezier(.34,1.56,.64,1);
    }
    .aisc-toast.aisc-toast-hide { animation: aisc-toast-out .2s ease forwards; }
    .aisc-toast-go { background: var(--aisc-bg); color: var(--aisc-fg); border: none; border-radius: 999px; padding: 7px 16px; font: inherit; font-weight: 700; font-size: 13px; cursor: pointer; white-space: nowrap; }
    @keyframes aisc-toast-in { 0% { opacity: 0; transform: translateY(-14px) scale(.97); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes aisc-toast-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-10px); } }

    @media (max-width: 480px) { .aisc-panel { width: 100vw; } }
    `;
  }
})();
