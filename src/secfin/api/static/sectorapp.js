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
    focalTicker: null, // Company view (Phase 2)
    compareA: null,
    compareB: null,
    ddOpen: false, // sector dropdown open
    sectors: null, // /v1/sectors payload (universe + peer_count + fiscal_year)
    themeScores: null, // /v1/sectors/theme-scores payload (all sectors)
    themeScoresErr: false,
    series: {}, // group -> /sectors/{group}
    spreads: {}, // group -> /sectors/{group}/spreads
    lifecycle: {}, // group -> /sectors/{group}/lifecycle
  };

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
      '<span class="pa-search-ph">Search ticker or CIK…</span><span class="pa-kbd">⌘K</span></form>' +
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
    if (state.view === "company") return renderStub(vp, "Company drill-down", "Where a single filer sits inside its peer distribution. Coming in a later phase of this app.");
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
    var search = $("paSearch");
    if (search) search.addEventListener("submit", function (e) { e.preventDefault(); });
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
