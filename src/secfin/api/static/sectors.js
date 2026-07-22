/* Sector performance overview — /sectors. A SINGLE-SECTOR surface (redesign Phase 1): the sector
 * selector is the spine, one sector fills the page, and the reader steps between sectors. Over the
 * Sector Analytics endpoints:
 *   GET /v1/sectors                    → the sector list (selector) + as-of FY + honesty caveats
 *   GET /v1/sectors/{group}            → one sector's FY DuPont aggregate series (tree + ROE trend)
 *   GET /v1/sectors/{group}/spreads    → the sector's per-metric box spreads
 *   GET /v1/sectors/{group}/lifecycle  → the sector's DIO/DSO/DPO/CCC trend
 *
 * The numbers are ASSET-WEIGHTED SECTOR AGGREGATES (ΣNI/ΣRev × ΣRev/ΣAssets × ΣAssets/ΣEquity),
 * NOT medians — the always-present `caveats` and the `aggregation` label are rendered verbatim.
 * Descriptive only: no good/bad coloring, no "winner". A missing value is never drawn as 0.
 *
 * (Phase 2 adds the composite scorecard from /v1/sectors/theme-scores; Phase 3 the peer strip that
 * restores a cross-sector view. Neither is consumed here.)
 */
(function () {
  "use strict";
  var P = window.ClearyFi;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);

  var LS_LAST = "secfin:lastSector"; // last-viewed sector code
  var LS_MRU = "secfin:sectorMRU"; // recently-viewed sector codes, newest first

  var state = {
    data: null, // the /v1/sectors payload (sector list + fiscal_year + caveats)
    group: null, // the selected SIC-2 code
    notFound: null, // a ?group= that didn't resolve (shown as a muted note, then default is used)
    range: normalizeRange(params.get("range")) || "5y",
    series: {}, // group -> SectorSeries payload (lazy)
    groupSpreads: {}, // group -> SectorSpreadProfile payload (lazy)
    lifecycle: {}, // group -> SectorLifecycleSeries payload (lazy)
    themeScores: null, // the /v1/sectors/theme-scores payload (fetched ONCE, all sectors)
    themeScoresErr: false, // the theme-scores fetch failed (scorecard shows a scoped error)
    decompTheme: null, // the theme whose decomposition is currently open (one at a time)
  };

  function normalizeRange(r) {
    return r === "1y" || r === "5y" || r === "all" ? r : null;
  }

  // ---------- guarded localStorage (reuses app.js's try/catch pattern) ----------

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function getMRU() {
    try { var a = JSON.parse(lsGet(LS_MRU) || "[]"); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function pushMRU(code) {
    var m = getMRU().filter(function (c) { return c !== code; });
    m.unshift(code);
    lsSet(LS_MRU, JSON.stringify(m.slice(0, 6)));
    lsSet(LS_LAST, code);
  }

  // ---------- chrome ----------

  function init() {
    $("footer").innerHTML = P.footer();
    $("disclosure").innerHTML = P.disclosure(["financials_floor", "not_advice"]);
    $("view").innerHTML = P.states.loading({ title: "Loading sectors", note: "" });
    P.api("/sectors")
      .then(function (res) { state.data = res; render(); })
      .catch(function (err) {
        $("view").innerHTML = P.states.error({ copy: "Couldn't load sectors (" + (err.status || "network") + ")." });
      });
  }

  function render() {
    var d = state.data;
    $("masthead").innerHTML = P.masthead({
      eyebrow: "Sector analytics",
      title: "Sector performance overview",
      lede:
        "Pick an industry to read its return on equity decomposed into the DuPont drivers, its " +
        "multi-year history, and its working-capital structure — each an asset-weighted aggregate, " +
        "not a median.",
      meta: ["Fiscal year " + d.fiscal_year, d.peer_basis + " · " + d.sectors.length + " sectors"],
    });

    if (!d.sectors || !d.sectors.length) {
      $("sectorbar").innerHTML = "";
      $("scorecard").innerHTML = "";
      $("aggregation").innerHTML = "";
      $("view").innerHTML = P.states.empty({
        title: "No sectors to show",
        copy: "No SIC group met the minimum size for this period, or the sector aggregates aren't materialized yet.",
      });
      return;
    }

    $("aggregation").innerHTML = aggregationBlock(d);
    var initial = resolveInitialGroup(d.sectors);
    state.group = initial.group;
    state.notFound = initial.notFound;
    if (state.group) pushMRU(state.group); // record the landing sector as most-recent/last-viewed
    renderSectorBar();
    renderScorecard();
    renderBody();
    ensureThemeScores(); // fetch the composite scores once, then repaint the scorecard
  }

  // The load-bearing honesty banner: what these numbers are (and are not), plus the full caveats.
  function aggregationBlock(d) {
    var caveats = (d.caveats || []).map(function (c) { return "<li>" + P.esc(c) + "</li>"; }).join("");
    return (
      '<div class="agg-banner">' +
      '<span class="agg-badge">Aggregate</span>' +
      '<span class="agg-text">' + P.esc(d.aggregation) + ". Structural (SIC) grouping — descriptive, not a ranking of quality." + "</span>" +
      "</div>" +
      '<details class="disclosure agg-caveats"><summary>How to read these figures (' + (d.caveats || []).length + " notes)</summary><ul>" +
      caveats +
      "</ul></details>"
    );
  }

  // ---------- sector selection ----------

  function sectorList() { return state.data.sectors || []; }
  function findSector(code) {
    return sectorList().filter(function (s) { return s.group === code; })[0] || null;
  }

  // Resolution order: ?group= (valid) → localStorage last-viewed → default = largest by peer_count.
  // An explicit but unknown ?group= skips localStorage and lands on the default, carrying a note.
  function resolveInitialGroup(list) {
    var has = function (c) { return list.some(function (s) { return s.group === c; }); };
    var byParam = params.get("group");
    if (byParam && has(byParam)) return { group: byParam, notFound: null };
    var notFound = byParam && !has(byParam) ? byParam : null;
    if (!notFound) {
      var last = lsGet(LS_LAST);
      if (last && has(last)) return { group: last, notFound: null };
    }
    var def = list.slice().sort(function (a, b) { return (b.peer_count || 0) - (a.peer_count || 0); })[0];
    return { group: def ? def.group : null, notFound: notFound };
  }

  function selectSector(code) {
    if (!code || code === state.group) { return closeMenus(); }
    state.group = code;
    state.notFound = null; // an explicit choice clears the not-found note
    state.decompTheme = null; // close any open decomposition when the subject changes
    pushMRU(code);
    syncURL();
    renderSectorBar();
    renderScorecard();
    renderBody();
  }

  // Update ?group= in place, no reload (keeps the trend range if the user set a non-default one).
  function syncURL() {
    var q = new URLSearchParams();
    if (state.group) q.set("group", state.group);
    if (state.range && state.range !== "5y") q.set("range", state.range);
    var qs = q.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }

  function closeMenus() {
    var menu = $("sbMenu");
    if (menu) { menu.hidden = true; var i = $("sbInput"); if (i) i.setAttribute("aria-expanded", "false"); }
  }

  // ---------- sector bar: breadcrumb + header pills + selector ----------

  function renderSectorBar() {
    var d = state.data;
    var sel = findSector(state.group);
    var breadcrumb =
      '<nav class="sb-crumb" aria-label="Breadcrumb">Sectors <span class="sb-sep" aria-hidden="true">›</span> ' +
      '<span class="sb-current">' + (sel ? P.esc(sel.group_label) : "—") + "</span></nav>";
    var pills =
      '<div class="sb-pills">' +
      (sel ? '<span class="sb-pill">' + sel.peer_count + " filers</span>" : "") +
      '<span class="sb-pill sb-pill-muted">FY' + d.fiscal_year + "</span>" +
      "</div>";
    var note = state.notFound
      ? '<p class="sb-note">Sector “' + P.esc(state.notFound) + "” wasn’t found — showing " +
        (sel ? P.esc(sel.group_label) : "the default sector") + ".</p>"
      : "";
    $("sectorbar").innerHTML =
      '<div class="sb-head">' + breadcrumb + pills + "</div>" +
      '<div class="sb-select">' +
      '<div class="sb-combo">' +
      '<input type="text" id="sbInput" class="sb-input" placeholder="Search sectors…" autocomplete="off" ' +
      'spellcheck="false" role="combobox" aria-expanded="false" aria-controls="sbMenu" aria-label="Search and select a sector">' +
      '<div class="sb-menu" id="sbMenu" role="listbox" hidden></div>' +
      "</div>" +
      recentPillsHtml() +
      "</div>" +
      note;
    wireCombo();
    wireRecent();
  }

  function recentPillsHtml() {
    var mru = getMRU().filter(function (c) { return findSector(c); });
    if (!mru.length) return "";
    var pills = mru
      .map(function (c) {
        var s = findSector(c);
        return (
          '<button type="button" class="sb-recent' + (c === state.group ? " on" : "") +
          '" data-group="' + P.esc(c) + '"' + (c === state.group ? ' aria-current="true"' : "") + ">" +
          P.esc(s.group_label) + "</button>"
        );
      })
      .join("");
    return '<div class="sb-recent-row"><span class="sb-recent-label">Recent</span>' + pills + "</div>";
  }

  function wireRecent() {
    $("sectorbar").querySelectorAll(".sb-recent").forEach(function (btn) {
      btn.addEventListener("click", function () { selectSector(btn.getAttribute("data-group")); });
    });
  }

  // Self-contained combobox filtering the already-loaded sector list (no server round-trip).
  function wireCombo() {
    var input = $("sbInput");
    var menu = $("sbMenu");
    var matches = [];
    var active = -1;

    function all() {
      return sectorList().slice().sort(function (a, b) { return a.group_label.localeCompare(b.group_label); });
    }
    function filter(q) {
      q = (q || "").trim().toLowerCase();
      if (!q) return all();
      return all().filter(function (s) {
        return s.group_label.toLowerCase().indexOf(q) !== -1 || s.group.indexOf(q) !== -1;
      });
    }
    function paint() {
      if (!matches.length) { menu.innerHTML = '<div class="sb-empty">No sectors match</div>'; return; }
      menu.innerHTML = matches
        .map(function (s, i) {
          return (
            '<div class="sb-opt' + (i === active ? " active" : "") + '" role="option" data-i="' + i +
            '" aria-selected="' + (i === active) + '">' +
            '<span class="sb-opt-name">' + P.esc(s.group_label) + "</span>" +
            '<span class="sb-opt-count">' + s.peer_count + "</span></div>"
          );
        })
        .join("");
    }
    function open(list) {
      matches = list.slice(0, 60);
      active = matches.length ? 0 : -1;
      paint();
      menu.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }
    function close() {
      menu.hidden = true;
      input.setAttribute("aria-expanded", "false");
      active = -1;
    }
    function choose(i) {
      var s = matches[i];
      if (!s) return;
      close();
      input.value = "";
      selectSector(s.group);
    }

    input.addEventListener("focus", function () { open(filter(input.value)); });
    input.addEventListener("input", function () { open(filter(input.value)); });
    input.addEventListener("keydown", function (e) {
      if (menu.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, matches.length - 1); paint(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); paint(); }
      else if (e.key === "Enter") { if (active >= 0) { e.preventDefault(); choose(active); } }
      else if (e.key === "Escape") { close(); }
    });
    // mousedown (not click) so the input's blur doesn't tear the menu down first.
    menu.addEventListener("mousedown", function (e) {
      var opt = e.target.closest(".sb-opt");
      if (opt) { e.preventDefault(); choose(parseInt(opt.getAttribute("data-i"), 10)); }
    });
    menu.addEventListener("mousemove", function (e) {
      var opt = e.target.closest(".sb-opt");
      if (!opt) return;
      var i = parseInt(opt.getAttribute("data-i"), 10);
      if (i !== active) { active = i; paint(); }
    });
    input.addEventListener("blur", function () { setTimeout(close, 120); });
  }

  // ---------- composite scorecard (the hero): 7 theme tiles + inline decomposition ----------
  //
  // Reads the Phase 0 GET /v1/sectors/theme-scores (fetched ONCE -- it carries every sector) and
  // renders the SELECTED sector's themes. Five backable themes are scored (0-100, 50 = cross-sector
  // average); the two deferred themes render as honest "not yet scored" tiles, never a fabricated 0.
  // Favorability COLOR (guide 00 §5) is restrained: the score number stays neutral, a thin band
  // accent + the trend-delta chip carry direction -- the score is a POSITION vs other sectors, not a
  // good/bad or buy verdict (the surfaced caveats say so).

  // Constituent median formatting: percent-ish metrics read as %, the working-capital days-metrics
  // as "Nd", everything else as a multiple. Display-only (the API owns the numbers).
  var PERCENT_DECOMP = {
    gross_margin: 1, operating_margin: 1, net_margin: 1, roa: 1, roe: 1, roic: 1,
    revenue_growth_yoy: 1, earnings_growth_yoy: 1, ocf_growth_yoy: 1, growth_acceleration: 1,
    fcf_margin: 1,
  };
  var DAYS_DECOMP = { dso: 1, dio: 1, dpo: 1, ccc: 1 };
  function metricFmt(metric, v) {
    if (v === null || v === undefined) return "—"; // never 0 for a missing value
    if (PERCENT_DECOMP[metric]) return P.fmt.pct(v);
    if (DAYS_DECOMP[metric]) return Math.round(v) + "d";
    return P.fmt.mult(v);
  }

  function ensureThemeScores() {
    if (state.themeScores || state.themeScoresErr) return; // fetch once; switching sector re-picks
    P.api("/sectors/theme-scores")
      .then(function (res) { state.themeScores = res; renderScorecard(); })
      .catch(function () { state.themeScoresErr = true; renderScorecard(); });
  }

  function themeEntryFor(group) {
    var p = state.themeScores;
    if (!p || !p.sectors) return null;
    return p.sectors.filter(function (s) { return s.group === group; })[0] || null;
  }

  function renderScorecard() {
    var mount = $("scorecard");
    if (!mount) return;
    if (state.themeScoresErr) {
      mount.innerHTML =
        '<div class="scorecard-wrap">' +
        P.states.error({ copy: "Couldn't load the sector health scores. The rest of the page is unaffected." }) +
        "</div>";
      return;
    }
    if (!state.themeScores) {
      mount.innerHTML = '<div class="scorecard-wrap">' + P.states.loading({ title: "Loading sector health scores", note: "" }) + "</div>";
      return;
    }
    var entry = themeEntryFor(state.group);
    var sel = findSector(state.group);
    var label = entry ? entry.group_label : sel ? sel.group_label : "this sector";
    if (!entry || !entry.themes || !entry.themes.length) {
      mount.innerHTML =
        '<section class="scorecard-wrap">' +
        scorecardHead() +
        P.states.empty({
          title: "Sector health scores aren’t available yet",
          copy: "Composite theme scores for " + label + " haven’t been materialized — they " +
            "appear once the scoring batch runs across enough sectors. This is sparse coverage, not zero.",
        }) +
        "</section>";
      return;
    }
    var tiles = entry.themes
      .map(function (t) { return t.scored ? scoreTile(t) : deferredTile(t); })
      .join("");
    mount.innerHTML =
      '<section class="scorecard-wrap">' +
      scorecardHead() +
      '<div class="scorecard-grid">' + tiles + "</div>" +
      '<div id="scorecard-decomp"></div>' +
      scorecardCaveats() +
      "</section>";
    wireScorecard();
    renderDecomp(); // restore an open decomposition if one is set
  }

  function scorecardHead() {
    return (
      '<div class="scorecard-head">' +
      '<h2 class="scorecard-title">Composite health</h2>' +
      '<p class="scorecard-lede">Each theme rolls its constituent metrics into a 0–100 score — a ' +
      "sector’s <strong>position vs the other sectors</strong> (50 = cross-sector average), not a " +
      "good/bad or buy verdict. Open a score to see what drove it.</p>" +
      "</div>"
    );
  }

  function favBand(score) {
    // Restrained: the score number stays neutral; only a thin band accent is tinted.
    if (score >= 60) return "pos";
    if (score >= 40) return "cau";
    return "neg";
  }

  function deltaChip(d) {
    if (d === null || d === undefined) {
      return '<span class="sc-delta sc-delta-none">no prior FY</span>'; // never 0
    }
    var band = d >= 2 ? "pos" : d <= -2 ? "neg" : "cau";
    var glyph = d >= 2 ? "▲" : d <= -2 ? "▼" : "▬";
    var txt = d > 0 ? "+" + d : d < 0 ? String(d) : "±0";
    return '<span class="sc-delta sc-delta-' + band + '"><span class="sc-delta-glyph" aria-hidden="true">' + glyph + "</span>" + P.esc(txt) + "</span>";
  }

  function scoreTile(t) {
    var band = favBand(t.score);
    var pct = t.percentile === null || t.percentile === undefined ? "—" : "P" + Math.round(t.percentile);
    var rank = t.rank && t.rank_of ? t.rank + " of " + t.rank_of : "—";
    return (
      '<div class="sc-tile sc-band-' + band + (state.decompTheme === t.theme ? " sc-open" : "") + '">' +
      '<div class="sc-theme">' + P.esc(t.theme_label) + "</div>" +
      '<button type="button" class="sc-score" data-theme="' + P.esc(t.theme) + '" aria-expanded="' + (state.decompTheme === t.theme) + '" title="Show what drove this score">' +
      P.esc(String(t.score)) + "</button>" +
      '<div class="sc-meta">' + deltaChip(t.delta_vs_prior_fy) +
      '<span class="sc-rank" title="Rank vs all scored sectors on this theme">' + P.esc(rank) + "</span></div>" +
      '<div class="sc-pctile">' + P.esc(pct) + " · vs all sectors</div>" +
      "</div>"
    );
  }

  function deferredTile(t) {
    return (
      '<div class="sc-tile sc-deferred">' +
      '<div class="sc-theme">' + P.esc(t.theme_label) + "</div>" +
      '<div class="sc-notscored">Not yet scored</div>' +
      '<div class="sc-reason">' + P.esc(t.reason || "") + "</div>" +
      "</div>"
    );
  }

  function scorecardCaveats() {
    var p = state.themeScores;
    var notes = [p.normalization].concat(p.caveats || []).filter(Boolean);
    var lis = notes.map(function (c) { return "<li>" + P.esc(c) + "</li>"; }).join("");
    return (
      '<details class="disclosure scorecard-caveats"><summary>How these scores are built (' +
      notes.length + " notes)</summary><ul>" + lis + "</ul></details>"
    );
  }

  function wireScorecard() {
    $("scorecard").querySelectorAll(".sc-score").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var th = btn.getAttribute("data-theme");
        state.decompTheme = state.decompTheme === th ? null : th; // toggle; one open at a time
        renderScorecard();
      });
    });
  }

  function renderDecomp() {
    var mount = $("scorecard-decomp");
    if (!mount) return;
    if (!state.decompTheme) { mount.innerHTML = ""; return; }
    var entry = themeEntryFor(state.group);
    var t = entry && (entry.themes || []).filter(function (x) { return x.theme === state.decompTheme; })[0];
    if (!t || !t.scored) { mount.innerHTML = ""; return; }
    var cons = t.constituents || [];
    var maxZ = cons.reduce(function (m, c) { return Math.max(m, Math.abs(c.oriented_z || 0)); }, 1);
    var rows = cons
      .map(function (c) {
        var z = c.oriented_z || 0;
        var band = z >= 0.25 ? "pos" : z <= -0.25 ? "neg" : "cau";
        var w = Math.min(100, (Math.abs(z) / maxZ) * 100);
        return (
          '<div class="sc-crow">' +
          '<span class="sc-cname">' + P.esc(c.label) + "</span>" +
          '<span class="sc-cmed">' + P.esc(metricFmt(c.metric, c.median)) + "</span>" +
          '<span class="sc-cbar"><span class="sc-cfill sc-fill-' + band + '" style="width:' + w.toFixed(0) + '%"></span></span>' +
          '<span class="sc-cz">' + (z >= 0 ? "+" : "") + z.toFixed(2) + "σ</span>" +
          "</div>"
        );
      })
      .join("");
    mount.innerHTML =
      '<div class="sc-decomp">' +
      '<div class="sc-decomp-head">' + P.esc(t.theme_label) + " · score decomposition</div>" +
      '<p class="sc-decomp-note">Equal-weight mean of ' + cons.length +
      " constituent" + (cons.length === 1 ? "" : "s") + ". Each bar is the constituent’s " +
      "favorability-oriented z-score (its position vs other sectors, signed so higher = more " +
      "favorable). A constituent with no comparable value is excluded, never counted as zero.</p>" +
      '<div class="sc-crows">' + rows + "</div>" +
      '<p class="sc-decomp-norm">' + P.esc(state.themeScores.normalization) + "</p>" +
      "</div>";
  }

  // ---------- sector body: DuPont tree + ROE trend + per-sector spreads + lifecycle ----------

  function renderBody() {
    var view = $("view");
    if (!state.group) {
      view.innerHTML = P.states.empty({ title: "No sector selected", copy: "Choose a sector above to see its analytics." });
      return;
    }
    var g = state.group;
    if (state.series[g]) { paintBody(view, state.series[g]); return; }
    view.innerHTML = P.states.loading({ title: "Loading sector", note: "" });
    P.api("/sectors/" + encodeURIComponent(g))
      .then(function (res) {
        state.series[g] = res;
        if (state.group === g) paintBody(view, res); // ignore a stale response if the user switched
      })
      .catch(function () {
        if (state.group === g) view.innerHTML = P.states.error({ copy: "Couldn't load this sector's detail." });
      });
  }

  function paintBody(mount, series) {
    mount.innerHTML = "";
    var pts = (series.points || []).slice(); // FY, oldest first
    if (!pts.length) {
      mount.innerHTML = P.states.empty({ title: "No detail on record", copy: "This sector has no materialized aggregate yet." });
      return;
    }
    var latest = pts[pts.length - 1];
    mount.appendChild(dupontTree(latest, series.group_label));
    mount.appendChild(rangeControls());

    var chartWrap = document.createElement("div");
    chartWrap.className = "trend-mount";
    mount.appendChild(chartWrap);
    paintTrend(chartWrap, pts);
    wireRange(mount, chartWrap, pts);

    // Per-sector box/whisker: this sector's spread for each offered metric (a small-multiple, one
    // mini box per metric because scales differ). A metric with too few companies is omitted, never
    // a zero box. Loads lazily; on failure it just skips (an enhancement, never breaks the body).
    var spreadMount = document.createElement("div");
    spreadMount.className = "detail-spreads";
    mount.appendChild(spreadMount);
    paintDetailSpreads(spreadMount, series.group);

    // Asset-lifecycle trend: DIO/DSO/DPO and their synthesis CCC over the FY series. Loads lazily;
    // on failure it just skips (an enhancement, never breaks the body).
    var lifecycleMount = document.createElement("div");
    lifecycleMount.className = "detail-lifecycle";
    mount.appendChild(lifecycleMount);
    paintLifecycle(lifecycleMount, series.group);
  }

  // ---------- per-sector asset-lifecycle trend (DIO/DSO/DPO/CCC) ----------

  function paintLifecycle(mount, group) {
    if (state.lifecycle[group]) { drawLifecycle(mount, state.lifecycle[group]); return; }
    mount.innerHTML = P.states.loading({ title: "Loading lifecycle", note: "" });
    P.api("/sectors/" + encodeURIComponent(group) + "/lifecycle")
      .then(function (res) { state.lifecycle[group] = res; drawLifecycle(mount, res); })
      .catch(function () { mount.innerHTML = ""; }); // skip silently — the rest of the body stands
  }

  function drawLifecycle(mount, res) {
    mount.innerHTML = "";
    var pts = res.points || [];
    var head = document.createElement("div");
    head.className = "detail-lifecycle-head";
    var anyApprox = pts.some(function (p) { return p.approximate; });
    head.innerHTML =
      '<span class="detail-lifecycle-title">Cash conversion cycle · ' + P.esc(res.group_label) + "</span>" +
      (anyApprox ? '<span class="approx-badge" title="Some years include a company that reported only a period-end balance">~ approximate</span>' : "");
    mount.appendChild(head);

    var lede = document.createElement("p");
    lede.className = "detail-lifecycle-lede";
    lede.textContent =
      "How long cash sits in inventory (DIO) and receivables (DSO) before it comes back, versus how " +
      "long suppliers finance it (DPO). CCC = DIO + DSO − DPO is the net days cash is tied up — " +
      "descriptive working-capital structure for this sector, not a signal about returns.";
    mount.appendChild(lede);

    if (pts.length < 2) {
      mount.innerHTML +=
        '<p class="detail-spread-empty">' +
        (pts.length === 1
          ? "Only one fiscal year is on record for this sector — not enough to draw a lifecycle trend."
          : "No lifecycle aggregate on record for this sector yet — sparse coverage, not zero.") +
        "</p>";
      mount.appendChild(lifecycleCaveats(res));
      return;
    }

    var chartWrap = document.createElement("div");
    chartWrap.className = "lifecycle-mount";
    mount.appendChild(chartWrap);
    var width = P.measuredWidth(mount, 560);
    chartWrap.appendChild(P.sectorLifecycleTrend(pts, { width: width, range: state.range, title: null }));
    mount.appendChild(lifecycleCaveats(res));
  }

  function lifecycleCaveats(res) {
    var wrap = document.createElement("div");
    var caveats = (res.caveats || []).map(function (c) { return "<li>" + P.esc(c) + "</li>"; }).join("");
    if (caveats) {
      wrap.innerHTML =
        '<details class="disclosure lifecycle-caveats"><summary>How to read this lifecycle (' +
        (res.caveats || []).length + " notes)</summary><ul>" + caveats + "</ul></details>";
    }
    return wrap;
  }

  // 2-digit metric keys whose "ratio" unit reads as a PERCENT (mirrors app.js PERCENT_METRICS) —
  // everything else in the spread set reads as a multiple (×). Used only for the readout captions.
  var PERCENT_SPREAD = {
    net_margin: 1, roe: 1, roa: 1, revenue_growth_yoy: 1, earnings_growth_yoy: 1,
  };
  function fmtSpreadVal(metric, v) {
    if (v === null || v === undefined) return "—";
    return PERCENT_SPREAD[metric] ? P.fmt.pct(v) : P.fmt.mult(v);
  }

  function paintDetailSpreads(mount, group) {
    mount.innerHTML = P.states.loading({ title: "Loading sector spread", note: "" });
    if (state.groupSpreads[group]) { drawDetailSpreads(mount, state.groupSpreads[group]); return; }
    P.api("/sectors/" + encodeURIComponent(group) + "/spreads?year=" + state.data.fiscal_year)
      .then(function (res) { state.groupSpreads[group] = res; drawDetailSpreads(mount, res); })
      .catch(function () { mount.innerHTML = ""; }); // skip silently — the tree + trend still stand
  }

  function drawDetailSpreads(mount, res) {
    mount.innerHTML = "";
    var head = document.createElement("div");
    head.className = "detail-spread-head";
    head.textContent = "Metric spread across " + res.group_label + " · FY" + res.fiscal_year;
    mount.appendChild(head);
    var metrics = res.metrics || [];
    if (!metrics.length) {
      mount.innerHTML +=
        '<p class="detail-spread-empty">No metric has enough companies in this sector to plot a ' +
        "spread for FY" + res.fiscal_year + " yet — sparse coverage, not zero.</p>";
      return;
    }
    var width = P.measuredWidth(mount, 560);
    metrics.forEach(function (m) {
      mount.appendChild(
        P.boxWhiskerChart(
          [{ label: "", peer_count: m.peer_count, min: m.min, p25: m.p25, median: m.median, p75: m.p75, max: m.max }],
          {
            width: width,
            height: 60,
            marginLeft: 14,
            title: m.label,
            metric: m.metric,
            unit: m.unit,
            caption:
              m.peer_count + " companies · min " + fmtSpreadVal(m.metric, m.min) +
              " · median " + fmtSpreadVal(m.metric, m.median) +
              " · max " + fmtSpreadVal(m.metric, m.max),
          }
        )
      );
    });
  }

  // The signature: the DuPont identity shown literally, ROE = margin × turnover × leverage.
  function dupontTree(pt, label) {
    var legs = [
      { val: P.fmt.pct(pt.roe), name: "Return on equity", desc: "ΣNI ÷ ΣEquity", result: true },
      { val: P.fmt.pct(pt.net_margin), name: "Net margin", desc: "profit per $ of revenue" },
      { val: P.fmt.mult(pt.asset_turnover), name: "Asset turnover", desc: "revenue per $ of assets" },
      { val: P.fmt.mult(pt.equity_multiplier), name: "Equity multiplier", desc: "assets per $ of equity — leverage" },
    ];
    var ops = ["=", "×", "×"];
    var html = '<div class="dupont">';
    legs.forEach(function (leg, i) {
      if (i > 0) html += '<div class="dp-op" aria-hidden="true">' + ops[i - 1] + "</div>";
      html +=
        '<div class="dp-leg' + (leg.result ? " dp-result" : "") + '">' +
        '<div class="dp-val">' + P.esc(leg.val) + "</div>" +
        '<div class="dp-name">' + P.esc(leg.name) + "</div>" +
        '<div class="dp-desc">' + P.esc(leg.desc) + "</div>" +
        "</div>";
    });
    html += "</div>";
    html +=
      '<p class="dp-meta">' +
      P.esc(label) +
      " · FY" + pt.fiscal_year +
      " · aggregated over " + pt.peer_count + " companies · asset-weighted, not a median" +
      "</p>";
    var wrap = document.createElement("div");
    wrap.innerHTML = html;
    return wrap;
  }

  function rangeControls() {
    var opts = [["1y", "1Y"], ["5y", "5Y"], ["all", "All"]];
    var buttons = opts.map(function (o) {
      return '<button data-range="' + o[0] + '"' + (state.range === o[0] ? ' class="on"' : "") + ">" + o[1] + "</button>";
    }).join("");
    var wrap = document.createElement("div");
    wrap.className = "trend-controls";
    wrap.innerHTML = '<span class="trend-controls-label">Aggregate ROE trend</span><div class="segmented range-toggle">' + buttons + "</div>";
    return wrap;
  }

  // Densify the FY series into a contiguous year window for the chosen range, null-filling missing
  // years so the trend line BREAKS on a coverage gap (never interpolated, never 0).
  function windowedPoints(pts) {
    var byYear = {};
    pts.forEach(function (p) { byYear[p.fiscal_year] = p.roe; });
    var years = pts.map(function (p) { return p.fiscal_year; });
    var latest = Math.max.apply(null, years);
    var earliest = Math.min.apply(null, years);
    var start = state.range === "1y" ? latest - 1 : state.range === "5y" ? latest - 4 : earliest;
    if (start < earliest) start = earliest;
    var out = [];
    for (var y = start; y <= latest; y++) {
      out.push({ year: y, value: byYear[y] === undefined ? null : byYear[y] });
    }
    return out;
  }

  function paintTrend(chartWrap, pts) {
    chartWrap.innerHTML = "";
    var width = P.measuredWidth(chartWrap, 640);
    chartWrap.appendChild(P.sectorDupontTrend(windowedPoints(pts), { width: width, title: null }));
  }

  function wireRange(mount, chartWrap, pts) {
    mount.querySelectorAll(".range-toggle button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.range = btn.getAttribute("data-range");
        mount.querySelectorAll(".range-toggle button").forEach(function (b) { b.classList.remove("on"); });
        btn.classList.add("on");
        syncURL();
        paintTrend(chartWrap, pts);
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
