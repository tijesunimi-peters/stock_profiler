/* Shared page chrome.
 *
 * Two shells coexist (STYLE_GUIDE §5):
 *  - Marketing/prose pages (/, /guide, legal) keep the static .nav markup; the only JS
 *    they need is the hamburger wiring at the bottom of this file.
 *  - Data pages opt into the app shell with <body class="app" data-shell="<current>">
 *    plus empty #appSide / #appTopbar / #appScrim mounts. This file renders the sidebar
 *    and topbar into them (single source of truth for the link set), wires the mobile
 *    drawer, and mounts the global company search (⌘K / Ctrl-K / "/" focuses it;
 *    autocomplete via suggest.js when it's loaded, so load suggest.js BEFORE this file).
 */
(function () {
  "use strict";

  // ---------- app shell (data pages) ----------

  var side = document.getElementById("appSide");
  var topbar = document.getElementById("appTopbar");

  if (side && topbar) {
    var current = document.body.getAttribute("data-shell") || "";

    var GROUPS = [
      { label: "Data", items: [
        { key: "company", label: "Company hub", href: "/company/AAPL" },
        { key: "compare", label: "Compare", href: "/compare" },
        { key: "screen", label: "Screen", href: "/screen" },
        { key: "coverage", label: "Coverage", href: "/coverage" },
      ] },
      { label: "Reference", items: [
        { key: "guide", label: "Docs & guide", href: "/guide" },
        { key: "methodology", label: "Methodology", href: "/methodology" },
        { key: "api", label: "API Reference", href: "/docs", hint: "↗" },
      ] },
    ];

    var logo =
      '<a href="/" class="logo" aria-label="ClearyFi home">' +
      '<span class="logo-mark"><span class="logo-dot"></span></span>' +
      '<span class="logo-word">ClearyFi</span></a>';

    side.innerHTML =
      logo +
      GROUPS.map(function (g) {
        return (
          '<nav class="side-group" aria-label="' + g.label + '">' +
          '<div class="side-group-label">' + g.label + "</div>" +
          g.items.map(function (it) {
            var cur = it.key === current;
            return (
              '<a class="side-link' + (cur ? " current" : "") + '" href="' + it.href + '"' +
              (cur ? ' aria-current="page"' : "") + ">" + it.label +
              (it.hint ? '<span class="side-hint">' + it.hint + "</span>" : "") +
              "</a>"
            );
          }).join("") +
          "</nav>"
        );
      }).join("") +
      '<div class="app-side-foot">' +
      '<a href="/disclaimer">Data, not investment advice</a>' +
      '<span class="side-tagline">ClearyFi · public SEC data, cleaned &amp; queryable</span>' +
      "</div>";

    var isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform || "");
    topbar.innerHTML =
      '<button class="topbar-menu" id="appMenu" aria-label="Open navigation" aria-expanded="false" aria-controls="appSide">' +
      "<span></span><span></span><span></span></button>" +
      '<span class="topbar-logo">' + logo + "</span>" +
      '<form class="topbar-search" role="search">' +
      '<input type="text" name="q" placeholder="Search ticker or CIK…" autocomplete="off" spellcheck="false" aria-label="Search ticker or CIK">' +
      '<span class="topbar-kbd">' + (isMac ? "⌘K" : "Ctrl K") + "</span></form>" +
      '<div class="topbar-right"><a href="/docs" class="pill">API Reference</a></div>';

    // Global search: resolution/404 handling lives on the company hub itself, so plain
    // navigation is enough here (and keeps this file dependency-free).
    var form = topbar.querySelector(".topbar-search");
    var input = form.querySelector("input");
    function go(sym) {
      sym = (sym || "").trim();
      if (sym) location.href = "/company/" + encodeURIComponent(sym);
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      go(input.value);
    });
    if (window.ClearyFiSuggest) window.ClearyFiSuggest.attach(input, { onPick: go });

    document.addEventListener("keydown", function (e) {
      var t = e.target;
      var typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        input.focus();
        input.select();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        input.focus();
        input.select();
      } else if (e.key === "Escape" && document.body.classList.contains("side-open")) {
        setDrawer(false);
      }
    });

    // Mobile drawer.
    var menuBtn = document.getElementById("appMenu");
    var scrim = document.getElementById("appScrim");
    function setDrawer(open) {
      document.body.classList.toggle("side-open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
    }
    menuBtn.addEventListener("click", function () {
      setDrawer(!document.body.classList.contains("side-open"));
    });
    if (scrim) scrim.addEventListener("click", function () { setDrawer(false); });
    side.addEventListener("click", function (e) {
      if (e.target.closest("a")) setDrawer(false);
    });
  }

  // ---------- legacy top nav (marketing/prose pages) ----------

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
