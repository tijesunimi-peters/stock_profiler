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
  var KEY_STORAGE = "profin_api_key";

  // ---------- API key (gated endpoints; public ones work without one) ----------

  function getKey() {
    try { return localStorage.getItem(KEY_STORAGE) || ""; } catch (e) { return ""; }
  }
  function setKey(k) {
    try { localStorage.setItem(KEY_STORAGE, (k || "").trim()); } catch (e) { /* ignore */ }
  }
  function clearKey() {
    try { localStorage.removeItem(KEY_STORAGE); } catch (e) { /* ignore */ }
  }

  // ---------- API ----------

  function api(path) {
    var headers = {};
    var key = getKey();
    if (key) headers["X-API-Key"] = key; // sent only when set; public endpoints ignore it
    return fetch(API_BASE + path, { headers: headers }).then(function (res) {
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
      '<a href="/methodology">Methodology ↗</a>' +
      '<a href="/disclaimer">Data, not investment advice ↗</a>' +
      '<a href="https://github.com/clearyfi/support/issues">Support ↗</a>' +
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

  // ---------- trend chart (Phase 1b: fuller multi-period history + Tier-2 signals) ----------

  // Format a value by its unit family (shared by the y-axis and the signal rows). metricKey
  // lets a "ratio" render as a percentage vs a multiple, same rule as fmtMetric/PERCENT_METRICS.
  function unitFmt(v, unit, metricKey) {
    if (v === null || v === undefined) return "—";
    if (unit === "ratio") return metricKey && PERCENT_METRICS[metricKey] ? pct(v) : (metricKey ? mult(v) : pct(v));
    if (unit === "USD") return usd(v);
    if (unit === "USD/shares") return perShare(v);
    if (unit === "shares") return shares(v);
    if (unit === "days") return days(v);
    if (unit === "count") return String(Math.round(v));
    return String(v);
  }

  function trendSignalRow(s) {
    var valTxt = s.status === "na" ? "N/A" : s.status === "nm" ? "N/M" : unitFmt(s.value, s.unit);
    var chip = s.status === "ok" ? "" : statusChip(s.status);
    return (
      '<div class="trend-signal">' +
      '<span class="trend-signal-label">' + esc(s.label) + "</span>" +
      '<span class="trend-signal-value">' + esc(valTxt) + "</span>" + chip +
      '<span class="trend-signal-reason">' + esc(s.reason || "") + "</span>" +
      "</div>"
    );
  }

  // history = MetricHistory {points:[{period_end,value,status}], signals:[TrendSignal], unit,
  // metric, restatement_basis, frequency}. Draws a self-scaling line over the numeric points,
  // breaking at na/nm gaps (never interpolating), with min/max y labels, first/last period-year
  // x labels, an as-restated/frequency caption + gap note, and the Tier-2 signal annotations.
  function trendChart(history) {
    var pts = history.points || [];
    var W = 320, H = 90, PADX = 4, PADT = 8, PADB = 8;
    var vals = pts.map(function (p) {
      return p && p.value !== null && p.value !== undefined && p.status !== "na" && p.status !== "nm"
        ? p.value
        : null;
    });
    var present = vals.filter(function (v) { return v !== null; });
    var hasGap = vals.some(function (v) { return v === null; });
    var body;
    if (present.length < 2) {
      body = '<div class="trend-empty">Not enough history to chart (need at least two comparable periods).</div>';
    } else {
      var min = Math.min.apply(null, present), max = Math.max.apply(null, present);
      var span = max - min || 1;
      var n = vals.length;
      var xat = function (i) { return PADX + (n <= 1 ? 0 : (i * (W - 2 * PADX)) / (n - 1)); };
      var yat = function (v) { return PADT + (1 - (v - min) / span) * (H - PADT - PADB); };
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
      var dot = lastI >= 0
        ? '<circle cx="' + xat(lastI).toFixed(1) + '" cy="' + yat(vals[lastI]).toFixed(1) + '" r="2.5"/>'
        : "";
      var yr = function (p) { return p && p.period_end ? p.period_end.slice(0, 4) : ""; };
      body =
        '<div class="trend-plot">' +
        '<div class="trend-yaxis"><span>' + esc(unitFmt(max, history.unit, history.metric)) +
        "</span><span>" + esc(unitFmt(min, history.unit, history.metric)) + "</span></div>" +
        '<svg class="trend-svg" viewBox="0 0 ' + W + " " + H +
        '" preserveAspectRatio="none" aria-hidden="true">' + polys + dot + "</svg>" +
        "</div>" +
        '<div class="trend-xaxis"><span>' + esc(yr(pts[0])) + "</span><span>" +
        esc(yr(pts[pts.length - 1])) + "</span></div>";
    }
    var restated = history.restatement_basis === "as-restated" ? "As-restated" : esc(history.restatement_basis);
    var caption = restated + " · " + esc(history.frequency || "") +
      (hasGap ? " · gaps = N/A or N/M periods (not interpolated)" : "");
    var signals = (history.signals || []).map(trendSignalRow).join("");
    return (
      '<div class="trend-chart">' + body +
      '<div class="trend-caption">' + caption + "</div>" +
      (signals ? '<div class="trend-signals">' + signals + "</div>" : "") +
      "</div>"
    );
  }

  // ---------- trajectory overlay (Phase 3: 2–3 companies' series on one calendar axis) ----------

  // One terracotta accent only (STYLE_GUIDE §10) -- series are told apart by dash pattern +
  // the HTML legend, never a second hue. solid / dashed / dotted.
  var TRAJ_DASH = ["", "5,3", "1.5,3"];

  function trajUsable(p) {
    return p && p.value !== null && p.value !== undefined && p.status !== "na" && p.status !== "nm" && p.period_end;
  }

  // seriesList: [{label, points:[{period_end,value,status}]}]. opts: {unit, metric}. Overlays
  // each company's line on ONE calendar axis (x = actual period_end date, so different
  // fiscal-year-ends align -- R10), breaking each line at na/nm gaps (never interpolating). No
  // in-SVG text (the chart is stretched via preserveAspectRatio=none, which would distort it) --
  // series identity lives in the HTML legend. Labels/values shown descriptively; no winner.
  function trajectoryChart(seriesList, opts) {
    opts = opts || {};
    var unit = opts.unit, metric = opts.metric;
    var W = 640, H = 200, PADX = 4, PADT = 10, PADB = 10;
    var series = (seriesList || []).map(function (s) {
      var ordered = (s.points || [])
        .filter(function (p) { return p && p.period_end; })
        .slice()
        .sort(function (a, b) { return Date.parse(a.period_end) - Date.parse(b.period_end); });
      return { label: s.label, ordered: ordered };
    });
    var allT = [], allV = [];
    series.forEach(function (s) {
      s.ordered.forEach(function (p) { if (trajUsable(p)) { allT.push(Date.parse(p.period_end)); allV.push(p.value); } });
    });
    if (allV.length < 2) {
      return '<div class="trend-empty">Not enough overlapping history to chart these companies.</div>';
    }
    var tMin = Math.min.apply(null, allT), tMax = Math.max.apply(null, allT);
    var vMin = Math.min.apply(null, allV), vMax = Math.max.apply(null, allV);
    var tSpan = tMax - tMin || 1, vSpan = vMax - vMin || 1;
    var xat = function (t) { return PADX + ((t - tMin) / tSpan) * (W - 2 * PADX); };
    var yat = function (v) { return PADT + (1 - (v - vMin) / vSpan) * (H - PADT - PADB); };

    var lines = "", legend = "", hasGap = false;
    series.forEach(function (s, si) {
      var segs = [], cur = [], last = null;
      s.ordered.forEach(function (p) {
        if (!trajUsable(p)) { if (cur.length) { segs.push(cur); cur = []; } hasGap = true; return; }
        cur.push(xat(Date.parse(p.period_end)).toFixed(1) + "," + yat(p.value).toFixed(1));
        last = p;
      });
      if (cur.length) segs.push(cur);
      var dash = TRAJ_DASH[si % TRAJ_DASH.length];
      var da = dash ? ' stroke-dasharray="' + dash + '"' : "";
      lines += segs
        .filter(function (seg) { return seg.length >= 2; })
        .map(function (seg) { return '<polyline points="' + seg.join(" ") + '"' + da + "/>"; })
        .join("");
      if (last) {
        lines += '<circle cx="' + xat(Date.parse(last.period_end)).toFixed(1) + '" cy="' +
          yat(last.value).toFixed(1) + '" r="2.5"/>';
      }
      var latest = last ? unitFmt(last.value, unit, metric) : "—";
      legend +=
        '<span class="traj-legend-item">' +
        '<svg class="traj-swatch" viewBox="0 0 26 8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4"' + da + "/></svg>" +
        '<span class="traj-legend-label">' + esc(s.label) + "</span>" +
        '<span class="traj-legend-val">' + esc(latest) + "</span></span>";
    });
    var yr = function (t) { return isFinite(t) ? new Date(t).getUTCFullYear() : ""; };
    var caption = "As-restated · annual · aligned on calendar quarter-end" +
      (hasGap ? " · gaps = N/A or N/M periods (not interpolated)" : "");
    return (
      '<div class="trend-chart">' +
      '<div class="trend-plot">' +
      '<div class="trend-yaxis"><span>' + esc(unitFmt(vMax, unit, metric)) + "</span><span>" +
      esc(unitFmt(vMin, unit, metric)) + "</span></div>" +
      '<svg class="traj-svg" viewBox="0 0 ' + W + " " + H +
      '" preserveAspectRatio="none" aria-hidden="true">' + lines + "</svg>" +
      "</div>" +
      '<div class="trend-xaxis"><span>' + esc(yr(tMin)) + "</span><span>" + esc(yr(tMax)) + "</span></div>" +
      '<div class="traj-legend">' + legend + "</div>" +
      '<div class="trend-caption">' + caption + "</div>" +
      "</div>"
    );
  }

  // ---------- Plot-backed charts (Phase 5: 13F portfolio composition) ----------
  //
  // Observable Plot is vendored (see manager.html: d3 then plot.umd.min.js, exposing
  // window.Plot) and these are the ONLY functions in the app that call Plot.plot() for this
  // chart family (STYLE_GUIDE §6) -- pages append the returned DOM node, they never touch Plot
  // directly. One terracotta accent -- never a second hue, never green/red, and ranked bars
  // take ONE fill (bar length already encodes the value; darker-where-bigger double-encodes
  // it -- §10). Tokens are read from the live CSS variables at call time with literal
  // fallbacks, same recipe as infographic-template.html's chart block.

  // Width a Plot chart should render at: the mount container's live width, bounded to sane
  // chart proportions, with the caller's fallback when the container isn't measurable yet.
  // Convention: charts are built AFTER their placeholder is in the DOM, so mount sites pass
  // measuredWidth(container, <default>) as opts.width. Measured once at build time --
  // deliberately no resize re-render (no build step, no observers; a reload re-measures).
  function measuredWidth(el, fallback) {
    var w = el && el.clientWidth ? el.clientWidth : 0;
    return w >= 280 ? Math.min(w, 1400) : fallback;
  }

  // Shared card chrome for every Plot builder (STYLE_GUIDE §6): mono eyebrow title, a
  // horizontally-scrollable body the Plot SVG lands in, and honesty caption/note appenders.
  // All three chart families wrap themselves in this -- one visual dialect per page.
  function chartCard(title) {
    var root = document.createElement("div");
    root.className = "plot-chart";
    if (title) {
      var t = document.createElement("div");
      t.className = "plot-chart-title";
      t.textContent = title;
      root.appendChild(t);
    }
    var body = document.createElement("div");
    body.className = "plot-chart-body";
    root.appendChild(body);
    function para(cls, text) {
      var p = document.createElement("p");
      p.className = cls;
      p.textContent = text;
      root.appendChild(p);
      return p;
    }
    return {
      root: root,
      body: body,
      caption: function (text) { return para("plot-chart-caption", text); },
      note: function (text) { return para("plot-chart-note", text); },
    };
  }

  // Built on the single shared token reader `cssVar()` (defined below, hoisted -- this and
  // the diverging-bars/value-line token reads all go through the same primitive now, instead
  // of each Plot-chart family growing its own getComputedStyle lookup).
  function plotTokens() {
    return {
      accent: cssVar("--accent", "#c0703a"),
      accentWash: cssVar("--accent-wash", "#f3e4d5"),
      ink: cssVar("--ink", "#1c1a16"),
      inkSoft: cssVar("--ink-soft", "#6b6459"),
      trackBorder: cssVar("--border-strong", "#d8d1c4"),
      fontMono: "'IBM Plex Mono', monospace",
    };
  }

  // Interpolate between two "#rrggbb" colors at t in [0,1] -- used ONLY to fade the single
  // accent by rank order; never introduces a second hue or a judgment color.
  function mixHex(a, b, t) {
    function rgb(h) {
      h = h.replace("#", "");
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
    }
    var ca = rgb(a), cb = rgb(b);
    var m = ca.map(function (c, i) { return Math.round(c + (cb[i] - c) * t); });
    return "rgb(" + m.join(",") + ")";
  }

  // Builds the part-to-whole strip: one 100%-stacked bar of TOTAL reported value split into
  // ORDERED bands (top-1 / top-2-5 / top-6-10 / other) with a 2px surface gap between them. This
  // is a rank-ORDER grouping (not a free-order category), so an ordinal tint ramp of the single
  // accent is correct here -- kind/order, never darker-where-bigger (STYLE_GUIDE §6). A band's
  // label (name + %) sits directly inside it when there's room; otherwise it moves to the
  // outside legend below (each band also carries a `title` hover tooltip) -- never clipped.
  function compositionStrip(segs, width) {
    var wrap = document.createElement("div");
    wrap.className = "composition-strip";
    var bar = document.createElement("div");
    bar.className = "composition-strip-bar";
    bar.setAttribute("role", "img");
    bar.setAttribute(
      "aria-label",
      "Composition of reported value: " +
        segs.map(function (s) { return s.name + " " + s.pct.toFixed(1) + "%"; }).join(", ")
    );
    var outside = [];
    segs.forEach(function (s) {
      var seg = document.createElement("div");
      seg.className = "composition-strip-seg";
      seg.style.flexBasis = s.pct + "%";
      seg.style.background = s.fill;
      var text = s.name + " · " + s.pct.toFixed(1) + "%";
      seg.title = text;
      // Estimate whether the label fits its own segment's pixel width (we know the chart's
      // total width from opts.width, so no DOM measurement round-trip is needed) -- a rough
      // average glyph width for the 11.5px sans label, plus horizontal padding.
      var segPx = (s.pct / 100) * width;
      var estWidth = text.length * 6.4 + 20;
      if (segPx >= estWidth) {
        var lbl = document.createElement("span");
        lbl.className = "composition-strip-seg-label";
        lbl.textContent = text;
        seg.appendChild(lbl);
      } else {
        outside.push({ text: text, fill: s.fill });
      }
      bar.appendChild(seg);
    });
    wrap.appendChild(bar);
    if (outside.length) {
      var legend = document.createElement("div");
      legend.className = "composition-strip-outside";
      legend.innerHTML = outside
        .map(function (o) {
          return (
            '<span class="composition-strip-outside-item"><i class="composition-strip-swatch" style="background:' +
            o.fill + '"></i>' + esc(o.text) + "</span>"
          );
        })
        .join("");
      wrap.appendChild(legend);
    }
    return wrap;
  }

  // Builds the top-N ranked-bars Plot node. Single accent fill for every bar -- the tint ramp is
  // gone; bar length already encodes the value (STYLE_GUIDE §6). The x-domain is the top-N's OWN
  // max, never the whole book's total, so the tail (carried by the strip above) can't crush the
  // top bars into illegibility. Each bar's %-label is still of TOTAL reported value (not the
  // top-N subset), and a Plot `tip` carries issuer/manager, value, % of reported value, and
  // shares -- labeling PRN (principal) rows so they're never read as a share count.
  // Binary-search-truncate `label` to the longest prefix (+ "…") that fits `maxWidth` px,
  // measured via a 2D canvas context already configured with the target font.
  function truncateToWidth(label, maxWidth, ctx) {
    if (ctx.measureText(label).width <= maxWidth) return label;
    var lo = 0, hi = label.length;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(label.slice(0, mid) + "…").width <= maxWidth) lo = mid; else hi = mid - 1;
    }
    return lo > 0 ? label.slice(0, lo) + "…" : "…";
  }

  function compositionRankedBars(top, o) {
    var t = o.t;
    var tipLabelKey = o.labelField === "manager_name" ? "Manager" : "Issuer";
    var rows = top.map(function (h) {
      var isPrn = h.shares_or_principal === "PRN";
      var row = {
        label: o.rowLabel(h),
        value: h.value,
        pctOfTotal: (h.value / o.total) * 100,
        unitsDisplay: h.shares != null ? shares(h.shares) + (isPrn ? " principal (PRN)" : " shares") : "—",
      };
      var href = o.rowHref(h);
      if (href) row.href = href;
      return row;
    });
    var domain = rows.map(function (r) { return r.label; }); // preserves rank order top-to-bottom

    var barMarkOpts = { x: "value", y: "label", fill: t.accent, rx: 3, insetTop: 4, insetBottom: 4 };
    var tipChannels = {};
    tipChannels[tipLabelKey] = "label";
    tipChannels["Value"] = "value";
    tipChannels["% of reported value"] = "pctOfTotal";
    tipChannels["Shares"] = "unitsDisplay";
    barMarkOpts.channels = tipChannels;
    var tipFormat = { x: false, y: false, fill: false };
    tipFormat[tipLabelKey] = true;
    tipFormat["Value"] = function (v) { return usd(v); };
    tipFormat["% of reported value"] = function (v) { return v.toFixed(1) + "%"; };
    tipFormat["Shares"] = true;
    barMarkOpts.tip = { format: tipFormat };

    // Chart typography is standardized on the diverging (derived-activity) chart's: IBM Plex
    // Mono, 10.5px for row names / axis text, 10px for inline value labels -- every Plot
    // builder uses the same pair so the charts read as one family.
    var MARGIN_LEFT = 230, LABEL_FONT_SIZE = 10.5, LABEL_DX = 8;
    // Row names are drawn as a Plot.text mark anchored at the plot frame's left edge (x=0,
    // dx=-LABEL_DX), extending leftward into the marginLeft gutter -- a name wider than that
    // gutter runs past pixel 0 of the SVG itself and gets clipped by .plot-chart-body's
    // horizontal scroll (there's nothing to scroll to, left of the origin). Found live
    // 2026-07-15 on AAPL's holder list ("CHARLES SCHWAB INVESTMENT MANAGEMENT INC" rendering
    // as ".ES SCHWAB INVESTMENT MANAGEMENT INC"). Truncate to fit with an ellipsis -- the
    // full name is still in the existing tooltip (tipChannels[tipLabelKey] above).
    var measureCtx = document.createElement("canvas").getContext("2d");
    measureCtx.font = LABEL_FONT_SIZE + "px " + t.fontMono;
    var maxLabelWidth = MARGIN_LEFT - LABEL_DX - 4;
    rows.forEach(function (r) {
      r.displayLabel = truncateToWidth(r.label, maxLabelWidth, measureCtx);
    });

    var labelMarkOpts = {
      x: 0, y: "label", text: "displayLabel", textAnchor: "end", dx: -LABEL_DX,
      fontFamily: t.fontMono, fontSize: LABEL_FONT_SIZE, fill: t.ink,
    };
    if (o.hasLinks) { barMarkOpts.href = "href"; labelMarkOpts.href = "href"; }

    // Row band matches the diverging (derived-activity) chart's compactness (26px vs. this
    // chart's previous 32px) -- same "one chart family" reasoning as the shared typography
    // above, and a real ~19% height cut on a 10-row chart. Bar insets scaled down with it
    // (4px vs. 5px) to keep roughly the same bar-to-row-height proportion.
    var ROW_H = 26, MARGIN_V = 8;
    var plot = window.Plot.plot({
      width: o.width,
      height: rows.length * ROW_H + MARGIN_V * 2,
      marginTop: MARGIN_V,
      marginBottom: MARGIN_V,
      marginLeft: MARGIN_LEFT,
      marginRight: 64,
      axis: null, // no default axis text -- labels are drawn as marks below, in the right font each
      x: { domain: [0, o.topMax] }, // the top-N's OWN max -- never the whole book's total
      y: { domain: domain },
      style: { background: "transparent", overflow: "visible" },
      marks: [
        window.Plot.gridX({ stroke: t.trackBorder, strokeOpacity: 0.5 }),
        window.Plot.barX(rows, barMarkOpts),
        window.Plot.text(rows, labelMarkOpts),
        // Percent-of-TOTAL-reported-value label (not of the top-N subset): IBM Plex Mono, sits
        // right of the bar end.
        window.Plot.text(rows, {
          x: "value", y: "label",
          text: function (d) { return d.pctOfTotal.toFixed(1) + "%"; },
          textAnchor: "start", dx: 6,
          fontFamily: t.fontMono, fontSize: 10, fill: t.inkSoft,
        }),
      ],
    });
    var body = document.createElement("div");
    body.className = "composition-bars";
    body.appendChild(plot);
    return body;
  }

  // holdings: InstitutionalHolding[] (GET /managers/{cik}/holdings) or IssuerHolder[] (the
  // issuer-centric twin, GET /companies/{symbol}/institutional-holders -- §5.6 reuse). `value` is
  // the reported market value of 13(f) long positions only; this is never AUM, a whole book, or
  // a share of shares outstanding. Returns a DocumentFragment holding TWO independent
  // chartCard() nodes -- the part-to-whole strip (all usable rows, ordered
  // top-1/top-2-5/top-6-10/other bands) and top-N ranked bars on their own value scale, each
  // with its own title/caption -- or null when there's no positive reported value to chart, so
  // callers can render their own honest empty-state note rather than dividing by zero. Callers
  // keep appending a single node (mount.appendChild(node)); the fragment disappears on append,
  // leaving the two cards as ordinary stacked siblings.
  //
  // opts (all optional; defaults reproduce the original manager-holdings framing):
  //   topN               -- ranked bars, and the strip's "top-6-10" band ceiling (default 10).
  //   labelField         -- the row's display-name field (default "issuer_name"; pass
  //                         "manager_name" for the issuer-centric holder list).
  //   idField            -- field used to disambiguate same-label rows, and to build a link
  //                         (default "cusip").
  //   unknownLabel       -- fallback label when labelField and idField are both missing.
  //   rowNoun            -- {singular, plural} noun for the caption/"Other" band (default
  //                         {"position","positions"}; pass {"holder","holders"} for reuse).
  //   captionLead        -- the caption's leading sentence (default is the manager-book framing).
  //                         Pass "" to omit the lead entirely -- e.g. when the caller already
  //                         renders that precision framing once at the top of the page and the
  //                         chart's own caption should carry only chart-specific mechanics.
  //   linkField/linkBase -- when both given, each bar and its label link to
  //                         `linkBase + row[linkField]` (e.g. "/manager/" + manager_cik).
  //   width              -- chart width in px; mount sites pass P.measuredWidth(el, 640).
  function compositionBars(holdings, opts) {
    if (!window.Plot) return null;
    opts = opts || {};
    var topN = opts.topN || 10;
    var labelField = opts.labelField || "issuer_name";
    var idField = opts.idField || "cusip";
    var unknownLabel = opts.unknownLabel || "Unknown issuer";
    var rowNoun = opts.rowNoun || { singular: "position", plural: "positions" };
    var DEFAULT_LEAD = "Share of reported 13F long positions only (not AUM or the manager's whole book)";
    var captionLead = opts.captionLead !== undefined ? opts.captionLead : DEFAULT_LEAD;
    var linkField = opts.linkField, linkBase = opts.linkBase;
    var hasLinks = !!(linkField && linkBase);
    var width = opts.width || 640;

    var usable = (holdings || []).filter(function (h) { return typeof h.value === "number" && h.value > 0; });
    var total = usable.reduce(function (s, h) { return s + h.value; }, 0);
    if (!usable.length || !total) return null;

    var sorted = usable.slice().sort(function (a, b) { return b.value - a.value; });
    var n = sorted.length;
    var t = plotTokens();

    // Multi-class issuers file distinct CUSIPs per class (or, for the issuer-centric reuse, one
    // manager can hold more than one class of the same issuer) -- disambiguate same-label rows
    // with idField rather than collapsing them (same rule as normalize/flows.py's diff_holders).
    var nameCounts = {};
    sorted.forEach(function (h) {
      var nm = h[labelField] || h[idField] || unknownLabel;
      nameCounts[nm] = (nameCounts[nm] || 0) + 1;
    });
    function rowLabel(h) {
      var nm = h[labelField] || h[idField] || unknownLabel;
      var label = nameCounts[nm] > 1 ? nm + " (" + h[idField] + ")" : nm;
      if (h.put_call) label += h.put_call === "Put" ? " (PUT)" : " (CALL)"; // options labeled, never pooled silently
      return label;
    }
    function rowHref(h) {
      return hasLinks && h[linkField] != null ? linkBase + encodeURIComponent(h[linkField]) : null;
    }

    // ---- part-to-whole strip bands: top-1 / top-2-5 / top-6-10 / other. A band is only formed
    // when the book actually reaches it -- otherwise its would-be members fold into "other"
    // rather than rendering a partially-filled, misleadingly-named band (e.g. a 2-position book
    // renders top-1 + other, never a "top 2-5" band holding a single position).
    function bandSum(fromIdx, toIdx) {
      var rows = sorted.slice(fromIdx, toIdx);
      return { rows: rows, value: rows.reduce(function (s, h) { return s + h.value; }, 0) };
    }
    var segs = [{ name: "Top 1", data: bandSum(0, Math.min(1, n)) }];
    var band2Full = n >= 5;
    if (band2Full) segs.push({ name: "Top 2–5", data: bandSum(1, 5) });
    var band3Full = band2Full && n >= topN;
    if (band3Full) segs.push({ name: "Top 6–" + topN, data: bandSum(5, topN) });
    var consumed = band3Full ? topN : (band2Full ? 5 : 1);
    if (consumed < n) {
      var restData = bandSum(consumed, n);
      segs.push({
        name: "Other (" + restData.rows.length + " " +
          (restData.rows.length === 1 ? rowNoun.singular : rowNoun.plural) + ")",
        data: restData,
      });
    }
    segs = segs.filter(function (s) { return s.data.rows.length > 0; });
    segs.forEach(function (s, i) {
      s.pct = (s.data.value / total) * 100;
      s.fill = segs.length > 1 ? mixHex(t.accent, t.accentWash, i / (segs.length - 1)) : t.accent;
    });

    // ---- top-N ranked bars, scaled to their own range ----
    var top = sorted.slice(0, topN);
    var topMax = top[0].value; // sorted desc, so the first row is the max -- always > 0 here

    // Two independent chartCards, not one shared card with two labeled sub-sections (the
    // prior "Phase 5 polish: composition redesign" layout) -- each chart now stands alone
    // with its own title and caption instead of reading as one fused chart. Combined into a
    // DocumentFragment so callers keep appending a single node (mount.appendChild(node)); the
    // fragment itself never lands in the DOM, leaving the two .plot-chart cards as ordinary
    // stacked siblings, same as any other pair of charts on these pages.
    var stripCard = chartCard("Share of total reported value");
    stripCard.body.appendChild(compositionStrip(segs, width));
    var stripCaption = "split into top-1 / top-2–5 / top-6–" + topN + " / other bands of reported value.";
    stripCard.caption(captionLead ? captionLead + " — " + stripCaption : stripCaption.charAt(0).toUpperCase() + stripCaption.slice(1));

    var barsCard = chartCard("Top " + top.length + " by value (own scale)");
    barsCard.body.appendChild(compositionRankedBars(top, {
      width: width, topMax: topMax, total: total, labelField: labelField, hasLinks: hasLinks,
      rowLabel: rowLabel, rowHref: rowHref, t: t,
    }));
    barsCard.caption(
      "Top " + top.length + " of " + usable.length + " " + rowNoun.plural + " with a reported " +
      "value: bars are scaled to their own top-" + topN + " range, not the whole book. Options " +
      "are labeled PUT/CALL; principal-amount (PRN) rows are shown separately and never summed " +
      "with share (SH) rows."
    );

    var frag = document.createDocumentFragment();
    frag.appendChild(stripCard.root);
    frag.appendChild(barsCard.root);
    return frag;
  }

  // ---------- concentration stat tiles (Phase 5.2) ----------
  //
  // Plain HTML tiles (no Plot needed): position count, top-1/5/10 share of reported value, and
  // the reported total. Descriptive numbers only -- no "diversification score," no Herfindahl
  // index, no judgment color (§9.2: a single concentration index reads as a verdict, which this
  // product refuses to render). Shares are computed the same way compositionBars computes them
  // (usable rows = value > 0, share is of the total across ALL usable rows) so the two widgets
  // never disagree with each other.
  // holdings: InstitutionalHolding[] or IssuerHolder[] (§5.6 reuse). opts (all optional;
  // defaults reproduce the original manager-holdings tiles byte-for-byte):
  //   ranks      -- top-N ranks to show (default [1, 5, 10]). A rank is DROPPED (not just shown
  //                 as N/A) once N reaches or passes the number of positions carrying a reported
  //                 value -- top-10 of a 2-position book is noise, not information (Phase 5
  //                 polish: degenerate-state guard).
  //   rowLabel   -- the row-count tile's label (default "Positions reported"; pass "Holders
  //                 reported" for the issuer-centric reuse).
  //   totalNote  -- caption under the "Reported total" tile (default "Reported 13F long
  //                 positions only"; the issuer-centric caller supplies its own framing).
  //   caption    -- optional trailing paragraph under all tiles, for precision that doesn't fit
  //                 one tile's note (e.g. "not shares outstanding, only ingested 13F filers").
  function statTiles(holdings, opts) {
    opts = opts || {};
    var ranks = opts.ranks || [1, 5, 10];
    var rowLabel = opts.rowLabel || "Positions reported";
    var totalNote = opts.totalNote || "Reported 13F long positions only";
    var rows = holdings || [];
    if (!rows.length) return "";
    var usable = rows.filter(function (h) { return typeof h.value === "number" && h.value > 0; });
    var sorted = usable.slice().sort(function (a, b) { return b.value - a.value; });
    var total = usable.reduce(function (s, h) { return s + h.value; }, 0);

    function tile(label, valueHtml, note) {
      return (
        '<div class="stat-tile"><span class="stat-tile-label">' + esc(label) + "</span>" +
        '<span class="stat-tile-value">' + valueHtml + "</span>" +
        (note ? '<span class="stat-tile-note">' + esc(note) + "</span>" : "") +
        "</div>"
      );
    }

    // Degenerate-state guard: hide a top-N tile once N reaches (or passes) the number of
    // positions that actually carry a reported value -- top-5/top-10 = 100.0% of a 2-position
    // book is noise, not information, and repeating "100.0%" across several tiles trains readers
    // to stop reading them. A rank that clears the guard still renders N/A rather than 0% when
    // there's no positive total to divide by (§7 status vocabulary), so that behavior is
    // unaffected below -- this only decides which ranks are shown at all.
    var visibleRanks = ranks.filter(function (n) { return n < usable.length; });

    var tiles = [tile(rowLabel, esc(String(rows.length)))];
    if (!total) {
      // Never render a share as 0% when there's nothing positive to divide by -- the honest
      // token is N/A, same rule as the status vocabulary (§7).
      visibleRanks.forEach(function (n) { tiles.push(tile("Top-" + n + " share", "N/A")); });
      tiles.push(tile("Reported total", "N/A", "No positive reported value on record for this quarter"));
    } else {
      visibleRanks.forEach(function (n) {
        var topSum = sorted.slice(0, n).reduce(function (s, h) { return s + h.value; }, 0);
        tiles.push(tile("Top-" + n + " share", esc(pct(topSum / total))));
      });
      tiles.push(tile("Reported total", esc(usd(total)), totalNote));
    }
    return '<div class="stat-tiles">' + tiles.join("") + "</div>" +
      (opts.caption ? '<p class="stmt-caption">' + esc(opts.caption) + "</p>" : "");
  }

  // ---------- position bar (§10: peer percentile — position, never a good/bad verdict) ----------

  function ordinal(n) {
    n = Math.round(n);
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // A horizontal 0-100 track with a marker at `percentile`. One accent on a neutral track --
  // NO green/red: the bar shows WHERE a value sits among peers, not whether it's good.
  function positionBar(percentile) {
    if (percentile === null || percentile === undefined) return "";
    var p = Math.max(0, Math.min(100, percentile));
    return '<span class="pos-bar" role="img" aria-label="' + esc(ordinal(percentile)) +
      ' percentile among peers"><span class="pos-marker" style="left:' + p.toFixed(1) + '%"></span></span>';
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
    // Optional peer position bar (Metrics Phase 2). opts.peer is a PeerRank; shown only where a
    // rank exists. Percentile is POSITION within the SIC peer group, not a verdict.
    var peer = "";
    if (opts.peer && opts.peer.percentile !== null && opts.peer.percentile !== undefined) {
      var pr = opts.peer;
      peer = '<div class="peer-rank">' + positionBar(pr.percentile) +
        '<span class="peer-label">' + esc(ordinal(pr.percentile)) + " pctile · " +
        esc(pr.peer_count) + " peers · SIC " + esc(pr.peer_group) + "</span></div>";
    }
    // Optional expandable multi-period trend (Phase 1b). The body is filled lazily by the page
    // (company.js) on first open from /metrics/{metric}/history -- keeps the card cheap by default.
    var trendPanel = opts.trend
      ? '<details class="trend-panel" data-metric="' + esc(mv.metric) +
        '"><summary>Trend</summary><div class="trend-body"></div></details>'
      : "";
    return (
      '<article class="metric-card' + (isNa ? " na" : "") + '">' +
      '<div class="metric-head"><span class="metric-name">' + esc(mv.label) + "</span>" + statusChip(mv.status) + "</div>" +
      '<div class="' + valueCls + '">' + esc(f.text) + "</div>" +
      '<div class="metric-basis">' + esc(mv.basis) + "</div>" +
      peer +
      spark +
      note +
      prov +
      trendPanel +
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
    // Autocomplete (suggest.js, loaded before app.js on pages that mount a search):
    // picking a row fills the input and submits through the same resolve path below.
    if (window.ProfinSuggest) {
      window.ProfinSuggest.attach(input, {
        onPick: function () {
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        },
      });
    }
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

  // ---------- API-key gate (for gated endpoints) ----------

  // Renders a "needs an API key" panel into `el` (paste-key input + save + get-a-key link),
  // and calls `onSaved` after a key is stored so the caller can re-render the gated view.
  function mountNeedsKey(el, onSaved) {
    el.innerHTML =
      '<div class="state">' +
      '<div class="state-title">API key required</div>' +
      '<div class="state-copy">This dataset is gated. Paste your API key to view it, or get a ' +
      "free one — statements, metrics and insider trades stay free without a key.</div>" +
      '<div class="searchbar" style="margin-top:14px">' +
      '<input type="password" name="apikey" placeholder="X-API-Key" autocomplete="off" spellcheck="false">' +
      '<button type="button" class="btn-inverse" data-save>Save key</button></div>' +
      '<div class="recovery-chips"><a class="btn-inverse" href="/guide">Get a free key ↗</a></div>' +
      "</div>";
    var input = el.querySelector('input[name="apikey"]');
    el.querySelector("[data-save]").addEventListener("click", function () {
      var v = input.value.trim();
      if (!v) return;
      setKey(v);
      if (onSaved) onSaved();
    });
  }

  // ---------- Plot charts (Phase 5, manager/issuer portfolio viz) ----------
  //
  // Observable Plot is vendored (d3 then the Plot UMD build, see manager.html) and exposes
  // window.Plot. Every chart here is a Profin.* builder that owns its own Plot spec, styling,
  // and honesty caption, and RETURNS A DOM NODE (Plot renders SVG elements) -- callers append
  // it; pages never call Plot.plot() directly (STYLE_GUIDE §6/§10). The hand-rolled
  // sparkline/trendChart/trajectoryChart/positionBar above stay string builders -- not migrated.

  // Read a design token at call time so the page's CSS is always the source of truth; the
  // literal is only a fallback if the variable can't be read (e.g. called before stylesheets
  // apply). Keeps chart colors in lockstep with style.css/app.css without re-declaring hexes.
  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) {
      return fallback;
    }
  }

  // Signed share-count formatter for axis ticks/tooltips -- same convention manager.js's
  // signedShares() uses for the table (+/− prefix, magnitude via fmt.shares), kept here so
  // every Plot builder that shows signed share deltas formats them identically.
  function signedSharesTick(v) {
    if (v === 0) return "0";
    return (v > 0 ? "+" : MINUS) + shares(Math.abs(v));
  }

  var HOLDING_ACTION_LABEL = { new: "New", added: "Added", reduced: "Reduced", exited: "Exited" };

  // Signed percent-of-prior-position tick/label -- "+18.2%" / "−6.7%" / "0%". Percent, not
  // shares, is what divergingBars' bar LENGTH now encodes (see below); kept next to
  // signedSharesTick so both signed-delta formatters live in one place.
  function signedPctChangeTick(v) {
    if (v === 0) return "0%";
    return (v > 0 ? "+" : MINUS) + Math.abs(v).toFixed(1) + "%";
  }

  // One sentence per changed row, for the <3-changed-rows degenerate case (a one-or-two-bar
  // chart with a full axis apparatus is the anti-pattern this replaces -- ROADMAP_UI.md's
  // Phase 5 polish pass). Mirrors the same wording the chart's tooltip/labels use, so the
  // sentence and the chart never disagree when a caller straddles the 3-row boundary across
  // renders (e.g. paging a quarter selector).
  function describeActivityRow(a, labelField) {
    var name = a[labelField] || a.cusip || "—";
    if (a.action === "new") {
      return name + " is a new position (" + shares(a.shares_after || 0) + " shares).";
    }
    if (a.action === "exited") {
      return name + " exited (was " + shares(a.shares_before || 0) + " shares).";
    }
    var verb = a.action === "added" ? "added" : "reduced";
    var pctText = typeof a.shares_before === "number" && a.shares_before
      ? " (" + signedPctChangeTick((a.shares_change / a.shares_before) * 100) + ")"
      : "";
    return name + " " + verb + " " + signedSharesTick(a.shares_change) + " shares" + pctText + ".";
  }

  // Signed share-change bars per issuer (or, for the issuer-centric reuse, per manager), for
  // the 13F DERIVED activity diff (`normalize/flows.py` HoldingDelta rows, as returned by
  // /managers/{cik}/activity and .../institutional-activity). `activity`: HoldingDelta[]
  // exactly as the API returns it -- never re-derived client-side.
  //
  // Bar LENGTH is now **% of the prior position** (shares_change / shares_before), not raw
  // shares -- raw share counts aren't comparable across issuers/managers of wildly different
  // size, so a chart ranked/scaled by raw shares mostly just shows "who is biggest," not "who
  // moved the most." Absolute shares stay visible as the direct on-bar label and in the
  // tooltip (STYLE_GUIDE/ROADMAP_UI Phase 5 polish pass, "Derived activity redesign").
  //
  // A **New** position has no prior base to divide by -- it is NEVER given a fake +100% bar.
  // It renders as a full-length OUTLINE marker (dashed stroke, no fill; §10 kind-not-magnitude
  // tint rule) at the same +100 extent a doubling-or-more "added" bar would reach, clearly
  // distinguished from the solid/tinted real bars, labeled "New" inline and "New — no prior
  // position" in its tooltip. **Exited** genuinely IS −100% of the prior position (shares_after
  // is 0) -- it renders as a real, solid bar (a position opened/closed outright), not a marker.
  //
  // `opts`: { fromLabel, toLabel, fromPeriod, toPeriod, cap, labelField, tipLabelKey, title,
  // width }. fromLabel/toLabel are pre-formatted quarter-end labels (the caller already has a
  // date formatter); fromPeriod/toPeriod (raw ISO) are used only as a fallback caption if no
  // label was passed. `cap` defaults to 10. `labelField` picks the bar's display name (default
  // "issuer_name"; pass "manager_name" for the issuer-centric reuse -- each HoldingDelta row is
  // keyed by (manager_cik, cusip) either way, so the same cusip-suffix disambiguation logic
  // applies to repeated manager names too). `tipLabelKey`/`title` rename the tooltip channel and
  // chart title to match (default "Issuer"/"Derived activity"). `width` is the mount site's
  // measured width (`Profin.measuredWidth(el, 640)`) -- never a hardcoded pixel width.
  //
  // Note on option/instrument labeling: HoldingDelta (normalize/schema.py) does NOT carry
  // put_call or shares_or_principal -- those live only on the raw InstitutionalHolding rows
  // that flows.diff_snapshots/diff_holders sum by CUSIP before diffing. So there is nothing to
  // label here; the caption states the SH/PRN and option/equity non-summing rule as a standing
  // caveat instead of a per-bar flag, since the delta rows carry no such flag to render.
  //
  // Returns a DOM node: the Plot chart when >=3 rows changed, or (the degenerate case) a plain
  // sentence in the same chartCard chrome when 1-2 rows changed; null when nothing changed at
  // all (every row unchanged or a zero net change) -- callers should skip appending.
  function divergingBars(activity, opts) {
    opts = opts || {};
    var cap = opts.cap || 10;
    var labelField = opts.labelField || "issuer_name";
    var tipLabelKey = opts.tipLabelKey || "Issuer";
    var titleText = opts.title || "Derived activity";
    var fromLabel = opts.fromLabel || opts.fromPeriod || "the prior quarter";
    var toLabel = opts.toLabel || opts.toPeriod || "this quarter";
    var width = opts.width || 640;

    // Honest filter: unchanged rows and non-numeric/zero changes never get a zero-length bar.
    var changed = (activity || []).filter(function (a) {
      return a && a.action !== "unchanged" && typeof a.shares_change === "number" && a.shares_change !== 0;
    });
    if (!changed.length) return null;

    // Degenerate case (§ Phase 5 polish pass): fewer than 3 changed rows is a sentence, not a
    // one-or-two-bar chart with a full axis apparatus. Still carries the DERIVED caveat, in the
    // same chartCard chrome as the real chart so the page never looks like two visual dialects.
    if (changed.length < 3) {
      var card = chartCard(titleText);
      var lead = changed.length + (changed.length === 1 ? " position changed" : " positions changed") +
        " vs " + fromLabel + ": ";
      var sentences = changed.map(function (a) { return describeActivityRow(a, labelField); });
      var p = document.createElement("p");
      p.className = "state-copy";
      p.style.margin = "0";
      p.textContent = lead + sentences.join(" ");
      card.body.appendChild(p);
      card.caption(
        "DERIVED by diffing " + fromLabel + " → " + toLabel + " 13F snapshots — never reported " +
        "trades. Too few changed positions this quarter for a comparative chart."
      );
      return card.root;
    }

    var rows = changed.slice();
    var overflow = Math.max(0, rows.length - cap);

    // Multi-class issuers (same issuer_name, distinct CUSIPs) -- or, for the issuer-centric
    // reuse, the same manager holding more than one class of this issuer -- must stay distinct
    // rows (never merged); disambiguate the label with a short CUSIP suffix only where the
    // label repeats.
    var seen = {};
    rows.forEach(function (a) {
      var nm = a[labelField] || a.cusip || "—";
      seen[nm] = (seen[nm] || 0) + 1;
    });

    var data = rows.map(function (a) {
      var nm = a[labelField] || a.cusip || "—";
      var label = seen[nm] > 1 && a.cusip ? nm + " (" + a.cusip.slice(-6) + ")" : nm;
      var actionLabel = HOLDING_ACTION_LABEL[a.action] || a.action || "—";
      // "New" never gets a fake prior-base percent; a defensive fallback also catches the
      // (shouldn't-happen) case of a non-new row with no usable shares_before -- both render
      // as the same distinct outline marker rather than a computed bar.
      var hasBase = a.action !== "new" && typeof a.shares_before === "number" && a.shares_before !== 0;
      var isMarker = !hasBase;
      var pct = hasBase ? (a.shares_change / a.shares_before) * 100 : null;
      var markerPct = a.shares_change >= 0 ? 100 : -100; // full-length, direction-honest position
      var sortKey = isMarker ? Infinity : Math.abs(pct); // New pins at the top regardless of size
      var kind = a.action === "exited" ? "full" : isMarker ? "new" : "partial";
      var inlineLabel;
      if (isMarker) {
        inlineLabel = actionLabel + " " + signedSharesTick(a.shares_change);
      } else if (a.action === "exited") {
        inlineLabel = actionLabel + " " + signedSharesTick(a.shares_change) + " (" + signedPctChangeTick(pct) + ")";
      } else {
        inlineLabel = signedSharesTick(a.shares_change) + " (" + signedPctChangeTick(pct) + ")";
      }
      var rowPct = isMarker ? markerPct : pct;
      // Full-length bars/markers (Exited/New) reach the domain edge, right next to the row-name
      // margin -- a label placed AT that far end collides with the margin text (confirmed
      // against a real render). Those labels instead go from the zero rule OUT INTO the empty
      // opposite half (a full/marker row only ever draws on one side, so the other half is
      // always clear) -- e.g. an Exited bar runs left, its label runs right from x=0. A
      // "partial" (added/reduced) bar is normally short enough that labeling at its own end,
      // same side, has room.
      var labelSide = kind === "partial" ? (rowPct >= 0 ? 1 : -1) : (rowPct >= 0 ? -1 : 1);
      return {
        label: label,
        cusip: a.cusip || "—",
        actionLabel: isMarker ? actionLabel + " — no prior position" : actionLabel,
        pctForTip: isMarker ? "n/a — no prior position" : signedPctChangeTick(pct),
        beforeFmt: a.shares_before != null ? shares(a.shares_before) : "—",
        afterFmt: a.shares_after != null ? shares(a.shares_after) : "—",
        changeFmt: signedSharesTick(a.shares_change),
        pct: rowPct,
        kind: kind,
        inlineLabel: inlineLabel,
        labelX: kind === "partial" ? rowPct : 0,
        labelSide: labelSide,
        sortKey: sortKey,
      };
    });

    // Rank by |% of prior position| (New pinned at the top -- see sortKey above -- since it has
    // no magnitude to rank by, and an outright new position is at least as notable as any
    // resize). Cap at the top N by that same rank, exactly like the shares-based cap before it.
    data.sort(function (a, b) { return b.sortKey - a.sortKey; });
    data = data.slice(0, cap);
    var domain = data.map(function (d) { return d.label; });

    var ACCENT = cssVar("--accent", "#C0703A");
    var ACCENT_WASH = cssVar("--accent-wash", "#F3E4D5");
    var INK = cssVar("--ink", "#1C1A16");
    var INK_SOFT = cssVar("--ink-soft", "#6B6459");
    var BORDER_TINT = cssVar("--border-tint-rule", "#E5DFD3");
    var FONT_MONO = cssVar("--font-mono", "'IBM Plex Mono', monospace");

    var rowH = 26;
    var height = Math.max(90, data.length * rowH + 46);

    // Domain always reaches at least ±100 (Exited and New/marker rows sit exactly there); a
    // rare "added"/"reduced" row that more than doubled/halved its own magnitude past 100%
    // simply extends it further -- never clipped.
    var maxAbsPct = data.reduce(function (m, d) { return Math.max(m, Math.abs(d.pct)); }, 100);
    var xDomain = [-maxAbsPct * 1.18, maxAbsPct * 1.18];

    var bars = data.filter(function (d) { return d.kind !== "new"; });
    var markers = data.filter(function (d) { return d.kind === "new"; });

    // Tooltip channel/format keys are built off tipLabelKey so the issuer-centric reuse can
    // rename "Issuer" -> "Manager" without a second copy of this mark's options.
    function tipChannelsFor() {
      var channels = { CUSIP: "cusip", Action: "actionLabel", "Shares before": "beforeFmt", "Shares after": "afterFmt", Change: "changeFmt", "% of prior": "pctForTip" };
      channels[tipLabelKey] = "label";
      var format = { x: false, y: false, fill: false, stroke: false, CUSIP: true, Action: true, "Shares before": true, "Shares after": true, Change: true, "% of prior": true };
      format[tipLabelKey] = true;
      return { channels: channels, format: format };
    }
    var tip = tipChannelsFor();

    var marks = [
      window.Plot.gridX({ stroke: BORDER_TINT, strokeOpacity: 0.7 }),
    ];
    if (bars.length) {
      marks.push(window.Plot.barX(bars, {
        x: "pct",
        y: "label",
        // One terracotta accent, no good/bad hue (§10): solid = opened/closed outright
        // (exited), lighter tint = an existing position resized (added/reduced). Direction
        // (left = reduced/exited, right = added) already carries increase/decrease.
        fill: function (d) { return d.kind === "full" ? ACCENT : ACCENT_WASH; },
        stroke: ACCENT,
        strokeWidth: 1,
        rx: 3,
        channels: tip.channels,
        tip: { format: tip.format },
      }));
    }
    if (markers.length) {
      // New: a full-length OUTLINE marker, never a filled bar -- distinct in KIND (unfilled +
      // dashed), not just a lighter tint, so it can never be mistaken for a real +100% change.
      marks.push(window.Plot.barX(markers, {
        x: "pct",
        y: "label",
        fill: "none",
        stroke: ACCENT,
        strokeWidth: 1.5,
        strokeDasharray: "3,2",
        rx: 3,
        channels: tip.channels,
        tip: { format: tip.format },
      }));
    }
    marks.push(window.Plot.ruleX([0], { stroke: INK, strokeOpacity: 0.75 }));
    // Direct on-bar label: absolute shares (+ percent for real bars), so the number is visible
    // without hovering -- the tooltip repeats it alongside the raw before/after shares. Split
    // into two constant-textAnchor marks (positive-side vs negative-side) rather than one mark
    // with a per-datum function for textAnchor/dx -- Plot's text mark treats those two options
    // as marks-level constants, not per-datum channels, so a function there stringifies instead
    // of evaluating (confirmed against a real render: it broke the mark's own transform).
    var posLabels = data.filter(function (d) { return d.labelSide >= 0; });
    var negLabels = data.filter(function (d) { return d.labelSide < 0; });
    if (posLabels.length) {
      marks.push(window.Plot.text(posLabels, {
        x: "labelX", y: "label", text: function (d) { return d.inlineLabel; },
        textAnchor: "start", dx: 6,
        fontFamily: FONT_MONO, fontSize: 10, fill: INK_SOFT,
      }));
    }
    if (negLabels.length) {
      marks.push(window.Plot.text(negLabels, {
        x: "labelX", y: "label", text: function (d) { return d.inlineLabel; },
        textAnchor: "end", dx: -6,
        fontFamily: FONT_MONO, fontSize: 10, fill: INK_SOFT,
      }));
    }

    var Y_MARGIN_LEFT = 196;
    // Row names render via Plot's default y-axis tick text, anchored at the axis line and
    // extending left -- same clipping mechanism as compositionRankedBars: a name wider than
    // Y_MARGIN_LEFT runs past pixel 0 of the SVG and gets clipped by .plot-chart-body's
    // horizontal scroll. Found live 2026-07-15 alongside the composition-chart bug ("Virtus
    // Investment Advisers, LLC" rendering as "irtus Investment Advisers, LLC"). Truncate via
    // tickFormat; the full name is still in the existing tooltip (tip.channels[tipLabelKey]).
    var measureCtx = document.createElement("canvas").getContext("2d");
    measureCtx.font = "10.5px " + FONT_MONO;
    var maxLabelWidth = Y_MARGIN_LEFT - 14;

    var plotNode = window.Plot.plot({
      width: width,
      height: height,
      marginLeft: Y_MARGIN_LEFT,
      marginRight: 90,
      marginTop: 8,
      marginBottom: 30,
      style: {
        fontFamily: FONT_MONO, fontSize: 10.5, background: "transparent",
        color: INK_SOFT, overflow: "visible",
      },
      x: { label: "% of prior position (signed)", tickFormat: signedPctChangeTick, grid: false, domain: xDomain },
      y: {
        domain: domain, label: null,
        tickFormat: function (d) { return truncateToWidth(String(d), maxLabelWidth, measureCtx); },
      },
      marks: marks,
    });

    var chart = chartCard(titleText);
    chart.body.appendChild(plotNode);
    chart.caption(
      "DERIVED by diffing " + fromLabel + " → " + toLabel + " 13F snapshots — never reported " +
      "trades. Bar length is percent of the PRIOR position (shares_change ÷ shares_before), so " +
      "issuers/managers of different size are comparable; absolute shares are the direct label. " +
      "New/Exited positions are inferred from a CUSIP's presence or absence between the two " +
      "snapshots, not an observed transaction -- New has no prior base and never gets a fake " +
      "+100% bar (shown as an outlined marker instead); Exited genuinely is −100% and renders as " +
      "a real bar. Units are shares, not value; SH/PRN and option/equity rows are never summed " +
      "together, and each bar is one CUSIP exactly as reported (multi-class issuers stay distinct)."
    );
    if (overflow > 0) {
      chart.note("+ " + overflow + " more change" + (overflow === 1 ? "" : "s") +
        " not shown (top " + cap + " by |% of prior position|, New pinned first).");
    }
    return chart.root;
  }

  // ---------- Phase 5 polish pass: activity summary tiles ----------
  //
  // Small count-only tiles (n new / added / reduced / exited) above the diverging-bars chart
  // (or the degenerate sentence) -- an at-a-glance headline before the row-by-row detail.
  // Reuses the existing .stat-tiles/.stat-tile* CSS (Phase 5.2), a plain HTML string builder
  // like statTiles -- no Plot needed for four numbers. `activity`: HoldingDelta[] exactly as
  // the API returns it (NOT pre-filtered/capped -- these counts are over every changed row,
  // independent of divergingBars' top-N cap, so the tiles and the "+N more" note can honestly
  // disagree in a large book: the tiles count everything, the chart caps what it draws).
  // Zero-count kinds are omitted (never invent a "0 new" tile that implies we checked and found
  // none, when e.g. this manager's book simply doesn't have that shape of quarter).
  function activitySummaryTiles(activity) {
    var rows = (activity || []).filter(function (a) { return a && a.action && a.action !== "unchanged"; });
    if (!rows.length) return "";
    var counts = { new: 0, added: 0, reduced: 0, exited: 0 };
    rows.forEach(function (a) { if (counts[a.action] !== undefined) counts[a.action]++; });
    var order = [
      ["new", "New"], ["added", "Added"], ["reduced", "Reduced"], ["exited", "Exited"],
    ];
    var tiles = order
      .filter(function (o) { return counts[o[0]] > 0; })
      .map(function (o) {
        return (
          '<div class="stat-tile"><span class="stat-tile-label">' + esc(o[1]) + "</span>" +
          '<span class="stat-tile-value">' + esc(String(counts[o[0]])) + "</span></div>"
        );
      });
    if (!tiles.length) return "";
    return '<div class="stat-tiles">' + tiles.join("") + "</div>";
  }

  // ---------- Phase 5 polish pass: dumbbell (prior -> current % of reported value) ----------
  //
  // Top-10 holdings by CURRENT reported value, each shown as prior -> current **% of that
  // quarter's own reported total** -- the two-quarter special case of the deferred 5.5
  // (allocation-over-time). Computing each percent within its own snapshot (numerator AND
  // denominator both from the same filing) is what makes this comparable across the
  // thousands->whole-dollars unit-convention boundary (CLAUDE.md/DATA_MODEL.md): the raw `value`
  // unit cancels out of the ratio, so this is safe to plot even spanning that boundary, unlike
  // valueLineChart's raw totals (which clip instead of normalizing -- see 5.4).
  //
  // `current`/`prior`: raw holdings rows for the two quarters (InstitutionalHolding[] from
  // /managers/{cik}/holdings, or IssuerHolder[] from /companies/{symbol}/institutional-holders
  // -- same shapes compositionBars/statTiles already consume). `prior` may be `null`/`[]` when
  // no prior snapshot could be fetched (caller's fetch failed, or genuinely the first quarter)
  // -- every current row then renders as a single "New" dot, never a fabricated line.
  //
  // opts: { topN (10), labelField ("issuer_name"; pass "manager_name" for the issuer-centric
  // reuse), idField (matches rows between the two snapshots; default "cusip" -- pass
  // ["manager_cik","cusip"] for the issuer-centric reuse, matching normalize/flows.diff_holders'
  // own (manager_cik, cusip) key so multi-class issuers/managers-holding-two-classes stay
  // distinct), unknownLabel, rowNoun, fromLabel/toLabel (pre-formatted quarter-end labels),
  // width. Returns a DOM node, or null when there's no positive reported CURRENT value to rank
  // (mirrors compositionBars' guard).
  function dumbbellChart(current, prior, opts) {
    if (!window.Plot) return null;
    opts = opts || {};
    var topN = opts.topN || 10;
    var labelField = opts.labelField || "issuer_name";
    var idField = opts.idField || "cusip"; // string, or an array for a composite key
    var unknownLabel = opts.unknownLabel || "Unknown";
    var rowNoun = opts.rowNoun || { singular: "holding", plural: "holdings" };
    var fromLabel = opts.fromLabel || "the prior quarter";
    var toLabel = opts.toLabel || "this quarter";
    var width = opts.width || 640;

    function keyOf(row) {
      if (Array.isArray(idField)) return idField.map(function (f) { return row[f]; }).join("|");
      return row[idField];
    }

    var curUsable = (current || []).filter(function (h) { return typeof h.value === "number" && h.value > 0; });
    var curTotal = curUsable.reduce(function (s, h) { return s + h.value; }, 0);
    if (!curUsable.length || !curTotal) return null;

    var priorUsable = (prior || []).filter(function (h) { return typeof h.value === "number" && h.value > 0; });
    var priorTotal = priorUsable.reduce(function (s, h) { return s + h.value; }, 0);
    var priorByKey = {};
    priorUsable.forEach(function (h) { priorByKey[keyOf(h)] = h; }); // last-wins on a rare dup key

    var top = curUsable.slice().sort(function (a, b) { return b.value - a.value; }).slice(0, topN);

    // Multi-class issuers/managers holding >1 class disambiguate by idField, same rule as
    // compositionBars/divergingBars (never silently collapse distinct CUSIPs).
    var nameCounts = {};
    top.forEach(function (h) {
      var n = h[labelField] || unknownLabel;
      nameCounts[n] = (nameCounts[n] || 0) + 1;
    });

    var rows = top.map(function (h) {
      var name = h[labelField] || unknownLabel;
      var label = nameCounts[name] > 1 ? name + " (" + (h.cusip || keyOf(h)) + ")" : name;
      if (h.put_call) label += h.put_call === "Put" ? " (PUT)" : " (CALL)"; // options labeled, never pooled silently
      var priorRow = priorByKey[keyOf(h)];
      var currentPct = (h.value / curTotal) * 100;
      var isNew = !priorRow; // absent from the prior snapshot entirely -- presence/absence, same convention as HoldingDelta
      var priorPct = isNew || !priorTotal ? null : (priorRow.value / priorTotal) * 100;
      return {
        label: label,
        currentPct: currentPct,
        priorPct: priorPct,
        currentValueFmt: usd(h.value),
        priorValueFmt: priorRow ? usd(priorRow.value) : "—",
        isNew: isNew,
        delta: priorPct === null ? null : currentPct - priorPct,
        // The inline label anchors past whichever of the two dots is further right, not always
        // "past currentPct" -- when the pair is close together (a small move), anchoring at
        // currentPct alone can land the label right on top of the OTHER dot (confirmed against
        // a real render: a ~3-point move put the label directly over the prior dot).
        labelAnchorX: Math.max(currentPct, priorPct === null ? currentPct : priorPct),
      };
    });
    // Ranked by current value (already top's order) -- current % of a shared total moves in
    // lockstep with value rank, so the y-domain reads top-to-bottom exactly like compositionBars.
    var domain = rows.map(function (r) { return r.label; });

    var t = plotTokens();
    var ACCENT = t.accent, ACCENT_WASH = t.accentWash, INK = t.ink, INK_SOFT = t.inkSoft;
    var BORDER_TINT = cssVar("--border-tint-rule", "#e5dfd3");
    var FONT_MONO = t.fontMono;
    var tipLabelKey = labelField === "manager_name" ? "Manager" : "Issuer";

    var DUMBBELL_MARGIN_LEFT = 210;
    // Row names render as a custom text mark anchored at x=0/dx=-8 -- same convention, and
    // the same left-clipping failure mode, as compositionBars/divergingBars: a name wider
    // than the margin runs past pixel 0 of the SVG and gets clipped by .plot-chart-body's
    // horizontal scroll. Found live 2026-07-15 on a manager's "Prior -> current allocation"
    // chart. Truncate to fit; the full name is now also a named tooltip channel below (this
    // chart previously had none -- its tipFormat explicitly suppressed the y/label channel).
    var measureCtx = document.createElement("canvas").getContext("2d");
    measureCtx.font = "10.5px " + FONT_MONO;
    var maxLabelWidth = DUMBBELL_MARGIN_LEFT - 8 - 4;
    rows.forEach(function (r) {
      r.displayLabel = truncateToWidth(r.label, maxLabelWidth, measureCtx);
    });

    var rowH = 30;
    var height = Math.max(100, rows.length * rowH + 40);
    var maxPct = rows.reduce(function (m, r) {
      return Math.max(m, r.currentPct, r.priorPct || 0);
    }, 0);

    var matched = rows.filter(function (r) { return !r.isNew; });
    var newRows = rows.filter(function (r) { return r.isNew; });
    // Selective direct labels (STYLE_GUIDE §6: label the point, not every point) -- the biggest
    // movers by |delta| among matched rows, plus every New dot (it always needs the explicit
    // "New" word; there's no line/delta to imply it otherwise).
    var biggestMovers = matched.slice().sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); }).slice(0, 3);
    var labelSet = {};
    biggestMovers.forEach(function (r) { labelSet[r.label] = true; });
    newRows.forEach(function (r) { labelSet[r.label] = true; });

    var tipFormat = { x: false, y: false, fill: false, stroke: false, Prior: true, Current: true, "Prior value": true, "Current value": true };
    tipFormat[tipLabelKey] = true;

    var marks = [
      window.Plot.gridX({ stroke: BORDER_TINT, strokeOpacity: 0.6 }),
    ];
    if (matched.length) {
      // Connecting line: neutral (not the accent) so the two dots -- the actual data -- read as
      // the point, not the line.
      marks.push(window.Plot.link(matched, {
        x1: "priorPct", x2: "currentPct", y1: "label", y2: "label",
        stroke: BORDER_TINT, strokeWidth: 2,
      }));
      // Prior dot: a lighter/hollow tint (kind, not magnitude -- §10).
      var priorChannels = { Prior: "priorPct", "Prior value": "priorValueFmt" };
      priorChannels[tipLabelKey] = "label";
      marks.push(window.Plot.dot(matched, {
        x: "priorPct", y: "label", r: 5, fill: ACCENT_WASH, stroke: ACCENT, strokeWidth: 1.25,
        channels: priorChannels,
        tip: { format: tipFormat },
      }));
    }
    // Current dot: solid accent, drawn for every row (matched or New).
    var currentChannels = {
      Current: "currentPct", "Current value": "currentValueFmt",
      Prior: function (d) { return d.isNew ? "New — no prior position" : signedPctChangeTick(d.priorPct); },
    };
    currentChannels[tipLabelKey] = "label";
    marks.push(window.Plot.dot(rows, {
      x: "currentPct", y: "label", r: 5.5, fill: ACCENT, stroke: t.trackBorder, strokeWidth: 1,
      channels: currentChannels,
      tip: { format: tipFormat },
    }));
    marks.push(window.Plot.text(rows, {
      x: "labelAnchorX", y: "label",
      text: function (d) { return labelSet[d.label] ? (d.isNew ? "New" : d.currentPct.toFixed(1) + "%") : ""; },
      textAnchor: "start", dx: 9,
      fontFamily: FONT_MONO, fontSize: 10, fill: INK_SOFT,
    }));
    // Issuer/manager name, left of the plot area (same convention as compositionBars):
    // mono 10.5, the standardized chart typography (matches the diverging chart's rows).
    marks.push(window.Plot.text(rows, {
      x: 0, y: "label", text: "displayLabel", textAnchor: "end", dx: -8,
      fontFamily: FONT_MONO, fontSize: 10.5, fill: INK,
    }));

    var plotNode = window.Plot.plot({
      width: width,
      height: height,
      marginTop: 10,
      marginBottom: 30,
      marginLeft: DUMBBELL_MARGIN_LEFT,
      marginRight: 60,
      // Real x-axis (percent scale, so every row has a scale reference even though only the
      // biggest movers get an inline label) but a suppressed y-axis -- row names are drawn as
      // their own text mark below (ink fill + optional link support, same convention as
      // compositionBars), so Plot's own y-tick text would just duplicate it.
      x: {
        domain: [0, Math.max(10, maxPct * 1.25)],
        label: "% of reported portfolio value",
        tickFormat: function (v) { return v.toFixed(0) + "%"; },
      },
      y: { domain: domain, axis: null },
      style: { background: "transparent", overflow: "visible", fontFamily: FONT_MONO, fontSize: 10.5, color: INK_SOFT },
      marks: marks,
    });

    var chart = chartCard(opts.title || "Prior → current allocation");
    chart.body.appendChild(plotNode);
    chart.caption(
      "Each holding's share of TOTAL reported value in its OWN quarter's snapshot (" + fromLabel +
      " → " + toLabel + ") -- the numerator and denominator both come from the same filing, so " +
      "the value-unit convention cancels out of the ratio. Top " + rows.length + " of " +
      curUsable.length + " " + rowNoun.plural + " by current value" +
      (priorUsable.length ? "." : " -- no prior-quarter snapshot was available, so every " +
        "holding renders as a single “New” dot with no line.") +
      " A " + rowNoun.singular + " absent from " + fromLabel + " renders as one dot labeled " +
      "“New,” never a fabricated prior point."
    );
    return chart.root;
  }

  // ---------- Phase 5.4: portfolio value over time ----------

  var VL_ACCENT = cssVar("--accent", "#c0703a");
  var VL_INK = cssVar("--ink", "#1c1a16");
  var VL_INK_SOFT = cssVar("--ink-soft", "#6b6459");
  var VL_BORDER_TINT_RULE = cssVar("--border-tint-rule", "#e5dfd3");
  var VL_BG_CARD = cssVar("--bg-card", "#fdfbf7");
  var VL_FONT_MONO = "'IBM Plex Mono', monospace";

  // "Q2 25" from an ISO quarter-end date -- compact axis/point labels, IBM Plex Mono numerals.
  function valueLineQuarterTick(iso) {
    var p = iso.split("-");
    var q = Math.ceil(parseInt(p[1], 10) / 3);
    return "Q" + q + " " + p[0].slice(2);
  }

  function valueLineExclusionCaption(n) {
    return (
      n + (n === 1 ? " earlier quarter" : " earlier quarters") +
      " excluded: pre-2024 13F values use a different unit convention."
    );
  }

  // The standing "reported 13F long positions only" line now renders ONCE at the top of the
  // manager page (STYLE_GUIDE §6 caption-dedup rule -- Profin.standingCaveat / manager.js's
  // renderStandingCaveat). Charts below keep only what's specific to them.
  var STANDING_CAVEAT_TEXT =
    "All figures on this page are reported 13F long positions only — not AUM or the " +
    "manager's whole book; quarter-end snapshots filed with a ~45-day lag.";

  // points: [{period, value}] ascending chronological (oldest first); value is null for a gap
  // (a quarter whose fetch failed -- never a fabricated number). opts.excludedCount is the
  // count of pre-2024 quarters this manager has ingested that were dropped by the DECIDED
  // unit-convention rule (ROADMAP_UI.md 5.4: clip, don't normalize -- the SEC's `value`
  // convention changed thousands->whole-dollars ~2023 with no reliable per-filer boundary, so a
  // wrong guess would misstate the total by 3 orders of magnitude). opts.width should come from
  // Profin.measuredWidth(mountEl, fallback) -- never a hardcoded pixel width (STYLE_GUIDE §6).
  // Returns a DOM node, or null when there is truly nothing to show (no eligible quarters and
  // none excluded either).
  function valueLineChart(points, opts) {
    opts = opts || {};
    var excluded = opts.excludedCount || 0;
    var width = opts.width || 720;
    points = points || [];
    var present = points.filter(function (p) { return p && p.value !== null && p.value !== undefined; });

    var card = chartCard("Portfolio value over time");
    card.root.classList.add("value-line-chart");

    function empty(text) {
      var p = document.createElement("div");
      p.className = "trend-empty";
      p.textContent = text;
      card.body.appendChild(p);
    }

    if (!points.length) {
      if (!excluded) return null; // nothing ingested, nothing excluded -- render nothing at all
      empty(valueLineExclusionCaption(excluded));
      return card.root;
    }

    if (!present.length) {
      empty("Couldn’t load a reported value for the eligible quarter" + (points.length === 1 ? "" : "s") + ".");
      if (excluded) card.caption(valueLineExclusionCaption(excluded));
      return card.root;
    }

    if (points.length === 1) {
      // Exactly one eligible quarter -- an honest single point, never a fake one-point "line".
      var only = points[0];
      var single = document.createElement("div");
      single.className = "value-line-single";
      single.innerHTML =
        '<span class="value-line-single-value">' + esc(fmt.usd(only.value)) + "</span>" +
        '<span class="value-line-single-period">' + esc(valueLineQuarterTick(only.period)) + "</span>";
      card.body.appendChild(single);
      card.caption("Only one 2024-or-later quarter is ingested for this manager — not enough history for a trend line.");
      if (excluded) card.caption(valueLineExclusionCaption(excluded));
      return card.root;
    }

    var vals = present.map(function (p) { return p.value; });
    var maxV = Math.max.apply(null, vals), minV = Math.min.apply(null, vals);
    // Both labels sit ABOVE their dot, never below: a below-placed label on the first/last
    // point collides with the x-axis quarter tick directly underneath it (confirmed against a
    // real render -- a falling line puts the min at the last point, right above its own tick).
    function extremeLabel(v) {
      var matches = present.filter(function (p) { return p.value === v; });
      if (!matches.length) return null;
      return Plot.text(matches, {
        x: "period", y: "value", dy: -12,
        text: function (d) { return fmt.usd(d.value); },
        fontFamily: VL_FONT_MONO, fontWeight: 700, fontSize: 10.5, fill: VL_INK,
      });
    }

    var plotNode = window.Plot.plot({
      width: width,
      height: 150,
      marginLeft: 20,
      marginRight: 20,
      marginTop: 26,
      marginBottom: 26,
      style: { fontFamily: VL_FONT_MONO, fontSize: 10.5, background: "transparent", color: VL_INK_SOFT, overflow: "visible" },
      x: { type: "point", tickFormat: valueLineQuarterTick, label: null },
      y: { axis: null, nice: true },
      marks: [
        Plot.gridY({ stroke: VL_BORDER_TINT_RULE, strokeOpacity: 0.6 }),
        // The line breaks wherever `value` is null (a gap quarter) -- Plot never interpolates
        // across an undefined/null channel value; this is never done manually.
        Plot.lineY(points, { x: "period", y: "value", stroke: VL_ACCENT, strokeWidth: 1.75, curve: "linear" }),
        Plot.dot(present, { x: "period", y: "value", r: 3.5, fill: VL_ACCENT, stroke: VL_BG_CARD, strokeWidth: 1.5 }),
        Plot.dot(present, {
          x: "period", y: "value", r: 9, fill: "transparent",
          channels: { quarter: function (d) { return valueLineQuarterTick(d.period); }, value: "value" },
          tip: { format: { x: false, y: false, quarter: true, value: function (v) { return fmt.usd(v); } } },
        }),
        extremeLabel(maxV),
        maxV !== minV ? extremeLabel(minV) : null,
      ].filter(Boolean),
    });

    card.body.appendChild(plotNode);
    var hasGap = points.some(function (p) { return p.value === null || p.value === undefined; });
    // Chart-specific captions only -- the standing "reported 13F long positions only" line now
    // lives once at the top of the page (STYLE_GUIDE §6 caption-dedup rule), not here.
    if (hasGap) card.caption("Gaps are quarters that failed to load, not interpolated.");
    if (excluded) card.caption(valueLineExclusionCaption(excluded));
    return card.root;
  }

  // ---------- Phase 5 polish: position-count strip (sibling small multiple to valueLineChart)
  //
  // points: [{period, value, positions}] -- same shape loadValueSeries already builds for the
  // value line (period ascending chronological, oldest first); `positions` is the count of
  // holdings rows on that quarter's fetched snapshot, or null for a gap (the quarter's fetch
  // failed -- same failure that gaps the value line, never a separate/different gap set). NO
  // new network fetches: this reads fields already present on the value line's points array.
  // Deliberately never a second y-axis on the value-line plot (STYLE_GUIDE anti-dual-axis rule)
  // -- a second, smaller Plot chart instead, sharing the same x-domain/tick treatment so the
  // two read as small multiples. Returns a DOM node, or null when there's nothing to plot.
  function positionCountChart(points, opts) {
    opts = opts || {};
    var width = opts.width || 720;
    points = (points || []).map(function (p) {
      return { period: p.period, value: p && p.positions !== null && p.positions !== undefined ? p.positions : null };
    });
    var present = points.filter(function (p) { return p.value !== null && p.value !== undefined; });
    if (!points.length || !present.length) return null;

    var card = chartCard(null);
    card.root.classList.add("position-count-chart");

    if (points.length === 1) {
      var only = points[0];
      var single = document.createElement("div");
      single.className = "value-line-single";
      single.innerHTML =
        '<span class="value-line-single-value">' + esc(String(only.value)) + "</span>" +
        '<span class="value-line-single-period">' + esc(valueLineQuarterTick(only.period)) + "</span>";
      card.body.appendChild(single);
      card.caption("Positions reported per quarter.");
      return card.root;
    }

    var plotNode = window.Plot.plot({
      width: width,
      height: 72,
      marginLeft: 28,
      marginRight: 12,
      marginTop: 6,
      marginBottom: 20,
      style: { fontFamily: VL_FONT_MONO, fontSize: 10.5, background: "transparent", color: VL_INK_SOFT, overflow: "visible" },
      x: { type: "point", tickFormat: valueLineQuarterTick, label: null },
      y: { grid: true, nice: true, ticks: 3, tickFormat: Math.round, label: null },
      marks: [
        Plot.gridY({ stroke: VL_BORDER_TINT_RULE, strokeOpacity: 0.6 }),
        // Same rule as the value line: a null `value` breaks the line rather than interpolating.
        Plot.lineY(points, { x: "period", y: "value", stroke: VL_ACCENT, strokeWidth: 1.5, curve: "linear" }),
        Plot.dot(present, { x: "period", y: "value", r: 2.75, fill: VL_ACCENT, stroke: VL_BG_CARD, strokeWidth: 1.25 }),
        Plot.dot(present, {
          x: "period", y: "value", r: 8, fill: "transparent",
          channels: { quarter: function (d) { return valueLineQuarterTick(d.period); }, positions: "value" },
          tip: { format: { x: false, y: false, quarter: true, positions: true } },
        }),
      ],
    });

    card.body.appendChild(plotNode);
    card.caption("Positions reported per quarter.");
    return card.root;
  }

  // ---------- Phase 5 polish: ingestion coverage strip ----------
  //
  // periods: the `/managers/{cik}/periods` list (report_period ISO quarter-end strings, any
  // order) -- already fetched by the caller (manager.js's loadPeriods), no new requests. Fills
  // in every CALENDAR quarter-end between the oldest and newest ingested period and marks each
  // as filled (a snapshot is ingested for it) or hollow (a calendar quarter in range with no
  // snapshot) -- makes "empty ≠ never filed" visible instead of prose-only (ROADMAP_UI.md). A
  // hand-rolled SVG (STYLE_GUIDE §6 permits this for charts simple enough not to need Plot's
  // scales/marks) wrapped in the same chartCard chrome as every other Plot builder. Returns a
  // DOM node, or null when there's nothing ingested at all.
  function nextCalendarQuarterEnd(iso) {
    var p = iso.split("-");
    var year = parseInt(p[0], 10), month = p[1];
    if (month === "12") return (year + 1) + "-03-31";
    var nextEnd = { "03": "06-30", "06": "09-30", "09": "12-31" }[month];
    return nextEnd ? year + "-" + nextEnd : null; // non-calendar-quarter-end date -- stop rather than guess
  }

  function ingestionCoverageStrip(periods, opts) {
    opts = opts || {};
    var ingested = (periods || []).slice();
    if (!ingested.length) return null;
    var sorted = ingested.slice().sort(); // ISO YYYY-MM-DD sorts chronologically as strings
    var ingestedSet = {};
    ingested.forEach(function (p) { ingestedSet[p] = true; });

    var all = [sorted[0]];
    var guard = 0;
    while (all[all.length - 1] < sorted[sorted.length - 1] && guard++ < 400) {
      var next = nextCalendarQuarterEnd(all[all.length - 1]);
      if (!next) break; // unrecognized date shape -- stop rather than fabricate a gap
      all.push(next);
    }

    var card = chartCard("Ingested 13F quarters");
    card.root.classList.add("coverage-strip");

    var svgNS = "http://www.w3.org/2000/svg";
    var STEP = 26, PAD = 14, H = 36, R = 5;
    var width = Math.max(opts.width || 0, all.length > 1 ? PAD * 2 + (all.length - 1) * STEP : PAD * 2);
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", width);
    svg.setAttribute("height", H);
    svg.setAttribute("viewBox", "0 0 " + width + " " + H);

    all.forEach(function (q, i) {
      var cx = PAD + i * STEP;
      var cy = H / 2 - 3;
      var filled = !!ingestedSet[q];
      var circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", R);
      circle.setAttribute("fill", filled ? VL_ACCENT : "transparent");
      circle.setAttribute("stroke", VL_ACCENT);
      circle.setAttribute("stroke-width", "1.5");
      var title = document.createElementNS(svgNS, "title");
      title.textContent = valueLineQuarterTick(q) + (filled ? " — ingested" : " — not ingested");
      circle.appendChild(title);
      svg.appendChild(circle);
      if (i === 0 || i === all.length - 1 || all.length <= 6) {
        var text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", cx);
        text.setAttribute("y", H - 3);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-family", VL_FONT_MONO);
        text.setAttribute("font-size", "10.5");
        text.setAttribute("fill", VL_INK_SOFT);
        text.textContent = valueLineQuarterTick(q);
        svg.appendChild(text);
      }
    });

    card.body.appendChild(svg);
    card.caption(
      "Ingested 13F quarters — a hollow tick means no snapshot ingested, not that the manager didn’t file."
    );
    return card.root;
  }

  // ---------- paginated table (client-side pager over an already-fetched row set) ----------
  //
  // The 13F tables (a manager's holdings, an issuer's holders, derived activity) are unbounded
  // on real data -- a large filer reports thousands of positions -- so the detail tables page
  // client-side instead of rendering every row. This pages the DOM only: the full row set is
  // already fetched and the charts/tiles above always summarize ALL rows, so pagination never
  // changes what the numbers mean.
  //
  // opts: { headHtml    -- "<tr>...</tr>" for <thead> (same markup the inline tables used),
  //         rows        -- full row array,
  //         renderRow   -- function(row) -> "<tr>...</tr>" HTML string,
  //         pageSize    -- rows per page (default 25),
  //         captionHtml -- optional caption under the table; built by callers from
  //                        already-escaped pieces, same as the old inline captions }
  // Returns a DOM node. The pager row (range label + Prev/Next) only renders when there is
  // more than one page -- a table that fits on one page looks exactly like before.
  function paginatedTable(opts) {
    opts = opts || {};
    var rows = opts.rows || [];
    var pageSize = opts.pageSize || 25;
    var pages = Math.max(1, Math.ceil(rows.length / pageSize));
    var page = 0;

    var root = document.createElement("div");
    root.className = "paged-table";
    var table = document.createElement("table");
    table.className = "stmt-table";
    table.innerHTML = "<thead>" + (opts.headHtml || "") + "</thead><tbody></tbody>";
    root.appendChild(table);
    var tbody = table.querySelector("tbody");

    var label = null, prev = null, next = null;
    if (pages > 1) {
      var pager = document.createElement("div");
      pager.className = "table-pager";
      prev = document.createElement("button");
      prev.type = "button";
      prev.className = "pager-btn";
      prev.textContent = "← Prev";
      label = document.createElement("span");
      label.className = "pager-label";
      next = document.createElement("button");
      next.type = "button";
      next.className = "pager-btn";
      next.textContent = "Next →";
      pager.appendChild(prev);
      pager.appendChild(label);
      pager.appendChild(next);
      prev.addEventListener("click", function () { if (page > 0) { page -= 1; draw(); } });
      next.addEventListener("click", function () { if (page < pages - 1) { page += 1; draw(); } });
      root.appendChild(pager);
    }
    if (opts.captionHtml) {
      var cap = document.createElement("p");
      cap.className = "stmt-caption";
      cap.innerHTML = opts.captionHtml;
      root.appendChild(cap);
    }

    function draw() {
      var start = page * pageSize;
      var slice = rows.slice(start, start + pageSize);
      tbody.innerHTML = slice.map(opts.renderRow).join("");
      if (label) {
        label.textContent = (start + 1) + "–" + (start + slice.length) + " of " + rows.length;
        prev.disabled = page === 0;
        next.disabled = page >= pages - 1;
      }
    }
    draw();
    return root;
  }

  window.Profin = {
    api: api,
    resolveSymbol: resolveSymbol,
    getKey: getKey,
    setKey: setKey,
    clearKey: clearKey,
    mountNeedsKey: mountNeedsKey,
    esc: esc,
    fmt: fmt,
    STATUS: STATUS,
    DISCLOSURES: DISCLOSURES,
    statusChip: statusChip,
    statusLegend: statusLegend,
    sparkline: sparkline,
    trendChart: trendChart,
    trajectoryChart: trajectoryChart,
    measuredWidth: measuredWidth,
    chartCard: chartCard,
    paginatedTable: paginatedTable,
    compositionBars: compositionBars,
    statTiles: statTiles,
    positionBar: positionBar,
    divergingBars: divergingBars,
    activitySummaryTiles: activitySummaryTiles,
    dumbbellChart: dumbbellChart,
    valueLineChart: valueLineChart,
    positionCountChart: positionCountChart,
    ingestionCoverageStrip: ingestionCoverageStrip,
    standingCaveatText: STANDING_CAVEAT_TEXT,
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
