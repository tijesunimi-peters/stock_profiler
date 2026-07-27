/* The unified product shell (V3-P2 — ROADMAP_APP_V3 §2 D1/D2, STYLE_GUIDE §4.2/§5/§10.1).
 *
 * ONE navigation implementation for every data page. It replaces BOTH of the shells that used to
 * coexist: script.js's Data/Reference sidebar and sectorapp.js's self-contained .pa-side. The
 * subject list therefore has exactly one source of truth -- SUBJECTS below. There are no per-page
 * nav copies; if you find yourself writing a second one, that is the bug this file exists to fix.
 *
 * Ported from docs/design/sector-app-prototype-v3/prototype.dc.html:36-70 (shell markup) and
 * :7325-7370 (nav model). Layout in shell.css.
 *
 * Load order: suggest.js -> shell.js -> app.js -> the page's own JS. (suggest.js first so the
 * topbar search gets autocomplete; shell.js is dependency-free otherwise.)
 *
 * Pages carry only the empty mounts:
 *   <body class="app"> <aside class="app-side" id="appSide"></aside>
 *   <div class="app-scrim" id="appScrim"></div>
 *   <div class="app-main"> <header class="app-topbar" id="appTopbar"></header> ... </div>
 */
(function () {
  "use strict";

  // ---------- the nav model (prototype.dc.html:7334-7357) ----------

  // [key, label, href|null, title]. href === null => planned-and-inert (STYLE_GUIDE §10.1):
  // rendered as a <span>, no href, no handler, --mono-muted, cursor:default, self-explaining title.
  // Order is the prototype's -- People sits between Sectors and Managers.
  var SUBJECTS = [
    ["companies", "Companies", "/company/AAPL",
      "Registrants — 10-K, 10-Q, 8-K, proxy and Section 16 filings"],
    ["sectors", "Sectors", "/sectors",
      "Peer groups of registrants, compared as populations"],
    ["people", "People", null,
      "Directors and officers as entities — board interlocks, Section 16 history, 8-K 5.02 moves"],
    // Managers are keyed by CIK with no "default manager", so the subject link points at the same
    // filer the e2e suite uses. It resolves 200 -- a real destination, not a placeholder link.
    ["managers", "Managers", "/manager/1067983",
      "13F filers as entities — register footprint, N-PX voting record, 13D campaigns"],
    ["auditors", "Auditors", null,
      "Audit firms as entities — client portfolio, CAM topics, fees, tenure"],
    ["funds", "Funds", null,
      "Registered funds — N-CEN, N-PORT and N-CSR filings"],
    ["events", "Events", null,
      "Form cross-sections — every 4.02 restatement, 4.01 auditor change or 12b-25 in a period"],
  ];

  // Actions hang off whichever subject is active (D2). Where an action isn't built for the active
  // subject it renders planned WITH its description, never omitted -- claiming a sector screener
  // exists when /screen screens companies would be the dishonest option.
  var ACTIONS = {
    companies: [
      ["Compare", "/compare", "Two companies side by side, across sectors"],
      ["Screen", "/screen", "Filter the companies universe on filing-derived criteria"],
      ["Coverage", "/coverage", "Filing freshness and completeness across the companies universe"],
    ],
    sectors: [
      // Sector-vs-sector Compare is a VIEW inside the sector app, not a separate route.
      ["Compare", "/sectors/compare", "Two sectors side by side"],
      ["Screen", null, "Filter the sectors universe on filing-derived criteria"],
      ["Coverage", null, "Filing freshness and completeness across the sectors universe"],
    ],
    managers: [
      ["Compare", null,
        "Two managers side by side — register footprint, voting record and filing behaviour"],
      ["Screen", null, "Filter the managers universe on filing-derived criteria"],
      ["Coverage", null, "Filing freshness and completeness across the managers universe"],
    ],
  };

  var REFERENCE = [
    ["Docs & guide", "/guide"],
    ["Methodology", "/methodology"],
    ["API reference", "/docs"],
  ];

  // Views per subject. First entry is the default -- an unknown slug resolves to it rather than
  // erroring, which is why the server does not validate {view} either (see api/main.py).
  var VIEWS = {
    companies: [
      ["fundamentals", "Fundamentals"], ["statements", "Statements"], ["insider", "Insider"],
      ["institutional", "Institutional"], ["beneficial", "13D/G"],
    ],
    sectors: [
      ["sector", "Sector"], ["company", "Company"], ["compare", "Compare"], ["qual", "Qualitative"],
      // Reached from the Qualitative view's drill affordances, not from the rail.
      ["filings", "Filings"],
    ],
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(id) { return document.getElementById(id); }

  // ---------- route(): the path is the serialization of the selection ----------

  function viewSlugs(subject) {
    return (VIEWS[subject] || []).map(function (v) { return v[0]; });
  }
  function defaultView(subject) {
    var v = VIEWS[subject];
    return v && v.length ? v[0][0] : null;
  }
  // Resolve a candidate slug against a subject's view list. Unknown -> the default view (AC-21).
  function resolveView(subject, slug) {
    if (!slug) return defaultView(subject);
    return viewSlugs(subject).indexOf(slug) !== -1 ? slug : defaultView(subject);
  }

  function route() {
    var parts = location.pathname.split("/").filter(Boolean);
    var q = new URLSearchParams(location.search);
    var head = parts[0] || "";

    if (head === "company") {
      // /company/{symbol}[/{view}]  — legacy ?tab= still resolves (AC-20).
      return {
        subject: "companies", action: null, id: parts[1] || null,
        view: resolveView("companies", parts[2] || q.get("tab")),
      };
    }
    if (head === "sectors") {
      // /sectors[/{group}[/{view}]]  — legacy ?group=&view= still resolve.
      // /sectors/compare is the Compare ACTION: no group, the view in slot 1.
      var group = parts[1] || null;
      var view = parts[2] || null;
      if (group && viewSlugs("sectors").indexOf(group) !== -1 && !view) { view = group; group = null; }
      view = resolveView("sectors", view || q.get("view"));
      return {
        subject: "sectors", action: view === "compare" ? "Compare" : null,
        id: group || q.get("group") || null, view: view,
      };
    }
    if (head === "manager") return { subject: "managers", action: null, id: parts[1] || null, view: null };
    if (head === "compare") return { subject: "companies", action: "Compare", id: null, view: null };
    // NOTE: /screen carries its own ?view= (rank | …) which is a SCREEN MODE, not a shell view.
    // route() only reads ?view= for subjects that declare shell views, so it passes through here.
    if (head === "screen") return { subject: "companies", action: "Screen", id: null, view: null };
    if (head === "coverage") return { subject: "companies", action: "Coverage", id: null, view: null };
    return { subject: null, action: null, id: null, view: null };
  }

  // ---------- sidebar + topbar ----------

  function navItemHtml(label, href, title, current, planned) {
    var cls = "shell-nav-item" + (current ? " is-current" : "") + (planned ? " is-planned" : "");
    var badge = planned ? '<span class="shell-planned-badge">planned</span>' : "<span></span>";
    var inner = "<span>" + esc(label) + "</span>" + badge;
    // A planned entry is a <span>: no href and no handler exist to regress (STYLE_GUIDE §10.1).
    if (planned) return '<span class="' + cls + '" title="' + esc(title) + '">' + inner + "</span>";
    return (
      '<a class="' + cls + '" href="' + esc(href) + '"' +
      (title ? ' title="' + esc(title) + '"' : "") +
      (current ? ' aria-current="page"' : "") + ">" + inner + "</a>"
    );
  }

  function sidebarHtml(r) {
    var subjectLabel = r.subject
      ? SUBJECTS.filter(function (s) { return s[0] === r.subject; }).map(function (s) { return s[1]; })[0]
      : "";

    var subjects = SUBJECTS.map(function (s) {
      // A subject reads as current only when it is BOTH the active subject and a built one.
      return navItemHtml(s[1], s[2], s[3], r.subject === s[0] && !!s[2], !s[2]);
    }).join("");

    var actions = "";
    if (r.subject && ACTIONS[r.subject]) {
      actions =
        '<div class="shell-nav-label">Actions · ' + esc(subjectLabel) + "</div>" +
        ACTIONS[r.subject].map(function (a) {
          return navItemHtml(a[0], a[1], a[2], r.action === a[0], !a[1]);
        }).join("");
    }

    return (
      '<a class="shell-brand" href="/" aria-label="ClearyFi home">' +
      '<span class="shell-brand-name">ClearyFi</span>' +
      '<span class="shell-brand-tag">SEC data</span></a>' +
      '<nav class="shell-nav-label" aria-hidden="true">Subjects</nav>' +
      '<nav aria-label="Subjects">' + subjects + "</nav>" +
      actions +
      '<div class="shell-nav-label">Reference</div>' +
      '<nav aria-label="Reference">' +
      REFERENCE.map(function (x) { return navItemHtml(x[0], x[1], "", false, false); }).join("") +
      "</nav>" +
      '<div class="shell-side-foot"><a href="/disclaimer">Data, not investment advice.</a></div>'
    );
  }

  function topbarHtml() {
    var isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform || "");
    return (
      '<button class="topbar-menu" id="appMenu" aria-label="Open navigation" aria-expanded="false" aria-controls="appSide">' +
      "<span></span><span></span><span></span></button>" +
      '<form class="shell-search" id="shellSearch" role="search">' +
      '<span class="shell-search-ic" aria-hidden="true">⌕</span>' +
      '<input class="shell-search-input" id="shellSearchInput" type="text" name="q" ' +
      'placeholder="Search ticker or CIK…" autocomplete="off" spellcheck="false" ' +
      'aria-label="Search ticker or CIK">' +
      '<span class="shell-kbd">' + (isMac ? "⌘K" : "Ctrl K") + "</span></form>" +
      '<a class="shell-apiref" href="/docs">API reference ↗</a>'
    );
  }

  // ---------- mount ----------

  var mounted = false;

  // What the topbar search does on submit. Default: navigate to the company hub. The sector app
  // overrides it (see setSearchHandler) so a search sets the focal company without leaving
  // /sectors -- that IS its Company view. Held in a variable rather than closed over at mount time
  // so a page can override it either before OR after the shell auto-mounts.
  var searchHandler = function (sym) {
    if (sym) location.href = "/company/" + encodeURIComponent(sym);
  };
  function setSearchHandler(fn) {
    if (typeof fn === "function") searchHandler = fn;
  }

  /* Render the sidebar + topbar. Idempotent -- the shell AUTO-MOUNTS on DOM ready (see the bottom
   * of this file), because /coverage and /components have no page JS of their own to call it and
   * the retired script.js rendered itself the same way.
   *
   * The shell deliberately lives OUTSIDE any container a page re-renders (notably the sector app's
   * #app, which rewrites its innerHTML on every state change). Re-running mount() is not how you
   * refresh nav state -- use setSubjectState() -- because a re-render would drop these listeners.
   */
  function mount(opts) {
    opts = opts || {};
    if (opts.onSearch) setSearchHandler(opts.onSearch);
    var side = $("appSide");
    var topbar = $("appTopbar");
    if (!side || !topbar) return null; // not a shell page (marketing/legal keep the static .nav)
    if (mounted) return null;
    mounted = true;

    var r = route();
    side.innerHTML = sidebarHtml(r);
    topbar.innerHTML = topbarHtml();

    // --- search ---
    var form = $("shellSearch");
    var input = $("shellSearchInput");
    // Dispatch through the variable, not a captured copy, so a later setSearchHandler() wins.
    var go = function (sym) { searchHandler(sym); };
    function submit() {
      var v = (input.value || "").trim();
      if (v) go(v);
    }
    form.addEventListener("submit", function (e) { e.preventDefault(); submit(); });
    if (window.ClearyFiSuggest) window.ClearyFiSuggest.attach(input, { onPick: go });

    // --- keyboard: ⌘K / Ctrl-K / "/" focus the search; Escape closes the drawer ---
    document.addEventListener("keydown", function (e) {
      var t = e.target;
      var typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" || t.isContentEditable);
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

    // --- off-canvas drawer (< 1024px) ---
    var menuBtn = $("appMenu");
    var scrim = $("appScrim");
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

    return r;
  }

  // Repaint the sidebar's current-state after an in-page navigation (the sector app switching
  // views changes the active ACTION). Cheap: sidebar only, listeners are delegated or on the
  // container, so nothing is lost.
  function setSubjectState() {
    var side = $("appSide");
    if (side) side.innerHTML = sidebarHtml(route());
  }

  // ---------- view rail ----------

  /* Returns a DOM node (consistent with app.js's chartCard() and D5 -- builders return nodes).
   * opts: { subject | views:[[slug,label]], active, note, onSelect(slug) } */
  function rail(opts) {
    opts = opts || {};
    var views = opts.views || VIEWS[opts.subject] || [];
    var nav = document.createElement("nav");
    nav.className = "shell-rail";
    nav.setAttribute("aria-label", "Views");

    var label = document.createElement("div");
    label.className = "shell-rail-label";
    label.textContent = "Views";
    nav.appendChild(label);

    views.forEach(function (v) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shell-rail-btn" + (v[0] === opts.active ? " active" : "");
      btn.setAttribute("data-view", v[0]);
      btn.textContent = v[1];
      if (v[0] === opts.active) btn.setAttribute("aria-current", "page");
      btn.addEventListener("click", function () {
        if (opts.onSelect) opts.onSelect(v[0]);
      });
      nav.appendChild(btn);
    });

    if (opts.note) {
      var rule = document.createElement("div");
      rule.className = "shell-rail-rule";
      nav.appendChild(rule);
      var note = document.createElement("div");
      note.className = "shell-rail-note";
      note.textContent = opts.note;
      nav.appendChild(note);
    }
    return nav;
  }

  // ---------- entity control bar ----------

  /* cells: [{ label, value, mono?, primary? }]
   *
   * HONESTY (STYLE_GUIDE §7, AC-16): a cell whose value is null/undefined/"" renders the drained
   * em-dash, NEVER 0, never a guess, never a blank styled as a value. Async values (e.g. a 13F
   * manager's name, which is unknown until the holdings fetch resolves) therefore render pending
   * and fill in on the next paint. Cells we cannot source at all are OMITTED by the caller rather
   * than shown as a permanent N/A -- see company.js's note on "Peer set".
   */
  function entityBar(cells) {
    var bar = document.createElement("div");
    bar.className = "shell-entity";
    (cells || []).forEach(function (c, i) {
      if (i) {
        var sep = document.createElement("div");
        sep.className = "shell-entity-sep";
        bar.appendChild(sep);
      }
      var cell = document.createElement("div");
      cell.className = "shell-entity-cell";
      var lab = document.createElement("span");
      lab.className = "shell-entity-label";
      lab.textContent = c.label;
      var val = document.createElement("span");
      var empty = c.value === null || c.value === undefined || c.value === "";
      val.className = "shell-entity-value" +
        (c.primary ? " is-primary" : c.mono ? " is-mono" : "") +
        (empty ? " is-pending" : "");
      val.textContent = empty ? "—" : c.value;
      cell.appendChild(lab);
      cell.appendChild(val);
      bar.appendChild(cell);
    });
    return bar;
  }

  // ---------- navigation ----------

  /* Write the selection into the path. pushState by default so Back/Forward walk views (AC-19);
   * replace:true for the initial normalization of a legacy ?tab=/?group= URL, which must not add
   * a history entry the user never navigated to. */
  function navigate(path, opts) {
    opts = opts || {};
    var url = path + location.search.replace(/[?&](tab|view|group)=[^&]*/g, "").replace(/^&/, "?");
    if (url.indexOf("?") === -1 && location.search && !/^\?$/.test(url)) url = path;
    try {
      history[opts.replace ? "replaceState" : "pushState"]({ shell: true }, "", url);
    } catch (e) { /* file:// or a sandboxed frame — navigation state is a progressive enhancement */ }
    setSubjectState();
  }

  // Auto-mount, like the script.js shell it replaces: a data page gets its nav by loading this
  // file, with no per-page wiring. Pages that need more (a search override, the view rail) call
  // into the API below; mount() is idempotent, so calling it again is harmless.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { mount(); });
  } else {
    mount();
  }

  window.ClearyFiShell = {
    route: route,
    mount: mount,
    setSearchHandler: setSearchHandler,
    rail: rail,
    entityBar: entityBar,
    navigate: navigate,
    setSubjectState: setSubjectState,
    views: function (subject) { return (VIEWS[subject] || []).slice(); },
    resolveView: resolveView,
  };
})();
