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
  var pausedWriteDepth = 0;   // >0 while any of OUR cart writes is in flight
  function interceptorIsPaused() { return pausedWriteDepth > 0; }

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
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(cents) {
    var amount = (Number(cents || 0) / 100).toFixed(2);
    var whole = String(Math.round(Number(cents || 0) / 100));
    var out = String(ctx.moneyFormat || "{{amount}}");
    out = out.replace(/\{\{\s*amount_no_decimals[^}]*\}\}/g, whole)
             .replace(/\{\{\s*amount[^}]*\}\}/g, amount);
    return out.replace(/<[^>]*>/g, ""); // some shops wrap the format in HTML spans
  }

  // stubs — real implementations land in Tasks 5–8; render() calls them from day one
  function checkFreeGift() {}                       // Task 6
  function snapshotInputs() {}                       // Task 8
  function restoreInputs() {}                        // Task 8
  function timerText() { return ""; }                // Task 7
  function progressVars() { return {}; }             // Task 6

  function tvars() {
    var vars = {
      cart_total: money(cart ? cart.total_price : 0),
      count: cart ? cart.item_count : 0,
      timer: timerText(),
    };
    var progress = progressVars();
    for (var progressKey in progress) vars[progressKey] = progress[progressKey];
    return vars;
  }

  // Escape the WHOLE template first, then substitute already-safe values.
  function fill(tpl, vars) {
    return esc(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, function (_, key) {
      return key in vars ? esc(vars[key]) : "—";
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
      .filter(function (styleKey) { return VAR_MAP[styleKey]; })
      .map(function (styleKey) {
        var styleValue = style[styleKey];
        return VAR_MAP[styleKey] + ":" + esc(typeof styleValue === "number" ? styleValue + "px" : styleValue);
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
    PRODUCTS_IN_CART: PRODUCTS_IN_CART,
  };

  function TOP_BAR(block) {
    var blockProps = block.props || {};
    var count = blockProps.showItemCount && cart
      ? ' <span class="sc-count">• ' + cart.item_count + "</span>" : "";
    return '<div class="sc-topbar"><span class="sc-title">' + esc(blockProps.title) + count +
      '</span><button class="sc-close" data-action="close" aria-label="Close">✕</button></div>';
  }

  function SUBTOTAL(block) {
    var blockProps = block.props || {};
    if (!cart) return "";
    var original = blockProps.showOriginalPrice && cart.original_total_price > cart.total_price
      ? '<s class="sc-original">' + money(cart.original_total_price) + "</s>" : "";
    return '<div class="sc-subtotal"><span>' + esc(blockProps.title) + "</span><span>" + original +
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
        .filter(function (blockKey) { return blockKey !== "style" && blocks[blockKey] && blocks[blockKey].enabled && registry[blockKey]; })
        .map(function (blockKey) { return wrap(blockKey, blocks[blockKey], safe(registry[blockKey], blocks[blockKey])); })
        .join("");
    });
    restoreInputs();
    syncCartCount(cart ? cart.item_count : 0);
  }

  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

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

  installFetchInterceptor();
  installXhrInterceptor();
  installCartIconClickDetector();
  disableNativeCart();

  /* §3 products + writes */
  function pausedWrite(path, body) {
    pausedWriteDepth += 1;
    return _fetch(ctx.root + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Side-Cart": "1" },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.ok ? res.json() : null;
    }).catch(function () {
      return null;
    }).finally(function () {
      pausedWriteDepth -= 1;
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

  function requestHasOurHeader(headers) {
    if (!headers) return false;
    if (typeof Headers !== "undefined" && headers instanceof Headers) return headers.has("X-Side-Cart");
    return Object.keys(headers).some(function (key) { return key.toLowerCase() === "x-side-cart"; });
  }

  // Every guard is load-bearing (spec §4.1). A guard returning true VETOES the
  // reaction. Extend by adding entries — evaluate() never changes.
  var INTERCEPT_GUARDS = [
    { name: "own-request",       vetoes: function (requestInfo) { return requestHasOurHeader(requestInfo.headers); } },
    { name: "interceptor-paused", vetoes: function () { return interceptorIsPaused(); } },
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
      case "qty": changeQty(t.dataset.line, Number(t.dataset.qty)); break;
      case "remove": changeQty(t.dataset.line, 0); break;
      case "checkout": location.href = ctx.checkoutUrl || "/checkout"; break;
      case "close": closeDrawer(); break;
    }
  }

  window.SideCart = { open: openDrawer, close: closeDrawer, refresh: refreshCart };
})();
