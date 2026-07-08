/* Profin shared front-end module for DATA pages (window.Profin).
 *
 * Vanilla, no build step (same as script.js/explorer.js) -- exposes reusable shell + component
 * builders and API helpers so every data page (Company Fundamentals, Comparison, ownership,
 * ...) renders the same paper, the same status vocabulary (STYLE_GUIDE §7), and the same
 * provenance/honesty affordances (§8/§9) without copy-pasting markup.
 *
 * Builders return HTML strings; callers insert them and (for interactive bits) call the
 * matching wire* helper. Formatting is display-only and NEVER invents precision: a metric with
 * status na/nm renders its token, not a number (§9).
 */
(function () {
  "use strict";

  var API_BASE = "/v1";

  // ---------- API ----------

  function api(path) {
    return fetch(API_BASE + path).then(function (res) {
      if (!res.ok) {
        var err = new Error("HTTP " + res.status);
        err.status = res.status;
        return res
          .json()
          .catch(function () { return {}; })
          .then(function (body) { err.detail = body && body.detail; throw err; });
      }
      return res.json();
    });
  }

  // Resolve a ticker-or-CIK to its CIK via a cheap existing endpoint (/periods returns cik).
  function resolveSymbol(symbol) {
    return api("/companies/" + encodeURIComponent(symbol) + "/periods");
  }

  // ---------- text / escaping ----------

  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- formatting (display only) ----------

  var MINUS = "−"; // U+2212 minus glyph for deltas (§2)

  // Ratios reported as us "ratio" split by convention into percentages vs multiples. This is a
  // DISPLAY-ONLY hint keyed by metric name (same spirit as explorer.js's EMPH map) -- the API
  // just returns unit="ratio" for both; it does not duplicate any server logic.
  var PERCENT_METRICS = {
    gross_margin: 1, operating_margin: 1, net_margin: 1, roa: 1, roe: 1, roic: 1,
    revenue_growth_yoy: 1, earnings_growth_yoy: 1, ocf_growth_yoy: 1, growth_acceleration: 1,
    fcf_margin: 1, accruals: 1,
  };

  function pct(v) {
    var s = (Math.abs(v) * 100).toFixed(1) + "%";
    return v < 0 ? MINUS + s : s;
  }
  function mult(v) { return v.toFixed(2) + "×"; } // 0.87×
  function usd(v) {
    var neg = v < 0, a = Math.abs(v), s;
    if (a >= 1e12) s = (a / 1e12).toFixed(2) + "T";
    else if (a >= 1e9) s = (a / 1e9).toFixed(1) + "B";
    else if (a >= 1e6) s = (a / 1e6).toFixed(1) + "M";
    else if (a >= 1e3) s = (a / 1e3).toFixed(1) + "K";
    else s = a.toFixed(0);
    return neg ? "($" + s + ")" : "$" + s; // accounting parentheses (§2)
  }
  function shares(v) {
    var a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return String(v);
  }
  function perShare(v) { return (v < 0 ? "(" + MINUS + "$" : "$") + Math.abs(v).toFixed(2) + (v < 0 ? ")" : ""); }
  function days(v) { return v.toFixed(0) + " days"; }

  // Format a MetricValue -> { text, drained }. drained=true for na/nm (rendered in token grey).
  function fmtMetric(mv) {
    if (mv.status === "na") return { text: "N/A", drained: true };
    if (mv.status === "nm") return { text: "N/M", drained: true };
    if (mv.value === null || mv.value === undefined) return { text: "—", drained: true };
    var v = mv.value, u = mv.unit, out;
    if (u === "ratio") out = PERCENT_METRICS[mv.metric] ? pct(v) : mult(v);
    else if (u === "USD") out = usd(v);
    else if (u === "USD/shares") out = perShare(v);
    else if (u === "shares") out = shares(v);
    else if (u === "days") out = days(v);
    else out = String(v);
    return { text: out, drained: false };
  }

  var fmt = { pct: pct, mult: mult, usd: usd, shares: shares, perShare: perShare, days: days, metric: fmtMetric };

  // ---------- status vocabulary (§7) ----------

  var STATUS = {
    ok: { glyph: "●", label: "OK", cls: "chip-ok", desc: "Trustworthy value" },
    approximate: { glyph: "≈", label: "APPROX", cls: "chip-approx", desc: "Shown, but flagged imprecise" },
    na: { glyph: "∅", label: "N/A", cls: "chip-na", desc: "Not applicable to this company" },
    nm: { glyph: "~", label: "N/M", cls: "chip-nm", desc: "Computable but would mislead" },
  };

  function statusChip(status) {
    var s = STATUS[status] || STATUS.ok;
    return (
      '<span class="chip ' + s.cls + '"><span class="glyph">' + s.glyph + "</span>" + s.label + "</span>"
    );
  }

  function statusLegend() {
    var items = ["ok", "approximate", "na", "nm"]
      .map(function (k) {
        return '<span class="legend-item">' + statusChip(k) + '<span class="desc">' + esc(STATUS[k].desc) + "</span></span>";
      })
      .join("");
    return '<div class="legend">' + items + "</div>";
  }

  // ---------- shell (§5) ----------

  function masthead(opts) {
    opts = opts || {};
    var meta = opts.meta;
    var metaHtml = "";
    if (meta) {
      var lines = Array.isArray(meta) ? meta : [meta];
      metaHtml = '<div class="masthead-meta">' + lines.map(esc).join("<br>") + "</div>";
    }
    var lede = opts.lede ? '<p class="lede">' + esc(opts.lede) + "</p>" : "";
    return (
      '<header class="masthead">' +
      '<div class="masthead-top"><div>' +
      '<div class="eyebrow">' + esc(opts.eyebrow || "Profin — SEC data, normalized") + "</div>" +
      "<h1>" + esc(opts.title || "") + "</h1></div>" +
      metaHtml +
      "</div>" +
      '<div class="rule-double"></div>' +
      lede +
      "</header>"
    );
  }

  function footer() {
    return (
      '<footer class="app-footer">' +
      '<a href="/explorer">Data Explorer ↗</a>' +
      '<a href="/coverage">Data coverage ↗</a>' +
      '<a href="/docs">API reference ↗</a>' +
      '<span class="tagline">Profin · public SEC data, cleaned &amp; queryable</span>' +
      "</footer>"
    );
  }

  function sectionHead(n, title) {
    return '<div class="section-head"><span class="n">' + esc(n) + '</span><h2>' + esc(title) + "</h2></div>";
  }

  // ---------- provenance (§8) ----------

  // rows: array of [label, valueHtml]. Closed by default; opens in place.
  function provenance(rows) {
    var body = rows
      .filter(function (r) { return r[1] !== null && r[1] !== undefined && r[1] !== ""; })
      .map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + r[1] + "</dd>"; })
      .join("");
    return (
      '<details class="provenance"><summary>Show your work</summary>' +
      '<dl class="provenance-body">' + body + "</dl></details>"
    );
  }

  // ---------- sparkline (§6) ----------

  // points: ordered [{value, status}] (a metric's intra-year quarters). Draws a self-scaling
  // polyline over the numeric points, breaking at na/nm gaps (never interpolating across them),
  // with the last point dotted. Returns "" when there aren't >=2 numeric points (no fake trend).
  function sparkline(points) {
    var W = 108, H = 26, PAD = 3;
    var n = points.length;
    var vals = points.map(function (p) {
      return p && p.value !== null && p.value !== undefined && p.status !== "na" && p.status !== "nm"
        ? p.value
        : null;
    });
    var present = vals.filter(function (v) { return v !== null; });
    if (present.length < 2) return "";
    var min = Math.min.apply(null, present), max = Math.max.apply(null, present);
    var span = max - min || 1;
    var xat = function (i) { return PAD + (n <= 1 ? 0 : (i * (W - 2 * PAD)) / (n - 1)); };
    var yat = function (v) { return H - PAD - ((v - min) / span) * (H - 2 * PAD); };
    var segs = [], cur = [], lastI = -1;
    vals.forEach(function (v, i) {
      if (v === null) { if (cur.length) segs.push(cur); cur = []; return; }
      cur.push(xat(i).toFixed(1) + "," + yat(v).toFixed(1));
      lastI = i;
    });
    if (cur.length) segs.push(cur);
    var polys = segs
      .filter(function (s) { return s.length >= 2; })
      .map(function (s) { return '<polyline points="' + s.join(" ") + '"/>'; })
      .join("");
    var dot = lastI >= 0 ? '<circle cx="' + xat(lastI).toFixed(1) + '" cy="' + yat(vals[lastI]).toFixed(1) + '" r="2"/>' : "";
    return (
      '<svg class="spark" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H +
      '" preserveAspectRatio="none" aria-hidden="true">' + polys + dot + "</svg>"
    );
  }

  // ---------- metric card (§6) ----------

  // mv = MetricValue; opts.formula = plain-language formula string (optional).
  function metricCard(mv, opts) {
    opts = opts || {};
    var f = fmtMetric(mv);
    var isNa = mv.status === "na";
    var valueCls = "metric-value" + (f.drained ? " drained" : "");
    var note = "";
    if (mv.status === "approximate" && mv.reason) {
      note = '<div class="metric-note">' + esc(mv.reason) + "</div>";
    }
    var prov = provenance([
      ["Formula", opts.formula ? esc(opts.formula) : ""],
      ["Basis", esc(mv.basis === "TTM" ? "Trailing twelve months (TTM)" : "As-of period end")],
      ["Restatement", esc(mv.restatement_basis)],
      ["As of", esc(mv.as_of)],
      [mv.status === "ok" ? "" : "Why " + (STATUS[mv.status] || {}).label, mv.reason ? esc(mv.reason) : ""],
    ]);
    // FY cards carry an intra-year quarterly trend; render a sparkline when it has enough points.
    var spark = "";
    if (mv.trend && mv.trend.length) {
      var svg = sparkline(mv.trend);
      if (svg) {
        var lbl = mv.basis === "TTM" ? "TTM by quarter" : "by quarter-end";
        spark = '<div class="spark-wrap">' + svg + '<span class="spark-label">' + esc(lbl) + "</span></div>";
      }
    }
    return (
      '<article class="metric-card' + (isNa ? " na" : "") + '">' +
      '<div class="metric-head"><span class="metric-name">' + esc(mv.label) + "</span>" + statusChip(mv.status) + "</div>" +
      '<div class="' + valueCls + '">' + esc(f.text) + "</div>" +
      '<div class="metric-basis">' + esc(mv.basis) + "</div>" +
      spark +
      note +
      prov +
      "</article>"
    );
  }

  // ---------- disclosure (§9) ----------

  // Reusable coverage/honesty copy, pulled to match docs/DATA_MODEL.md so page and data agree.
  var DISCLOSURES = {
    financials_floor:
      "Financials (XBRL) begin at a company's first XBRL filing (SEC required it from ~2009, " +
      "phased through ~2012) — there is no earlier fundamentals history by design; an empty " +
      "result means outside our coverage window, not that nothing was filed.",
    ownership_13dg_floor:
      "Beneficial ownership (13D/13G) is parsed only from the SEC's modern structured-XML filings " +
      "(~mid-2025 onward); pre-transition filings are legacy HTML/text and out of scope.",
    institutional_13f:
      "13F is a quarter-end holdings snapshot of long positions in 13(f) securities only (no " +
      "shorts/cash/non-US), filed with a ~45-day lag. Any buy/sell is DERIVED by diffing quarters, " +
      "never reported trade data.",
    not_advice: "Public SEC data, cleaned & queryable. As-of the latest filing, not real-time. Nothing here is investment advice.",
  };

  function disclosure(keys, opts) {
    opts = opts || {};
    var items = (keys || [])
      .map(function (k) { return "<li>" + esc(DISCLOSURES[k] || k) + "</li>"; })
      .join("");
    return (
      '<details class="disclosure"' + (opts.open ? " open" : "") + ">" +
      "<summary>" + esc(opts.title || "Data notes & coverage") + "</summary>" +
      "<ul>" + items + "</ul></details>"
    );
  }

  // ---------- shared states (§6) ----------

  var states = {
    loading: function (opts) {
      opts = opts || {};
      return (
        '<div class="state state-loading">' +
        '<div class="state-title"><span class="dot"></span>' + esc(opts.title || "Loading") + "</div>" +
        '<div class="shimmer" style="width:70%"></div><div class="shimmer" style="width:52%"></div><div class="shimmer" style="width:61%"></div>' +
        '<div class="cold-note">' + esc(opts.note || "Cold requests may fetch from SEC live and take a moment.") + "</div>" +
        "</div>"
      );
    },
    empty: function (opts) {
      opts = opts || {};
      return (
        '<div class="state">' +
        '<div class="state-title">' + esc(opts.title || "Nothing to show") + "</div>" +
        '<div class="state-copy">' + esc(opts.copy || "A filing is on record, but no mapped fields for this view.") + "</div>" +
        "</div>"
      );
    },
    notFound: function (opts) {
      opts = opts || {};
      var chips = (opts.recovery || [])
        .map(function (c) { return '<a class="btn-inverse" href="' + esc(c.href) + '">' + esc(c.label) + "</a>"; })
        .join("");
      return (
        '<div class="state">' +
        '<div class="state-title err"><span class="http-code">HTTP 404</span></div>' +
        '<div class="state-copy">' + esc(opts.copy || "We don't carry that.") + "</div>" +
        (chips ? '<div class="recovery-chips">' + chips + "</div>" : "") +
        "</div>"
      );
    },
    error: function (opts) {
      opts = opts || {};
      return (
        '<div class="state">' +
        '<div class="state-title err">' + esc(opts.title || "Something went wrong") + "</div>" +
        '<div class="state-copy">' + esc(opts.copy || "Please try again.") + "</div>" +
        "</div>"
      );
    },
  };

  // ---------- global search / ticker resolver (§6) ----------

  // Renders a search form into `el`. On submit, resolves the symbol and calls callbacks.
  // Phase 1 will pass onResolved to navigate to the company hub; until then callers handle it.
  function mountSearch(el, cbs) {
    cbs = cbs || {};
    el.innerHTML =
      '<form class="searchbar"><input type="text" name="q" placeholder="Ticker or CIK, e.g. AAPL" ' +
      'autocomplete="off" spellcheck="false"><button type="submit" class="btn-inverse">Look up</button></form>';
    var form = el.querySelector("form");
    var input = el.querySelector("input");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var symbol = input.value.trim();
      if (!symbol) return;
      if (cbs.onStart) cbs.onStart(symbol);
      resolveSymbol(symbol).then(
        function (data) { if (cbs.onResolved) cbs.onResolved(symbol, data); },
        function (err) {
          if (err.status === 404 && cbs.onNotFound) cbs.onNotFound(symbol, err);
          else if (cbs.onError) cbs.onError(symbol, err);
        }
      );
    });
    return { input: input, form: form };
  }

  window.Profin = {
    api: api,
    resolveSymbol: resolveSymbol,
    esc: esc,
    fmt: fmt,
    STATUS: STATUS,
    DISCLOSURES: DISCLOSURES,
    statusChip: statusChip,
    statusLegend: statusLegend,
    sparkline: sparkline,
    masthead: masthead,
    footer: footer,
    sectionHead: sectionHead,
    provenance: provenance,
    metricCard: metricCard,
    disclosure: disclosure,
    states: states,
    mountSearch: mountSearch,
  };
})();
