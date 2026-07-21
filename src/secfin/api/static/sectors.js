/* Sector performance overview — /sectors. A sector-first entry point over the Sector Analytics
 * endpoints:
 *   GET /v1/sectors            → every qualifying SIC-2 sector's asset-weighted DuPont aggregate
 *   GET /v1/sectors/{group}    → one sector's FY aggregate series (the trend)
 *
 * Built from the shared ClearyFi components. The numbers are ASSET-WEIGHTED SECTOR AGGREGATES
 * (ΣNI/ΣRev × ΣRev/ΣAssets × ΣAssets/ΣEquity), NOT medians — the always-present `caveats` and the
 * `aggregation` label are rendered verbatim. Descriptive only: no good/bad coloring, no "winner",
 * no alpha/price/timing claim. A missing value is never drawn as 0.
 */
(function () {
  "use strict";
  var P = window.ClearyFi;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);

  // Columns: [key, label, kind]. `kind` picks the formatter + sort comparator.
  var COLS = [
    ["group_label", "Sector", "text"],
    ["peer_count", "Companies", "int"],
    ["roe", "ROE", "pct"],
    ["net_margin", "Net margin", "pct"],
    ["asset_turnover", "Asset turnover", "mult"],
    ["equity_multiplier", "Equity multiplier", "mult"],
  ];

  // Metrics offered as box-and-whisker SPREADS, grouped for the selector. Two families: the
  // profitability/efficiency ratios are populated across most sectors today; the liquidity/solvency
  // ratios depend on granular balance-sheet concepts still sparsely ingested, so they often show an
  // honest empty state and fill in as coverage improves. Matches api/routes.py `_SPREAD_METRICS`.
  var SPREAD_GROUPS = [
    ["Profitability & efficiency", [
      ["net_margin", "Net margin"], ["roe", "ROE"], ["roa", "ROA"],
      ["asset_turnover", "Asset turnover"], ["revenue_growth_yoy", "Revenue growth"],
      ["earnings_growth_yoy", "Earnings growth"],
    ]],
    ["Liquidity & solvency", [
      ["current_ratio", "Current ratio"], ["quick_ratio", "Quick ratio"],
      ["debt_to_equity", "Debt / equity"], ["interest_coverage", "Interest coverage"],
    ]],
  ];
  var SPREAD_METRICS = SPREAD_GROUPS.reduce(function (acc, g) {
    return acc.concat(g[1].map(function (m) { return m[0]; }));
  }, []);

  var state = {
    data: null, // the /v1/sectors payload
    sortCol: "roe",
    sortDir: "desc",
    expanded: params.get("group") || null,
    range: normalizeRange(params.get("range")) || "5y",
    series: {}, // group -> SectorSeries payload (lazy)
    spreadMetric: normalizeMetric(params.get("metric")) || "net_margin",
    spreads: {}, // metric -> SectorSpreadList payload (lazy)
    groupSpreads: {}, // group -> SectorSpreadProfile payload (lazy)
    lifecycle: {}, // group -> SectorLifecycleSeries payload (lazy)
  };

  function normalizeRange(r) {
    return r === "1y" || r === "5y" || r === "all" ? r : null;
  }

  function normalizeMetric(m) {
    return SPREAD_METRICS.indexOf(m) !== -1 ? m : null;
  }

  function fmtCell(kind, v) {
    if (v === null || v === undefined) return "—"; // never 0 for a missing value
    if (kind === "pct") return P.fmt.pct(v);
    if (kind === "mult") return P.fmt.mult(v);
    if (kind === "int") return String(v);
    return P.esc(String(v));
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
        "Return on equity, decomposed, across every SIC-2 industry that meets the minimum size — " +
        "each an asset-weighted aggregate you can open into its DuPont drivers and history.",
      meta: ["Fiscal year " + d.fiscal_year, d.peer_basis + " · " + d.sectors.length + " sectors"],
    });
    $("aggregation").innerHTML = aggregationBlock(d);
    renderGrid();
    renderSpreads();
    maybeAutoExpand();
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

  // ---------- overview grid ----------

  function sortedSectors() {
    var rows = (state.data.sectors || []).slice();
    var col = state.sortCol, dir = state.sortDir === "asc" ? 1 : -1;
    rows.sort(function (a, b) {
      var x = a[col], y = b[col];
      if (typeof x === "string") return dir * x.localeCompare(y);
      return dir * ((x || 0) - (y || 0));
    });
    return rows;
  }

  function renderGrid() {
    if (!state.data.sectors || !state.data.sectors.length) {
      $("view").innerHTML = P.states.empty({
        title: "No sectors to show",
        copy: "No SIC group met the minimum size for this period, or the sector aggregates aren't materialized yet.",
      });
      return;
    }
    var head = COLS.map(function (c) {
      var active = c[0] === state.sortCol;
      var arrow = active ? (state.sortDir === "asc" ? " ▲" : " ▼") : "";
      var aligned = c[2] === "text" ? "" : " num";
      return (
        '<th class="' + aligned.trim() + (active ? " sorted" : "") + '">' +
        '<button class="th-sort" data-col="' + c[0] + '">' + P.esc(c[1]) + P.esc(arrow) + "</button></th>"
      );
    }).join("");

    var body = sortedSectors().map(function (s) {
      var cells = COLS.map(function (c) {
        var cls = c[2] === "text" ? "sector-name" : "num mono";
        return '<td class="' + cls + '">' + fmtCell(c[2], s[c[0]]) + "</td>";
      }).join("");
      var open = state.expanded === s.group;
      var rowHtml =
        '<tr class="sector-row' + (open ? " open" : "") + '" data-group="' + P.esc(s.group) + '" tabindex="0" role="button" aria-expanded="' + open + '">' +
        cells +
        "</tr>";
      var detailHtml = open
        ? '<tr class="sector-detail"><td colspan="' + COLS.length + '"><div class="detail-mount" id="detail-' + P.esc(s.group) + '"></div></td></tr>'
        : "";
      return rowHtml + detailHtml;
    }).join("");

    $("view").innerHTML =
      '<div class="sector-table-wrap"><table class="sector-table"><thead><tr>' +
      head +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table></div>";

    wireGrid();
    if (state.expanded) renderDetail(state.expanded);
  }

  function wireGrid() {
    $("view").querySelectorAll(".th-sort").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var col = btn.getAttribute("data-col");
        if (state.sortCol === col) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortCol = col;
          state.sortDir = col === "group_label" ? "asc" : "desc";
        }
        renderGrid();
      });
    });
    $("view").querySelectorAll(".sector-row").forEach(function (row) {
      function toggle() {
        var g = row.getAttribute("data-group");
        state.expanded = state.expanded === g ? null : g;
        renderGrid();
      }
      row.addEventListener("click", toggle);
      row.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      });
    });
  }

  // ---------- per-sector detail: DuPont tree + trend ----------

  function renderDetail(group) {
    var mount = $("detail-" + group);
    if (!mount) return;
    if (state.series[group]) { paintDetail(mount, state.series[group]); return; }
    mount.innerHTML = P.states.loading({ title: "Loading sector detail", note: "" });
    P.api("/sectors/" + encodeURIComponent(group))
      .then(function (res) { state.series[group] = res; if (state.expanded === group) paintDetail(mount, res); })
      .catch(function () { mount.innerHTML = P.states.error({ copy: "Couldn't load this sector's detail." }); });
  }

  function paintDetail(mount, series) {
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
    // a zero box. Loads lazily; on failure it just skips (an enhancement, never breaks the detail).
    var spreadMount = document.createElement("div");
    spreadMount.className = "detail-spreads";
    mount.appendChild(spreadMount);
    paintDetailSpreads(spreadMount, series.group);

    // Asset-lifecycle trend: DIO/DSO/DPO and their synthesis CCC over the FY series. Loads lazily;
    // on failure it just skips (an enhancement, never breaks the detail).
    var lifecycleMount = document.createElement("div");
    lifecycleMount.className = "detail-lifecycle";
    mount.appendChild(lifecycleMount);
    paintLifecycle(lifecycleMount, series.group);
  }

  // ---------- per-sector detail: asset-lifecycle trend (DIO/DSO/DPO/CCC) ----------

  function paintLifecycle(mount, group) {
    if (state.lifecycle[group]) { drawLifecycle(mount, state.lifecycle[group]); return; }
    mount.innerHTML = P.states.loading({ title: "Loading lifecycle", note: "" });
    P.api("/sectors/" + encodeURIComponent(group) + "/lifecycle")
      .then(function (res) { state.lifecycle[group] = res; drawLifecycle(mount, res); })
      .catch(function () { mount.innerHTML = ""; }); // skip silently — the rest of the detail stands
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

  // ---------- cross-sector spreads: a box per SIC sector for one metric ----------

  function renderSpreads() {
    var mount = $("spreads");
    mount.innerHTML =
      '<div class="spread-head">' +
      '<h2 class="spread-title">Spread within each sector</h2>' +
      '<p class="spread-lede">How dispersed one metric is across the companies inside each SIC-2 ' +
      "sector: the box spans the middle half (p25–p75), the line marks the median, the whiskers " +
      "reach the full min–max. A wider box means the peers are more dispersed — not a better or " +
      "worse sector." +
      "</p>" +
      "</div>" +
      '<div class="spread-picker" id="spread-picker"></div>' +
      '<div class="spread-chart" id="spread-chart"></div>' +
      '<div id="spread-caveats"></div>';
    renderPicker();
    wirePicker();
    paintSpread();
  }

  function renderPicker() {
    var html = SPREAD_GROUPS.map(function (grp) {
      var buttons = grp[1].map(function (m) {
        var on = state.spreadMetric === m[0] ? ' class="on"' : "";
        return '<button data-metric="' + P.esc(m[0]) + '"' + on + ">" + P.esc(m[1]) + "</button>";
      }).join("");
      return (
        '<div class="spread-group"><span class="spread-group-label">' + P.esc(grp[0]) + "</span>" +
        '<div class="segmented spread-seg">' + buttons + "</div></div>"
      );
    }).join("");
    $("spread-picker").innerHTML = html;
  }

  function wirePicker() {
    $("spread-picker").querySelectorAll(".spread-seg button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.spreadMetric = btn.getAttribute("data-metric");
        $("spread-picker").querySelectorAll(".spread-seg button").forEach(function (b) { b.classList.remove("on"); });
        btn.classList.add("on");
        paintSpread();
      });
    });
  }

  function paintSpread() {
    var metric = state.spreadMetric;
    var chart = $("spread-chart");
    if (state.spreads[metric]) { drawSpread(chart, state.spreads[metric]); return; }
    chart.innerHTML = P.states.loading({ title: "Loading spread", note: "" });
    P.api("/sectors/spreads?metric=" + encodeURIComponent(metric) + "&year=" + state.data.fiscal_year)
      .then(function (res) { state.spreads[metric] = res; if (state.spreadMetric === metric) drawSpread(chart, res); })
      .catch(function (err) { chart.innerHTML = P.states.error({ copy: "Couldn't load the spread (" + (err.status || "network") + ")." }); });
  }

  function drawSpread(chart, res) {
    $("spread-caveats").innerHTML = spreadCaveatsBlock(res);
    chart.innerHTML = "";
    var boxes = (res.spreads || []).map(function (s) {
      return { label: s.group_label, peer_count: s.peer_count, min: s.min, p25: s.p25, median: s.median, p75: s.p75, max: s.max };
    });
    if (!boxes.length) {
      chart.innerHTML = P.states.empty({
        title: "No sector spread to show yet",
        copy: "No SIC sector has enough companies reporting " + res.label + " for fiscal year " +
          res.fiscal_year + " to plot a spread. This fills in as more filings are ingested — it is not zero.",
      });
      return;
    }
    var width = P.measuredWidth(chart, 720);
    chart.appendChild(P.boxWhiskerChart(boxes, {
      width: width,
      height: Math.max(120, boxes.length * 22 + 40),
      title: res.label + " · FY" + res.fiscal_year,
      metric: res.metric,
      unit: res.unit,
      caption:
        "Each box is one SIC-2 sector’s spread across its companies (min · p25 · median · p75 · max), " +
        "ordered by median — descriptive, not a ranking of quality. N/A companies are excluded, never counted as zero.",
    }));
  }

  function spreadCaveatsBlock(res) {
    var caveats = (res.caveats || []).map(function (c) { return "<li>" + P.esc(c) + "</li>"; }).join("");
    if (!caveats) return "";
    return (
      '<details class="disclosure spread-caveats"><summary>How to read these spreads (' +
      (res.caveats || []).length + " notes)</summary><ul>" + caveats + "</ul></details>"
    );
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
        paintTrend(chartWrap, pts);
      });
    });
  }

  function maybeAutoExpand() {
    // ?group=<2-digit> auto-opens a sector (used by the e2e render check). Scroll it into view.
    if (state.expanded) {
      var row = $("view").querySelector('.sector-row[data-group="' + state.expanded + '"]');
      if (row) row.scrollIntoView({ block: "center" });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
