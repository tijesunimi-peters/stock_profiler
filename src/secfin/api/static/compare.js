/* Company comparison — /compare?symbols=AAPL,MSFT,JPM&year=2024. A 2–3 company metric matrix
 * over the v1 /metrics endpoint, built from the shared Profin components (app.js). Point-in-time
 * only (the calendar-axis trajectory overlay is the blocked Metrics Phase 1b item). Honesty
 * rules (STYLE_GUIDE §9): fiscal-calendar misalignment is surfaced per column, flags ride every
 * cell, and there is NO good/bad coloring and NO "winner". Display-only maps mirror company.js.
 */
(function () {
  "use strict";
  var P = window.Profin;
  var $ = function (id) { return document.getElementById(id); };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MAX = 3; // R10 / roadmap: compare at most 3 companies

  // ---------- display-only maps (mirror company.js) ----------

  var CATEGORIES = [
    ["Profitability", ["gross_margin", "operating_margin", "net_margin", "roa", "roe", "roic"]],
    ["Growth", ["revenue_growth_yoy", "earnings_growth_yoy", "ocf_growth_yoy", "growth_acceleration"]],
    ["Financial health", ["current_ratio", "quick_ratio", "debt_to_equity", "net_debt", "interest_coverage"]],
    ["Cash flow", ["fcf", "fcf_margin", "accruals"]],
    ["Efficiency", ["asset_turnover", "inventory_turnover", "dso"]],
    ["Per-share", ["eps_basic", "eps_diluted", "book_value_per_share", "fcf_per_share", "share_count"]],
  ];

  var FORMULAS = {
    gross_margin: "Gross profit ÷ Revenue",
    operating_margin: "Operating income ÷ Revenue",
    net_margin: "Net income ÷ Revenue",
    roa: "Net income ÷ Average total assets",
    roe: "Net income ÷ Average equity",
    roic: "NOPAT ÷ Invested capital",
    revenue_growth_yoy: "Revenue vs. a year ago",
    earnings_growth_yoy: "Net income vs. a year ago",
    ocf_growth_yoy: "Operating cash flow vs. a year ago",
    growth_acceleration: "Change in the YoY revenue-growth rate",
    current_ratio: "Current assets ÷ Current liabilities",
    quick_ratio: "(Current assets − Inventory) ÷ Current liabilities",
    debt_to_equity: "(Long-term + current debt) ÷ Equity",
    net_debt: "Long-term + current debt − Cash",
    interest_coverage: "Operating income ÷ Interest expense",
    fcf: "Operating cash flow − Capital expenditures",
    fcf_margin: "Free cash flow ÷ Revenue",
    accruals: "(Net income − Operating cash flow) ÷ Average assets",
    asset_turnover: "Revenue ÷ Average total assets",
    inventory_turnover: "Cost of revenue ÷ Average inventory",
    dso: "Average receivables ÷ Revenue × 365",
    eps_basic: "Reported basic EPS",
    eps_diluted: "Reported diluted EPS",
    book_value_per_share: "Equity ÷ Shares outstanding",
    fcf_per_share: "Free cash flow ÷ Diluted shares",
    share_count: "Diluted weighted-average shares",
  };

  // ---------- query state ----------

  var params = new URLSearchParams(location.search);
  var symbols = (params.get("symbols") || "")
    .split(",")
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
  // De-dupe case-insensitively, keep first occurrence, cap at MAX.
  (function () {
    var seen = {}, out = [];
    symbols.forEach(function (s) {
      var k = s.toUpperCase();
      if (!seen[k]) { seen[k] = 1; out.push(s); }
    });
    symbols = out.slice(0, MAX);
  })();
  var yearParam = parseInt(params.get("year"), 10);

  var state = {
    companies: [],
    years: [],
    cols: null,
    year: isNaN(yearParam) ? null : yearParam,
    view: params.get("view") === "trajectories" ? "trajectories" : "matrix",
    metric: params.get("metric") || null,
  };

  function monthYear(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    return MONTHS[parseInt(p[1], 10) - 1] + " " + p[0];
  }
  function monthOf(iso) { return iso ? iso.split("-")[1] : ""; }

  // Merge the given fields over current state and reload with the new query (deep-linkable).
  function navTo(fields) {
    fields = fields || {};
    var q = new URLSearchParams();
    var syms = fields.symbols || symbols;
    var year = "year" in fields ? fields.year : state.year;
    var view = fields.view || state.view;
    var metric = "metric" in fields ? fields.metric : state.metric;
    if (syms.length) q.set("symbols", syms.join(","));
    if (year) q.set("year", year);
    if (view && view !== "matrix") q.set("view", view);
    if (metric) q.set("metric", metric);
    location.search = q.toString();
  }

  // ---------- init ----------

  function init() {
    $("footer").innerHTML = P.footer();
    setMasthead();
    mountAdd();
    mountViewToggle();

    if (symbols.length < 2) {
      $("controls").hidden = false; // keep the add-company box available
      $("view").innerHTML = P.states.empty({
        title: "Compare companies",
        copy: "Add at least two companies (by ticker or CIK) to compare their fundamentals " +
          "side by side. Try /compare?symbols=AAPL,MSFT,JPM.",
      });
      return;
    }

    $("view").innerHTML = P.states.loading({ title: "Resolving companies" });
    loadCompanies();
  }

  function setMasthead() {
    var meta = state.view === "trajectories"
      ? ["Trajectories — annual history, as-restated", "aligned on calendar quarter-end"]
      : ["Point-in-time — as-of each filing, not real-time"];
    if (state.view !== "trajectories" && state.year) meta.unshift("FY " + state.year);
    $("masthead").innerHTML = P.masthead({
      eyebrow: "Profin — SEC data, normalized",
      title: "Compare companies",
      meta: meta,
    });
  }

  function mountAdd() {
    P.mountSearch($("search"), {
      onResolved: function (sym) { addCompany(sym); },
      onNotFound: function (sym) { flash('We don\'t carry "' + sym + '".'); },
      onError: function () { flash("Lookup failed — try again."); },
    });
  }

  function mountViewToggle() {
    var t = $("view-toggle");
    t.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-view") === state.view);
    });
    t.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-view]");
      if (!btn) return;
      var v = btn.getAttribute("data-view");
      if (v !== state.view) navTo({ view: v });
    });
  }

  function flash(msg) {
    $("banner").innerHTML = '<div class="cmp-banner">' + P.esc(msg) + "</div>";
  }

  function addCompany(sym) {
    if (symbols.length >= MAX) { flash("Comparing at most " + MAX + " companies — remove one first."); return; }
    if (symbols.map(function (s) { return s.toUpperCase(); }).indexOf(sym.toUpperCase()) !== -1) return;
    navTo({ symbols: symbols.concat([sym]) });
  }

  function removeCompany(raw) {
    navTo({ symbols: symbols.filter(function (s) { return s.toUpperCase() !== raw.toUpperCase(); }) });
  }

  // ---------- load ----------

  function loadCompanies() {
    // One call per company: /metric-periods returns the cik AND the FY years /metrics can compute.
    Promise.all(symbols.map(function (sym) {
      return P.api("/companies/" + encodeURIComponent(sym) + "/metric-periods").then(
        function (mp) {
          var fy = (mp.periods || [])
            .filter(function (p) { return p.period === "FY"; })
            .map(function (p) { return p.year; });
          return { raw: sym, cik: mp.cik, fyYears: fy, error: null };
        },
        function (err) { return { raw: sym, cik: null, fyYears: [], error: err.status || "network" }; }
      );
    })).then(function (companies) {
      state.companies = companies;
      var resolved = companies.filter(function (c) { return !c.error; });
      if (!resolved.length) {
        $("controls").hidden = false;
        $("view").innerHTML = P.states.notFound({
          copy: "None of the requested companies resolved. Check the tickers or CIKs.",
          recovery: [{ label: "Data Explorer ↗", href: "/explorer" }],
        });
        return;
      }
      var years = unionYears(resolved);
      state.years = years;
      if (state.year == null || years.indexOf(state.year) === -1) state.year = defaultYear(resolved, years);
      setMasthead();
      populateYearSelect(years);
      $("controls").hidden = false;
      fetchAndRender();
    });
  }

  function unionYears(resolved) {
    var set = {};
    resolved.forEach(function (c) { c.fyYears.forEach(function (y) { set[y] = 1; }); });
    return Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
  }

  // Newest year present in EVERY resolved company (a fully-filled matrix); else newest overall.
  function defaultYear(resolved, years) {
    for (var i = 0; i < years.length; i++) {
      var y = years[i];
      if (resolved.every(function (c) { return c.fyYears.indexOf(y) !== -1; })) return y;
    }
    return years.length ? years[0] : null;
  }

  function populateYearSelect(years) {
    var sel = $("year-select");
    sel.innerHTML = years.map(function (y) { return '<option value="' + y + '">FY ' + y + "</option>"; }).join("");
    if (state.year) sel.value = state.year;
    sel.onchange = function (e) { navTo({ year: parseInt(e.target.value, 10) }); };
  }

  function fetchAndRender() {
    $("legend").innerHTML = state.view === "trajectories" ? "" : P.statusLegend();
    $("disclosure").innerHTML = P.disclosure(["financials_floor", "not_advice"]);
    $("view").innerHTML = P.states.loading({ title: "Computing metrics for FY " + state.year });
    var year = state.year;
    Promise.all(state.companies.map(function (c) {
      if (c.error) return Promise.resolve({ company: c, byMetric: null, status: c.error });
      return P.api("/companies/" + encodeURIComponent(c.raw) + "/metrics?year=" + year + "&period=FY").then(
        function (res) {
          var by = {};
          (res.metrics || []).forEach(function (m) { by[m.metric] = m; });
          return { company: c, byMetric: by, status: "ok" };
        },
        function (err) { return { company: c, byMetric: null, status: err.status || "network" }; }
      );
    })).then(function (cols) { state.cols = cols; renderView(); });
  }

  // ---------- render ----------

  function renderView() {
    var traj = state.view === "trajectories";
    $("period-control").hidden = traj || !state.years.length;
    $("metric-control").hidden = !traj;
    if (traj) renderTrajectories();
    else renderMatrix(state.cols, state.year);
  }

  function renderMatrix(cols, year) {
    // A column's period_end / as_of come from any metric in it (all share the FY anchor).
    cols.forEach(function (col) {
      col.periodEnd = null; col.asOf = null;
      if (col.byMetric) {
        for (var k in col.byMetric) {
          var mv = col.byMetric[k];
          if (mv.period_end) { col.periodEnd = mv.period_end; col.asOf = mv.as_of; break; }
        }
      }
    });

    renderBanner(cols, year);

    var n = cols.length;
    var head = "<tr><th class=\"cmp-metric\">Metric</th>" +
      cols.map(function (col) { return "<th class=\"amt cmp-col\">" + colHeader(col, year) + "</th>"; }).join("") +
      "</tr>";

    var bodyRows = "";
    CATEGORIES.forEach(function (cat) {
      var rows = cat[1].map(function (key) { return metricRow(key, cols); }).filter(Boolean).join("");
      if (!rows) return;
      bodyRows += '<tr class="cmp-cat"><td colspan="' + (n + 1) + '">' + P.esc(cat[0]) + "</td></tr>" + rows;
    });

    if (!bodyRows) {
      $("view").innerHTML = P.states.empty({
        title: "No comparable metrics",
        copy: "No metric resolved for FY " + year + " across these companies. Try another year.",
      });
      return;
    }

    $("view").innerHTML =
      '<div class="matrix-scroll"><table class="stmt-table"><thead>' + head + "</thead><tbody>" +
      bodyRows + "</tbody></table></div>" +
      '<p class="stmt-caption">Each value is as-reported for that company\'s own fiscal year — ' +
      "compare like periods, not calendar dates. Status flags and formulas per row; full provenance " +
      "on each company\'s page. Descriptive only — no ranking.</p>";

    $("view").querySelectorAll("[data-remove]").forEach(function (el) {
      el.addEventListener("click", function (e) { e.preventDefault(); removeCompany(el.getAttribute("data-remove")); });
    });
  }

  function colHeader(col, year) {
    var c = col.company;
    var removable = symbols.length > 2
      ? ' <a class="cmp-col-remove" href="#" data-remove="' + P.esc(c.raw) + '" title="Remove">×</a>'
      : "";
    var ticker = '<span class="cmp-col-ticker"><a href="/company/' + encodeURIComponent(c.raw) + '">' +
      P.esc(c.raw.toUpperCase()) + "</a>" + removable + "</span>";
    var meta;
    if (col.status === "ok") {
      meta = "CIK " + c.cik +
        (col.periodEnd ? " · FYE " + monthYear(col.periodEnd) : "") +
        (col.asOf ? " · filed " + P.esc(col.asOf) : "");
    } else if (col.status === 404 || col.status === "404") {
      meta = c.cik ? "no FY" + year + " on record" : "unresolved";
    } else {
      meta = "load failed (" + col.status + ")";
    }
    return ticker + '<span class="cmp-col-meta">' + P.esc(meta) + "</span>";
  }

  function metricRow(key, cols) {
    // Find a representative MetricValue (for label + formula + basis) from any column that has it.
    var rep = null;
    for (var i = 0; i < cols.length; i++) {
      if (cols[i].byMetric && cols[i].byMetric[key]) { rep = cols[i].byMetric[key]; break; }
    }
    if (!rep) return ""; // no company reported this metric for the year — drop the row

    var label = '<span class="cmp-metric-name">' + P.esc(rep.label) + "</span>";
    var formula = FORMULAS[key] ? '<span class="cmp-formula">' + P.esc(FORMULAS[key]) + "</span>" : "";
    var basis = '<span class="cmp-basis">' + P.esc(rep.basis) + "</span>";
    var cells = cols.map(function (col) {
      return cell(col.byMetric ? col.byMetric[key] : null);
    }).join("");
    return "<tr><td class=\"cmp-metric\">" + label + formula + basis + "</td>" + cells + "</tr>";
  }

  function cell(mv) {
    if (!mv) return '<td class="amt stmt-amt">—</td>';
    var f = P.fmt.metric(mv);
    var reason = (mv.status !== "ok" && mv.reason)
      ? '<span class="cmp-cell-reason">' + P.esc(mv.reason) + "</span>" : "";
    return '<td class="amt stmt-amt"><span class="cmp-cell-value">' + P.esc(f.text) +
      P.statusChip(mv.status) + "</span>" + reason + "</td>";
  }

  // ---------- trajectories mode ----------

  function renderTrajectories() {
    $("legend").innerHTML = "";
    $("banner").innerHTML = "";
    $("disclosure").innerHTML = P.disclosure(["financials_floor", "not_advice"]);

    // Metric options from the already-fetched matrix data: union of resolved keys in CATEGORIES
    // order, labels straight off the MetricValues (no separate label map to drift).
    var labels = {};
    (state.cols || []).forEach(function (col) {
      if (col.byMetric) Object.keys(col.byMetric).forEach(function (k) { labels[k] = col.byMetric[k].label; });
    });
    var metricKeys = [];
    CATEGORIES.forEach(function (cat) {
      cat[1].forEach(function (k) { if (labels[k] && metricKeys.indexOf(k) === -1) metricKeys.push(k); });
    });
    if (!metricKeys.length) {
      $("view").innerHTML = P.states.empty({ title: "No metrics to chart", copy: "No metric resolved across these companies to plot a trajectory." });
      return;
    }
    if (!state.metric || metricKeys.indexOf(state.metric) === -1) {
      state.metric = metricKeys.indexOf("net_margin") !== -1 ? "net_margin" : metricKeys[0];
    }
    populateMetricSelect(metricKeys, labels);

    var metric = state.metric, label = labels[metric] || metric;
    $("view").innerHTML = P.states.loading({ title: "Loading " + label + " trajectories", note: "" });
    var resolved = state.companies.filter(function (c) { return !c.error; });
    Promise.all(resolved.map(function (c) {
      return P.api("/companies/" + encodeURIComponent(c.raw) + "/metrics/" + encodeURIComponent(metric) + "/history?frequency=annual").then(
        function (hist) { return { label: c.raw.toUpperCase(), points: hist.points || [], unit: hist.unit }; },
        function () { return null; }
      );
    })).then(function (raw) {
      var seriesList = raw.filter(Boolean).filter(function (s) { return s.points.length; });
      if (!seriesList.length) {
        $("view").innerHTML = P.states.empty({ title: "No history", copy: "No annual history is on record for " + P.esc(label) + " across these companies." });
        return;
      }
      var omitted = resolved.length - seriesList.length;
      var note = '<p class="stmt-caption">Annual trajectories overlaid on a shared calendar axis — ' +
        "each company's fiscal-year-ends fall where they land in calendar time, so lines stay " +
        "comparable across different fiscal calendars (R10). Gaps break a line honestly (no " +
        "interpolation). Descriptive only — no ranking." +
        (omitted > 0 ? " " + omitted + " company(ies) omitted (no history)." : "") + "</p>";
      $("view").innerHTML = P.trajectoryChart(seriesList, { unit: seriesList[0].unit, metric: metric }) + note;
    });
  }

  function populateMetricSelect(keys, labels) {
    var sel = $("metric-select");
    sel.innerHTML = keys.map(function (k) { return '<option value="' + P.esc(k) + '">' + P.esc(labels[k] || k) + "</option>"; }).join("");
    if (state.metric) sel.value = state.metric;
    sel.onchange = function (e) { navTo({ metric: e.target.value }); };
  }

  function renderBanner(cols, year) {
    var months = {};
    cols.forEach(function (col) { if (col.status === "ok" && col.periodEnd) months[monthOf(col.periodEnd)] = 1; });
    if (Object.keys(months).length > 1) {
      $("banner").innerHTML = '<div class="cmp-banner">Fiscal calendars differ across these companies — ' +
        "each FY" + year + " column ends in a different month (shown per column). Values are as-of each " +
        "company's own filing, not a shared calendar date.</div>";
    } else {
      $("banner").innerHTML = "";
    }
  }

  init();
})();
