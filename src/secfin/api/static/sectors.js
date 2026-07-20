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

  var state = {
    data: null, // the /v1/sectors payload
    sortCol: "roe",
    sortDir: "desc",
    expanded: params.get("group") || null,
    range: normalizeRange(params.get("range")) || "5y",
    series: {}, // group -> SectorSeries payload (lazy)
  };

  function normalizeRange(r) {
    return r === "1y" || r === "5y" || r === "all" ? r : null;
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
