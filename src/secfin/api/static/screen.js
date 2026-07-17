/* Cross-company screening — /screen. A thin client over the M4 endpoints:
 *   Filter mode → GET /v1/screen (companies matching min/max thresholds, AND across concepts)
 *   Rank mode   → GET /v1/concepts/{concept} (one concept, ranked)
 * Built from the shared Profin components. Frames data is calendar-quarter aligned; the always-
 * present `caveats` are rendered verbatim. Descriptive only — no good/bad coloring, no winner.
 */
(function () {
  "use strict";
  var P = window.Profin;
  var $ = function (id) { return document.getElementById(id); };

  // The six screenable concepts (normalize/screening.SCREENABLE_CONCEPTS), all USD.
  var CONCEPTS = [
    ["revenue", "Revenue"],
    ["net_income", "Net Income"],
    ["total_assets", "Total Assets"],
    ["total_liabilities", "Total Liabilities"],
    ["stockholders_equity", "Stockholders' Equity"],
    ["cash_and_equivalents", "Cash & Equivalents"],
  ];
  var LABEL = {};
  CONCEPTS.forEach(function (c) { LABEL[c[0]] = c[1]; });
  var KEYS = CONCEPTS.map(function (c) { return c[0]; });
  var PERIODS = ["FY", "Q1", "Q2", "Q3", "Q4"];

  // ---------- query state ----------

  var params = new URLSearchParams(location.search);
  function clampInt(v, def, lo, hi) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return def;
    return Math.min(hi, Math.max(lo, n));
  }
  var state = {
    view: params.get("view") === "rank" ? "rank" : "filter",
    year: clampInt(params.get("year"), new Date().getFullYear() - 1, 2009, 2099),
    period: PERIODS.indexOf(params.get("period")) !== -1 ? params.get("period") : "FY",
    concept: KEYS.indexOf(params.get("concept")) !== -1 ? params.get("concept") : "revenue",
    sort: params.get("sort") === "asc" ? "asc" : "desc",
    limit: clampInt(params.get("limit"), 25, 1, 500),
    filters: [],
  };
  // Parse active filters from the query (mirrors the API's {concept}_min/_max params).
  KEYS.forEach(function (k) {
    var lo = params.get(k + "_min"), hi = params.get(k + "_max");
    if (lo !== null || hi !== null) state.filters.push({ concept: k, min: lo || "", max: hi || "" });
  });
  if (!state.filters.length) state.filters = [{ concept: "revenue", min: "", max: "" }];

  // ---------- amount parsing / formatting ----------

  // Accept "100B" / "1.5t" / "50m" / "1e11" / plain numbers. "" -> null; invalid -> NaN.
  function parseAmount(s) {
    s = (s || "").trim();
    if (!s) return null;
    var m = s.match(/^(-?[0-9.]+)\s*([kmbt]?)$/i);
    if (!m) { var n = Number(s); return isFinite(n) ? n : NaN; }
    var mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[m[2].toLowerCase()] || 1;
    var v = parseFloat(m[1]);
    return isFinite(v) ? v * mult : NaN;
  }

  // ---------- navigation (URL mirrors the API params; state == URL) ----------

  function navTo(fields) {
    fields = fields || {};
    var view = fields.view || state.view;
    var year = "year" in fields ? fields.year : state.year;
    var period = fields.period || state.period;
    var q = new URLSearchParams();
    q.set("year", year);
    if (period !== "FY") q.set("period", period);
    if (view === "rank") {
      q.set("view", "rank");
      q.set("concept", fields.concept || state.concept);
      var sort = fields.sort || state.sort;
      if (sort !== "desc") q.set("sort", sort);
      var limit = "limit" in fields ? fields.limit : state.limit;
      if (limit !== 25) q.set("limit", limit);
    } else {
      (fields.filters || activeFilters()).forEach(function (f) {
        if (f.min !== "" && f.min != null) q.set(f.concept + "_min", f.min);
        if (f.max !== "" && f.max != null) q.set(f.concept + "_max", f.max);
      });
    }
    location.search = q.toString();
  }

  // ---------- init ----------

  function init() {
    $("footer").innerHTML = P.footer();
    setMasthead();
    mountViewToggle();

    var yr = $("year-input");
    yr.value = state.year;
    yr.onchange = function () { navTo({ year: clampInt(yr.value, state.year, 2009, 2099) }); };
    var ps = $("period-select");
    ps.value = state.period;
    ps.onchange = function () { navTo({ period: ps.value }); };

    $("disclosure").innerHTML = P.disclosure(["financials_floor", "not_advice"]);
    if (state.view === "rank") renderRank();
    else renderFilter();
  }

  function setMasthead() {
    var meta = state.view === "rank"
      ? ["Rank — one concept, cross-company", "frames data, calendar-quarter aligned"]
      : ["Filter — companies matching all thresholds", "frames data, calendar-quarter aligned"];
    meta.unshift((state.period === "FY" ? "FY " : state.period + " ") + state.year);
    $("masthead").innerHTML = P.masthead({
      title: "Screen companies",
      meta: meta,
    });
  }

  function mountViewToggle() {
    var t = $("view-toggle");
    t.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-view") === state.view);
    });
    t.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-view]");
      if (btn && btn.getAttribute("data-view") !== state.view) navTo({ view: btn.getAttribute("data-view") });
    });
  }

  function conceptOptions(selected) {
    return CONCEPTS.map(function (c) {
      return '<option value="' + c[0] + '"' + (c[0] === selected ? " selected" : "") + ">" + P.esc(c[1]) + "</option>";
    }).join("");
  }

  // ---------- filter mode ----------

  function renderFilter() {
    var rows = state.filters.map(filterRowHtml).join("");
    $("builder").innerHTML =
      '<div class="scr-builder"><div class="scr-builder-title">Filters — companies matching ALL of these (USD; e.g. 100B)</div>' +
      '<div id="filter-rows">' + rows + "</div>" +
      '<div class="scr-actions">' +
      '<button class="scr-add" id="add-filter">+ Add filter</button>' +
      '<button class="scr-run" id="run-filter">Run screen</button>' +
      '<span class="scr-hint" id="filter-hint"></span></div></div>';
    $("add-filter").onclick = addFilterRow;
    $("run-filter").onclick = runFilter;
    $("filter-rows").addEventListener("click", function (e) {
      var rm = e.target.closest("[data-remove]");
      if (rm) { rm.closest("[data-row]").remove(); }
    });

    // Auto-run when the URL already carries active thresholds; else prompt.
    if (hasActiveThresholds()) runFilter();
    else $("view").innerHTML = P.states.empty({ title: "Build a screen", copy: "Add one or more min/max thresholds and press Run screen." });
  }

  function filterRowHtml(f) {
    return (
      '<div class="scr-row" data-row>' +
      '<select class="scr-concept" data-concept>' + conceptOptions(f.concept) + "</select>" +
      '<input class="scr-num" data-min type="text" inputmode="decimal" placeholder="min" value="' + P.esc(f.min || "") + '">' +
      '<span class="scr-sep">to</span>' +
      '<input class="scr-num" data-max type="text" inputmode="decimal" placeholder="max" value="' + P.esc(f.max || "") + '">' +
      '<button class="scr-remove" data-remove aria-label="Remove filter">×</button>' +
      "</div>"
    );
  }

  function addFilterRow() {
    $("filter-rows").insertAdjacentHTML("beforeend", filterRowHtml({ concept: "revenue", min: "", max: "" }));
  }

  // Read the builder DOM into [{concept, min, max}] (raw string min/max, active rows only).
  function activeFilters() {
    var out = [];
    document.querySelectorAll("#filter-rows [data-row]").forEach(function (row) {
      var concept = row.querySelector("[data-concept]").value;
      var min = row.querySelector("[data-min]").value.trim();
      var max = row.querySelector("[data-max]").value.trim();
      if (min !== "" || max !== "") out.push({ concept: concept, min: min, max: max });
    });
    return out;
  }
  function hasActiveThresholds() {
    return state.filters.some(function (f) { return (f.min !== "" && f.min != null) || (f.max !== "" && f.max != null); });
  }

  function runFilter() {
    var rows = activeFilters();
    if (!rows.length) { $("filter-hint").textContent = "Add at least one min or max threshold."; return; }
    // Validate + build API params (parse shorthand to raw USD).
    var qs = ["fiscal_year=" + state.year, "fiscal_period=" + state.period];
    for (var i = 0; i < rows.length; i++) {
      var f = rows[i];
      if (f.min !== "") { var lo = parseAmount(f.min); if (isNaN(lo)) return badAmount(); qs.push(f.concept + "_min=" + lo); }
      if (f.max !== "") { var hi = parseAmount(f.max); if (isNaN(hi)) return badAmount(); qs.push(f.concept + "_max=" + hi); }
    }
    $("filter-hint").textContent = "";
    var screened = rows.map(function (f) { return f.concept; }).filter(function (c, idx, a) { return a.indexOf(c) === idx; });
    $("legend").innerHTML = "";
    $("view").innerHTML = P.states.loading({ title: "Screening", note: "" });
    P.api("/screen?" + qs.join("&")).then(
      function (res) { renderResultsTable(res, screened); },
      function (err) { onError(err, runFilter); }
    );
  }
  function badAmount() {
    $("filter-hint").textContent = "Amounts must be numbers (e.g. 100B, 1.5e11, 250000000).";
  }

  // ---------- rank mode ----------

  function renderRank() {
    $("builder").innerHTML =
      '<div class="scr-builder"><div class="scr-builder-title">Rank companies by one concept</div>' +
      '<div class="scr-row">' +
      '<select class="scr-concept" id="rank-concept">' + conceptOptions(state.concept) + "</select>" +
      '<select id="rank-sort"><option value="desc"' + (state.sort === "desc" ? " selected" : "") + ">Highest first</option>" +
      '<option value="asc"' + (state.sort === "asc" ? " selected" : "") + ">Lowest first</option></select>" +
      '<select id="rank-limit">' + [10, 25, 50, 100].map(function (n) {
        return '<option value="' + n + '"' + (n === state.limit ? " selected" : "") + ">Top " + n + "</option>";
      }).join("") + "</select></div></div>";
    $("rank-concept").onchange = function (e) { navTo({ concept: e.target.value }); };
    $("rank-sort").onchange = function (e) { navTo({ sort: e.target.value }); };
    $("rank-limit").onchange = function (e) { navTo({ limit: parseInt(e.target.value, 10) }); };

    $("legend").innerHTML = "";
    $("view").innerHTML = P.states.loading({ title: "Ranking", note: "" });
    P.api("/concepts/" + encodeURIComponent(state.concept) +
      "?fiscal_year=" + state.year + "&fiscal_period=" + state.period + "&sort=" + state.sort + "&limit=" + state.limit).then(
      function (res) { renderRankTable(res); },
      function (err) { onError(err, renderRank); }
    );
  }

  // ---------- shared rendering ----------

  function companyCell(r) {
    var name = r.entity_name || "CIK " + r.cik;
    return '<a href="/company/' + encodeURIComponent(r.cik) + '">' + P.esc(name) + "</a>";
  }

  function renderResultsTable(res, screened) {
    var rows = res.results || [];
    if (!rows.length) { $("view").innerHTML = emptyResults(); return; }
    var head = "<tr><th>Company</th>" +
      screened.map(function (c) { return '<th class="amt">' + P.esc(LABEL[c] || c) + "</th>"; }).join("") + "</tr>";
    var body = rows.map(function (r) {
      var cells = screened.map(function (c) {
        var v = r.values && r.values[c];
        return '<td class="amt stmt-amt">' + P.esc(v != null ? P.fmt.usd(v) : "—") + "</td>";
      }).join("");
      return '<tr><td class="stmt-label">' + companyCell(r) + "</td>" + cells + "</tr>";
    }).join("");
    $("view").innerHTML =
      '<div class="matrix-scroll"><table class="stmt-table"><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div>" +
      resultsCaption(res, rows.length + " companies match, AND across all filters");
  }

  function renderRankTable(res) {
    var rows = res.results || [];
    if (!rows.length) { $("view").innerHTML = emptyResults(); return; }
    var label = LABEL[res.concept] || res.concept;
    var body = rows.map(function (r, i) {
      return '<tr><td class="scr-rank-num">' + (i + 1) + '</td><td class="stmt-label">' + companyCell(r) +
        '</td><td class="amt stmt-amt">' + P.esc(r.value != null ? P.fmt.usd(r.value) : "—") + "</td></tr>";
    }).join("");
    $("view").innerHTML =
      '<div class="matrix-scroll"><table class="stmt-table"><thead><tr><th class="scr-rank-num">#</th>' +
      '<th>Company</th><th class="amt">' + P.esc(label) + "</th></tr></thead><tbody>" + body + "</tbody></table></div>" +
      resultsCaption(res, "Ranked by " + label + " · " + (res.sort === "asc" ? "lowest first" : "highest first"));
  }

  function resultsCaption(res, lead) {
    var per = res.fiscal_period === "FY" ? "FY " + res.fiscal_year : res.fiscal_period + " " + res.fiscal_year;
    return '<p class="stmt-caption">' + P.esc(lead) + " · " + P.esc(per) +
      " · calendar-quarter frame values — a non-calendar fiscal year is matched to the nearest " +
      "calendar period, so these can differ from the company's own /statements figures.</p>" +
      caveatsBlock(res.caveats || []);
  }

  function caveatsBlock(caveats) {
    if (!caveats || !caveats.length) return "";
    var items = caveats.map(function (c) { return "<li>" + P.esc(c) + "</li>"; }).join("");
    return '<details class="disclosure" style="margin-top:14px"><summary>Frames coverage caveats</summary><ul>' + items + "</ul></details>";
  }

  function emptyResults() {
    return P.states.empty({
      title: "No companies in coverage",
      copy: "No frames data matched for this concept and period. Frames (cross-company) data " +
        "starts ~2009 and is calendar-quarter aligned — read an empty result as outside coverage, " +
        "not a confirmed absence.",
    });
  }

  function onError(err, retry) {
    if (err.status === 401) { P.mountNeedsKey($("view"), retry); return; }
    if (err.status === 400) {
      $("view").innerHTML = P.states.empty({ title: "Add a filter", copy: err.detail || "At least one threshold is required." });
      return;
    }
    $("view").innerHTML = P.states.error({ copy: "Screening failed (" + (err.status || "network") + ")." });
  }

  init();
})();
