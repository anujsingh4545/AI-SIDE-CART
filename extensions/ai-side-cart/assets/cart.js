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
  var interceptorPaused = false;

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
  /* §3 products + writes */
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
      case "close": closeDrawer(); break;
    }
  }

  window.SideCart = { open: openDrawer, close: closeDrawer, refresh: function () {} };
})();
