(function () {
  "use strict";

  var API_BASE = "/v1/companies/";
  var CHIPS = ["AAPL", "MSFT", "NVDA"];
  var STATEMENTS = [
    ["income", "Income"],
    ["balance", "Balance"],
    ["cashflow", "Cash Flow"],
  ];
  var STATEMENT_TITLES = {
    income: "Income Statement",
    balance: "Balance Sheet",
    cashflow: "Cash Flow Statement",
  };

  // Display-only row hierarchy, keyed by the canonical_concept the API already returns.
  // This does not duplicate the tag->concept mapping (that stays server-side in
  // normalize/mapping.py) — it only decides indentation/weight for concepts we already know.
  var EMPH = {
    // income
    revenue: "line",
    cost_of_revenue: "indent",
    gross_profit: "sub",
    research_and_development: "indent",
    sga_expense: "indent",
    operating_expenses: "indent",
    operating_income: "sub",
    interest_expense: "indent",
    interest_income: "indent",
    nonoperating_income_expense: "indent",
    income_before_tax: "sub",
    income_tax_expense: "indent",
    current_income_tax_expense: "indent",
    deferred_income_tax_expense: "indent",
    effective_tax_rate: "indent",
    net_income: "total",
    net_income_noncontrolling: "indent",
    comprehensive_income: "sub",
    other_comprehensive_income: "indent",
    eps_basic: "ps",
    eps_diluted: "ps",
    dividends_per_share: "ps",
    amortization_of_intangibles: "indent",
    goodwill_impairment: "indent",
    asset_impairment: "indent",
    operating_lease_cost: "indent",
    // balance
    cash_and_equivalents: "line",
    cash_and_restricted_cash: "indent",
    allowance_for_doubtful_accounts: "indent",
    total_current_assets: "sub",
    accumulated_depreciation: "indent",
    ppe_net: "sub",
    assets_noncurrent: "sub",
    total_assets: "total",
    total_current_liabilities: "sub",
    liabilities_noncurrent: "sub",
    total_liabilities: "sub",
    long_term_debt: "indent",
    common_stock_value: "indent",
    preferred_stock_value: "indent",
    additional_paid_in_capital: "indent",
    retained_earnings: "indent",
    accumulated_oci: "indent",
    noncontrolling_interest: "indent",
    stockholders_equity: "total",
    liabilities_and_equity: "total",
    shares_outstanding: "ps",
    // cashflow
    cash_from_operations: "sub",
    cash_from_investing: "sub",
    cash_from_financing: "sub",
    capital_expenditures: "indent",
    depreciation_amortization: "indent",
    change_in_receivables: "indent",
    change_in_inventories: "indent",
    change_in_prepaid_expenses: "indent",
    change_in_payables: "indent",
    change_in_accrued_liabilities: "indent",
    change_in_payables_and_accrued: "indent",
    change_in_deferred_revenue: "indent",
    acquisitions_net_of_cash: "indent",
    proceeds_from_stock_issuance: "indent",
    proceeds_from_long_term_debt: "indent",
    repayments_of_debt: "indent",
    effect_of_exchange_rate_on_cash: "indent",
    change_in_cash: "total",
  };
  // Section starts (visual break above the row): per-share block on income,
  // liabilities then equity on balance, supplemental payments block on cashflow.
  var BREAK_BEFORE = {
    eps_basic: true,
    accounts_payable: true,
    common_stock_value: true,
    dividends_paid: true,
    income_taxes_paid: true,
  };

  var state = {
    symbol: null,
    cik: null,
    statement: "income",
    year: null,
    period: null,
    tickerValue: "",
    periodsList: [],
    view: "loading", // loading | 404 | empty | ready
    error404: { title: "", copy: "", showChips: true },
    result: null,
    showAudit: false,
    showJson: false,
    revealed: {},
  };
  var requestToken = 0;

  function qs(id) { return document.getElementById(id); }

  // ---------- formatting ----------

  // Four unit shapes, distinguished before formatting -- a bare share COUNT must not
  // get $-formatting (pre-tranche bug: isShareUnit() treated "shares" and "USD/shares"
  // identically, so weighted-average share counts rendered as dollars), and ratio
  // units (effective_tax_rate is "pure") are neither dollars nor shares.
  function unitKind(unit) {
    var u = typeof unit === "string" ? unit.toLowerCase() : "";
    if (u.indexOf("share") !== -1 && u.indexOf("/") !== -1) return "pershare"; // USD/shares
    if (u.indexOf("share") !== -1) return "count";
    if (u === "pure" || u === "rate") return "ratio";
    return "usd";
  }

  function abbrevNumber(a) {
    if (a >= 1e12) return (a / 1e12).toFixed(2) + "T";
    if (a >= 1e9) return (a / 1e9).toFixed(1) + "B";
    if (a >= 1e6) return (a / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return (a / 1e3).toFixed(1) + "K";
    return String(a);
  }

  function fmtAbbrev(v, kind) {
    var neg = v < 0, a = Math.abs(v);
    if (kind === "pershare") return (neg ? "($" : "$") + a.toFixed(2) + (neg ? ")" : "");
    if (kind === "count") return (neg ? "(" : "") + abbrevNumber(a) + (neg ? ")" : "");
    if (kind === "ratio") return (v * 100).toFixed(1) + "%";
    var s = abbrevNumber(a);
    return neg ? "($" + s + ")" : "$" + s;
  }

  function fmtExact(v, kind) {
    var neg = v < 0, a = Math.abs(v);
    if (kind === "pershare") return "$" + v.toFixed(2) + " /sh";
    if (kind === "count") return (neg ? "(" : "") + a.toLocaleString("en-US") + (neg ? ")" : "");
    if (kind === "ratio") return String(v);
    return (neg ? "($" : "$") + a.toLocaleString("en-US") + (neg ? ")" : "");
  }

  // ---------- URL sync ----------

  function syncUrl(replace) {
    var params = new URLSearchParams();
    if (state.symbol) params.set("symbol", state.symbol);
    if (state.statement) params.set("statement", state.statement);
    if (state.year) params.set("year", String(state.year));
    if (state.period) params.set("period", state.period);
    var url = window.location.pathname + "?" + params.toString();
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }

  function readUrl() {
    var params = new URLSearchParams(window.location.search);
    return {
      symbol: (params.get("symbol") || "").toUpperCase() || null,
      statement: params.get("statement") || null,
      year: params.get("year") ? parseInt(params.get("year"), 10) : null,
      period: params.get("period") || null,
    };
  }

  // ---------- networking ----------

  function fetchJSON(url) {
    return fetch(url).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function resolveSymbol(sym, keepPeriod) {
    sym = (sym || "").trim().toUpperCase();
    if (!sym) return;
    state.tickerValue = sym;
    state.view = "loading";
    state.result = null;
    render();

    var token = ++requestToken;
    fetchJSON(API_BASE + encodeURIComponent(sym) + "/periods").then(function (res) {
      if (token !== requestToken) return;
      if (!res.ok) {
        state.symbol = null;
        state.periodsList = [];
        state.view = "404";
        state.error404 = {
          title: 'Unknown ticker: <span class="mono">' + escapeHtml(sym) + "</span>",
          copy: "No match in the SEC ticker map. Check the symbol, or try one of the known-good examples:",
          showChips: true,
        };
        render();
        return;
      }
      state.symbol = sym;
      state.cik = res.data.cik;
      state.periodsList = res.data.periods || [];

      if (!keepPeriod || !state.year || !state.period) {
        var fy = state.periodsList.find(function (p) { return p.period === "FY"; });
        var pick = fy || state.periodsList[0];
        if (pick) { state.year = pick.year; state.period = pick.period; }
      }
      loadStatement();
    });
  }

  function loadStatement() {
    if (!state.symbol || !state.year || !state.period) return;
    state.view = "loading";
    state.revealed = {};
    render();

    var url = API_BASE + encodeURIComponent(state.symbol) + "/statements/" + state.statement +
      "?year=" + encodeURIComponent(state.year) + "&period=" + encodeURIComponent(state.period);
    var token = ++requestToken;
    fetchJSON(url).then(function (res) {
      if (token !== requestToken) return;
      if (!res.ok) {
        state.result = null;
        state.view = "404";
        state.error404 = {
          title: "No data for this period",
          copy: (res.data && res.data.detail) ||
            ("No " + state.statement + " data found for " + state.symbol + " " + state.period + " " + state.year + "."),
          showChips: true,
        };
        render();
        return;
      }
      state.result = res.data;
      state.view = (res.data.lines && res.data.lines.length) ? "ready" : "empty";
      syncUrl(true);
      render();
    });
  }

  // ---------- interaction handlers ----------

  function onTickerSubmit() {
    resolveSymbol(qs("tickerInput").value, false);
  }

  function onChipSelect(sym) {
    resolveSymbol(sym, false);
  }

  function onStatementSelect(id) {
    state.statement = id;
    loadStatement();
  }

  function onPeriodSelect(year, period) {
    state.year = year;
    state.period = period;
    loadStatement();
  }

  function onRevealToggle(concept) {
    state.revealed[concept] = !state.revealed[concept];
    renderResults();
  }

  function onAuditToggle() {
    state.showAudit = !state.showAudit;
    renderResults();
  }

  function onJsonToggle() {
    state.showJson = !state.showJson;
    renderResults();
  }

  // ---------- rendering ----------

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = String(s);
    return div.innerHTML;
  }

  function el(tag, className, html) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function renderChips() {
    var row = qs("chipRow");
    row.innerHTML = "";
    CHIPS.forEach(function (sym) {
      var btn = el("button", "chip-btn", sym);
      btn.type = "button";
      if (state.symbol === sym) btn.classList.add("active");
      btn.addEventListener("click", function () { onChipSelect(sym); });
      row.appendChild(btn);
    });
  }

  function renderStatementControl() {
    var row = qs("statementControl");
    row.innerHTML = "";
    STATEMENTS.forEach(function (pair) {
      var id = pair[0], label = pair[1];
      var btn = el("button", "segment-btn", label);
      btn.type = "button";
      btn.setAttribute("role", "tab");
      if (state.statement === id) btn.classList.add("active");
      btn.addEventListener("click", function () { onStatementSelect(id); });
      row.appendChild(btn);
    });
  }

  var PERIOD_COLS = ["FY", "Q1", "Q2", "Q3"]; // SEC has no Q4 fiscal key; FY covers it
  var PERIOD_YEARS_VISIBLE = 5;

  function renderPeriods() {
    var row = qs("periodRow");
    row.innerHTML = "";
    if (!state.periodsList.length) return;

    // One row per fiscal year with fixed FY/Q1/Q2/Q3 slots, newest first. Fixed
    // slots make a missing period visible as a gap ("no filing on record for that
    // key") instead of silently reflowing -- the layout encodes coverage honestly.
    var byYear = {};
    state.periodsList.forEach(function (p) {
      (byYear[p.year] = byYear[p.year] || {})[p.period] = true;
    });
    var years = Object.keys(byYear).map(Number).sort(function (a, b) { return b - a; });

    // Auto-expand when a deep link selects a year below the fold; after that the
    // toggle's explicit choice wins.
    var expanded = state.periodsExpanded;
    if (expanded == null) {
      expanded = state.year != null && years.indexOf(state.year) >= PERIOD_YEARS_VISIBLE;
    }
    var shown = expanded ? years : years.slice(0, PERIOD_YEARS_VISIBLE);

    var matrix = el("div", "period-matrix", null);
    var head = el("div", "period-year-row period-matrix-head", null);
    head.appendChild(el("span", "period-year-label", ""));
    PERIOD_COLS.forEach(function (fp) {
      head.appendChild(el("span", "period-col-label", fp));
    });
    matrix.appendChild(head);

    shown.forEach(function (year) {
      var r = el("div", "period-year-row", null);
      r.appendChild(el("span", "period-year-label", String(year)));
      PERIOD_COLS.forEach(function (fp) {
        if (byYear[year][fp]) {
          var btn = el("button", "period-pill period-slot", fp);
          btn.type = "button";
          btn.setAttribute("aria-label", fp + " " + year);
          if (state.year === year && state.period === fp) btn.classList.add("active");
          btn.addEventListener("click", function () { onPeriodSelect(year, fp); });
          r.appendChild(btn);
        } else {
          var gap = el("span", "period-slot period-slot-empty", "·");
          gap.title = "No " + fp + " " + year + " filing on record";
          r.appendChild(gap);
        }
      });
      matrix.appendChild(r);
    });
    row.appendChild(matrix);

    if (years.length > PERIOD_YEARS_VISIBLE) {
      var toggle = el(
        "button",
        "period-more",
        expanded
          ? "Recent years only"
          : "All years · back to " + years[years.length - 1]
      );
      toggle.type = "button";
      toggle.addEventListener("click", function () {
        state.periodsExpanded = !expanded;
        renderPeriods();
      });
      row.appendChild(toggle);
    }
  }

  function renderResolvedLabel() {
    var elLabel = qs("resolvedLabel");
    elLabel.classList.remove("is-known", "is-404");
    if (state.view === "404" && !state.symbol) {
      elLabel.textContent = "404 · unknown ticker";
      elLabel.classList.add("is-404");
    } else if (state.symbol) {
      elLabel.textContent = state.symbol + (state.cik ? " · CIK " + state.cik : "");
      elLabel.classList.add("is-known");
    } else {
      elLabel.textContent = "";
    }
    // Contextual jump to the full metrics hub, shown once a company is resolved.
    var link = qs("viewFundamentals");
    if (state.symbol && state.cik) {
      link.href = "/company/" + encodeURIComponent(state.symbol);
      link.hidden = false;
    } else {
      link.hidden = true;
    }
    // Keep the "more datasets" strip's hub link pointed at the current company.
    var hub = qs("hubLink");
    if (hub && state.symbol) {
      hub.href = "/company/" + encodeURIComponent(state.symbol);
    }
  }

  function hideAllStates() {
    ["stateLoading", "state404", "stateEmpty", "stateReady"].forEach(function (id) {
      qs(id).hidden = true;
    });
  }

  function renderLoading() {
    var label = state.statement + " · " + (state.period || "") + " " + (state.year || "");
    qs("loadingText").textContent = "Fetching " + (state.symbol || state.tickerValue || "") +
      " " + label + " from SEC EDGAR…";
  }

  function render404() {
    qs("state404Title").innerHTML = state.error404.title;
    qs("state404Copy").textContent = state.error404.copy;
    var chipsWrap = qs("state404Chips");
    chipsWrap.innerHTML = "";
    if (state.error404.showChips) {
      CHIPS.forEach(function (sym) {
        var btn = el("button", "chip-btn", sym);
        btn.type = "button";
        btn.addEventListener("click", function () { onChipSelect(sym); });
        chipsWrap.appendChild(btn);
      });
    }
  }

  function renderEmpty() {
    var r = state.result;
    var strip = qs("emptyMetaStrip");
    strip.innerHTML =
      '<span><span class="field-label">FORM</span>' + escapeHtml(r.form || "—") + "</span>" +
      '<span><span class="field-label">FILED</span>' + escapeHtml(r.filed || "—") + "</span>" +
      '<span><span class="field-label">ACCESSION</span>' + escapeHtml(r.accession || "—") + "</span>";
    var title = STATEMENT_TITLES[state.statement];
    var periodLabel = state.period + " " + state.year;
    qs("emptyCopy").textContent =
      "We have " + state.symbol + "'s " + (r.form || "filing") + " for " + title + " (" + periodLabel +
      "), but the current mapping set didn't resolve any lines for this statement. " +
      "The canonical concept map is documented as incomplete and still growing — this is a gap, not an error.";
  }

  function renderReady() {
    var r = state.result;
    qs("companyName").textContent = state.symbol;
    qs("companySub").textContent = "CIK " + r.cik + " · " + STATEMENT_TITLES[state.statement];

    var range = (r.period_start || "—") + " → " + (r.period_end || "—");
    qs("filingMetaGrid").innerHTML = [
      ["FORM", r.form], ["FILED", r.filed], ["PERIOD", range], ["ACCESSION", r.accession],
    ].map(function (pair) {
      return '<div><span class="field-label">' + pair[0] + "</span>" + escapeHtml(pair[1] || "—") + "</div>";
    }).join("");

    qs("rowCountLabel").textContent = r.lines.length + " concepts mapped";

    var jsonBtn = qs("jsonToggleBtn");
    jsonBtn.setAttribute("aria-pressed", String(state.showJson));
    jsonBtn.textContent = (state.showJson ? "●" : "{ }") + " View raw JSON";

    var auditBtn = qs("auditToggleBtn");
    auditBtn.setAttribute("aria-pressed", String(state.showAudit));
    auditBtn.textContent = (state.showAudit ? "●" : "○") + " Show your work";

    qs("tableNormal").hidden = state.showAudit;
    qs("tableAudit").hidden = !state.showAudit;

    var rowsNormal = qs("rowsNormal");
    rowsNormal.innerHTML = "";
    var rowsAudit = qs("rowsAudit");
    rowsAudit.innerHTML = "";

    r.lines.forEach(function (line) {
      var emph = EMPH[line.canonical_concept] || "line";
      var kind = unitKind(line.unit);
      var revealedFlag = !!state.revealed[line.canonical_concept];
      var valueText = revealedFlag ? fmtExact(line.value, kind) : fmtAbbrev(line.value, kind);

      var normalRow = el("div", "data-row emph-" + emph);
      if (BREAK_BEFORE[line.canonical_concept]) normalRow.classList.add("row-break");
      var labelSpan = el("span", "row-label", escapeHtml(line.label));
      var valWrap = el("div");
      valWrap.style.display = "flex";
      valWrap.style.alignItems = "baseline";
      valWrap.style.gap = "12px";
      var valSpan = el("span", "row-value" + (revealedFlag ? " revealed" : ""), escapeHtml(valueText));
      valSpan.addEventListener("click", (function (concept) {
        return function () { onRevealToggle(concept); };
      })(line.canonical_concept));
      var unitSpan = el(
        "span",
        "row-unit",
        { pershare: "per sh", count: "shares", ratio: "ratio", usd: "USD" }[kind]
      );
      valWrap.appendChild(valSpan);
      valWrap.appendChild(unitSpan);
      normalRow.appendChild(labelSpan);
      normalRow.appendChild(valWrap);
      rowsNormal.appendChild(normalRow);

      var auditRow = el("div", "audit-row emph-" + emph);
      var badgeGroup = el("div", "audit-tag-group");
      var badge = el("span", "audit-badge " + (line.is_extension ? "ext" : "gaap"),
        line.is_extension ? "EXT" : "US-GAAP");
      var code = document.createElement("code");
      code.textContent = line.source_tag;
      badgeGroup.appendChild(badge);
      badgeGroup.appendChild(code);
      var arrow = el("div", "audit-arrow", "→");
      var resultGroup = el("div", "audit-result-group");
      var auditLabel = el("span", "row-label", escapeHtml(line.label));
      var auditValue = el("span", "row-value", escapeHtml(fmtAbbrev(line.value, kind)));
      resultGroup.appendChild(auditLabel);
      resultGroup.appendChild(auditValue);
      auditRow.appendChild(badgeGroup);
      auditRow.appendChild(arrow);
      auditRow.appendChild(resultGroup);
      rowsAudit.appendChild(auditRow);
    });

    var jsonPre = qs("rawJson");
    jsonPre.hidden = !state.showJson;
    if (state.showJson) jsonPre.textContent = JSON.stringify(r, null, 2);
  }

  function renderResults() {
    hideAllStates();
    if (state.view === "loading") {
      qs("stateLoading").hidden = false;
      renderLoading();
    } else if (state.view === "404") {
      qs("state404").hidden = false;
      render404();
    } else if (state.view === "empty") {
      qs("stateEmpty").hidden = false;
      renderEmpty();
    } else if (state.view === "ready") {
      qs("stateReady").hidden = false;
      renderReady();
    }
    renderResolvedLabel();
  }

  function render() {
    renderChips();
    renderStatementControl();
    renderPeriods();
    renderResults();
  }

  // ---------- init ----------

  document.addEventListener("DOMContentLoaded", function () {
    qs("lookupBtn").addEventListener("click", onTickerSubmit);
    qs("tickerInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") onTickerSubmit();
    });
    // Autocomplete (shared suggest.js; its capture-phase keydown consumes Enter when a
    // row is highlighted, so the plain-Enter lookup above still works for typed text).
    if (window.ProfinSuggest) {
      window.ProfinSuggest.attach(qs("tickerInput"), {
        onPick: function () { onTickerSubmit(); },
      });
    }
    qs("auditToggleBtn").addEventListener("click", onAuditToggle);
    qs("jsonToggleBtn").addEventListener("click", onJsonToggle);

    var fromUrl = readUrl();
    var initialSymbol = fromUrl.symbol || "AAPL";
    qs("tickerInput").value = initialSymbol;
    state.tickerValue = initialSymbol;
    if (fromUrl.statement) state.statement = fromUrl.statement;
    if (fromUrl.year) state.year = fromUrl.year;
    if (fromUrl.period) state.period = fromUrl.period;

    resolveSymbol(initialSymbol, !!(fromUrl.year && fromUrl.period));
  });
})();
