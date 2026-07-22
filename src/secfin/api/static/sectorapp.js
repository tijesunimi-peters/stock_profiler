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
    sectors: null, // /v1/sectors payload (universe + peer_count + fiscal_year)
    themeScores: null, // /v1/sectors/theme-scores payload (all sectors)
    themeScoresErr: false,
    series: {}, // group -> /sectors/{group}
    spreads: {}, // group -> /sectors/{group}/spreads
    lifecycle: {}, // group -> /sectors/{group}/lifecycle
    // Company view (altitude 2) state
    focalCik: null, // the focal filer's CIK (int); identity for the Company view
    focalName: null,
    focalGroup: null, // the focal's SIC peer group (e.g. "35")
    focalPeers: null, // /companies/{cik}/peers payload (per-metric percentiles -> derived rail)
    companyErr: false,
    coValues: {}, // "group|metric" -> SectorCompanyValueList payload (the dot-cloud, cached)
  };
  if (params.get("view") === "company") state.view = "company";

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
  function setView(v) { state.view = v; renderApp(); }
  function expandTheme(theme) { state.expandedTheme = theme; renderApp(); }
  function toggleDecomp(theme) { state.decompTheme = state.decompTheme === theme ? null : theme; renderApp(); }
  function togglePin() {
    var g = selectedGroup();
    state.compareA = state.compareA === g ? null : g; // parked: Compare view is a later phase
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
      '<div class="pa-body">' + railHtml() + '<div class="pa-viewport" id="viewport"></div></div>' +
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
    var pinned = sel && state.compareA === sel.group;
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
        '<span class="pa-meta-item">full peer set</span>'
      : '<span class="pa-meta-item">loading…</span>';
    return (
      '<section class="pa-ctrl">' +
      '<div class="pa-ctrl-head"><span class="pa-ctrl-label">Sector</span>' +
      '<button class="pa-pin' + (pinned ? " on" : "") + '" id="paPin">' + (pinned ? "✓ Pinned to compare" : "Pin to compare") + "</button></div>" +
      '<div class="pa-dd"><button class="pa-dd-btn" id="paDdBtn">' +
      '<span>' + (sel ? P.esc(sel.group_label) : "Select a sector") + "</span>" +
      '<span class="pa-dd-caret' + (state.ddOpen ? " open" : "") + '">▾</span></button>' + menu + "</div>" +
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

  // ---------- viewport dispatch ----------

  function renderViewport() {
    var vp = $("viewport");
    if (state.view === "sector") return renderSectorView(vp);
    if (state.view === "company") return renderCompanyView(vp);
    if (state.view === "compare") return renderStub(vp, "Sector compare", "Two sectors side by side on the same seven-theme spine. Coming in a later phase of this app.");
    return renderStub(vp, "Qualitative disclosures",
      "Risk-factor themes, going-concern, and litigation signals. Coming — Track 2 · not yet derived from filings. This product ingests structured data only; nothing here is fabricated.");
  }

  function renderStub(vp, title, body) {
    vp.innerHTML =
      '<div class="pa-stub"><div class="pa-stub-title">' + P.esc(title) + "</div>" +
      '<div class="pa-stub-body">' + P.esc(body) + "</div></div>";
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
    vp.innerHTML =
      secHead() +
      scorecardHtml(entry) +
      '<div class="pa-provisional">≈ Scores provisional — final weighting/normalization per methodology. Every number is a position vs other sectors, not a good/bad or buy verdict, and is openable.</div>' +
      (state.decompTheme ? decompHtml(entry) : "") +
      peerStripHtml() +
      shiftsHtml(g) +
      drilldownHtml(entry, g);
    wireSectorView();
    mountDrilldown(entry, g);
  }

  function secHead() {
    return (
      '<div class="pa-sec-head"><span class="pa-sec-num">01</span><h2 class="pa-sec-h2">Health scorecard</h2></div>' +
      '<div class="pa-sec-sub">Seven composite themes · click a score to open its decomposition · click a tile to expand its peers &amp; dispersion</div>'
    );
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
        '<span class="pa-tile-delta"><span class="pa-glyph">' + deltaGlyph(t.delta_vs_prior_fy) + "</span>" + P.esc(deltaLabel(t.delta_vs_prior_fy)) + "</span>" +
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
          return (
            '<div class="pa-shift-row">' +
            '<span class="pa-shift-glyph">' + glyph + "</span>" +
            '<span class="pa-shift-name">' + P.esc(SHIFT_LABELS[r.metric] || r.metric) + "</span>" +
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

  function drilldownHtml(entry, g) {
    var theme = (entry.themes || []).filter(function (x) { return x.theme === state.expandedTheme && x.scored; })[0];
    var label = themeLabel(state.expandedTheme);
    var head =
      '<div class="pa-card-head"><span class="pa-card-title">' + P.esc(label) + " · dispersion</span>" +
      '<span class="pa-card-hint">drill-down · median + IQR across this sector’s companies</span></div>';
    if (!theme) return '<div class="pa-card">' + head + '<div class="pa-empty-inline">' + P.esc(selName()) + " doesn’t score this theme.</div></div>";
    if (!state.spreads[g]) return '<div class="pa-card pa-drill">' + head + P.states.loading({ title: "Loading dispersion", note: "" }) + "</div>";
    var want = (theme.constituents || []).map(function (c) { return c.metric; });
    var have = {};
    ((state.spreads[g] && state.spreads[g].metrics) || []).forEach(function (m) { have[m.metric] = m; });
    var matched = want.map(function (m) { return have[m]; }).filter(Boolean);
    var cover = '<div class="pa-drill-cover">Showing ' + matched.length + " of " + want.length +
      " constituent" + (want.length === 1 ? "" : "s") + " with a peer distribution." +
      (matched.length < want.length ? " Others have no distribution yet — omitted, not zero." : "") + "</div>";
    if (!matched.length) {
      return '<div class="pa-card pa-drill">' + head + cover +
        '<div class="pa-empty-inline">No peer distribution for this theme’s constituents yet — sparse coverage, not zero. See the score decomposition for the full constituent set.</div></div>';
    }
    return '<div class="pa-card pa-drill">' + head + cover + '<div class="pa-drill-boxes" id="paDrillBoxes"></div></div>';
  }

  function mountDrilldown(entry, g) {
    var host = $("paDrillBoxes");
    if (!host || !state.spreads[g]) return;
    var theme = (entry.themes || []).filter(function (x) { return x.theme === state.expandedTheme && x.scored; })[0];
    if (!theme) return;
    var want = (theme.constituents || []).map(function (c) { return c.metric; });
    var have = {};
    ((state.spreads[g] && state.spreads[g].metrics) || []).forEach(function (m) { have[m.metric] = m; });
    var width = P.measuredWidth(host, 560);
    want.forEach(function (mk) {
      var m = have[mk];
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
    P.api("/companies/" + cik + "/peers?year=" + focalYear() + "&period=FY")
      .then(function (res) { if (state.focalCik === cik) { state.focalPeers = res; renderApp(); } })
      .catch(function () { /* keep the dots; the rail just won't update */ renderApp(); });
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

  function quant(sorted, p) {
    if (!sorted.length) return null;
    var i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }
  function focalLabel() {
    if (state.focalName) return state.focalName;
    return state.focalCik ? "CIK " + state.focalCik : "the focal filer";
  }
  // favorability-adjusted percentile: raw for higher-is-better, inverted for lower-is-better.
  function adjPct(metric, p) { return CO_DIR[metric] === 0 ? 100 - p : p; }

  function renderCompanyView(vp) {
    if (state.companyErr) {
      vp.innerHTML = coHead() + '<div class="pa-card">' + P.states.error({ copy: "Couldn't resolve that company." }) + "</div>";
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
        " has no SIC peer group with enough filers to place it against — sparse coverage, not zero.</div></div>";
      return;
    }
    vp.innerHTML = coHead() +
      '<div class="pa-co-body"><div class="pa-co-rail">' + coRailHtml() + "</div>" +
      '<div class="pa-co-main">' +
      '<div class="pa-co-legend">each dot a filer · band = IQR · line = median · ◆ = ' + P.esc(focalLabel()) +
      " · percentiles favorability-adjusted, N/A · N/M excluded</div>" +
      CO_METRICS.map(coDotPlotHtml).join("") +
      "</div></div>";
    wireCompanyView();
  }

  function coHead() {
    var g = state.focalGroup ? sicLabelOf(state.focalGroup) : "";
    return (
      '<div class="pa-co-head"><span class="pa-co-crumb">' + P.esc(g) + '</span><span class="pa-co-sep">›</span>' +
      '<span class="pa-co-name">' + P.esc(focalLabel()) + "</span></div>"
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
    var card =
      '<div class="pa-co-comp"><div class="pa-co-comp-label">Composite percentile</div>' +
      '<div class="pa-co-comp-val">' + (comp === null ? "—" : "P" + comp) + "</div>" +
      '<div class="pa-co-comp-note">derived · avg of the theme percentiles above (not a ranked position)</div></div>';
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
      '<div class="pa-dp-head"><span class="pa-dp-name">' + P.esc(payload.label || metric) + "</span>" +
      (hib === false ? '<span class="pa-dp-lib">lower is better</span>' : "") +
      focalValueLabel(cos, payload) + "</div>";
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
    return '<div class="pa-dp">' + head + track + cap + "</div>";
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
  }

  // close the sector dropdown on an outside click
  document.addEventListener("click", function (e) {
    if (state.ddOpen && !e.target.closest(".pa-dd")) { state.ddOpen = false; renderApp(); }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
