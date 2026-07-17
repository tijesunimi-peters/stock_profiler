/* Shared company-autocomplete widget. Standalone on purpose (no app.js dependency) so
 * the explorer's bespoke input and app.js's mountSearch can both use it.
 *
 *   ClearyFiSuggest.attach(inputEl, { onPick: function (ticker, suggestion) {...} });
 *
 * Fetches GET /v1/companies/suggest?q= (public, IP rate-limited) with a 150ms
 * debounce. Keyboard: arrows move, Enter picks the highlighted row, Escape closes.
 * The keydown listener runs in the CAPTURE phase and stops propagation only when the
 * menu consumed the key, so page-level Enter handlers (explorer lookup, mountSearch's
 * form submit) still fire for plain typed-text submits.
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function attach(input, opts) {
    opts = opts || {};
    var wrap = input.parentNode;
    if (getComputedStyle(wrap).position === "static") wrap.style.position = "relative";
    var menu = document.createElement("div");
    menu.className = "suggest-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;
    wrap.appendChild(menu);
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");

    var items = [];
    var active = -1;
    var timer = null;
    var seq = 0; // discard out-of-order responses

    function close() {
      menu.hidden = true;
      input.setAttribute("aria-expanded", "false");
      items = [];
      active = -1;
    }

    function render() {
      if (!items.length) { close(); return; }
      // Align to the input, not the wrapper -- the wrapper row usually also holds the
      // submit button (offsets are relative to wrap, which attach() made positioned).
      menu.style.left = input.offsetLeft + "px";
      menu.style.top = input.offsetTop + input.offsetHeight + 4 + "px";
      menu.style.minWidth = Math.max(input.offsetWidth, 300) + "px";
      menu.innerHTML = items.map(function (s, i) {
        return (
          '<div class="suggest-item' + (i === active ? " active" : "") + '" role="option" data-i="' + i + '">' +
          '<span class="suggest-ticker">' + esc(s.ticker) + "</span>" +
          '<span class="suggest-name">' + esc(s.name || "") + "</span>" +
          '<span class="suggest-cik">CIK ' + esc(s.cik) + "</span>" +
          "</div>"
        );
      }).join("");
      menu.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    function pick(i) {
      var s = items[i];
      if (!s) return;
      close();
      input.value = s.ticker;
      if (opts.onPick) opts.onPick(s.ticker, s);
    }

    function query(q) {
      var mine = ++seq;
      fetch("/v1/companies/suggest?q=" + encodeURIComponent(q))
        .then(function (r) { return r.ok ? r.json() : { suggestions: [] }; })
        .then(function (d) {
          if (mine !== seq) return;
          items = d.suggestions || [];
          active = items.length ? 0 : -1;
          render();
        })
        .catch(function () { if (mine === seq) close(); });
    }

    input.addEventListener("input", function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (!q) { seq++; close(); return; }
      timer = setTimeout(function () { query(q); }, 150);
    });

    // Capture phase: page-level keydown handlers (explorer's Enter lookup) are attached
    // in the bubble phase, so this sees the key first and can consume it for the menu.
    input.addEventListener("keydown", function (e) {
      if (menu.hidden) return;
      if (e.key === "ArrowDown") {
        e.preventDefault(); e.stopPropagation();
        active = Math.min(active + 1, items.length - 1); render();
      } else if (e.key === "ArrowUp") {
        e.preventDefault(); e.stopPropagation();
        active = Math.max(active - 1, 0); render();
      } else if (e.key === "Enter" && active >= 0) {
        e.preventDefault(); e.stopPropagation();
        pick(active);
      } else if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }, true);

    // mousedown (not click) so the input's blur doesn't tear the menu down first.
    menu.addEventListener("mousedown", function (e) {
      var item = e.target.closest(".suggest-item");
      if (item) { e.preventDefault(); pick(parseInt(item.getAttribute("data-i"), 10)); }
    });
    menu.addEventListener("mousemove", function (e) {
      var item = e.target.closest(".suggest-item");
      if (!item) return;
      var i = parseInt(item.getAttribute("data-i"), 10);
      if (i !== active) { active = i; render(); }
    });

    input.addEventListener("blur", function () { setTimeout(close, 120); });
  }

  window.ClearyFiSuggest = { attach: attach };
})();
