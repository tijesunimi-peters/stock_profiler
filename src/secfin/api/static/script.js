/* Marketing/prose page chrome (/, /guide, /methodology, /privacy, /terms, /disclaimer).
 *
 * These pages keep the static .nav markup and stay OUTSIDE the app shell (ROADMAP_APP_V3 §2 D1) —
 * the only JS they need is the hamburger wiring below.
 *
 * The app-shell renderer that used to live here (the #appSide/#appTopbar sidebar + topbar, the
 * GROUPS link set, the drawer and the ⌘K search) was retired into static/shell.js in V3-P2: under
 * D1 there is ONE shell and one navigation implementation, so the link set has exactly one source
 * of truth. Data pages load shell.js instead of this file. Do not re-add a nav renderer here.
 */
(function () {
  "use strict";

  var toggle = document.getElementById("navToggle");
  var mobileNav = document.getElementById("navMobile");
  if (!toggle || !mobileNav) return;

  toggle.addEventListener("click", function () {
    var isOpen = mobileNav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  mobileNav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      mobileNav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
})();
