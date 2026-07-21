/* Side Cart v2 — custom elements + SideCartStore + morph. Single classic script. */
(function () {
  "use strict";

  // saved BEFORE any patching (§5); guarded so this module can also load under the node
  // smoke-test harness (Task 1 step 3), where the `window` stub has no `fetch` — real
  // browser execution always has window.fetch, so behavior there is unchanged.
  const _fetch = window.fetch ? window.fetch.bind(window) : function () {
    return Promise.reject(new Error("fetch unavailable"));
  };

  // assigned once by boot (§6); read at call time by money()/blocks/store
  let spec = null;
  let ctx = null;

  /* ---------- §1 utils ---------- */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function groupThousands(numberString) {
    const parts = String(numberString).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");   // 1259.90 → 1,259.90
    return parts.join(".");
  }

  function money(cents) {
    const value = Number(cents || 0) / 100;
    const amount = groupThousands(value.toFixed(2));
    const whole = groupThousands(String(Math.round(value)));
    let out = String((ctx && ctx.moneyFormat) || "{{amount}}");
    out = out.replace(/\{\{\s*amount_no_decimals[^}]*\}\}/g, whole)
             .replace(/\{\{\s*amount[^}]*\}\}/g, amount);
    return out.replace(/<[^>]*>/g, ""); // some shops wrap the format in HTML spans
  }

  function readJson(id) {
    const el = document.getElementById(id);   // config JSON lives in the light DOM
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  const VAR_MAP = {
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
      .filter(function (styleKey) { return VAR_MAP[styleKey]; })
      .map(function (styleKey) {
        const styleValue = style[styleKey];
        return VAR_MAP[styleKey] + ":" + esc(typeof styleValue === "number" ? styleValue + "px" : styleValue);
      })
      .join(";");
  }

  function numericIdFromGid(gid) {
    const match = String(gid || "").match(/(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  const TRASH_ICON =
    '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M14 3h-3.53a3.07 3.07 0 00-.6-1.65C9.44.82 8.8.5 8 .5s-1.44.32-1.87.85A3.06 3.06 0 005.53 3H2a.5.5 0 000 1h1.25v10c0 .28.22.5.5.5h8.5a.5.5 0 00.5-.5V4H14a.5.5 0 000-1zM6.91 1.98c.23-.29.58-.48 1.09-.48s.85.19 1.09.48c.2.24.3.6.36 1.02h-2.9c.05-.42.17-.78.36-1.02zm4.84 11.52h-7.5V4h7.5v9.5z"/>' +
    '<path d="M6.55 5.25a.5.5 0 00-.5.5v6a.5.5 0 001 0v-6a.5.5 0 00-.5-.5zM9.45 5.25a.5.5 0 00-.5.5v6a.5.5 0 001 0v-6a.5.5 0 00-.5-.5z"/></svg>';
  const TAG_ICON =
    '<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">' +
    '<path fill-rule="evenodd" clip-rule="evenodd" d="M7 0h3a2 2 0 012 2v3a1 1 0 01-.3.7l-6 6a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4l6-6A1 1 0 017 0zm2 2a1 1 0 102 0 1 1 0 00-2 0z"/></svg>';
  const BAG_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>' +
    '<path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';

  /* §7 timer — per-visitor deadline in a first-party cookie; one interval app-wide */
  const TIMER_COOKIE_NAME = "_sc_timer_end";

  function readTimerDeadline() {
    const match = document.cookie.match(new RegExp("(?:^|; )" + TIMER_COOKIE_NAME + "=(\\d+)"));
    return match ? Number(match[1]) : null;
  }

  function writeTimerDeadline(epochMs) {
    document.cookie = TIMER_COOKIE_NAME + "=" + epochMs + ";path=/;max-age=86400;SameSite=Lax";
  }

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

  // Milestones are spaced EVENLY (marker i at (i+1)/N of the bar), like Kaching — never
  // clustered by threshold value. The fill interpolates WITHIN each equal segment so it
  // reaches marker i exactly when the total hits thresholds[i]. Returns a 0–100 percent.
  function segmentedFillPercent(total, thresholds) {
    const count = thresholds.length;
    if (!count) return 0;
    if (total >= thresholds[count - 1]) return 100;
    for (let i = 0; i < count; i++) {
      if (total < thresholds[i]) {
        const prev = i === 0 ? 0 : thresholds[i - 1];
        const span = thresholds[i] - prev;
        const withinSegment = span > 0 ? (total - prev) / span : 0;
        return ((i + Math.max(0, Math.min(1, withinSegment))) / count) * 100;
      }
    }
    return 100;
  }

  // aggregate every discount the cart carries — cart-level (order discounts) AND line-level
  // (product/collection discounts, which our footer previously missed), grouped by title.
  // Gift lines are skipped (their price-zeroing discount is represented by the FREE badge).
  function collectDiscounts(cart) {
    const byTitle = {};
    const order = [];
    function add(title, amount) {
      const key = title || "Discount";
      if (!(key in byTitle)) { byTitle[key] = 0; order.push(key); }
      byTitle[key] += amount || 0;
    }
    ((cart && cart.cart_level_discount_applications) || []).forEach(function (application) {
      add(application.title || application.code, application.total_allocated_amount);
    });
    ((cart && cart.items) || []).forEach(function (item) {
      if (item.properties && item.properties._sc_gift) return;
      (item.line_level_discount_allocations || []).forEach(function (alloc) {
        add(alloc.discount_application && alloc.discount_application.title, alloc.amount);
      });
    });
    return order.filter(function (title) { return byTitle[title] > 0; })
      .map(function (title) { return { title: title, amount: byTitle[title] }; });
  }

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

  /* ---------- §3 store — single source of truth (SRP; blocks depend only on this API) ---------- */
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  // §5 count-sync — we intercept silently, so the theme never learns about
  // programmatic changes; we update its own bubble ourselves. Extend per theme.
  const COUNT_SYNC_TARGETS = [
    { selector: ".cart-count-bubble span[aria-hidden='true']", type: "text" },   // Dawn
    { selector: "#CartCount, .header__cart-count",             type: "text" },
    { selector: "[data-cart-count]", type: "attribute", attribute: "data-cart-count" },
    { selector: ".cart-count-bubble", type: "toggle", showClass: "sc-visible" },  // Dawn dot
  ];

  const COUNT_SYNC_APPLIERS = {
    text: function (el, count) { el.textContent = count; el.removeAttribute("hidden"); },
    attribute: function (el, count, target) { el.setAttribute(target.attribute, count); },
    toggle: function (el, count, target) {
      const visible = count > 0;
      el.classList.toggle(target.showClass, visible);
      el.style.visibility = visible ? "visible" : "";   // light-DOM bubble; can't be styled from our shadow
    },
  };

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
      attempt = attempt || 0;
      const self = this;
      return _fetch(this.ctx.root + "cart.js", {
        headers: { "X-Side-Cart": "1", "Cache-Control": "no-cache" },
      }).then(function (res) {
        if (res.status === 204) {
          return _fetch(self.ctx.root + "cart/update.js", {
            method: "POST",
            headers: { "X-Side-Cart": "1", "Content-Type": "application/json" },
            body: "{}",
          }).then(function (r2) { return r2.json(); });
        }
        if (!res.ok && res.status >= 500 && attempt < 3) {
          return wait(200 * (attempt + 1)).then(function () { return self._getCart(attempt + 1); });
        }
        return res.json();
      }).catch(function () {
        if (attempt < 3) return wait(200 * (attempt + 1)).then(function () { return self._getCart(attempt + 1); });
        return null; // keep last good cart
      });
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
      const self = this;
      if (this._freeGiftBusy || !this.cart) return;
      const giftRules = progressRules(this.spec).filter(function (rule) {
        return rule.type === "FREE_GIFT" && rule.product;
      });
      if (!giftRules.length) return;
      const total = progressTotal(this.spec, this.cart);
      giftRules.forEach(function (rule) {
        const giftVariantId = numericIdFromGid(rule.product.variantId);
        if (!giftVariantId) return;
        const giftLineIndex = self.cart.items.findIndex(function (line) {
          return line.variant_id === giftVariantId && line.properties && line.properties._sc_gift;
        });
        const threshold = ruleThreshold(self.spec, rule);
        if (total >= threshold && giftLineIndex === -1) {
          self._freeGiftBusy = true;
          self.write("cart/add.js", {
            items: [{ id: giftVariantId, quantity: 1, properties: { _sc_gift: "true" } }],
          }).then(function (added) {
            self._freeGiftBusy = false;
            if (added) self.refresh();   // state now matches → next check is a no-op
          });
        } else if (total < threshold && giftLineIndex !== -1) {
          self._freeGiftBusy = true;
          self.write("cart/change.js", { line: giftLineIndex + 1, quantity: 0 })
            .then(function (nextCart) {
              self._freeGiftBusy = false;
              if (nextCart) self.setCart(nextCart);
            });
        }
      });
    }

    _syncCartCount() {
      const count = this.cart ? this.cart.item_count : 0;
      COUNT_SYNC_TARGETS.forEach(function (target) {
        document.querySelectorAll(target.selector).forEach(function (el) {
          try { COUNT_SYNC_APPLIERS[target.type](el, count, target); } catch (syncError) { /* one bad target must not stop the rest */ }
        });
      });
    }
  }

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
    PAYMENT_METHODS: "sc-payment-methods", CHAT_LAUNCHER: "sc-chat-launcher",
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
      const gift = item.properties && item.properties._sc_gift;
      const img = item.image
        ? '<img class="sc-img" src="' + esc(item.image) + '" alt="" loading="lazy">'
        : '<span class="sc-img"></span>';

      const qtyStepper = !gift && props.showQuantitySelector
        ? '<span class="sc-qty">' +
          '<button data-action="qty" data-line="' + line + '" data-qty="' + (item.quantity - 1) + '" aria-label="Decrease">−</button>' +
          '<input class="sc-qty-val" type="number" inputmode="numeric" min="0" step="1" value="' + item.quantity +
          '" data-sync-value data-action="qty-input" data-line="' + line + '" aria-label="Quantity">' +
          '<button data-action="qty" data-line="' + line + '" data-qty="' + (item.quantity + 1) + '" aria-label="Increase">+</button>' +
          "</span>"
        : "";
      const controls = gift ? "" : '<div class="sc-controls">' + this._variantHtml(item, props) + qtyStepper + "</div>";

      // line-level discount: struck-through original price + green "You save X%" pill
      const lineDiscounted = !gift && item.original_line_price > item.final_line_price;
      const savedPercent = lineDiscounted
        ? Math.round(((item.original_line_price - item.final_line_price) / item.original_line_price) * 100)
        : 0;
      const savePill = savedPercent > 0
        ? '<span class="sc-save">' + TAG_ICON + " You save " + savedPercent + "%</span>"
        : "";

      let price;
      if (gift) {
        price = '<span class="sc-badge">FREE</span>';
      } else {
        const shownPrice = props.showSingleItemPrice ? item.final_price : item.final_line_price;
        const wasPrice = props.showSingleItemPrice ? item.original_price : item.original_line_price;
        price = '<div class="sc-prices">' +
          (lineDiscounted ? '<s class="sc-price-was">' + money(wasPrice) + "</s>" : "") +
          '<span class="sc-price">' + money(shownPrice) + "</span></div>";
      }
      const remove = gift ? ""
        : '<button class="sc-remove" data-action="remove" data-line="' + line + '" aria-label="Remove">' + TRASH_ICON + "</button>";

      const titleHtml = item.url
        ? '<a class="sc-line-title" href="' + esc(item.url) + '">' + esc(item.product_title) + "</a>"
        : '<span class="sc-line-title">' + esc(item.product_title) + "</span>";

      return '<li class="sc-line" data-key="' + esc(item.key) + '">' + img +
        '<div class="sc-line-main">' + titleHtml +
        controls + "</div>" +
        '<div class="sc-line-side">' + price + savePill + remove + "</div></li>";
    }

    _variantHtml(item, props) {
      if (!props.showVariantSelector) return "";
      // single-variant products (Shopify's default "Default Title" variant) have no real
      // options — show neither a label nor a picker
      if (item.product_has_only_default_variant || !item.variant_title) return "";
      const isGiftLine = item.properties && item.properties._sc_gift;
      const staticLabel = '<span class="sc-variant">' + esc(item.variant_title) + "</span>";
      if (isGiftLine) return staticLabel;
      const cached = this._productCache.get(item.handle);
      if (!cached) { this._ensureProductLoaded(item.handle); return staticLabel; }
      if (cached.status !== "ok" || !Array.isArray(cached.data.variants) ||
          cached.data.variants.length < 2) return "";   // only one real variant → no picker
      const options = cached.data.variants.map(function (variant) {
        return '<option value="' + variant.id + '"' +
          (variant.id === item.variant_id ? " selected" : "") +
          (variant.available ? "" : " disabled") + ">" + esc(variant.title) + "</option>";
      }).join("");
      return '<select class="sc-variant-select" data-action="variant" ' +
        'data-old-variant="' + item.variant_id + '" data-line-qty="' + item.quantity + '">' +
        options + "</select>";
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
      if (!oldVariantId || !newVariantId || oldVariantId === newVariantId) return Promise.resolve();
      // cart/update.js `updates` sets ABSOLUTE quantities per variant. If the target variant
      // is already in the cart, we must merge — set it to its existing qty + the swapped qty —
      // otherwise the existing line's quantity is overwritten (e.g. swap Navy→Black with a
      // Black already present would drop Black back to 1 instead of 2).
      let existingTargetQty = 0;
      const self = this;
      ((this.store.cart && this.store.cart.items) || []).forEach(function (line) {
        const isGift = line.properties && line.properties._sc_gift;
        if (line.variant_id === newVariantId && !isGift) existingTargetQty += line.quantity;
      });
      const updates = {};
      updates[oldVariantId] = 0;
      updates[newVariantId] = existingTargetQty + lineQuantity;
      return this.store.write("cart/update.js", { updates: updates })
        .then(function (nextCart) { nextCart ? self.store.setCart(nextCart) : self.store.refresh(); });
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

  /* ---------- §5 detect — v1 logic verbatim, repackaged (contracts unchanged) ---------- */
  /* THE CONTRACT: the real request ALWAYS runs untouched; only our reaction is
     conditional; any error degrades to passthrough. */

  const ENDPOINT_MATCHERS = {                 // add endpoints here, never edit evaluate()
    add:    /\/cart\/add(\.js)?(\?|$)/,
    change: /\/cart\/change(\.js)?(\?|$)/,
    update: /\/cart\/update(\.js)?(\?|$)/,
    clear:  /\/cart\/clear(\.js)?(\?|$)/,
  };

  const NON_CART_BODY_KEYS = ["note", "sections", "attributes", "discount", "currency"];

  function classifyEndpoint(url) {
    for (const endpointName in ENDPOINT_MATCHERS) {
      if (ENDPOINT_MATCHERS[endpointName].test(url)) return endpointName;
    }
    return null;
  }

  function parseRequestBody(rawBody, headers) {
    try {
      if (!rawBody) return Promise.resolve({});
      if (typeof rawBody === "string") {
        const trimmed = rawBody.trim();
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
    const out = {};
    iterable.forEach(function (value, key) { out[key] = value; });
    return out;
  }

  function hasOnlyNonCartKeys(bodyData) {
    const keys = Object.keys(bodyData);
    return keys.length > 0 && keys.every(function (key) {
      return NON_CART_BODY_KEYS.indexOf(key.split("[")[0]) !== -1;
    });
  }

  const ENDPOINT_PREDICATES = {               // "is this a REAL cart change?"
    add: function (bodyData) {
      if (Array.isArray(bodyData.items)) return bodyData.items.length > 0;
      if (bodyData.id != null) return true;
      return Object.keys(bodyData).some(function (key) {
        return key === "id" || key.indexOf("items[") === 0;
      });
    },
    update: function (bodyData) {
      if (hasOnlyNonCartKeys(bodyData)) return false;
      const hasUpdatesObject = bodyData.updates != null;
      const hasUpdatesParams = Object.keys(bodyData).some(function (key) {
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

  function requestHasOurHeader(headers) {
    if (!headers) return false;
    if (typeof Headers !== "undefined" && headers instanceof Headers) return headers.has("X-Side-Cart");
    return Object.keys(headers).some(function (key) { return key.toLowerCase() === "x-side-cart"; });
  }

  function urlNeverOpensDrawer(url) { return /[?&]opens_cart=never/.test(url); }

  class CartInterceptor {
    constructor(store, openDrawer) { this.store = store; this.openDrawer = openDrawer; }

    start() { this._patchFetch(); this._patchXhr(); }

    // Every guard is load-bearing (spec §4.1). A guard returning true VETOES the
    // reaction. Extend by adding entries — evaluate() never changes. Built per-instance
    // (not module level) so "interceptor-paused" can close over THIS store's busy flag.
    _guards() {
      if (!this._guardList) {
        const self = this;
        this._guardList = [
          { name: "own-request",        vetoes: function (requestInfo) { return requestHasOurHeader(requestInfo.headers); } },
          { name: "interceptor-paused", vetoes: function () { return self.store.busy; } },
          { name: "explicit-ignore",    vetoes: function (requestInfo) { return /[?&]side_cart_ignore=true/.test(requestInfo.url); } },
          { name: "other-app-ocu",      vetoes: function (requestInfo) { return /[?&]ocu=/.test(requestInfo.url); } },
        ];
      }
      return this._guardList;
    }

    _guardsVeto(requestInfo) {
      return this._guards().some(function (g) {
        try { return g.vetoes(requestInfo); } catch (e) { return false; }
      });
    }

    // → null (ignore) or { endpoint, neverOpen }
    _evaluate(requestInfo) {
      if (String(requestInfo.method || "GET").toUpperCase() !== "POST") return Promise.resolve(null);
      const endpoint = classifyEndpoint(requestInfo.url);
      if (!endpoint) return Promise.resolve(null);
      if (this._guardsVeto(requestInfo)) return Promise.resolve(null);
      return parseRequestBody(requestInfo.body, requestInfo.headers).then(function (bodyData) {
        if (!ENDPOINT_PREDICATES[endpoint](bodyData)) return null;
        return { endpoint: endpoint, neverOpen: urlNeverOpensDrawer(requestInfo.url) };
      });
    }

    _react(requestInfo, response) {
      const self = this;
      this._evaluate(requestInfo).then(function (verdict) {
        if (verdict) return self._handleMutation(response.clone(), verdict);
      }).catch(function () {});
    }

    _handleMutation(response, verdict) {
      const self = this;
      try {
        if (!response.ok) return Promise.resolve();
        this.store.lastCartReactionAt = Date.now();   // tells the PO net (§5) this add is already handled
        const onCartPage = /\/cart\/?$/.test(location.pathname);
        if (!verdict.neverOpen && !onCartPage) this.openDrawer();
        let diffDone = Promise.resolve();
        if (verdict.endpoint === "add") {
          diffDone = response.json().then(function (addResponseData) {
            const addedItems = Array.isArray(addResponseData) ? addResponseData
              : Array.isArray(addResponseData.items) ? addResponseData.items
              : [addResponseData];
            const previousCart = window.__sideCartLast;
            addedItems.forEach(function (addedItem) {
              if (!addedItem || addedItem.variant_id == null) return;
              const previousLine = previousCart && previousCart.items && previousCart.items.find(
                function (line) { return line.variant_id === addedItem.variant_id; });
              const quantityAdded = addedItem.quantity - (previousLine ? previousLine.quantity : 0);
              if (quantityAdded > 0) {
                document.dispatchEvent(new CustomEvent("side-cart:item-added", {
                  detail: { item: addedItem, quantityAdded: quantityAdded },
                }));
              }
            });
          }).catch(function () {});
        }
        return diffDone.then(function () { return self.store.refresh(); });   // stashes __sideCartLast for the NEXT diff
      } catch (reactionError) { return Promise.resolve(); } // never throw into theme code
    }

    _patchFetch() {
      const self = this;
      window.fetch = function (input, init) {
        const realRequest = _fetch(input, init);            // ALWAYS runs, untouched
        try {
          const requestInfo = {
            url: typeof input === "string" ? input : (input && input.url) || "",
            method: (init && init.method) || (input && input.method) || "GET",
            headers: (init && init.headers) || (input && input.headers) || null,
            body: (init && init.body) ||
              (typeof Request !== "undefined" && input instanceof Request ? input.clone().body : null),
          };
          realRequest.then(function (response) { self._react(requestInfo, response); })
                     .catch(function () {});
        } catch (interceptError) { /* degrade to passthrough */ }
        return realRequest;
      };
    }

    _patchXhr() {
      const self = this;
      const xhrProto = window.XMLHttpRequest.prototype;
      const originalOpen = xhrProto.open, originalSend = xhrProto.send,
          originalSetHeader = xhrProto.setRequestHeader;
      xhrProto.open = function (method, url) {
        try { this._sideCart = { method: method, url: String(url), headers: {} }; } catch (e) { /* instrumentation only; degrade to passthrough */ }
        return originalOpen.apply(this, arguments);
      };
      xhrProto.setRequestHeader = function (name, value) {
        try { if (this._sideCart) this._sideCart.headers[name] = value; } catch (e) { /* instrumentation only; degrade to passthrough */ }
        return originalSetHeader.apply(this, arguments);
      };
      xhrProto.send = function (body) {
        try {
          if (this._sideCart) {
            this._sideCart.body = body;
            const xhr = this;
            xhr.addEventListener("load", function () {
              const responseLike = {
                ok: xhr.status >= 200 && xhr.status < 300,
                json: function () {
                  return Promise.resolve().then(function () { return JSON.parse(xhr.responseText); });
                },
                clone: function () { return responseLike; },
              };
              self._react(xhr._sideCart, responseLike);
            });
          }
        } catch (interceptError) { /* degrade to passthrough */ }
        return originalSend.apply(this, arguments);
      };
    }
  }

  /* PerformanceObserver safety net. Request interception is primary (it alone can read
     the add response body for the item-added diff), but a theme or app that dispatches
     its add through a fetch/XHR reference captured BEFORE our defer-loaded script patched
     window.fetch would bypass interception entirely. The resource-timing observer sees
     every /cart/* request regardless of HOW it was dispatched, so it catches those adds
     and still opens + refreshes the drawer. Two timestamps keep the paths from colliding:
       · store.lastOwnWriteAt      — set by store.write; the observer ignores OUR writes
       · store.lastCartReactionAt  — set by whichever path reacts first; the observer skips
                                      a mutation the interceptor already handled (no double
                                      reaction). */
  class CartMutationObserverNet {
    constructor(store, openDrawer) { this.store = store; this.openDrawer = openDrawer; }

    start() {
      if (typeof PerformanceObserver === "undefined") return;
      const self = this;
      try {
        const observer = new PerformanceObserver(function (list) {
          list.getEntries().forEach(function (entry) { self._reactToCartMutationUrl(entry.name); });
        });
        observer.observe({ type: "resource", buffered: false });
      } catch (observerError) { /* PO unsupported → fetch/XHR interception remains primary */ }
    }

    _reactToCartMutationUrl(url) {
      try {
        if (!url || classifyEndpoint(url) == null) return;      // only add/change/update/clear
        if (/[?&]side_cart_ignore=true/.test(url) || /[?&]ocu=/.test(url)) return;
        const now = Date.now();
        if (now - this.store.lastOwnWriteAt < 2500) return;      // our own drawer-driven write
        if (now - this.store.lastCartReactionAt < 1200) return;  // interception already reacted
        this.store.lastCartReactionAt = now;
        if (!urlNeverOpensDrawer(url) && !/\/cart\/?$/.test(location.pathname)) this.openDrawer();
        this.store.refresh();
      } catch (reactionError) { /* never throw into theme code */ }
    }
  }

  /* Native drawer suppression — three layers (hide / close / keep-shut). All lists
     are extension points; the logic below never changes for a new theme. */
  const NATIVE_CART_SELECTORS = [
    "cart-drawer", "cart-notification", "#CartDrawer", "#CartDrawer-Overlay",
    ".mini-cart", "#slidecart", ".cart-popup",
  ];
  const NATIVE_CLOSE_BUTTON_SELECTORS =
    ".drawer__close, [data-close], .cart-drawer__close, .cart-notification__close";
  const SCROLL_LOCK_CLASSES = [
    "overflow-hidden", "js-drawer-open", "t4s-lock-scroll", "cart-drawer-open",
  ];

  class NativeCartSuppressor {
    start() {
      // Layer 1 — hide: one stylesheet, every selector guarded so we never match ourselves
      const hideStyle = document.createElement("style");
      hideStyle.textContent = NATIVE_CART_SELECTORS.map(function (selector) {
        return selector + ":not(#side-cart){display:none!important;visibility:hidden!important}";
      }).join("");
      document.head.appendChild(hideStyle);
      // Layer 2 — close now
      this._closeNativeCartElements();
      // Layer 3 — keep shut: re-close anything that re-opens itself
      const self = this;
      const keepShutObserver = new MutationObserver(function () { self._closeNativeCartElements(); });
      NATIVE_CART_SELECTORS.forEach(function (selector) {
        document.querySelectorAll(selector).forEach(function (nativeEl) {
          keepShutObserver.observe(nativeEl, {
            attributes: true, attributeFilter: ["open", "aria-hidden", "class"],
          });
        });
      });
    }

    _closeNativeCartElements() {
      NATIVE_CART_SELECTORS.forEach(function (selector) {
        document.querySelectorAll(selector).forEach(function (nativeEl) {
          try {
            if (typeof nativeEl.close === "function") nativeEl.close();
            nativeEl.removeAttribute("open");
            ["active", "is-open", "animate", "open"].forEach(function (cls) {
              nativeEl.classList.remove(cls);
            });
            nativeEl.querySelectorAll(NATIVE_CLOSE_BUTTON_SELECTORS).forEach(function (closeButton) {
              closeButton.click();   // themes that only close via their own button
            });
          } catch (closeError) { /* one drawer failing must not stop the rest */ }
        });
      });
      SCROLL_LOCK_CLASSES.forEach(function (lockClass) {
        document.body.classList.remove(lockClass);
        document.documentElement.classList.remove(lockClass);
      });
    }
  }

  /* Click detector — the theme's cart icon opens OUR drawer. Extend the list per theme. */
  const CART_LINK_SELECTORS =
    'a[href$="/cart"], a[href*="/cart?"], a[href*="/cart#"], #cart-icon-bubble, ' +
    '.header__icon--cart, [data-cart-icon], [data-drawer-toggle="cart"]';

  class CartIconClicks {
    constructor(openDrawer) { this.openDrawer = openDrawer; }
    start() {
      const self = this;
      document.addEventListener("click", function (event) {
        if (event.target.closest("#sc-root")) return;      // never hijack clicks in OUR drawer
        const cartLink = event.target.closest(CART_LINK_SELECTORS);
        if (cartLink) { event.preventDefault(); event.stopPropagation(); self.openDrawer(); }
      }, true);
    }
  }

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
      "sc-timer": ScTimer, "sc-progress-bar": ScProgressBar,
      "sc-products": ScProducts, "sc-discount-code": ScDiscountCode, "sc-order-notes": ScOrderNotes,
      "sc-chat-launcher": ScChatLauncher,
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

    // While the drawer is open, lock the PAGE's scroll (saving whatever inline overflow
    // the theme had) so wheel/touch scrolling over the drawer can never move the page;
    // #sc-body's overscroll-behavior:contain (cart.css) stops chaining at the list's ends.
    let savedBodyOverflow = null;
    function openDrawer() {
      if (!host.classList.contains("sc-open")) {
        savedBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
      }
      host.classList.add("sc-open");
      document.dispatchEvent(new CustomEvent("side-cart:open"));
    }
    function closeDrawer() {
      if (host.classList.contains("sc-open")) {
        document.body.style.overflow = savedBodyOverflow || "";
        savedBodyOverflow = null;
      }
      host.classList.remove("sc-open");
      document.dispatchEvent(new CustomEvent("side-cart:close"));
    }

    shadow.addEventListener("sc:close-request", closeDrawer);
    shadow.getElementById("sc-overlay").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

    const drawer = shadow.getElementById("side-cart");
    store.addEventListener("sc:busy", function (e) { drawer.classList.toggle("sc-busy", e.detail.busy); });
    store.addEventListener("sc:update", function () {
      const empty = !store.cart || store.cart.item_count === 0;
      host.classList.toggle("sc-empty-cart", empty);
    });

    // AI chat dock (separate runtime) announces open/close on document; on desktop the
    // dock takes the right edge, so the cart shifts itself left (CSS is media-gated).
    document.addEventListener("sc-chat:open", function () { host.classList.add("sc-chat-shifted"); });
    document.addEventListener("sc-chat:close", function () { host.classList.remove("sc-chat-shifted"); });

    new CartInterceptor(store, openDrawer).start();
    new CartMutationObserverNet(store, openDrawer).start();
    new NativeCartSuppressor().start();
    new CartIconClicks(openDrawer).start();

    window.SideCart = { root: shadow, open: openDrawer, close: closeDrawer,
      refresh: function () { return store.refresh(); } };
    window.__SC_TEST__.store = store;
    store.refresh();   // first paint
  }

  // test hook — lets the harness/console reach pure units without polluting prod API
  window.__SC_TEST__ = { esc, money, groupThousands, styleVars, segmentedFillPercent,
    ruleThreshold: (s, r) => ruleThreshold(s, r), morph: null /* set in Step 2 */,
    setCtx: (c) => { ctx = c; }, setSpec: (s) => { spec = s; } };
  window.__SC_TEST__.morph = morph;
  window.__SC_TEST__.SideCartStore = SideCartStore;

  boot();
})();
