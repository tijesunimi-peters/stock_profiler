/* Company hub — /company/{symbol}. Fundamentals + Statements tabs over the v1 API, built from
 * the shared Profin components (app.js). Display-only maps (metric categories, formulas,
 * statement row emphasis) live here, keyed by the canonical concepts the API already returns —
 * they duplicate no server logic (same pattern as explorer.js's EMPH map).
 */
(function () {
  "use strict";
  var P = window.Profin;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- display-only maps ----------

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

  var STMT_TITLES = { income: "Income Statement", balance: "Balance Sheet", cashflow: "Cash Flow Statement" };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ---------- state ----------

  var symbol = decodeURIComponent((location.pathname.split("/").filter(Boolean).pop() || "").trim());
  var state = {
    cik: null,
    fyYears: [], // statement-layer FY years (for the Statements tab)
    fundPeriods: [], // {year, period, period_end} the metric engine can compute (Fundamentals)
    tab: "fundamentals",
    statement: "income",
    fundValue: null, // "year|period" selected on Fundamentals
    stmtValue: null, // "year|FY" selected on Statements
  };

  function monthYear(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    return MONTHS[parseInt(p[1], 10) - 1] + " " + p[0];
  }

  // ---------- init ----------

  function init() {
    $("footer").innerHTML = P.footer();
    $("masthead").innerHTML = P.masthead({
      eyebrow: "Profin — SEC data, normalized",
      title: symbol ? symbol.toUpperCase() : "Company",
    });
    P.mountSearch($("search"), {
      onResolved: function (sym) { location.href = "/company/" + encodeURIComponent(sym); },
      onNotFound: function (sym) { $("view").innerHTML = P.states.notFound({ copy: 'We don\'t carry "' + sym + '".' }); },
      onError: function () { $("view").innerHTML = P.states.error({}); },
    });

    if (!symbol) { $("view").innerHTML = P.states.empty({ title: "No company", copy: "Search for a ticker or CIK above." }); return; }

    $("view").innerHTML = P.states.loading({ title: "Loading " + symbol.toUpperCase() });
    P.resolveSymbol(symbol).then(onResolved, onResolveError);

    $("tabs").addEventListener("click", onTabClick);
    $("stmt-types").addEventListener("click", onStmtClick);
    $("period-select").addEventListener("change", onPeriodChange);
  }

  function onResolved(data) {
    state.cik = data.cik;
    // Statement-layer FY years (the axis /statements resolves on).
    var fyYears = [];
    (data.periods || []).forEach(function (p) { if (p.period === "FY" && fyYears.indexOf(p.year) === -1) fyYears.push(p.year); });
    fyYears.sort(function (a, b) { return b - a; });
    state.fyYears = fyYears;
    state.stmtValue = fyYears.length ? fyYears[0] + "|FY" : null;

    $("masthead").innerHTML = P.masthead({
      eyebrow: "Profin — SEC data, normalized",
      title: symbol.toUpperCase(),
      meta: ["CIK " + data.cik, "as-of latest filing"],
    });

    // The Fundamentals axis is the metric engine's own resolvable periods (annual + quarterly,
    // including the in-progress fiscal year) — NOT the statement-layer (fy, fp) labels.
    P.api("/companies/" + encodeURIComponent(symbol) + "/metric-periods").then(
      function (mp) {
        state.fundPeriods = mp.periods || [];
        // Default to the latest FULL fiscal year so the annual view (with the intra-year
        // quarterly sparklines) is what loads; fall back to the newest period otherwise.
        var def = state.fundPeriods.filter(function (p) { return p.period === "FY"; })[0]
          || state.fundPeriods[0];
        state.fundValue = def ? def.year + "|" + def.period : null;
        if (!state.fundPeriods.length && !state.fyYears.length) {
          $("view").innerHTML = P.states.empty({ title: "No computable periods", copy: "Filings are on record but no complete period to compute from yet." });
          return;
        }
        $("controls").hidden = false;
        applyTabFromUrl();
        populatePeriodSelect();
        render();
      },
      function () {
        // Metric periods failed but statements may still work — degrade to Statements only.
        state.fundPeriods = [];
        $("controls").hidden = false;
        applyTabFromUrl();
        populatePeriodSelect();
        render();
      }
    );
  }

  // Deep-link support: /company/{symbol}?tab=insider selects a tab on load (shareable URLs,
  // and lets the e2e check target a tab directly).
  function applyTabFromUrl() {
    var t = new URLSearchParams(location.search).get("tab");
    if (["fundamentals", "statements", "insider", "beneficial"].indexOf(t) !== -1) state.tab = t;
    var btn = document.querySelector('#tabs button[data-tab="' + state.tab + '"]');
    if (btn) setOn("#tabs button", btn);
    $("stmt-types").hidden = state.tab !== "statements";
    $("period-control").hidden = NON_PERIOD_TABS.indexOf(state.tab) !== -1;
  }

  // ---------- period control ----------

  function populatePeriodSelect() {
    var sel = $("period-select");
    if (state.tab === "fundamentals") {
      $("period-label").textContent = "Period";
      sel.innerHTML = state.fundPeriods
        .map(function (p) {
          var label = p.period === "FY" ? "FY " + p.year : "FY" + p.year + " " + p.period + " · " + monthYear(p.period_end);
          return '<option value="' + p.year + "|" + p.period + '">' + P.esc(label) + "</option>";
        })
        .join("");
      if (state.fundValue) sel.value = state.fundValue;
    } else {
      $("period-label").textContent = "Fiscal year";
      sel.innerHTML = state.fyYears.map(function (y) { return '<option value="' + y + '|FY">FY ' + y + "</option>"; }).join("");
      if (state.stmtValue) sel.value = state.stmtValue;
    }
  }

  function onPeriodChange(e) {
    if (state.tab === "fundamentals") state.fundValue = e.target.value;
    else state.stmtValue = e.target.value;
    render();
  }

  function currentSel() {
    var v = state.tab === "fundamentals" ? state.fundValue : state.stmtValue;
    if (!v) return null;
    var parts = v.split("|");
    return { year: parseInt(parts[0], 10), period: parts[1] };
  }

  function onResolveError(err) {
    if (err.status === 404) {
      $("view").innerHTML = P.states.notFound({
        copy: 'We don\'t carry "' + symbol + '". Check the ticker, or try a raw CIK.',
        recovery: [{ label: "Data Explorer ↗", href: "/explorer" }],
      });
    } else {
      $("view").innerHTML = P.states.error({ copy: "Lookup failed (" + (err.status || "network") + ")." });
    }
  }

  // ---------- tab / control handlers ----------

  function onTabClick(e) {
    var btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    state.tab = btn.getAttribute("data-tab");
    setOn("#tabs button", btn);
    $("stmt-types").hidden = state.tab !== "statements";
    // Insider / 13D-G are bounded by a filing limit, not a period -- hide the period picker.
    $("period-control").hidden = NON_PERIOD_TABS.indexOf(state.tab) !== -1;
    if (NON_PERIOD_TABS.indexOf(state.tab) === -1) populatePeriodSelect(); // axis differs per tab
    render();
  }
  function onStmtClick(e) {
    var btn = e.target.closest("button[data-stmt]");
    if (!btn) return;
    state.statement = btn.getAttribute("data-stmt");
    setOn("#stmt-types button", btn);
    render();
  }
  function setOn(sel, active) {
    document.querySelectorAll(sel).forEach(function (b) { b.classList.toggle("on", b === active); });
  }

  // ---------- render ----------

  var NON_PERIOD_TABS = ["insider", "beneficial"]; // tabs bounded by a filing limit, not a period

  function render() {
    if (state.tab === "fundamentals") renderFundamentals();
    else if (state.tab === "statements") renderStatements();
    else if (state.tab === "insider") renderInsider();
    else renderBeneficial();
  }

  var BENEFICIAL_LIMIT = 25;

  function renderBeneficial() {
    $("legend").innerHTML = "";
    $("disclosure").innerHTML = P.disclosure(["ownership_13dg_floor", "not_advice"]);
    // Gated endpoint: no key -> prompt for one before spending a request.
    if (!P.getKey()) {
      P.mountNeedsKey($("view"), renderBeneficial);
      return;
    }
    $("view").innerHTML = P.states.loading({ title: "Loading 13D/G filings" });
    P.api("/companies/" + encodeURIComponent(symbol) + "/beneficial-ownership?limit=" + BENEFICIAL_LIMIT).then(
      function (res) {
        var rows = res.beneficial_ownership || [];
        if (!rows.length) {
          $("view").innerHTML = P.states.empty({
            title: "No 13D/G on record",
            copy: "No structured-XML Schedule 13D/13G (5%+) filings for this issuer in coverage " +
              "(parsed from ~mid-2025 on) — read as outside the window, not 'nobody crossed 5%'.",
          });
          return;
        }
        $("view").innerHTML = beneficialTable(rows);
      },
      function (err) {
        if (err.status === 401) {
          P.mountNeedsKey($("view"), renderBeneficial);
        } else {
          $("view").innerHTML = P.states.error({ copy: "Couldn't load 13D/G filings (" + (err.status || "network") + ")." });
        }
      }
    );
  }

  function beneficialTable(rows) {
    var body = rows.map(function (o) {
      var pct = o.percent_of_class != null ? o.percent_of_class.toFixed(1) + "%" : "—";
      var shares = o.shares_beneficially_owned != null ? P.fmt.shares(o.shares_beneficially_owned) : "—";
      return (
        "<tr>" +
        '<td class="stmt-tag">' + P.esc(o.filed || o.event_date || "—") + "</td>" +
        '<td class="stmt-label">' + P.esc(o.owner_name || "—") + "</td>" +
        '<td class="stmt-tag">' + P.esc(o.form_type || "—") + "</td>" +
        '<td class="amt stmt-amt">' + P.esc(pct) + "</td>" +
        '<td class="amt stmt-amt">' + P.esc(shares) + "</td>" +
        '<td class="stmt-tag">' + P.esc(o.event_date || "—") + "</td>" +
        "</tr>"
      );
    }).join("");
    return (
      '<table class="stmt-table"><thead><tr>' +
      "<th>Filed</th><th>Beneficial owner</th><th>Form</th>" +
      '<th class="amt">% of class</th><th class="amt">Shares</th><th>Event date</th>' +
      "</tr></thead><tbody>" + body + "</tbody></table>" +
      '<p class="stmt-caption">Schedule 13D/13G (5%+ ownership) as filed · structured-XML filings ' +
      "only (~mid-2025 on) · 13D = activist, 13G = passive. As-reported, not derived.</p>"
    );
  }

  var INSIDER_LIMIT = 25;

  function renderInsider() {
    $("legend").innerHTML = "";
    $("disclosure").innerHTML = P.disclosure(["not_advice"]);
    $("view").innerHTML = P.states.loading({ title: "Loading insider filings" });
    P.api("/companies/" + encodeURIComponent(symbol) + "/insider-trades?limit=" + INSIDER_LIMIT).then(
      function (rows) {
        if (!rows || !rows.length) {
          $("view").innerHTML = P.states.empty({
            title: "No insider filings",
            copy: "No Forms 3/4/5 on record for this issuer in the fetched window.",
          });
          return;
        }
        $("view").innerHTML = insiderTable(rows);
      },
      function (err) {
        if (err.status === 404) {
          $("view").innerHTML = P.states.notFound({
            copy: "No insider filings for " + symbol.toUpperCase() + ".",
            recovery: [{ label: "Data Explorer ↗", href: "/explorer" }],
          });
        } else {
          $("view").innerHTML = P.states.error({ copy: "Couldn't load insider filings (" + (err.status || "network") + ")." });
        }
      }
    );
  }

  function insiderTable(rows) {
    var ACTION = { A: "Acquired", D: "Disposed" };
    var body = rows.map(function (t) {
      var action = t.is_holding ? "Holding" : (ACTION[t.acquired_disposed] || "—");
      var shares = t.shares != null ? P.fmt.shares(t.shares) : "—";
      var price = t.price_per_share != null ? P.fmt.perShare(t.price_per_share) : "—";
      var after = t.shares_owned_after != null ? P.fmt.shares(t.shares_owned_after) : "—";
      return (
        "<tr>" +
        '<td class="stmt-tag">' + P.esc(t.transaction_date || t.filed || "—") + "</td>" +
        '<td class="stmt-label">' + P.esc(t.owner_name || "—") + "</td>" +
        '<td class="stmt-tag">' + P.esc(t.owner_relationship || "—") + "</td>" +
        "<td>" + P.esc(action) + "</td>" +
        '<td class="amt stmt-amt">' + P.esc(shares) + "</td>" +
        '<td class="amt stmt-amt">' + P.esc(price) + "</td>" +
        '<td class="amt stmt-amt">' + P.esc(after) + "</td>" +
        "</tr>"
      );
    }).join("");
    return (
      '<table class="stmt-table"><thead><tr>' +
      "<th>Filed</th><th>Owner</th><th>Relationship</th><th>Action</th>" +
      '<th class="amt">Shares</th><th class="amt">Price</th><th class="amt">Shares after</th>' +
      "</tr></thead><tbody>" + body + "</tbody></table>" +
      '<p class="stmt-caption">Forms 3/4/5 as filed with the SEC · most recent ' + INSIDER_LIMIT +
      " filings · as-reported, not derived. Acquired/Disposed is the reported code, not a buy/sell judgment.</p>"
    );
  }

  function renderFundamentals() {
    var sel = currentSel();
    if (!sel) { $("view").innerHTML = P.states.empty({ title: "No period" }); return; }
    $("legend").innerHTML = P.statusLegend();
    $("disclosure").innerHTML = P.disclosure(["financials_floor", "not_advice"]);
    $("view").innerHTML = P.states.loading({ title: "Computing metrics" });
    // Honest framing for quarterly: flows are trailing-twelve-month; EPS isn't summable.
    var banner = sel.period === "FY"
      ? ""
      : '<p class="stmt-caption" style="margin:0 0 14px">Quarterly view — flow metrics are ' +
        'trailing-twelve-month (TTM) through ' + P.esc(sel.period) + "; EPS shows N/M (not summable across quarters).</p>";
    P.api("/companies/" + encodeURIComponent(symbol) + "/metrics?year=" + sel.year + "&period=" + sel.period).then(
      function (res) {
        var by = {};
        (res.metrics || []).forEach(function (m) { by[m.metric] = m; });
        var html = CATEGORIES.map(function (cat) {
          var cards = cat[1]
            .filter(function (k) { return by[k]; })
            .map(function (k) { return P.metricCard(by[k], { formula: FORMULAS[k] }); })
            .join("");
          if (!cards) return "";
          return '<section class="metric-group"><h3 class="metric-group-title">' + P.esc(cat[0]) +
            '</h3><div class="card-grid">' + cards + "</div></section>";
        }).join("");
        $("view").innerHTML = banner + (html || P.states.empty({}));
      },
      function (err) { $("view").innerHTML = metricsError(err); }
    );
  }

  function metricsError(err) {
    var sel = currentSel();
    var lbl = sel ? "FY" + sel.year + (sel.period === "FY" ? "" : " " + sel.period) : "";
    if (err.status === 404) {
      return P.states.notFound({ copy: "No metrics for " + symbol.toUpperCase() + " " + lbl + ". Try another period.", recovery: [{ label: "Data Explorer ↗", href: "/explorer" }] });
    }
    return P.states.error({ copy: "Couldn't compute metrics (" + (err.status || "network") + ")." });
  }

  function renderStatements() {
    var sel = currentSel();
    if (!sel) {
      $("view").innerHTML = P.states.empty({ title: "No fiscal year", copy: "No complete fiscal year on record to show a statement for." });
      return;
    }
    $("legend").innerHTML = ""; // statements carry EXT badges, not status chips
    $("disclosure").innerHTML = P.disclosure(["financials_floor", "not_advice"]);
    $("view").innerHTML = P.states.loading({ title: "Loading statement" });
    P.api("/companies/" + encodeURIComponent(symbol) + "/statements/" + state.statement + "?year=" + sel.year + "&period=FY").then(
      function (stmt) {
        if (!stmt.lines || !stmt.lines.length) {
          $("view").innerHTML = P.states.empty({ title: "No mapped lines", copy: "A filing is on record for this period, but no fields mapped to this statement." });
          return;
        }
        $("view").innerHTML = statementTable(stmt, sel.year);
      },
      function (err) {
        if (err.status === 404) {
          $("view").innerHTML = P.states.notFound({ copy: "No " + state.statement + " statement for FY" + sel.year + ".", recovery: [{ label: "Data Explorer ↗", href: "/explorer" }] });
        } else {
          $("view").innerHTML = P.states.error({});
        }
      }
    );
  }

  function fmtLineValue(line) {
    var v = line.value, u = (line.unit || "").toLowerCase();
    if (v === null || v === undefined) return "—";
    if (u.indexOf("share") !== -1 && u.indexOf("/") !== -1) return P.fmt.perShare(v); // USD/shares
    if (u.indexOf("share") !== -1) return P.fmt.shares(v); // share count
    return P.fmt.usd(v);
  }

  function statementTable(stmt, year) {
    var rows = stmt.lines.map(function (l) {
      var badge = l.is_extension
        ? '<span class="badge badge-ext">EXT</span>'
        : '<span class="badge badge-gaap">US-GAAP</span>';
      return (
        "<tr><td class=\"stmt-label\">" + P.esc(l.label) + "</td>" +
        '<td class="amt stmt-amt">' + P.esc(fmtLineValue(l)) + "</td>" +
        '<td class="stmt-tag">' + P.esc(l.source_tag) + " " + badge + "</td></tr>"
      );
    }).join("");
    var caption =
      "as-restated · " + P.esc(STMT_TITLES[state.statement]) + " · FY" + year +
      (stmt.form ? " · " + P.esc(stmt.form) : "") + (stmt.filed ? " · filed " + P.esc(stmt.filed) : "") +
      (stmt.accession ? " · " + P.esc(stmt.accession) : "");
    return (
      '<table class="stmt-table"><thead><tr><th>Line</th><th class="amt">Amount</th><th>Source tag</th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table>" +
      '<p class="stmt-caption">' + caption + "</p>"
    );
  }

  init();
})();
