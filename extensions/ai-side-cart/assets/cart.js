/* Side Cart runtime — single classic-script IIFE. No modules, no build. */
(function () {
  "use strict";

  const _fetch = window.fetch.bind(window); // saved BEFORE any patching (Task 4)

  function readJson(id) {
    const el = document.getElementById(id);   // config JSON lives in the light DOM
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  const spec = readJson("sc-spec") || window.__SC_SPEC__ || null;
  const ctx = readJson("sc-ctx") || { root: "/", moneyFormat: "{{amount}}", currency: "", locale: "", checkoutUrl: "/checkout" };
  const host = document.getElementById("sc-root");
  if (!spec || !host) return; // no spec / no mount → silent no-op, theme cart untouched

  // Render the whole widget inside a Shadow DOM so the theme's CSS can't leak in and
  // ours can't leak out. The stylesheet is injected INTO the shadow via <link> (an
  // external <link> in the page's light DOM would not cross the shadow boundary).
  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
  // keep the host non-empty in the LIGHT DOM: all real content lives in the shadow, which
  // leaves #sc-root matching `div:empty{display:none}` rules some themes ship (Dawn). This
  // unslotted, unrendered sentinel makes :empty never match (belt-and-suspenders with :host).
  if (!host.firstChild) host.appendChild(document.createElement("span"));
  function $(id) { return shadow.getElementById(id); }   // every widget query is shadow-scoped

  let cart = null;
  let notesOpen = false;
  let pausedWriteDepth = 0;   // >0 while any of OUR cart writes is in flight
  function interceptorIsPaused() { return pausedWriteDepth > 0; }

  shadow.innerHTML =
    (ctx.cssUrl ? '<link rel="stylesheet" href="' + esc(ctx.cssUrl) + '">' : "") +
    '<div id="sc-overlay" data-action="close"></div>' +
    '<aside id="side-cart" role="dialog" aria-modal="true" aria-label="Cart">' +
    '<div id="sc-header"></div><div id="sc-body"></div><div id="sc-footer"></div>' +
    '</aside>';

  // The .sc-open state class lives on the light-DOM host; CSS reacts via :host(.sc-open)
  function openDrawer() {
    host.classList.add("sc-open");
    document.dispatchEvent(new CustomEvent("side-cart:open"));
  }
  function closeDrawer() {
    host.classList.remove("sc-open");
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

  function groupThousands(numberString) {
    const parts = String(numberString).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");   // 1259.90 → 1,259.90
    return parts.join(".");
  }

  function money(cents) {
    const value = Number(cents || 0) / 100;
    const amount = groupThousands(value.toFixed(2));
    const whole = groupThousands(String(Math.round(value)));
    let out = String(ctx.moneyFormat || "{{amount}}");
    out = out.replace(/\{\{\s*amount_no_decimals[^}]*\}\}/g, whole)
             .replace(/\{\{\s*amount[^}]*\}\}/g, amount);
    return out.replace(/<[^>]*>/g, ""); // some shops wrap the format in HTML spans
  }

  function tvars() {
    const vars = {
      cart_total: money(cart ? cart.total_price : 0),
      count: cart ? cart.item_count : 0,
      timer: timerText(),
    };
    const progress = progressVars();
    for (const progressKey in progress) vars[progressKey] = progress[progressKey];
    return vars;
  }

  // Escape the WHOLE template first, then substitute already-safe values.
  function fill(tpl, vars) {
    return esc(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, function (_, key) {
      return key in vars ? esc(vars[key]) : "—";
    });
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

  function applyTokens() {
    // custom properties set on the light-DOM host inherit across the shadow boundary
    host.style.cssText = styleVars(spec.general || {});
  }

  function wrap(type, block, inner) {
    if (!inner) return "";
    const vars = styleVars(block.style);
    return '<div class="sc-block sc-blk-' + esc(type) + '"' +
      (vars ? ' style="' + vars + '"' : "") + ">" + inner + "</div>";
  }

  function safe(fn, block) {
    try { return fn(block) || ""; } catch (e) { return ""; } // broken block never breaks the cart
  }

  const registry = {
    TOP_BAR: TOP_BAR,
    SUBTOTAL: SUBTOTAL,
    CHECKOUT_BUTTON: CHECKOUT_BUTTON,
    PRODUCTS_IN_CART: PRODUCTS_IN_CART,
    PROGRESS_BAR: PROGRESS_BAR,
    TIMER: TIMER,
    DISCOUNT_CODE: DISCOUNT_CODE,
    ORDER_NOTES: ORDER_NOTES,
    TRUST_BADGES: TRUST_BADGES,
    PAYMENT_METHODS: PAYMENT_METHODS,
  };

  function TOP_BAR(block) {
    const blockProps = block.props || {};
    const count = blockProps.showItemCount && cart
      ? ' <span class="sc-count">• ' + cart.item_count + "</span>" : "";
    return '<div class="sc-topbar"><span class="sc-title">' + esc(blockProps.title) + count +
      '</span><button class="sc-close" data-action="close" aria-label="Close">✕</button></div>';
  }

  function SUBTOTAL(block) {
    const blockProps = block.props || {};
    if (!cart) return "";
    // cart-level discounts (e.g. "big savings −Rs. X") shown as their own rows above the total
    const discountRows = ((cart.cart_level_discount_applications) || [])
      .map(function (application) {
        return '<div class="sc-disc-line"><span class="sc-disc-label">Discounts</span>' +
          '<span class="sc-disc-chip">' + TAG_ICON + " " + esc(application.title) + "</span>" +
          '<span class="sc-disc-amt">-' + money(application.total_allocated_amount) + "</span></div>";
      }).join("");
    const original = blockProps.showOriginalPrice && cart.original_total_price > cart.total_price
      ? '<s class="sc-original">' + money(cart.original_total_price) + "</s>" : "";
    return '<div class="sc-summary">' + discountRows +
      '<div class="sc-subtotal"><span>' + esc(blockProps.title) + "</span><span>" + original +
      '<span class="sc-discounted">' + money(cart.total_price) + "</span></span></div></div>";
  }

  function CHECKOUT_BUTTON(block) {
    return '<button class="sc-checkout" data-action="checkout">' +
      fill((block.props || {}).title, tvars()) + "</button>" +
      '<button class="sc-continue" data-action="close">continue shopping</button>';
  }

  // when the cart is empty, Kaching hides every functional block and shows only the
  // header + a centered empty state; only these block types render in that case
  const EMPTY_ALLOWED = { TOP_BAR: true, PRODUCTS_IN_CART: true };

  function render() {
    snapshotInputs();
    applyTokens();
    const isEmpty = !cart || !cart.items || cart.items.length === 0;
    host.classList.toggle("sc-empty-cart", isEmpty);   // CSS hooks off the light-DOM host
    ["header", "body", "footer"].forEach(function (region) {
      const host = $("sc-" + region);
      const blocks = spec[region] || {};
      if (blocks.style) host.style.cssText = styleVars(blocks.style);
      host.innerHTML = Object.keys(blocks)
        .filter(function (blockKey) {
          return blockKey !== "style" && blocks[blockKey] && blocks[blockKey].enabled && registry[blockKey] &&
            (!isEmpty || EMPTY_ALLOWED[blockKey]);   // suppress functional blocks on an empty cart
        })
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
    trackUnlockCrossings();
    maybeResetTimerOnAdd();
    checkFreeGift();
    render();
    document.dispatchEvent(new CustomEvent("side-cart:updated", { detail: { cart: cart } }));
  }

  function refreshCart() {
    return getCart().then(setCart);
  }

  /* §3 products + writes */
  // dim + disable the checkout and apply-discount buttons while any of OUR writes is
  // in flight (Kaching-style "cart is updating"); driven purely by pausedWriteDepth
  function reflectBusy() {
    const drawer = $("side-cart");
    if (drawer) drawer.classList.toggle("sc-busy", pausedWriteDepth > 0);
  }

  function pausedWrite(path, body) {
    pausedWriteDepth += 1;
    lastOwnWriteAt = Date.now();   // so the PerformanceObserver net (§4) ignores our own writes
    reflectBusy();
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
      reflectBusy();
    });
  }

  function changeQty(line, qty) {
    return pausedWrite("cart/change.js", { line: Number(line), quantity: Math.max(0, Number(qty)) })
      .then(function (next) { next ? setCart(next) : refreshCart(); });
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

  function lineHtml(item, line, blockProps) {
    const gift = item.properties && item.properties._sc_gift;
    const img = item.image
      ? '<img class="sc-img" src="' + esc(item.image) + '" alt="" loading="lazy">'
      : '<span class="sc-img"></span>';

    const qtyStepper = !gift && blockProps.showQuantitySelector
      ? '<span class="sc-qty">' +
        '<button data-action="qty" data-line="' + line + '" data-qty="' + (item.quantity - 1) + '" aria-label="Decrease">−</button>' +
        '<span class="sc-qty-val">' + item.quantity + "</span>" +
        '<button data-action="qty" data-line="' + line + '" data-qty="' + (item.quantity + 1) + '" aria-label="Increase">+</button>' +
        "</span>"
      : "";
    const controls = gift ? "" : '<div class="sc-controls">' + variantHtml(item, blockProps) + qtyStepper + "</div>";

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
      const shownPrice = blockProps.showSingleItemPrice ? item.final_price : item.final_line_price;
      const wasPrice = blockProps.showSingleItemPrice ? item.original_price : item.original_line_price;
      price = (lineDiscounted ? '<s class="sc-price-was">' + money(wasPrice) + "</s>" : "") +
        '<span class="sc-price">' + money(shownPrice) + "</span>";
    }
    const remove = gift ? ""
      : '<button class="sc-remove" data-action="remove" data-line="' + line + '" aria-label="Remove">' + TRASH_ICON + "</button>";

    const titleHtml = item.url
      ? '<a class="sc-line-title" href="' + esc(item.url) + '">' + esc(item.product_title) + "</a>"
      : '<span class="sc-line-title">' + esc(item.product_title) + "</span>";

    return '<li class="sc-line">' + img +
      '<div class="sc-line-main">' + titleHtml +
      controls + "</div>" +
      '<div class="sc-line-side">' + price + savePill + remove + "</div></li>";
  }

  function PRODUCTS_IN_CART(block) {
    const p = block.props || {};
    if (!cart || !cart.items || !cart.items.length) {
      return '<div class="sc-empty">' + BAG_ICON +
        '<span>' + esc(p.emptyText || "Your cart is empty.") + "</span></div>";
    }
    return '<ul class="sc-lines">' + cart.items.map(function (item, i) {
      return lineHtml(item, i + 1, p);
    }).join("") + "</ul>";
  }

  /* §4 detect — network interception. THE CONTRACT: the real request ALWAYS runs
     untouched; only our reaction is conditional; any error degrades to passthrough. */

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

  // Every guard is load-bearing (spec §4.1). A guard returning true VETOES the
  // reaction. Extend by adding entries — evaluate() never changes.
  const INTERCEPT_GUARDS = [
    { name: "own-request",       vetoes: function (requestInfo) { return requestHasOurHeader(requestInfo.headers); } },
    { name: "interceptor-paused", vetoes: function () { return interceptorIsPaused(); } },
    { name: "explicit-ignore",   vetoes: function (requestInfo) { return /[?&]side_cart_ignore=true/.test(requestInfo.url); } },
    { name: "other-app-ocu",     vetoes: function (requestInfo) { return /[?&]ocu=/.test(requestInfo.url); } },
  ];

  function urlNeverOpensDrawer(url) { return /[?&]opens_cart=never/.test(url); }

  /* PerformanceObserver safety net. Request interception is primary (it alone can read
     the add response body for the item-added diff), but a theme or app that dispatches
     its add through a fetch/XHR reference captured BEFORE our defer-loaded script patched
     window.fetch would bypass interception entirely. The resource-timing observer sees
     every /cart/* request regardless of HOW it was dispatched, so it catches those adds
     and still opens + refreshes the drawer. Two timestamps keep the paths from colliding:
       · lastOwnWriteAt   — set by pausedWrite; the observer ignores OUR writes
       · lastCartReactionAt — set by whichever path reacts first; the observer skips a
                              mutation the interceptor already handled (no double reaction). */
  let lastOwnWriteAt = 0;
  let lastCartReactionAt = 0;

  function reactToCartMutationUrl(url) {
    try {
      if (!url || classifyEndpoint(url) == null) return;      // only add/change/update/clear
      if (/[?&]side_cart_ignore=true/.test(url) || /[?&]ocu=/.test(url)) return;
      const now = Date.now();
      if (now - lastOwnWriteAt < 2500) return;                // our own drawer-driven write
      if (now - lastCartReactionAt < 1200) return;            // interception already reacted
      lastCartReactionAt = now;
      if (!urlNeverOpensDrawer(url) && !/\/cart\/?$/.test(location.pathname)) openDrawer();
      refreshCart();
    } catch (reactionError) { /* never throw into theme code */ }
  }

  function installCartMutationObserver() {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      const observer = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) { reactToCartMutationUrl(entry.name); });
      });
      observer.observe({ type: "resource", buffered: false });
    } catch (observerError) { /* PO unsupported → fetch/XHR interception remains primary */ }
  }

  // → null (ignore) or { endpoint, neverOpen }
  function evaluateRequest(requestInfo) {
    if (String(requestInfo.method || "GET").toUpperCase() !== "POST") return Promise.resolve(null);
    const endpoint = classifyEndpoint(requestInfo.url);
    if (!endpoint) return Promise.resolve(null);
    const vetoed = INTERCEPT_GUARDS.some(function (guard) {
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
      lastCartReactionAt = Date.now();   // tells the PerformanceObserver net (§4) this add is already handled
      const onCartPage = /\/cart\/?$/.test(location.pathname);
      if (!verdict.neverOpen && !onCartPage) openDrawer();
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
      const realRequest = _fetch(input, init);            // ALWAYS runs, untouched
      try {
        const requestInfo = {
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
            reactToResponse(xhr._sideCart, responseLike);
          });
        }
      } catch (interceptError) { /* degrade to passthrough */ }
      return originalSend.apply(this, arguments);
    };
  }

  /* Click detector — the theme's cart icon opens OUR drawer. Extend the list per theme. */
  const CART_LINK_SELECTORS =
    'a[href$="/cart"], a[href*="/cart?"], a[href*="/cart#"], #cart-icon-bubble, ' +
    '.header__icon--cart, [data-cart-icon], [data-drawer-toggle="cart"]';

  function installCartIconClickDetector() {
    document.addEventListener("click", function (event) {
      if (event.target.closest("#sc-root")) return;      // never hijack clicks in OUR drawer
      const cartLink = event.target.closest(CART_LINK_SELECTORS);
      if (cartLink) { event.preventDefault(); event.stopPropagation(); openDrawer(); }
    }, true);
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

  function closeNativeCartElements() {
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

  function disableNativeCart() {
    // Layer 1 — hide: one stylesheet, every selector guarded so we never match ourselves
    const hideStyle = document.createElement("style");
    hideStyle.textContent = NATIVE_CART_SELECTORS.map(function (selector) {
      return selector + ":not(#side-cart){display:none!important;visibility:hidden!important}";
    }).join("");
    document.head.appendChild(hideStyle);
    // Layer 2 — close now
    closeNativeCartElements();
    // Layer 3 — keep shut: re-close anything that re-opens itself
    const keepShutObserver = new MutationObserver(closeNativeCartElements);
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

  function syncCartCount(count) {
    COUNT_SYNC_TARGETS.forEach(function (target) {
      document.querySelectorAll(target.selector).forEach(function (el) {
        try { COUNT_SYNC_APPLIERS[target.type](el, count, target); } catch (syncError) { /* one bad target must not stop the rest */ }
      });
    });
  }
  /* §6 progress bar + free-gift engine */
  let justUnlockedFlash = null;   // { label, expiresAt } — brief unlockedText flash
  let previousProgressTotal = 0;
  // milestone icon per reward type; falls back to a tag for unknown types
  const PROGRESS_ICONS = { DISCOUNT: "🏷️", FREE_GIFT: "🎁", FREE_SHIPPING: "🚚" };
  function progressIcon(type) { return PROGRESS_ICONS[type] || "🏷️"; }

  function progressBlock() {
    const block = spec.header && spec.header.PROGRESS_BAR;
    return block && block.enabled && block.props && Array.isArray(block.props.rules) ? block : null;
  }

  function sortedProgressRules() {
    const block = progressBlock();
    if (!block) return [];
    return block.props.rules.slice().sort(function (a, b) { return a.unlockAt - b.unlockAt; });
  }

  function progressTotal() {
    const block = progressBlock();
    if (!cart || !block) return 0;
    return block.props.unlockedBy === "QUANTITY" ? cart.item_count : cart.total_price;
  }

  function formatProgressAmount(amount) {
    const block = progressBlock();
    return block && block.props.unlockedBy === "QUANTITY" ? String(amount) : money(amount);
  }

  function progressVars() {
    const rules = sortedProgressRules();
    if (!rules.length) return {};
    const total = progressTotal();
    const nextRule = rules.find(function (rule) { return total < rule.unlockAt; });
    return {
      needed: nextRule ? formatProgressAmount(nextRule.unlockAt - total) : "",
      next: nextRule ? nextRule.label : "",
      unlocked: justUnlockedFlash ? justUnlockedFlash.label : "",
    };
  }

  // called from setCart (Step 2) — detects a threshold crossing for the flash message
  function trackUnlockCrossings() {
    const rules = sortedProgressRules();
    if (!rules.length) return;
    const total = progressTotal();
    const crossedRule = rules.find(function (rule) {
      return previousProgressTotal < rule.unlockAt && total >= rule.unlockAt;
    });
    previousProgressTotal = total;
    if (crossedRule) {
      justUnlockedFlash = { label: crossedRule.label, expiresAt: Date.now() + 3000 };
      setTimeout(function () { justUnlockedFlash = null; render(); }, 3000);
    }
  }

  function PROGRESS_BAR(block) {
    const rules = sortedProgressRules();
    if (!rules.length || !cart) return "";
    const blockProps = block.props;
    const total = progressTotal();
    const maxUnlockAt = rules[rules.length - 1].unlockAt;
    const fillPercent = Math.min(100, (total / maxUnlockAt) * 100);
    const nextRule = rules.find(function (rule) { return total < rule.unlockAt; });
    let messageTemplate;
    if (!nextRule) messageTemplate = blockProps.allUnlockedText;
    else if (justUnlockedFlash && Date.now() < justUnlockedFlash.expiresAt) messageTemplate = blockProps.unlockedText;
    else messageTemplate = blockProps.defaultText;
    const milestones = rules.map(function (rule) {
      const reached = total >= rule.unlockAt;
      return '<span class="sc-milestone' + (reached ? " sc-done" : "") + '">' +
        '<span class="sc-ms-icon">' + progressIcon(rule.type) + "</span>" +
        "<span>" + esc(rule.label) + "</span></span>";
    }).join("");
    return '<div class="sc-progress"><p class="sc-progress-text">' + fill(messageTemplate, tvars()) +
      '</p><div class="sc-track"><div class="sc-fill" style="width:' + fillPercent + '%"></div></div>' +
      '<div class="sc-milestones">' + milestones + "</div></div>";
  }

  /* Free-gift engine. JS adds/removes the gift LINE; a Shopify automatic discount
     makes its PRICE zero — money is never client-side. The `_sc_gift` line property
     is both the FREE badge marker and how this loop finds its own additions. */
  let freeGiftBusy = false;    // re-entry guard: checkFreeGift runs inside setCart

  function numericIdFromGid(gid) {
    const match = String(gid || "").match(/(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  function checkFreeGift() {
    if (freeGiftBusy || !cart) return;
    const giftRules = sortedProgressRules().filter(function (rule) {
      return rule.type === "FREE_GIFT" && rule.product;
    });
    if (!giftRules.length) return;
    const total = progressTotal();
    giftRules.forEach(function (rule) {
      const giftVariantId = numericIdFromGid(rule.product.variantId);
      if (!giftVariantId) return;
      const giftLineIndex = cart.items.findIndex(function (line) {
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
  /* §7 timer — per-visitor deadline in a first-party cookie; one interval app-wide */
  const TIMER_COOKIE_NAME = "_sc_timer_end";
  let timerExpiryHandled = false;
  let previousItemCount = null;

  function enabledTimerBlock() {
    const block = spec.header && spec.header.TIMER;
    return block && block.enabled && block.props ? block : null;
  }

  function readTimerDeadline() {
    const match = document.cookie.match(new RegExp("(?:^|; )" + TIMER_COOKIE_NAME + "=(\\d+)"));
    return match ? Number(match[1]) : null;
  }

  function writeTimerDeadline(epochMs) {
    document.cookie = TIMER_COOKIE_NAME + "=" + epochMs + ";path=/;max-age=86400;SameSite=Lax";
  }

  function stampFreshDeadline() {
    const block = enabledTimerBlock();
    if (!block) return;
    writeTimerDeadline(Date.now() + (Number(block.props.timeLimit) || 30) * 60000);
    timerExpiryHandled = false;
  }

  function timerText() {
    const deadline = readTimerDeadline();
    if (!deadline) return "";
    const msLeft = Math.max(0, deadline - Date.now());
    const minutes = String(Math.floor(msLeft / 60000)).padStart(2, "0");
    const seconds = String(Math.floor((msLeft % 60000) / 1000)).padStart(2, "0");
    return minutes + ":" + seconds;
  }

  function TIMER(block) {
    const deadline = readTimerDeadline();
    if (!deadline || Date.now() >= deadline) return "";   // renders nothing past expiry
    // esc the whole title FIRST, then splice the live span in place of {{timer}}
    const titleHtml = esc(block.props.title).replace(/\{\{\s*timer\s*\}\}/g,
      '<span data-sc-timer>' + timerText() + "</span>");
    return '<div class="sc-timer">' + titleHtml + "</div>";
  }

  function onTimerTick() {
    const block = enabledTimerBlock();
    if (!block) return;
    const timerSpan = shadow.querySelector("[data-sc-timer]");
    if (timerSpan) timerSpan.textContent = timerText();     // 1s tick touches ONE span
    const deadline = readTimerDeadline();
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
    const block = enabledTimerBlock();
    const count = cart ? cart.item_count : 0;
    if (block && block.props.resetTimerProductAddedToCart &&
        previousItemCount != null && count > previousItemCount) {
      stampFreshDeadline();
    }
    previousItemCount = count;
  }
  /* §8 footer blocks */
  function DISCOUNT_CODE(block) {
    const blockProps = block.props || {};
    const appliedChips = ((cart && cart.discount_codes) || [])
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
    const blockProps = block.props || {};
    const textareaHtml = notesOpen
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
    const badges = (block.props && block.props.badges) || [];
    if (!badges.length) return "";
    return '<div class="sc-trust">' + badges.map(function (badge) {
      return "<span>" + esc(badge.title) + "</span>";
    }).join("") + "</div>";
  }

  function PAYMENT_METHODS(block) {
    const icons = (block.props && block.props.icons) || [];
    if (!icons.length) return "";
    return '<div class="sc-pay">' + icons.map(function (iconLabel) {
      return "<span>" + esc(iconLabel) + "</span>";
    }).join("") + "</div>";
  }

  /* input preservation — typed-but-unsubmitted text survives every innerHTML replace */
  const preservedInputs = { discountCode: "", noteText: null };

  function snapshotInputs() {
    const discountInput = $("sc-disc-input");
    if (discountInput) preservedInputs.discountCode = discountInput.value;
    const notesTextarea = $("sc-notes");
    if (notesTextarea) preservedInputs.noteText = notesTextarea.value;
  }

  function restoreInputs() {
    const discountInput = $("sc-disc-input");
    if (discountInput && preservedInputs.discountCode) discountInput.value = preservedInputs.discountCode;
    const notesTextarea = $("sc-notes");
    if (notesTextarea && preservedInputs.noteText != null) notesTextarea.value = preservedInputs.noteText;
  }

  // notes save on blur (capture phase — blur does not bubble)
  shadow.addEventListener("blur", function (event) {
    if (event.target && event.target.id === "sc-notes") saveOrderNote(event.target.value);
  }, true);
  /* §9 variant selector — lazy per-handle product data, single-request swap */
  const productCache = new Map();   // handle → {status, data}

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
    const isGiftLine = item.properties && item.properties._sc_gift;
    const staticLabel = '<span class="sc-variant">' + esc(item.variant_title) + "</span>";
    if (isGiftLine) return staticLabel;
    const cached = productCache.get(item.handle);
    if (!cached) { ensureProductLoaded(item.handle); return staticLabel; }
    if (cached.status !== "ok" || !Array.isArray(cached.data.variants) ||
        cached.data.variants.length < 2) return staticLabel;
    const options = cached.data.variants.map(function (variant) {
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
    const updates = {};
    updates[oldVariantId] = 0;
    updates[newVariantId] = lineQuantity;
    return pausedWrite("cart/update.js", { updates: updates })
      .then(function (nextCart) { nextCart ? setCart(nextCart) : refreshCart(); });
  }

  // <select> fires "change", not "click" — a second delegated listener on the shadow root
  shadow.addEventListener("change", function (event) {
    const selectEl = event.target.closest('[data-action="variant"]');
    if (!selectEl) return;
    swapVariant(
      Number(selectEl.dataset.oldVariant),
      Number(selectEl.value),
      Number(selectEl.dataset.lineQty)
    );
  });

  shadow.addEventListener("click", function (e) {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    route(t.dataset.action, t);
  });

  function route(action, actionTarget) {
    switch (action) {
      case "qty": {
        const stepper = actionTarget.closest(".sc-qty");
        if (stepper) stepper.classList.add("sc-loading");   // spinner until the re-render replaces it
        changeQty(actionTarget.dataset.line, Number(actionTarget.dataset.qty));
        break;
      }
      case "remove": {
        actionTarget.classList.add("sc-loading");           // spinner in the trash button
        changeQty(actionTarget.dataset.line, 0);
        break;
      }
      case "apply-discount": {
        const discountInput = $("sc-disc-input");
        const discountCode = discountInput && discountInput.value.trim();
        if (discountCode) {
          preservedInputs.discountCode = "";
          discountInput.value = "";
          applyDiscount(discountCode);
        }
        break;
      }
      case "remove-discount": applyDiscount(""); break;
      case "toggle-notes": notesOpen = !notesOpen; render(); break;
      case "checkout": location.href = ctx.checkoutUrl || "/checkout"; break;
      case "close": closeDrawer(); break;
    }
  }

  // `root` is the shadow root — query it to read/update widget content, e.g.
  // window.SideCart.root.querySelector('#sc-body')
  window.SideCart = { root: shadow, open: openDrawer, close: closeDrawer, refresh: refreshCart };

  /* Boot — runs LAST, after every region's config bindings are assigned. These calls
     are synchronous and read config declared across §4–§9, so they must not run
     before those declarations execute (function declarations hoist; these
     assignments do not). Interceptor closures read their config lazily, so patching here is safe. */
  installFetchInterceptor();
  installXhrInterceptor();
  installCartMutationObserver();   // safety net for adds that bypass the fetch/XHR patch
  installCartIconClickDetector();
  disableNativeCart();
  startTimerEngine();
  refreshCart(); // first paint
})();
