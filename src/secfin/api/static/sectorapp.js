/* Sector Analytics app — /sector-analytics. A "paper terminal" single-page app (a from-scratch
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
  };
  if (params.get("view") === "company") state.view = "company";
  if (params.get("view") === "compare") state.view = "compare";
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
    renderApp(); // initial (loading) shell
    P.api("/sectors")
      .then(function (res) {
        state.sectors = res;
        resolveInitialSector();
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
    var want = params.get("group") || lsGet(LS_LAST);
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
    renderApp();
    ensureSectorData();
  }
  function setView(v) { state.view = v; renderApp(); if (v === "company" && !state.focalCik) resolveDefaultFocal(); }
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

  function renderApp() {
    var app = $("app");
    app.innerHTML =
      '<div class="pa-app">' +
      sidebarHtml() +
      '<div class="pa-maincol">' +
      topbarHtml() +
      '<main class="pa-main">' +
      titleHtml() +
      controlBarHtml() +
      // v2 shell: view rail · viewport (960px cap) · right rail (Sector: sector snapshot + feed + how-to;
      // Company: focal filer snapshot + how-to). Compare/Qualitative have no rail (own phases).
      '<div class="pa-body">' + railHtml() + '<div class="pa-viewport" id="viewport"></div>' +
      (state.view === "sector" || (state.view === "company" && state.focalCik) ? rightRailHtml() : "") + "</div>" +
      "</main></div></div>";
    renderViewport();
    wireShell();
  }

  function sidebarHtml() {
    var nav = [
      ["Company hub", "/company/AAPL"], ["Compare", "/compare"], ["Screen", "/screen"],
      ["Coverage", "/coverage"], ["Sector analytics", "/sector-analytics"],
    ];
    var links = nav.map(function (n) {
      var active = n[1] === "/sector-analytics";
      return '<a class="pa-side-link' + (active ? " active" : "") + '" href="' + n[1] + '">' + P.esc(n[0]) + "</a>";
    }).join("");
    return (
      '<aside class="pa-side">' +
      '<div class="pa-brand"><span class="pa-brand-name">ClearyFi</span><span class="pa-brand-tag">SEC data</span></div>' +
      '<div class="pa-side-label">Data</div>' + links +
      '<div class="pa-side-label pa-side-label-2">Reference</div>' +
      '<a class="pa-side-link" href="/guide">Docs &amp; guide</a>' +
      '<a class="pa-side-link" href="/methodology">Methodology</a>' +
      '<a class="pa-side-link" href="/docs">API reference</a>' +
      '<div class="pa-side-foot">Data, not investment advice.</div>' +
      "</aside>"
    );
  }

  function topbarHtml() {
    return (
      '<header class="pa-topbar">' +
      '<form class="pa-search" id="paSearch"><span class="pa-search-ic">⌕</span>' +
      '<input class="pa-search-input" id="paSearchInput" type="text" placeholder="Search ticker or CIK…" ' +
      'autocomplete="off" spellcheck="false" aria-label="Search ticker or CIK to place a company in its peers">' +
      '<span class="pa-kbd">⌘K</span></form>' +
      '<a class="pa-apiref" href="/docs">API reference ↗</a>' +
      "</header>"
    );
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

  function railHtml() {
    var views = [["sector", "Sector"], ["company", "Company"], ["compare", "Compare"], ["qual", "Qualitative"]];
    var btns = views.map(function (v) {
      var active = state.view === v[0];
      return '<button class="pa-rail-btn' + (active ? " active" : "") + '" data-view="' + v[0] + '">' + v[1] + "</button>";
    }).join("");
    return (
      '<nav class="pa-rail"><div class="pa-rail-label">View</div>' + btns +
      '<div class="pa-rail-rule"></div>' +
      '<div class="pa-rail-note">Sector · period · company preserved across views. Selecting a sector keeps your current theme focus.</div>' +
      "</nav>"
    );
  }

  // ---------- right rail (Sector view only): snapshot · "What's moving" feed placeholder · how-to-read ----------

  function rightRailHtml() {
    if (state.view === "company") return companyRailHtml();
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
    return renderQualView(vp);
  }

  // ---------- Qualitative view (altitude 4): an honest "Coming — Track 2" placeholder ----------
  //
  // HONESTY LANDMINE (CLAUDE.md guardrail 1 / REDESIGN honesty flag 1): this product ingests
  // STRUCTURED SEC data only (Track 1). Qualitative disclosures are free-text narrative -- a
  // deliberate later decision, NOT a gap we fill with estimates. This view renders NOTHING derived
  // and NOTHING fabricated: category labels + one-liners only, no figures/counts/●-flags/chips.

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

  function renderQualView(vp) {
    // --- Risk-factor themes (left, 3fr): 7 real theme labels, every data cell a placeholder ---
    var rtRows = QUAL_THEMES.map(function (name) {
      return (
        '<div class="pa-qual-rtrow"><span class="pa-qual-rtname">' + P.esc(name) + "</span>" +
        '<span class="pa-qual-rtmid"><span class="pa-qual-rtbar"></span><span class="pa-qual-dash">—</span></span>' +
        '<span class="pa-qual-planned">planned</span></div>'
      );
    }).join("");
    var rtCard =
      '<div class="pa-card pa-qual-rt"><div class="pa-qual-cardhead">' +
      '<span class="pa-qual-cardname">Risk-factor themes</span>' +
      '<span class="pa-qual-cardnote">share of filers citing · YoY direction</span></div>' +
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
      "No filers are shown; nothing here is fabricated.</div></div>";

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
      '<div class="pa-qual-foot">Nothing on this view is derived from filings or estimated.</div>';
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
    return '<div class="pa-drill-row pa-geo-row">' + geoPlaceholderHtml() + insiderPlaceholderHtml() + "</div>";
  }
  // Geographic revenue mix (ASC 280 segment disclosure) — Track 1 but NOT ingested/aggregated at the
  // sector level. Honest placeholder; NO fabricated segment/percentage.
  function geoPlaceholderHtml() {
    return (
      '<div class="pa-card pa-geo pa-ph"><div class="pa-card-head">' +
      '<span class="pa-card-title">Geographic revenue mix</span>' +
      '<span class="pa-card-hint">ASC 280 segment disclosure · asset-weighted</span></div>' +
      '<div class="pa-ph-body">A domestic/international revenue split would sit here — segment (ASC 280) ' +
      "data isn’t ingested or aggregated by sector yet. To be defined; no figures shown.</div></div>"
    );
  }
  // Insider flow (Forms 3/4/5) — Track 1, but insider data is per-CIK only (no sector-level aggregate).
  // Honest placeholder; NO fabricated ratio/net figure.
  function insiderPlaceholderHtml() {
    return (
      '<div class="pa-card pa-insider pa-ph"><div class="pa-card-head">' +
      '<span class="pa-card-title">Insider flow</span>' +
      '<span class="pa-card-hint">Forms 3/4/5</span></div>' +
      '<div class="pa-ph-body">A sector net buy/sell would sit here — insider transactions are ingested ' +
      "per company, not aggregated by sector yet. To be defined; no figures shown.</div></div>"
    );
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
        renderApp();
        ensureCompanyData();
      })
      .catch(function () { state.companyErr = true; renderApp(); });
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
          if (cos.length && !state.focalCik) { state.focalGroup = g; selectFocalCik(cos[0].cik, cos[0].name); ensureCompanyData(); }
          else if (!state.focalCik) tryNext();
        })
        .catch(tryNext);
    }
    tryNext();
  }
  // The focal's SIC peers (for the breadcrumb dropdown) -- the real filers already loaded as dots.
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

  function quant(sorted, p) {
    if (!sorted.length) return null;
    var i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
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
    if (cos.length < 2) {
      return '<div class="pa-dp">' + head + '<div class="pa-empty-inline">No peer distribution for this metric yet — sparse coverage, not zero.</div></div>';
    }
    var vals = cos.map(function (c) { return c.value; });
    var sorted = vals.slice().sort(function (a, b) { return a - b; });
    var min = sorted[0], max = sorted[sorted.length - 1];
    var span = max - min || 1;
    var pos = function (v) { return ((v - min) / span) * 100; };
    var q1 = pos(quant(sorted, 0.25)), q3 = pos(quant(sorted, 0.75)), med = pos(quant(sorted, 0.5));
    var dots = cos.map(function (c, i) {
      var focal = c.cik === state.focalCik;
      var jitter = ((i % 5) - 2) * 9; // deterministic vertical spread so dots don't fully overlap
      if (focal) return ""; // focal drawn as a diamond on top (below)
      return '<span class="pa-dot" data-cik="' + c.cik + '" data-name="' + P.esc(c.name || "") + '" title="' + P.esc(c.name || ("CIK " + c.cik)) + " · " + fmtCo(metric, c.value) + '" style="left:' + pos(c.value).toFixed(1) + "%;top:calc(50% + " + jitter + "%)\"></span>";
    }).join("");
    var focalCo = cos.filter(function (c) { return c.cik === state.focalCik; })[0];
    var diamond = focalCo ? '<span class="pa-diamond" style="left:' + pos(focalCo.value).toFixed(1) + '%" title="' + P.esc(focalLabel()) + " · " + fmtCo(metric, focalCo.value) + '"></span>' : "";
    var track =
      '<div class="pa-dp-track">' +
      '<span class="pa-dp-iqr" style="left:' + q1.toFixed(1) + "%;width:" + (q3 - q1).toFixed(1) + '%"></span>' +
      '<span class="pa-dp-median" style="left:' + med.toFixed(1) + '%"></span>' +
      dots + diamond + "</div>";
    var cap = '<div class="pa-dp-cap">' + cos.length + " filers · min " + fmtCo(metric, min) + " · median " + fmtCo(metric, quant(sorted, 0.5)) + " · max " + fmtCo(metric, max) + "</div>";
    return '<div class="pa-dp">' + head + track + cap + coTrendPanelHtml(metric) + "</div>";
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
    document.querySelectorAll(".pa-dot[data-cik]").forEach(function (dot) {
      dot.addEventListener("click", function () {
        selectFocalCik(parseInt(dot.getAttribute("data-cik"), 10), dot.getAttribute("data-name"));
      });
    });
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
        : cmpThemesHtml(A, B) + cmpMetricsHtml(A, B));
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

  // --- theme spine: paired composite + per-theme true-length bars ---
  function cmpThemesHtml(A, B) {
    if (!state.themeScores) return '<div class="pa-card">' + P.states.loading({ title: "Loading theme scores", note: "" }) + "</div>";
    var eA = themeEntry(A), eB = themeEntry(B);
    if (!eA && !eB) {
      return '<div class="pa-card">' + P.states.empty({
        title: "No composite theme scores for either sector",
        copy: "Neither sector has materialized theme scores yet — sparse coverage, not zero.",
      }) + "</div>";
    }
    // canonical theme order = first appearance across A then B (both come pre-ordered by the API)
    var order = [], seen = {};
    [eA, eB].forEach(function (e) { (e && e.themes || []).forEach(function (t) { if (!seen[t.theme]) { seen[t.theme] = 1; order.push(t); } }); });

    // derived overall composite = mean of each sector's SCORED theme scores (labeled, not a rank)
    function composite(e) {
      var sc = scoredThemes(e).map(function (t) { return t.score; }).filter(function (v) { return v !== null && v !== undefined; });
      return sc.length ? Math.round(sc.reduce(function (a, b) { return a + b; }, 0) / sc.length) : null;
    }
    var rows = cmpScoreRow("Composite", composite(eA), composite(eB), A, B, true);
    rows += order.map(function (ref) {
      var tA = themeOf(eA, ref.theme), tB = themeOf(eB, ref.theme);
      var sA = tA && tA.scored ? tA.score : null;
      var sB = tB && tB.scored ? tB.score : null;
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
        line("A", av) + line("B", bv) + "</div>"
      );
    }).join("");
    return (
      '<section class="pa-cmp-sec"><div class="pa-cmp-sec-head">Metric medians</div>' +
      '<div class="pa-cmp-cards">' + cards + "</div>" +
      '<div class="pa-cmp-cardcap">Sector medians · bar length normalized per metric · value shown raw · A ' +
      P.esc(sectorLabel(A)) + " vs B " + P.esc(sectorLabel(B)) + " · N/A where a sector has no comparable median</div></section>"
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
    // header search: place a filer in its peers (Company view). Autocomplete via suggest.js;
    // Enter/pick resolves the ticker (or a raw CIK) to the focal company.
    var form = $("paSearch");
    var input = $("paSearchInput");
    if (form && input) {
      form.addEventListener("submit", function (e) { e.preventDefault(); selectFocal(input.value); });
      if (window.ClearyFiSuggest) window.ClearyFiSuggest.attach(input, { onPick: function (sym) { selectFocal(sym); } });
    }
    document.querySelectorAll(".pa-rail-btn").forEach(function (b) {
      b.addEventListener("click", function () { setView(b.getAttribute("data-view")); });
    });
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
