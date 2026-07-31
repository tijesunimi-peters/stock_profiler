/* Sector Analytics app — canonical at /sectors (M2 swap 2026-07-24; /sector-analytics 301s in).
 * A "paper terminal" single-page app (a from-scratch
 * redesign; docs/REDESIGN_SECTOR_APP.md) over the shipped Track-1 endpoints. Phase 1 = the app
 * shell + the Sector view on real data; Company/Compare/Qualitative are inert stubs (later phases).
 *
 * HONESTY (load-bearing): NO favorability color anywhere — direction is arrow glyphs (↑ ↓ →) +
 * track position only, single terracotta accent. Scores are provisional POSITIONS vs other sectors,
 * not good/bad verdicts. N/A is never rendered as 0. No fabricated coverage %/sub-industry/feed;
 * deferred themes are honest "not yet scored" markers. Self-contained: reuses window.ClearyFi.*
 * helpers + the design tokens; it does NOT import sectors.js/sectors.css or the shared shell.
 */
(function () {
  "use strict";
  var P = window.ClearyFi;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);

  var LS_LAST = "secfin:appLastSector";

  var state = {
    view: "sector",
    sectorIdx: null,
    subIdx: null, // reserved (sub-industry / SIC-4 not backed yet — omitted this phase)
    expandedTheme: null,
    decompTheme: null,
    compareA: null,
    compareB: null,
    ddOpen: false, // sector dropdown open
    drillScope: "theme", // Distribution scope: "theme" (focused theme's constituents) | "all" (every metric)
    sectors: null, // /v1/sectors payload (universe + peer_count + fiscal_year)
    themeScores: null, // /v1/sectors/theme-scores payload (all sectors)
    themeScoresErr: false,
    series: {}, // group -> /sectors/{group}
    spreads: {}, // group -> /sectors/{group}/spreads
    lifecycle: {}, // group -> /sectors/{group}/lifecycle
    insiderFlow: {}, // group -> /sectors/{group}/insider-flow (real; P6a). {_error:true} on failure
    geoMix: {}, // group -> /sectors/{group}/geographic-mix (real; P6b). {has_data:false,_error:true} on fail
    // Company view (altitude 2) state
    focalCik: null, // the focal filer's CIK (int); identity for the Company view
    focalName: null,
    focalTicker: null, // set ONLY from a ticker search; drives the header ticker pill (never faked)
    focalGroup: null, // the focal's SIC peer group (e.g. "35")
    focalPeers: null, // /companies/{cik}/peers payload (per-metric percentiles -> derived rail)
    defaultFocalTried: false, // guard: resolve a default focal (largest sector, first-alpha) once
    coCompOpen: false, // composite card decomposition toggle
    companyErr: false,
    coValues: {}, // "group|metric" -> SectorCompanyValueList payload (the dot-cloud, cached)
    coHistory: {}, // "cik|metric" -> MetricHistory payload (the focal's trailing trend, cached)
    coTrendOpen: {}, // metric -> bool: the per-metric 8-quarter trend expand state (reset on focal change)
    // Qualitative view (altitude 4) state -- both drive wired-but-EMPTY placeholder reveals (P4).
    qualThemeOpen: null, // theme label whose representative-language panel is expanded (single-open)
    qualFilerOpen: {}, // { affordanceId: true } -> revealed filer-count panels (multi-open, empty states)
    // Filings view (5th, P5) -- an on-site theme DRILL reached from the Qualitative "Filings →"
    // affordances. Track-2 placeholder LAYOUT: the controls (form tabs, pager, Back) are real, but
    // the list they operate over is an honest EMPTY placeholder -- never a fabricated filing.
    filingsTheme: null, // the drilled risk-theme label (string) -> breadcrumb + language-block context
    prevView: null, // the view to return to on Back (captured at open; "qual" in the normal flow)
    filingsForm: "All", // active form-type tab: "All" | "10-K" | "10-Q" | "8-K"
    filingsPage: 0, // 0-based pager index; reset to 0 every time the drill is opened
  };
  // Initial view: the PATH wins (/sectors/{group}/{view}), with the legacy ?view= honored as a
  // fallback so every bookmark and e2e URL keeps resolving (V3-P2 AC-20). ClearyFiShell.route()
  // owns that precedence and maps an unknown slug back to the default view.
  if (window.ClearyFiShell) {
    var r0 = window.ClearyFiShell.route();
    if (r0.view) state.view = r0.view;
  } else if (params.get("view") === "company" || params.get("view") === "compare") {
    state.view = params.get("view");
  }
  if (params.get("a")) state.compareA = params.get("a"); // ?a=&b= preset the Compare pair (groups)
  if (params.get("b")) state.compareB = params.get("b");

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  // ---------- ported metric formatting + shift math (from sectors.js, minus color) ----------

  var PERCENT_DECOMP = {
    gross_margin: 1, operating_margin: 1, net_margin: 1, roa: 1, roe: 1, roic: 1,
    revenue_growth_yoy: 1, earnings_growth_yoy: 1, ocf_growth_yoy: 1, growth_acceleration: 1,
    fcf_margin: 1,
  };
  var DAYS_DECOMP = { dso: 1, dio: 1, dpo: 1, ccc: 1 };
  function metricFmt(metric, v) {
    if (v === null || v === undefined) return "—"; // never 0
    if (PERCENT_DECOMP[metric]) return P.fmt.pct(v);
    if (DAYS_DECOMP[metric]) return Math.round(v) + "d";
    return P.fmt.mult(v);
  }
  var PERCENT_SPREAD = { net_margin: 1, roe: 1, roa: 1, revenue_growth_yoy: 1, earnings_growth_yoy: 1 };
  function fmtSpreadVal(metric, v) {
    if (v === null || v === undefined) return "—";
    return PERCENT_SPREAD[metric] ? P.fmt.pct(v) : P.fmt.mult(v);
  }

  var SHIFT_LABELS = {
    roe: "ROE", net_margin: "Net margin", asset_turnover: "Asset turnover",
    equity_multiplier: "Equity multiplier", dio: "Days inventory (DIO)", dso: "Days sales (DSO)",
    dpo: "Days payable (DPO)", ccc: "Cash conversion cycle",
  };
  var SHIFT_METRICS_DUPONT = ["roe", "net_margin", "asset_turnover", "equity_multiplier"];
  var SHIFT_METRICS_LIFE = ["dio", "dso", "dpo", "ccc"];
  var SHIFT_MIN_CHANGES = 3;
  var SHIFT_Z_FLOOR = 0.5;
  function mean(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
  function pstdev(a) {
    var m = mean(a);
    return Math.sqrt(a.reduce(function (x, y) { return x + (y - m) * (y - m); }, 0) / a.length);
  }
  function standardizedShift(metric, values) {
    var vals = values.filter(function (v) { return v !== null && v !== undefined && isFinite(v); });
    if (vals.length < SHIFT_MIN_CHANGES + 1) return null;
    var changes = [];
    for (var i = 1; i < vals.length; i++) changes.push(vals[i] - vals[i - 1]);
    if (changes.length < SHIFT_MIN_CHANGES) return null;
    var sd = pstdev(changes);
    if (sd < 1e-9) return null;
    var latest = changes[changes.length - 1];
    return { metric: metric, change: latest, z: (latest - mean(changes)) / sd };
  }
  function shiftCandidates(group) {
    var out = [];
    var s = state.series[group];
    if (s && s.points && s.points.length) {
      SHIFT_METRICS_DUPONT.forEach(function (m) {
        var r = standardizedShift(m, s.points.map(function (p) { return p[m]; }));
        if (r) out.push(r);
      });
    }
    var lc = state.lifecycle[group];
    if (lc && lc.points && lc.points.length) {
      SHIFT_METRICS_LIFE.forEach(function (m) {
        var r = standardizedShift(m, lc.points.map(function (p) { return p[m]; }));
        if (r) out.push(r);
      });
    }
    return out;
  }

  // ---------- data ----------

  function selectedSector() {
    if (!state.sectors || state.sectorIdx === null) return null;
    return state.sectors.sectors[state.sectorIdx] || null;
  }
  function selectedGroup() { var s = selectedSector(); return s ? s.group : null; }
  function themeEntry(group) {
    var p = state.themeScores;
    if (!p || !p.sectors) return null;
    return p.sectors.filter(function (x) { return x.group === group; })[0] || null;
  }
  function scoredThemes(entry) {
    return entry && entry.themes ? entry.themes.filter(function (t) { return t.scored; }) : [];
  }

  function init() {
    // Mount the ONE product shell (V3-P2). The search override keeps this page's behaviour: on
    // /sectors, submitting places a filer in its peer distribution rather than navigating away to
    // /company — that IS the Company view. Every other shell page uses the default (navigate).
    if (window.ClearyFiShell) {
      window.ClearyFiShell.mount({ onSearch: selectFocal });
      window.addEventListener("popstate", onPopState);
    }
    renderApp(); // initial (loading) shell
    P.api("/sectors")
      .then(function (res) {
        state.sectors = res;
        resolveInitialSector();
        // Normalize a legacy ?group=/?view= (or a bare /sectors) to the canonical path WITHOUT
        // adding a history entry -- the user never navigated to it.
        syncUrl({ replace: true });
        renderApp();
        ensureSectorData();
        var sym = params.get("symbol"); // ?symbol= presets the Company view focal (used by e2e)
        if (sym && !state.focalCik) selectFocal(sym);
        else if (state.view === "company" && !state.focalCik) resolveDefaultFocal();
      })
      .catch(function () {
        $("app").innerHTML = P.states.error({ copy: "Couldn't load sectors. Please try again." });
      });
    P.api("/sectors/theme-scores")
      .then(function (res) { state.themeScores = res; ensureExpandedTheme(); renderApp(); })
      .catch(function () { state.themeScoresErr = true; renderApp(); });
  }

  function resolveInitialSector() {
    var list = (state.sectors && state.sectors.sectors) || [];
    if (!list.length) { state.sectorIdx = null; return; }
    // Precedence: path (/sectors/{group}) -> legacy ?group= -> last sector used -> largest sector.
    var routed = window.ClearyFiShell ? window.ClearyFiShell.route().id : null;
    var want = routed || params.get("group") || lsGet(LS_LAST);
    var idx = -1;
    if (want) idx = list.findIndex(function (s) { return s.group === want; });
    if (idx < 0) {
      // default = largest by peer_count
      var best = 0;
      list.forEach(function (s, i) { if ((s.peer_count || 0) > (list[best].peer_count || 0)) best = i; });
      idx = best;
    }
    state.sectorIdx = idx;
    var g = list[idx].group; lsSet(LS_LAST, g);
  }

  // lazy per-sector fetches for the shifts (series+lifecycle) and drill-down (spreads)
  function ensureSectorData() {
    var g = selectedGroup();
    if (!g) return;
    if (!state.series[g]) {
      P.api("/sectors/" + encodeURIComponent(g))
        .then(function (r) { state.series[g] = r; if (selectedGroup() === g) renderApp(); })
        .catch(function () { state.series[g] = { points: [] }; });
    }
    if (!state.lifecycle[g]) {
      P.api("/sectors/" + encodeURIComponent(g) + "/lifecycle")
        .then(function (r) { state.lifecycle[g] = r; if (selectedGroup() === g) renderApp(); })
        .catch(function () { state.lifecycle[g] = { points: [] }; });
    }
    if (!state.spreads[g] && state.sectors) {
      P.api("/sectors/" + encodeURIComponent(g) + "/spreads?year=" + state.sectors.fiscal_year)
        .then(function (r) { state.spreads[g] = r; if (selectedGroup() === g) renderApp(); })
        .catch(function () { state.spreads[g] = { metrics: [] }; });
    }
    if (!state.insiderFlow[g]) {
      P.api("/sectors/" + encodeURIComponent(g) + "/insider-flow")
        .then(function (r) { state.insiderFlow[g] = r; if (selectedGroup() === g) renderApp(); })
        // a fetch failure caches an honest error marker so we render "No insider data", never $0
        .catch(function () { state.insiderFlow[g] = { has_data: false, _error: true }; });
    }
    if (!state.geoMix[g]) {
      P.api("/sectors/" + encodeURIComponent(g) + "/geographic-mix")
        .then(function (r) { state.geoMix[g] = r; if (selectedGroup() === g) renderApp(); })
        // a fetch failure caches an honest error marker so we render "No geo data", never 0%
        .catch(function () { state.geoMix[g] = { has_data: false, _error: true }; });
    }
  }

  // lazy spread fetch for an arbitrary group (Compare view needs A's and B's medians)
  function ensureSpreads(g) {
    if (!g || state.spreads[g] || !state.sectors) return;
    P.api("/sectors/" + encodeURIComponent(g) + "/spreads?year=" + state.sectors.fiscal_year)
      .then(function (r) { state.spreads[g] = r; if (state.view === "compare") renderApp(); })
      .catch(function () { state.spreads[g] = { metrics: [] }; if (state.view === "compare") renderApp(); });
  }
  function ensureCompareData() { ensureSpreads(state.compareA); ensureSpreads(state.compareB); }

  function ensureExpandedTheme() {
    var entry = themeEntry(selectedGroup());
    var scored = scoredThemes(entry);
    var has = state.expandedTheme && scored.some(function (t) { return t.theme === state.expandedTheme; });
    if (!has) state.expandedTheme = scored.length ? scored[0].theme : null;
  }

  // ---------- state transitions ----------

  function selectSector(idx) {
    if (idx === state.sectorIdx) { state.ddOpen = false; return renderApp(); }
    state.sectorIdx = idx;
    state.subIdx = null;
    state.decompTheme = null;
    state.ddOpen = false;
    var g = selectedGroup(); if (g) lsSet(LS_LAST, g);
    ensureExpandedTheme();
    syncUrl();
    // The Company view is scoped to the selected sector, so a new sector means a new focal --
    // keeping the old one would leave the dropdown listing the previous sector's filers (AC-22).
    if (state.view === "company") {
      state.focalCik = null; state.focalName = null; state.focalTicker = null;
      state.focalPeers = null; state.focalGroup = g;
      state.coTrendOpen = {};
      resolveFocalInGroup(g);
    }
    renderApp();
    ensureSectorData();
  }
  function setView(v) {
    state.view = v;
    syncUrl();
    renderApp();
    if (v === "company" && !state.focalCik) resolveDefaultFocal();
  }

  /* URL-as-state (V3-P2): the path is the serialization of the selection, so a view is linkable
   * and Back/Forward walk views. /sectors/{group}[/{view}] — the bare default view is dropped from
   * the path so /sectors/35 stays the clean address for "this sector, default view". */
  function syncUrl(opts) {
    if (!window.ClearyFiShell) return;
    var g = selectedGroup();
    var path = "/sectors" + (g ? "/" + encodeURIComponent(g) : "");
    // "filings" is a drill, not an addressable view; it returns to its opener via Back.
    if (state.view && state.view !== "sector" && state.view !== "filings") path += "/" + state.view;
    if (path === location.pathname) return;
    window.ClearyFiShell.navigate(path, opts);
  }

  // Back/Forward: re-derive the selection from the path rather than trusting in-memory state.
  function onPopState() {
    var r = window.ClearyFiShell.route();
    var list = (state.sectors && state.sectors.sectors) || [];
    if (r.id) {
      var idx = list.findIndex(function (s) { return s.group === r.id; });
      if (idx >= 0 && idx !== state.sectorIdx) {
        state.sectorIdx = idx;
        state.decompTheme = null;
        ensureExpandedTheme();
        ensureSectorData();
      }
    }
    if (r.view && r.view !== state.view) state.view = r.view;
    renderApp();
    if (state.view === "company" && !state.focalCik) resolveDefaultFocal();
  }
  // Open the Filings drill (P5) for a risk theme, remembering where we came from so Back returns
  // there. Resets the form tab + pager on every open (prototype §6). No data fetch -- placeholder.
  function openFilings(theme) {
    state.filingsTheme = theme || null;
    state.prevView = state.view; // "qual" in the normal flow; Back returns here
    state.filingsForm = "All";
    state.filingsPage = 0;
    state.view = "filings";
    renderApp();
  }
  function backFromFilings() { state.view = state.prevView || "qual"; renderApp(); }
  // A tile click opens BOTH the decomposition (what drove the score) AND the peer strip + drill-down.
  function expandTheme(theme) { state.expandedTheme = theme; state.decompTheme = theme; renderApp(); }
  function toggleDecomp(theme) { state.decompTheme = state.decompTheme === theme ? null : theme; renderApp(); }
  function togglePin() {
    // Pin the current sector as A and jump into the Compare view (the operator picks B there).
    var g = selectedGroup();
    if (!g) return;
    state.compareA = g;
    state.view = "compare";
    ensureCompareData();
    renderApp();
  }

  // ---------- render ----------

  /* Render the main column. The SHELL (sidebar + topbar) is NOT rendered here -- shell.js mounts
   * it once, outside #app, in init(). This function rewrites #app.innerHTML wholesale, so anything
   * inside it loses its listeners on every state change; that is exactly why the shell moved out
   * (V3-P2). The two-phase contract is unchanged and load-bearing: assign HTML strings, THEN let
   * renderViewport()'s mount*() passes append DOM nodes (every chart builder returns a node). */
  function renderApp() {
    var app = $("app");
    app.innerHTML =
      '<div class="pa-app">' +
      '<main class="pa-main">' +
      titleHtml() +
      controlBarHtml() +
      // shell: view rail · viewport (960px cap) · right rail (Sector: sector snapshot + feed + how-to;
      // Company: focal filer snapshot + how-to; Compare: A/B snapshot + how-to; Qualitative: Track-2
      // how-to note, no data). The right rail hides < 1240px (CSS) so the content keeps its room.
      '<div class="pa-body shell-body"><div id="railHost" class="shell-rail-host"></div><div class="pa-viewport shell-viewport" id="viewport"></div>' +
      (state.view === "sector" || (state.view === "company" && state.focalCik) || state.view === "compare" || state.view === "qual" ? rightRailHtml() : "") + "</div>" +
      "</main></div>";
    mountRail();
    renderViewport();
    wireShell();
  }

  // The view rail is the shared shell's (STYLE_GUIDE §4.2) -- a DOM node appended after the HTML
  // string pass, like every other builder.
  function mountRail() {
    var host = $("railHost");
    if (!host || !window.ClearyFiShell) return;
    host.appendChild(window.ClearyFiShell.rail({
      // "filings" is a drill reached from Qualitative, not a rail destination.
      views: [["sector", "Sector"], ["company", "Company"], ["compare", "Compare"], ["qual", "Qualitative"]],
      active: state.view,
      note: "Sector · period · company preserved across views. Selecting a sector keeps your current theme focus.",
      onSelect: setView,
    }));
  }

  function titleHtml() {
    var right = "";
    var sel = selectedSector();
    if (sel) right = P.esc(sel.group_label);
    return (
      '<div class="pa-titlerow"><div>' +
      '<h1 class="pa-title">Sector analytics</h1>' +
      '<div class="pa-subtitle">Built entirely from SEC-filed data · as of latest filing, not real-time</div>' +
      "</div><div class=\"pa-title-right\">" + right + "</div></div>" +
      '<div class="pa-title-rule"></div>'
    );
  }

  function controlBarHtml() {
    var list = (state.sectors && state.sectors.sectors) || [];
    var sel = selectedSector();
    var pinned = sel && (state.compareA === sel.group || state.compareB === sel.group);
    var menu = state.ddOpen
      ? '<div class="pa-dd-menu" id="paDdMenu">' + list.map(function (s, i) {
          var cur = i === state.sectorIdx;
          return '<button class="pa-dd-opt' + (cur ? " cur" : "") + '" data-idx="' + i + '">' +
            P.esc(s.group_label) + (cur ? '<span class="pa-dd-check">✓</span>' : "") + "</button>";
        }).join("") + "</div>"
      : "";
    var meta = state.sectors
      ? '<span class="pa-meta-item">' + (sel ? sel.peer_count + " filers" : "—") + "</span>" +
        '<span class="pa-meta-item">FY' + state.sectors.fiscal_year + "</span>" +
        '<span class="pa-meta-item">full peer set</span>' +
        // coverage is not tracked yet -> an honest placeholder, never a fabricated "% filed"
        '<span class="pa-meta-item pa-ph">coverage — to be defined</span>'
      : '<span class="pa-meta-item">loading…</span>';
    return (
      '<section class="pa-ctrl">' +
      '<div class="pa-ctrl-head"><span class="pa-ctrl-label">Sector</span>' +
      '<button class="pa-pin' + (pinned ? " on" : "") + '" id="paPin">' + (pinned ? "✓ Pinned to compare" : "Pin to compare") + "</button></div>" +
      '<div class="pa-dd"><button class="pa-dd-btn" id="paDdBtn">' +
      '<span>' + (sel ? P.esc(sel.group_label) : "Select a sector") + "</span>" +
      '<span class="pa-dd-caret' + (state.ddOpen ? " open" : "") + '">▾</span></button>' + menu + "</div>" +
      // Sub-industry (SIC-4) is not materialized yet -> an honest placeholder pill, no fabricated names.
      '<div class="pa-subind"><span class="pa-subind-label">Sub-industry</span>' +
      '<span class="pa-ph-pill">to be defined</span></div>' +
      '<div class="pa-meta">' + meta +
      '<span class="pa-meta-spacer"></span>' +
      '<span class="pa-legend">' +
      '<span class="pa-chip ok">● OK</span><span class="pa-chip approx">≈ APPROX</span>' +
      '<span class="pa-chip na">∅ N/A</span><span class="pa-chip nm">~ N/M</span></span>' +
      "</div></section>"
    );
  }

  // ---------- right rail (Sector view only): snapshot · "What's moving" feed placeholder · how-to-read ----------

  function rightRailHtml() {
    if (state.view === "company") return companyRailHtml();
    if (state.view === "compare") return compareRailHtml();
    if (state.view === "qual") return qualRailHtml();
    var sel = selectedSector();
    var name = sel ? sel.group_label : "—";
    // Snapshot k/v rows — real where we have it (filers · period), honest placeholder for coverage;
    // the focused-theme label reflects the current tile focus. No fabricated numbers.
    var rows = [
      ["Filers", sel ? sel.peer_count + "" : "—"],
      ["Period", state.sectors ? "FY" + state.sectors.fiscal_year : "—"],
      ["Coverage", "to be defined"],
      ["Focused theme", state.expandedTheme ? themeLabel(state.expandedTheme) : "—"],
    ].map(function (kv) {
      var isPh = kv[1] === "to be defined";
      return '<div class="pa-snap-row"><span class="pa-snap-k">' + P.esc(kv[0]) + "</span>" +
        '<span class="pa-snap-v' + (isPh ? " pa-ph" : "") + '">' + P.esc(kv[1]) + "</span></div>";
    }).join("");
    // "What's moving" — the prototype's filing-event feed is Track 2 (filing metadata / free text) we
    // don't aggregate at the sector level. Honest placeholder, NO fabricated events.
    var feed =
      '<div class="pa-rr-card pa-rr-feed"><div class="pa-rr-feedhead">' +
      '<span class="pa-rr-feedname">What’s moving</span><span class="pa-rr-t2">Track 2</span></div>' +
      '<div class="pa-rr-feedsub">Filing events · walled off from metrics</div>' +
      '<div class="pa-rr-feedbody pa-ph">A sector filing-event feed (8-K / Form 4 / S-1) would sit here — ' +
      "that’s Track 2 (filing metadata / free text) we don’t aggregate yet. To be defined; nothing here " +
      "is fabricated.</div></div>";
    return (
      '<aside class="pa-rrail">' +
      '<div class="pa-rr-card"><div class="pa-rr-label">Sector snapshot</div>' +
      '<div class="pa-rr-name">' + P.esc(name) + "</div>" +
      '<div class="pa-snap">' + rows + "</div></div>" +
      feed +
      '<div class="pa-rr-card"><div class="pa-rr-label">How to read this</div>' +
      '<div class="pa-rr-how">Scores are a position vs other sectors, not a good/bad or buy verdict. ' +
      "Every number is traceable — click a score to open its decomposition.</div>" +
      '<a class="pa-rr-method" href="/methodology">Methodology ↗</a></div>' +
      "</aside>"
    );
  }

  // Qualitative view right rail: NO data (this whole view is a Track-2 placeholder) — just an honest
  // "what this is" note + a "how to read this" card, so the rail matches the other views' shell and
  // the far-right column isn't left blank. Nothing here is derived or fabricated.
  function qualRailHtml() {
    return (
      '<aside class="pa-rrail">' +
      '<div class="pa-rr-card"><div class="pa-rr-label">Qualitative disclosures</div>' +
      '<div class="pa-rr-name">Track 2</div>' +
      '<div class="pa-rr-how pa-ph">The narrative side of filings — risk factors, going-concern, ' +
      "litigation, CAMs, cybersecurity, auditor changes. We ingest <strong>structured</strong> SEC " +
      "data only, so this free-text isn’t derived yet; every cell here is a placeholder.</div></div>" +
      '<div class="pa-rr-card"><div class="pa-rr-label">How to read this</div>' +
      '<div class="pa-rr-how">Nothing on this view is derived from filings or estimated. Each row and ' +
      "block shows the <em>shape</em> Track 2 will fill — expand a theme or “reveal the filers” to see " +
      "the honest empty state. When it ships, every signal will trace to a filing, like the rest of " +
      "the app.</div>" +
      '<a class="pa-rr-method" href="/methodology">Methodology ↗</a></div>' +
      "</aside>"
    );
  }

  // Compare view right rail: a snapshot of the A/B pair (names + filer counts + period, all real) plus
  // a how-to-read note that carries the no-winner / A-B-identity / profile-not-rank honesty rails.
  function compareRailHtml() {
    var A = state.compareA, B = state.compareB;
    var ca = sectorPeerCount(A), cb = sectorPeerCount(B);
    function row(kHtml, v, ph) {
      return '<div class="pa-snap-row"><span class="pa-snap-k">' + kHtml + "</span>" +
        '<span class="pa-snap-v' + (ph ? " pa-ph" : "") + '">' + P.esc(v) + "</span></div>";
    }
    var rows =
      row('<span class="pa-cmp-swatch pa-cmp-idA"></span>Sector A', A ? sectorLabel(A) : "—", !A) +
      row('<span class="pa-cmp-swatch pa-cmp-idB"></span>Sector B', B ? sectorLabel(B) : "—", !B) +
      row("Filers", (ca != null ? ca : "—") + " vs " + (cb != null ? cb : "—"), ca == null && cb == null) +
      row("Period", state.sectors ? "FY" + state.sectors.fiscal_year : "—", !state.sectors);
    return (
      '<aside class="pa-rrail">' +
      '<div class="pa-rr-card"><div class="pa-rr-label">Compare snapshot</div>' +
      '<div class="pa-snap">' + rows + "</div></div>" +
      '<div class="pa-rr-card"><div class="pa-rr-label">How to read this</div>' +
      '<div class="pa-rr-how">Bars are true-length and <strong>no winner is declared</strong> — A and B mark ' +
      "identity only, not good vs bad. The radar is a profile (shape across themes), not a rank: neither " +
      "larger area is better. Scores are a position vs other sectors (50 = average).</div>" +
      '<a class="pa-rr-method" href="/methodology">Methodology ↗</a></div>' +
      "</aside>"
    );
  }

  // Company view right rail: a snapshot of the FOCAL filer (its own SIC peer context -- never the
  // dropdown sector, which can differ from the focal's group), plus a how-to-read note. All real.
  function companyRailHtml() {
    var peers = state.focalCik ? focalPeerList() : [];
    var rows = [
      ["Ticker", state.focalTicker || "—"],
      ["Peer group", state.focalGroup ? "SIC " + state.focalGroup : "—"],
      ["Peers", peers.length ? peers.length + "" : "—"],
      ["Period", "FY" + focalYear()],
    ].map(function (kv) {
      var isPh = kv[1] === "—";
      return '<div class="pa-snap-row"><span class="pa-snap-k">' + P.esc(kv[0]) + "</span>" +
        '<span class="pa-snap-v' + (isPh ? " pa-ph" : "") + '">' + P.esc(kv[1]) + "</span></div>";
    }).join("");
    return (
      '<aside class="pa-rrail">' +
      '<div class="pa-rr-card"><div class="pa-rr-label">Filer snapshot</div>' +
      '<div class="pa-rr-name">' + P.esc(focalLabel()) + "</div>" +
      '<div class="pa-snap">' + rows + "</div></div>" +
      '<div class="pa-rr-card"><div class="pa-rr-label">How to read this</div>' +
      '<div class="pa-rr-how">Each dot is a filer in this SIC peer group; the ◆ is this filer. ' +
      "Percentiles are favorability-adjusted and exclude N/A · N/M filers. Click a sparkline for the " +
      "trailing 8-quarter trend.</div></div>" +
      "</aside>"
    );
  }

  // ---------- viewport dispatch ----------

  function renderViewport() {
    var vp = $("viewport");
    if (state.view === "sector") return renderSectorView(vp);
    if (state.view === "company") return renderCompanyView(vp);
    if (state.view === "compare") return renderCompareView(vp);
    if (state.view === "filings") return renderFilingsView(vp);
    return renderQualView(vp);
  }

  // ---------- Qualitative view (altitude 4): honest Track-2 placeholder LAYOUT (v2, P4) ----------
  //
  // HONESTY LANDMINE (CLAUDE.md guardrail 1 / REDESIGN honesty flag 1): this product ingests
  // STRUCTURED SEC data only (Track 1). Qualitative disclosures are free-text narrative -- a
  // deliberate later decision, NOT a gap we fill with estimates. This view renders the FULL SHAPE
  // of what Track 2 will deliver, but NOTHING derived and NOTHING fabricated: labels + one-line
  // source notes only, and every data cell (bar/chip/count/●/excerpt/ticker) is an unmistakable
  // placeholder. The click-to-expand (themes) and click-to-reveal (filer counts) affordances are
  // WIRED, but every revealed panel is an honest empty state -- never data. (See wireQualView.)

  // The 7 real theme LABELS (not data) used as the risk-factor-theme row labels in the placeholder
  // layout (mirrors CO_THEMES + CO_DEFERRED, hardcoded to avoid init-order coupling). Every value
  // beside them is a placeholder -- see renderQualView.
  var QUAL_THEMES = [
    "Profitability & returns", "Growth", "Financial health", "Cash & investment",
    "Operating efficiency", "Accounting quality", "Structure & activity",
  ];
  // The prototype's right-column cards + the per-filer matrix columns -- rendered as EMPTY placeholders.
  var QUAL_SIDE = [
    ["Emerging this year", "Risk themes appearing or intensifying this filing cycle."],
    ["Going-concern watch", "Filers using substantial-doubt language."],
    ["Material litigation", "Material legal & regulatory disclosures."],
  ];
  var QUAL_MATRIX_COLS = ["Filer", "Risk factors", "New", "Going concern", "Litigation"];
  // Disclosure-landscape blocks (prototype §5.4): [title, what-it-will-show + SEC source]. LABELS
  // ONLY -- descriptions say what the block WILL show, never a value. `reveal` blocks carry a
  // click-to-reveal "which filers" affordance that opens an honest empty state (no tickers shown).
  var QUAL_DISCLOSURE = [
    ["Cybersecurity", "Material incidents + governance — 10-K Item 1C · 8-K Item 1.05", true],
    ["Critical Audit Matters", "Auditor-flagged CAMs — auditor’s report (PCAOB AS 3101)", false],
    ["Auditor landscape", "Auditor share · changes · tenure — 10-K signature · 8-K Item 4.01", true],
    ["Risk-factor volume", "Item 1A word-count trend + net-new — 10-K/10-Q Item 1A", false],
    ["Non-GAAP & charges", "Non-GAAP usage + reconciliations — 8-K Item 2.02 · MD&A", false],
    ["Late & deficient filings", "Late notices · ICFR weakness · restatements — NT · Item 9A · 8-K 4.02", true],
    ["Human-capital & climate", "Workforce metrics + voluntary climate — 10-K Item 1", false],
  ];

  // A wired-but-empty click-to-reveal control + (when open) an honest empty panel. `id` keys
  // state.qualFilerOpen; the revealed panel NEVER lists a ticker -- it says none is shown.
  function qualReveal(id, label) {
    var open = !!state.qualFilerOpen[id];
    var btn =
      '<button type="button" class="pa-qual-reveal" data-qual-filer="' + P.esc(id) + '"' +
      ' aria-expanded="' + (open ? "true" : "false") + '"><span class="pa-qual-caret">' +
      (open ? "▾" : "▸") + "</span>" + P.esc(label) + "</button>";
    var panel = open
      ? '<div class="pa-qual-filerpanel">The specific filers behind this will list here — ' +
        '<span class="pa-qual-phtag">to be defined · none shown</span>. No tickers are fabricated.</div>'
      : "";
    return btn + panel;
  }

  function renderQualView(vp) {
    // --- Risk-factor themes (left, 3fr): 7 real theme labels; each row click-to-expand its
    //     representative language into an HONEST EMPTY panel; a persistent inert "Filings →" stub. ---
    var rtRows = QUAL_THEMES.map(function (name) {
      var open = state.qualThemeOpen === name;
      var row =
        '<div class="pa-qual-rtrow' + (open ? " is-open" : "") + '" role="button" tabindex="0"' +
        ' aria-expanded="' + (open ? "true" : "false") + '" data-qual-theme="' + P.esc(name) + '">' +
        '<span class="pa-qual-rtname">' + P.esc(name) + "</span>" +
        '<span class="pa-qual-rtmid"><span class="pa-qual-rtbar"></span><span class="pa-qual-dash">—</span></span>' +
        '<span class="pa-qual-rtend"><span class="pa-qual-planned">planned</span>' +
        '<button type="button" class="pa-qual-filings" data-qual-filings="' + P.esc(name) + '">Filings →</button>' +
        "</span></div>";
      var lang = open
        ? '<div class="pa-qual-langpanel">Representative language will appear here — a verbatim excerpt ' +
          'and its source filing. <span class="pa-qual-phtag">to be defined · no filing text shown</span>. ' +
          "Nothing is quoted or paraphrased from a filing yet." +
          '<div class="pa-qual-langfoot"><button type="button" class="pa-qual-langfilings" ' +
          'data-qual-filings="' + P.esc(name) + '">Open filings in ClearyFi →</button></div></div>'
        : "";
      return row + lang;
    }).join("");
    var rtCard =
      '<div class="pa-card pa-qual-rt"><div class="pa-qual-cardhead">' +
      '<span class="pa-qual-cardname">Risk-factor themes</span>' +
      '<span class="pa-qual-cardnote">share of filers citing · YoY direction · click a row for language</span></div>' +
      rtRows +
      '<div class="pa-qual-rtfoot">Track 2 — the share-of-filers coverage + YoY direction here will come ' +
      "from risk-factor <strong>narrative</strong> we don’t ingest yet. Placeholder; nothing shown.</div></div>";

    // --- right column (2fr): 3 placeholder cards ---
    var sideCards = QUAL_SIDE.map(function (c) {
      return (
        '<div class="pa-card pa-qual-sidecard"><div class="pa-qual-cardhead">' +
        '<span class="pa-qual-cardname">' + P.esc(c[0]) + "</span><span class=\"pa-qual-dash\">—</span></div>" +
        '<div class="pa-qual-phbody">' + P.esc(c[1]) + ' <span class="pa-qual-phtag">to be defined · no filers shown</span></div></div>'
      );
    }).join("");

    // --- per-filer signals matrix: column headers + a placeholder body (no fabricated rows) ---
    var mhead = QUAL_MATRIX_COLS.map(function (c, i) {
      return '<span class="pa-qual-mcol' + (i === 0 ? " first" : "") + '">' + P.esc(c) + "</span>";
    }).join("");
    var matrix =
      '<div class="pa-card pa-qual-matrix"><div class="pa-qual-cardhead">' +
      '<span class="pa-qual-cardname">Per-filer signals</span>' +
      '<span class="pa-qual-cardnote">flags derived from narrative sections · discrete, not distributions</span></div>' +
      '<div class="pa-qual-mhead">' + mhead + "</div>" +
      '<div class="pa-qual-phbody pa-qual-mbody">Per-filer flags will list here — <span class="pa-qual-phtag">to be defined</span>. ' +
      "No filers are shown; nothing here is fabricated.<div class=\"pa-qual-revealrow\">" +
      qualReveal("matrix", "Reveal the filers behind these signals") + "</div></div></div>";

    // --- Disclosure landscape (§5.4): 7 placeholder blocks; some carry a click-to-reveal filers stub ---
    var blocks = QUAL_DISCLOSURE.map(function (b, i) {
      var reveal = b[2]
        ? '<div class="pa-qual-revealrow">' + qualReveal("dl" + i, "Reveal the filers") + "</div>"
        : "";
      return (
        '<div class="pa-qual-block"><div class="pa-qual-block-head">' +
        '<span class="pa-qual-block-name">' + P.esc(b[0]) + "</span>" +
        '<span class="pa-qual-planned">planned</span></div>' +
        '<div class="pa-qual-block-src">' + P.esc(b[1]) + "</div>" +
        '<div class="pa-qual-phbody">What it will show is mapped; the counts are ' +
        '<span class="pa-qual-phtag">to be defined</span>.</div>' + reveal + "</div>"
      );
    }).join("");
    var landscape =
      '<div class="pa-sec-head"><span class="pa-sec-num">02</span><h2 class="pa-sec-h2">Disclosure landscape</h2></div>' +
      '<div class="pa-sec-sub">Signals we can source from specific SEC sections once narrative parsing ships — ' +
      "each block a placeholder for now.</div>" +
      '<div class="pa-qual-grid pa-qual-landscape">' + blocks + "</div>";

    vp.innerHTML =
      '<div class="pa-sec-head"><span class="pa-sec-num">01</span><h2 class="pa-sec-h2">Qualitative disclosures</h2></div>' +
      '<div class="pa-sec-sub">The narrative side of filings — risk factors, going-concern, litigation. Not yet available.</div>' +
      '<div class="pa-qual-banner"><span class="pa-qual-flag">Track 2 · not yet derived from filings</span>' +
      "<p class=\"pa-qual-why\">ClearyFi ingests <strong>structured</strong> SEC data only — the numbers in " +
      "financial statements, ownership forms, and 13F tables. Qualitative disclosures (risk factors, " +
      "going-concern language, litigation) are <strong>free-text narrative</strong>; extracting them is a " +
      "deliberate later decision, not a gap we paper over with estimates. <strong>Nothing here is " +
      "fabricated</strong> — when it ships, every signal will trace to a filing, like the rest of the app.</p></div>" +
      '<div class="pa-qual-planned-label">The layout Track 2 would fill — every cell a placeholder</div>' +
      '<div class="pa-qual-cols"><div class="pa-qual-colL">' + rtCard + "</div>" +
      '<div class="pa-qual-colR">' + sideCards + "</div></div>" +
      matrix +
      landscape +
      '<div class="pa-qual-foot">Nothing on this view is derived from filings or estimated.</div>';

    wireQualView();
  }

  function wireQualView() {
    // Risk-theme row -> toggle its representative-language panel (single-open). Keyboard-operable.
    document.querySelectorAll(".pa-qual-rtrow[data-qual-theme]").forEach(function (row) {
      var name = row.getAttribute("data-qual-theme");
      function toggle() { state.qualThemeOpen = (state.qualThemeOpen === name) ? null : name; renderApp(); }
      row.addEventListener("click", toggle);
      row.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      });
    });
    // "Filings →" (row) and "Open filings in ClearyFi →" (language panel) -> open the Filings drill
    // (P5) for that theme. stopPropagation so the row's language-toggle doesn't also fire.
    document.querySelectorAll(".pa-qual-filings[data-qual-filings], .pa-qual-langfilings[data-qual-filings]").forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); e.preventDefault(); openFilings(b.getAttribute("data-qual-filings")); });
    });
    // Click-to-reveal filer counts -> toggle an honest empty panel (never tickers).
    document.querySelectorAll("[data-qual-filer]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = b.getAttribute("data-qual-filer");
        if (state.qualFilerOpen[id]) delete state.qualFilerOpen[id];
        else state.qualFilerOpen[id] = true;
        renderApp();
      });
    });
  }

  // ---------- Filings view (5th, P5): on-site theme DRILL — honest Track-2 placeholder LAYOUT ----------
  //
  // HONESTY LANDMINE (CLAUDE.md guardrail 1 / roadmap decision 3): the per-theme filing list, cited
  // passages, coverage %, direction, and filing count are all Track-2 NARRATIVE we don't ingest. This
  // view replicates the prototype's §5.5 SHAPE — breadcrumb, coverage/direction chip, count line,
  // representative-language block, form-type tabs, paginated list — but renders NOTHING derived and
  // NOTHING fabricated. The form tabs, pager, and Back are REAL controls; the list they operate over
  // is an honest EMPTY placeholder. The ONLY real strings are the live sector label + the drilled
  // theme label (both genuinely known) and static UI copy / form-type control labels. Never a filer,
  // ticker, accession no., filed date, form count, coverage %, direction, section, or cited passage.

  var FILINGS_FORMS = ["All", "10-K", "10-Q", "8-K"]; // form-type tab labels (controls, not data)
  var FILINGS_COLS = ["Filer", "Form", "Filed", "Section", "Cited passage"]; // list header labels

  // The placeholder list is EMPTY -> a single empty page. Never fabricate a page/row/total count.
  function filingsTotalPages() { return 1; }
  function setFilingsPage(p) {
    var total = filingsTotalPages();
    state.filingsPage = Math.max(0, Math.min(p, total - 1)); // clamp; ends are no-ops, never throw
    renderApp();
  }

  function renderFilingsView(vp) {
    var sel = selectedSector();
    var sectorLabel = sel ? P.esc(sel.group_label) : "Sector"; // live selection — real, not a placeholder
    var theme = state.filingsTheme ? P.esc(state.filingsTheme) : "Risk theme"; // the drilled theme — real

    // --- header: Back + breadcrumb (sector › Risk theme › <name>). Real strings; no fabrication. ---
    var head =
      '<div class="pa-fil-top">' +
      '<button type="button" class="pa-fil-back" id="paFilBack">← Back</button>' +
      '<nav class="pa-fil-crumb" aria-label="Breadcrumb">' +
      '<span class="pa-fil-crumb-seg">' + sectorLabel + "</span>" +
      '<span class="pa-fil-crumb-sep">›</span>' +
      '<span class="pa-fil-crumb-seg">Risk theme</span>' +
      '<span class="pa-fil-crumb-sep">›</span>' +
      '<span class="pa-fil-crumb-seg cur">' + theme + "</span>" +
      "</nav></div>";

    // --- Track-2 framing (matches the Qualitative view's tone: deliberate, not broken) ---
    var note =
      '<div class="pa-fil-note"><span class="pa-qual-flag">Track 2 · not yet derived from filings</span>' +
      '<p class="pa-fil-why">The filings behind this theme come from risk-factor <strong>narrative</strong> ' +
      "(10-K Item 1A and updates) that ClearyFi doesn’t ingest yet. This is the shape the drill will take — " +
      "<strong>nothing here is fabricated</strong>; no filing, filer, date, or passage is shown until it can " +
      "trace to a real filing.</p></div>";

    // --- coverage + direction chip (placeholder: empty bar + dash, no % / no new-rising-fading value) ---
    var meta =
      '<div class="pa-fil-meta">' +
      '<div class="pa-fil-cov"><span class="pa-fil-cov-label">Coverage</span>' +
      '<span class="pa-qual-rtbar"></span><span class="pa-qual-dash">—</span></div>' +
      '<div class="pa-fil-dir"><span class="pa-fil-dir-label">Direction</span>' +
      '<span class="pa-qual-planned">planned</span></div>' +
      '<div class="pa-fil-count"><span class="pa-fil-count-label">Filings</span>' +
      '<span class="pa-ph">— · to be defined</span></div>' +
      "</div>";

    // --- representative-language block (placeholder, same shape as the Qualitative panel) ---
    var lang =
      '<div class="pa-fil-lang"><div class="pa-fil-lang-head">Representative language</div>' +
      '<div class="pa-fil-lang-body">A verbatim excerpt and its source filing will appear here. ' +
      '<span class="pa-qual-phtag">to be defined · no filing text shown</span>. ' +
      "Nothing is quoted or paraphrased from a filing yet.</div></div>";

    // --- form-type tabs (REAL controls; every tab resolves to the same empty placeholder list) ---
    var tabs = FILINGS_FORMS.map(function (f) {
      var active = state.filingsForm === f;
      return '<button type="button" class="pa-fil-tab' + (active ? " active" : "") + '" role="tab"' +
        ' aria-selected="' + (active ? "true" : "false") + '" data-fil-form="' + P.esc(f) + '">' + P.esc(f) + "</button>";
    }).join("");
    var tabRow = '<div class="pa-fil-tabs" role="tablist" aria-label="Filter by form type">' + tabs + "</div>";

    // --- list: header labels (not data) + an honest EMPTY body (no fabricated rows) ---
    var mhead = FILINGS_COLS.map(function (c, i) {
      return '<span class="pa-fil-mcol' + (i === 0 ? " first" : "") + '">' + P.esc(c) + "</span>";
    }).join("");
    var listBody =
      '<div class="pa-fil-empty">Filings will list here — filer, form, filed date, section, and the matched ' +
      'cited passage. <span class="pa-qual-phtag">to be defined · none shown</span>. ' +
      "No filing is fabricated.</div>";
    var list =
      '<div class="pa-fil-list"><div class="pa-fil-mhead">' + mhead + "</div>" + listBody + "</div>";

    // --- pager (REAL controls over the empty list): prev/next + a page token; range "— of —" ---
    var atFirst = state.filingsPage <= 0;
    var atLast = state.filingsPage >= filingsTotalPages() - 1;
    var pager =
      '<div class="pa-fil-pager">' +
      '<span class="pa-fil-range">— of —</span>' + // NEVER a fabricated "1–6 of 14"
      '<div class="pa-fil-pg">' +
      '<button type="button" class="pa-fil-pg-btn pa-fil-pg-prev"' + (atFirst ? " disabled" : "") + '>‹ Prev</button>' +
      '<span class="pa-fil-pg-num">—</span>' + // no fabricated page numbers over an empty list
      '<button type="button" class="pa-fil-pg-btn pa-fil-pg-next"' + (atLast ? " disabled" : "") + '>Next ›</button>' +
      "</div></div>";

    vp.innerHTML =
      head + note + meta + lang + tabRow + list + pager +
      '<div class="pa-fil-foot">Nothing on this view is derived from filings or estimated.</div>';

    wireFilingsView();
  }

  function wireFilingsView() {
    var back = $("paFilBack");
    if (back) back.addEventListener("click", backFromFilings);
    // Form tabs -> set the active form + re-render. Every tab resolves to the same empty list.
    document.querySelectorAll(".pa-fil-tab[data-fil-form]").forEach(function (b) {
      b.addEventListener("click", function () { state.filingsForm = b.getAttribute("data-fil-form"); renderApp(); });
    });
    // Pager -> clamp within [0, totalPages-1]. Over the empty list the ends are no-ops (never throw).
    var prev = document.querySelector(".pa-fil-pg-prev");
    var next = document.querySelector(".pa-fil-pg-next");
    if (prev) prev.addEventListener("click", function () { setFilingsPage(state.filingsPage - 1); });
    if (next) next.addEventListener("click", function () { setFilingsPage(state.filingsPage + 1); });
  }

  // ---------- Sector view ----------

  function deltaGlyph(d) {
    if (d === null || d === undefined) return "→";
    if (d > 0) return "↑";
    if (d < 0) return "↓";
    return "→";
  }
  function deltaLabel(d) {
    if (d === null || d === undefined) return "no prior FY";
    if (d === 0) return "±0";
    return (d > 0 ? "+" : "") + d;
  }
  // Favorability of the trend-delta chip (STYLE_GUIDE §1 exception): a higher theme score is always
  // more favorable, so delta>0 is positive, delta<0 negative; flat/null stays neutral (no color).
  // Color ACCOMPANIES the arrow glyph (never color alone); the score number itself stays neutral.
  function deltaClass(d) {
    if (d === null || d === undefined || d === 0) return "";
    return d > 0 ? " pos" : " neg";
  }

  function renderSectorView(vp) {
    var g = selectedGroup();
    var entry = themeEntry(g);
    if (state.themeScoresErr) {
      vp.innerHTML = secHead() + '<div class="pa-card">' + P.states.error({ copy: "Couldn't load the composite health scores." }) + "</div>";
      return;
    }
    if (!state.themeScores) { vp.innerHTML = secHead() + '<div class="pa-card">' + P.states.loading({ title: "Loading composite health", note: "" }) + "</div>"; return; }
    if (!entry || !entry.themes || !entry.themes.length) {
      vp.innerHTML = secHead() +
        '<div class="pa-card">' + P.states.empty({
          title: "Composite health scores aren’t available yet",
          copy: "This sector has no materialized theme scores — they appear once the scoring batch runs. Sparse coverage, not zero.",
        }) + "</div>";
      return;
    }
    ensureExpandedTheme();
    ensureDecompTheme();
    vp.innerHTML =
      // 01 Health scorecard — tiles (F4 delta color kept) + provisional + peer strip + geo/insider placeholders
      scopeHead("01", "Health scorecard", "Seven composite themes · percentile-averaged (provisional) · click a tile to focus it below; the peer strip shows where this sector stands") +
      scorecardHtml(entry) +
      '<div class="pa-provisional">≈ Scores provisional — final weighting/normalization per methodology. Every number is a position vs other sectors, not a good/bad or buy verdict, and is openable.</div>' +
      peerStripHtml() +
      geoInsiderRowHtml() +
      // 02 What drives it — decomposition (full-width, open by default) then biggest shifts
      scopeHead("02", "What drives it", "Constituent decomposition of the focused theme · then the largest standardized moves vs the sector’s own history") +
      (state.decompTheme ? decompHtml(entry) : "") +
      shiftsHtml(g) +
      // 03 Distribution — one card with a [This theme] / [All metrics] toggle over the dispersion spreads
      scopeHead("03", "Distribution", "How spread out the filers are · band = IQR · tick = median") +
      distributionHtml(entry, g);
    wireSectorView();
    mountDistribution(entry, g);
  }

  // The 01 header kept for the guard states (loading/error/empty) above; the populated view uses scopeHead.
  function secHead() {
    return scopeHead("01", "Health scorecard", "Seven composite themes · click a tile to open its decomposition, peers &amp; dispersion");
  }
  function scopeHead(num, title, sub) {
    return (
      '<div class="pa-sec-head"><span class="pa-sec-num">' + P.esc(num) + '</span><h2 class="pa-sec-h2">' + P.esc(title) + "</h2></div>" +
      '<div class="pa-sec-sub">' + sub + "</div>"
    );
  }
  // The decomposition is OPEN BY DEFAULT on the focused theme (v2): if nothing is targeted, or the
  // target isn't a scored theme of this sector, point it at the focused/first-scored theme.
  function ensureDecompTheme() {
    var entry = themeEntry(selectedGroup());
    var scored = scoredThemes(entry);
    var has = state.decompTheme && scored.some(function (t) { return t.theme === state.decompTheme; });
    if (!has) state.decompTheme = state.expandedTheme || (scored.length ? scored[0].theme : null);
  }

  function scorecardHtml(entry) {
    var tiles = entry.themes.map(function (t) {
      if (!t.scored) {
        return '<div class="pa-tile pa-tile-def">' +
          '<div class="pa-tile-name">' + P.esc(t.theme_label) + "</div>" +
          '<div class="pa-tile-notscored">Not yet scored</div>' +
          '<div class="pa-tile-reason">' + P.esc(t.reason || "") + "</div></div>";
      }
      var pct = (t.percentile === null || t.percentile === undefined) ? "—" : "P" + Math.round(t.percentile);
      var rank = t.rank && t.rank_of ? t.rank + " of " + t.rank_of : "—";
      var expanded = state.expandedTheme === t.theme;
      return (
        '<div class="pa-tile' + (expanded ? " expanded" : "") + '" role="button" tabindex="0" data-theme="' + P.esc(t.theme) + '">' +
        '<div class="pa-tile-name">' + P.esc(t.theme_label) + "</div>" +
        '<div class="pa-tile-scorerow">' +
        '<button class="pa-tile-score" data-score-theme="' + P.esc(t.theme) + '" title="Show what drove this score">' + P.esc(String(t.score)) + "</button>" +
        '<span class="pa-tile-delta' + deltaClass(t.delta_vs_prior_fy) + '"><span class="pa-glyph">' + deltaGlyph(t.delta_vs_prior_fy) + "</span>" + P.esc(deltaLabel(t.delta_vs_prior_fy)) + "</span>" +
        "</div>" +
        '<div class="pa-tile-pctile">' + P.esc(pct) + " · vs all sectors</div>" +
        '<div class="pa-tile-rank">' + P.esc(rank) + "</div>" +
        "</div>"
      );
    }).join("");
    return '<div class="pa-scorecard">' + tiles + "</div>";
  }

  function decompHtml(entry) {
    var t = (entry.themes || []).filter(function (x) { return x.theme === state.decompTheme && x.scored; })[0];
    if (!t) return "";
    var cons = t.constituents || [];
    var maxZ = cons.reduce(function (m, c) { return Math.max(m, Math.abs(c.oriented_z || 0)); }, 1);
    var n = cons.length || 1;
    var rows = cons.map(function (c) {
      var z = c.oriented_z || 0;
      var w = Math.min(100, (Math.abs(z) / maxZ) * 100);
      var glyph = z > 0 ? "↑" : z < 0 ? "↓" : "→";
      return (
        '<div class="pa-decomp-row">' +
        '<span class="pa-decomp-label">' + P.esc(c.label) + "</span>" +
        '<span class="pa-decomp-weight">1/' + n + "</span>" +
        '<span class="pa-decomp-bar"><span class="pa-decomp-fill" style="width:' + w.toFixed(0) + '%"></span></span>' +
        '<span class="pa-decomp-contrib"><span class="pa-glyph">' + glyph + "</span>" + (z >= 0 ? "+" : "") + z.toFixed(2) + "σ</span>" +
        "</div>"
      );
    }).join("");
    return (
      '<div class="pa-decomp"><div class="pa-decomp-head">' +
      '<span class="pa-decomp-title">' + P.esc(t.theme_label) + " · " + t.score + " composite</span>" +
      '<button class="pa-decomp-close" id="paDecompClose">− close</button></div>' +
      '<div class="pa-decomp-method">Equal-weight mean of ' + n + " constituents · " + P.esc(state.themeScores.normalization) + "</div>" +
      rows +
      '<div class="pa-decomp-foot">Bar = magnitude of each constituent’s favorability-oriented z-score (position vs other sectors); arrow = direction. A constituent with no comparable value is excluded, never counted as zero.</div>' +
      "</div>"
    );
  }

  function peerStripHtml() {
    var theme = state.expandedTheme;
    var g = selectedGroup();
    var bars = [];
    ((state.themeScores && state.themeScores.sectors) || []).forEach(function (s) {
      var t = (s.themes || []).filter(function (x) { return x.theme === theme && x.scored; })[0];
      if (t) bars.push({ group: s.group, label: s.group_label, score: t.score, focal: s.group === g });
    });
    var label = themeLabel(theme);
    var body;
    if (bars.length < 2) {
      body = '<div class="pa-empty-inline">Not enough sectors score this theme to place ' + P.esc(selName()) + " against peers yet.</div>";
    } else {
      bars.sort(function (a, b) { return b.score - a.score; });
      body = '<div class="pa-ps-bars">' + bars.map(function (b) {
        return '<span class="pa-ps-bar' + (b.focal ? " focal" : "") + '" style="height:' + Math.max(6, b.score) + '%" title="' + P.esc(b.label) + " · " + b.score + '"></span>';
      }).join("") + "</div>";
    }
    return (
      '<div class="pa-card"><div class="pa-card-head">' +
      '<span class="pa-card-title">Where this sector sits</span>' +
      '<span class="pa-card-hint">' + P.esc(label) + " · " + bars.length + " sectors · FY" + (state.themeScores.fiscal_year) + " · " + P.esc(selName()) + " highlighted</span></div>" +
      body + "</div>"
    );
  }

  function shiftsHtml(g) {
    var body;
    if (!state.series[g]) {
      body = P.states.loading({ title: "Loading shifts", note: "" });
    } else {
      var cands = shiftCandidates(g)
        .filter(function (r) { return Math.abs(r.z) >= SHIFT_Z_FLOOR; })
        .sort(function (a, b) { return Math.abs(b.z) - Math.abs(a.z); })
        .slice(0, 5);
      if (!cands.length) {
        body = '<div class="pa-empty-inline">Not enough history yet to flag a standardized move for this sector.</div>';
      } else {
        body = cands.map(function (r) {
          var glyph = r.change > 0 ? "↑" : r.change < 0 ? "↓" : "→";
          var val = (r.change > 0 ? "+" : "") + metricFmt(r.metric, r.change).replace(/^-/, "−");
          // "notable" is a real threshold on the standardized move (|z| >= 1.5), not fabricated.
          var flag = Math.abs(r.z) >= 1.5 ? '<span class="pa-shift-flag">notable</span>' : "";
          return (
            '<div class="pa-shift-row">' +
            '<span class="pa-shift-glyph">' + glyph + "</span>" +
            '<span class="pa-shift-name">' + P.esc(SHIFT_LABELS[r.metric] || r.metric) + "</span>" +
            flag +
            '<span class="pa-shift-delta">' + P.esc(val) + "</span>" +
            '<span class="pa-shift-basis">' + (r.z >= 0 ? "+" : "−") + Math.abs(r.z).toFixed(1) + "σ vs its own history</span>" +
            "</div>"
          );
        }).join("");
      }
    }
    return (
      '<div class="pa-card"><div class="pa-card-head">' +
      '<span class="pa-card-title">Biggest shifts</span>' +
      '<span class="pa-card-hint">largest standardized year-over-year move among this sector’s DuPont + working-capital metrics</span></div>' +
      body + "</div>"
    );
  }

  // ---- 01's geo/insider row: two placeholder cards (Track-1 not aggregated at the sector level) ----

  function geoInsiderRowHtml() {
    // Both cards are real now: Geographic mix (P6b) + Insider flow (P6a).
    return '<div class="pa-drill-row pa-geo-row">' + geoCardHtml() + insiderCardHtml() + "</div>";
  }
  // Geographic revenue mix (ASC 280) — REAL (P6b). A DERIVED, revenue-weighted sector rollup of
  // companies' reported ASC 280 geographic revenue from GET /v1/sectors/{group}/geographic-mix.
  // Value-neutral: geography is not good/bad, so the split uses ONE accent family (domestic solid,
  // international lightened) + a hatched "other/unclassified" (a residual, SHOWN not hidden), never a
  // green/red code. No data reads N/A, never 0%. See docs/delivery/sector-geographic-mix.
  function geoSegHtml(cls, share) {
    return '<span class="pa-geo-seg ' + cls + '" style="width:' +
      Math.max(0, share * 100).toFixed(2) + '%"></span>';
  }
  function geoLegendRow(cls, label, share, amount) {
    return (
      '<div class="pa-geo-leg-row"><span class="pa-geo-sw ' + cls + '"></span>' +
      '<span class="pa-geo-leg-label">' + P.esc(label) + "</span>" +
      '<span class="pa-geo-leg-pct">' + P.esc(P.fmt.pct(share)) + "</span>" +
      '<span class="pa-geo-leg-amt">' + P.esc(P.fmt.usd(amount)) + "</span></div>"
    );
  }
  function geoCardHtml() {
    var g = selectedGroup();
    var d = state.geoMix[g];
    var cov =
      d && d.has_data && typeof d.revenue_covered_share === "number"
        ? " · " + P.fmt.pct(d.revenue_covered_share) + " of revenue covered"
        : "";
    var head =
      '<div class="pa-card-head"><span class="pa-card-title">Geographic revenue mix</span>' +
      '<span class="pa-card-hint">ASC 280' +
      (d && d.has_data && d.fiscal_year ? " · FY" + d.fiscal_year : "") + cov + "</span></div>";
    var body;
    if (!d) {
      body = P.states.loading({ title: "Loading geographic mix", note: "" });
    } else if (!d.has_data || !d.mix) {
      // Honest N/A — no company in the sector disclosed usable ASC 280 geography (or the fetch
      // failed). A domestic/international split we don't have is N/A, never a fabricated 0%.
      body =
        '<div class="pa-empty-inline">No ASC 280 geographic disclosure ingested for this sector ' +
        "yet — no domestic/international split to show. Shown as N/A, not zero.</div>";
    } else {
      var m = d.mix;
      var bar =
        '<div class="pa-geo-bar" role="img" aria-label="Domestic ' + P.esc(P.fmt.pct(m.domestic_share)) +
        ", international " + P.esc(P.fmt.pct(m.international_share)) +
        ", other " + P.esc(P.fmt.pct(m.other_share)) + '">' +
        geoSegHtml("dom", m.domestic_share) +
        geoSegHtml("intl", m.international_share) +
        geoSegHtml("oth", m.other_share) + "</div>";
      var legend =
        '<div class="pa-geo-legend">' +
        geoLegendRow("dom", "Domestic (US)", m.domestic_share, m.domestic) +
        geoLegendRow("intl", "International", m.international_share, m.international) +
        geoLegendRow("oth", "Other / unclassified", m.other_share, m.other) + "</div>";
      var excl =
        d.excluded_unreconciled_count > 0
          ? " · " + d.excluded_unreconciled_count + " excluded (unreconciled)"
          : "";
      var sub =
        '<div class="pa-geo-cov">' + d.company_count + " of " + d.companies_in_scope +
        " compan" + (d.companies_in_scope === 1 ? "y" : "ies") + " disclosed" + P.esc(excl) + "</div>";
      body = bar + legend + sub;
    }
    // The foot carries the derived/revenue-weighted framing inline; the payload's full caveats
    // (coverage / normalization / reconciliation) sit in the title (hover), like the insider card.
    var caveatsTitle = d && d.caveats && d.caveats.length ? P.esc(d.caveats.join("\n")) : "";
    var foot =
      '<div class="pa-geo-foot"' + (caveatsTitle ? ' title="' + caveatsTitle + '"' : "") +
      ">Derived rollup · revenue-weighted · ASC 280</div>";
    return '<div class="pa-card pa-geo">' + head + body + foot + "</div>";
  }
  // Insider flow (Forms 3/4/5) — REAL (P6a). A DERIVED sector rollup of REPORTED open-market (P/S)
  // transactions from GET /v1/sectors/{group}/insider-flow. Net is deliberately value-neutral in
  // color (direction is carried by a word, not green/red — the honesty stance). No data reads N/A,
  // never $0. See docs/delivery/sector-insider-flow.
  function signedUsd(v) {
    if (v > 0) return "+" + P.fmt.usd(v);
    if (v < 0) return "−" + P.fmt.usd(Math.abs(v)); // U+2212 minus, matches the shifts card
    return P.fmt.usd(0); // exactly flat (buys offset sells) — an honest 0, data present
  }
  function insiderCardHtml() {
    var g = selectedGroup();
    var f = state.insiderFlow[g];
    var head =
      '<div class="pa-card-head"><span class="pa-card-title">Insider flow</span>' +
      '<span class="pa-card-hint">Forms 3/4/5' +
      (f && f.has_data && f.window && f.window.label ? " · " + P.esc(f.window.label) : "") +
      "</span></div>";
    var body;
    if (!f) {
      body = P.states.loading({ title: "Loading insider flow", note: "" });
    } else if (!f.has_data) {
      // Honest N/A — no in-window open-market activity ingested (or the fetch failed). Never $0.
      body =
        '<div class="pa-empty-inline">No insider data for this sector yet — no open-market ' +
        "purchases or sales ingested in the recent window. Shown as N/A, not zero.</div>";
    } else {
      // Direction is carried by an arrow glyph + word (same value-neutral vocabulary as the shifts
      // card) and a SINGLE accent tint on the figure -- one accent for BOTH directions, never a
      // green/red good-bad code (honesty: net buy/sell is not a verdict).
      var arrow = f.net > 0 ? "↑" : f.net < 0 ? "↓" : "→";
      var dir = f.net > 0 ? "Net buying" : f.net < 0 ? "Net selling" : "Net flat";
      var excl =
        f.excluded_no_price_count > 0
          ? " · " + f.excluded_no_price_count + " with no reported price excluded"
          : "";
      body =
        '<div class="pa-insider-net"><span class="pa-insider-figure">' +
        P.esc(arrow + " " + signedUsd(f.net)) +
        '</span><span class="pa-insider-dir">' + P.esc(dir) + "</span></div>" +
        '<div class="pa-insider-break">Buys ' + P.esc(P.fmt.usd(f.buys)) +
        " · Sells " + P.esc(P.fmt.usd(f.sells)) + "</div>" +
        '<div class="pa-insider-counts">' +
        f.transaction_count + " transaction" + (f.transaction_count === 1 ? "" : "s") +
        " · " + f.filer_count + " filer" + (f.filer_count === 1 ? "" : "s") +
        P.esc(excl) + "</div>";
    }
    // The foot carries the derived/lag/scope framing inline; the payload's full caveats sit in the
    // title (hover) so the honesty rails travel with the card without inventing new UI.
    var caveatsTitle = f && f.caveats && f.caveats.length ? P.esc(f.caveats.join("\n")) : "";
    var foot =
      '<div class="pa-insider-foot"' + (caveatsTitle ? ' title="' + caveatsTitle + '"' : "") +
      ">Derived rollup · reporting lag · open-market P/S only</div>";
    return '<div class="pa-card pa-insider">' + head + body + foot + "</div>";
  }

  // ---- 03 Distribution: one card, [This theme] / [All metrics] toggle over the dispersion spreads ----

  // The metrics to chart for the current scope: the focused theme's constituents ("theme"), or every
  // metric with a peer distribution ("all"). Only metrics with an actual distribution are returned.
  function distMetrics(entry, g) {
    var have = {};
    var order = [];
    ((state.spreads[g] && state.spreads[g].metrics) || []).forEach(function (m) { have[m.metric] = m; order.push(m.metric); });
    if (state.drillScope === "all") return { want: order.length, keys: order, have: have };
    var theme = (entry.themes || []).filter(function (x) { return x.theme === state.expandedTheme && x.scored; })[0];
    var want = theme ? (theme.constituents || []).map(function (c) { return c.metric; }) : [];
    return { want: want.length, keys: want.filter(function (k) { return have[k]; }), have: have, theme: theme };
  }

  function distributionHtml(entry, g) {
    var scopeAll = state.drillScope === "all";
    var heading = scopeAll ? "All-metric spreads · sector-wide" : (themeLabel(state.expandedTheme) + " · constituents");
    var toggle =
      '<div class="pa-scope-toggle">' +
      '<button class="pa-scope-btn' + (scopeAll ? "" : " on") + '" data-scope="theme">This theme</button>' +
      '<button class="pa-scope-btn' + (scopeAll ? " on" : "") + '" data-scope="all">All metrics</button></div>';
    var head =
      '<div class="pa-dist-head"><span class="pa-dist-title">' + P.esc(heading) + "</span>" + toggle + "</div>";
    if (!scopeAll) {
      var theme = (entry.themes || []).filter(function (x) { return x.theme === state.expandedTheme && x.scored; })[0];
      if (!theme) return '<div class="pa-card pa-dist">' + head + '<div class="pa-empty-inline">' + P.esc(selName()) + " doesn’t score this theme.</div></div>";
    }
    if (!state.spreads[g]) return '<div class="pa-card pa-dist">' + head + P.states.loading({ title: "Loading dispersion", note: "" }) + "</div>";
    var d = distMetrics(entry, g);
    var cover = scopeAll
      ? '<div class="pa-drill-cover">' + d.keys.length + " metric" + (d.keys.length === 1 ? "" : "s") +
        " with a peer distribution across this sector’s companies.</div>"
      : '<div class="pa-drill-cover">Showing ' + d.keys.length + " of " + d.want +
        " constituent" + (d.want === 1 ? "" : "s") + " with a peer distribution." +
        (d.keys.length < d.want ? " Others have no distribution yet — omitted, not zero." : "") + "</div>";
    if (!d.keys.length) {
      var msg = scopeAll
        ? "No peer distributions for this sector yet — sparse coverage, not zero."
        : "No peer distribution for this theme’s constituents yet — sparse coverage, not zero. See the score decomposition for the full constituent set.";
      return '<div class="pa-card pa-dist">' + head + cover + '<div class="pa-empty-inline">' + msg + "</div></div>";
    }
    return '<div class="pa-card pa-dist">' + head + cover + '<div class="pa-drill-boxes" id="paDistBoxes"></div></div>';
  }

  function mountDistribution(entry, g) {
    var host = $("paDistBoxes");
    if (!host || !state.spreads[g]) return;
    var d = distMetrics(entry, g);
    var width = P.measuredWidth(host, 560);
    d.keys.forEach(function (mk) {
      var m = d.have[mk];
      if (!m) return;
      host.appendChild(P.boxWhiskerChart(
        [{ label: "", peer_count: m.peer_count, min: m.min, p25: m.p25, median: m.median, p75: m.p75, max: m.max }],
        {
          width: width, height: 60, marginLeft: 14, title: m.label, metric: m.metric, unit: m.unit,
          caption: m.peer_count + " companies · min " + fmtSpreadVal(m.metric, m.min) +
            " · median " + fmtSpreadVal(m.metric, m.median) + " · max " + fmtSpreadVal(m.metric, m.max),
        }
      ));
    });
  }

  function themeLabel(theme) {
    var p = state.themeScores;
    if (!p || !theme) return theme || "";
    for (var i = 0; i < (p.sectors || []).length; i++) {
      var m = (p.sectors[i].themes || []).filter(function (x) { return x.theme === theme; })[0];
      if (m) return m.theme_label;
    }
    return theme;
  }
  function selName() { var s = selectedSector(); return s ? s.group_label : "this sector"; }

  // ---------- Company view (altitude 2): peer dot-plots, search-driven focal ----------

  // The dot-plot metric set (materialized + broadly covered). Labels/units + higher_is_better come
  // from each endpoint payload; this order drives the layout.
  var CO_METRICS = ["net_margin", "revenue_growth_yoy", "roe", "roa", "debt_to_equity", "fcf_margin", "inventory_turnover", "current_ratio"];
  // Display-only favorability direction (mirrors normalize/metrics.METRIC_DIRECTION) — for the
  // derived per-theme percentile rail (invert lower-is-better before averaging). NO color.
  var CO_DIR = {
    gross_margin: 1, operating_margin: 1, net_margin: 1, roa: 1, roe: 1, roic: 1,
    revenue_growth_yoy: 1, earnings_growth_yoy: 1, ocf_growth_yoy: 1, growth_acceleration: 1,
    interest_coverage: 1, current_ratio: 1, quick_ratio: 1, asset_turnover: 1, inventory_turnover: 1, fcf_margin: 1,
    debt_to_equity: 0, dso: 0, dio: 0, dpo: 0, ccc: 0,
  };
  // theme -> (label, constituents) mirrors normalize/themes.py (5 scored + 2 deferred).
  var CO_THEMES = [
    ["Profitability & returns", ["gross_margin", "operating_margin", "net_margin", "roa", "roe", "roic"]],
    ["Growth", ["revenue_growth_yoy", "earnings_growth_yoy", "ocf_growth_yoy", "growth_acceleration"]],
    ["Financial health", ["debt_to_equity", "interest_coverage", "current_ratio", "quick_ratio"]],
    ["Cash & investment", ["fcf_margin", "ocf_growth_yoy"]],
    ["Operating efficiency", ["inventory_turnover", "dso", "dio", "dpo", "ccc", "asset_turnover"]],
  ];
  var CO_DEFERRED = [["Accounting quality"], ["Structure & activity"]];

  function focalYear() { return (state.sectors && state.sectors.fiscal_year) || (state.themeScores && state.themeScores.fiscal_year) || 2025; }

  // Resolve a searched symbol (ticker OR raw CIK) -> the focal company's cik, SIC group, and
  // per-metric percentiles (the derived rail), then load the group's dot-clouds.
  function selectFocal(symbol) {
    symbol = (symbol || "").toString().trim();
    if (!symbol) return;
    state.view = "company";
    state.companyErr = false;
    state.focalPeers = null; state.focalName = null;
    state.coTrendOpen = {}; // a new focal -> collapse any open trend (it belonged to the prior filer)
    // a ticker search sets the ticker pill; a raw-CIK search does not (we never fabricate a ticker)
    state.focalTicker = /^\d+$/.test(symbol) ? null : symbol.toUpperCase();
    P.api("/companies/" + encodeURIComponent(symbol) + "/peers?year=" + focalYear() + "&period=FY")
      .then(function (res) {
        state.focalCik = res.cik;
        state.focalPeers = res;
        state.focalGroup = (res.peers && res.peers[0] && res.peers[0].peer_group) || null;
        // Searching a filer moves the SECTOR with it, so the control bar and the peer dropdown
        // never disagree about which sector you are looking at (AC-22).
        syncSectorToGroup(state.focalGroup);
        renderApp();
        ensureCompanyData();
      })
      .catch(function () { state.companyErr = true; renderApp(); });
  }
  /* Point the control bar's sector at `g`, so the selected sector and the focal's peer group are
   * the same thing (see focalPeerList). Silent when the group isn't in the sector universe -- we
   * never invent a selection for a group we don't carry. */
  function syncSectorToGroup(g) {
    if (!g) return;
    var list = (state.sectors && state.sectors.sectors) || [];
    var idx = list.findIndex(function (s) { return s.group === g; });
    if (idx < 0 || idx === state.sectorIdx) return;
    state.sectorIdx = idx;
    state.decompTheme = null;
    lsSet(LS_LAST, g);
    ensureExpandedTheme();
    ensureSectorData();
    syncUrl();
  }

  /* Resolve a focal INSIDE one sector -- used when the operator picks a sector while the Company
   * view is open. Deliberately does NOT fall through to another sector the way resolveDefaultFocal
   * does: the operator named this sector, so "no company-level metrics here" is an honest empty
   * state, not a reason to silently show a different sector's filers. */
  function resolveFocalInGroup(g) {
    if (!g) return;
    P.api("/sectors/" + encodeURIComponent(g) + "/net_margin/companies?year=" + focalYear() + "&period=FY")
      .then(function (r) {
        if (selectedGroup() !== g) return; // the operator moved on while this was in flight
        var cos = (r.companies || []).slice().sort(function (a, b) {
          return (a.name || "").localeCompare(b.name || "");
        });
        if (!cos.length) { renderApp(); return; } // honest empty state
        state.focalGroup = g;
        selectFocalCik(cos[0].cik, cos[0].name);
        ensureCompanyData();
      })
      .catch(function () { renderApp(); });
  }

  // Re-focus to a peer (identified by cik) without changing the group (a peer is in the same group).
  function selectFocalCik(cik, name) {
    if (cik === state.focalCik) return;
    state.focalCik = cik;
    state.focalName = name || null;
    state.focalTicker = null; // a cik/dot-click/default focal has no known ticker
    state.coTrendOpen = {}; // a new focal -> collapse any open trend
    P.api("/companies/" + cik + "/peers?year=" + focalYear() + "&period=FY")
      .then(function (res) { if (state.focalCik === cik) { state.focalPeers = res; renderApp(); } })
      .catch(function () { /* keep the dots; the rail just won't update */ renderApp(); });
  }

  // Default the Company view to the first company (alphabetically) in the largest sector by filer
  // count -- so the view opens populated instead of empty. Honest empty/error state is the fallback.
  function resolveDefaultFocal() {
    if (state.focalCik || state.defaultFocalTried) return;
    var list = (state.sectors && state.sectors.sectors) || [];
    if (!list.length) return;
    state.defaultFocalTried = true;
    // largest sector by filer count first, falling through to the next-largest that actually has
    // company-level values (a sector can be scored but have no materialized per-company metrics).
    var ordered = list.slice().sort(function (a, b) { return (b.peer_count || 0) - (a.peer_count || 0); });
    var i = 0;
    function tryNext() {
      if (i >= ordered.length || i >= 6) { renderApp(); return; } // give up -> honest empty state
      var g = ordered[i++].group;
      P.api("/sectors/" + encodeURIComponent(g) + "/net_margin/companies?year=" + focalYear() + "&period=FY")
        .then(function (r) {
          var cos = (r.companies || []).slice().sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
          if (cos.length && !state.focalCik) {
            state.focalGroup = g;
            syncSectorToGroup(g); // the control bar follows the focal we actually landed on
            selectFocalCik(cos[0].cik, cos[0].name);
            ensureCompanyData();
          }
          else if (!state.focalCik) tryNext();
        })
        .catch(tryNext);
    }
    tryNext();
  }
  /* The Company view's peer universe is the SELECTED sector (AC-22).
   *
   * INVARIANT: state.focalGroup === selectedGroup(). The two used to drift -- focalGroup came from
   * the focal company's own SIC group while the control bar kept whatever sector was selected, so
   * the header could read "Business Services" while this dropdown listed SIC-35 filers. Both ends
   * are now kept in step: setting a focal moves the sector selection to that focal's group
   * (syncSectorToGroup), and picking a sector re-resolves the focal inside it (selectSector).
   */
  function focalPeerList() {
    var g = state.focalGroup;
    if (!g) return [];
    var seen = {}, out = [];
    CO_METRICS.forEach(function (m) {
      ((state.coValues[g + "|" + m] || {}).companies || []).forEach(function (c) {
        if (!seen[c.cik]) { seen[c.cik] = 1; out.push({ cik: c.cik, name: c.name }); }
      });
    });
    return out.sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
  }

  function ensureCompanyData() {
    var g = state.focalGroup;
    if (!g) return;
    CO_METRICS.forEach(function (m) {
      var key = g + "|" + m;
      if (state.coValues[key]) return;
      P.api("/sectors/" + encodeURIComponent(g) + "/" + encodeURIComponent(m) + "/companies?year=" + focalYear() + "&period=FY")
        .then(function (r) {
          state.coValues[key] = r;
          // pick up the focal's display name from any list that has it
          if (!state.focalName && r.companies) {
            var f = r.companies.filter(function (c) { return c.cik === state.focalCik; })[0];
            if (f) state.focalName = f.name;
          }
          if (state.focalGroup === g) renderApp();
        })
        .catch(function () { state.coValues[key] = { companies: [] }; if (state.focalGroup === g) renderApp(); });
    });
  }

  // Fetch the focal's per-metric quarterly history (the row sparklines + the 8-quarter trend panel).
  // Cache-aside, keyed by (cik|metric); a fetch failure caches an empty series so we render an honest
  // "no trend yet" affordance, never a fabricated line. Re-renders as each metric's history arrives.
  function ensureCompanyHistory(cik) {
    if (!cik) return;
    CO_METRICS.forEach(function (m) {
      var key = cik + "|" + m;
      if (state.coHistory[key]) return;
      state.coHistory[key] = { points: [] }; // mark in-flight so we don't refetch; overwritten on arrival
      P.api("/companies/" + cik + "/metrics/" + encodeURIComponent(m) + "/history?frequency=quarterly")
        .then(function (r) { state.coHistory[key] = r; if (state.focalCik === cik) renderApp(); })
        .catch(function () { /* keep the empty series -> honest "no trend yet" */ });
    });
  }

  function focalLabel() {
    return state.focalName || state.focalTicker || (state.focalCik ? "CIK " + state.focalCik : "the focal filer");
  }
  // Recovery from a dead-end (a searched filer with no peer group, or an error): clear the focal and
  // re-resolve the default so the user is never stuck.
  function clearFocalToDefault() {
    state.focalCik = null; state.focalGroup = null; state.focalName = null;
    state.focalTicker = null; state.focalPeers = null; state.companyErr = false;
    state.defaultFocalTried = false; state.coTrendOpen = {};
    renderApp();
    resolveDefaultFocal();
  }
  // favorability-adjusted percentile: raw for higher-is-better, inverted for lower-is-better.
  function adjPct(metric, p) { return CO_DIR[metric] === 0 ? 100 - p : p; }

  function renderCompanyView(vp) {
    if (state.companyErr) {
      vp.innerHTML = coHead() + '<div class="pa-card">' + P.states.error({ copy: "Couldn't resolve that company." }) +
        '<div class="pa-co-back"><button class="pa-co-backbtn" id="coBackBtn">← Back to a default filer</button></div></div>';
      return;
    }
    if (!state.focalCik) {
      vp.innerHTML = coHead() +
        '<div class="pa-stub"><div class="pa-stub-title">Place a filer in its peers</div>' +
        '<div class="pa-stub-body">Search a ticker or CIK in the header to see where a single company sits inside its SIC-peer distribution for each metric — each dot a filer, the focal company a ◆.</div></div>';
      return;
    }
    if (!state.focalGroup) {
      vp.innerHTML = coHead() +
        '<div class="pa-card"><div class="pa-empty-inline">' + P.esc(focalLabel()) +
        " has no SIC peer group with enough filers to place it against — sparse coverage, not zero. " +
        "Search another company, or go back to a default filer.</div>" +
        '<div class="pa-co-back"><button class="pa-co-backbtn" id="coBackBtn">← Back to a default filer</button></div></div>';
      return;
    }
    ensureCompanyHistory(state.focalCik); // load the focal's per-metric trailing history (sparklines)
    vp.innerHTML = coHead() +
      '<div class="pa-co-body"><div class="pa-co-rail">' + coRailHtml() + "</div>" +
      '<div class="pa-co-main">' +
      '<div class="pa-co-sech">Peer distribution</div>' +
      '<div class="pa-co-legend">each dot a filer · band = IQR · line = median · ◆ = ' + P.esc(focalLabel()) +
      " · percentiles favorability-adjusted, N/A · N/M excluded</div>" +
      CO_METRICS.map(coDotPlotHtml).join("") +
      '<div class="pa-co-afford">Click any peer dot to make it the focal filer. Click a sparkline to open its trailing 8-quarter trend.</div>' +
      segGeoPlaceholderHtml() +
      filingHistoryPlaceholderHtml() +
      "</div></div>";
    wireCompanyView();
    mountCompanyDots();
  }

  // Segment & geographic revenue mix (ASC 280) — Track 1 but NOT ingested / no endpoint. Honest
  // placeholder matching the prototype's two-column (by-segment / by-region) shape. No fabricated data.
  function segGeoPlaceholderHtml() {
    var col = function (label) {
      return '<div class="pa-sg-col"><div class="pa-sg-collabel">' + label + "</div>" +
        '<div class="pa-ph-body pa-sg-ph">— to be defined; no figures shown</div></div>';
    };
    return (
      '<div class="pa-card pa-sg pa-ph"><div class="pa-card-head">' +
      '<span class="pa-card-title">Segment &amp; geographic mix</span>' +
      '<span class="pa-card-hint">ASC 280 segment disclosure</span></div>' +
      '<div class="pa-sg-body">' + col("By segment") + col("By region") + "</div>" +
      '<div class="pa-ph-note">Segment (ASC 280) revenue by line of business and region isn’t ingested yet — placeholder, nothing fabricated.</div></div>'
    );
  }

  // Filing history & flags — no per-CIK filings endpoint (and 8-K isn't ingested); restatement /
  // material-weakness flags are Track-2. Honest placeholder matching the prototype's list shape.
  function filingHistoryPlaceholderHtml() {
    return (
      '<div class="pa-card pa-fh pa-ph"><div class="pa-card-head">' +
      '<span class="pa-card-title">Filing history &amp; flags</span>' +
      '<span class="pa-ph-tag">flags — placeholder</span></div>' +
      '<div class="pa-fh-body pa-ph-body">A filing timeline (10-K / 10-Q / 8-K / Form 4 · date) plus ' +
      "restatement / material-weakness flags would sit here — per-filer filing history isn’t served yet " +
      "and the flags are Track-2. To be defined; no filings shown, nothing fabricated.</div></div>"
    );
  }

  function coHead() {
    var g = state.focalGroup ? sicLabelOf(state.focalGroup) : "";
    // breadcrumb name is a dropdown of the focal's SIC peers when we have a focal + a loaded peer set
    var peers = state.focalCik ? focalPeerList() : [];
    var nameNode;
    if (peers.length > 1) {
      nameNode = '<select class="pa-co-sel" id="coFocalSel" aria-label="Focal company">' +
        peers.map(function (p) {
          return '<option value="' + p.cik + '"' + (p.cik === state.focalCik ? " selected" : "") + ">" + P.esc(p.name || ("CIK " + p.cik)) + "</option>";
        }).join("") + "</select>";
    } else {
      nameNode = '<span class="pa-co-name">' + P.esc(focalLabel()) + "</span>";
    }
    var ticker = state.focalTicker ? '<span class="pa-co-ticker">' + P.esc(state.focalTicker) + "</span>" : "";
    var right = "";
    if (state.focalGroup) {
      var n = peers.length;
      var ctx = n ? n + " peers · SIC " + P.esc(state.focalGroup) : "SIC " + P.esc(state.focalGroup);
      right = '<span class="pa-co-ctx">' + ctx + "</span>" +
        '<span class="pa-co-basis">FY' + focalYear() + "</span>";
    }
    return (
      '<div class="pa-co-head"><div class="pa-co-crumbwrap">' +
      '<span class="pa-co-crumb">' + P.esc(g) + '</span><span class="pa-co-sep">›</span>' +
      nameNode + ticker + "</div>" +
      '<div class="pa-co-headright">' + right + "</div></div>"
    );
  }
  function sicLabelOf(group) {
    // reuse the sector list's label if present, else the bare code
    var s = ((state.sectors && state.sectors.sectors) || []).filter(function (x) { return x.group === group; })[0];
    return s ? s.group_label : "SIC " + group;
  }

  function coRailHtml() {
    var peers = (state.focalPeers && state.focalPeers.peers) || [];
    var byMetric = {};
    peers.forEach(function (p) { byMetric[p.metric] = p.percentile; });
    var themePcts = [];
    var rows = CO_THEMES.map(function (t) {
      var vals = t[1].map(function (m) { return byMetric[m] === undefined ? null : adjPct(m, byMetric[m]); }).filter(function (v) { return v !== null; });
      if (!vals.length) {
        return '<div class="pa-rail-row"><div class="pa-rail-rowhead"><span class="pa-rail-name">' + P.esc(t[0]) + '</span><span class="pa-rail-p">—</span></div><div class="pa-rail-track"></div></div>';
      }
      var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
      themePcts.push(avg);
      return (
        '<div class="pa-rail-row"><div class="pa-rail-rowhead"><span class="pa-rail-name">' + P.esc(t[0]) + '</span>' +
        '<span class="pa-rail-p">P' + Math.round(avg) + "</span></div>" +
        '<div class="pa-rail-track"><span class="pa-rail-fill" style="width:' + Math.round(avg) + '%"></span></div></div>'
      );
    }).join("");
    var deferred = CO_DEFERRED.map(function (t) {
      return '<div class="pa-rail-row"><div class="pa-rail-rowhead"><span class="pa-rail-name">' + P.esc(t[0]) + '</span><span class="pa-rail-p pa-rail-ns">not scored</span></div></div>';
    }).join("");
    var comp = themePcts.length ? Math.round(themePcts.reduce(function (a, b) { return a + b; }, 0) / themePcts.length) : null;
    // decomposition: the scored themes that feed the average (already computed above)
    var scoredNames = [];
    CO_THEMES.forEach(function (t) {
      var vals = t[1].map(function (m) { return byMetric[m] === undefined ? null : adjPct(m, byMetric[m]); }).filter(function (v) { return v !== null; });
      if (vals.length) scoredNames.push(t[0] + " P" + Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length));
    });
    var decomp = state.coCompOpen
      ? '<div class="pa-co-comp-decomp">= mean of ' + P.esc(scoredNames.join(" · ")) + "</div>"
      : "";
    var card =
      '<div class="pa-co-comp"><div class="pa-co-comp-label">Composite percentile</div>' +
      '<button class="pa-co-comp-val" id="coCompBtn" title="Show what feeds this">' + (comp === null ? "—" : "P" + comp) + "</button>" +
      '<div class="pa-co-comp-note">derived · avg of the theme percentiles above (not a ranked position)</div>' +
      decomp +
      // the prototype's "vs last FY" trend is not materialized per-company -> honest placeholder
      '<div class="pa-co-comp-trend pa-ph">trend — to be defined</div></div>';
    return '<div class="pa-rail-label">Percentile vs peers</div>' + rows + deferred + card;
  }

  function coDotPlotHtml(metric) {
    var key = state.focalGroup + "|" + metric;
    var payload = state.coValues[key];
    if (!payload) {
      return '<div class="pa-dp"><div class="pa-dp-head"><span class="pa-dp-name">' + P.esc(metricLabelFallback(metric)) + '</span></div>' + P.states.loading({ title: "", note: "" }) + "</div>";
    }
    var cos = payload.companies || [];
    var hib = payload.higher_is_better;
    var head =
      '<div class="pa-dp-head">' +
      '<span class="pa-dp-namewrap"><span class="pa-dp-name">' + P.esc(payload.label || metric) + "</span>" +
      (hib === false ? '<span class="pa-dp-lib">lower is better</span>' : "") + "</span>" +
      '<span class="pa-dp-headright">' + coSparkHtml(metric) + focalValueLabel(cos, payload) + "</span></div>";
    // No <2 early-return any more: the strip renders a single filer honestly (its value, with no
    // invented median or middle-half) instead of suppressing the one datum we actually have.
    // The strip itself is a DOM node (P.distributionStrip), and this function builds a string --
    // so emit a host and let mountCompanyDots() append after render. Same shape as the
    // boxWhiskerChart mount in mountDistribution() below.
    return '<div class="pa-dp">' + head +
      '<div class="pa-dp-host" data-metric="' + P.esc(metric) + '"></div>' +
      coTrendPanelHtml(metric) + "</div>";
  }

  // Post-render pass: fill every peer-distribution host with the shared strip builder. Mirrors
  // mountDistribution(); called from the same place, after innerHTML has landed.
  function mountCompanyDots() {
    document.querySelectorAll(".pa-dp-host[data-metric]").forEach(function (host) {
      var metric = host.getAttribute("data-metric");
      var payload = state.coValues[state.focalGroup + "|" + metric];
      if (!payload) return;
      var cos = payload.companies || [];
      // Caption as it read before: count, then min / median / max in words. The strip carries no
      // axis labels (opts.axisLabels stays off) -- same as the track this replaced.
      var sv = cos.map(function (c) { return c.value; }).sort(function (a, b) { return a - b; });
      var q = function (f) {
        if (!sv.length) return null;
        var i = (sv.length - 1) * f, lo = Math.floor(i), hi = Math.ceil(i);
        return sv[lo] + (sv[hi] - sv[lo]) * (i - lo);
      };
      var cap = cos.length + " filers";
      if (sv.length) {
        cap += " · min " + fmtCo(metric, sv[0]) +
               " · median " + fmtCo(metric, q(0.5)) +
               " · max " + fmtCo(metric, sv[sv.length - 1]);
      }
      host.appendChild(P.distributionStrip(
        cos.map(function (c) { return { id: c.cik, label: c.name || ("CIK " + c.cik), value: c.value }; }),
        {
          width: P.measuredWidth(host, 420),
          height: 66,
          focalId: state.focalCik,
          format: function (v) { return fmtCo(metric, v); },
          emptyCopy: "No peer distribution for this metric yet — sparse coverage, not zero.",
          caption: cap,
          onPeerClick: function (peer) { selectFocalCik(peer.id, peer.label); },
        }
      ));
    });
  }

  // The trailing window (<=8 quarters) of the focal's history for one metric, oldest-first, mapped to
  // the {value, status} shape P.sparkline / P.trendChart expect. na/nm stay as gap points (value null).
  function coTrailing(metric) {
    var h = state.coHistory[state.focalCik + "|" + metric];
    if (!h || !h.points) return null;
    return { hist: h, pts: h.points.slice(-8) };
  }
  // Sparkline + a neutral trend label in the metric row header. Honest states: nothing while the
  // history is loading, "no trend yet" when <2 comparable points (never a flat/fake line).
  function coSparkHtml(metric) {
    var t = coTrailing(metric);
    if (!t) return ""; // not fetched yet -> no sparkline (appears when it arrives)
    var svg = P.sparkline(t.pts);
    if (!svg) return '<span class="pa-dp-notrend">no trend yet</span>';
    return '<button class="pa-dp-spark" data-metric="' + P.esc(metric) + '" title="Show the trailing 8-quarter trend">' +
      svg + '<span class="pa-dp-trendlabel">' + coTrendLabel(t.pts) + "</span></button>";
  }
  // Neutral trend descriptor (R3): direction glyph from first-vs-last COMPARABLE value + window length.
  // NEVER a color and never a verdict.
  function coTrendLabel(pts) {
    var present = pts.filter(function (p) { return p && p.value !== null && p.value !== undefined && p.status !== "na" && p.status !== "nm"; });
    if (present.length < 2) return "";
    var d = present[present.length - 1].value - present[0].value;
    var glyph = d > 0 ? "↑" : d < 0 ? "↓" : "→";
    return glyph + " " + pts.length + "q";
  }
  // The click-to-expand trend panel. Reuses P.trendChart (self-scaling line, honest gaps + empty
  // state) on the trailing-8 slice; signals dropped so the window and the annotations can't disagree.
  function coTrendPanelHtml(metric) {
    if (!state.coTrendOpen[metric]) return "";
    var t = coTrailing(metric);
    if (!t) return "";
    var sliced = {
      points: t.pts, signals: [], unit: t.hist.unit, metric: t.hist.metric,
      restatement_basis: t.hist.restatement_basis, frequency: t.hist.frequency || "quarterly",
    };
    return (
      '<div class="pa-dp-trend"><div class="pa-dp-trend-label">Trailing 8-quarter trend</div>' +
      P.trendChart(sliced) + "</div>"
    );
  }

  function focalValueLabel(cos, payload) {
    var f = cos.filter(function (c) { return c.cik === state.focalCik; })[0];
    if (!f) return '<span class="pa-dp-focal">◆ not in this metric</span>';
    var pctPeer = f.percentile === null || f.percentile === undefined ? "" : " · P" + Math.round(adjPct(payload.metric, f.percentile));
    return '<span class="pa-dp-focal">◆ ' + P.esc(fmtCo(payload.metric, f.value)) + pctPeer + "</span>";
  }
  function fmtCo(metric, v) { return metricFmt(metric, v); }
  function metricLabelFallback(metric) { return metric.replace(/_/g, " "); }

  function wireCompanyView() {
    // Peer clicks are wired by the strip builder via opts.onPeerClick (mountCompanyDots) -- there is
    // no `.pa-dot[data-cik]` DOM contract to bind any more, and `cik` never leaks into shared app.js.
    var sel = $("coFocalSel");
    if (sel) sel.addEventListener("change", function () {
      var opt = sel.options[sel.selectedIndex];
      selectFocalCik(parseInt(sel.value, 10), opt ? opt.textContent : null);
    });
    var cbtn = $("coCompBtn");
    if (cbtn) cbtn.addEventListener("click", function () { state.coCompOpen = !state.coCompOpen; renderApp(); });
    // click a metric's sparkline -> toggle its trailing 8-quarter trend panel
    document.querySelectorAll(".pa-dp-spark[data-metric]").forEach(function (b) {
      b.addEventListener("click", function () {
        var m = b.getAttribute("data-metric");
        state.coTrendOpen[m] = !state.coTrendOpen[m];
        renderApp();
      });
    });
  }

  // ---------- Compare view (altitude 3): sector vs sector ----------
  //
  // A = --accent (terracotta), B = --gaap-color (blue): a FIXED CATEGORICAL IDENTITY only, never
  // favorability. Bars are TRUE-LENGTH and NO winner is ever declared. Reuses state.themeScores
  // (per-theme 0-100 scores) + state.spreads[group] (per-metric medians) — no new endpoint.

  function sectorLabel(group) {
    var s = ((state.sectors && state.sectors.sectors) || []).filter(function (x) { return x.group === group; })[0];
    return s ? s.group_label : (group ? "SIC " + group : "");
  }
  function shortLabel(group) {
    var l = sectorLabel(group);
    return l.length > 22 ? l.split(/[ &]/)[0] : l; // compact leader tag for the gap label
  }
  function themeOf(entry, key) {
    return entry && entry.themes ? (entry.themes.filter(function (t) { return t.theme === key; })[0] || null) : null;
  }

  function renderCompareView(vp) {
    if (!state.compareA && !state.compareB) state.compareA = selectedGroup();
    ensureCompareData();
    var A = state.compareA, B = state.compareB;
    vp.innerHTML =
      cmpHead(A, B) +
      cmpSelectorsHtml(A, B) +
      (!A
        ? '<div class="pa-card"><div class="pa-empty-inline">Pick a sector to compare.</div></div>'
        : !B
        ? '<div class="pa-card"><div class="pa-empty-inline">Pick a second sector (B) to compare against ' + P.esc(sectorLabel(A)) + '.</div></div>'
        : cmpThemesHtml(A, B) + cmpRadarHtml(A, B) + cmpMetricsHtml(A, B));
    wireCompareView();
  }

  function sectorPeerCount(group) {
    if (!group) return null;
    var s = ((state.sectors && state.sectors.sectors) || []).filter(function (x) { return x.group === group; })[0];
    return s ? s.peer_count : null;
  }
  function cmpHead(A, B) {
    var an = A ? P.esc(sectorLabel(A)) : '<span class="pa-cmp-aname-ph">Sector A</span>';
    var bn = B ? P.esc(sectorLabel(B)) : '<span class="pa-cmp-aname-ph">Sector B</span>';
    var ca = sectorPeerCount(A), cb = sectorPeerCount(B);
    var counts = (ca != null || cb != null)
      ? (ca != null ? ca : "—") + " vs " + (cb != null ? cb : "—") + " filers"
      : "";
    return (
      '<div class="pa-cmp-head2">' +
      '<span class="pa-cmp-sw pa-cmp-idA"></span><span class="pa-cmp-aname">' + an + "</span>" +
      '<span class="pa-cmp-vs">vs</span>' +
      '<span class="pa-cmp-sw pa-cmp-idB"></span><span class="pa-cmp-aname">' + bn + "</span>" +
      '<span class="pa-cmp-headspacer"></span>' +
      '<span class="pa-cmp-counts">' + counts + "</span></div>"
    );
  }

  function cmpSelectorsHtml(A, B) {
    var list = (state.sectors && state.sectors.sectors) || [];
    function opts(sel, withBlank) {
      var blank = withBlank ? '<option value=""' + (sel ? "" : " selected") + ">Pick a second sector…</option>" : "";
      return blank + list.map(function (s) {
        return '<option value="' + P.esc(s.group) + '"' + (s.group === sel ? " selected" : "") + ">" + P.esc(s.group_label) + "</option>";
      }).join("");
    }
    return (
      '<div class="pa-cmp-selects">' +
      '<label class="pa-cmp-sel"><span class="pa-cmp-id pa-cmp-idA">A</span>' +
      '<select class="pa-cmp-select" id="cmpSelA" aria-label="Sector A">' + opts(A, false) + "</select></label>" +
      '<label class="pa-cmp-sel"><span class="pa-cmp-id pa-cmp-idB">B</span>' +
      '<select class="pa-cmp-select" id="cmpSelB" aria-label="Sector B">' + opts(B, true) + "</select></label>" +
      "</div>" +
      '<div class="pa-cmp-note">A <span class="pa-cmp-swatch pa-cmp-idA"></span> and B <span class="pa-cmp-swatch pa-cmp-idB"></span> mark identity only — not good vs bad. Bars are true-length; no winner is declared.</div>'
    );
  }

  // Shared theme model for the Compare scorecard AND the profile radar: the canonical theme order
  // (first appearance across A then B — both come pre-ordered by the API), a per-(entry, theme)
  // scored-score accessor that returns null (never a fabricated 0) for a deferred/absent theme, and
  // the derived composite. One source so the radar's numbers + axis order match the scorecard exactly.
  function cmpThemeModel(A, B) {
    var eA = themeEntry(A), eB = themeEntry(B);
    var order = [], seen = {};
    [eA, eB].forEach(function (e) { (e && e.themes || []).forEach(function (t) { if (!seen[t.theme]) { seen[t.theme] = 1; order.push(t); } }); });
    function scoreOf(entry, themeKey) {
      var t = themeOf(entry, themeKey);
      return t && t.scored ? t.score : null; // deferred / absent -> null, never 0
    }
    // derived overall composite = mean of each sector's SCORED theme scores (labeled, not a rank)
    function composite(e) {
      var sc = scoredThemes(e).map(function (t) { return t.score; }).filter(function (v) { return v !== null && v !== undefined; });
      return sc.length ? Math.round(sc.reduce(function (a, b) { return a + b; }, 0) / sc.length) : null;
    }
    return { eA: eA, eB: eB, order: order, scoreOf: scoreOf, composite: composite };
  }

  // --- theme spine: paired composite + per-theme true-length bars ---
  function cmpThemesHtml(A, B) {
    if (!state.themeScores) return '<div class="pa-card">' + P.states.loading({ title: "Loading theme scores", note: "" }) + "</div>";
    var m = cmpThemeModel(A, B);
    if (!m.eA && !m.eB) {
      return '<div class="pa-card">' + P.states.empty({
        title: "No composite theme scores for either sector",
        copy: "Neither sector has materialized theme scores yet — sparse coverage, not zero.",
      }) + "</div>";
    }
    var rows = cmpScoreRow("Composite", m.composite(m.eA), m.composite(m.eB), A, B, true);
    rows += m.order.map(function (ref) {
      var tA = themeOf(m.eA, ref.theme), tB = themeOf(m.eB, ref.theme);
      var sA = m.scoreOf(m.eA, ref.theme);
      var sB = m.scoreOf(m.eB, ref.theme);
      // a theme that is a deferred marker for whichever sector has it, or absent for both -> not scored
      var deferred = (tA && !tA.scored) || (tB && !tB.scored);
      if (sA === null && sB === null) return cmpNotScoredRow(ref.theme_label, deferred);
      return cmpScoreRow(ref.theme_label, sA, sB, A, B, false);
    }).join("");

    return (
      '<section class="pa-cmp-sec">' +
      '<div class="pa-cmp-scorecard"><div class="pa-cmp-scorecard-label">Composite scores · shared 0–100 scale</div>' +
      rows + "</div>" +
      '<div class="pa-provisional">≈ Scores provisional — each is a position vs other sectors (50 = cross-sector average), not a good/bad or buy verdict. Composite is derived (mean of scored themes), not a ranked position.</div>' +
      "</section>"
    );
  }

  function cmpScoreRow(label, sA, sB, A, B, isComposite) {
    var gap = "";
    if (sA !== null && sB !== null) {
      var d = sA - sB;
      if (d === 0) gap = '<span class="pa-cmp-gap soft">even</span>';
      else {
        var lead = d > 0 ? A : B;
        var strong = Math.abs(d) >= 10 ? " strong" : " soft";
        gap = '<span class="pa-cmp-gap' + strong + '">' + P.esc(shortLabel(lead)) + " +" + Math.abs(d) + "</span>";
      }
    }
    return (
      '<div class="pa-cmp-row' + (isComposite ? " composite" : "") + '">' +
      '<span class="pa-cmp-theme">' + P.esc(label) + (isComposite ? '<span class="pa-cmp-derived">derived</span>' : "") + "</span>" +
      '<div class="pa-cmp-bars">' + cmpBar("A", sA) + cmpBar("B", sB) + "</div>" +
      gap +
      "</div>"
    );
  }
  function cmpBar(idLetter, score) {
    var cls = idLetter === "A" ? "pa-cmp-idA" : "pa-cmp-idB";
    var w = score === null || score === undefined ? 0 : Math.max(0, Math.min(100, score));
    var val = score === null || score === undefined ? '<span class="pa-cmp-ns">not scored</span>' : score;
    return (
      '<div class="pa-cmp-barline"><span class="pa-cmp-id ' + cls + '">' + idLetter + "</span>" +
      '<div class="pa-cmp-bartrack"><span class="pa-cmp-bar ' + cls + '" style="width:' + w + '%"></span></div>' +
      '<span class="pa-cmp-val">' + val + "</span></div>"
    );
  }
  function cmpNotScoredRow(label, deferred) {
    return (
      '<div class="pa-cmp-row notscored">' +
      '<span class="pa-cmp-theme">' + P.esc(label) + "</span>" +
      '<div class="pa-cmp-bars">' + cmpBar("A", null) + cmpBar("B", null) + "</div>" +
      '<span class="pa-cmp-gap soft">' + (deferred ? "not yet scored" : "not scored") + "</span>" +
      "</div>"
    );
  }

  // --- metric medians: paired cards, per-metric normalized bars, raw value at bar end ---
  function cmpMetricsHtml(A, B) {
    var sA = state.spreads[A], sB = state.spreads[B];
    if (!sA || !sB) return '<div class="pa-cmp-sec"><div class="pa-cmp-sec-head">Metric medians</div><div class="pa-card">' + P.states.loading({ title: "Loading sector medians", note: "" }) + "</div></div>";
    var mapA = {}, mapB = {};
    (sA.metrics || []).forEach(function (m) { mapA[m.metric] = m; });
    (sB.metrics || []).forEach(function (m) { mapB[m.metric] = m; });
    // union in A's order, then any B-only metrics (so a sector's missing metric shows an honest N/A)
    var order = [], seen = {};
    (sA.metrics || []).forEach(function (m) { if (!seen[m.metric]) { seen[m.metric] = 1; order.push(m.metric); } });
    (sB.metrics || []).forEach(function (m) { if (!seen[m.metric]) { seen[m.metric] = 1; order.push(m.metric); } });
    if (!order.length) {
      return '<section class="pa-cmp-sec"><div class="pa-cmp-sec-head">Metric medians</div><div class="pa-card"><div class="pa-empty-inline">No shared metric medians for these sectors yet — sparse coverage, not zero.</div></div></section>';
    }
    var cards = order.map(function (metric) {
      var a = mapA[metric], b = mapB[metric];
      var label = (a && a.label) || (b && b.label) || metricLabelFallback(metric);
      var lib = CO_DIR[metric] === 0 ? '<span class="pa-cmp-lib">lower is better</span>' : "";
      var av = a ? a.median : null, bv = b ? b.median : null;
      var den = Math.max(Math.abs(av || 0), Math.abs(bv || 0)) || 1;
      function line(idLetter, v) {
        var cls = idLetter === "A" ? "pa-cmp-idA" : "pa-cmp-idB";
        if (v === null || v === undefined) {
          return '<div class="pa-cmp-cardline"><span class="pa-cmp-id ' + cls + '">' + idLetter + '</span><div class="pa-cmp-bartrack"></div><span class="pa-cmp-val pa-cmp-na">N/A</span></div>';
        }
        var w = (Math.abs(v) / den) * 100;
        return '<div class="pa-cmp-cardline"><span class="pa-cmp-id ' + cls + '">' + idLetter + '</span>' +
          '<div class="pa-cmp-bartrack"><span class="pa-cmp-bar ' + cls + '" style="width:' + w.toFixed(1) + '%"></span></div>' +
          '<span class="pa-cmp-val">' + P.esc(metricFmt(metric, v)) + "</span></div>";
      }
      return (
        '<div class="pa-cmp-card"><div class="pa-cmp-card-head"><span class="pa-cmp-metric">' + P.esc(label) + "</span>" + lib + "</div>" +
        line("A", av) + line("B", bv) + cmpSpreadStripHtml(a, b) + "</div>"
      );
    }).join("");
    return (
      '<section class="pa-cmp-sec"><div class="pa-cmp-sec-head">Metric medians</div>' +
      '<div class="pa-cmp-cards">' + cards + "</div>" +
      '<div class="pa-cmp-cardcap">Sector medians · bar length normalized per metric · value shown raw · A ' +
      P.esc(sectorLabel(A)) + " vs B " + P.esc(sectorLabel(B)) + " · N/A where a sector has no comparable median</div></section>"
    );
  }

  // --- composite profile radar: 7-theme shape, A vs B overlaid (categorical identity only) ---
  // A = solid stroke / filled vertices; B = dashed stroke / hollow vertices — identity carried by a
  // non-color channel too, so it never rests on color alone. A theme a sector doesn't score is NEVER
  // plotted at radius 0: that sector's polygon is drawn through only its scored vertices (chording
  // across the gap); an axis unscored by BOTH sectors is labelled "n/s".
  function cmpTruncLabel(s) {
    s = String(s || "");
    return s.length > 15 ? s.slice(0, 14).replace(/\s+\S*$/, "") + "…" : s;
  }
  function cmpRadarSvg(model) {
    var axes = model.order, n = axes.length;
    var sa = axes.map(function (t) { return model.scoreOf(model.eA, t.theme); });
    var sb = axes.map(function (t) { return model.scoreOf(model.eB, t.theme); });
    var W = 340, H = 272, cx = W / 2, cy = 134, R = 86;
    function ang(i) { return (-90 + i * 360 / n) * Math.PI / 180; }
    function pt(i, frac) { var a = ang(i); return [cx + R * frac * Math.cos(a), cy + R * frac * Math.sin(a)]; }
    function poly(frac) { return axes.map(function (_, i) { return pt(i, frac).map(function (v) { return v.toFixed(1); }).join(","); }).join(" "); }
    // concentric heptagon rings at 25/50/75/100; the 50 ring (cross-sector average) is emphasized
    var rings = [0.25, 0.5, 0.75, 1].map(function (f) {
      return '<polygon class="pa-radar-ring' + (f === 0.5 ? " avg" : "") + '" points="' + poly(f) + '"></polygon>';
    }).join("");
    var spokes = axes.map(function (_, i) { var p = pt(i, 1); return '<line class="pa-radar-spoke" x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '"></line>'; }).join("");
    var labels = axes.map(function (t, i) {
      var p = pt(i, 1.17), c = Math.cos(ang(i));
      var anchor = Math.abs(c) < 0.34 ? "middle" : (c > 0 ? "start" : "end");
      var ns = (sa[i] === null && sb[i] === null);
      return '<text class="pa-radar-axlabel' + (ns ? " ns" : "") + '" x="' + p[0].toFixed(1) + '" y="' + (p[1] + 3).toFixed(1) + '" text-anchor="' + anchor + '">' + P.esc(cmpTruncLabel(t.theme_label)) + (ns ? " · n/s" : "") + "</text>";
    }).join("");
    function series(scores, cls, dashed) {
      var idx = [];
      scores.forEach(function (s, i) { if (s !== null && s !== undefined) idx.push(i); });
      var dots = idx.map(function (i) { var p = pt(i, scores[i] / 100); return '<circle class="pa-radar-vtx ' + cls + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.6"></circle>'; }).join("");
      if (idx.length < 3) return dots; // degenerate (< 3 scored themes) -> dots only, no polygon
      var pts = idx.map(function (i) { return pt(i, scores[i] / 100).map(function (v) { return v.toFixed(1); }).join(","); }).join(" ");
      return '<polygon class="pa-radar-poly ' + cls + (dashed ? " dashed" : "") + '" points="' + pts + '"></polygon>' + dots;
    }
    var avgP = pt(0, 0.5);
    return (
      '<svg class="pa-radar" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Composite profile radar across ' + n + ' themes, sector A versus sector B">' +
      rings + spokes +
      '<text class="pa-radar-avg" x="' + (avgP[0] + 4).toFixed(1) + '" y="' + (avgP[1] - 2).toFixed(1) + '">50 avg</text>' +
      series(sa, "pa-cmp-idA", false) + series(sb, "pa-cmp-idB", true) + labels +
      "</svg>"
    );
  }
  function cmpRadarHtml(A, B) {
    if (!state.themeScores) return "";
    var m = cmpThemeModel(A, B);
    if (!m.eA && !m.eB) return ""; // scorecard already shows the honest empty state
    return (
      '<section class="pa-cmp-radar-sec"><div class="pa-cmp-radar-card">' +
      '<div class="pa-cmp-radar-viz">' +
      '<div class="pa-cmp-radar-head"><span class="pa-cmp-radar-title">Composite profile</span>' +
      '<span class="pa-cmp-radar-sub">shape across ' + m.order.length + " themes</span></div>" +
      cmpRadarSvg(m) + "</div>" +
      '<div class="pa-cmp-radar-read"><div class="pa-cmp-radar-read-h">Reading the shape</div>' +
      "Each polygon traces a sector's composite scores across the " + m.order.length +
      " themes (per-theme gaps are in the table above). Where the shapes pull apart the sectors are structurally unlike; where they overlap they behave similarly. " +
      '<strong>Neither larger area means "better"</strong> — this is profile, not rank. ' +
      'A <span class="pa-cmp-swatch pa-cmp-idA"></span> solid · B <span class="pa-cmp-swatch pa-cmp-idB"></span> dashed carry identity only. An axis marked <em>n/s</em> isn\'t scored for a sector — never plotted as 0.' +
      "</div></div></section>"
    );
  }

  // --- overlaid per-metric IQR strip (inside each metric-median card): A upper lane, B lower lane,
  // one shared axis = combined [min, max] of both sectors so the bands are comparable within the card.
  // Band = p25..p75, tick = median. A side with no distribution draws no band (never a zero-width band
  // at the origin). No flipped fill for inverted metrics — direction stays the text "lower is better". ---
  function cmpSpreadStripHtml(a, b) {
    function ok(r) { return r && r.p25 != null && r.p75 != null && r.min != null && r.max != null && r.median != null; }
    var haveA = ok(a), haveB = ok(b);
    if (!haveA && !haveB) return ""; // card's median bars already carry the N/A
    var mins = [], maxs = [];
    if (haveA) { mins.push(a.min); maxs.push(a.max); }
    if (haveB) { mins.push(b.min); maxs.push(b.max); }
    var lo = Math.min.apply(null, mins), hi = Math.max.apply(null, maxs);
    if (!(hi > lo)) { var e = Math.abs(lo) || 1; lo -= e * 0.5; hi += e * 0.5; }
    var VB = 280;
    function fx(v) { return ((v - lo) / (hi - lo) * VB).toFixed(2); }
    function lane(row, have, cls, dashed) {
      if (!have) return '<span class="pa-iqr-none">no distribution</span>';
      var x25 = parseFloat(fx(row.p25)), x75 = parseFloat(fx(row.p75));
      var w = Math.max(1.2, x75 - x25).toFixed(2);
      return (
        '<svg class="pa-iqr ' + cls + '" viewBox="0 0 ' + VB + ' 14" preserveAspectRatio="none" aria-hidden="true">' +
        '<line class="pa-iqr-whisk" x1="' + fx(row.min) + '" y1="7" x2="' + fx(row.max) + '" y2="7"></line>' +
        '<rect class="pa-iqr-band' + (dashed ? " dashed" : "") + '" x="' + x25.toFixed(2) + '" y="2" width="' + w + '" height="10" rx="1.5"></rect>' +
        '<line class="pa-iqr-med" x1="' + fx(row.median) + '" y1="0" x2="' + fx(row.median) + '" y2="14"></line>' +
        "</svg>"
      );
    }
    return (
      '<div class="pa-iqr-wrap" role="img" aria-label="Interquartile spread — sector A upper, sector B lower, on a shared axis">' +
      '<div class="pa-iqr-row"><span class="pa-iqr-lab pa-cmp-idA">A</span>' + lane(a, haveA, "pa-cmp-idA", false) + "</div>" +
      '<div class="pa-iqr-row"><span class="pa-iqr-lab pa-cmp-idB">B</span>' + lane(b, haveB, "pa-cmp-idB", true) + "</div>" +
      '<div class="pa-iqr-cap">band = IQR · tick = median</div></div>'
    );
  }

  function wireCompareView() {
    var a = $("cmpSelA"), b = $("cmpSelB");
    if (a) a.addEventListener("change", function () { state.compareA = a.value || null; ensureCompareData(); renderApp(); });
    if (b) b.addEventListener("change", function () { state.compareB = b.value || null; ensureCompareData(); renderApp(); });
  }

  // ---------- wiring ----------

  function wireShell() {
    var ddBtn = $("paDdBtn");
    if (ddBtn) ddBtn.addEventListener("click", function (e) { e.stopPropagation(); state.ddOpen = !state.ddOpen; renderApp(); });
    var menu = $("paDdMenu");
    if (menu) menu.querySelectorAll(".pa-dd-opt").forEach(function (b) {
      b.addEventListener("click", function () { selectSector(parseInt(b.getAttribute("data-idx"), 10)); });
    });
    var pin = $("paPin");
    if (pin) pin.addEventListener("click", togglePin);
    // The topbar search and the view rail belong to the shared shell now (shell.js): the search is
    // wired once in init() with selectFocal as the override, and the rail carries its own onSelect.
    // Re-wiring them here would double-bind them on every re-render.
    var back = $("coBackBtn"); // recovery from a dead-end Company state
    if (back) back.addEventListener("click", clearFocalToDefault);
  }

  function wireSectorView() {
    document.querySelectorAll(".pa-tile[data-theme]").forEach(function (tile) {
      var th = tile.getAttribute("data-theme");
      tile.addEventListener("click", function () { expandTheme(th); });
      tile.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); expandTheme(th); } });
    });
    document.querySelectorAll(".pa-tile-score").forEach(function (btn) {
      btn.addEventListener("click", function (e) { e.stopPropagation(); toggleDecomp(btn.getAttribute("data-score-theme")); });
    });
    var close = $("paDecompClose");
    if (close) close.addEventListener("click", function () { state.decompTheme = null; renderApp(); });
    // 03 Distribution scope toggle: theme-scoped vs all-metric spreads.
    document.querySelectorAll(".pa-scope-btn[data-scope]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var s = btn.getAttribute("data-scope");
        if (s !== state.drillScope) { state.drillScope = s; renderApp(); }
      });
    });
  }

  // close the sector dropdown on an outside click
  document.addEventListener("click", function (e) {
    if (state.ddOpen && !e.target.closest(".pa-dd")) { state.ddOpen = false; renderApp(); }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
