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
  function syncCartCount(count) {}                  // Task 5
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

  /* §4 detect */
  /* §5 count-sync */
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
