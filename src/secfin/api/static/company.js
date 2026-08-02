/* Company hub — /company/{symbol}. Fundamentals + Statements tabs over the v1 API, built from
 * the shared ClearyFi components (app.js). Display-only maps (metric categories, formulas,
 * statement row emphasis) live here, keyed by the canonical concepts the API already returns —
 * they duplicate no server logic.
 */
(function () {
  "use strict";
  var P = window.ClearyFi;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- display-only maps ----------

  // The metric taxonomy. Groups the Overview's Financial snapshot tiles AND the Financial
  // history explorer's metric picker, so the two views name the same things the same way.
  //
  // V3-P4 added equity_multiplier / dio / dpo / ccc: /metrics has always computed and served
  // 30 metrics while this list rendered 26, so four were invisible on the page for no reason.
  var CATEGORIES = [
    ["Profitability", ["gross_margin", "operating_margin", "net_margin", "roa", "roe", "roic"]],
    ["Growth", ["revenue_growth_yoy", "earnings_growth_yoy", "ocf_growth_yoy", "growth_acceleration"]],
    ["Financial health", ["current_ratio", "quick_ratio", "debt_to_equity", "net_debt", "interest_coverage", "equity_multiplier"]],
    ["Cash flow", ["fcf", "fcf_margin", "accruals"]],
    ["Efficiency", ["asset_turnover", "inventory_turnover", "dso", "dio", "dpo", "ccc"]],
    ["Per-share", ["eps_basic", "eps_diluted", "book_value_per_share", "fcf_per_share", "share_count"]],
  ];

  // Stable DOM id for a category section (masthead anchor + section-nav target).
  function sectionId(name) {
    return "sec-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

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
    equity_multiplier: "Average total assets ÷ Average equity",
    asset_turnover: "Revenue ÷ Average total assets",
    inventory_turnover: "Cost of revenue ÷ Average inventory",
    dso: "Average receivables ÷ Revenue × 365",
    dio: "Average inventory ÷ Cost of revenue × 365",
    dpo: "Average payables ÷ Cost of revenue × 365",
    ccc: "DIO + DSO − DPO",
    eps_basic: "Reported basic EPS",
    eps_diluted: "Reported diluted EPS",
    book_value_per_share: "Equity ÷ Shares outstanding",
    fcf_per_share: "Free cash flow ÷ Diluted shares",
    share_count: "Diluted weighted-average shares",
  };

  // Display-only labels for the Financial history picker, which renders its chips BEFORE any
  // history response has arrived (the API returns the authoritative `label` on each series and
  // that is what the legend and chart use). Keyed by the same canonical metric keys /metrics
  // returns — a display map, not a duplicate of server logic.
  var METRIC_LABELS = {
    gross_margin: "Gross margin", operating_margin: "Operating margin", net_margin: "Net margin",
    roa: "ROA", roe: "ROE", roic: "ROIC",
    revenue_growth_yoy: "Revenue growth", earnings_growth_yoy: "Earnings growth",
    ocf_growth_yoy: "Operating cash-flow growth", growth_acceleration: "Growth acceleration",
    current_ratio: "Current ratio", quick_ratio: "Quick ratio", debt_to_equity: "Debt / equity",
    net_debt: "Net debt", interest_coverage: "Interest coverage", equity_multiplier: "Equity multiplier",
    fcf: "Free cash flow", fcf_margin: "FCF margin", accruals: "Accruals",
    asset_turnover: "Asset turnover", inventory_turnover: "Inventory turnover",
    dso: "DSO", dio: "DIO", dpo: "DPO", ccc: "Cash conversion cycle",
    eps_basic: "EPS (basic)", eps_diluted: "EPS (diluted)",
    book_value_per_share: "Book value / share", fcf_per_share: "FCF / share", share_count: "Share count",
  };

  var STMT_TITLES = {
    income: "Income Statement",
    balance: "Balance Sheet",
    cashflow: "Cash Flow Statement",
    segments: "Revenue by Segment — Phase-3 spike",
  };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Phase-3 dimensional spike (docs/SPIKE_DIMENSIONAL.md), merged in from the retired
  // /explorer page: a static extract for three companies, NOT an API surface. companyfacts
  // carries no dimensional facts, so this view is fed by /static/spike_dimensional.json
  // (SEC Financial Statement Data Sets).
  var SPIKE_SYMBOLS = ["AAPL", "KO", "MA"];
  var spikeData = null; // fetched once, cached for the session

  // Display-only row hierarchy for the statement view (from the retired /explorer), keyed
  // by the canonical_concept the API already returns. This does not duplicate the
  // tag->concept mapping (that stays server-side in normalize/mapping.py) — it only
  // decides indentation/weight for concepts we already know.
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
  // liabilities on balance, supplemental payments block on cashflow. The equity section
  // has no single reliable key (AAPL reports no common_stock_value), so its break is
  // resolved per-statement in statementView() — the first equity concept present.
  var BREAK_BEFORE = {
    eps_basic: true,
    accounts_payable: true,
    dividends_paid: true,
    income_taxes_paid: true,
  };
  var EQUITY_CONCEPTS = [
    "common_stock_value", "preferred_stock_value", "additional_paid_in_capital",
    "retained_earnings", "accumulated_oci", "noncontrolling_interest", "stockholders_equity",
  ];

  // ---------- state ----------

  // /company/{symbol}[/{view}] — take the segment AFTER "company", not the last one: since V3-P2
  // the path can carry a trailing view slug, and .pop() would resolve "statements" as the ticker.
  var symbol = decodeURIComponent(((location.pathname.split("/").filter(Boolean))[1] || "").trim());
  var state = {
    cik: null,
    stmtPeriods: [], // statement-layer {year, period} keys (Financial history, FY + quarters)
    fundPeriods: [], // {year, period, period_end} the metric engine can compute (Overview)
    instPeriods: null, // 13F quarter-ends with holdings data (Institutional); null = not loaded yet
    tab: "hub",
    statement: "income",
    fundValue: null, // "year|period" selected on Overview
    stmtValue: null, // "year|period" selected on Financial history
    histMetrics: ["revenue_growth_yoy"], // Financial history: metrics overlaid (max 3)
    histRange: "20q", // "8q" | "20q" | "5y"
    histCache: {}, // metric -> { quarterly: MetricHistory, annual: MetricHistory }
    profile: null, // /companies/{symbol}/profile (name + SIC), null until resolved
    lastFiled: null, // "<form> · <filed>" of the newest statement loaded (entity bar)
    tray: [], // metrics pushed into the sticky comparison tray (max 3, same ceiling as overlay)
    trayHidden: false,
    instValue: null, // quarter-end string selected on Institutional
    instGroup: "holders", // Institutional sub-view: "holders" | "geography" | "activity"
    ipSection: "ip-01", // Institutional port: which numbered section the rail's jump list marks
    stmtMode: "table", // income + balance sheet: "table" | "chart" (audit-first default)
    vizCache: {}, // "statement|year|period" -> viz response (lazy). Series: "statement|series".
  };

  function monthYear(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    return MONTHS[parseInt(p[1], 10) - 1] + " " + p[0];
  }

  // A 13F quarter-end ("2026-03-31") -> "Mar 31, 2026" for the period selector / captions.
  function quarterLabel(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    return MONTHS[parseInt(p[1], 10) - 1] + " " + parseInt(p[2], 10) + ", " + p[0];
  }

  // ---------- init ----------

  function init() {
    if (window.ClearyFiShell) {
      window.ClearyFiShell.mount();
      window.addEventListener("popstate", onPopState);
    }
    // Title row per the v3 prototype (:57-64): the surface is named, the entity sits in the meta
    // and (large) in the entity control bar below. D1 -- the prototype's IA is authoritative.
    $("masthead").innerHTML = P.masthead({
      title: "Company hub",
      meta: symbol ? symbol.toUpperCase() : "",
      lede: "Everything filed by this registrant · 10-K, 10-Q, 8-K, Forms 3/4/5 · as of latest filing",
    });
    renderEntityBar();
    renderRail(); // chrome, not data: the rail renders immediately, before any fetch resolves
    // Company lookup lives in the app shell's topbar search (shell.js); the on-page
    // #search mount is gone. Guard kept so an older shell with the div still works.
    var searchEl = $("search");
    if (searchEl) {
      P.mountSearch(searchEl, {
        onResolved: function (sym) { location.href = "/company/" + encodeURIComponent(sym); },
        onNotFound: function (sym) { $("view").innerHTML = P.states.notFound({ copy: 'We don\'t carry "' + sym + '".' }); },
        onError: function () { $("view").innerHTML = P.states.error({}); },
      });
    }

    if (!symbol) { $("view").innerHTML = P.states.empty({ title: "No company", copy: "Search for a ticker or CIK above." }); return; }

    $("view").innerHTML = P.states.loading({ title: "Loading " + symbol.toUpperCase() });
    P.resolveSymbol(symbol).then(onResolved, onResolveError);

    $("stmt-types").addEventListener("click", onStmtClick);
    $("period-select").addEventListener("change", onPeriodChange);
  }

  function onResolved(data) {
    state.cik = data.cik;
    // Statement-layer (fy, fp) keys — the axis /statements resolves on. FY and quarters
    // both (the retired /explorer's quarterly statement lookups live here now).
    var PERIOD_ORDER = { FY: 1, Q4: 2, Q3: 3, Q2: 4, Q1: 5 };
    state.stmtPeriods = (data.periods || []).slice().sort(function (a, b) {
      return b.year - a.year || (PERIOD_ORDER[a.period] || 9) - (PERIOD_ORDER[b.period] || 9);
    });
    // Default to the latest FY (the complete-year statement), not the latest quarter.
    var defStmt = state.stmtPeriods.filter(function (p) { return p.period === "FY"; })[0]
      || state.stmtPeriods[0];
    state.stmtValue = defStmt ? defStmt.year + "|" + defStmt.period : null;

    renderMasthead();
    renderEntityBar();

    // Filer identity (name + SIC) for the Overview's §01. Supplementary: a failure or an
    // un-ingested profile must not hold up the page, so it re-renders in place when it lands.
    P.api("/companies/" + encodeURIComponent(symbol) + "/profile").then(
      function (prof) {
        state.profile = prof;
        renderMasthead();
        if (state.tab === "hub") { renderIdentity(); refreshViewHeader(); }
        if (state.tab === "history") refreshViewHeader();
      },
      function () { state.profile = null; }
    );

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
        if (!state.fundPeriods.length && !state.stmtPeriods.length) {
          $("view").innerHTML = P.states.empty({ title: "No computable periods", copy: "Filings are on record but no complete period to compute from yet." });
          return;
        }
        $("controls").hidden = false;
        applyTabFromUrl();
        updatePeriodControl();
        render();
      },
      function () {
        // Metric periods failed but statements may still work — degrade to Statements only.
        state.fundPeriods = [];
        $("controls").hidden = false;
        applyTabFromUrl();
        updatePeriodControl();
        render();
      }
    );
  }

  /* Deep-link support. V3-P2 made the view a PATH segment (/company/{symbol}/statements) so it is
   * linkable and Back/Forward walk views; ClearyFiShell.route() resolves the path first and falls
   * back to the legacy ?tab= form, so every existing URL, bookmark and e2e deep link still lands
   * on the same view. ?stmt= stays a query param on purpose -- it selects a sub-control INSIDE the
   * Statements view, not a view. */
  function applyTabFromUrl() {
    var q = new URLSearchParams(location.search);
    if (window.ClearyFiShell) {
      state.tab = window.ClearyFiShell.route().view; // path -> ?tab= -> default, unknown slugs included
    } else {
      var t = q.get("tab");
      if (VIEW_SLUGS.indexOf(t) !== -1) state.tab = t;
    }
    var s = q.get("stmt");
    if (["income", "balance", "cashflow", "segments"].indexOf(s) !== -1) {
      state.tab = "history";
      state.statement = s;
      var sBtn = document.querySelector('#stmt-types button[data-stmt="' + s + '"]');
      if (sBtn) setOn("#stmt-types button", sBtn);
    }
    renderRail();
    // Normalize a legacy ?tab= URL onto the canonical path without adding a history entry.
    syncUrl({ replace: true });
    $("stmt-types").hidden = true; // retired: statement tabs now live inside the statement card
  }

  // V3-P4: `fundamentals` -> `hub` (Overview), `statements` -> `history` (Financial history).
  // Legacy slugs still resolve -- shell.js's VIEW_ALIASES maps them before the unknown-slug
  // fallback, so every indexed /company/{sym}/statements URL keeps landing on the right view.
  var VIEW_SLUGS = ["hub", "history", "insider", "institutional", "institutional-legacy", "beneficial"];

  /* The entity control bar (v3 prototype :85-108) — the focal company's identity, restricted to
   * what this page already resolves. Two deliberate omissions, both honesty calls:
   *
   *  - NO "Peer set" cell. /companies/{symbol}/peers returns peer_group PER METRIC, is
   *    period-scoped, carries no group_label, and an empty result is a valid outcome — there is no
   *    page-load-time sector label for a company. A cell that can never resolve is chrome noise,
   *    not honesty, so it is omitted rather than shown as a permanent N/A. V3-P5 (Peer-relative)
   *    is where it earns its place.
   *  - NO "Facts as filed · not restated" line, which the prototype ends with. That statement is
   *    FALSE for this product: metrics.py emits restatement_basis="as-restated" and DATA_MODEL R9
   *    requires one labeled basis per series. Porting it would ship a misstatement about our own
   *    data (STYLE_GUIDE §8.1).
   *
   * Values that have not resolved yet render drained via shell.entityBar(), never as 0 or a guess.
   */
  function renderEntityBar() {
    var host = $("entityBar");
    if (!host || !window.ClearyFiShell) return;
    host.innerHTML = "";
    host.appendChild(window.ClearyFiShell.entityBar([
      { label: "Company", value: symbol ? symbol.toUpperCase() : null, primary: true },
      { label: "CIK", value: state.cik || null, mono: true },
      { label: "Period", value: periodLabelForBar(), mono: true },
      { label: "Last filed", value: state.lastFiled || null, mono: true },
    ]));
  }

  /* The masthead in the prototype's shape (:76-83): title, a mono subtitle directly beneath it,
   * a right-hand mono meta line, and ONE thin rule. Re-rendered when the profile resolves so the
   * sector can join the meta line. */
  function renderMasthead() {
    var right = symbol.toUpperCase() + (state.profile && state.profile.sic_description
      ? " · " + state.profile.sic_description : "");
    $("masthead").innerHTML =
      '<header class="masthead co-masthead"><div class="co-mast-top">' +
      "<div><h1>Company hub</h1>" +
      '<div class="co-mast-sub">Everything filed by this registrant · 10-K, 10-Q, 8-K, ' +
      "Forms 3/4/5 · as of latest filing</div></div>" +
      '<div class="co-mast-right">' + P.esc(right) + " · CIK " + P.esc(String(state.cik || "")) + "</div>" +
      '</div><div class="co-mast-rule"></div></header>';
  }

  /* The prototype's in-view header (:801-812 hub, :1580-1589 history): the focal company named
   * as a breadcrumb -- sector › name › ticker -- over a heavy rule, with the view's own scope
   * note on the right. Sector and name arrive with /profile; until then the line carries what it
   * can rather than a placeholder. */
  function viewHeader(viewLabel, scopeNote) {
    var prof = state.profile || {};
    var crumbs = "";
    if (prof.sic_description) {
      crumbs += '<span class="vh-sector">' + P.esc(prof.sic_description) + "</span>" +
        '<span class="vh-sep">›</span>';
    }
    crumbs += '<span class="vh-name">' + P.esc(prof.name || symbol.toUpperCase()) + "</span>" +
      '<span class="vh-ticker">' + P.esc(symbol.toUpperCase()) + "</span>";
    if (viewLabel) crumbs += '<span class="vh-view">' + P.esc(viewLabel) + "</span>";
    return '<div class="view-header">' + crumbs +
      '<span class="vh-note">' + P.esc(scopeNote || "") + "</span></div>";
  }

  // Swap the breadcrumb in place once /profile lands, without re-rendering the whole view.
  function refreshViewHeader() {
    var el = document.querySelector("#view .view-header");
    if (!el) return;
    var label = state.tab === "history" ? "Financial history" : "";
    var note = state.tab === "history"
      ? "full XBRL fact history · any metric, any period on file"
      : "everything filed by this registrant";
    var tmp = document.createElement("div");
    tmp.innerHTML = viewHeader(label, note);
    el.replaceWith(tmp.firstChild);
  }

  // The period the ACTIVE view is showing. Insider/13D-G are bounded by a filing limit rather than
  // a period, so they honestly report that instead of borrowing another view's period.
  function periodLabelForBar() {
    if (NON_PERIOD_TABS.indexOf(state.tab) !== -1) return "latest filings";
    if (state.tab === "institutional-legacy") return state.instValue ? quarterLabel(state.instValue) : null;
    // The design port is not period-scoped: it renders prototype literals, not a quarter.
    if (state.tab === "institutional") return null;
    var v = state.tab === "hub" ? state.fundValue : state.stmtValue;
    if (!v) return null;
    var p = v.split("|");
    return p[1] === "FY" ? "FY" + p[0] : p[1] + " FY" + p[0];
  }

  // The shell's vertical Views rail replaces the old horizontal #tabs strip. Same five views, same
  // labels, same order -- only the chrome that selects them moved (V3-P2 re-homes, never re-cuts).
  function renderRail() {
    var host = $("viewRail");
    if (!host || !window.ClearyFiShell) return;
    host.innerHTML = "";
    host.appendChild(window.ClearyFiShell.rail({
      subject: "companies",
      active: state.tab,
      onSelect: selectTab,
      // Only the ported Institutional view is a numbered long page today; every other view
      // declares nothing and renders exactly the rail it did before.
      sections: state.tab === "institutional" ? IP_RAIL_SECTIONS : null,
      activeSection: state.ipSection,
      onSection: ipJumpTo,
    }));
  }

  function syncUrl(opts) {
    if (!window.ClearyFiShell || !symbol) return;
    var path = "/company/" + encodeURIComponent(symbol) + "/" + state.tab;
    if (path !== location.pathname) window.ClearyFiShell.navigate(path, opts);
  }

  // Show/populate the shared period picker for the active tab. Insider/13D-G have no period.
  // Institutional IS a period tab, but on an async axis (institutional-periods) that
  // renderInstitutional loads and reveals once ready — so keep the control hidden here.
  function updatePeriodControl() {
    // Only Institutional still uses the shared top-bar control (its 13F-quarter axis loads
    // async and has no card of its own). Overview and Financial history own their controls.
    var usesTopBar = state.tab === "institutional-legacy";
    $("controls").hidden = !usesTopBar;
    $("period-control").hidden = true;
    if (usesTopBar) return; // renderInstitutional reveals + populates it once its axis loads
  }

  // ---------- period control ----------

  function populatePeriodSelect() {
    var sel = $("period-select");
    if (state.tab === "hub") {
      $("period-label").textContent = "Period";
      sel.innerHTML = state.fundPeriods
        .map(function (p) {
          var label = p.period === "FY" ? "FY " + p.year : "FY" + p.year + " " + p.period + " · " + monthYear(p.period_end);
          return '<option value="' + p.year + "|" + p.period + '">' + P.esc(label) + "</option>";
        })
        .join("");
      if (state.fundValue) sel.value = state.fundValue;
    } else if (state.tab === "institutional-legacy") {
      // Axis is the 13F quarter-ends holdings exist for; value IS the quarter-end string.
      $("period-label").textContent = "Quarter (13F)";
      sel.innerHTML = (state.instPeriods || [])
        .map(function (q) { return '<option value="' + P.esc(q) + '">' + P.esc(quarterLabel(q)) + "</option>"; })
        .join("");
      if (state.instValue) sel.value = state.instValue;
    } else {
      $("period-label").textContent = "Period";
      sel.innerHTML = state.stmtPeriods
        .map(function (p) {
          var label = p.period === "FY" ? "FY " + p.year : "FY" + p.year + " " + p.period;
          return '<option value="' + p.year + "|" + p.period + '">' + P.esc(label) + "</option>";
        })
        .join("");
      if (state.stmtValue) sel.value = state.stmtValue;
    }
  }

  function onPeriodChange(e) {
    if (state.tab === "hub") state.fundValue = e.target.value;
    else if (state.tab === "institutional-legacy") state.instValue = e.target.value;
    else state.stmtValue = e.target.value;
    render();
  }

  function currentSel() {
    var v = state.tab === "hub" ? state.fundValue : state.stmtValue;
    if (!v) return null;
    var parts = v.split("|");
    return { year: parseInt(parts[0], 10), period: parts[1] };
  }

  function onResolveError(err) {
    if (err.status === 404) {
      $("view").innerHTML = P.states.notFound({
        copy: 'We don\'t carry "' + symbol + '". Check the ticker, or try a raw CIK.',
        recovery: [{ label: "Try AAPL ↗", href: "/company/AAPL" }, { label: "Data coverage ↗", href: "/coverage" }],
      });
    } else {
      $("view").innerHTML = P.states.error({ copy: "Lookup failed (" + (err.status || "network") + ")." });
    }
  }

  // ---------- tab / control handlers ----------

  function selectTab(tab) {
    if (tab === state.tab) return;
    state.tab = tab;
    renderRail();
    syncUrl(); // pushState: Back returns to the previous view
    $("stmt-types").hidden = true; // retired: statement tabs now live inside the statement card
    updatePeriodControl(); // shows/populates the picker for the tab's own axis (or hides it)
    render();
  }

  // Back/Forward: re-derive the view from the path rather than trusting in-memory state.
  function onPopState() {
    var v = window.ClearyFiShell.route().view;
    if (!v || v === state.tab) return;
    state.tab = v;
    renderRail();
    $("stmt-types").hidden = true; // retired: statement tabs now live inside the statement card
    updatePeriodControl();
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
    renderEntityBar(); // keep the control bar in step with the view/period actually rendered
    renderRightRail();
    renderTray(); // pinned across views; re-asserted because #view was just rebuilt
    clearSectionNav(); // the "On this page" rail belongs to the Overview snapshot only
    if (state.tab !== "institutional") ipUnwatchSections(); // the port's rail jump list is gone
    if (state.tab === "hub") renderOverview();
    else if (state.tab === "history") renderHistory();
    else if (state.tab === "insider") renderInsider();
    else if (state.tab === "institutional") renderInstitutionalPort();
    else if (state.tab === "institutional-legacy") renderInstitutional();
    else renderBeneficial();
  }

  var BENEFICIAL_LIMIT = 25;

  function renderBeneficial() {
    $("legend").innerHTML = "";
    $("disclosure").innerHTML = P.disclosure(["ownership_13dg_floor", "not_advice"]);
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

  /* ==========================================================================================
   * INSTITUTIONAL — PROTOTYPE DESIGN PORT   (V3-P5a attempt 4, PHASE 1)
   *
   * Operator workflow, 2026-07-30: **design first, data second.** Phase 1 ports the v3 prototype's
   * Institutional view -- its markup, its CSS, its chart builders, and ITS OWN SAMPLE VALUES --
   * onto this blank page, with NO backend calls whatsoever. The operator verifies fidelity against
   * the prototype. Only then does phase 2 replace the literals with real filings data.
   *
   * Why the workflow changed: three attempts failed on fidelity and none on data or honesty. The
   * last one passed 44 driven QA assertions and two of the operator's own hands-on batches, and was
   * still rejected -- it had the prototype's STRUCTURE built out of the PRODUCT'S COMPONENTS.
   * Removing data from the equation makes fidelity verifiable on its own.
   *
   * ⚠️ THE LITERALS ARE A SCAFFOLD, NOT DATA. Every value rendered here in phase 1 is copied from
   * the prototype; nothing is fetched, nothing is derived, and no figure describes any real company.
   * The banner says so, at the top, undismissable. The honesty rules are suspended ONLY for this
   * unshipped scaffold. **Phase 2 is not done until no literal remains.**
   *
   * GROUND TRUTH: the prototype RENDERS -- it is a React/dc-runtime export. Serve it and diff each
   * ported section against a screenshot of the real thing; do NOT port by reading the markup, which
   * is how the "+ Also in this section" pattern survived five rounds of review unnoticed. The two
   * commands are in docs/delivery/_active.md ("THE UNLOCK").
   *
   * CSS NAMESPACE: `.ip-*` (institutional port), in company.css under the matching banner. It
   * deliberately shares NOTHING with `.ov-card` / `.stmt-table` / `.plot-chart` / `.cond-*` --
   * reusing that vocabulary is precisely what produced "leftovers from previous design".
   * ========================================================================================== */

  // The prototype's seven sections: its `data-screen-label` and the scope note beside each heading,
  // verbatim (prototype.dc.html :1699, :1896, :2041, :2316, :2498, :2609, :2701).
  var IP_SECTIONS = [
    ["01", "Register snapshot", "13F-HR register, freshness and what has been filed since"],
    ["02", "Register over time & holders", "how the register has moved, and who is in it"],
    ["03", "Flows & concentration", "position changes, how the register is distributed, how concentrated it is"],
    ["04", "Ownership & stewardship", "5% filings, voting behavior and the activism trail"],
    ["05", "Holder behavior", "how long managers stay in the register, and at what level they hold"],
    ["06", "Register limits & supply", "what the register cannot tell you, and what supply is dated ahead"],
    ["07", "Reference", "forms and rules used on this page"],
  ];

  /* The rail's jump list. NOTE the labels are the prototype's SHORT forms, not the section
   * headings -- it writes "Over time & holders" in the rail and "Register over time & holders"
   * over the section. Read off the rendered rail (prototype-ground-truth/rails.json). */
  var IP_RAIL_SECTIONS = [
    ["ip-01", "01", "Register snapshot"],
    ["ip-02", "02", "Over time & holders"],
    ["ip-03", "03", "Flows & concentration"],
    ["ip-04", "04", "Ownership & stewardship"],
    ["ip-05", "05", "Holder behavior"],
    ["ip-06", "06", "Register limits & supply"],
    ["ip-07", "07", "Reference"],
  ];

  /* Keep the rail's jump list in step with what you are actually reading.
   *
   * Deliberately a rect test, not an IntersectionObserver. An observer band is only as good as its
   * rootMargin, and the first version was reliably off by one: `scrollIntoView` honours the
   * section's `scroll-margin-top`, which lands the section just inside the band while the previous
   * one is still inside it too, so a jump to §03 marked §02. This asks the question directly --
   * the current section is the last one whose top has passed under the sticky topbar. */
  /* Where a section counts as "the one you are reading". It must clear `.ip-sec`'s own
   * `scroll-margin-top` (86px) plus its 22px margin, because a jump from the rail parks the target
   * at exactly that offset -- measured at 121px, which a 120px line missed by one pixel and marked
   * the PREVIOUS section. 150 clears it with room, and sections are hundreds of pixels tall, so
   * nothing else can be in range. */
  var IP_SPY_LINE = 150;
  var ipSpyOn = false;
  var ipSpyQueued = false;

  var ipSpyHeldUntil = 0;

  // Repaint the rail only -- re-rendering the view here would fight the scroll.
  function ipPaintSection(id) {
    state.ipSection = id;
    document.querySelectorAll(".shell-sec").forEach(function (a) {
      var on = a.getAttribute("href") === "#" + id;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }

  function ipMarkSection() {
    ipSpyQueued = false;
    if (!ipSpyOn || Date.now() < ipSpyHeldUntil || !document.getElementById("ip-01")) return;
    var mark = IP_RAIL_SECTIONS[0][0];
    IP_RAIL_SECTIONS.forEach(function (s) {
      var el = document.getElementById(s[0]);
      if (el && el.getBoundingClientRect().top <= IP_SPY_LINE) mark = s[0];
    });
    if (mark !== state.ipSection) ipPaintSection(mark);
  }

  /* Clicking a jump link marks that section outright and holds the scroll handler off while the
   * smooth scroll runs. Without the hold, asking for the last section marks a different one: the
   * page cannot always scroll far enough to bring it under the line, so the rect test settles on
   * the previous one and the rail contradicts what you just clicked. */
  function ipJumpTo(id) {
    ipSpyHeldUntil = Date.now() + 900;
    ipPaintSection(id);
  }

  function ipOnScroll() {
    if (ipSpyQueued) return;
    ipSpyQueued = true;
    window.requestAnimationFrame(ipMarkSection);
  }

  function ipWatchSections() {
    ipSpyOn = true;
    window.removeEventListener("scroll", ipOnScroll);
    window.addEventListener("scroll", ipOnScroll, { passive: true });
    ipMarkSection();
  }

  // Called when any other view renders: the listener stays attached but stops doing work, and the
  // guard above means it can never touch a rail that no longer has a jump list.
  function ipUnwatchSections() { ipSpyOn = false; }

  /* ==========================================================================================
   * PHASE 2 — the data layer behind the ported design.
   *
   * Every section below moves off `IP01`-`IP07` (the prototype's own literals) and onto the real
   * endpoints, one section at a time. `IP_DATA.done` names the sections that have made the trip;
   * the banner reads it, so the warning shrinks as the plumbing lands and disappears by itself
   * when the last literal goes. Nothing here re-derives a number the API owns.
   * ======================================================================================== */

  var IP_DONE = ["01", "02", "03", "04", "05", "06"]; // sections wired to real filings data

  var IP_SERIES_QUARTERS = 5; // the prototype's own axis length for §02's over-time charts
  var IP_FLOW_QUARTERS = 6;   // §03's diverging-flow axis, the prototype's own length
  var IP_RANKED_ROWS = 10;    // §03's "ten largest managers", the prototype's own count
  var IP_LANES = 6;           // §04: holders charted as lanes; the rest stay in the table below
  /* 13D/G filings to read. Matches `_BO_TYPE_LOOKBACK` server-side ON PURPOSE: the page already
   * asks for beneficial-ownership rows at that limit (§01's filed-since, §02's type join), and
   * the cache is keyed on "do we hold at least `limit` filings", so a THIRD different limit
   * would be a third cache state for the same rows.
   * ⚠️ Note that limit can never be reached for an issuer with fewer than 40 structured 13D/G
   * filings — most of them — so this read goes to SEC every time. Pre-existing (see 4-qa.md),
   * not introduced here, and the reason not to raise the number further. */
  var IP_BO_LIMIT = 40;
  var IP_INSIDER_LIMIT = 60;  // §06 reads the plan-marking flag off these, not the amounts

  /* "This request has not answered yet" -- distinct from both `null` (never asked) and
   * `{_err}` (asked and failed). Without it a section repainted mid-load renders its honest
   * EMPTY state ("nothing was filed") for a block that is simply still in flight, which is a
   * false statement about the filings rather than a slow one. */
  var IP_PENDING = { pending: true };
  function ipPending(v) { return v === IP_PENDING; }

  var IP_DATA = {
    symbol: null,
    period: null,       // the 13F quarter-end being described
    periods: [],        // every ingested quarter, newest first
    register: null,     // /institutional-register       -- one quarter's shape
    shape: null,        // /institutional-register-shape -- across quarters
    filed: null,        // /institutional-filed-since    -- what landed after the register closed
    activity: null,     // /institutional-activity       -- DERIVED per-manager quarter-over-quarter
    series: null,       // /institutional-holdings-series -- per-manager points across quarters
    flows: null,        // /institutional-activity-series -- DERIVED per-quarter in/outflow + counts
    domicile: null,     // /institutional-holder-domicile -- where the filers file from (§03)
    attribution: null,  // /institutional-share-attribution -- reported shares vs outstanding (§03)
    overlap: null,      // /institutional-peer-overlap    -- cross-issuer manager overlap (§03)
    beneficial: null,   // /beneficial-ownership          -- Schedule 13D/G filings (§04)
    filings: null,      // /filing-index                  -- supply events + acceptance lag (§06)
    insider: null,      // /insider-trades                -- Forms 3/4/5, for the 10b5-1 flag (§06)
    registers: {},      // period -> that quarter's register (§02's over-time charts)
    status: "idle",     // idle | loading | ready | error
    error: null,
  };

  /* One load per (symbol, period). The four calls are independent, and a failure in any ONE of
   * them must not blank the others -- a section whose endpoint failed renders its own error, the
   * rest of the page still renders. So: settle every promise, never reject the whole load. */
  function ipLoad(symbol, period, onProgress) {
    IP_DATA.symbol = symbol;
    IP_DATA.status = "loading";
    IP_DATA.error = null;
    IP_DATA.registers = {};
    ["register", "shape", "filed", "activity", "series", "flows", "domicile", "attribution",
      "overlap", "beneficial", "filings", "insider"].forEach(function (k) { IP_DATA[k] = IP_PENDING; });
    var report = onProgress || function () {};
    var base = "/companies/" + encodeURIComponent(symbol) + "/institutional";
    var q = period ? "?period=" + encodeURIComponent(period) : "";

    var soft = function (p) { return p.then(function (v) { return v; }, function (e) { return { _err: e }; }); };

    return P.api(base + "-periods")
      .then(function (per) {
        IP_DATA.periods = per.periods || [];
        // The caller's period wins; otherwise the newest quarter we have actually ingested.
        IP_DATA.period = period || IP_DATA.periods[0] || null;
        var pq = IP_DATA.period ? "?period=" + encodeURIComponent(IP_DATA.period) : q;
        /* §02 charts the register quarter by quarter. Rather than re-derive a holder count and a
         * share total from the per-manager series — the API owns those numbers and computes them
         * with the same exclusions everywhere — ask the register endpoint for each quarter. It is
         * cache-aside over the operational store, and the axis is five quarters long, so this is
         * a bounded handful of reads, not a scan. */
        var older = IP_DATA.periods.slice(0, IP_SERIES_QUARTERS).filter(function (p) {
          return p !== IP_DATA.period;
        });
        /* Each response lands INDEPENDENTLY and repaints only the sections that read it.
         * The endpoints differ by more than an order of magnitude on a cold volume (the register
         * ~4s, the peer overlap ~3.7s, the activity series ~2.2s), so blocking every section on
         * the slowest is most of the wait for none of the benefit. */
        var land = function (key, promise, sections) {
          return promise.then(function (v) {
            IP_DATA[key] = v;
            if (key === "register" && !ipErr(v)) IP_DATA.registers[IP_DATA.period] = v;
            report(sections);
            return v;
          });
        };
        return Promise.all([
          land("register", soft(P.api(base + "-register" + pq)), ["01", "02", "03"]),
          land("shape", soft(P.api(base + "-register-shape" + pq)), ["03", "05"]),
          land("filed", soft(P.api(base + "-filed-since" + pq)), ["01"]),
          land("activity", soft(P.api(base + "-activity" + pq)), ["02", "03"]),
          land("series", soft(P.api(base + "-holdings-series")), ["02"]),
          // §03. Each is independently soft-settled: the peer-overlap read touches several
          // issuers, so it is the most likely of the six to be thin, and it must not take the
          // rest of the section down with it.
          land("flows", soft(P.api(base + "-activity-series?quarters=" + IP_FLOW_QUARTERS)), ["03"]),
          land("domicile", soft(P.api(base + "-holder-domicile" + pq)), ["03"]),
          land("attribution", soft(P.api(base + "-share-attribution" + pq)), ["03"]),
          land("overlap", soft(P.api(base + "-peer-overlap" + pq)), ["03"]),
          // §04. Not period-scoped: a 5% stake is a standing position with its own amendment
          // chain, not a quarter-end snapshot.
          land("beneficial",
            soft(P.api("/companies/" + encodeURIComponent(symbol) +
              "/beneficial-ownership?limit=" + IP_BO_LIMIT)), ["04"]),
          // §06. The filing index is period-scoped only for the acceptance lag, which is
          // measured over the register's MANAGERS for that quarter.
          land("filings",
            soft(P.api("/companies/" + encodeURIComponent(symbol) + "/filing-index" + pq)),
            ["06"]),
          land("insider",
            soft(P.api("/companies/" + encodeURIComponent(symbol) +
              "/insider-trades?limit=" + IP_INSIDER_LIMIT)), ["06"]),
        ]).then(function (r) {
          /* The older quarters are DEFERRED until the primary calls have settled.
           *
           * They feed enhancements only -- §02's over-time charts, §03's prior-quarter ghost
           * line and the effective-holders trend -- and every one of them is another concurrent
           * request competing with the calls the first paint actually needs. The handlers are
           * async but their store reads are synchronous, so concurrent requests serialise on the
           * event loop: firing all sixteen at once made each of them ~3s when the same nine take
           * ~0.1-1.3s on their own. Holding these four back gets the sections on screen first
           * and then fills them in. */
          return Promise.all(older.map(function (p) {
            return soft(P.api(base + "-register?period=" + encodeURIComponent(p))).then(function (v) {
              if (!ipErr(v)) IP_DATA.registers[p] = v;
              report(["02", "03"]);   // the over-time charts gain a point
              return { period: p, reg: v };
            });
          })).then(function () { return r; });
        });
      })
      .then(function () {
        IP_DATA.status = "ready";
      })
      .catch(function (e) {
        // Only /institutional-periods reaching here — the issuer itself did not resolve.
        IP_DATA.status = "error";
        IP_DATA.error = e;
      });
  }

  function ipErr(o) { return !o || o._err; }

  /* ---------- the honesty vocabulary, in the port's own visual language ----------
   *
   * RECONCILIATION §3 is right that production wants a statusChip on every derived value, and the
   * prototype has none -- it carries the same distinctions in prose. Adding chips would break the
   * pixel match the operator just accepted, so phase 2 keeps the prototype's SHAPE and puts the
   * honesty where the prototype already puts its prose: the value slot reads N/A, and the API's
   * own `reason` goes in the note beneath it. ⚠️ OPERATOR DECISION OPEN -- see 3-implementation.md.
   *
   * The one rule with no give in it: a missing, inapplicable or not-yet-ingested value is NEVER
   * rendered as 0, and never as a blank styled like a value. */
  var IP_NA = "N/A";

  // A derived block ({status, reason, ...}) is usable only when it says so AND the field is there.
  function ipOk(block, field) {
    return !!block && !block._err && block.status === "ok" &&
      block[field] !== null && block[field] !== undefined;
  }

  // The reason an absent value is absent — the API writes these to be shown, so show them.
  function ipWhy(block, fallback) {
    if (!block) return fallback || "not ingested for this quarter";
    if (block._err) return "this measure could not be loaded (" + (block._err.status || "network") + ")";
    return block.reason || fallback || "not reported in the filings we have ingested";
  }

  /* D-chips (operator, 2026-08-01): the production status vocabulary rides on values that need a
   * caveat, and ONLY those. A value that is fine carries no chip — that keeps the prototype's
   * rendering where it was accepted at the fidelity gate, and still flags everything a reader
   * should not take at face value. `ClearyFi.statusChip` is the shared component, not a local
   * lookalike, so §01 speaks the same vocabulary as the company hub and the sector views. */
  function ipStatusChip(status) {
    if (!status || status === "ok") return "";
    return P.statusChip(status);
  }

  // The chip a slot earns: N/A when we cannot compute it, APPROX when the API flags it imprecise.
  function ipChipFor(block) {
    if (!block) return "na";
    if (block._err) return "na";
    if (block.status === "approximate") return "approximate";
    if (block.status && block.status !== "ok") return "na";
    return null;
  }

  // ---------- formatting ----------

  function ipShares(n) {
    if (n === null || n === undefined) return IP_NA;
    var a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "B";
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
    if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "K";
    return String(Math.round(n));
  }
  function ipSignedShares(n) {
    if (n === null || n === undefined) return IP_NA;
    return (n > 0 ? "+" : n < 0 ? "−" : "") + ipShares(Math.abs(n));
  }
  function ipPct(v, dp) {
    if (v === null || v === undefined) return IP_NA;
    return (v * 100).toFixed(dp === undefined ? 1 : dp) + "%";
  }
  function ipCount(n) {
    return n === null || n === undefined ? IP_NA : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // "2026-03-31" -> "1Q26", the prototype's own quarter label.
  function ipQuarter(iso) {
    if (!iso) return IP_NA;
    var m = +iso.slice(5, 7);
    return Math.ceil(m / 3) + "Q" + iso.slice(2, 4);
  }
  function ipDaysBetween(aIso, bIso) {
    if (!aIso || !bIso) return null;
    return Math.round((Date.parse(bIso) - Date.parse(aIso)) / 86400000);
  }
  function ipTodayIso() { return new Date().toISOString().slice(0, 10); }

  /* The NEXT statutory 13F deadline, from the calendar rule the API hands us (`deadline_days`,
   * 45 by statute) applied to the next quarter end that has not yet been filed for. This is
   * arithmetic on a filing rule, not a claim about data — the alternative is leaving the
   * prototype's hard-coded 2026-08-14 in place, which would be a literal. */
  function ipNextDeadline(deadlineDays) {
    var d = new Date(ipTodayIso() + "T00:00:00Z");
    var qEnd = new Date(Date.UTC(d.getUTCFullYear(), (Math.floor(d.getUTCMonth() / 3) + 1) * 3, 0));
    var due = new Date(qEnd.getTime() + (deadlineDays || 45) * 86400000);
    if (due < d) { // this quarter's window already closed; the next one is a quarter out
      qEnd = new Date(Date.UTC(qEnd.getUTCFullYear(), qEnd.getUTCMonth() + 4, 0));
      due = new Date(qEnd.getTime() + (deadlineDays || 45) * 86400000);
    }
    return due.toISOString().slice(0, 10);
  }

  /* The ingested window, in words -- for any copy that would otherwise name a fixed one. */
  function ipObservedWindow() {
    var qs = IP_DATA.periods || [];
    if (!qs.length) return "the quarters ingested for this issuer";
    if (qs.length === 1) return "the single quarter ingested (" + ipQuarter(qs[0]) + ")";
    return qs.length + " ingested quarters, " + ipQuarter(qs[qs.length - 1]) + " to " +
      ipQuarter(qs[0]);
  }

  function ipObservedEarliest() {
    var qs = IP_DATA.periods || [];
    return qs.length ? ipQuarter(qs[qs.length - 1]) : "the earliest quarter we hold";
  }

  function renderInstitutionalPort() {
    $("legend").innerHTML = "";
    // No disclosure() in phase 1: that copy describes REAL data, and there is none on this page.
    $("disclosure").innerHTML = "";
    $("controls").hidden = true;
    $("period-control").hidden = true;

    var sym = window.ClearyFiShell.route().id;
    // Fetch once per (symbol, period); paint the ported design immediately either way, so the
    // sections that are still literal-backed never wait on a request they don't use.
    if (IP_DATA.status === "idle" || IP_DATA.symbol !== sym) {
      ipPaint();
      ipLoad(sym, null, ipRepaintSections).then(ipPaint);
      return;
    }
    ipPaint();
  }

  // Sections build one at a time, in order, each diffed against its capture before the next
  // starts (P1e). A section with no builder yet renders as an empty shell.
  var IP_BODIES = { "01": ipSection01, "02": ipSection02, "03": ipSection03, "04": ipSection04, "05": ipSection05, "06": ipSection06, "07": ipSection07 };

  /* Re-render ONE section's body in place, as its data arrives.
   *
   * The page fires sixteen requests, and on a cold volume every one of them is a cache miss that
   * goes to SEC behind a process-wide throttle. Waiting for the slowest before painting anything
   * left the whole view on "Loading" for over a minute. Each section now repaints the moment its
   * own inputs settle.
   *
   * Two things it must not do, which is why this is not just `ipPaint()` again:
   *   - it never touches a section the reader is INSIDE (an open expander would slam shut, and
   *     `ipPaint` rebuilds `#view` wholesale so every toggle and scroll position would go with
   *     it);
   *   - it never repaints under an open dialog. */
  function ipRepaintSection(sec) {
    var host = document.querySelector('[data-ip-body="' + sec + '"]');
    if (!host || !IP_BODIES[sec]) return;
    if (document.querySelector(".ip-lb")) return;
    var open = host.querySelector(".ip-expander-body");
    if (open && !open.hasAttribute("hidden")) return;
    host.innerHTML = IP_BODIES[sec]();
    ipFitDumbbell();
    ipFitMatrix();
  }

  // The banner names the sections still on literals; it shrinks as they land, so it repaints too.
  function ipRepaintSections(list) {
    list.forEach(ipRepaintSection);
    var banner = document.querySelector(".ip-banner");
    if (banner) banner.outerHTML = ipBanner();
  }

  function ipPaint() {
    $("view").innerHTML =
      ipBanner() +
      ipViewHeader() +
      IP_SECTIONS.map(function (sec) {
        var body = IP_BODIES[sec[0]] ? IP_BODIES[sec[0]]() : "";
        return (
          '<section class="ip-sec" id="ip-' + sec[0] + '">' +
          ipSecHead(sec[0], sec[1], sec[2]) +
          '<div class="ip-sec-body" data-ip-body="' + sec[0] + '">' + body + "</div>" +
          "</section>"
        );
      }).join("");

    ipBindExpanders();
    ipBindAffordances();
    ipWatchSections();

    /* Charts whose labels come from filings can only be sized once the text is real and the font
     * has resolved. Fit now, then again when webfonts land — `document.fonts.ready` settles
     * immediately if they already have, so the second pass is free when it is not needed. */
    ipFitDumbbell();
    ipFitMatrix();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { ipFitDumbbell(); ipFitMatrix(); });
    }
  }

  /* The prototype's expander bars really do expand (operator, 2026-07-30). One delegated handler
   * for the whole view: the bar toggles the block that follows it and rewrites its own label, so a
   * section that adds an expander later needs no wiring. */
  var ipExpandersBound = false;

  function ipBindExpanders() {
    var view = $("view");
    if (!view || ipExpandersBound) return;
    ipExpandersBound = true;   // delegated on #view, which outlives every re-render
    view.addEventListener("click", function (ev) {
      var btn = ev.target.closest && ev.target.closest(".ip-expander-btn");
      if (!btn || !view.contains(btn)) return;
      var bar = btn.parentNode;
      var body = bar.nextElementSibling;
      if (!body || !body.classList.contains("ip-expander-body")) return;
      var open = body.hasAttribute("hidden");
      if (open) body.removeAttribute("hidden");
      else body.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      // The prototype's open label is "− Hide", not the inverse of the closed one.
      btn.textContent = open ? "− Hide" : "+ " + btn.getAttribute("data-ip-label");
      btn.classList.toggle("open", open);
      /* ⚠ SVG text inside a `hidden` container has NO layout, so `getComputedTextLength()`
       * returns 0 and any measure-and-fit pass silently no-ops. §03's peer matrix lives inside
       * this expander, so the only moment it can be measured is the moment it becomes visible.
       * (Same trap as "a chart built inside a hidden container measures 0" — it cost a round
       * here, with the matrix's row labels rendering with their heads clipped off.) */
      if (open) ipFitMatrix();
    });
  }

  /* One expander: the bar (button + note) and the block it reveals. `hidden` on the body, so the
   * collapsed page is exactly the prototype's collapsed page. */
  function ipExpander(label, note, bodyHtml) {
    return (
      '<div class="ip-expander">' +
      '<button type="button" class="ip-expander-btn" aria-expanded="false" data-ip-label="' +
      P.esc(label) + '">+ ' + P.esc(label) + "</button>" +
      '<span class="ip-expander-note"><span>' + P.esc(note) + "</span></span>" +
      "</div>" +
      '<div class="ip-expander-body" hidden>' + bodyHtml + "</div>"
    );
  }

  /* The phase-1 banner. Loud, and NOT dismissible: a page of prototype literals must never be
   * mistakable for filings data -- not for a moment, and not by us either. Uses the ext/caveat
   * colour family (STYLE_GUIDE §1), the product's reserve for "flag / doesn't reconcile", never the
   * accent, which means interaction. */
  /* The banner shrinks as phase 2 lands and removes itself when the last literal goes. It names
   * the sections that are still prototype literals, so nobody has to guess which numbers on the
   * page describe this company and which describe nothing. */
  function ipBanner() {
    var left = IP_SECTIONS.map(function (s) { return s[0]; })
      .filter(function (n) { return IP_DONE.indexOf(n) === -1 && n !== "07"; });
    if (!left.length) return "";
    var names = IP_SECTIONS.filter(function (s) { return left.indexOf(s[0]) !== -1; })
      .map(function (s) { return "§" + s[0] + " " + s[1]; });
    return (
      '<div class="ip-banner" role="alert">' +
      '<div class="ip-banner-title">⚠ ' + names.length +
      " of these sections are still design placeholders — not real data</div>" +
      '<div class="ip-banner-body">Every value in <strong>' + P.esc(names.join(", ")) +
      "</strong> is a literal copied from the design prototype: nothing is fetched, nothing is " +
      "derived, and no figure in them describes this or any other company. " +
      "<strong>§01 Register snapshot</strong> now carries real filings data, and the rest follow " +
      "section by section (V3-P5a phase 2). §07 is reference copy. The other Institutional view " +
      'in the rail, <strong>Institutional (legacy)</strong>, is real throughout.</div>' +
      "</div>"
    );
  }

  /* The prototype's in-view header (:1684-1697): sector › name › ticker › view, over a heavy rule,
   * with the source line and EDGAR links on the right. Built from the page's own resolved profile
   * where it has one -- the header is chrome, not a figure, so it is not part of the literal
   * scaffold and does not need the banner's warning. */
  function ipViewHeader() {
    var prof = state.profile || {};
    var crumbs = "";
    if (prof.sic_description) {
      crumbs += '<span class="ip-vh-sector">' + P.esc(prof.sic_description) + "</span>" +
        '<span class="ip-vh-sep">›</span>';
    }
    crumbs += '<span class="ip-vh-name">' + P.esc(prof.name || symbol.toUpperCase()) + "</span>" +
      '<span class="ip-vh-ticker">' + P.esc(symbol.toUpperCase()) + "</span>" +
      '<span class="ip-vh-view">Institutional ownership</span>';
    return (
      '<div class="ip-view-header">' + crumbs +
      '<span class="ip-vh-meta">13F-HR · SC 13D/G · DEF 14A · share counts only, no market values</span>' +
      "</div>"
    );
  }

  /* The prototype's section header (:1700-1704): accent mono number, Hanken 800 title at 19px, the
   * scope note on the SAME line, over a 2px ink rule. Deliberately NOT company.js's secHead(),
   * which is P4's vocabulary at a different size. */
  function ipSecHead(n, title, note) {
    return (
      '<div class="ip-sec-head">' +
      '<span class="ip-sec-n">' + P.esc(n) + "</span>" +
      '<h2 class="ip-sec-title">' + P.esc(title) + "</h2>" +
      '<span class="ip-sec-note">' + P.esc(note) + "</span>" +
      "</div>"
    );
  }

  /* ============================ §01 · Register snapshot ============================
   * Ground truth: prototype-ground-truth/proto-i1.png + literals.json (the captured DOM, with
   * per-element computed CSS). Everything below is copied from that capture — never hand-typed
   * from the prototype's source, which is how earlier attempts drifted.
   *
   * ⚠️ EVERY NUMBER AND DATE HERE IS A PROTOTYPE LITERAL. See the banner at the top of the page.
   * Phase 2 replaces all of them; §01 is done when this object is empty. */
  /* §01 is plumbed (phase 2). What survives here is not data — it is two statements of filing
   * RULES, which are the same for every registrant and are not fetched from anywhere:
   * `scope` (what Section 13(f) covers) and `speed` (each form's statutory deadline). */
  var IP01 = {
    scope: "Section 13(f) covers managers with over $100M in 13(f) securities. Holdings below reporting thresholds and non-13F holders are not represented.",
    speed: [
      ["Form 4 / 144", "2 business days · at order", "insider side, fastest"],
      ["SC 13D/A", "2 business days", "material change by a 5% holder"],
      ["SC 13G/A", "5 business days", "passive holder crossing a threshold"],
      ["N-PORT", "monthly", "named fund positions"],
      ["13F-HR", "45 days after quarter end", "the full register, slowest"],
    ],
  };

  function ipSection01() {
    /* A plumbed section never falls back to the prototype's literals: the banner tells the reader
     * §01 is real, so showing sample values while the fetch is in flight would make the banner
     * lie for a second. It loads, or it says why it couldn't. */
    if (IP_DATA.status === "idle" || IP_DATA.status === "loading") {
      return P.states.loading({ title: "Loading the 13F register" });
    }
    if (IP_DATA.status === "error" || ipErr(IP_DATA.register)) {
      var e = IP_DATA.error || (IP_DATA.register || {})._err || {};
      return P.states.error({
        copy: "Couldn't load the institutional register (" + (e.status || "network") + ")." +
          (e.detail ? " " + e.detail : ""),
      });
    }
    return ip01Freshness() + ip01SinceLast13F() + ip01Tiles() + ip01InsiderXref();
  }

  /* Prototype v4 closes §01 by naming what the insider-ownership figure above is NOT: it is the
   * DEF 14A beneficial-ownership table, which is a different measurement from the Form 4 ledger.
   * The prototype points at its new Insider activity view; our equivalent destination is the
   * Insider tab this hub already has. See 5-design-port-log.md, run 11. */
  function ip01InsiderXref() {
    return (
      '<div class="ip-xref">' +
      '<span class="ip-xref-note">Insider ownership above is the DEF 14A beneficial ownership ' +
      "table. Section 16 transactions are reported in full on their own view.</span>" +
      ipGoLink("Insider activity — ledger, codes, Form 144 →") +
      "</div>"
    );
  }

  /* ---------- §01, on real filings data (phase 2) ----------
   *
   * The four freshness cells, the two caveat lines and the four tiles are now the register
   * endpoint's own numbers. Three figures the prototype prints have NO source and are rendered
   * N/A with the API's reason rather than invented — see 3-implementation.md's CANNOT-SOURCE
   * table, and the notes at each site below. */

  function ip01FreshnessCells() {
    var reg = IP_DATA.register;
    var m = reg.period_meta || {};
    var filed = m.filed_latest;
    var since = ipDaysBetween(filed, ipTodayIso());
    var nextDue = ipNextDeadline(m.deadline_days);
    var toGo = ipDaysBetween(ipTodayIso(), nextDue);
    var filedCount = ipErr(IP_DATA.filed) ? null : (IP_DATA.filed.filing_count || 0);

    return [
      {
        label: "Register as of",
        value: ipQuarter(reg.period),
        note: filed
          ? "filed <span>" + P.esc(filed) + "</span> · <span>" + since + " days since filed</span>"
          : "<span>no filing date on the ingested snapshot</span>",
      },
      {
        label: "Next 13F window closes",
        value: nextDue,
        note: "in <span>" + toGo + " days</span>",
      },
      {
        label: "Filings since the snapshot",
        value: filedCount === null ? IP_NA : String(filedCount),
        status: filedCount === null ? "na" : null,
        accent: filedCount !== null && filedCount > 0,
        note: filedCount === null
          ? "<span>" + P.esc(ipWhy(IP_DATA.filed)) + "</span>"
          : "faster forms applied below",
      },
      /* CANNOT SOURCE. We do not track per-holding filing confirmations, so there is no honest
       * number here — N/A, never a plausible percentage. The cell keeps the prototype's short
       * note so the strip holds its row; the reason is the third line of the prose beneath it,
       * which is already where this card says what it is not. */
      {
        label: "Confirmed in last 30 days",
        value: IP_NA,
        status: "na",
        note: "<span>not tracked</span>",
      },
    ];
  }

  // The accent-edged card: how fresh the register is, then the two things it is not.
  function ip01Freshness() {
    var cells = ip01FreshnessCells()
      .map(function (c) {
        return (
          '<div class="ip-strip-cell">' +
          '<span class="ip-slot-head"><span class="ip-micro">' + P.esc(c.label) + "</span>" +
          ipStatusChip(c.status) + "</span>" +
          '<span class="ip-strip-val' + (c.accent ? " ip-strip-val--accent" : "") + '">' +
          "<span>" + P.esc(c.value) + "</span></span>" +
          '<span class="ip-strip-note">' + c.note + "</span>" +
          "</div>"
        );
      })
      .join('<div class="ip-vrule"></div>');
    return (
      '<div class="ip-card ip-card--edge">' +
      '<div class="ip-strip">' + cells + "</div>" +
      '<div class="ip-prose"><span><span>' + P.esc(ip01Lag()) + "</span></span>" +
      "<span><span>" + P.esc(IP01.scope) + "</span></span>" +
      "<span><span>We do not track per-holding filing confirmations, so no share of this " +
      "register can be called confirmed — that cell is N/A rather than a percentage.</span></span>" +
      "</div>" +
      "</div>"
    );
  }

  /* The staleness sentence names the register it is describing. IP01.scope below it is a statement
   * of what Section 13(f) covers — a rule, not a figure, so it stays as written. */
  function ip01Lag() {
    var reg = IP_DATA.register;
    var m = reg.period_meta || {};
    return (
      "13F-HR is filed within " + (m.deadline_days || 45) + " days of quarter end — this register " +
      "is as of " + ipQuarter(reg.period) +
      (m.filed_latest ? ", filed " + m.filed_latest : "") +
      ", and is not a real-time holder list."
    );
  }

  /* The base / filed-since / adjusted equation.
   *
   * ⚠️ The "= Adjusted register" cell has NO honest source and never will: summing a 13D/G *total*
   * position, a Form 4 *transaction* and a 13F *holding* produces a share count nobody filed.
   * Attempt 3 omitted it on exactly that reasoning and the operator's Batch B passed on it. So the
   * two real cells carry real numbers and the third states why it is not a number — the shape of
   * the prototype's equation survives, the fabricated total does not. */
  function ip01EquationCells() {
    var reg = IP_DATA.register;
    if (IP_DATA.status !== "ready" || ipErr(reg)) return null;
    var m = reg.period_meta || {};
    var filed = ipErr(IP_DATA.filed) ? null : IP_DATA.filed;
    var applied = filed
      ? filed.filings.filter(function (f) { return /13[DG]/.test(f.form); }).length
      : null;

    return [
      {
        label: "Base register",
        value: ipShares(reg.total_reported_shares),
        note: "<span>13F-HR · " + P.esc(ipQuarter(reg.period)) +
          (m.filed_latest ? ", filed " + P.esc(m.filed_latest) : "") + "</span>",
      },
      {
        op: "+",
        label: "Filed since",
        value: IP_NA,
        status: "na",
        note: filed
          ? "<span>" + applied + "</span> of <span>" + filed.filings.length +
            "</span> state a position"
          : "<span>not loaded</span>",
      },
      {
        op: "=",
        label: "Adjusted register",
        value: IP_NA,
        status: "na",
        note: "<span>not a total we can take</span>",
      },
    ];
  }

  /* The cells stay at the prototype's three-word register so the equation holds its row; the whole
   * reason lives here, once, with the full column to wrap in. */
  function ip01EquationWhy() {
    var filed = IP_DATA.filed;
    if (ipErr(filed)) {
      return "Filed since and Adjusted register are N/A: " + ipWhy(filed) + ".";
    }
    return (
      "Filed since and Adjusted register are N/A because the filings accepted since this register " +
      "closed report single transactions rather than positions — a 13D/G total, a Form 4 " +
      "transaction and a 13F holding do not add, and the sum would be a share count nobody filed."
    );
  }

  // The card that states the 13F's own staleness and then shows where the register moved.
  function ip01SinceLast13F() {
    var eq = ip01EquationCells()
      .map(function (c) {
        var cell =
          '<div class="ip-eq-cell">' +
          '<span class="ip-slot-head"><span class="ip-eq-label ip-card-note">' +
          P.esc(c.label) + "</span>" + ipStatusChip(c.status) + "</span>" +
          '<span class="ip-eq-val' + (c.accent ? " ip-eq-val--accent" : "") + '">' +
          "<span>" + P.esc(c.value) + "</span></span>" +
          '<span class="ip-eq-note">' + c.note + "</span>" +
          "</div>";
        if (!c.op) return cell;
        return '<div class="ip-eq-part"><span class="ip-eq-op">' + P.esc(c.op) + "</span>" + cell + "</div>";
      })
      .join("");
    return (
      '<div class="ip-card">' +
      '<div class="ip-card-head">' +
      '<h3 class="ip-card-title">Since the last 13F</h3>' +
      '<span class="ip-card-note">faster forms, by filing date · base and adjusted shown separately</span>' +
      ipLink("Base 13F ↗", ipEdgarFts("13F-HR")) +
      ipBadge("") +
      "</div>" +
      '<div class="ip-tint ip-eq">' + eq + "</div>" +
      '<div class="ip-eq-why">' + P.esc(ip01EquationWhy()) + "</div>" +
      '<div class="ip-micro ip-micro--block">Where the register moved · prior quarter to current</div>' +
      '<div class="ip-chart">' + ip01DumbbellChart() + "</div>" +
      '<div class="ip-caption"><span>' + P.esc(ip01DumbbellNote()) + "</span></div>" +
      ipExpander(
        "Also in this section",
        "filing-by-filing detail since the snapshot · how fast each form arrives",
        ip01ExpanderBody()
      ) +
      "</div>"
    );
  }

  /* The eight largest quarter-over-quarter moves, from /institutional-activity — which is
   * `flows.py` diffing two quarter-end snapshots. **DERIVED, not reported trades**; the caption
   * under the chart and the endpoint's own caveats both say so.
   *
   * Only managers present in BOTH quarters get a row: a manager with one side missing has no
   * "prior → current" to draw, and an entry or exit is a coverage event as often as a trade
   * (the turnover block's `cannot` makes the same point). Colour is one accent, not the
   * prototype's three-way manager-type encoding — we do not classify managers by type, and
   * inventing a class from the name would be exactly the fabrication phase 2 exists to remove. */
  function ip01DumbbellRows() {
    var act = IP_DATA.activity;
    if (IP_DATA.status !== "ready" || ipErr(act) || !act.activity) return null;
    var rows = act.activity
      .filter(function (a) {
        return a.shares_before !== null && a.shares_before !== undefined &&
          a.shares_after !== null && a.shares_after !== undefined &&
          a.shares_after !== a.shares_before;
      })
      .map(function (a) {
        return {
          label: a.manager_name || ("CIK " + a.manager_cik),
          prior: a.shares_before / 1e6,
          current: a.shares_after / 1e6,
          delta: ipSignedShares(a.shares_after - a.shares_before),
          color: "#c0703a",
        };
      });
    if (!rows.length) return null;
    rows.sort(function (x, y) {
      return Math.abs(y.current - y.prior) - Math.abs(x.current - x.prior);
    });
    return rows.slice(0, 8);
  }

  function ip01DumbbellChart() {
    var rows = ip01DumbbellRows();
    if (!rows) {
      return (
        '<div class="ip-rr-empty"><span class="ex21-dash">—</span><p>No manager reports a ' +
        "position in both " + P.esc(ipQuarter((IP_DATA.activity || {}).from_period)) + " and " +
        P.esc(ipQuarter(IP_DATA.period)) + ", so there is no prior-to-current move to draw. " +
        "That is a gap in what we have ingested, not a confirmed absence of movement.</p></div>"
      );
    }
    var max = rows.reduce(function (m, r) { return Math.max(m, r.prior, r.current); }, 0);
    return ipDumbbell(rows, max * 1.06); // headroom so the largest dot clears the track's end
  }

  function ip01DumbbellNote() {
    if (!ip01DumbbellRows()) {
      return "Hollow is the position as reported in the prior quarter’s 13F, filled the current " +
        "register. Direction is described, not scored.";
    }
    return (
      "DERIVED by diffing two quarter-end 13F snapshots — these are not reported trades. Hollow " +
      "is the position as reported in " + ipQuarter((IP_DATA.activity || {}).from_period) +
      ", filled the current register. Only managers that report in both quarters appear: an " +
      "entrant or an exit has no prior-to-current line, and can be a coverage gap rather than a " +
      "trade. Direction is described, not scored."
    );
  }

  /* §01's expander: every filing accepted since the snapshot and whether it moves the register,
   * plus how fast each form type arrives (a statutory table — a rule, not a figure). */
  function ip01FilingRows() {
    var filed = IP_DATA.filed;
    if (IP_DATA.status !== "ready" || ipErr(filed)) return null;
    var DEADLINE = {
      "13F-HR": "45 days after quarter end", "SC 13D": "5 business days",
      "SC 13D/A": "2 business days", "SC 13G": "45 days after year end",
      "SC 13G/A": "5 business days", "Form 4": "2 business days",
      "Form 3": "10 days of becoming an insider", "Form 5": "45 days after fiscal year end",
    };
    return filed.filings.map(function (f) {
      var isPosition = /13[DG]/.test(f.form);
      return {
        form: f.form,
        filer: f.filer,
        what: f.reported + (f.percent_of_class !== null && f.percent_of_class !== undefined
          ? " · " + ipPct(f.percent_of_class / 100, 1) + " of class" : ""),
        deadline: DEADLINE[f.form] || "—",
        applied: isPosition
          ? "states a position"
          : "not applied · " + (f.shares_are || "not a 13F holding"),
        shares: f.shares === null || f.shares === undefined ? "—" : ipSignedShares(
          /dispos|sold|sale/i.test(f.reported || "") ? -Math.abs(f.shares) : f.shares
        ) + " sh",
        accepted: f.filed || IP_NA,
      };
    });
  }

  function ip01ExpanderBody() {
    var rows = ip01FilingRows()
      .map(function (f) {
        return (
          '<div class="ip-ftab-row">' +
          '<span class="ip-ftab-form"><span>' + P.esc(f.form) + "</span></span>" +
          '<span class="ip-ftab-what">' +
          "<span><span>" + P.esc(f.filer) + "</span> · <span>" + P.esc(f.what) + "</span></span>" +
          '<span class="ip-ftab-dl">deadline: <span>' + P.esc(f.deadline) + "</span> · <span>" +
          P.esc(f.applied) + "</span></span>" +
          "</span>" +
          '<span class="ip-ftab-sh"><span>' + P.esc(f.shares) + "</span></span>" +
          '<span class="ip-ftab-at"><span>' + P.esc(f.accepted) + "</span></span>" +
          "</div>"
        );
      })
      .join("");
    var speed = IP01.speed
      .map(function (s) {
        return (
          '<div class="ip-speed-row">' +
          '<span class="ip-speed-form"><span>' + P.esc(s[0]) + "</span></span>" +
          '<span class="ip-speed-dl"><span>' + P.esc(s[1]) + "</span></span>" +
          '<span class="ip-speed-note"><span>' + P.esc(s[2]) + "</span></span>" +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="ip-ftab-head"><span>Form</span><span>Filer · what changed</span>' +
      '<span class="ip-r">Shares</span><span class="ip-r">Accepted</span></div>' +
      rows +
      '<div class="ip-caption"><span>' + P.esc(ip01FilingsNote()) + "</span></div>" +
      '<div class="ip-micro ip-micro--block">How fast each form arrives</div>' +
      speed
    );
  }

  function ip01FilingsNote() {
    var filed = IP_DATA.filed;
    return (
      (filed.does_not_restate_reason ||
        "None of these restate the 13F register.") + " " +
      (filed.dates_are || "") + " " +
      "Holders with no filing obligation are unchanged by construction; this is not a live " +
      "holder list."
    ).replace(/\s+/g, " ").trim();
  }

  /* The right rail on the ported view (operator, 2026-07-30): the prototype's Filing-timeline
   * FRAME, our honest empty state inside it. The prototype fills it with nine sample filings; we
   * do not have a filing index until V3-P3, and fabricating one is exactly what P4 refused to do —
   * the page's banner covers the numbers in the content column, not an invented filing history.
   * Scoped to this view only; Overview and Financial history keep P4's rail untouched. */
  function ipRightRail() {
    return (
      '<div class="ip-rr-card">' +
      '<div class="ip-rr-eyebrow">Filing timeline</div>' +
      '<div class="ip-rr-sub">every form as filed</div>' +
      '<div class="ip-rr-filters">' +
      TIMELINE_FILTERS.map(function (f) {
        return '<span class="ip-rr-filter" title="Filing timeline filters arrive with the ' +
          'filing-index ingest">' + P.esc(f) + "</span>";
      }).join("") +
      "</div>" +
      '<div class="ip-rr-empty"><span class="ex21-dash">—</span>' +
      "<p>Not available yet. The full filing index — every form this registrant has filed, with " +
      "its date — is not part of the structured data we store today.</p></div>" +
      '<a class="ip-rr-link" href="' + edgarUrl("") + '" target="_blank" rel="noopener">' +
      "All filings on EDGAR ↗</a>" +
      '<div class="ip-rr-note">The register on this page is built from 13F-HR, SC 13D/G and ' +
      "DEF 14A. When the filing index lands, this rail lists every form as filed.</div>" +
      "</div>"
    );
  }

  /* The four headline tiles.
   *
   * Two are the register's own numbers. Two need SHARES OUTSTANDING, which the register endpoint
   * does not carry — so "Institutional share" and the "of N shares outstanding" sub-line read N/A
   * with the reason rather than a ratio computed against a denominator we do not have. The fourth,
   * insider ownership, is the DEF 14A beneficial-ownership table: not ingested, not in Track 1's
   * structured sources today. All three CANNOT-SOURCE, all three honest. */
  function ip01TileList() {
    var reg = IP_DATA.register;
    if (IP_DATA.status !== "ready" || ipErr(reg)) return null;
    var conc = reg.concentration || {};
    var holders = ipOk(conc, "holder_count")
      ? conc.holder_count
      : (reg.period_meta || {}).ingested_filer_count;

    return [
      {
        label: "Reporting managers",
        value: holders === null || holders === undefined ? IP_NA : ipCount(holders),
        status: holders === null || holders === undefined ? "na" : ipChipFor(conc),
        note: "13F-HR filers we have ingested reporting a position",
      },
      {
        label: "Shares reported",
        value: ipShares(reg.total_reported_shares),
        status: reg.total_reported_shares === null || reg.total_reported_shares === undefined ? "na" : null,
        note: "shares outstanding is <span>" + IP_NA + "</span> — not carried on the 13F register",
      },
      {
        label: "Institutional share",
        value: IP_NA,
        status: "na",
        derived: true,
        note: "needs shares outstanding, which this register does not carry",
      },
      {
        label: "Insider ownership",
        value: IP_NA,
        status: "na",
        note: "the DEF 14A beneficial ownership table is not ingested",
      },
    ];
  }

  function ip01Tiles() {
    return (
      '<div class="ip-tiles">' +
      ip01TileList()
        .map(function (t) {
          var head =
            '<span class="ip-tile-head"><span class="ip-micro">' + P.esc(t.label) + "</span>" +
            (t.derived ? ipBadge("01-share") : "") + ipStatusChip(t.status) + "</span>";
          return (
            '<div class="ip-tile">' + head +
            '<span class="ip-tile-val"><span>' + P.esc(t.value) + "</span></span>" +
            '<span class="ip-tile-note">' + t.note + "</span>" +
            "</div>"
          );
        })
        .join("") +
      "</div>" +
      /* Full section width, a sibling of the tile grid — the prototype measures 694px for this
         panel. Inside the tile it is ~200px wide and the source column clips. */
      ipDerivationPanel("01-share")
    );
  }

  /* The prototype's dumbbell, ported as its own builder (decision D-protocharts) rather than
   * reused from ClearyFi.dumbbellChart — the shared builders bring their card chrome and their
   * mono eyebrow with them, which is part of what read as "leftovers from previous design".
   *
   * Hand-authored SVG on a fixed viewBox at width:100%: geometry is authored once in viewBox units
   * and the browser scales it, so this never measures its container.
   *
   * Anatomy, per row: the label right-aligned in a left gutter · a full-width track rule · a hollow
   * dot for the prior quarter and a filled one for the current · a connector between them · the
   * signed delta right-aligned OUTSIDE the plot. All eight constants below are the prototype's. */
  var IP_DB = {
    width: 660,      // viewBox units; the card's inner width at the prototype's 694px column
    gutter: 210,     // right edge of the label gutter == left edge of the track
    trackEnd: 582,
    deltaX: 591,
    firstRow: 41.5,
    rowStep: 27,
    tailPad: 27.5,
    legendY: 12,
    domainMax: 123.43,   // millions of shares spanning gutter → trackEnd
  };

  /* Two of the prototype's constants had to become parameters once real filings data arrived:
   *
   * `domainMax` — the prototype's 123.43 describes ITS sample. A real register runs to billions,
   *   which clamped every dot onto the track's right edge.
   * `gutter` — the label gutter is sized for "Hedge fund H". Real manager names are unbounded
   *   ("BERKSHIRE HATHAWAY INC", "NORTHLESS CAPITAL PARTNERS"), the labels are right-anchored so
   *   they run LEFT out of the viewBox, and `.ip-db` is `overflow: hidden` — so an over-long name
   *   is **silently clipped**. Worse, whether it clips depends on which font actually loaded, so
   *   it can look fine in one browser and cut in another. `ipFitDumbbell()` measures the real
   *   thing after mount and re-renders at a gutter that fits (RECONCILIATION §6 rule 1).
   *
   * The literal fallback passes the prototype's own constants, so it still renders as captured. */
  function ipDumbbell(rows, domainMax, gutter) {
    var g = IP_DB;
    var dmax = domainMax || g.domainMax;
    var gut = gutter || g.gutter;
    var height = g.firstRow + (rows.length - 1) * g.rowStep + g.tailPad;
    var span = g.trackEnd - gut;
    var x = function (v) { return (gut + (v / dmax) * span).toFixed(2); };
    var parts = [
      '<text x="' + gut + '" y="' + g.legendY + '" class="ip-db-legend">○ prior quarter    ● current</text>',
    ];
    rows.forEach(function (r, i) {
      var y = g.firstRow + i * g.rowStep;
      parts.push(
        '<line x1="' + gut + '" y1="' + y + '" x2="' + g.trackEnd + '" y2="' + y + '" class="ip-db-track"></line>',
        '<text x="' + (gut - 10) + '" y="' + y + '" text-anchor="end" dominant-baseline="middle" class="ip-db-label">' +
          "<title>" + P.esc(r.label) + "</title>" + P.esc(r.label) + "</text>",
        '<line x1="' + x(r.prior) + '" y1="' + y + '" x2="' + x(r.current) + '" y2="' + y +
          '" stroke="' + r.color + '" stroke-width="2.4" opacity="0.5"></line>',
        '<circle cx="' + x(r.prior) + '" cy="' + y + '" r="4" fill="var(--bg-card)" stroke="' + r.color +
          '" stroke-width="1.5"></circle>',
        '<circle cx="' + x(r.current) + '" cy="' + y + '" r="4.6" fill="' + r.color + '"></circle>',
        '<text x="' + g.deltaX + '" y="' + y + '" dominant-baseline="middle" class="ip-db-delta">' +
          P.esc(r.delta) + "</text>"
      );
    });
    return (
      '<svg class="ip-db" width="100%" viewBox="0 0 ' + g.width + " " + height + '" ' +
      'preserveAspectRatio="xMidYMid meet" role="img" data-ip-gutter="' + gut + '" aria-label="' +
      'Change in reported position for the ' + rows.length + ' managers that moved most, prior quarter to current">' +
      parts.join("") +
      "</svg>"
    );
  }

  /* Post-mount: the only place the label width is actually knowable.
   *
   * `getComputedTextLength()` reports what the browser really rendered, with the font that really
   * loaded — which is the point, because the same name measures differently under Hanken Grotesk
   * and under the fallback, and the difference decides whether it clips. Widen the gutter to fit
   * the longest label (the track gives up the space), and if even the cap is not enough, trim the
   * label to fit and leave the full name on the `<title>` so nothing is lost silently.
   *
   * Runs once per paint and re-renders only when the gutter actually needs to change. */
  var IP_DB_GUTTER_MAX = 330; // past this the track is too short to read a movement on

  function ipFitDumbbell() {
    var svg = document.querySelector("#ip-01 svg.ip-db");
    if (!svg || !svg.getBBox) return;
    var used = +svg.getAttribute("data-ip-gutter") || IP_DB.gutter;
    var labels = [].slice.call(svg.querySelectorAll("text.ip-db-label"));
    if (!labels.length) return;

    var longest = labels.reduce(function (m, t) {
      var w = 0;
      try { w = t.getComputedTextLength(); } catch (e) { w = 0; }
      return Math.max(m, w);
    }, 0);
    if (!longest) return; // fonts not resolved yet; the caller retries after they load

    var need = Math.min(IP_DB_GUTTER_MAX, Math.max(IP_DB.gutter, Math.ceil(longest) + 12));
    if (Math.abs(need - used) < 1) { ipTrimDumbbell(svg, need); return; }

    var rows = ip01DumbbellRows();
    if (!rows) return;
    var max = rows.reduce(function (m, r) { return Math.max(m, r.prior, r.current); }, 0);
    var host = svg.parentNode;
    host.innerHTML = ipDumbbell(rows, max * 1.06, need);
    ipTrimDumbbell(host.querySelector("svg.ip-db"), need);
  }

  // Last resort: a name too long even for the widest gutter is trimmed, never cut mid-glyph by
  // the viewBox. The <title> keeps the full name for hover and for assistive tech.
  function ipTrimDumbbell(svg, gutter) {
    if (!svg) return;
    [].forEach.call(svg.querySelectorAll("text.ip-db-label"), function (t) {
      var full = (t.querySelector("title") || {}).textContent || t.textContent;
      var avail = gutter - 12;
      var node = t.lastChild;
      if (!node || node.nodeType !== 3) return;
      node.nodeValue = full;
      var guard = 0;
      while (t.getComputedTextLength() > avail && node.nodeValue.length > 4 && guard++ < 60) {
        node.nodeValue = node.nodeValue.slice(0, -2).replace(/[\s·]+$/, "") + "…";
        node.nodeValue = node.nodeValue.replace(/…+$/, "…");
      }
    });
  }

  /* §03's peer matrix has the same exposure §01's dumbbell had, and for the same reason: the
   * prototype's labels were four-letter tickers (AVGO, NVDA) and ours are registrant NAMES,
   * because a peer reached by CIK has no ticker to show. A column header is centred over a ~50-unit
   * cell and a row header is right-anchored at the grid's edge, so an over-long label runs off both
   * the top and the LEFT of a viewBox that clips.
   *
   * Measured after paint, never estimated: text width is font-dependent, so the same label fits
   * with the webfont loaded and is cut without it (§01's defect was 165.8 vs 184.7 units, +11%).
   * `getComputedTextLength()` is the only honest answer -- RECONCILIATION §6 rule 1. */
  function ipFitMatrix() {
    var scope = "#ip-03 text[data-ip-w], .ip-lb text[data-ip-w]";
    [].forEach.call(document.querySelectorAll(scope), function (t) {
      var avail = +t.getAttribute("data-ip-w");
      if (!avail) return;
      var node = t.lastChild;
      if (!node || node.nodeType !== 3) return;
      var full = (t.querySelector("title") || {}).textContent || node.nodeValue;
      /* Measure BEFORE widening to the full name. Restoring `full` first and bailing out on an
       * unmeasurable width would leave the LONGEST string in a viewBox that clips -- worse than
       * the pre-shortened label we arrived with. (That is exactly what the first cut of this
       * function did, and it put the row labels' tails on screen with their heads cut off.) */
      var shortForm = node.nodeValue;
      var width;
      try { width = t.getComputedTextLength(); } catch (e) { width = 0; }
      if (!width) return; // fonts not resolved yet; the caller retries once they are
      node.nodeValue = full;
      try {
        if (t.getComputedTextLength() > avail) node.nodeValue = shortForm;
      } catch (e) {
        node.nodeValue = shortForm;
      }
      var guard = 0;
      while (t.getComputedTextLength() > avail && node.nodeValue.length > 2 && guard++ < 60) {
        node.nodeValue = node.nodeValue.slice(0, -2).replace(/[\s.·]+$/, "") + "…";
        node.nodeValue = node.nodeValue.replace(/…+$/, "…");
      }
    });
  }

  /* ============================ §02 · Register over time & holders ============================
   * Ground truth: proto-i2.png / proto-i2-open.png + literals-open.json.
   * ⚠️ EVERY VALUE IS A PROTOTYPE LITERAL. Chart series were RECOVERED from the captured SVG path
   * data (the same technique as §01's dumbbell), not transcribed by eye. */
  /* ---------- §02, on real filings data (phase 2) ----------
   *
   * The quarters the charts run over: oldest → newest, capped at the prototype's axis length.
   * These are INGESTED quarters, not calendar quarters — a gap in coverage is a missing column,
   * not a zero, and the captions say so. */
  function ip02Quarters() {
    return IP_DATA.periods.slice(0, IP_SERIES_QUARTERS).slice().reverse();
  }

  function ip02QuarterLabels() {
    return ip02Quarters().map(ipQuarter);
  }

  /* A five-tick axis over real values. The prototype's ticks are literals because its own maxima
   * are fractional; ours are computed, so the max is rounded UP to a step that divides into four
   * and the five ticks land on it exactly. Never rounds a value down — the top of the axis must
   * contain the data.
   *
   * `integer` matters more than it looks. A holder count of 7 on a continuous axis yields
   * 0/1.8/3.6/5.4/7.2, which PRINTS as "0 2 4 5 7" — unevenly spaced to the eye and, at 2 holders,
   * as "0 1 1 2 2" with duplicate labels. A count axis must step by whole numbers. */
  function ipNiceAxis(max, fmt, integer) {
    if (!(max > 0)) return { axisMax: 1, ticks: ["0", "", "", "", ""] };
    var top;
    if (integer) {
      top = Math.max(4, Math.ceil(max / 4) * 4); // ≥4 so four integer steps always exist
    } else {
      var pow = Math.pow(10, Math.floor(Math.log10(max)) - 1);
      top = Math.ceil(max / (4 * pow)) * 4 * pow;
    }
    var ticks = [];
    for (var i = 0; i <= 4; i++) ticks.push(fmt(top * (i / 4)));
    return { axisMax: top, ticks: ticks };
  }

  function ipSection02() {
    if (IP_DATA.status === "idle" || ipPending(IP_DATA.register)) {
      return P.states.loading({ title: "Loading the register history" });
    }
    if (IP_DATA.status === "error" || ipErr(IP_DATA.register)) {
      var e = IP_DATA.error || (IP_DATA.register || {})._err || {};
      return P.states.error({
        copy: "Couldn't load the register history (" + (e.status || "network") + ")." +
          (e.detail ? " " + e.detail : ""),
      });
    }
    return (
      '<div class="ip-grid2">' + ip02OverTime() + ip02Mix() + "</div>" +
      ipExpander(
        "Also in this section",
        "each manager quarter by quarter · the largest reporting managers",
        ip02Holders()
      )
    );
  }

  // Holder count and reported shares, one point per INGESTED quarter, from each quarter's register.
  function ip02SeriesSpecs() {
    var qs = ip02Quarters();
    var mgr = [], sh = [];
    qs.forEach(function (p) {
      var r = IP_DATA.registers[p];
      var c = r && r.concentration;
      mgr.push(c && c.holder_count !== null && c.holder_count !== undefined
        ? c.holder_count
        : (r && r.period_meta ? r.period_meta.ingested_filer_count : null));
      sh.push(r ? r.total_reported_shares : null);
    });
    var known = function (a) { return a.filter(function (v) { return v !== null && v !== undefined; }); };
    if (!known(mgr).length || !known(sh).length) return null;
    var mAx = ipNiceAxis(Math.max.apply(null, known(mgr)), function (v) { return ipCount(v); }, true);
    var sAx = ipNiceAxis(Math.max.apply(null, known(sh)), ipShares);
    return {
      quarters: qs,
      labels: ip02QuarterLabels(),
      missing: qs.length - Math.min(known(mgr).length, known(sh).length),
      managers: { values: mgr, axisMax: mAx.axisMax, color: "var(--accent)", ticks: mAx.ticks },
      shares: { values: sh, axisMax: sAx.axisMax, color: "var(--gaap-color)", ticks: sAx.ticks },
    };
  }

  function ip02OverTime() {
    var s = ip02SeriesSpecs();
    var head =
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Register over time</h3>' +
      '<span class="ip-card-note">holder count and reported shares, ' +
      (s ? s.quarters.length : 0) + " ingested quarters</span>" +
      (s ? ipChip("02-register") : "") +
      ipLink("13F filings ↗", ipEdgarFts("13F-HR")) +
      "</div>";
    if (!s) {
      return head +
        '<div class="ip-rr-empty"><span class="ex21-dash">—</span><p>Only one 13F quarter has ' +
        "been ingested for this issuer, so there is no history to chart yet. A single point is " +
        "not a trend, and an empty axis would imply quarters we have not read.</p></div></div>";
    }
    return (
      head +
      '<div class="ip-micro ip-micro--tight">Reporting managers</div>' +
      ipAreaChart(s.managers, s.labels) +
      '<div class="ip-micro ip-micro--tight ip-micro--gap">Shares reported</div>' +
      ipAreaChart(s.shares, s.labels) +
      '<div class="ip-caption"><span>' + P.esc(ip02NetChange(s)) + "</span></div>" +
      "</div>"
    );
  }

  /* The caption states the change AND what an "exit" from this register actually means — the
   * turnover block's `cannot` makes the same point, and it is the difference between a manager
   * selling and a manager we simply have not ingested this quarter. */
  function ip02NetChange(s) {
    var v = s.managers.values;
    var last = v[v.length - 1], prev = v[v.length - 2];
    var head;
    if (last === null || last === undefined || prev === null || prev === undefined) {
      head = "Net change this quarter: N/A — a quarter on either side of the comparison has no " +
        "ingested filers.";
    } else {
      var d = last - prev;
      head = "Net change this quarter: " + (d > 0 ? "+" : d < 0 ? "−" : "") + Math.abs(d) +
        " reporting managers.";
    }
    return (
      head + " Each point counts the filers we have INGESTED for that quarter, so a fall can be a " +
      "coverage gap rather than managers leaving the register." +
      (s.missing ? " " + s.missing + " quarter(s) on this axis have no ingested filers at all." : "")
    );
  }

  /* Registration-category colours. Categorical identity only — never a favourability scale
   * (HANDOFF §3 rule 1), and the same five hues the prototype used for its own bands. */
  var IP_CAT_COLORS = {
    adviser: "#c0703a",
    bank: "#3d6a8a",
    insurance: "#8b8579",
    fund: "#a88c5f",
    broker_dealer: "#6b6459",
    trust: "#8a5a2f",
    other: "#4e4a42",
  };

  /* Per-quarter composition, oldest → newest, for the stacked area. A quarter whose register we
   * hold but cannot classify at all contributes NOTHING rather than a zero band — and if any
   * quarter is like that the chart is not drawn, because a gap in a 100%-stacked area reads as
   * a category collapsing to zero, which would be a finding rather than a coverage hole. */
  function ip02MixBands() {
    var qs = ip02Quarters();
    var comps = qs.map(function (p) {
      var r = IP_DATA.registers[p];
      return r && r.composition && r.composition.status === "ok" ? r.composition : null;
    });
    if (qs.length < 2 || comps.some(function (c) { return !c; })) return null;

    var keys = [];
    comps.forEach(function (c) {
      c.categories.forEach(function (x) { if (keys.indexOf(x.key) === -1) keys.push(x.key); });
    });
    // Stable order: the current quarter's largest first, so the legend reads top-down.
    var latest = comps[comps.length - 1];
    keys.sort(function (a, b) {
      var wa = (latest.categories.filter(function (x) { return x.key === a; })[0] || {}).weight || 0;
      var wb = (latest.categories.filter(function (x) { return x.key === b; })[0] || {}).weight || 0;
      return wb - wa;
    });
    return keys.map(function (k) {
      var of = function (c) {
        var hit = c.categories.filter(function (x) { return x.key === k; })[0];
        return hit ? hit.weight : 0;
      };
      var cur = of(latest);
      var prior = comps.length > 1 ? of(comps[comps.length - 2]) : cur;
      return {
        key: k,
        label: (latest.categories.filter(function (x) { return x.key === k; })[0] || {}).label ||
          CATEGORY_FALLBACK_LABEL,
        color: IP_CAT_COLORS[k] || IP_CAT_COLORS.other,
        pct: ipPct(cur, 0),
        prior: ipPct(prior, 0),
        share: comps.map(of),
      };
    });
  }

  var CATEGORY_FALLBACK_LABEL = "Other registrant type";

  /* "Manager mix" — the prototype's card, now on the one classification that reaches the WHOLE
   * register: each filer's own SIC code from its own SEC registration.
   *
   * ⚠️ What this is NOT, and the copy says so: a REGISTRATION category, not a strategy. An index
   * fund, a stock-picker and a quant shop all register as 6282. Nothing in any ownership form
   * distinguishes them, and inferring it from a manager's name would be our label presented as
   * theirs. `coverage` is shown because a mix over 96% of the register and a mix over 30% are
   * different claims.
   *
   * "Top ten managers" below it is the register's own `top10_share`. */
  function ip02Mix() {
    var reg = IP_DATA.register || {};
    var comp = reg.composition;
    var conc = reg.concentration;
    var pct = ipOk(conc, "top10_share") ? ipPct(conc.top10_share, 1) : IP_NA;
    var ok = comp && comp.status === "ok";
    return (
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Manager mix</h3>' +
      '<span class="ip-card-note">by registered institution type</span>' +
      (ok ? ipBadge("02-mix") : ipStatusChip("na")) +
      "</div>" +
      (ok ? ipDerivationPanel("02-mix") : "") +
      (ok ? ip02MixBody(comp) : ip02MixEmpty(comp)) +
      '<div class="ip-topten">' +
      '<div class="ip-topten-head"><span class="ip-topten-label">Top ten managers</span>' +
      '<span class="ip-topten-val"><span>' + P.esc(pct) + "</span></span>" +
      ipStatusChip(pct === IP_NA ? "na" : null) + "</div>" +
      '<div class="ip-topten-foot"><span class="ip-topten-note"><span>' +
      P.esc(ip02TopTenNote(conc, pct)) + "</span></span>" +
      ipBadge("02-topten") + "</div>" +
      ipDerivationPanel("02-topten") +
      "</div>" +
      "</div>"
    );
  }

  function ip02MixBody(comp) {
    var bands = ip02MixBands();
    var legend = (bands || comp.categories.map(function (x) {
      return {
        key: x.key, label: x.label, color: IP_CAT_COLORS[x.key] || IP_CAT_COLORS.other,
        pct: ipPct(x.weight, 0), prior: null,
      };
    }))
      .map(function (m) {
        return (
          '<div class="ip-legend-row">' +
          '<div class="ip-legend-head">' +
          '<span class="ip-legend-id"><span class="ip-swatch" style="background:' + m.color + '"></span>' +
          '<span class="ip-legend-label">' + P.esc(m.label) + "</span></span>" +
          '<span class="ip-legend-pct">' + P.esc(m.pct) + "</span>" +
          "</div>" +
          '<div class="ip-bar"><div class="ip-bar-fill" style="width:' + P.esc(m.pct) +
          ";background:" + m.color + '"></div>' +
          (m.prior ? '<div class="ip-bar-tick" style="left:' + P.esc(m.prior) + '"></div>' : "") +
          "</div>" +
          (m.prior
            ? '<div class="ip-bar-note">tick: prior quarter <span>' + P.esc(m.prior) + "</span></div>"
            : "") +
          "</div>"
        );
      })
      .join("");
    return (
      (bands ? ipStackedArea(bands, ip02QuarterLabels()) : "") +
      '<div class="ip-caption"><span>' + P.esc(ip02MixCaption(comp, !!bands)) + "</span></div>" +
      '<div class="ip-legend">' + legend + "</div>"
    );
  }

  function ip02MixCaption(comp, charted) {
    var cov = comp.coverage === null || comp.coverage === undefined ? null : ipPct(comp.coverage, 0);
    return (
      (charted
        ? "Share of the ingested register by the filer\u2019s own registered institution type, " +
          "over the quarters we hold. "
        : "Share of the ingested register by the filer\u2019s own registered institution type. ") +
      "Colour is categorical identity only. " +
      "This is a REGISTRATION category, not a strategy \u2014 an index fund, a stock-picker and a " +
      "quant fund all register as investment advice, and nothing in any ownership form separates " +
      "them. " +
      (cov
        ? "It describes " + cov + " of the register\u2019s reported shares; the rest is held by " +
          comp.unclassified_holder_count + " filer(s) with no SIC on file, excluded rather than " +
          "grouped as \u201cother\u201d."
        : "")
    );
  }

  function ip02MixEmpty(comp) {
    return (
      '<div class="ip-rr-empty"><span class="ex21-dash">\u2014</span><p>' +
      P.esc(comp ? ipWhy(comp) : "the register did not load") +
      "</p><p>Every EDGAR filer carries an SIC code on its own registration, so this fills in as " +
      "those registrations are ingested. It would say what KIND of institution holds the shares " +
      "\u2014 adviser, bank, insurer \u2014 never how it invests, which no ownership form " +
      "reports.</p></div>"
    );
  }

  function ip02TopTenNote(conc, pct) {
    if (pct === IP_NA) return ipWhy(conc);
    var n = conc.holder_count;
    return (
      "Share of the 13F shares reported by the " + ipCount(n) + " filers we have ingested this " +
      "quarter that is held by the ten largest of them" +
      (n <= 10 ? " — which is all of them, so this reads 100% by construction." : ".") +
      " Not a share of the company, and not all institutional ownership."
    );
  }

  /* One panel per manager, each rebuilt from that manager's own reported points.
   *
   * `points` come back newest-first; a sparkline reads left-to-right in time, so they are
   * reversed. Each panel is normalised to ITS OWN range — the prototype's caption says so and it
   * is the honest reading, because these managers differ by three orders of magnitude.
   *
   * A manager reporting only one quarter gets NO sparkline: a single point drawn as a flat line
   * would assert a trend we have not observed. The prototype's classification sub-line is gone —
   * we do not classify managers (see ip02Mix) — and carries the quarter count instead, which is
   * the thing a reader actually needs to weigh the shape. */
  function ip02PanelData() {
    var ser = IP_DATA.series;
    if (ipErr(ser) || !ser.series || !ser.series.length) return null;
    return ser.series
      .map(function (m) {
        var pts = (m.points || [])
          .filter(function (p) { return p.shares !== null && p.shares !== undefined; })
          .slice()
          .reverse();
        var vals = pts.map(function (p) { return p.shares; });
        var last = vals.length ? vals[vals.length - 1] : null;
        var prev = vals.length > 1 ? vals[vals.length - 2] : null;
        var lo = vals.length ? Math.min.apply(null, vals) : 0;
        var hi = vals.length ? Math.max.apply(null, vals) : 0;
        return {
          name: m.manager_name || "CIK " + m.manager_cik,
          quarters: vals.length,
          shares: last === null ? IP_NA : ipShares(last),
          latest: last,
          delta: prev === null || !prev
            ? (vals.length ? "one quarter" : IP_NA)
            : (last >= prev ? "\u2191 +" : "\u2193 \u2212") +
              Math.abs(((last - prev) / prev) * 100).toFixed(0) + "%",
          // normalise to the panel's own range; a flat series sits on the baseline
          spark: hi > lo ? vals.map(function (v) { return (v - lo) / (hi - lo); }) : null,
        };
      })
      .sort(function (a, b) { return (b.latest || 0) - (a.latest || 0); });
  }

  function ip02Panels() {
    var data = ip02PanelData();
    if (!data) return "";
    return data
      .map(function (m) {
        return (
          '<div class="ip-panel" style="border-left-color:var(--accent)">' +
          '<div class="ip-panel-name" title="' + P.esc(m.name) + '">' + P.esc(m.name) + "</div>" +
          '<div class="ip-panel-cls">' + m.quarters + " quarter" + (m.quarters === 1 ? "" : "s") +
          " reported</div>" +
          (m.spark
            ? ipSparkline(m.spark, "var(--accent)")
            : '<div class="ip-panel-flat">' +
              (m.quarters < 2
                ? "one quarter reported \u2014 no trend to draw"
                : "unchanged across the quarters we hold") +
              "</div>") +
          '<div class="ip-panel-foot"><span>' + P.esc(m.shares) + "</span>" +
          "<span>" + P.esc(m.delta) + "</span></div>" +
          "</div>"
        );
      })
      .join("");
  }

  /* The ten largest reporting managers, from the register's own ranked share vector. The Δ column
   * is the DERIVED quarter-over-quarter change from /institutional-activity — the same source
   * §01's dumbbell uses, and it carries the same caveat.
   *
   * The prototype's "% out" column is a share of SHARES OUTSTANDING, which the register does not
   * carry (the same gap that makes §01's institutional-share tile N/A). It becomes "% of register"
   * — a share of the ingested filers' reported shares, which is what `weight` actually is.
   * Renamed rather than dropped: the number is real, the prototype's label for it was not. */
  function ip02TableRows() {
    var reg = IP_DATA.register;
    if (ipErr(reg) || !reg.share_vector || !reg.share_vector.length) return null;
    var deltas = {};
    if (!ipErr(IP_DATA.activity) && IP_DATA.activity.activity) {
      IP_DATA.activity.activity.forEach(function (a) {
        if (a.shares_before && a.shares_after !== null && a.shares_after !== undefined) {
          deltas[a.manager_cik] = ((a.shares_after - a.shares_before) / a.shares_before) * 100;
        }
      });
    }
    var asOf = {};
    if (!ipErr(IP_DATA.series) && IP_DATA.series.series) {
      IP_DATA.series.series.forEach(function (m) {
        var pt = (m.points || [])[0];
        if (pt) asOf[m.manager_cik] = pt.period;
      });
    }
    return reg.share_vector.slice(0, 10).map(function (h) {
      var d = deltas[h.manager_cik];
      return {
        name: h.manager_name || "CIK " + h.manager_cik,
        // The filer's OWN declaration on its Schedule 13D/G cover page — the only entity
        // self-classification in any ownership form we ingest. Blank for a manager that has
        // not filed one, which is most of them: that only happens above 5%.
        type: h.reporting_person_type_label || null,
        typeCode: h.reporting_person_type || null,
        meta: "13F-HR" + (asOf[h.manager_cik] ? " \u00b7 as of " + asOf[h.manager_cik] : ""),
        shares: ipShares(h.shares),
        pct: h.weight === null || h.weight === undefined ? IP_NA : ipPct(h.weight, 2),
        delta: d === undefined
          ? IP_NA
          : (d >= 0 ? "\u2191 +" : "\u2193 \u2212") + Math.abs(d).toFixed(1) + "%",
      };
    });
  }

  function ip02Holders() {
    var panels = ip02Panels();
    var data = ip02TableRows();
    var head =
      '<div class="ip-card">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Largest reporting managers</h3>' +
      '<span class="ip-card-note">13F-HR, position as of ' + P.esc(ipQuarter(IP_DATA.period)) +
      " \u00b7 \u0394 is derived quarter over quarter</span>" +
      ipLink("Read the 13F table \u2197", ipEdgarFts("13F-HR")) +
      "</div>";
    if (!data) {
      return head +
        '<div class="ip-rr-empty"><span class="ex21-dash">\u2014</span><p>No filer reports a ' +
        "position in this issuer for " + P.esc(ipQuarter(IP_DATA.period)) + ". That is a gap in " +
        "what we have ingested, not a confirmed absence of institutional holders.</p></div></div>";
    }
    var rows = data
      .map(function (r) {
        return (
          '<div class="ip-mtab-row">' +
          '<span class="ip-mtab-id"><span class="ip-mtab-name">' + P.esc(r.name) + "</span>" +
          '<span class="ip-mtab-meta">' + P.esc(r.meta) + "</span></span>" +
          '<span class="ip-mtab-type"' +
          (r.type ? ' title="Schedule 13D/G cover page, code ' + P.esc(r.typeCode) + '"' : "") +
          ">" + (r.type ? P.esc(r.type) : '<span class="ip-mtab-none">—</span>') + "</span>" +
          '<span class="ip-mtab-num">' + P.esc(r.shares) + "</span>" +
          '<span class="ip-mtab-num">' + P.esc(r.pct) + "</span>" +
          '<span class="ip-mtab-num ip-mtab-num--delta">' + P.esc(r.delta) + "</span>" +
          "</div>"
        );
      })
      .join("");
    return (
      head +
      (panels
        ? '<div class="ip-subbar">' +
          '<span class="ip-micro">Reported shares by quarter \u00b7 one panel per manager</span>' +
          ipChip("02-panels") +
          "</div>" +
          '<div class="ip-panels">' + panels + "</div>" +
          '<div class="ip-caption"><span>' + P.esc(ip02PanelsNote()) + "</span></div>"
        : "") +
      '<div class="ip-mtab-head"><span>Manager</span><span>Type</span>' +
      '<span class="ip-r">Shares</span><span class="ip-r">% of register</span>' +
      '<span class="ip-r">\u0394 qoq</span></div>' +
      rows +
      '<div class="ip-caption"><span>' + P.esc(ip02HoldersNote(data.length)) + "</span></div>" +
      "</div>"
    );
  }

  function ip02PanelsNote() {
    return (
      "Each panel is rebuilt from that manager\u2019s own 13F-HR filings as they were filed, over " +
      "the quarters we have ingested. Panels are scaled independently, so read the trajectory and " +
      "the printed figures, not the relative heights. A manager reporting a single quarter has no " +
      "line \u2014 one point is not a trend."
    );
  }

  function ip02HoldersNote(n) {
    return (
      "The " + n + " largest of the filers we have ingested this quarter, named as they appear on " +
      "the cover of the 13F-HR; affiliated entities file separately and are not consolidated. " +
      "\u201c% of register\u201d is a share of those filers\u2019 reported shares \u2014 NOT a share of the " +
      "company, which would need shares outstanding the register does not carry. \u0394 is DERIVED by " +
      "diffing two quarter-end snapshots, not a reported trade. Type is the filer\u2019s own " +
      "declaration on its Schedule 13D/G cover page, matched by name; it is blank for a manager " +
      "that has not filed one, which only happens above 5% \u2014 blank means no filing, not no type."
    );
  }

  /* ---------- §02's three chart builders, ported from the prototype's own SVG ----------
   * Same approach as §01's dumbbell: hand-authored SVG on a fixed viewBox, geometry in viewBox
   * units, never measuring the container. All constants are the prototype's. */

  // Mini area chart with a five-tick value axis. `preserveAspectRatio="none"` is the prototype's:
  // it lets the chart stretch to the card without reserving a fixed aspect.
  function ipAreaChart(spec, labels, W, H) {
    W = W || 306; H = H || 120;
    // Read off the prototype at both of the widths it renders: card 306x120, modal 1316x260.
    var X0 = 52, X1 = W - 14, YB = H - 34, YT = 14;
    var step = (X1 - X0) / (spec.values.length - 1);
    /* `axisMin` defaults to 0 but §06's amendment rate runs 2.9-11.6: its bottom gridline is not
     * zero. Storing the series pre-offset would reproduce the picture and hand phase 2 a set of
     * numbers that are not the quantity they claim to be. */
    var lo = spec.axisMin || 0;
    var y = function (v) { return YB - ((v - lo) / (spec.axisMax - lo)) * (YB - YT); };
    var ticks = spec.ticks.map(function (label, i) {
      var ty = YB - (i * (YB - YT)) / 4;
      return "<g>" +
        '<line x1="' + X0 + '" y1="' + ty + '" x2="' + X1 + '" y2="' + ty + '" stroke="var(--rule)" stroke-width="1"></line>' +
        '<text x="44" y="' + ty + '" text-anchor="end" dominant-baseline="middle" class="ip-ax">' +
        P.esc(label) + "</text></g>";
    });
    var pts = spec.values.map(function (v, i) {
      return (i ? "L" : "M") + (X0 + i * step).toFixed(1) + " " + y(v).toFixed(1);
    }).join(" ");
    var last = spec.values[spec.values.length - 1];
    return (
      '<div class="ip-chart"><svg width="100%" viewBox="0 0 ' + W + " " + H + '" ' +
      'preserveAspectRatio="none" style="display:block" role="img" aria-label="' +
      P.esc(labels[0]) + " to " + P.esc(labels[labels.length - 1]) + '">' +
      ticks.join("") +
      '<path d="' + pts + " L" + X1 + " " + YB + " L" + X0 + " " + YB +
      ' Z" fill="var(--accent-wash)" opacity="0.5"></path>' +
      '<path d="' + pts + '" fill="none" stroke="' + spec.color + '" stroke-width="1.8" stroke-linejoin="round"></path>' +
      '<circle cx="' + X1 + '" cy="' + y(last).toFixed(3) + '" r="3" fill="' + spec.color + '"></circle>' +
      labels.map(function (l, i) {
        return '<text x="' + (X0 + i * step) + '" y="' + (H - 12) + '" text-anchor="middle" class="ip-ax-x">' + P.esc(l) + "</text>";
      }).join("") +
      "</svg></div>"
    );
  }

  // Nine-quarter 100% stacked area. Bands are separated by a hairline in the CARD's colour rather
  // than a stroke of their own, which is what keeps the boundaries readable at 0.52 opacity.
  function ipStackedArea(bands, labels) {
    var X0 = 42, X1 = 296, YB = 164, YT = 10, W = 306, H = 190;
    var n = bands[0].share.length;
    var step = (X1 - X0) / (n - 1);
    var span = YB - YT;
    var ticks = [0, 25, 50, 75, 100].map(function (p) {
      var ty = YB - (p / 100) * span;
      return '<line x1="' + X0 + '" y1="' + ty + '" x2="' + X1 + '" y2="' + ty + '" stroke="var(--rule)" stroke-width="1"></line>' +
        '<text x="35" y="' + ty + '" text-anchor="end" dominant-baseline="middle" class="ip-ax2">' + p + "%</text>";
    });
    var floor = [];
    for (var i = 0; i < n; i++) floor.push(YB);
    var paths = bands.map(function (b) {
      var top = b.share.map(function (s, i) { return floor[i] - s * span; });
      var d = top.map(function (yv, i) {
        return (i ? "L" : "M") + (X0 + i * step).toFixed(1) + " " + yv.toFixed(1);
      }).join(" ");
      for (var j = n - 1; j >= 0; j--) d += " L" + (X0 + j * step).toFixed(1) + " " + floor[j].toFixed(1);
      d += " Z";
      floor = top;
      return '<path d="' + d + '" fill="' + b.color +
        '" opacity="0.52" stroke="var(--bg-card)" stroke-width="0.8"></path>';
    });
    /* One label per point, and the BUILDER decides which to draw.
     *
     * The prototype passed a pre-thinned list (5 labels for 9 quarters) and this placed them at
     * `i * 2 * step` to compensate. That only works when the caller thinned by exactly half:
     * with 4 real quarters and 4 labels, labels 2 and 3 landed at x=381 and x=550 in a 306-unit
     * viewBox and were silently clipped. Real data has whatever quarter count it has, so the
     * spacing rule cannot live at the call site. */
    var everyOther = n > 6;
    var xl = labels
      .map(function (l, i) {
        if (everyOther && i % 2 !== 0) return "";
        /* Edge anchoring, not width arithmetic (RECONCILIATION §6 rule 1): a centred label at
         * either end crosses the canvas edge and is clipped by the viewBox. The first pins
         * `start`, the last pins `end`, everything between stays centred. */
        var anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
        return '<text x="' + (X0 + i * step).toFixed(1) + '" y="182" text-anchor="' + anchor +
          '" class="ip-ax2">' + P.esc(l) + "</text>";
      })
      .join("");
    return (
      '<div class="ip-chart"><svg width="100%" viewBox="0 0 ' + W + " " + H + '" ' +
      'preserveAspectRatio="xMidYMid meet" style="display:block;max-width:100%" role="img" ' +
      'aria-label="Share of the register by registered institution type, ' + n + ' quarters">' +
      ticks.join("") + paths.join("") + xl + "</svg></div>"
    );
  }

  // Sparkline: the series is normalised to its own range, so it shows shape, never level.

  function ipSparkline(series, color) {
    var X0 = 4, X1 = 209, YB = 46, YT = 10, W = 213, H = 52;
    var step = (X1 - X0) / (series.length - 1);
    var d = series.map(function (s, i) {
      return (i ? "L" : "M") + (X0 + i * step).toFixed(1) + " " + (YB - s * (YB - YT)).toFixed(1);
    }).join(" ");
    var lastY = (YB - series[series.length - 1] * (YB - YT)).toFixed(1);
    return (
      '<svg width="100%" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" ' +
      'style="display:block" role="img" aria-label="Nine-quarter shape, level not shown">' +
      '<path d="' + d + " L" + X1 + " " + H + " L" + X0 + " " + H + ' Z" fill="' + color + '" opacity="0.13"></path>' +
      '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.7"></path>' +
      '<circle cx="' + X1 + '" cy="' + lastY + '" r="2.8" fill="' + color + '"></circle>' +
      "</svg>"
    );
  }

  /* ============================ §03 · Flows & concentration ==============================
   * PHASE 2. `IP03` is gone entirely -- unlike §01, not one value here was a filing RULE; every
   * one was a figure, so every one had to come from a filing. Eight blocks over six endpoints:
   *
   *   diverging flows + count tiles   /institutional-activity-series   (DERIVED, 13F diff)
   *   ranked share + cumulative       register.share_vector + the prior quarter's register
   *   HHI / effective / Lorenz        register.concentration           (`lorenz` is new)
   *   manager domicile                /institutional-holder-domicile   (D-domicile)
   *   peer overlap + set intersections /institutional-peer-overlap     (D-overlap)
   *   where every share sits          /institutional-share-attribution (D-attribution)
   *   stable capital + cohorts        register-shape.stable_capital + .tenure
   *
   * The three operator rulings this section carries, all of which change what may be RENDERED:
   *   D-attribution -- three reported rows, no residual, NO TOTAL. The rows are not disjoint
   *     (a 5%+ institutional holder files a 13F *and* a 13D/G), so they are drawn as independent
   *     bars against shares outstanding, never stacked and never summed.
   *   D-domicile   -- US filers rank by state, everyone else by country. `prior_weight: null`
   *     means the place was not there last quarter; it draws NO tick, because a tick at the axis
   *     reads as "it collapsed" rather than "it is new".
   *   D-overlap    -- the matrix is asymmetric by construction and the caption says so.
   * ==================================================================================== */

  function ipSection03() {
    if (IP_DATA.status === "idle" || ipPending(IP_DATA.register)) {
      return P.states.loading({ title: "Loading the register's flows and concentration" });
    }
    if (IP_DATA.status === "error" || ipErr(IP_DATA.register)) {
      var e = IP_DATA.error || (IP_DATA.register || {})._err || {};
      return P.states.error({
        copy: "Couldn't load this quarter's register (" + (e.status || "network") + ")." +
          (e.detail ? " " + e.detail : ""),
      });
    }
    return (
      ip03Flows() +
      ip03WhoHolds() +
      '<div class="ip-grid2 ip-grid2--tight">' + ip03Concentration() + "</div>" +
      ipExpander(
        "Also in this section",
        "manager domicile · peer overlap · where every share sits · stable-capital share",
        '<div class="ip-grid2">' + ip03Domicile() + ip03Overlap() + "</div>" +
          '<div class="ip-grid2 ip-grid2--tight">' + ip03Attribution() + ip03Stable() + "</div>"
      )
    );
  }

  // A holder's short label for a chart axis. Real filer names run far longer than the
  // prototype's "Idx A", and an axis is the one place there is no room to wrap.
  function ipShortManager(name, max) {
    if (!name) return IP_NA;
    var s = String(name).replace(/\s+/g, " ").trim();
    return s.length <= (max || 14) ? s : s.slice(0, (max || 14) - 1).trim() + "…";
  }

  /* ---------- the diverging flow chart + the four count tiles ---------- */

  /* One transition per quarter from the activity series. `inflow`/`outflow` are the API's own
   * aggregates, so the bars and the printed table can never disagree. NOTE the series omits any
   * quarter whose PRIOR quarter is not ingested (diffing against nothing would label every
   * holder "new"), so a short axis is a coverage statement, not a quiet period. */
  function ip03FlowSpec() {
    var f = IP_DATA.flows;
    if (ipPending(f) || ipErr(f) || !f.transitions || !f.transitions.length) return null;
    var t = f.transitions.slice(-IP_FLOW_QUARTERS);
    var add = t.map(function (x) { return x.inflow_shares || 0; });
    var red = t.map(function (x) { return x.outflow_shares || 0; });
    var ax = ipNiceAxis(Math.max.apply(null, add.concat(red)), function (v) {
      return "+" + ipShares(v);
    });
    // The axis is mirrored around zero: +max at the top, −max at the bottom.
    var ticks = [
      "+" + ipShares(ax.axisMax),
      "+" + ipShares(ax.axisMax / 2),
      "0",
      "−" + ipShares(ax.axisMax / 2),
      "−" + ipShares(ax.axisMax),
    ];
    return {
      transitions: t,
      labels: t.map(function (x) { return ipQuarter(x.to_period); }),
      spec: { add: add, red: red, ticks: ticks, axisMax: ax.axisMax },
    };
  }

  function ip03Flows() {
    var f = ip03FlowSpec();
    var head =
      '<div class="ip-card">' +
      '<div class="ip-card-head">' +
      '<h3 class="ip-card-title">Position changes over time</h3>' +
      '<span class="ip-card-note">shares added above the axis, reduced below · rule marks the net</span>' +
      (f ? ipChip("03-flows") : "") +
      ipLink("13F filings ↗", ipEdgarFts("13F-HR")) +
      "</div>";
    if (ipPending(IP_DATA.flows)) return head + ip03Loading() + "</div>";
    if (!f) {
      return head + ip03Empty(
        "Deriving a quarter's flows needs BOTH that quarter and the one before it ingested — a " +
        "diff against a quarter we do not hold would label every manager as new. No adjacent " +
        "pair has been ingested for this issuer yet."
      ) + "</div>";
    }
    var rows = f.transitions
      .map(function (t) {
        var net = (t.net_shares === null || t.net_shares === undefined)
          ? IP_NA
          : ipSignedShares(t.net_shares);
        return (
          '<div class="ip-flowtab-row">' +
          '<span class="ip-flowtab-q">' + P.esc(ipQuarter(t.to_period)) + "</span>" +
          '<span class="ip-flowtab-v">+' + P.esc(ipShares(t.inflow_shares)) + "</span>" +
          '<span class="ip-flowtab-v">−' + P.esc(ipShares(t.outflow_shares)) + "</span>" +
          '<span class="ip-flowtab-v ip-flowtab-v--net">' + P.esc(net) + "</span>" +
          "</div>"
        );
      })
      .join("");
    var latest = f.transitions[f.transitions.length - 1];
    var counts = latest.counts || {};
    var byAction = ip03SharesByAction();
    var tiles = [
      ["New positions", "new"],
      ["Added to", "added"],
      ["Reduced", "reduced"],
      ["Exited", "exited"],
    ]
      .map(function (t) {
        var n = counts[t[1]];
        // A known count of 0 means there were no such managers, so the shares they moved are a
        // measured ZERO -- not unknown. The N/A is reserved for a quarter whose per-manager
        // deltas we could not load at all.
        var shares = byAction[t[1]];
        if (shares === null && n === 0) shares = 0;
        return (
          '<div class="ip-ftile">' +
          '<span class="ip-micro">' + P.esc(t[0]) + "</span>" +
          '<span class="ip-ftile-val">' + P.esc(ipCount(n)) + "</span>" +
          '<span class="ip-ftile-note"><span>' +
          P.esc(shares === null ? IP_NA : ipShares(shares)) + "</span> of shares</span>" +
          "</div>"
        );
      })
      .join("");
    return (
      head +
      ipDivergingBars(f.spec, f.labels) +
      '<div class="ip-flowtab-head"><span>Quarter</span><span class="ip-r">Added</span>' +
      '<span class="ip-r">Reduced</span><span class="ip-r">Net</span></div>' +
      rows +
      '<div class="ip-caption">Gross adds and reductions are aggregated across every reporting ' +
      "manager. A quarter with large gross flows and a small net is a change of hands, not a " +
      "change of ownership level. Both sides are DERIVED by diffing consecutive quarter-end " +
      "snapshots — nobody files a trade here.</div>" +
      '<div class="ip-micro ip-micro--block">This quarter by manager count · ' +
      P.esc(ipQuarter(latest.to_period)) + " vs " + P.esc(ipQuarter(latest.from_period)) +
      "</div>" +
      '<div class="ip-ftiles">' + tiles + "</div>" +
      '<div class="ip-caption">Counts are managers; share figures are the aggregate change in ' +
      "reported shares. Direction is described, not scored. An “exit” means the manager left the " +
      "ingested register, which also happens when it drops under the $100M threshold — it is not " +
      "evidence of a sale.</div>" +
      "</div>"
    );
  }

  /* Shares per action for the four tiles. The activity endpoint returns one row per manager with
   * its own `action` and `shares_change`; grouping them is reading the response, not re-deriving
   * it (the API owns both the classification and the delta). A quarter we cannot load gives four
   * nulls, never four zeros. */
  function ip03SharesByAction() {
    var out = { new: null, added: null, reduced: null, exited: null };
    var a = IP_DATA.activity;
    if (ipErr(a) || !a.activity) return out;
    a.activity.forEach(function (d) {
      if (!(d.action in out)) return;
      var v = d.shares_change;
      if (v === null || v === undefined) return;
      out[d.action] = (out[d.action] || 0) + Math.abs(v);
    });
    return out;
  }

  /* ---------- ranked share + the cumulative curve ---------- */

  /* The ten largest managers, their own share, and the running total -- all straight off the
   * register's `share_vector`, which is the SAME vector the concentration tiles are computed
   * from (STYLE_GUIDE rule 12: one fact, one source).
   *
   * The dotted line is the same ten managers in the PRIOR quarter, so it is a genuine second
   * series rather than a transform of the first. A manager absent from that quarter contributes
   * nothing to it -- and if the prior register is not ingested at all there is no dotted line,
   * rather than a flat one at zero. */
  function ip03RankedSpec() {
    var reg = IP_DATA.register;
    if (ipErr(reg) || !reg.share_vector || reg.share_vector.length < 2) return null;
    var rows = reg.share_vector.slice(0, IP_RANKED_ROWS);
    var priorReg = IP_DATA.registers[ip03PriorPeriod()];
    var priorWeights = {};
    if (priorReg && priorReg.share_vector) {
      priorReg.share_vector.forEach(function (r) { priorWeights[r.manager_cik] = r.weight; });
    }
    var havePrior = rows.some(function (r) { return priorWeights[r.manager_cik] !== undefined; });
    var prior = null;
    if (havePrior) {
      var run = 0;
      prior = rows.map(function (r) {
        run += (priorWeights[r.manager_cik] || 0) * 100;
        return run;
      });
    }
    return {
      rows: rows.map(function (r) {
        return {
          label: ipShortManager(r.manager_name, 14),
          full: r.manager_name || String(r.manager_cik),
          pct: ipPct(r.weight),
          share: (r.weight || 0) * 100,
          // Categorical identity only, never a favourability scale -- the same registration
          // categories §02's mix uses, so one colour means one thing across the section.
          color: IP_CAT_COLORS[r.registrant_category] || IP_CAT_COLORS.other,
        };
      }),
      prior: prior,
      priorPeriod: ip03PriorPeriod(),
      total: reg.share_vector_total_rows,
      shown: rows.length,
      legend: prior
        ? "─ cumulative share of the register     ··· same managers, prior quarter"
        : "─ cumulative share of the register     (no prior ingested quarter to compare)",
      ticks: ["0%", "25%", "50%", "75%", "100%"],
    };
  }

  // The quarter before the one being described, if we have ingested it.
  function ip03PriorPeriod() {
    var i = IP_DATA.periods.indexOf(IP_DATA.period);
    return i >= 0 ? IP_DATA.periods[i + 1] : undefined;
  }

  function ip03WhoHolds() {
    var s = ip03RankedSpec();
    var head =
      '<div class="ip-card">' +
      '<div class="ip-card-head">' +
      '<h3 class="ip-card-title">Who holds what</h3>' +
      '<span class="ip-card-note">ranked manager share of the 13F-reported register · ' +
      P.esc(ipQuarter(IP_DATA.period)) + "</span>" +
      (s
        ? '<div class="ip-toggles" data-ip-group="03-ranked">' +
          '<button type="button" class="ip-toggle ip-toggle--on" data-ip-view="cumulative" aria-pressed="true">Cumulative share</button>' +
          '<button type="button" class="ip-toggle" data-ip-view="treemap" aria-pressed="false">Treemap</button>' +
          "</div>" + ipChip("03-ranked")
        : "") +
      ipLink("13F table ↗", ipEdgarFts("13F-HR")) +
      "</div>";
    if (!s) {
      return head + ip03Empty(
        "Fewer than two filers report a share count for this quarter, so there is no ranking to " +
        "draw. That is a statement about what we have ingested, not about who holds the company."
      ) + "</div>";
    }
    return (
      head +
      '<div data-ip-chart="03-ranked">' + ipRankedShare(s) + "</div>" +
      '<div class="ip-caption" data-ip-note="03-ranked">' + P.esc(ip03RankedNote(s)) + "</div>" +
      "</div>"
    );
  }

  function ip03RankedNote(s) {
    var rest = s.total > s.shown
      ? "Everything past the " + s.shown + " shown is the remaining " +
        ipPct(1 - ip03ShownShare(s)) + " across " + (s.total - s.shown) + " more filers."
      : "These are every filer we have ingested for the quarter.";
    return (
      "Bars are each manager's share of the 13F-reported register; the solid line is the running " +
      "total" +
      (s.prior ? ", the dotted line the same managers one quarter earlier. " : ". ") +
      rest +
      " Bar colour is the filer's own SIC registration category — what kind of institution it " +
      "is, never how it invests."
    );
  }

  function ip03ShownShare(s) {
    return s.rows.reduce(function (t, r) { return t + r.share / 100; }, 0);
  }

  /* ---------- concentration: the effective-holders stat, its trend, and the Lorenz curve ---------- */

  function ip03Concentration() {
    var conc = (IP_DATA.register || {}).concentration;
    var chip = ipChipFor(conc);
    var effective = ipOk(conc, "effective_holders")
      ? String(Math.round(conc.effective_holders))
      : IP_NA;
    var of = ipOk(conc, "holder_count") ? ipCount(conc.holder_count) : IP_NA;
    var lorenz = ipOk(conc, "lorenz") ? conc.lorenz : null;
    /* The stat is only a CONTROL when there is a trend behind it. With one ingested quarter
     * there is no series, and a clickable stat that opens nothing is an inert affordance --
     * D-behaviour treats that as a defect, not a nicety. So the live attributes and the panel
     * appear together or not at all. */
    var live = !!ipTrendSpec("effective");
    return (
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">How concentrated the register is</h3>' +
      '<span class="ip-card-note">HHI · effective holders · Lorenz</span>' +
      "</div>" +
      '<div class="ip-stat-row ip-stat-row--baseline">' +
      '<div class="ip-stat' + (live ? " ip-stat--live" : "") + '"' +
      (live ? ' role="button" tabindex="0" data-ip-trend="effective" aria-expanded="false"' : "") +
      ">" +
      '<span class="ip-micro">Effective holders</span>' +
      '<span class="ip-stat-val"><span>' + P.esc(effective) + "</span>" +
      (chip ? ipStatusChip(chip) : "") + "</span>" +
      '<span class="ip-stat-note">of <span>' + P.esc(of) + "</span> reporting" +
      (live ? " · click for the trend and the constituents" : "") + "</span>" +
      "</div>" +
      "</div>" +
      (live ? ipTrendPanel("effective") : "") +
      (lorenz
        ? ipLorenz(lorenz.map(function (v) { return v * 100; }))
        : ip03Empty(ipWhy(conc, "a Lorenz curve needs at least two filers reporting a share count"))) +
      '<div class="ip-caption ip-caption--tight"><span>' +
      P.esc(
        "HHI is computed on each manager's share of 13F-reported holdings; the effective number " +
        "of holders is 10,000 ÷ HHI. The curve is the same distribution: the further it bows " +
        "below the diagonal, the more concentrated the register. Affiliated entities that file " +
        "separately count separately, which raises the effective number."
      ) + "</span></div>" +
      "</div>"
    );
  }

  /* ---------- manager domicile (D-domicile) ---------- */

  function ip03Domicile() {
    var pending = ipPending(IP_DATA.domicile);
    var d = pending ? null : (IP_DATA.domicile || {}).domicile;
    var head =
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head">' +
      '<h3 class="ip-card-title">Manager domicile</h3>' +
      '<span class="ip-card-note">13F-HR cover page address</span>' +
      (d && d.status !== "ok" ? ipStatusChip("na") : "") +
      "</div>";
    if (pending) return head + ip03Loading() + "</div>";
    if (ipErr(IP_DATA.domicile) || !d || d.status !== "ok" || !d.rows.length) {
      return head + ip03Empty(ipWhy(
        ipErr(IP_DATA.domicile) ? IP_DATA.domicile : d,
        "no 13F cover-page location has been read for this issuer's filers yet"
      )) + "</div>";
    }
    var rows = d.rows
      .map(function (r) {
        var pct = ipPct(r.weight);
        return (
          '<div class="ip-dom-row">' +
          '<span class="ip-dom-label"><span title="' + P.esc(r.place) + '">' +
          P.esc(r.place) + "</span></span>" +
          '<span class="ip-track"><span class="ip-track-fill" style="width:' + P.esc(pct) + '"></span>' +
          // No prior quarter for this place means NO tick. A tick at 0% would sit on the axis
          // and read as "it collapsed", which is the opposite of "it is new".
          (r.prior_weight === null || r.prior_weight === undefined
            ? ""
            : '<span class="ip-track-tick" style="left:' + P.esc(ipPct(r.prior_weight)) + '"></span>') +
          "</span>" +
          '<span class="ip-dom-val"><span>' + P.esc(ipShares(r.shares)) + "</span></span>" +
          '<span class="ip-dom-pct"><span>' + P.esc(pct) + "</span></span>" +
          "</div>"
        );
      })
      .join("");
    var coverage = d.coverage === null || d.coverage === undefined
      ? ""
      : " Covers " + ipPct(d.coverage) + " of the register by shares" +
        (d.unlocated_holder_count
          ? "; " + d.unlocated_holder_count + " filer(s) have no location on file and are left " +
            "out rather than grouped into a rest-of-world row."
          : ".");
    return (
      head + rows +
      '<div class="ip-caption"><span>' +
      P.esc(
        "Domicile is the business address on the 13F-HR cover page — where the manager files " +
        "from, not where the capital originates. US filers rank by state, everyone else by " +
        "country."
      ) + "</span>" +
      P.esc(
        (d.rows.some(function (r) { return r.prior_weight !== null && r.prior_weight !== undefined; })
          ? " The tick on each bar is the same place one quarter earlier; a place with no tick was not there."
          : " No prior ingested quarter, so there are no ticks.") + coverage
      ) + "</div>" +
      "</div>"
    );
  }

  /* ---------- peer overlap (D-overlap) ---------- */

  function ip03OverlapSpec() {
    var o = (IP_DATA.overlap || {}).overlap;
    if (ipPending(IP_DATA.overlap) || ipErr(IP_DATA.overlap) || !o || o.status !== "ok" ||
        !o.matrix.length) {
      return null;
    }
    return {
      block: o,
      labels: o.issuers.map(function (i) {
        return { label: ipShortManager(i.label, 12), full: i.name || i.label };
      }),
      // fill-opacity IS the value: a cell twice as dark is twice the overlap. The prototype's
      // opacities were not a linear function of its printed percentage; on real data there is no
      // reason for them not to be.
      cells: o.matrix.map(function (row) {
        return row.map(function (v) {
          return v === null || v === undefined ? null : [Math.round(v * 100), v];
        });
      }),
    };
  }

  function ip03Overlap() {
    var s = ip03OverlapSpec();
    var head =
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--split">' +
      '<div class="ip-head-group">' +
      '<h3 class="ip-card-title">Overlap with sector peers</h3>' +
      '<span class="ip-card-note">managers reporting both issuers</span>' +
      "</div>" +
      (s
        ? '<div class="ip-toggles" data-ip-group="03-overlap">' +
          '<button type="button" class="ip-toggle ip-toggle--on" data-ip-view="matrix" aria-pressed="true">Peer matrix</button>' +
          '<button type="button" class="ip-toggle" data-ip-view="sets" aria-pressed="false">Set intersections</button>' +
          ipChip("03-matrix") +
          "</div>"
        : '<div class="ip-toggles">' + ipStatusChip("na") + "</div>") +
      "</div>";
    if (ipPending(IP_DATA.overlap)) return head + ip03Loading() + "</div>";
    if (!s) {
      return head + ip03Empty(ipWhy(
        ipErr(IP_DATA.overlap) ? IP_DATA.overlap : (IP_DATA.overlap || {}).overlap,
        "no peer issuer in this company's SIC group has an ingested 13F register for this quarter"
      )) + "</div>";
    }
    var o = s.block;
    var rows = o.holders
      .map(function (h) {
        return (
          '<div class="ip-peer-row">' +
          '<span class="ip-peer-name"><span title="' + P.esc(h.manager_name || "") + '">' +
          P.esc(ipShortManager(h.manager_name, 26)) + "</span></span>" +
          '<span class="ip-peer-peers"><span>' + h.peers_held + " of " + h.peer_count +
          " peers</span></span>" +
          '<span class="ip-peer-pct"><span>' +
          P.esc(h.weight === null || h.weight === undefined ? IP_NA : ipPct(h.weight, 2)) +
          "</span></span>" +
          "</div>"
        );
      })
      .join("");
    return (
      head +
      '<div data-ip-chart="03-overlap">' + ipPeerMatrix(s.labels, s.cells) + "</div>" +
      '<div class="ip-caption" data-ip-note="03-overlap">' + P.esc(ip03MatrixNote()) + "</div>" +
      '<div class="ip-micro ip-micro--peers">Largest holders, and how many peers they also hold</div>' +
      rows +
      '<div class="ip-caption"><span>' +
      P.esc(
        "Overlap counts managers whose 13F-HR reports both issuers in the same quarter — a fact " +
        "both filings state. A high overlap usually reflects index construction rather than a " +
        "view on either company. " + (o.peer_basis ? "Peers: " + o.peer_basis + "." : "")
      ) + "</span></div>" +
      "</div>"
    );
  }

  function ip03MatrixNote() {
    return (
      "Cell is the share of the ROW issuer's reporting managers that also report the column " +
      "issuer, so the matrix is deliberately asymmetric — a smaller register overlapping a " +
      "larger one reads high in one direction and low in the other. Both sides count only the " +
      "filers we have ingested."
    );
  }

  /* ---------- where every share sits (D-attribution) ---------- */

  /* ⚠ THE RULING IS STRUCTURAL, NOT COSMETIC. Three reported rows, and:
   *   - no total and no 100% framing. The rows are NOT disjoint -- a holder above 5% files a 13F
   *     AND a 13D/G, and a 10% owner is also an insider -- so summing them double-counts real
   *     holders. Each bar is drawn against shares outstanding independently.
   *   - no "unreported residual" row. It was the only row that was a SUBTRACTION rather than a
   *     measurement, and a remainder of differently-dated numbers is a figure nobody filed.
   *   - each row prints its OWN as-of date, because they do not line up. */
  function ip03Attribution() {
    var pendingAttr = ipPending(IP_DATA.attribution);
    var a = pendingAttr ? null : (IP_DATA.attribution || {}).attribution;
    var head =
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Where every share sits</h3>' +
      '<span class="ip-card-note">reported holdings vs shares outstanding</span>' +
      (a && a.status !== "ok" ? ipStatusChip("na") : "") +
      "</div>";
    if (pendingAttr) return head + ip03Loading() + "</div>";
    if (ipErr(IP_DATA.attribution) || !a || a.status !== "ok") {
      return head + ip03Empty(ipWhy(
        ipErr(IP_DATA.attribution) ? IP_DATA.attribution : a,
        "no ownership filing we have ingested reports a share count for this issuer"
      )) + "</div>";
    }
    var rows = a.rows
      .map(function (r) {
        var known = r.shares !== null && r.shares !== undefined;
        var pct = r.share_of_outstanding === null || r.share_of_outstanding === undefined
          ? null
          : ipPct(r.share_of_outstanding);
        return (
          '<div class="ip-attr">' +
          '<div class="ip-attr-head">' +
          '<span class="ip-attr-label"><span>' + P.esc(r.label) + "</span></span>" +
          '<span class="ip-attr-val"><span>' +
          P.esc(known ? ipShares(r.shares) : IP_NA) + "</span> · <span>" +
          P.esc(pct || IP_NA) + "</span>" + (known && pct ? "" : ipStatusChip("na")) +
          "</span>" +
          "</div>" +
          // No bar at all when there is no percentage. A zero-width fill inside a visible track
          // reads as a measured zero.
          (pct
            ? '<div class="ip-attr-bar"><div class="ip-attr-fill" style="width:' + P.esc(pct) + '"></div></div>'
            : "") +
          '<div class="ip-attr-src"><span>' + P.esc(r.source) +
          (r.as_of ? " · as of " + r.as_of : "") + "</span></div>" +
          (r.reason ? '<div class="ip-attr-why"><span>' + P.esc(r.reason) + "</span></div>" : "") +
          "</div>"
        );
      })
      .join("");
    var denom = a.shares_outstanding
      ? ipShares(a.shares_outstanding) + " shares outstanding" +
        (a.shares_outstanding_as_of ? " as of " + a.shares_outstanding_as_of : "")
      : "no shares-outstanding figure ingested, so the percentages cannot be computed";
    return (
      head + rows +
      '<div class="ip-attr-foot">' +
      '<span class="ip-attr-foot-label">Denominator</span>' +
      '<span class="ip-attr-foot-val"><span>' + P.esc(denom) + "</span></span>" +
      "</div>" +
      '<div class="ip-caption ip-caption--tight"><span>' +
      P.esc(
        "These bars do not add up and are not meant to: a holder above 5% files a 13F and a " +
        "Schedule 13D/G, and a 10% owner is also an insider, so the same shares appear in more " +
        "than one row. Each is measured on its own date. What no filing accounts for is " +
        "deliberately not shown — it would be a remainder of differently-dated numbers, not a " +
        "measurement."
      ) + "</span></div>" +
      "</div>"
    );
  }

  /* ---------- stable-capital share ---------- */

  function ip03Stable() {
    var shape = IP_DATA.shape;
    var pendingShape = ipPending(shape);
    var stable = pendingShape || ipErr(shape) ? null : shape.stable_capital;
    var tenure = pendingShape || ipErr(shape) ? null : shape.tenure;
    var chip = ipChipFor(stable);
    var cohorts = tenure && tenure.status === "ok" ? tenure.cohorts || [] : [];
    // The weight each cohort carries, from the API's own weights list -- shown so the weighting
    // can be argued with rather than taken on trust.
    var weights = {};
    ((stable && stable.weights) || []).forEach(function (w) { weights[w[0]] = w[1]; });
    var weightFor = function (minQ) {
      var best = 0;
      Object.keys(weights).forEach(function (k) {
        if (minQ >= +k) best = Math.max(best, weights[k]);
      });
      return best.toFixed(2);
    };
    /* ⚠ A cohort whose minimum exceeds the quarters we have INGESTED is UNREACHABLE, not empty.
     * With four ingested quarters nobody can appear in "8+ quarters" however long they have
     * actually held, so printing 0% there would report a limit of our coverage as a finding
     * about the register -- the exact thing the N/A vocabulary exists to prevent. */
    var observed = tenure && tenure.quarters_observed ? tenure.quarters_observed : 0;
    var rows = cohorts
      .map(function (c) {
        var unreachable = c.min_quarters > observed;
        var pct = unreachable || c.share_of_register === null || c.share_of_register === undefined
          ? null
          : ipPct(c.share_of_register, 0);
        return (
          '<div class="ip-coh-row">' +
          '<span class="ip-coh-label"><span>' + P.esc(c.label) + "</span></span>" +
          '<span class="ip-coh-bar">' +
          (pct ? '<span class="ip-coh-fill" style="width:' + P.esc(pct) + '"></span>' : "") +
          "</span>" +
          '<span class="ip-coh-share"><span>' + P.esc(pct || IP_NA) + "</span>" +
          (pct ? "" : ipStatusChip("na")) + "</span>" +
          '<span class="ip-coh-weight"><span>' + P.esc(weightFor(c.min_quarters)) + "</span></span>" +
          "</div>"
        );
      })
      .join("");
    var unreachableCount = cohorts.filter(function (c) { return c.min_quarters > observed; }).length;
    var first = cohorts.filter(function (c) {
      return c.min_quarters === 1 && observed >= 1;
    })[0];
    var head =
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Stable-capital share</h3>' +
      '<span class="ip-card-note">register weighted by holding tenure</span>' +
      "</div>";
    if (pendingShape) return head + ip03Loading() + "</div>";
    if (!rows) {
      return head + ip03Empty(ipWhy(
        ipErr(shape) ? shape : tenure,
        "tenure needs more than one ingested quarter to measure"
      )) + "</div>";
    }
    return (
      head +
      '<div class="ip-stat-row">' +
      '<div class="ip-stat">' +
      '<span class="ip-micro">Tenure-weighted stable</span>' +
      '<span class="ip-stat-val ip-stat-val--sm"><span>' +
      P.esc(ipOk(stable, "stable_share") ? ipPct(stable.stable_share, 0) : IP_NA) + "</span>" +
      (chip ? ipStatusChip(chip) : "") + "</span>" +
      "</div>" +
      '<div class="ip-stat">' +
      '<span class="ip-micro">First-quarter holders</span>' +
      '<span class="ip-stat-val ip-stat-val--sm ip-stat-val--plain"><span>' +
      P.esc(first && first.share_of_register !== null && first.share_of_register !== undefined
        ? ipPct(first.share_of_register, 0)
        : IP_NA) + "</span></span>" +
      "</div>" +
      "</div>" +
      '<div class="ip-coh-head"><span>Cohort</span><span></span>' +
      '<span class="ip-r">Share</span><span class="ip-r">Weight</span></div>' +
      rows +
      '<div class="ip-caption ip-caption--tight"><span>' +
      P.esc(
        "Stable-capital share weights each cohort by tenure; the weights are ours and shown so " +
        "they can be argued with. Tenure is measured over the quarters we have INGESTED, so it " +
        "is a floor, not a history — a manager holding for twenty quarters reads as the number " +
        "we hold." +
        (unreachableCount
          ? " " + unreachableCount + " cohort(s) reach further back than the " + observed +
            " quarter(s) we have ingested, so they read N/A rather than 0% — nobody could be " +
            "counted in them either way."
          : "") +
        (stable && stable.reason ? " " + stable.reason + "." : "")
      ) + "</span></div>" +
      "</div>"
    );
  }

  /* ---------- the treemap view, now COMPUTED ----------
   *
   * Phase 1 carried the prototype's squarified layout as eleven recovered rectangles, because
   * reimplementing squarify would not have reproduced its capture cell-for-cell. With real data
   * there is nothing to reproduce: the layout has to follow the weights. This is the standard
   * squarify (Bruls, Huizing & van Wijk 2000) -- lay a row along the shorter side, keep adding
   * while the worst aspect ratio improves, then recurse into what is left.
   *
   * ⚠ This CLOSES listed deviation D3. The lightbox no longer scales the card's layout: it
   * re-squarifies at the dialog's own aspect, which is what the prototype did and what phase 1
   * could not do from a literal. */
  function ipSquarify(values, x, y, w, h) {
    var out = [];
    var total = values.reduce(function (t, v) { return t + v.value; }, 0);
    if (!(total > 0)) return out;
    var items = values.slice();
    var scale = (w * h) / total;

    var worst = function (row, side) {
      var sum = row.reduce(function (t, v) { return t + v; }, 0);
      if (!(sum > 0) || !(side > 0)) return Infinity;
      var mx = Math.max.apply(null, row), mn = Math.min.apply(null, row);
      var s2 = sum * sum, side2 = side * side;
      return Math.max((side2 * mx) / s2, s2 / (side2 * mn));
    };

    while (items.length) {
      var side = Math.min(w, h);
      var row = [], areas = [];
      while (items.length) {
        var a = items[0].value * scale;
        if (row.length && worst(areas.concat([a]), side) > worst(areas, side)) break;
        areas.push(a);
        row.push(items.shift());
      }
      var rowArea = areas.reduce(function (t, v) { return t + v; }, 0);
      var thickness = rowArea / side;
      var along = 0;
      row.forEach(function (item, i) {
        var length = areas[i] / thickness;
        if (w >= h) out.push([x, y + along, thickness, length, item]);
        else out.push([x + along, y, length, thickness, item]);
        along += length;
      });
      if (w >= h) { x += thickness; w -= thickness; } else { y += thickness; h -= thickness; }
      if (w <= 0 || h <= 0) break;
    }
    return out;
  }

  /* The treemap's cells, in `ipTreemap`'s own [x, y, w, h, opacity, name, pct] shape.
   *
   * Percentages are of the 13F-REPORTED REGISTER, not of shares outstanding — the prototype's
   * caption claimed the latter, which this view has never had the denominator for. The tail
   * beyond the ten shown is one grouped cell, drawn in the neutral tint like the prototype's
   * "All other reporting managers", so the areas still sum to the whole register. */
  function ip03TreemapSpec(W, H) {
    var vb = [W || 660, H || 343];
    var s = ip03RankedSpec();
    if (!s) return { vb: vb, cells: [] };
    var shown = ip03ShownShare(s);
    var items = s.rows.map(function (r) {
      return { value: r.share / 100, name: r.full, pct: r.pct, other: false };
    });
    var rest = 1 - shown;
    if (rest > 0.0005 && s.total > s.shown) {
      items.push({
        value: rest,
        name: "All other reporting managers",
        pct: ipPct(rest),
        other: true,
      });
    }
    // Largest first is what squarify assumes.
    items.sort(function (a, b) { return b.value - a.value; });
    var maxV = items.reduce(function (m, i) { return Math.max(m, i.value); }, 0);
    return {
      vb: vb,
      cells: ipSquarify(items, 1, 1, vb[0] - 2, vb[1] - 2).map(function (c) {
        var item = c[4];
        return [
          c[0], c[1], c[2], c[3],
          // The grouped tail is the neutral tint (null), like the prototype's. Real cells scale
          // their wash with the share so the picture reads the same way the bars do.
          item.other ? null : Math.max(0.18, Math.min(0.72, (item.value / maxV) * 0.72)),
          ipShortManager(item.name, 26),
          item.pct,
          item.name,
        ];
      }),
    };
  }

  function ip03TreemapNote() {
    return (
      "Area is each manager's share of the 13F-reported register — not of shares outstanding, " +
      "which this view has no denominator for. Managers below the ten largest are grouped into " +
      "one cell; affiliated entities that file separately are not consolidated."
    );
  }

  /* ---------- the set-intersections (UpSet) view ----------
   * Exclusive combinations straight from the overlap endpoint. `ipUpset` draws one bar per
   * combination over a dot matrix of the issuers, so the row order here IS the matrix's issuer
   * order and the membership vector has to follow it exactly. */
  function ip03UpsetSpec() {
    var o = (IP_DATA.overlap || {}).overlap;
    if (ipErr(IP_DATA.overlap) || !o || o.status !== "ok" || !o.combinations.length) return null;
    var peers = o.issuers.map(function (i) { return ipShortManager(i.label, 10); });
    var order = o.issuers.map(function (i) { return i.cik; });
    var total = o.combinations.reduce(function (t, c) { return t + c.manager_count; }, 0);
    var rows = o.combinations.map(function (c) {
      var member = {};
      c.ciks.forEach(function (k) { member[k] = 1; });
      return {
        label: c.labels.join(" + "),
        members: order.map(function (k) { return member[k] ? 1 : 0; }),
        n: c.manager_count,
        share: total ? ipPct(c.manager_count / total, 0) : IP_NA,
      };
    });
    var max = rows.reduce(function (m, r) { return Math.max(m, r.n); }, 0);
    var ax = ipNiceAxis(max, function (v) { return ipCount(Math.round(v)); }, true);
    return {
      peers: peers,
      rows: rows,
      ticks: [ax.ticks[0], ax.ticks[2], ax.ticks[4]],
      note:
        "Each bar is the number of managers whose 13F reports exactly that combination — " +
        "exclusive, not cumulative, so the bars do not double-count." +
        (o.combinations_truncated
          ? " Combinations are capped, so the tail is not shown."
          : " They sum to " + ipCount(total) + " managers across these issuers."),
    };
  }

  /* The issuer list for the UpSet's note. Real registrant names run far longer than the
   * prototype's four-letter tickers, so past a few the list becomes a paragraph -- name the
   * first three and count the rest rather than spilling the note across the dialog. */
  function ip03UpsetIssuers() {
    var o = (IP_DATA.overlap || {}).overlap;
    if (!o || !o.issuers || !o.issuers.length) return "the peer group";
    var names = o.issuers.map(function (i) { return ipShortManager(i.label, 18); });
    if (names.length <= 3) return names.join(", ");
    return names.slice(0, 3).join(", ") + " and " + (names.length - 3) + " more";
  }

  /* A block whose request is still in flight. Deliberately NOT the empty state: "nothing was
   * filed" and "we have not asked yet" are different claims, and on a cold volume the second one
   * is true for up to a minute. */
  function ip03Loading() {
    return '<div class="ip-rr-empty ip-rr-empty--loading"><span class="ex21-dash">⋯</span>' +
      "<p>Reading the filings…</p></div>";
  }

  // §03's honest empty state, in the port's own visual language (the same block §02 uses).
  function ip03Empty(why) {
    return '<div class="ip-rr-empty"><span class="ex21-dash">—</span><p>' + P.esc(why) + "</p></div>";
  }

  /* ============================ §04 · Ownership & stewardship ============================
   * PHASE 2. `IP04` is gone. §04 has the LARGEST unsourced share of any section, and the
   * operator ruled on it 2026-08-01:
   *
   *   lane chart + filings table  beneficial_ownership (13D/G)  -- plumbed, NO new backend
   *   activism head               a form_type count over the same rows
   *   voting (tiles + ballot)     8-K Item 5.07  -- D-voting: EMPTY STATE, and never ingested
   *   vote-weighted ownership     N-PX           -- D-voting: EMPTY STATE, not ingested YET
   *   the Item 4 "purpose" column Track 2 prose  -- D-purpose: replaced by the cover-page type
   *
   * ⚠️ THE TWO EMPTY STATES SAY DIFFERENT THINGS, AND COLLAPSING THEM WOULD BE A LIE.
   *   * 8-K Item 5.07 is narrative HTML. We do not parse HTML — that is a standing scope
   *     decision, not a backlog item, so its copy must NOT imply "coming soon".
   *   * N-PX has been structured XML since 2024, so it is genuinely Track-1-eligible and simply
   *     is not ingested yet. That one IS a coverage gap and may honestly say so.
   * ==================================================================================== */

  function ipSection04() {
    if (IP_DATA.status === "idle" || ipPending(IP_DATA.beneficial)) {
      return P.states.loading({ title: "Loading the 5%-plus ownership filings" });
    }
    return (
      ip04Beneficial() +
      ip04Voting() +
      ipExpander(
        "Also in this section",
        "vote-weighted ownership · the activism trail",
        '<div class="ip-vw-wrap">' + ip04VoteWeighted() + "</div>" + ip04Activism()
      )
    );
  }

  /* ---------- the 13D/G filings, grouped into one lane per holder ----------
   *
   * Every row we ingest carries its OWN `form_type` (including `/A`), `filed`, `event_date` and
   * `percent_of_class`, so a holder's amendment chain is already a sequence — no derivation and
   * no new endpoint. Grouping is by `owner_name` as filed: the forms carry no CIK for a
   * reporting person, which is the same limit §02's type column documents. A filer that renames
   * itself therefore reads as two holders, and the caption says so. */
  function ip04Filers() {
    var b = IP_DATA.beneficial;
    if (ipPending(b) || ipErr(b) || !b.beneficial_ownership || !b.beneficial_ownership.length) {
      return null;
    }
    var byOwner = {};
    b.beneficial_ownership.forEach(function (f) {
      if (!f.owner_name || !f.filed) return;
      (byOwner[f.owner_name] = byOwner[f.owner_name] || []).push(f);
    });
    var owners = Object.keys(byOwner).map(function (name) {
      var rows = byOwner[name].slice().sort(function (a, c) {
        return a.filed < c.filed ? -1 : a.filed > c.filed ? 1 : 0;
      });
      var latest = rows[rows.length - 1];
      return {
        name: name,
        rows: rows,
        latest: latest,
        /* A final amendment reporting 0% is a real, REPORTED zero -- it is how a holder says it
         * has dropped back under 5%. Real data has these and the prototype never did, so the
         * copy has to distinguish "holds nothing" from "exited": the number is identical and the
         * meaning is not. */
        exited: latest.percent_of_class === 0,
        // 13D anywhere in the chain is the signal; a holder that started passive and filed a 13D
        // is not a 13G filer any more.
        hasD: rows.some(function (r) { return /13D/.test(r.form || ""); }),
      };
    });
    if (!owners.length) return null;
    // Largest current stake first, so the lane chart and the table rank the same way.
    owners.sort(function (a, c) {
      return (c.latest.percent_of_class || 0) - (a.latest.percent_of_class || 0);
    });
    return owners;
  }

  // "SCHEDULE 13G/A" -> "SC 13G"; the prototype's own short form, and what the table shows.
  function ip04ShortForm(form) {
    if (!form) return IP_NA;
    return /13D/.test(form) ? "SC 13D" : /13G/.test(form) ? "SC 13G" : form;
  }

  /* Amendment labels for one filer's chain.
   *
   * `form_type` carries the "/A" but not WHICH amendment, so the ordinal is counted here --
   * stated as "amendment N" the way the prototype does, never as an SEC-assigned number, because
   * the SEC assigns none.
   *
   * ⚠ Counted over the AMENDMENTS, not over the array. Using the array index produced
   * "amendment 0" for any filer whose earliest ingested filing is already an /A — which is the
   * common case, because the original often predates the structured-XML floor we parse. The
   * first amendment is 1 whether or not we hold the initial filing it amends. */
  function ip04EventLabels(rows) {
    var n = 0;
    return rows.map(function (r) {
      if (!/\/A/.test(r.form_type || "")) return "initial";
      n += 1;
      return "amendment " + n;
    });
  }

  // How many of a filer's ingested filings are amendments -- the table's "Amendment N".
  function ip04AmendmentCount(rows) {
    return rows.filter(function (r) { return /\/A/.test(r.form_type || ""); }).length;
  }

  /* The lane chart's spec, with x positions COMPUTED from filing dates.
   *
   * The prototype's x values were recovered from its capture because it maps dates onto a time
   * axis we did not have; now we do. The axis spans the earliest to the latest filing across all
   * holders, with a small inset so an edge dot is not half-clipped, and the gridlines are the
   * calendar quarter boundaries inside that span -- so the labels are real dates rather than the
   * capture's four fixed ones. */
  function ip04LaneSpec(owners, W) {
    var all = [];
    owners.forEach(function (o) { o.rows.forEach(function (r) { all.push(r.filed); }); });
    if (all.length < 2) return null;
    var t = all.map(function (d) { return Date.parse(d); }).filter(function (v) { return !isNaN(v); });
    if (t.length < 2) return null;
    var lo = Math.min.apply(null, t), hi = Math.max.apply(null, t);
    /* X0 clears the lane's name/form gutter, which is right-anchored at 175 viewBox units. The
     * prototype's earliest dot sat at ~203 and got away with it because its lane names were
     * short; a real filer name is wider, and the first event label (centred on its dot) then ran
     * back under the form label -- rendering "SC 13Gamendment 1". */
    var X0 = 240, X1 = (W || 660) - 30;
    // A single-day span would divide by zero; park everything mid-axis instead.
    var x = function (iso) {
      var v = Date.parse(iso);
      if (isNaN(v) || hi === lo) return (X0 + X1) / 2;
      return X0 + ((v - lo) / (hi - lo)) * (X1 - X0);
    };
    // Quarter boundaries inside the span, capped so the labels cannot collide.
    var grid = [];
    var d = new Date(lo);
    d = new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
    for (var guard = 0; guard < 40; guard++) {
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1));
      if (d.getTime() > hi) break;
      grid.push([x(d.toISOString().slice(0, 10)), d.toISOString().slice(0, 7)]);
    }
    var step = Math.ceil(grid.length / 5) || 1;
    grid = grid.filter(function (_, i) { return i % step === 0; });
    return {
      laneGrid: grid,
      lanes: owners.slice(0, IP_LANES).map(function (o) {
        return {
          name: ipShortManager(o.name, 22),
          full: o.name,
          form: ip04ShortForm(o.latest.form_type),
          events: (function () {
            var labels = ip04EventLabels(o.rows);
            return o.rows.map(function (r, i) {
              return [
                x(r.filed),
                r.percent_of_class === null || r.percent_of_class === undefined
                  ? IP_NA
                  : r.percent_of_class.toFixed(1) + "%",
                labels[i],
              ];
            });
          })(),
        };
      }),
      hiddenOwners: Math.max(0, owners.length - IP_LANES),
    };
  }

  function ip04Beneficial() {
    var owners = ip04Filers();
    var head =
      '<div class="ip-card">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Beneficial ownership filings</h3>' +
      '<span class="ip-card-note">SC 13D / 13G · above the 5% threshold</span>' +
      ipLink("Read the filings ↗", ipEdgarFts("SC 13D,SC 13G")) +
      "</div>";
    if (ipPending(IP_DATA.beneficial)) return head + ip03Loading() + "</div>";
    if (!owners) {
      return head + ip03Empty(
        "No structured Schedule 13D/G has been ingested for this issuer. That can mean nobody " +
        "has crossed 5%, or that the filings predate the structured-XML era we parse — it is " +
        "not a confirmed absence of large holders."
      ) + "</div>";
    }
    var lane = ip04LaneSpec(owners, 660);
    var rows = owners
      .map(function (o) {
        var l = o.latest;
        var amendments = ip04AmendmentCount(o.rows);
        // D-purpose: the Item 4 prose slot now carries the cover-page TYPE OF REPORTING PERSON --
        // structured, already ingested, and the same field §02's table shows.
        var type = l.reporting_person_type_label ||
          (l.reporting_person_type ? l.reporting_person_type : null);
        return (
          '<div class="ip-bo-row">' +
          '<div class="ip-bo-id">' +
          '<span class="ip-bo-name"><span title="' + P.esc(o.name) + '">' +
          P.esc(ipShortManager(o.name, 34)) + "</span></span>" +
          '<span class="ip-bo-purpose"><span>' +
          (type ? P.esc(type) : "Reporting-person type not stated on the filing") +
          "</span></span>" +
          '<span class="ip-bo-latest"><span>' +
          P.esc((amendments > 0 ? "Amendment " + amendments : "Initial filing") +
            " · " + (l.filed || IP_NA) +
            (o.exited ? " · reported below 5% and exited" : "")) + "</span></span>" +
          "</div>" +
          '<span class="ip-bo-form"><span>' + P.esc(ip04ShortForm(l.form_type)) + "</span></span>" +
          '<span class="ip-bo-stake"><span>' +
          P.esc(l.percent_of_class === null || l.percent_of_class === undefined
            ? IP_NA
            : l.percent_of_class.toFixed(1) + "%") + "</span></span>" +
          "</div>"
        );
      })
      .join("");
    return (
      head +
      '<div class="ip-subbar ip-subbar--tight">' +
      '<span class="ip-micro">Filing history · stake as reported in each filing</span>' +
      (lane ? ipChip("04-lanes") : "") +
      "</div>" +
      (lane
        ? '<div data-ip-chart="04-lanes">' + ipLaneChart(lane, 660, ip04LaneHeight(lane)) + "</div>" +
          '<div class="ip-caption"><span>' + P.esc(
            "Each lane is one holder that has crossed the 5% threshold and filed; the dot is a " +
            "filing and the figure above it the stake reported in THAT filing. A final " +
            "amendment reporting 0% is an exit back below 5%, not a holding of nothing. 13D and " +
            "13G are the holder's own categorical choice of form, shown as identity, not " +
            "judgment." +
            (lane.hiddenOwners
              ? " " + lane.hiddenOwners + " further holder(s) are in the table below but not " +
                "charted."
              : "")
          ) + "</span></div>"
        : ip03Empty(
            "Only one filing has been ingested for this issuer, so there is no chain to draw. A " +
            "single dot is not a history."
          )) +
      '<div class="ip-micro ip-micro--block">Current filings on file</div>' +
      rows +
      '<div class="ip-caption">' + P.esc(
        "13D and 13G are categorical filing choices, not a judgment about the holder. The second " +
        "line is the cover page's TYPE OF REPORTING PERSON — the filer's own declaration of what " +
        "kind of entity it is, not what it intends. Holders are grouped by the name as filed, " +
        "because these forms carry no CIK for a reporting person, so a filer that renames itself " +
        "reads as two."
      ) + "</div>" +
      "</div>"
    );
  }

  // One lane per holder at the prototype's 76px pitch, plus its header and axis gutter.
  function ip04LaneHeight(lane) {
    return Math.max(150, 60 + lane.lanes.length * 76 + 20);
  }

  /* ---------- voting: an empty state, and NOT a "coming soon" one (D-voting) ---------- */

  function ip04Voting() {
    return (
      '<div class="ip-card">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Voting behavior</h3>' +
      '<span class="ip-card-note">8-K Item 5.07 outcomes · manager-level votes from N-PX</span>' +
      ipStatusChip("na") +
      ipLink("Read Item 5.07 ↗", ipEdgarFts("8-K")) +
      ipLink("N-PX ↗", ipEdgarFts("N-PX")) +
      "</div>" +
      ip03Empty(
        "Annual-meeting vote results are certified in 8-K Item 5.07, which is a narrative HTML " +
        "exhibit. This product ingests structured filings only and does not parse HTML, so these " +
        "outcomes are outside what it can report — not merely missing. The links above go to the " +
        "filings themselves."
      ) +
      '<div class="ip-caption"><span>' + P.esc(
        "Manager-level votes would come from each fund's N-PX. N-PX has been a structured XML " +
        "form since 2024, so it is something this product could ingest — it simply has not been " +
        "ingested yet. The two gaps on this card are different in kind, which is why they are " +
        "stated separately."
      ) + "</span></div>" +
      "</div>"
    );
  }

  function ip04VoteWeighted() {
    return (
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Vote-weighted ownership</h3>' +
      '<span class="ip-card-note">13F shares matched to the manager\'s N-PX record</span>' +
      ipStatusChip("na") +
      "</div>" +
      ip03Empty(
        "This would match each 13F filer's shares to how that manager actually voted, using its " +
        "N-PX record. N-PX is not ingested yet. Showing a split without it would mean guessing " +
        "how managers voted from how they hold, which is exactly the inference this view exists " +
        "not to make."
      ) +
      '<div class="ip-caption ip-caption--tight"><span>' + P.esc(
        "Managers with no N-PX on file — including non-fund managers not subject to it — would " +
        "be reported separately rather than assumed either way."
      ) + "</span></div>" +
      "</div>"
    );
  }

  /* ---------- the activism trail: a form_type count, and nothing more ---------- */

  function ip04Activism() {
    var owners = ip04Filers();
    var head =
      '<div class="ip-card">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Activism trail</h3>' +
      '<span class="ip-card-note">SC 13D amendments</span>' +
      ipLink("Read the 13D chain ↗", ipEdgarFts("SC 13D")) +
      "</div>";
    if (!owners) {
      return head + ip03Empty(
        "No structured Schedule 13D/G ingested for this issuer, so there is no filing trail to " +
        "read either way."
      ) + "</div>";
    }
    var activists = owners.filter(function (o) { return o.hasD; });
    var amendments = owners.reduce(function (t, o) { return t + ip04AmendmentCount(o.rows); }, 0);
    var headline = activists.length
      ? activists.length + " of " + owners.length + " holder(s) above 5% have filed on Schedule " +
        "13D — the form a holder chooses when it is not merely a passive investor."
      : "No SC 13D on file — every holder above the 5% threshold has filed on Schedule 13G.";
    var live = owners.filter(function (o) { return !o.exited; }).length;
    var gone = owners.length - live;
    var sub = live + " filer(s) currently reporting a position above 5%" +
      (gone ? ", plus " + gone + " that has since filed an exit below it" : "") +
      (amendments ? ", across " + amendments + " amendment(s)." : ".");
    return (
      head +
      '<div class="ip-act">' +
      '<span class="ip-act-head"><span>' + P.esc(headline) + "</span></span>" +
      '<span class="ip-act-sub"><span>' + P.esc(sub) + "</span></span>" +
      "</div>" +
      // ⚠ The prototype's caption also claimed "no cooperation or standstill agreement filed as
      // an 8-K exhibit". 8-K exhibits are not ingested, and asserting an absence we never looked
      // for is worse than saying nothing -- so that clause is gone (D-voting's neighbour).
      '<div class="ip-caption"><span>' + P.esc(
        "The choice of form is the record: a holder files 13D rather than 13G when it does not " +
        "qualify as passive, and amends when its position or purpose materially changes. What " +
        "each filer SAID in Item 4 is free text, which this product does not extract — so the " +
        "sequence of filings is shown, and the stated intent behind it is not."
      ) + "</span></div>" +
      "</div>"
    );
  }

  /* One lane per 5%-threshold holder: a line through that holder's filings, a dot per filing, the
   * stake above it and the amendment label below. Event labels alternate 16/32px below the lane so
   * neighbouring ones cannot collide, and the last label right-anchors at the frame when its dot is
   * near the right edge -- both rules reproduce all four of the prototype's lanes exactly. */
  function ipLaneChart(spec, W, H) {
    var k = W / 660;
    var grid = spec.laneGrid
      .map(function (g) {
        var x = g[0] * k;
        return '<line x1="' + x + '" y1="16" x2="' + x + '" y2="' + (H - 20) +
          '" stroke="var(--rule)" stroke-width="1"></line>' +
          '<text x="' + x + '" y="' + (H - 6) + '" text-anchor="middle" class="ip-ax2">' +
          P.esc(g[1]) + "</text>";
      })
      .join("");
    var lanes = spec.lanes
      .map(function (lane, li) {
        var y = 60 + li * 76;
        var xs = lane.events.map(function (e) { return e[0] * k; });
        var last = xs.length - 1;
        return (
          '<text x="' + 175 * k + '" y="' + (y - 4) + '" text-anchor="end" class="ip-lane-name">' +
          P.esc(lane.name) + "</text>" +
          '<text x="' + 175 * k + '" y="' + (y + 15) + '" text-anchor="end" class="ip-ax2">' +
          P.esc(lane.form) + "</text>" +
          '<line x1="' + xs[0] + '" y1="' + y + '" x2="' + xs[last] + '" y2="' + y +
          '" stroke="var(--accent)" stroke-width="1.6" opacity="0.4"></line>' +
          lane.events.map(function (e, i) {
            var x = xs[i];
            var isLast = i === last;
            var dot = isLast
              ? '<circle cx="' + x + '" cy="' + y + '" r="5" fill="var(--accent)" stroke="var(--accent)" stroke-width="1.6"></circle>'
              : '<circle cx="' + x + '" cy="' + y + '" r="4" fill="var(--bg-card)" stroke="var(--accent)" stroke-width="1.6"></circle>';
            var below = i % 2 ? 32 : 16;
            var lbl = isLast && e[0] > 600
              ? '<text x="' + (658 * k) + '" y="' + (y + below) + '" text-anchor="end" class="ip-lane-ev">' + P.esc(e[2]) + "</text>"
              : '<text x="' + x + '" y="' + (y + below) + '" text-anchor="middle" class="ip-lane-ev">' + P.esc(e[2]) + "</text>";
            return dot +
              '<text x="' + x + '" y="' + (y - 12) + '" text-anchor="middle" class="ip-lane-pct">' +
              P.esc(e[1]) + "</text>" + lbl;
          }).join("")
        );
      })
      .join("");
    return (
      '<div><svg width="100%" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" ' +
      'style="display:block;max-width:100%" role="img" ' +
      'aria-label="One lane per holder above the 5% threshold, a dot per filing">' +
      grid + lanes + "</svg></div>"
    );
  }

  /* ============================ §05 · Holder behavior ============================
   * PHASE 2. `IP05` is gone. Three blocks, two of them straight off `register-shape`:
   *
   *   turnover + median holding period  shape.turnover / shape.tenure
   *   retention heatmap                 shape.retention  -- NEW, and a genuinely different
   *                                     question from tenure (see below)
   *   register today, by tenure         shape.tenure.cohorts
   *   fund-level positions (N-PORT)     NOT INGESTED -> honest empty state
   *
   * ⚠️ RETENTION AND TENURE ARE NOT THE SAME MEASURE, and the card shows both.
   *   * `tenure` counts each CURRENT holder's streak BACKWARDS from the newest quarter.
   *   * `retention` follows each entry cohort FORWARDS from the quarter it first appears.
   * A register can have long median tenure and poor retention at once — the first is about who
   * is here now, the second about who stayed. The captions have to keep them apart.
   *
   * 🔶 N-PORT: the operator ruled the identical question one section ago (D-voting, on N-PX) —
   * a structured-XML form we do not ingest gets an honest empty state, and its copy says
   * "not ingested", NOT "cannot be reported". N-PORT is the same shape, so the same answer is
   * applied here. Flagged rather than re-asked; overrule it if that reading is wrong.
   * ==================================================================================== */

  function ipSection05() {
    if (IP_DATA.status === "idle" || ipPending(IP_DATA.shape)) {
      return P.states.loading({ title: "Loading holder persistence" });
    }
    /* The expander bar and what it reveals are GRID ITEMS here, not siblings after the grid — the
     * prototype gives the bar `grid-column: 1 / -1` and lets the grid's own 14px gap space it.
     * Outside the grid it loses that gap and the whole lower half of the section rides 14px high.
     * (Phase 1 paid for that once; flattening this in phase 2 would have paid for it again — and
     * would have dropped a live control, which D-behaviour treats as a defect.) */
    return (
      '<div class="ip-grid1">' +
      ip05Persistence() +
      ipExpander("Also in this section", "fund-level N-PORT positions, monthly", ip05Funds()) +
      "</div>"
    );
  }

  /* The retention grid's spec, in `ipCohortGrid`'s own shape.
   *
   * `[printed value, fill-opacity]` per cell. The prototype's opacities were recovered from its
   * capture because they were computed from the UNROUNDED share and so are not recoverable from
   * the printed label; with real data we compute both from the same number, which is strictly
   * better — the wash and the label can no longer disagree.
   *
   * Empty cohorts (a quarter that brought no new manager) are dropped from the GRID but counted
   * in the note: a zero-height row would read as a cohort that vanished instantly. */
  function ip05RetentionSpec() {
    var shape = IP_DATA.shape;
    if (ipPending(shape) || ipErr(shape)) return null;
    var r = shape.retention;
    if (!r || r.status !== "ok" || !r.cohorts) return null;
    var live = r.cohorts.filter(function (c) { return c.holder_count > 0 && c.survival.length; });
    if (!live.length) return null;
    return {
      block: r,
      emptyCohorts: r.cohorts.length - live.length,
      cohorts: live.map(function (c) {
        return ipQuarter(c.period) + (c.left_censored ? " *" : "");
      }),
      retention: live.map(function (c) {
        return c.survival.map(function (v) {
          // The prototype's wash tops out at 0.7 for a full cohort; keep that ceiling so the
          // grid reads the same, and derive the label from the same value.
          return [Math.round(v * 100), +(v * 0.7).toFixed(4)];
        });
      }),
      leftCensored: live.some(function (c) { return c.left_censored; }),
    };
  }

  function ip05Persistence() {
    var shape = IP_DATA.shape;
    var pending = ipPending(shape);
    var turnover = pending || ipErr(shape) ? null : shape.turnover;
    var ten = pending || ipErr(shape) ? null : shape.tenure;
    var grid = ip05RetentionSpec();

    var stats = [
      {
        label: "Register turnover",
        value: ipOk(turnover, "turnover_pct") ? turnover.turnover_pct.toFixed(1) + "%" : IP_NA,
        block: turnover,
        accent: true,
        derive: "05-turnover",
      },
      {
        label: "Median holding period",
        value: ipOk(ten, "median_quarters_held")
          ? ten.median_quarters_held.toFixed(1) + " quarters"
          : IP_NA,
        block: ten,
        accent: false,
        derive: "05-tenure",
      },
    ]
      .map(function (t) {
        var chip = ipChipFor(t.block);
        return (
          '<div class="ip-stat">' +
          '<span class="ip-micro">' + P.esc(t.label) + "</span>" +
          '<span class="ip-stat-val ip-stat-val--19' + (t.accent ? "" : " ip-stat-val--plain") +
          '"><span>' + P.esc(t.value) + "</span>" + (chip ? ipStatusChip(chip) : "") + "</span>" +
          "</div>"
        );
      })
      .join("");

    // "Register today, by tenure" — the SAME cohorts §03's stable-capital card weights, shown
    // here unweighted. One source, two readings, so they can never disagree.
    var observed = ten && ten.quarters_observed ? ten.quarters_observed : 0;
    var tenureRows = ((ten && ten.status === "ok" && ten.cohorts) || [])
      .map(function (c) {
        var unreachable = c.min_quarters > observed;
        var pct = unreachable || c.share_of_register === null || c.share_of_register === undefined
          ? null
          : ipPct(c.share_of_register, 0);
        return (
          '<div class="ip-coh-row ip-coh-row--3">' +
          '<span class="ip-coh-label"><span>' + P.esc(c.label) + "</span></span>" +
          '<span class="ip-coh-bar">' +
          (pct ? '<span class="ip-coh-fill" style="width:' + P.esc(pct) + '"></span>' : "") +
          "</span>" +
          '<span class="ip-coh-share"><span>' + P.esc(pct || IP_NA) + "</span>" +
          (pct ? "" : ipStatusChip("na")) + "</span>" +
          "</div>"
        );
      })
      .join("");

    var head =
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Holder persistence</h3>' +
      '<span class="ip-card-note">CIK matched across consecutive 13F-HR filings</span>' +
      ipBadge("05-turnover") + ipBadge("05-tenure") +
      "</div>";
    if (pending) return head + ip03Loading() + "</div>";

    return (
      head +
      '<div class="ip-stat-row ip-stat-row--05">' + stats + "</div>" +
      '<div class="ip-subbar ip-subbar--tight">' +
      '<span class="ip-micro">Retention by entry cohort · % of cohort still reporting</span>' +
      (grid ? ipChip("05-cohorts") : "") +
      "</div>" +
      (grid
        ? ipCohortGrid(grid, 660, ip05GridHeight(grid)) +
          '<div class="ip-caption"><span>' + P.esc(ip05RetentionNote(grid)) + "</span></div>"
        : ip03Empty(ipWhy(
            ipErr(shape) ? shape : (shape || {}).retention,
            "following a cohort forward needs at least two ingested quarters"
          ))) +
      '<div class="ip-micro ip-micro--block">Register today, by tenure</div>' +
      (tenureRows || ip03Empty(ipWhy(ten, "tenure needs more than one ingested quarter"))) +
      '<div class="ip-caption"><span>' + P.esc(
        "Computed by matching manager CIKs across consecutive 13F-HR filings. Managers falling " +
        "below the $100M reporting threshold appear as exits. This counts each CURRENT holder's " +
        "streak backwards from the newest quarter — a different measure from the retention grid " +
        "above, which follows each cohort forwards." +
        (ten && ten.reason ? " " + ten.reason + "." : "")
      ) + "</span></div>" +
      ipDerivationPanel("05-turnover") +
      ipDerivationPanel("05-tenure") +
      "</div>"
    );
  }

  function ip05GridHeight(grid) {
    return Math.max(80, 31 + grid.retention.length * 26 + 12);
  }

  function ip05RetentionNote(grid) {
    return (
      "Each row is the managers first observed in the register that quarter; each cell is the " +
      "share of that cohort still reporting a position N quarters later. A manager dropping " +
      "below the $100M reporting threshold reads as an exit, and so does a quarter we have not " +
      "ingested." +
      (grid.leftCensored
        ? " The starred row is left-censored: everyone already holding in the first quarter we " +
          "hold lands in it, however long they had actually held, so it is 'present at the " +
          "start' rather than a real entry cohort."
        : "") +
      (grid.emptyCohorts
        ? " " + grid.emptyCohorts + " quarter(s) brought no new manager and so have no row."
        : "")
    );
  }

  /* ---------- fund-level positions: N-PORT, not ingested ---------- */

  function ip05Funds() {
    return (
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Fund-level positions</h3>' +
      '<span class="ip-card-note">N-PORT · monthly, named funds</span>' +
      ipStatusChip("na") +
      ipLink("Read N-PORT ↗", ipEdgarFts("N-PORT")) +
      "</div>" +
      ip03Empty(
        "N-PORT reports monthly holdings at the individual fund level — more granular and more " +
        "current than the manager-level 13F. It is a structured XML form, so it is something " +
        "this product can ingest; it simply has not been ingested yet. Naming funds without it " +
        "would mean attributing a manager's 13F position to particular funds, which no filing " +
        "supports."
      ) +
      '<div class="ip-caption"><span>' + P.esc(
        "Share counts would be shown; position values in N-PORT are market-derived and would be " +
        "excluded. The link above goes to the filings themselves."
      ) + "</span></div>" +
      "</div>"
    );
  }

  /* Cohort retention heatmap: one row per entry cohort, one cell per quarter since, the cell's
   * wash carrying the retention. Triangular by construction -- a cohort has no future. The label
   * flips to the card colour above 0.46 opacity, the threshold that separates the capture's own
   * two groups (its darkest --ink cell is 0.449, its lightest --bg-card cell 0.468). */
  function ipCohortGrid(spec, W, H) {
    var k = W / 660;
    var X0 = 63 * k, CW = 63 * k, STEP = 65 * k, Y0 = 31, RH = 24, RSTEP = 26;
    var heads = spec.retention[0]
      .map(function (_, i) {
        return '<text x="' + (X0 + i * STEP + CW / 2) + '" y="20" text-anchor="middle" class="ip-ax2">Q' +
          (i + 1) + "</text>";
      })
      .join("") +
      '<text x="' + 54 * k + '" y="20" text-anchor="end" class="ip-ax2">entered</text>';
    var rows = spec.retention
      .map(function (row, r) {
        var y = Y0 + r * RSTEP;
        return (
          '<text x="' + 54 * k + '" y="' + (y + RH / 2) +
          '" text-anchor="end" dominant-baseline="middle" class="ip-coh-lbl">' +
          P.esc(spec.cohorts[r]) + "</text>" +
          row.map(function (c, i) {
            var x = X0 + i * STEP;
            return '<rect x="' + x + '" y="' + y + '" width="' + CW + '" height="' + RH +
              '" rx="2" fill="var(--accent)" fill-opacity="' + c[1] + '"></rect>' +
              '<text x="' + (x + CW / 2) + '" y="' + (y + RH / 2) +
              '" text-anchor="middle" dominant-baseline="middle" class="ip-coh-val' +
              (c[1] >= 0.46 ? " ip-coh-val--on" : "") + '">' + c[0] + "</text>";
          }).join("")
        );
      })
      .join("");
    return (
      '<div><svg width="100%" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" ' +
      'style="display:block;max-width:100%" role="img" ' +
      'aria-label="Share of each entry cohort still reporting N quarters later">' +
      heads + rows + "</svg></div>"
    );
  }

  /* ============================ §06 · Filing mechanics ============================
   * PHASE 2. `IP06` is gone. §06 held the largest concentration of one specific defect: it
   * ASSERTED absences about filings we never looked at ("No tender offer on file", "No Form 25
   * or Form 15 filed", "No confidential treatment requests"). The operator ruled BUILD THE
   * INGEST (D-supply), so those become CHECKED absences, scoped to a window we state.
   *
   *   supply-side events        /filing-index -> supply.categories
   *   next-window timeline      a filing RULE (the 45-day statute), like §01's speed block
   *   acceptance-lag histogram  /filing-index -> acceptance_lag, over the REGISTER'S MANAGERS
   *   amendment rate            period_meta.amendment_count per ingested quarter
   *   10b5-1 plan use           the insider rows' `rule_10b5_1` flag
   *
   * ⚠️ THE ONE SENTENCE THIS SECTION TURNS ON: an absence over a WINDOW is not an absence over
   * HISTORY. Every zero here is followed by the window it was checked against, and when nothing
   * has been indexed the card says "we have not looked" rather than "none on file".
   * ==================================================================================== */

  function ipSection06() {
    if (IP_DATA.status === "idle" || ipPending(IP_DATA.filings)) {
      return P.states.loading({ title: "Loading filing mechanics" });
    }
    /* The grid wrappers are the accepted build's, and they are load-bearing: §06's two revealed
     * cards SHARE A ROW at ~340px each, which is the width its 306-unit charts are authored for.
     * Stacking them full-width stretches those charts to the column and doubles every label.
     * (Phase 1 paid for the mirror image of this — see the log's §06 entry.) */
    return (
      '<div class="ip-grid2">' +
      ip06Supply() +
      ipExpander(
        "Also in this section",
        "insider filing mechanics · how complete the register itself is",
        '<div class="ip-grid2 ip-grid2--nested">' + ip06Insider() + ip06Mechanics() + "</div>"
      ) +
      "</div>"
    );
  }

  // ---------- supply-side events ----------

  function ip06Supply() {
    var f = IP_DATA.filings;
    var block = ipPending(f) || ipErr(f) ? null : f.supply;
    var head =
      '<div class="ip-card ip-card--flush ip-card--full">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Supply-side events</h3>' +
      '<span class="ip-card-note">S-1 / S-3 · SC TO · Form 25 / 15</span>' +
      (block && block.status !== "ok" ? ipStatusChip("na") : "") +
      "</div>";
    if (ipPending(f)) return head + ip03Loading() + "</div>";
    if (ipErr(f) || !block || block.status !== "ok") {
      return head + ip03Empty(ipWhy(
        ipErr(f) ? f : block,
        "no filing index has been ingested for this company, so we have not looked"
      )) + "</div>";
    }
    /* Each row is a CHECKED count. A zero here means "none among the filings we read", which is
     * why the window below it is not decoration -- it is what makes the zero a statement. */
    var rows = block.categories
      .map(function (c) {
        var body = c.count
          ? c.count + (c.latest_filed ? " · latest " + c.latest_form + " " + c.latest_filed : "")
          : "none found";
        return "<span><span>" + P.esc(c.label + ": " + body) + "</span></span>";
      })
      .join("");
    var window = block.covered_from && block.covered_to
      ? block.covered_from + " to " + block.covered_to
      : "the filings we hold";
    return (
      head +
      '<div class="ip-facts">' + rows + "</div>" +
      '<div class="ip-subbar ip-subbar--windows">' +
      '<span class="ip-micro">Windows and expiries ahead</span>' +
      ipChip("06-windows") +
      "</div>" +
      ipTimeline(ip06TimelineSpec(), 660, 154) +
      '<div class="ip-caption"><span>' + P.esc(ip06TimelineNote()) + "</span></div>" +
      '<div class="ip-caption ip-caption--10"><span>' + P.esc(
        "Counted over " + ipCount(block.indexed_count) + " indexed filings, " + window +
        ". A count of none means none among those — EDGAR's recent-filings window is not a " +
        "company's whole history, so this is a checked absence over a period, not a claim about " +
        "all time. These are filings that EXIST: a registration statement establishes which " +
        "shares may be resold, and says nothing about whether a sale occurred or on what terms. " +
        "Lock-up length lives in an exhibit we do not parse, so no count here answers it."
      ) + "</span></div>" +
      "</div>"
    );
  }

  /* The timeline carries ONE row now, and it is a filing RULE rather than a figure: the next
   * statutory 13F window, from the same 45-day calendar arithmetic §01's deadline uses.
   *
   * 🔶 DEVIATION, listed: the prototype's second row was a "10b5-1 cooling-off" window. We now
   * capture the Form 4 Rule 10b5-1 box (D-10b5-1), but that flag says a trade was made UNDER a
   * plan — it does not carry the plan's ADOPTION date, and a cooling-off window can only be drawn
   * from an adoption date. So the flag feeds a COUNT on the insider card below instead of a dated
   * band here. Drawing the band from anything else would be inventing a date. */
  function ip06TimelineSpec() {
    var deadlineDays = 45;
    var reg = IP_DATA.register;
    if (!ipErr(reg) && reg && reg.period_meta && reg.period_meta.deadline_days) {
      deadlineDays = reg.period_meta.deadline_days;
    }
    var due = ipNextDeadline(deadlineDays);
    var today = ipTodayIso();
    // The axis runs from today to a fortnight past the deadline, so the band has room to read.
    var lo = Date.parse(today);
    var hi = Date.parse(due) + 14 * 86400000;
    var X0 = 250, X1 = 620;
    var x = function (iso) {
      var v = Date.parse(iso);
      if (isNaN(v) || hi === lo) return X0;
      return X0 + ((v - lo) / (hi - lo)) * (X1 - X0);
    };
    var grid = [];
    var d = new Date(lo);
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    for (var i = 0; i < 8; i++) {
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
      if (d.getTime() > hi) break;
      var iso = d.toISOString().slice(0, 10);
      grid.push([x(iso), ipMonthLabel(iso)]);
    }
    return {
      grid: grid,
      today: [x(today), "today"],
      rows: [
        {
          name: "Next 13F window",
          sub: "13F-HR · " + deadlineDays + " days",
          x: x(today),
          w: Math.max(8, x(due) - x(today)),
          mark: x(due),
          label: "filing deadline",
          anchor: "end",
        },
      ],
      deadline: due,
    };
  }

  function ipMonthLabel(iso) {
    var M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return M[+iso.slice(5, 7) - 1] + " " + iso.slice(2, 4);
  }

  function ip06TimelineNote() {
    var spec = ip06TimelineSpec();
    return (
      "The next statutory 13F window closes " + spec.deadline + " — that is the filing rule " +
      "applied to the calendar, not a prediction about any filer. Only windows a filing actually " +
      "dates can appear here; a registration or an expiry establishes when shares may be sold, " +
      "and does not say that any sale occurred."
    );
  }

  // ---------- insider filing mechanics ----------

  /* The 10b5-1 flag, as a count over the insider rows we hold. `rule_10b5_1` is the filer's own
   * cover-box declaration that a trade was PRE-ARRANGED; `null` is unknown (pre-2022 filings
   * predate the box), and unknown is reported rather than folded into either answer. */
  function ip06PlanUse() {
    var a = IP_DATA.insider;
    // /insider-trades returns a bare ARRAY of transactions, not an envelope.
    if (ipPending(a) || ipErr(a) || !Array.isArray(a)) return null;
    var rows = a.filter(function (t) { return !t.is_holding; });
    if (!rows.length) return null;
    var planned = 0, discretionary = 0, unknown = 0;
    var owners = {};
    rows.forEach(function (t) {
      if (t.rule_10b5_1 === true) { planned += 1; owners[t.owner_name || "?"] = true; }
      else if (t.rule_10b5_1 === false) discretionary += 1;
      else unknown += 1;
    });
    return {
      total: rows.length,
      planned: planned,
      discretionary: discretionary,
      unknown: unknown,
      owners: Object.keys(owners).length,
    };
  }

  function ip06Insider() {
    var use = ip06PlanUse();
    var head =
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Insider filings</h3>' +
      '<span class="ip-card-note">Rule 10b5-1 plan use, from the Form 4 cover box</span>' +
      (use ? "" : ipStatusChip("na")) +
      ipLink("Read the Forms 4 ↗", ipEdgarFts("4")) +
      "</div>";
    if (ipPending(IP_DATA.insider)) return head + ip03Loading() + "</div>";
    if (!use) {
      return head + ip03Empty(
        "No Form 3/4/5 transaction has been ingested for this issuer, so there is nothing to " +
        "classify."
      ) + "</div>";
    }
    return (
      head +
      '<div class="ip-plan-line">' + P.esc(
        use.planned
          ? use.planned + " of " + use.total + " reported transactions were made under a Rule " +
            "10b5-1 plan, across " + use.owners + " insider(s)."
          : "None of the " + use.total + " reported transactions we hold was marked as made " +
            "under a Rule 10b5-1 plan."
      ) + "</div>" +
      '<div class="ip-plan-line ip-plan-line--soft">' + P.esc(
        use.unknown
          ? use.unknown + " transaction(s) carry no plan marking at all — Forms 4 filed before " +
            "the box existed. Those are unknown, not discretionary."
          : "Every transaction we hold carries an explicit plan marking."
      ) + "</div>" +
      '<div class="ip-caption"><span>' + P.esc(
        "A 10b5-1 plan is pre-arranged: the trade was scheduled in advance rather than decided " +
        "when it executed. The marking is the filer's own, on the Form 4 cover page — it is a " +
        "disclosure, not our judgment, and it says nothing about why the plan was adopted."
      ) + "</span></div>" +
      ipGoLink("Insider activity view — ledger, transaction codes →") +
      "</div>"
    );
  }

  // ---------- register mechanics ----------

  function ip06Mechanics() {
    var f = IP_DATA.filings;
    var lag = ipPending(f) || ipErr(f) ? null : f.acceptance_lag;
    var pop = ipPending(f) || ipErr(f) ? null : f.lag_population;
    var reg = IP_DATA.register;
    var meta = ipErr(reg) || !reg ? null : reg.period_meta;
    var amend = ip06AmendmentSeries();

    var lines = [];
    if (meta && meta.amendment_count !== null && meta.amendment_count !== undefined) {
      lines.push(
        meta.amendment_count
          ? meta.amendment_count + " amended 13F-HR filing(s) restating a prior position this " +
            "quarter"
          : "No amended 13F-HR filing this quarter among the filers we ingested"
      );
    }
    if (lag && lag.status === "ok" && lag.median_days !== null) {
      lines.push("Median acceptance lag " + lag.median_days + " days after quarter end");
    }
    /* ⚠️ REMOVED, deliberately: the prototype's "Index-manager share counts stepped up together
     * in 3Q25 — consistent with an index inclusion event". That is an INFERENCE presented as an
     * observation; nothing sources it and nothing should. Also gone: "No confidential treatment
     * requests on file this quarter", which asserted an absence about a form family we do not
     * index at all. */
    var head =
      '<div class="ip-card">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Register mechanics</h3>' +
      '<span class="ip-card-note">how completely and how late the register assembles</span>' +
      "</div>";
    return (
      head +
      (lines.length
        ? '<div class="ip-facts ip-facts--7">' +
          lines.map(function (l) { return "<span><span>" + P.esc(l) + "</span></span>"; }).join("") +
          "</div>"
        : "") +
      '<div class="ip-micro ip-micro--block">Acceptance lag across this quarter\u2019s filings</div>' +
      (lag && lag.status === "ok"
        ? ipHistogram(ip06LagSpec(lag), 306, 175) +
          '<div class="ip-caption"><span>' + P.esc(ip06LagNote(lag, pop)) + "</span></div>"
        : ip03Empty(ipWhy(
            lag,
            "no indexed 13F filing carries both a reported period and an acceptance timestamp"
          ))) +
      '<div class="ip-micro ip-micro--block">Amended filings per 100 filers</div>' +
      (amend
        ? ipAreaChart(amend.series, amend.labels, 306, 160) +
          '<div class="ip-caption"><span>' + P.esc(
            "Amended 13F-HR filings as a share of the filers we ingested each quarter. An " +
            "amendment restates a position already reported, so a higher rate means the first " +
            "read of a quarter was less reliable."
          ) + "</span></div>"
        : ip03Empty(
            "Fewer than two ingested quarters carry an amendment count, so there is no rate to " +
            "chart."
          )) +
      '<div class="ip-caption ip-caption--10"><span>' + P.esc(
        "Mechanics describe the completeness of the REGISTER, not the company."
      ) + "</span></div>" +
      "</div>"
    );
  }

  /* The histogram in `ipHistogram`'s own shape. The prototype's bins were recovered from bar
   * heights; the API returns one bucket per day, so the bins are the data. */
  function ip06LagSpec(lag) {
    var max = Math.max.apply(null, lag.counts);
    var ax = ipNiceAxis(max, function (v) { return ipCount(Math.round(v)); }, true);
    // Label roughly every other bucket, and always the ends, so a long axis stays readable.
    var step = Math.max(1, Math.ceil(lag.days.length / 7));
    var labels = [];
    lag.days.forEach(function (d, i) {
      if (i % step === 0 || i === lag.days.length - 1) labels.push([i, String(d)]);
    });
    var medianIndex = 0, best = Infinity;
    lag.days.forEach(function (d, i) {
      var gap = Math.abs(d - (lag.median_days || 0));
      if (gap < best) { best = gap; medianIndex = i; }
    });
    return {
      counts: lag.counts,
      axisMax: ax.axisMax,
      yTicks: [ax.ticks[0], ax.ticks[2], ax.ticks[4]],
      xLabels: labels,
      median: { i: medianIndex, label: "median " + lag.median_days },
      caption: "days after quarter end",
    };
  }

  function ip06LagNote(lag, pop) {
    var covered = pop && pop.manager_count
      ? " Measured over " + ipCount(pop.indexed_manager_count) + " of the " +
        ipCount(pop.manager_count) + " managers holding this quarter's register — the rest have " +
        "no filing index yet, so this describes the ones we indexed."
      : "";
    return (
      "When EDGAR ACCEPTED each 13F-HR, in days after the quarter it reports on. The statutory " +
      "deadline is 45 days, so the register is never complete before then." + covered +
      (lag.reason ? " " + lag.reason + "." : "")
    );
  }

  /* Amendments per ingested quarter, as a share of that quarter's filers. Both numbers come from
   * the same `period_meta` the freshness strip uses, so the chart and §01 cannot disagree. */
  function ip06AmendmentSeries() {
    var qs = ip02Quarters();
    var values = [], labels = [];
    qs.forEach(function (period) {
      var r = IP_DATA.registers[period];
      var m = r && r.period_meta;
      if (!m || m.ingested_filer_count === null || !m.ingested_filer_count) return;
      var count = m.amendment_count;
      if (count === null || count === undefined) return;
      values.push((count / m.ingested_filer_count) * 100);
      labels.push(ipQuarter(period));
    });
    if (values.length < 2) return null;
    var ax = ipNiceAxis(Math.max.apply(null, values) || 1, function (v) { return v.toFixed(1); });
    return {
      labels: labels,
      series: {
        values: values,
        axisMax: ax.axisMax,
        color: "var(--gaap-color)",
        ticks: ax.ticks,
      },
    };
  }

  /* Windows and expiries on a shared time axis: one row per dated window, a rounded band for its
   * span, a rule at the date that matters and a "today" marker across the frame. */
  function ipTimeline(spec, W, H) {
    var k = W / 660;
    var grid = spec.grid
      .map(function (g) {
        var x = g[0] * k;
        return '<line x1="' + x + '" y1="22" x2="' + x + '" y2="' + (H - 20) +
          '" stroke="var(--rule)" stroke-width="1"></line>' +
          (g[1] ? '<text x="' + x + '" y="' + (H - 6) + '" text-anchor="middle" class="ip-ax2">' +
            P.esc(g[1]) + "</text>" : "");
      })
      .join("") +
      '<line x1="' + spec.today[0] * k + '" y1="18" x2="' + spec.today[0] * k + '" y2="' + (H - 20) +
      '" stroke="var(--ink)" stroke-width="1.6"></line>' +
      '<text x="' + (spec.today[0] * k + 5) + '" y="26" class="ip-tl-today">' + P.esc(spec.today[1]) + "</text>";
    var rows = spec.rows
      .map(function (r, i) {
        var y = 53 + i * 46;
        return (
          '<text x="' + 240 * k + '" y="' + y + '" text-anchor="end" class="ip-lane-name">' +
          P.esc(r.name) + "</text>" +
          '<text x="' + 240 * k + '" y="' + (y + 14) + '" text-anchor="end" class="ip-ax2">' +
          P.esc(r.sub) + "</text>" +
          '<rect x="' + r.x * k + '" y="' + (y - 9) + '" width="' + r.w * k +
          '" height="22" rx="5" fill="var(--accent)" opacity="0.38" stroke="var(--accent)" stroke-width="1"></rect>' +
          '<line x1="' + r.mark * k + '" y1="' + (y - 12) + '" x2="' + r.mark * k + '" y2="' + (y + 16) +
          '" stroke="var(--accent-ink)" stroke-width="2"></line>' +
          (r.anchor === "end"
            ? '<text x="' + (r.mark * k - 6) + '" y="' + (y - 12) + '" text-anchor="end" class="ip-tl-mark">' + P.esc(r.label) + "</text>"
            : '<text x="' + (r.mark * k + 6) + '" y="' + (y + 5) + '" text-anchor="start" class="ip-tl-mark">' + P.esc(r.label) + "</text>")
        );
      })
      .join("");
    return (
      '<div><svg width="100%" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" ' +
      'style="display:block;max-width:100%" role="img" aria-label="Dated windows and expiries ahead">' +
      grid + rows + "</svg></div>"
    );
  }

  // Acceptance-lag histogram, with the median called out where it falls.
  function ipHistogram(spec, W, H) {
    var k = W / 306;
    var X0 = 42.54 * k, BW = 13.0629 * k, STEP = 18.1429 * k, YB = H - 34, YT = 14;
    var grid = spec.yTicks
      .map(function (label, i) {
        var y = YB - (i * (YB - YT)) / (spec.yTicks.length - 1);
        return '<line x1="' + 40 * k + '" y1="' + y + '" x2="' + (W - 12) + '" y2="' + y +
          '" stroke="var(--rule)" stroke-width="1"></line>' +
          '<text x="' + 34 * k + '" y="' + y + '" text-anchor="end" dominant-baseline="middle" class="ip-ax2">' +
          P.esc(label) + "</text>";
      })
      .join("");
    var bars = spec.counts
      .map(function (c, i) {
        var h = (c / spec.axisMax) * (YB - YT);
        return '<rect x="' + (X0 + i * STEP) + '" y="' + (YB - h) + '" width="' + BW +
          '" height="' + h + '" fill="var(--accent)" opacity="0.45" rx="1.5"></rect>';
      })
      .join("") +
      spec.xLabels.map(function (l) {
        return '<text x="' + (X0 + l[0] * STEP + BW / 2) + '" y="' + (YB + 13) +
          '" text-anchor="middle" class="ip-ax">' + P.esc(l[1]) + "</text>";
      }).join("");
    var mx = X0 + spec.median.i * STEP + BW / 2;
    return (
      '<div><svg width="100%" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" ' +
      'style="display:block;max-width:100%" role="img" ' +
      'aria-label="Distribution of EDGAR acceptance lag in days after quarter end">' +
      grid + bars +
      '<line x1="' + mx + '" y1="' + YT + '" x2="' + mx + '" y2="' + YB +
      '" stroke="var(--ink)" stroke-width="1.6" stroke-dasharray="4 3"></line>' +
      '<text x="' + (mx + 5) + '" y="' + (YT + 9) + '" class="ip-tl-mark">' + P.esc(spec.median.label) + "</text>" +
      '<text x="' + 167 * k + '" y="' + (H - 4) + '" text-anchor="middle" class="ip-ax2">' +
      P.esc(spec.caption) + "</text>" +
      "</svg></div>"
    );
  }

  /* ============================ §07 · Reference ============================
   * A flat glossary: what each source is, and what it cannot tell you. No controls — the only
   * section in the view with none, confirmed by tools/controls.js against the prototype. */
  var IP07 = [
    ["13F-HR", "Quarterly holdings report from an institutional manager with over $100M in Section 13(f) securities. Filed within 45 days of quarter end."],
    ["SC 13D / 13G", "Beneficial ownership above 5%. 13D is for holders who may seek to influence control; 13G is the passive short form."],
    ["N-PX", "Annual record of how a fund voted every proxy it held. The only public source for manager-level voting."],
    ["N-PORT", "Monthly portfolio holdings report from a registered fund, filed at the individual fund level."],
    ["Form 4", "Insider transaction report, due two business days after the trade. Code A is an acquisition, D a disposition, S an open-market sale."],
    ["Form 144", "Notice of a proposed sale of restricted or control securities, filed when the order is placed. Not every notice results in a trade."],
    ["Rule 10b5-1", "A pre-arranged trading plan. Since 2023 a 90-day cooling-off period applies between adoption and the first trade for officers and directors."],
    ["Item 405", "The proxy disclosure naming insiders who filed Section 16 reports late."],
    ["8-K Item 5.07", "Certified results of a shareholder vote, due four business days after the meeting."],
    ["Section 13(f) threshold", "The $100M in listed holdings that triggers 13F reporting. Smaller managers never appear in the register."],
  ];

  function ipSection07() {
    return (
      '<div class="ip-card">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Forms and rules used on this page</h3>' +
      '<span class="ip-card-note">what each source is, and what it cannot tell you</span>' +
      "</div>" +
      '<div class="ip-ref">' +
      IP07.map(function (r) {
        return '<div class="ip-ref-item">' +
          '<span class="ip-ref-form"><span>' + P.esc(r[0]) + "</span></span>" +
          '<span class="ip-ref-desc"><span>' + P.esc(r[1]) + "</span></span></div>";
      }).join("") +
      "</div>" +
      "</div>"
    );
  }

  /* ============================ the port's three live affordances ============================
   * Ported from the RUNNING prototype, not from its markup — a control's behaviour is not in the
   * DOM. Each was driven with tools/click.js + tools/overlay.js and its result read back.
   *
   *   ⤡ Expand    -> a lightbox. Backdrop + dialog + head (title · note · CLOSE) + the card's
   *                  chart RE-AUTHORED at the dialog's inner width, not scaled up. The prototype
   *                  gives each modal its own title and note, distinct from the card's.
   *   ƒ DERIVED   -> toggles a "how this is computed" panel and flips its own label to ƒ HIDE.
   *   Treemap     -> swaps the ranked chart for a treemap, swaps the caption, and HIDES the
   *                  ⤡ Expand chip (there is no larger view of a treemap).
   *
   * Everything still renders prototype literals — these are design behaviours, not data. */

  var IP_TREND_NOTE =
    "Rebuilt from each quarter's filings as they were filed — later amendments are not backfilled.";

  /* Both trend panels: series recovered from the captured path y-coordinates through the panel's
   * own axis (0.0-35.6% and 0-18), and the tick labels carried as literals like every other axis
   * in this port. */
  /* The inline trend panels, now computed per quarter.
   *
   * ⚠ `residual` IS GONE, and so is the "Residual over time" foot that opened it. That is the
   * direct consequence of D-attribution: the unreported-residual ROW was removed as a
   * subtraction rather than a measurement, and a trend of a number we no longer stand behind
   * would be worse than the row was. Listed as a deviation. Only `effective` remains, and every
   * point in it is a real quarter's register.
   *
   * The series is bounded by the quarters `ipLoad` fetches a register for, which is deliberate:
   * each point is that quarter's OWN concentration, computed by the API from that quarter's
   * filers, not interpolated. A quarter with no ingested filers contributes no point rather
   * than a zero. */
  function ipTrendSpec(key) {
    if (key !== "effective") return null;
    var qs = ip02Quarters();
    if (!qs.length) return null;
    var values = [], labels = [];
    qs.forEach(function (period) {
      var reg = IP_DATA.registers[period];
      var c = reg && reg.concentration;
      if (!c || c.status !== "ok" || c.effective_holders === null || c.effective_holders === undefined) {
        return;
      }
      values.push(c.effective_holders);
      labels.push(ipQuarter(period));
    });
    if (values.length < 2) return null;
    var ax = ipNiceAxis(Math.max.apply(null, values), function (v) {
      return String(Math.round(v));
    }, true);
    var first = values[0], last = values[values.length - 1];
    var pct = first > 0 ? ((last - first) / first) * 100 : null;
    var conc = (IP_DATA.register || {}).concentration || {};
    var measures = [
      ["HHI", ipOk(conc, "hhi") ? conc.hhi.toFixed(0) : IP_NA,
        "effective holders is 10,000 ÷ HHI", true],
      ["Gini", ipOk(conc, "gini") ? conc.gini.toFixed(2) : IP_NA,
        "inequality across holders, from the curve below", true],
      ["Half the register", ipOk(conc, "managers_for_half") ? String(conc.managers_for_half) : IP_NA,
        "managers hold 50%", false],
    ];
    return {
      title: "Effective number of holders",
      value: String(Math.round(last)),
      delta: pct === null
        ? "over " + values.length + " ingested quarters"
        : (pct > 0 ? "↑ +" : pct < 0 ? "↓ " : "→ ") + Math.abs(pct).toFixed(1) +
          "% over " + values.length + " ingested quarters",
      quarters: labels,
      series: { values: values, axisMax: ax.axisMax, color: "var(--accent)", ticks: ax.ticks },
      measures: measures,
    };
  }

  /* UpSet plot: one bar per exclusive combination, over a dot matrix that says which issuers the
   * combination holds. All constants are the prototype's own (viewBox 720x270). */
  /* UpSet plot: one bar per exclusive combination, over a dot matrix saying which issuers that
   * combination holds. TWO measured layouts, card and lightbox — the prototype does not scale one
   * into the other (its gutter, row pitch and dot radius all change), so both are carried as read.
   * Only the bar step is derived: plot width / count, first centre half a step in. */
  var IP_UPSET_LAYOUT = {
    card:  { W: 720,  H: 270, X0: 132, X1: 710,  YB: 162, YT: 12, ROW0: 184.5, ROWSTEP: 17, R: 4, BANDH: 15, BAND: 128, BANDW: 586 },
    modal: { W: 1316, H: 480, X0: 190, X1: 1306, YB: 312, YT: 12, ROW0: 349,   ROWSTEP: 30, R: 7, BANDH: 28, BAND: 186, BANDW: 1124 },
  };

  function ipUpset(spec, size) {
    var L = IP_UPSET_LAYOUT[size || "card"];
    var max = spec.rows.reduce(function (m, r) { return Math.max(m, r.n); }, 0);
    var step = (L.X1 - L.X0) / spec.rows.length;
    var cx = function (i) { return L.X0 + step / 2 + i * step; };
    var rowY = function (r) { return L.ROW0 + r * L.ROWSTEP; };
    var grid = spec.ticks
      .map(function (label, i) {
        var y = L.YB - (i * (L.YB - L.YT)) / 2;
        return '<line x1="' + L.X0 + '" y1="' + y + '" x2="' + L.X1 + '" y2="' + y +
          '" stroke="var(--rule)" stroke-width="1"></line>' +
          '<text x="' + (L.X0 - 8) + '" y="' + y + '" text-anchor="end" dominant-baseline="middle" class="ip-ax">' +
          P.esc(label) + "</text>";
      })
      .join("");
    // Bands stripe ALTERNATE rows (1 and 3), not every row -- read off both captures.
    var bands = spec.peers
      .map(function (t, r) {
        var y = rowY(r);
        // Every row gets a band; the even ones are transparent. That is the prototype's own DOM,
        // and emitting only the visible two renders identically but counts differently.
        return '<rect x="' + L.BAND + '" y="' + (y - L.BANDH / 2) + '" width="' + L.BANDW +
          '" height="' + L.BANDH + '" fill="' + (r % 2 ? "var(--bg-tint)" : "transparent") +
          '" opacity="0.7"></rect>' +
          '<text x="' + (L.X0 - 12) + '" y="' + y + '" text-anchor="end" dominant-baseline="middle" class="ip-upset-row">' +
          P.esc(t) + "</text>";
      })
      .join("");
    var cols = spec.rows
      .map(function (row, i) {
        var h = (row.n / max) * (L.YB - L.YT);
        var x = cx(i);
        var on = row.members.map(function (m, r) { return m ? rowY(r) : null; })
          .filter(function (v) { return v !== null; });
        var link = on.length > 1
          ? '<line x1="' + x + '" y1="' + on[0] + '" x2="' + x + '" y2="' + on[on.length - 1] +
            '" stroke="var(--ink-soft)" stroke-width="1.5"></line>'
          : "";
        return (
          '<rect x="' + (x - 15) + '" y="' + (L.YB - h) + '" width="30" height="' + h +
          '" fill="var(--accent)" opacity="0.55" rx="2"></rect>' +
          '<text x="' + x + '" y="' + (L.YB - h - 4) + '" text-anchor="middle" class="ip-upset-n">' +
          row.n + "</text>" + link +
          row.members.map(function (m, r) {
            return m
              ? '<circle cx="' + x + '" cy="' + rowY(r) + '" r="' + L.R + '" fill="var(--ink)" opacity="1"></circle>'
              : '<circle cx="' + x + '" cy="' + rowY(r) + '" r="' + L.R + '" fill="var(--border-strong)" opacity="0.5"></circle>';
          }).join("")
        );
      })
      .join("");
    return (
      '<div><svg width="100%" viewBox="0 0 ' + L.W + " " + L.H + '" preserveAspectRatio="xMidYMid meet" ' +
      'style="display:block;max-width:100%" role="img" ' +
      'aria-label="Managers by the exact combination of peer issuers they report">' +
      grid + bands + cols + "</svg></div>"
    );
  }

  // The combination table under the card's UpSet plot (the lightbox shows the plot alone).
  function ipCombTable(spec) {
    return (
      '<div class="ip-comb-head"><span>Combination held</span>' +
      '<span class="ip-r">Managers</span><span class="ip-r">Share</span></div>' +
      spec.rows.map(function (r) {
        return '<div class="ip-comb-row"><span class="ip-comb-label">' + P.esc(r.label) + "</span>" +
          '<span class="ip-comb-n">' + r.n + "</span>" +
          '<span class="ip-comb-share">' + P.esc(r.share) + "</span></div>";
      }).join("")
    );
  }

  function ipTreemap(spec, W, H) {
    var kx = W ? W / spec.vb[0] : 1;
    var ky = H ? H / spec.vb[1] : 1;
    var body = spec.cells
      .map(function (c) {
        var fill = c[4] === null
          ? 'fill="var(--bg-tint)" fill-opacity="1"'
          : 'fill="var(--accent)" fill-opacity="' + c[4] + '"';
        var x = c[0] * kx, y = c[1] * ky;
        var w = c[2] * kx, h = c[3] * ky;
        var rect =
          '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" ' +
          fill + ' stroke="var(--bg-card)" stroke-width="1.5" rx="3"></rect>';
        /* A cell too small to hold its own label gets none. Phase 1 could draw every label
         * because the prototype's cells were sized around "Index manager A"; a real registrant
         * name in a 3%-of-the-register cell spills over its neighbour and the two collide.
         * `data-ip-w` hands the cell's own width to the post-paint fitter, which is the only
         * place the text can actually be measured. */
        if (w < 46 || h < 36) return rect;
        var avail = Math.max(12, w - 14);
        return (
          rect +
          '<text x="' + (x + 7) + '" y="' + (y + 16) + '" class="ip-tm-name" data-ip-w="' + avail +
          '"><title>' + P.esc(c[7] || c[5]) + "</title>" + P.esc(c[5]) + "</text>" +
          '<text x="' + (x + 7) + '" y="' + (y + 31) + '" class="ip-tm-pct">' + P.esc(c[6]) + "</text>"
        );
      })
      .join("");
    return (
      '<div><svg width="100%" viewBox="0 0 ' + (W || spec.vb[0]) + " " + (H || spec.vb[1]) + '" ' +
      'preserveAspectRatio="none" style="display:block" role="img" ' +
      'aria-label="Register by manager, area proportional to share">' + body + "</svg></div>"
    );
  }

  /* --- the derivation panels behind ƒ DERIVED ---
   * Each is the prototype's own copy, read out of the panel it opens. §01's card-head badge is a
   * deliberate exception: in the prototype it flips its label and opens nothing (its equation
   * strip is already on the page), so it is ported as a label-only toggle. Noted rather than
   * "fixed" — inventing a panel would be inventing content. */
  var IP_DERIVATIONS = {
    "01-share": {
      formula: "Sum of 13F-reported shares ÷ cover-page shares outstanding",
      inputs: [
        ["13F-reported shares", "every 13F-HR naming this issuer, current quarter"],
        ["Shares outstanding", "cover page of the most recent 10-Q"],
      ],
      note:
        "Numerator and denominator come from different filings with different as-of dates. " +
        "The 13F register lags the cover page by up to 45 days.",
    },
    /* `02-topten` had a badge from phase 1 but NO entry here, so it rendered and opened
     * nothing; caught by driving §02 (see 5-design-port-log.md run 14). */
    "02-mix": {
      formula: "each filer's own SIC code, grouped into institution types",
      inputs: [
        ["Filer SIC", "the `sic` field on the MANAGER's own EDGAR submissions record"],
        ["Grouping", "SIC -> institution type, normalize/manager_category.py"],
        ["Weight", "category shares / shares held by filers that carry a code"],
      ],
      note:
        "SIC is a REGISTRATION category, not a strategy: an index fund, a stock-picker and a " +
        "quant shop all register as investment advice (6282). It is self-assigned, rarely " +
        "revisited, and describes the filing entity rather than the fund complex behind it. " +
        "Filers with no SIC on file are excluded from the mix, never folded into \u201cother\u201d.",
    },
    "02-topten": {
      formula: "Shares held by the ten largest ingested filers ÷ shares reported by all of them",
      inputs: [
        ["Numerator", "the ten largest positions in this quarter's ranked share vector"],
        ["Denominator", "total 13F common shares reported by every filer we have ingested"],
      ],
      note:
        "Both sides count only the filers we have INGESTED, so this describes our coverage of the " +
        "register, not the register itself. With ten or fewer filers ingested it reads 100% by " +
        "construction. It is not a share of the company — that would need shares outstanding, " +
        "which the 13F register does not carry.",
    },
    "05-turnover": {
      formula: "Managers entering or exiting ÷ managers in the prior quarter",
      inputs: [
        ["Entries and exits", "manager CIKs matched across consecutive 13F-HR filings"],
        ["Prior-quarter base", "manager count in the preceding quarter"],
      ],
      note:
        "A manager falling below the $100M reporting threshold appears as an exit even if it still " +
        "holds the shares.",
    },
    /* ⚠ The prototype's copy here named a fixed window ("13F-HR filings back to 1Q22") — a
     * LITERAL, and a false one: the window is however many quarters we have actually ingested
     * for this issuer, which differs per company. Both lines now follow the data. */
    "05-tenure": {
      formula: "Median consecutive quarters a manager appears in the register",
      inputs: function () {
        return [["Appearance history", "13F-HR filings across " + ipObservedWindow()]];
      },
      note: function () {
        return (
          "Truncated at the start of the observation window: a manager holding since before " +
          ipObservedEarliest() + " is counted from " + ipObservedEarliest() + ", so this is a " +
          "floor on tenure and not a measurement of it."
        );
      },
    },
  };

  function ipBadge(key) {
    // A real <button> now, not the inert <span> phase 1 started with. The line-height is still
    // pinned: the prototype's is a button on the UA's `normal` line box (11px), and a span's is
    // a fraction higher -- a whole device pixel at 2x. See the §01 log.
    return (
      '<button type="button" class="ip-badge"' + (key ? ' data-ip-derive="' + key + '"' : "") +
      ' aria-expanded="false">ƒ derived</button>'
    );
  }

  /* The inline trend panel behind `TREND` and the clickable "Effective holders" stat — the same
   * component in both places, reusing ipAreaChart at the prototype's 632x190. */
  function ipTrendPanel(key) {
    var t = ipTrendSpec(key);
    if (!t) return "";
    return (
      '<div class="ip-trend" data-ip-trend-for="' + key + '" hidden>' +
      '<div class="ip-trend-head">' +
      '<span class="ip-trend-title"><span>' + P.esc(t.title) + "</span></span>" +
      '<span class="ip-trend-val"><span>' + P.esc(t.value) + "</span></span>" +
      '<span class="ip-trend-delta"><span>' + P.esc(t.delta) + "</span></span>" +
      "</div>" +
      ipAreaChart(t.series, t.quarters, 632, 190) +
      '<div class="ip-caption ip-caption--tight"><span>' + P.esc(IP_TREND_NOTE) + "</span></div>" +
      (t.measures ? ipMeasures(t.measures) : "") +
      "</div>"
    );
  }

  function ipMeasures(list) {
    return (
      '<div class="ip-micro ip-measures-label">The measures behind it</div>' +
      '<div class="ip-measures">' +
      list.map(function (m) {
        return (
          '<div class="ip-measure">' +
          '<span class="ip-micro">' + P.esc(m[0]) + "</span>" +
          '<span class="ip-measure-val' + (m[3] ? "" : " ip-measure-val--plain") + '"><span>' +
          P.esc(m[1]) + "</span></span>" +
          '<span class="ip-measure-note">' + P.esc(m[2]) + "</span>" +
          "</div>"
        );
      }).join("") +
      "</div>"
    );
  }

  function ipDerivationPanel(key) {
    var d = IP_DERIVATIONS[key];
    if (!d) return "";
    // `inputs`/`formula`/`note` may be functions, so a panel can describe the window this issuer
    // actually has rather than a fixed one baked in at design time (see "05-tenure").
    var rows = ipText(d.inputs)
      .map(function (r) {
        return (
          '<div class="ip-deriv-row"><span class="ip-deriv-key"><span>' + P.esc(r[0]) + "</span></span>" +
          '<span class="ip-deriv-src"><span>' + P.esc(r[1]) + "</span></span></div>"
        );
      })
      .join("");
    return (
      '<div class="ip-deriv" data-ip-deriv-for="' + key + '" hidden>' +
      '<div class="ip-micro">How this is computed</div>' +
      '<div class="ip-deriv-formula"><span>' + P.esc(ipText(d.formula)) + "</span></div>" +
      rows +
      '<div class="ip-deriv-note"><span>' + P.esc(ipText(d.note)) + "</span></div>" +
      "</div>"
    );
  }

  /* --- the ⤡ Expand lightbox ---
   * The chart is re-authored at the dialog's measured inner width. Authoring at the mount width
   * (rather than letting a 660-unit viewBox stretch) is the same rule as everywhere else in the
   * port: a scaled SVG scales its TEXT too. */
  var IP_LIGHTBOX = {
    "02-register": {
      title: "Register over time",
      note: function () {
        var s = ip02SeriesSpecs();
        return "reporting managers, then shares reported · " +
          (s ? s.quarters.length + " ingested quarters" : "no history ingested");
      },
      render: function (w) {
        var s = ip02SeriesSpecs();
        if (!s) return "";
        return (
          '<div class="ip-micro ip-micro--tight">Reporting managers</div>' +
          ipAreaChart(s.managers, s.labels, w, 260) +
          '<div class="ip-micro ip-micro--tight ip-micro--gap">Shares reported</div>' +
          ipAreaChart(s.shares, s.labels, w, 260)
        );
      },
    },
    "02-panels": {
      title: "Largest managers over time",
      note: "reported shares by quarter, one panel per manager",
      render: function () { return '<div class="ip-panels">' + ip02Panels() + "</div>"; },
    },
    "03-flows": {
      title: "Position changes over time",
      note: "shares added above the axis, reduced below · rule marks the net",
      render: function (w) {
        var f = ip03FlowSpec();
        return f ? ipDivergingBars(f.spec, f.labels, w, 210) : "";
      },
    },
    /* View-aware, like the prototype's: opening Expand while the treemap is showing opens the
     * TREEMAP, under its own title. Verified by driving both states. */
    "03-ranked": {
      title: function () {
        return ipRankedView === "treemap" ? "Who holds what" : "Cumulative share of the register";
      },
      note: function () {
        if (ipRankedView === "treemap") return "area is share of the 13F-reported register";
        // "prior quarter ghosted" is a claim about a line that is only there when the prior
        // quarter is ingested. Saying it either way would describe a series nobody can see.
        var s03 = ip03RankedSpec();
        return s03 && s03.prior
          ? "ranked manager share with the running total, prior quarter ghosted"
          : "ranked manager share with the running total · no prior ingested quarter to ghost";
      },
      render: function (w) {
        var s03 = ip03RankedSpec();
        if (!s03) return "";
        if (ipRankedView !== "treemap") return ipRankedShare(s03, w, 460);
        /* ⚠ DEVIATION, listed: the prototype RE-SQUARIFIES the treemap at the modal's aspect, so
         * its cells are arranged differently there. We scale the card's own layout to the modal
         * viewBox instead — every cell keeps its exact share of the area, but not its position.
         * Reproducing the re-squarified arrangement needs the prototype's squarify variant, which
         * its markup does not expose. */
        // Re-squarified at the DIALOG's aspect, not scaled -- which is what the prototype
        // does, and which we could not do in phase 1 because the layout was a recovered
        // literal rather than a computation. The listed D3 deviation is therefore CLOSED.
        var h = Math.round((w * 658) / 1316);
        return ipTreemap(ip03TreemapSpec(w, h), w, h);
      },
    },
    "06-windows": {
      title: "Windows and expiries ahead",
      note: "every dated window currently on file",
      render: function (w) { return ipTimeline(ip06TimelineSpec(), w, 154); },
    },
    "05-cohorts": {
      title: "Holder persistence by entry cohort",
      note: "share of each entry cohort still reporting N quarters later",
      render: function (w) {
        var g = ip05RetentionSpec();
        return g ? ipCohortGrid(g, w, ip05GridHeight(g)) : "";
      },
    },
    "04-lanes": {
      title: "Beneficial ownership filings",
      note: "one lane per holder above the 5% threshold",
      render: function (w) {
        var owners = ip04Filers();
        var lane = owners && ip04LaneSpec(owners, w);
        return lane ? ipLaneChart(lane, w, ip04LaneHeight(lane)) : "";
      },
    },
    /* View-aware, like "03-ranked": Expand opens whichever view the card is showing. Both titles
     * and notes are the prototype's own, driven out of it. */
    "03-matrix": {
      title: function () {
        return ipOverlapView === "sets" ? "Manager set intersections" : "Peer overlap matrix";
      },
      note: function () {
        return ipOverlapView === "sets"
          ? "exclusive combinations across " + ip03UpsetIssuers()
          : "share of the row issuer's managers that also report the column issuer";
      },
      render: function (w) {
        if (ipOverlapView === "sets") {
          var u = ip03UpsetSpec();
          return u ? ipUpset(u, "modal") : "";
        }
        var o = ip03OverlapSpec();
        return o ? ipPeerMatrix(o.labels, o.cells, Math.round((w * 936) / 1316)) : "";
      },
    },
  };

  function ipText(v) { return typeof v === "function" ? v() : v; }

  /* The prototype's five "↗" links are real anchors to EDGAR full-text search, all to the same
   * target. Ported as real anchors. ⚠ PHASE 2: the query is the prototype's own issuer (AVGO),
   * like every other literal on this page — it becomes the viewed symbol when the data lands. */
  /* Phase 2: the full-text targets follow the VIEWED issuer. The prototype hard-codes its own
   * sample (AVGO / CIK 0527298); a link that sends you to another company's filings is a literal
   * like any other. The CIK-keyed targets below still carry the prototype's CIK — they belong to
   * §04, which has not been plumbed yet. */
  function ipEdgarFts(forms) {
    var sym = window.ClearyFiShell.route().id || "";
    return "https://www.sec.gov/edgar/search/#/q=%22" + encodeURIComponent(sym) +
      "%22&forms=" + encodeURIComponent(forms);
  }
  var IP_EDGAR_13F = "https://www.sec.gov/edgar/search/#/q=%22AVGO%22&forms=13F-HR";
  // §04 links at the registrant's own filings, by CIK -- a different EDGAR endpoint from §01-§03's
  // full-text search. Both are the prototype's own targets.
  var IP_EDGAR_SC13 =
    "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0527298&type=SC%2013&dateb=&owner=include&count=40";
  var IP_EDGAR_8K =
    "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0527298&type=8-K&dateb=&owner=include&count=40";
  var IP_EDGAR_NPX = "https://www.sec.gov/edgar/search/#/q=%22AVGO%22&forms=N-PX";
  var IP_EDGAR_NPORT = "https://www.sec.gov/edgar/search/#/q=%22AVGO%22&forms=N-PORT";
  function ipLink(label, href) {
    return '<a class="ip-card-link" href="' + (href || IP_EDGAR_13F) + '" target="_blank" rel="noopener">' +
      P.esc(label) + "</a>";
  }

  /* An in-app hop to another view of this hub. A real href, so it is keyboard-reachable and a
   * middle-click still opens a tab; the delegated handler turns a plain click into selectTab()
   * rather than a page load. The prototype uses href="#" plus a handler — we can do better
   * without changing what the control does. */
  function ipGoLink(label, cls) {
    var sym = window.ClearyFiShell.route().id || "";
    return (
      '<a class="ip-xref-link' + (cls ? " " + cls : "") + '" href="/company/' +
      encodeURIComponent(sym) + '/insider" data-ip-go="insider">' + P.esc(label) + "</a>"
    );
  }

  function ipChip(key) {
    return '<button type="button" class="ip-chip" data-ip-open="' + key + '">⤡ Expand</button>';
  }

  var ipLastFocus = null;
  var ipRankedView = "cumulative";
  var ipOverlapView = "matrix";

  function ipOpenLightbox(key) {
    var spec = IP_LIGHTBOX[key];
    if (!spec) return;
    ipCloseLightbox();
    ipLastFocus = document.activeElement;
    var back = document.createElement("div");
    back.className = "ip-lb";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-modal", "true");
    back.setAttribute("aria-label", ipText(spec.title));
    back.innerHTML =
      '<div class="ip-lb-dialog" tabindex="-1">' +
      '<div class="ip-lb-head"><div class="ip-lb-id">' +
      '<span class="ip-lb-title"><span>' + P.esc(ipText(spec.title)) + "</span></span>" +
      '<span class="ip-lb-note"><span>' + P.esc(ipText(spec.note)) + "</span></span></div>" +
      '<button type="button" class="ip-lb-close">Close</button></div>' +
      '<div class="ip-lb-body"></div></div>';
    document.body.appendChild(back);
    // Measure first, author second -- the chart must be built AT the width it will occupy.
    var body = back.querySelector(".ip-lb-body");
    var w = Math.round(body.getBoundingClientRect().width) + 2;
    body.innerHTML = spec.render(w);
    // The dialog authors its charts at its OWN measured width, so their labels have never been
    // measured before this point -- fit them here as well as in the page.
    ipFitMatrix();
    var close = back.querySelector(".ip-lb-close");
    close.addEventListener("click", ipCloseLightbox);
    back.addEventListener("mousedown", function (e) { if (e.target === back) ipCloseLightbox(); });
    // Focus the dialog, not the Close button: focus must move into the modal (a11y), but ringing
    // a control the user did not choose would also be the one visible difference from the
    // prototype's own open state.
    back.querySelector(".ip-lb-dialog").focus();
  }

  function ipCloseLightbox() {
    var el = document.querySelector(".ip-lb");
    if (!el) return;
    el.remove();
    if (ipLastFocus && document.contains(ipLastFocus)) ipLastFocus.focus();
    ipLastFocus = null;
  }

  // One delegated listener for all three affordances, bound once per render.
  /* Bind-once, like ipBindExpanders above — the listener is delegated on #view, which outlives
   * every re-render, so re-binding it just stacks duplicate handlers. Phase 2 made that visible:
   * ipPaint() runs twice per load (once before the fetch, once after), so a TOGGLE ran its handler
   * twice and landed back where it started — the derivation badge relabelled itself to "ƒ hide"
   * and immediately back to "ƒ derived", opening nothing. */
  var ipAffordancesBound = false;

  function ipBindAffordances() {
    var view = $("view");
    if (!view || ipAffordancesBound) return;
    ipAffordancesBound = true;
    view.addEventListener("click", function (e) {
      var open = e.target.closest("[data-ip-open]");
      if (open) { ipOpenLightbox(open.getAttribute("data-ip-open")); return; }

      /* An in-app hop, but only for a plain left click — a modified click keeps the anchor's own
       * behaviour so "open in a new tab" still works. */
      var go = e.target.closest("[data-ip-go]");
      if (go && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
        e.preventDefault();
        selectTab(go.getAttribute("data-ip-go"));
        return;
      }

      var badge = e.target.closest("[data-ip-derive]");
      if (badge) {
        var key = badge.getAttribute("data-ip-derive");
        var panel = view.querySelector('[data-ip-deriv-for="' + key + '"]');
        var open2 = badge.getAttribute("aria-expanded") !== "true";
        badge.setAttribute("aria-expanded", open2 ? "true" : "false");
        badge.textContent = open2 ? "ƒ hide" : "ƒ derived";
        if (panel) panel.hidden = !open2;
        return;
      }

      var trend = e.target.closest("[data-ip-trend]");
      if (trend) {
        var tkey = trend.getAttribute("data-ip-trend");
        var tpanel = view.querySelector('[data-ip-trend-for="' + tkey + '"]');
        if (tpanel) {
          var show = tpanel.hidden;
          tpanel.hidden = !show;
          trend.setAttribute("aria-expanded", show ? "true" : "false");
        }
        return;
      }

      var view2 = e.target.closest("[data-ip-view]");
      if (view2 && !view2.classList.contains("ip-toggle--on")) {
        var group = view2.parentNode;
        [].forEach.call(group.querySelectorAll("[data-ip-view]"), function (b) {
          b.classList.toggle("ip-toggle--on", b === view2);
          b.setAttribute("aria-pressed", b === view2 ? "true" : "false");
        });
        ipSwitchChart(group.getAttribute("data-ip-group"), view2.getAttribute("data-ip-view"));
      }
    });
    // The stat is a div with role=button, so it needs its own keyboard activation.
    view.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var t = e.target.closest('[role="button"][data-ip-trend]');
      if (!t) return;
      e.preventDefault();
      t.click();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") ipCloseLightbox();
    });
  }

  // Chart-view toggles. Only "Who holds what" has a second view built; the rest are inert and
  // stay on their first view (declared without a data-ip-view so they cannot be selected).
  function ipSwitchChart(group, view) {
    if (group === "03-overlap") return ipSwitchOverlap(view);
    if (group !== "03-ranked") return;
    var mount = document.querySelector('[data-ip-chart="03-ranked"]');
    var note = document.querySelector('[data-ip-note="03-ranked"]');
    var chip = document.querySelector('[data-ip-open="03-ranked"]');
    if (!mount) return;
    ipRankedView = view;
    var s03 = ip03RankedSpec();
    if (!s03) return;
    if (view === "treemap") {
      mount.innerHTML = ipTreemap(ip03TreemapSpec());
      if (note) note.textContent = ip03TreemapNote();
      ipFitMatrix();   // a freshly-mounted treemap is unmeasured until this runs
    } else {
      mount.innerHTML = ipRankedShare(s03);
      if (note) note.textContent = ip03RankedNote(s03);
    }
    if (chip) chip.hidden = false;   // the prototype keeps it in both views
  }

  function ipSwitchOverlap(view) {
    ipOverlapView = view;
    var mount = document.querySelector('[data-ip-chart="03-overlap"]');
    var note = document.querySelector('[data-ip-note="03-overlap"]');
    if (!mount) return;
    var u = ip03UpsetSpec();
    var o = ip03OverlapSpec();
    if (view === "sets" && u) {
      mount.innerHTML = ipUpset(u) + ipCombTable(u);
      if (note) note.textContent = u.note;
    } else if (o) {
      mount.innerHTML = ipPeerMatrix(o.labels, o.cells);
      if (note) note.textContent = ip03MatrixNote();
      ipFitMatrix();   // a re-rendered matrix is unmeasured until this runs
    }
  }

  /* ---------- §03's four chart builders ----------
   * Same rule as §01/§02: hand-authored SVG on a fixed viewBox, geometry in viewBox units, never
   * measuring the container. Every constant is read off the prototype's own SVG. */

  // Diverging bars: adds above the axis, reductions below, a rule at the net. The largest of the
  // twelve magnitudes lands exactly on the top gridline, which is what sets the scale.
  function ipDivergingBars(spec, labels, W, H) {
    W = W || 660; H = H || 210;
    var X0 = 54, X1 = W - 12, ZERO = 97, TOP = 20.64;
    var span = ZERO - TOP;
    var max = Math.max.apply(null, spec.add.concat(spec.red));
    var slot = (X1 - X0) / labels.length;
    var px = function (v) { return (v / max) * span; };
    var grid = spec.ticks
      .map(function (label, i) {
        var y = TOP + (i * span * 2) / 4;
        var stroke = i === 2 ? "var(--mono-muted)" : "var(--rule)";
        return (
          "<g>" +
          '<line x1="' + X0 + '" y1="' + y + '" x2="' + X1 + '" y2="' + y +
          '" stroke="' + stroke + '" stroke-width="1"></line>' +
          '<text x="46" y="' + y + '" text-anchor="end" dominant-baseline="middle" class="ip-ax">' +
          P.esc(label) + "</text></g>"
        );
      })
      .join("");
    var bw = Math.min(46, slot * 0.47);
    var bars = labels
      .map(function (q, i) {
        var x = X0 + i * slot + (slot - bw) / 2;
        var up = px(spec.add[i]);
        var down = px(spec.red[i]);
        var net = ZERO - px(spec.add[i] - spec.red[i]);
        return (
          '<rect x="' + x + '" y="' + (ZERO - up) + '" width="' + bw + '" height="' + up +
          '" fill="var(--accent)" opacity="0.55"></rect>' +
          '<rect x="' + x + '" y="' + ZERO + '" width="' + bw + '" height="' + down +
          '" fill="var(--ink-soft)" opacity="0.5"></rect>' +
          '<line x1="' + (x - 4) + '" y1="' + net + '" x2="' + (x + bw + 4) + '" y2="' + net +
          '" stroke="var(--ink)" stroke-width="2"></line>' +
          '<text x="' + (x + bw / 2) + '" y="' + (H - 10) + '" text-anchor="middle" class="ip-ax">' +
          P.esc(q) + "</text>"
        );
      })
      .join("");
    return (
      '<div><svg width="100%" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" ' +
      'style="display:block" role="img" aria-label="Shares added and reduced by quarter">' +
      grid + bars + "</svg></div>"
    );
  }

  /* Ranked share + cumulative curve. Two scales in one frame, which is the prototype's own choice:
   * the LINE is on the 0-100% axis, the BARS are scaled so the largest fills half the plot. They
   * are not comparable by height and the caption says so. */
  function ipRankedShare(spec, W, H) {
    W = W || 660; H = H || 250;
    // Generalised from the two widths the prototype renders: card 660x250, modal 1316x460.
    var X0 = 44, X1 = W - 46, YB = H - 58, YT = 18;
    var axis = (YB - YT) / 100;              // px per percentage point, for the cumulative line
    var maxShare = spec.rows.reduce(function (m, r) { return Math.max(m, r.share); }, 0);
    var barScale = (YB - YT) / 2 / maxShare; // largest bar = half the plot height
    var step = (X1 - X0) / spec.rows.length;
    var bw = Math.min(54, step * 0.6);
    var cx = function (i) { return X0 + step / 2 + i * step; };
    var grid = spec.ticks
      .map(function (label, i) {
        var y = YB - i * 25 * axis;
        return (
          '<line x1="' + X0 + '" y1="' + y + '" x2="' + X1 + '" y2="' + y +
          '" stroke="var(--rule)" stroke-width="1"></line>' +
          '<text x="' + (X1 + 8) + '" y="' + y + '" dominant-baseline="middle" class="ip-ax2">' +
          P.esc(label) + "</text>"
        );
      })
      .join("") +
      '<line x1="' + X0 + '" y1="' + YB + '" x2="' + X1 + '" y2="' + YB +
      '" stroke="var(--mono-muted)" stroke-width="1"></line>';
    var bars = spec.rows
      .map(function (r, i) {
        var h = r.share * barScale;
        var y = YB - h;
        return (
          '<rect x="' + (cx(i) - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + h +
          '" fill="' + r.color + '" opacity="0.5" rx="2"></rect>' +
          '<text x="' + cx(i) + '" y="' + (y - 5) + '" text-anchor="middle" class="ip-ax-val">' +
          P.esc(r.pct) + "</text>" +
          '<text x="' + cx(i) + '" y="' + (YB + 14) + '" text-anchor="middle" class="ip-ax">' +
          P.esc(r.label) + "</text>"
        );
      })
      .join("");
    var cum = [];
    spec.rows.reduce(function (t, r, i) {
      cum[i] = t + r.share;
      return cum[i];
    }, 0);
    var path = function (values) {
      return values
        .map(function (v, i) {
          return (i ? "L" : "M") + cx(i) + " " + (YB - v * axis).toFixed(1);
        })
        .join(" ");
    };
    var dots = cum
      .map(function (v, i) {
        return '<circle cx="' + cx(i) + '" cy="' + (YB - v * axis) + '" r="2.8" fill="var(--ink)"></circle>';
      })
      .join("");
    return (
      '<div><svg width="100%" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" ' +
      'style="display:block;max-width:100%" role="img" ' +
      'aria-label="Ten largest managers and the cumulative share of the register">' +
      grid + bars +
      // No prior ingested quarter means NO ghost line -- `spec.prior` is null, not an array of
      // zeros, because a dotted line along the axis would draw a prior register that was never
      // read. (Phase 1's prior series was a literal and always present; phase 2's is not.)
      (spec.prior
        ? '<path d="' + path(spec.prior) +
          '" fill="none" stroke="var(--mono-muted)" stroke-width="1.5" stroke-dasharray="4 3"></path>'
        : "") +
      '<path d="' + path(cum) + '" fill="none" stroke="var(--ink)" stroke-width="2"></path>' +
      dots +
      '<text x="' + X0 + '" y="' + (H - 8) + '" class="ip-ax2">' + P.esc(spec.legend) + "</text>" +
      "</svg></div>"
    );
  }

  /* Lorenz curve. `cum` is the cumulative share of the register at each equal step through the
   * managers, sorted smallest first; the final segment jumps to (100%, 100%) because the last
   * sliver of managers carries most of the register. The dashed diagonal is perfect equality. */
  function ipLorenz(cum) {
    var X0 = 34, X1 = 296, YB = 186, YT = 14, W = 306, H = 220;
    var axisY = (YB - YT) / 100;
    /* PHASE 2: the abscissae are computed, not fitted. The prototype's were recovered from its
     * capture (x0 = 38.24, step = 4.2384 over 61 points, stopping short of X1 with a final jump);
     * the API now returns the curve at EVEN population fractions including both endpoints, so x
     * is simply the fraction of managers and the curve reaches the corner on its own. */
    var n = Math.max(cum.length - 1, 1);
    var x = function (i) { return (X0 + (i / n) * (X1 - X0)).toFixed(1); };
    var ticks = ["0%", "25%", "50%", "75%", "100%"];
    var grid = ticks
      .map(function (label, i) {
        var y = YB - i * 25 * axisY;
        var tx = X0 + (i * 25 * (X1 - X0)) / 100;
        return (
          '<line x1="' + X0 + '" y1="' + y + '" x2="' + X1 + '" y2="' + y +
          '" stroke="var(--rule)" stroke-width="1"></line>' +
          '<text x="28" y="' + y + '" text-anchor="end" dominant-baseline="middle" class="ip-ax">' +
          P.esc(label) + "</text>" +
          '<text x="' + tx + '" y="201" text-anchor="middle" class="ip-ax">' + P.esc(label) + "</text>"
        );
      })
      .join("");
    var pts = cum
      .map(function (v, i) {
        return (i ? "L" : "M") + x(i) + " " + (YB - v * axisY).toFixed(1);
      })
      .join(" ");
    return (
      '<div><svg width="100%" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" ' +
      'style="display:block" role="img" aria-label="Lorenz curve of the register">' +
      grid +
      '<line x1="' + X0 + '" y1="' + YB + '" x2="' + X1 + '" y2="' + YT +
      '" stroke="var(--mono-muted)" stroke-width="1" stroke-dasharray="4 4"></line>' +
      '<path d="' + pts + " L" + X1 + " " + YB + ' Z" fill="var(--accent-wash)" opacity="0.55"></path>' +
      '<path d="' + pts + '" fill="none" stroke="var(--accent)" stroke-width="2"></path>' +
      '<text x="170" y="216" text-anchor="middle" class="ip-ax">share of reporting managers</text>' +
      "</svg></div>"
    );
  }

  /* Peer overlap matrix. Deliberately asymmetric — cell (row, col) is the share of the ROW
   * issuer's managers that also report the COLUMN issuer. The diagonal is inert. */
  function ipPeerMatrix(labels, cells, W) {
    W = W || 370;
    var k = W / 370, O = 59 * k, S = 52 * k, C = 50 * k;
    // `full` (optional) is the untruncated issuer name; it rides on <title> so hover and
    // assistive tech get the whole thing however hard the label has to be trimmed to fit.
    var heads = labels
      .map(function (t, i) {
        var c = O + i * S + C / 2;
        var name = typeof t === "string" ? t : t.label;
        var full = typeof t === "string" ? t : (t.full || t.label);
        var title = "<title>" + P.esc(full) + "</title>";
        return (
          '<text x="' + c + '" y="' + 50 * k + '" text-anchor="middle" class="ip-mx-head ip-mx-head--col" ' +
          'data-ip-w="' + C + '">' + title + P.esc(name) + "</text>" +
          '<text x="' + 50 * k + '" y="' + c + '" text-anchor="end" dominant-baseline="middle" ' +
          'class="ip-mx-head ip-mx-head--row" data-ip-w="' + (50 * k - 4) + '">' + title +
          P.esc(name) + "</text>"
        );
      })
      .join("");
    var body = cells
      .map(function (row, r) {
        return row
          .map(function (cell, c) {
            var x = O + c * S;
            var y = O + r * S;
            if (!cell) {
              return (
                '<rect x="' + x + '" y="' + y + '" width="' + C + '" height="' + C +
                '" rx="2" fill="var(--bg-tint)" fill-opacity="1" stroke="var(--bg-card)" stroke-width="1"></rect>'
              );
            }
            // Above 0.47 the wash is dark enough that the label has to flip to the card colour.
            var onDark = cell[1] >= 0.47;
            return (
              '<rect x="' + x + '" y="' + y + '" width="' + C + '" height="' + C +
              '" rx="2" fill="var(--accent)" fill-opacity="' + cell[1] +
              '" stroke="var(--bg-card)" stroke-width="1"></rect>' +
              '<text x="' + (x + C / 2) + '" y="' + (y + C / 2) +
              '" text-anchor="middle" dominant-baseline="middle" class="ip-mx-val' +
              (onDark ? " ip-mx-val--on" : "") + '">' + cell[0] + "%</text>"
            );
          })
          .join("");
      })
      .join("");
    return (
      '<div><svg width="100%" viewBox="0 0 ' + W + " " + W + '" preserveAspectRatio="xMidYMid meet" ' +
      'style="display:block" role="img" aria-label="Manager overlap with sector peers">' +
      heads + body + "</svg></div>"
    );
  }

  /* ---------- Institutional (13F) ownership — issuer view · NOW THE LEGACY VIEW ----------
   * Reached only at /company/{symbol}/institutional-legacy (V3-P5a attempt 4). Unchanged from
   * master and listed in the rail so the design port can be compared against it. It is NOT the
   * target design. Delete this and everything it calls once the port is accepted. */

  var ACTION_LABEL = { new: "New", added: "Added", reduced: "Reduced", exited: "Exited", unchanged: "Unchanged" };

  // Fetch the 13F quarter-end axis once, memoized on state. Distinct from Fundamentals
  // (prefetched on load): this loads on demand so users who never open the tab don't pay
  // for it. Returns a promise that resolves once state.instPeriods is populated.
  var instAxisPromise = null;
  function ensureInstPeriods() {
    if (state.instPeriods !== null) return Promise.resolve();
    if (instAxisPromise) return instAxisPromise;
    instAxisPromise = P.api("/companies/" + encodeURIComponent(symbol) + "/institutional-periods").then(
      function (res) {
        state.instPeriods = res.periods || [];
        if (state.instPeriods.length && !state.instValue) state.instValue = state.instPeriods[0];
        // The Institutional axis resolves AFTER render() painted the entity bar, so repaint it --
        // otherwise the bar keeps reading "—" while the page's own quarter selector shows a date.
        // "One fact, one source": the two must never state different periods (ROADMAP_APP_V3 §4.4).
        renderEntityBar();
      },
      function (err) { instAxisPromise = null; throw err; } // let a retry re-fetch
    );
    return instAxisPromise;
  }

  function renderInstitutional() {
    $("legend").innerHTML = "";
    $("disclosure").innerHTML = P.disclosure(["institutional_13f", "not_advice"]);
    $("period-control").hidden = true; // revealed once the async axis loads
    $("view").innerHTML = P.states.loading({ title: "Loading 13F quarters" });
    ensureInstPeriods().then(
      function () {
        if (!state.instPeriods.length) {
          $("view").innerHTML = P.states.empty({
            title: "No 13F holdings ingested",
            copy: "No manager's 13F holdings have been ingested for this issuer yet. Read as " +
              "outside coverage, not zero institutional ownership — 13F is a ~45-day-lagged " +
              "quarter-end snapshot, and a quarter is only visible here once ingested.",
          });
          return;
        }
        populatePeriodSelect();
        $("period-control").hidden = false;
        renderInstitutionalData();
      },
      function (err) {
        if (err.status === 401) {
          P.mountNeedsKey($("view"), renderInstitutional);
        } else if (err.status === 404) {
          // _cusips_for_issuer 404s when no CUSIP has resolved to this issuer yet.
          $("view").innerHTML = P.states.empty({
            title: "No resolved CUSIP",
            copy: "This issuer's CUSIP hasn't been resolved from any 13F filing yet, so its " +
              "institutional holders can't be looked up. See the Coverage page for resolution rates.",
          });
        } else {
          $("view").innerHTML = P.states.error({ copy: "Couldn't load 13F quarters (" + (err.status || "network") + ")." });
        }
      }
    );
  }

  function renderInstitutionalData() {
    var period = state.instValue;
    $("view").innerHTML = P.states.loading({ title: "Loading holders for " + quarterLabel(period) });
    var base = "/companies/" + encodeURIComponent(symbol);
    Promise.all([
      P.api(base + "/institutional-holders?period=" + encodeURIComponent(period)),
      P.api(base + "/institutional-activity?period=" + encodeURIComponent(period)),
    ]).then(
      function (res) {
        var holders = res[0].holders || [];
        var activity = res[1].activity || [];
        var fromPeriod = res[1].from_period;
        var caveats = res[0].caveats || [];
        $("view").innerHTML = institutionalView(period, holders, activity, caveats);
        // Plot builders return DOM nodes (not HTML strings) -- mount them into the placeholder
        // divs institutionalView()'s markup just landed, same pattern as manager.js's render().
        // Mounting is lazy per sub-group: a group's charts render the first time it's shown, so
        // the initial paint is cheap and no chart measures its width inside a hidden container.
        var mounted = {};
        function mountGroup(group) {
          if (mounted[group]) return;
          mounted[group] = true;
          if (group === "holders") {
            mountHoldersTable(holders);
            mountHoldingsSeries();
            mountConviction(period);
            mountCoHolding(period);
          } else if (group === "geography") {
            mountHolderGeography(period);
          } else if (group === "activity") {
            mountActivityTrend(period);
            mountInstActivityTable(period, fromPeriod, activity);
          }
        }
        function showInstGroup(group) {
          state.instGroup = group;
          document.querySelectorAll("#view .inst-group").forEach(function (el) {
            el.hidden = el.getAttribute("data-inst-group") !== group;
          });
          setOn("#inst-subtabs button", document.querySelector('#inst-subtabs button[data-inst-group="' + group + '"]'));
          mountGroup(group);
        }
        var strip = $("inst-subtabs");
        if (strip) strip.addEventListener("click", function (e) {
          var btn = e.target.closest("button[data-inst-group]");
          if (btn) showInstGroup(btn.getAttribute("data-inst-group"));
        });
        // Preserve the sub-view across period changes (re-render keeps you on the same question).
        showInstGroup(state.instGroup || "holders");
      },
      function (err) {
        if (err.status === 401) P.mountNeedsKey($("view"), renderInstitutional);
        else $("view").innerHTML = P.states.error({ copy: "Couldn't load 13F holdings (" + (err.status || "network") + ")." });
      }
    );
  }

  // Phase 5 polish (caption dedup, holdings side): this precision framing used to repeat under
  // both the stat tiles and the composition chart on this tab -- it now renders exactly ONCE,
  // here, at the top of the tab's content. Chart/tile captions below keep only what's specific
  // to them (STYLE_GUIDE §6).
  function institutionalStandingCaveat() {
    return (
      '<p class="stmt-caption" style="margin:0 0 18px">Share of reported 13F value held by ' +
      "filers who reported holding this issuer — not the company’s shares outstanding, and not " +
      "all institutional owners, only ingested 13F filers.</p>"
    );
  }

  // Institutional sub-views (dashboard review #3): the tab's eight panels were one long scroll,
  // so they're grouped into three questions -- who holds it (Holders), where they're based
  // (Geography), and what they're doing (Activity) -- behind a sub-strip like the Statements
  // tab's Income/Balance/Cash Flow. Charts mount lazily per group (see renderInstitutionalData),
  // both to keep the initial view cheap and so a chart never measures its width while hidden.
  var INST_GROUPS = [
    ["holders", "Holders"],
    ["geography", "Geography"],
    ["activity", "Activity"],
  ];

  function instSubtabs() {
    var active = state.instGroup || "holders";
    return (
      '<div class="segmented inst-subtabs" id="inst-subtabs" role="tablist" aria-label="Institutional views">' +
      INST_GROUPS.map(function (g) {
        return '<button data-inst-group="' + g[0] + '"' + (g[0] === active ? ' class="on"' : "") +
          ' role="tab">' + P.esc(g[1]) + "</button>";
      }).join("") +
      "</div>"
    );
  }

  function institutionalView(period, holders, activity, caveats) {
    // Groups render up front (all hidden); showGroup() reveals the active one after innerHTML, so
    // there's no flash of all three and JS stays the single source of which view is visible.
    // Within a group the charts sit in a 2-up grid (.inst-chart-grid); each chart card carries its
    // own title, so the redundant per-section headings are dropped and the sub-tab label leads.
    return (
      instSubtabs() +
      institutionalStandingCaveat() +
      // Holders: snapshot tiles up top, the ownership charts 2-up, the detail table at the bottom.
      '<section class="inst-group" data-inst-group="holders" hidden>' +
        holdersSummary(period, holders) +
        // shares-trend + the co-holding network pair up top; the treemap fills the full-width odd
        // row better than the (sparse) network would, and sits right above the holders table it
        // visualizes. (The odd last cell spans both columns -- see .inst-chart-grid CSS.)
        '<div class="inst-chart-grid">' +
          '<div class="inst-cell"><div id="holdings-series-mount"></div></div>' +
          '<div class="inst-cell"><div id="coholding-mount"></div></div>' +
          '<div class="inst-cell"><div id="conviction-mount"></div></div>' +
        "</div>" +
        (holders.length ? holdersTable() : "") +
      "</section>" +
      // Geography: single full-width choropleth.
      '<section class="inst-group" data-inst-group="geography" hidden>' +
        holderGeographySection() +
      "</section>" +
      // Activity: the New/Added/Reduced summary cards up top, the two trend charts 2-up, then the
      // filer-by-filer detail table at the bottom.
      '<section class="inst-group" data-inst-group="activity" hidden>' +
        activitySummaryBlock(activity) +
        '<h3 class="metric-group-title" style="margin-top:26px">How holders have been building or trimming this position</h3>' +
        '<div class="inst-chart-grid">' +
          '<div class="inst-cell"><div id="activity-mix-mount"></div></div>' +
          '<div class="inst-cell"><div id="activity-flow-mount"></div></div>' +
        "</div>" +
        activityTableBlock(activity) +
      "</section>" +
      caveatsBlock(caveats)
    );
  }

  // Holders sub-view blocks. The snapshot tiles head the view; the paginated detail table sits at
  // the bottom (below the ownership charts). The charts themselves are mounted into placeholder
  // divs post-innerHTML (STYLE_GUIDE §6), each self-fetching so a failure degrades to an empty
  // note without breaking the tab -- same pattern as mountHolderGeography.
  function holdersSummary(period, holders) {
    var head = '<h3 class="metric-group-title">Holders as of ' + P.esc(quarterLabel(period)) + "</h3>";
    if (!holders.length) {
      return head + P.states.empty({
        title: "No holders for this quarter",
        copy: "No manager reported holding this issuer for the selected quarter.",
      });
    }
    // Concentration tiles reframed for an issuer (holder count / top-1/5/10 share of REPORTED 13F
    // value across ingested filers, never % of shares outstanding). The precision framing renders
    // once above via institutionalStandingCaveat() -- not repeated here (Phase 5 caption dedup).
    return head + '<div class="composition-block">' + P.statTiles(holders, {
      rowLabel: "Holders reported",
      totalNote: "Reported 13F value across all ingested filers for this issuer",
    }) + "</div>";
  }

  function holdersTable() {
    // Paginated (ClearyFi.paginatedTable) -- a widely-held issuer can have hundreds of filers.
    return (
      '<h3 class="metric-group-title" style="margin-top:26px">All reported holders</h3>' +
      '<div id="holders-table-mount"></div>'
    );
  }

  // Activity sub-view blocks. The New/Added/Reduced summary cards lead the view; the filer-by-filer
  // detail table follows the trend charts. Both need a single-quarter diff, so when no prior quarter
  // is ingested the summary block shows the honest empty state and the table block is omitted (the
  // trend charts between them are period-independent and still render).
  function activitySummaryBlock(activity) {
    var head = '<h3 class="metric-group-title">Derived activity vs. prior quarter</h3>';
    if (!activity.length) {
      return head + P.states.empty({
        title: "No prior-quarter comparison",
        copy: "No prior 13F quarter is ingested to diff against — the earliest ingested quarter " +
          "has nothing to compare to. This is a DERIVED view, never reported trades.",
      });
    }
    return head + P.activitySummaryTiles(activity);
  }

  function activityTableBlock(activity) {
    if (!activity.length) return ""; // the empty state already rendered in activitySummaryBlock
    return (
      '<h3 class="metric-group-title" style="margin-top:26px">Filer-by-filer changes</h3>' +
      '<div id="inst-activity-table-mount"></div>'
    );
  }

  function holderGeographySection() {
    return (
      '<h3 class="metric-group-title" style="margin-top:26px">Where the filers holding this company are based</h3>' +
      '<div id="holder-geography-mount"></div>'
    );
  }

  function managerLink(cik, name) {
    return '<a href="/manager/' + encodeURIComponent(cik) + '">' + P.esc(name || "CIK " + cik) + "</a>";
  }

  // Renders the paginated holders detail table (10 rows/page; the tiles/chart above always
  // summarize ALL holders, so paging never changes what the numbers mean).
  function mountHoldersTable(holders) {
    var mount = $("holders-table-mount");
    if (!mount) return;
    mount.appendChild(P.paginatedTable({
      headHtml: '<tr><th>Manager</th><th>CUSIP</th><th class="amt">Shares</th><th class="amt">Value</th></tr>',
      rows: holders,
      pageSize: 10,
      renderRow: function (h) {
        return (
          "<tr>" +
          '<td class="stmt-label">' + managerLink(h.manager_cik, h.manager_name) + "</td>" +
          '<td class="stmt-tag">' + P.esc(h.cusip || "—") + "</td>" +
          '<td class="amt stmt-amt">' + P.esc(h.shares != null ? P.fmt.shares(h.shares) : "—") + "</td>" +
          '<td class="amt stmt-amt">' + P.esc(h.value != null ? P.fmt.usd(h.value) : "—") + "</td>" +
          "</tr>"
        );
      },
      captionHtml: "Reported 13F positions across all ingested managers · quarter-end " +
        "snapshot, not real-time · long positions in 13(f) securities only.",
    }));
  }

  // Accumulation chart: reported shares per filer stacked over the recent ingested quarters
  // (issuer axis, GET /institutional-holdings-series). Period-independent (spans quarters), so
  // it doesn't take the selected `period`. Skips silently on failure (enhancement, not
  // critical path); shows an honest "not enough quarters" note when there's <2 quarters to
  // chart rather than a misleading one-bar "trend".
  function mountHoldingsSeries() {
    var mount = $("holdings-series-mount");
    if (!mount) return;
    P.api("/companies/" + encodeURIComponent(symbol) + "/institutional-holdings-series").then(
      function (res) {
        var node = P.holdingsSeriesChart(res.series || [], res.periods || [], {
          width: P.measuredWidth(mount, 720),
        });
        if (node) {
          mount.appendChild(node);
        } else {
          mount.innerHTML = P.states.empty({
            title: "Not enough quarters to chart",
            copy: "Fewer than two 13F quarters are ingested for this issuer, so there's no " +
              "multi-quarter accumulation to show yet. Read as coverage, not zero ownership.",
          });
        }
      },
      function () { /* enhancement chart -- skip on failure, never break the tab */ }
    );
  }

  // Derived holder-activity trend (GET /institutional-activity-series). Two views with DIFFERENT
  // time behavior:
  //   * the mix stacked bar spans the 6 most recent quarters (period-INDEPENDENT -- it's a trend);
  //   * the inflows-vs-outflows flow reflects the SELECTED quarter `period` -- it picks the
  //     transition whose to_period matches, so it moves with the tab's period selector like the
  //     rest of the view (re-mounted by renderInstitutionalData on every change).
  // We request quarters=12 (the endpoint max) so a selected quarter older than the 6 shown in the
  // mix is still covered for the flow; the mix slices to its 6 newest. A selected quarter with no
  // matching transition (its comparable prior quarter isn't available) gets an honest empty state
  // for THAT quarter -- never another quarter's numbers under the selected label. Both DERIVED,
  // never re-computed client-side. Skips silently on failure.
  function mountActivityTrend(period) {
    var mixMount = $("activity-mix-mount");
    var flowMount = $("activity-flow-mount");
    if (!mixMount && !flowMount) return;
    P.api("/companies/" + encodeURIComponent(symbol) + "/institutional-activity-series?quarters=12").then(
      function (res) {
        var transitions = res.transitions || [];
        if (mixMount) {
          // 6 newest quarters -- period-independent trend (unchanged behavior).
          var mix = P.activityMixChart(transitions.slice(-6), { width: P.measuredWidth(mixMount, 720) });
          if (mix) {
            mixMount.appendChild(mix);
          } else {
            mixMount.innerHTML = P.states.empty({
              title: "Not enough comparable quarters",
              copy: "Fewer than two 13F quarters with a comparable prior quarter are ingested for " +
                "this issuer, so there's no quarter-over-quarter activity to chart yet. Read as " +
                "coverage, not zero activity. This is a DERIVED view, never reported trades.",
            });
          }
        }
        if (flowMount) {
          // The flow reflects the SELECTED quarter: pick the transition whose to_period matches.
          var tx = null;
          for (var i = 0; i < transitions.length; i++) {
            if (transitions[i].to_period === period) { tx = transitions[i]; break; }
          }
          var flow = tx ? P.activityFlowChart(tx, { width: P.measuredWidth(flowMount, 640) }) : null;
          if (flow) {
            flowMount.appendChild(flow);
          } else {
            // No transition for the selected quarter (its comparable prior quarter isn't ingested,
            // it's the earliest quarter, or it's outside the fetched window). Honest empty state
            // for THIS quarter -- never fall back to a different quarter's flow (that would be a
            // wrong-quarter number under the selected label).
            flowMount.innerHTML = P.states.empty({
              title: "No derived share flow for " + P.esc(quarterLabel(period)),
              copy: "No comparable prior quarter is available to diff against for the selected " +
                "quarter, so there's no inflow/outflow to derive. Pick a quarter whose prior " +
                "quarter is also ingested. This is a DERIVED view, never reported trades.",
            });
          }
        }
      },
      function () { /* enhancement chart -- skip on failure, never break the tab */ }
    );
  }

  // Choropleth of where the filers holding this issuer are HEADQUARTERED (GET
  // /institutional-holder-geography for the selected quarter). Skips silently on failure.
  function mountHolderGeography(period) {
    var mount = $("holder-geography-mount");
    if (!mount) return;
    P.api(
      "/companies/" + encodeURIComponent(symbol) +
      "/institutional-holder-geography?period=" + encodeURIComponent(period)
    ).then(
      function (res) {
        var node = P.holderGeographyChart(res, { width: P.measuredWidth(mount, 720) });
        if (node) {
          mount.appendChild(node);
        } else {
          mount.innerHTML = P.states.empty({
            title: "No holder locations for this quarter",
            copy: "No manager reported holding this issuer for the selected quarter, so there " +
              "are no filer locations to map.",
          });
        }
      },
      function () { /* enhancement chart -- skip on failure, never break the tab */ }
    );
  }

  // Institutional-holder treemap: each filer sized by its share of the pool of ingested 13F shares
  // (GET /institutional-conviction for the selected quarter). Skips silently on failure; the chart
  // renders its own empty state when there's no usable share count to size.
  function mountConviction(period) {
    var mount = $("conviction-mount");
    if (!mount) return;
    P.api(
      "/companies/" + encodeURIComponent(symbol) +
      "/institutional-conviction?period=" + encodeURIComponent(period)
    ).then(
      function (res) {
        var node = P.convictionHeatmap(res, { width: P.measuredWidth(mount, 720) });
        if (node) {
          mount.appendChild(node);
        } else {
          mount.innerHTML = P.states.empty({
            title: "No holders to measure for this quarter",
            copy: "No manager reported holding this issuer for the selected quarter, so there's " +
              "nothing to size. An empty result is not a confirmed zero.",
          });
        }
      },
      function () { /* enhancement chart -- skip on failure, never break the tab */ }
    );
  }

  // Co-holding network: the company's holders linked by overlap in their OTHER holdings (GET
  // /institutional-co-holding for the selected quarter). Skips silently on failure; the chart
  // renders its own thin/empty state when there are too few holders or no linking overlap.
  function mountCoHolding(period) {
    var mount = $("coholding-mount");
    if (!mount) return;
    P.api(
      "/companies/" + encodeURIComponent(symbol) +
      "/institutional-co-holding?period=" + encodeURIComponent(period)
    ).then(
      function (res) {
        var node = P.coHoldingNetwork(res, { width: P.measuredWidth(mount, 720) });
        if (node) {
          mount.appendChild(node);
        } else {
          mount.innerHTML = P.states.empty({
            title: "No holders to graph for this quarter",
            copy: "No manager reported holding this issuer for the selected quarter, so there's " +
              "no network to draw. An empty result is not a confirmed zero.",
          });
        }
      },
      function () { /* enhancement chart -- skip on failure, never break the tab */ }
    );
  }

  // Renders the paginated derived-activity detail table (10 rows/page; the tiles/charts above
  // always summarize ALL rows, so paging never changes what the numbers mean).
  function mountInstActivityTable(period, fromPeriod, activity) {
    var mount = $("inst-activity-table-mount");
    if (!mount) return;
    mount.appendChild(P.paginatedTable({
      headHtml: '<tr><th>Manager</th><th>Action</th>' +
        '<th class="amt">Shares before</th><th class="amt">Shares after</th><th class="amt">Change</th></tr>',
      rows: activity,
      pageSize: 10,
      renderRow: function (a) {
        var before = a.shares_before != null ? P.fmt.shares(a.shares_before) : "—";
        var after = a.shares_after != null ? P.fmt.shares(a.shares_after) : "—";
        var chg = a.shares_change != null ? signedShares(a.shares_change) : "—";
        return (
          "<tr>" +
          '<td class="stmt-label">' + managerLink(a.manager_cik, a.manager_name) + "</td>" +
          "<td>" + P.esc(ACTION_LABEL[a.action] || a.action || "—") + "</td>" +
          '<td class="amt stmt-amt">' + P.esc(before) + "</td>" +
          '<td class="amt stmt-amt">' + P.esc(after) + "</td>" +
          '<td class="amt stmt-amt">' + P.esc(chg) + "</td>" +
          "</tr>"
        );
      },
      captionHtml: "DERIVED by diffing " + P.esc(quarterLabel(fromPeriod)) + " → " +
        P.esc(quarterLabel(period)) + " 13F snapshots — never reported trades. Positions that " +
        "opened/closed appear as New/Exited.",
    }));
  }

  // Signed share delta with the U+2212 minus glyph (§2), e.g. "+2.0M" / "−1.5M".
  function signedShares(v) {
    if (v === 0) return "0";
    return (v > 0 ? "+" : "−") + P.fmt.shares(Math.abs(v));
  }

  function caveatsBlock(caveats) {
    if (!caveats || !caveats.length) return "";
    var items = caveats.map(function (c) { return "<li>" + P.esc(c) + "</li>"; }).join("");
    return '<details class="disclosure" style="margin-top:18px"><summary>13F caveats (always apply)</summary><ul>' + items + "</ul></details>";
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
            recovery: [{ label: "Data coverage ↗", href: "/coverage" }],
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

  // ---------- Overview (view: hub) ----------
  //
  // The prototype's company Overview (prototype.dc.html:799-1577), Track-1 half only:
  //   01  Identity & structure  — registrant profile + the EX-21 placeholder
  //   02  Financial detail      — condensed statements + the Financial snapshot
  //
  // Prototype sections 03-08 (Segments & geography, Capital & ownership, Governance, Accounting
  // quality, Obligations, Disclosure change) are NOT rendered: every one needs a source we do not
  // ingest (per-company ASC 280 segments, DEF 14A, the auditor's report, Item 3, Item 1A).
  // Omitted rather than placeheld — operator decision, 2026-07-27.
  //
  // Overview answers "how is this company doing NOW"; Financial history answers "how has this
  // moved over time". That is the split, and it is why the metric grid lives here and the
  // series explorer lives there.

  function renderOverview() {
    var sel = currentSel();
    if (!sel) { $("view").innerHTML = P.states.empty({ title: "No period" }); return; }
    $("legend").innerHTML = "";
    $("disclosure").innerHTML = P.disclosure(["financials_floor", "not_advice"]);
    $("view").innerHTML =
      viewHeader("", "everything filed by this registrant") +
      '<div id="ovIdentity"></div>' +
      '<div id="ovDetail">' + P.states.loading({ title: "Computing metrics" }) + "</div>";
    renderIdentity();
    renderFinancialDetail(sel);
  }

  // The prototype puts the section's source note on the SAME line as its number and title
  // (:835-839), not on a line of its own.
  function secHead(n, title, source) {
    return '<div class="section-head co-section-head"><span class="n">' + P.esc(n) + "</span>" +
      "<h2>" + P.esc(title) + "</h2>" +
      '<span class="sec-source">' + P.esc(source) + "</span></div>";
  }

  // ----- 01 Identity & structure -----

  function renderIdentity() {
    var host = $("ovIdentity");
    if (!host) return;
    host.innerHTML =
      secHead("01", "Identity & structure", "cover page · EX-21 · 10-K Item 1") +
      '<div class="ov-identity">' + businessPlaceholder() + registrantProfile() + "</div>" +
      subsidiariesPlaceholder();
  }

  // Only fields that actually resolve are rendered. The prototype lists ten; five of them
  // (NAICS, state of incorporation, headquarters, auditor, employees) are TEXT facts, and the
  // SEC's companyfacts API carries numeric facts only — they are structurally absent from our
  // store, not merely un-ingested. A cell that can never resolve is chrome noise rather than
  // honesty, so it is omitted (the same call V3-P2 made for the entity bar's "Peer set" cell).
  /* The prototype's "What the company does · 10-K Item 1" card. Item 1 (Business) is free-text
   * narrative, which is Track 2 — CLAUDE.md guardrail 1 says flag it, don't build it. So the card
   * ships with the prototype's shape and an honest empty state: no summary, no segment mix, not a
   * single invented word. Turning this real means an LLM summarization path and a recurring
   * per-token cost, which is a deliberate operator decision, not something this phase grants. */
  function businessPlaceholder() {
    return (
      '<div class="ov-card biz-card">' +
      '<div class="ov-card-eyebrow">What the company does · 10-K Item 1</div>' +
      '<div class="biz-empty"><span class="ex21-dash">—</span>' +
      "<p>Not available. Item 1 (Business) is narrative text in the 10-K, not tagged XBRL, so " +
      "the description of what this registrant does sits outside the structured data this " +
      "product covers.</p></div>" +
      '<a class="ov-link" href="' + edgarUrl("10-K") + '" target="_blank" rel="noopener">' +
      "Read Item 1 on EDGAR ↗</a>" +
      "</div>"
    );
  }

  function registrantProfile() {
    var rows = [];
    var prof = state.profile || {};
    if (prof.name) rows.push(["Registrant", prof.name]);
    rows.push(["CIK", String(state.cik)]);
    if (prof.sic) {
      rows.push(["SIC", prof.sic + (prof.sic_description ? " · " + prof.sic_description : "")]);
    }
    var fy = latestFyPeriod();
    if (fy && fy.period_end) rows.push(["Fiscal year-end", monthDay(fy.period_end)]);
    var first = firstPeriodOnRecord();
    if (first) rows.push(["Earliest period on file", first]);
    if (state.stmtPeriods.length) rows.push(["Periods on file", String(state.stmtPeriods.length)]);

    var cells = rows.map(function (r) {
      return '<div class="rp-cell"><span class="rp-k">' + P.esc(r[0]) + "</span>" +
        '<span class="rp-v">' + P.esc(r[1]) + "</span></div>";
    }).join("");
    return (
      '<div class="ov-card rp-card">' +
      '<div class="ov-card-eyebrow">Registrant profile</div>' +
      '<div class="rp-grid">' + cells + "</div>" +
      '<p class="ov-note">Identity as EDGAR assigns it. Fields the SEC publishes only as filing ' +
      "text — NAICS, state of incorporation, headquarters, auditor, employee count — are not in " +
      "the structured XBRL feed we ingest, so they are left out rather than guessed at.</p>" +
      "</div>"
    );
  }

  // EX-21 is a filed EXHIBIT, not tagged XBRL — Track 2 (CLAUDE.md guardrail 1: flag, don't
  // build). The layout is real, the column heads are real, and there is not one fabricated
  // entity, jurisdiction or percentage. Replicate the shape, never invent a cell.
  function subsidiariesPlaceholder() {
    return (
      '<div class="ov-card ex21">' +
      '<div class="ex21-top">' +
      '<span class="ov-card-title">Consolidated subsidiaries</span>' +
      '<span class="ex21-meta">EX-21 · <span class="na">—</span> entities · ' +
      '<span class="na">—</span> organized outside the U.S.</span>' +
      '<a class="ov-link" href="' + edgarUrl("EX-21") + '" target="_blank" rel="noopener">Read EX-21 ↗</a>' +
      "</div>" +
      '<div class="ex21-head"><span>Entity</span><span>Jurisdiction</span><span>Ownership</span></div>' +
      '<div class="ex21-empty">' +
      '<span class="ex21-dash">—</span>' +
      "<p>Not available. EX-21 lists every consolidated subsidiary and its jurisdiction of " +
      "organization, but it is filed as a prose exhibit to the 10-K rather than as tagged XBRL — " +
      "so it sits outside the structured data this product covers.</p>" +
      "</div>" +
      '<div class="ov-note">Entity count and jurisdiction mix are shown as — because they would ' +
      "have to be read out of the exhibit's text. We do not parse filing prose, so we do not " +
      "estimate them.</div>" +
      "</div>"
    );
  }

  function edgarUrl(type) {
    var cik = String(state.cik || "").padStart(10, "0");
    return "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + cik +
      "&type=" + encodeURIComponent(type === "EX-21" ? "10-K" : type) + "&dateb=&owner=include&count=40";
  }

  function latestFyPeriod() {
    return state.fundPeriods.filter(function (p) { return p.period === "FY"; })[0] || null;
  }

  function firstPeriodOnRecord() {
    if (!state.stmtPeriods.length) return null;
    var oldest = state.stmtPeriods[state.stmtPeriods.length - 1];
    return oldest.period === "FY" ? "FY" + oldest.year : "FY" + oldest.year + " " + oldest.period;
  }

  function monthDay(iso) {
    var d = String(iso).split("-");
    if (d.length < 3) return iso;
    return MONTHS[parseInt(d[1], 10) - 1] + " " + parseInt(d[2], 10);
  }

  // ----- 02 Financial detail -----

  function renderFinancialDetail(sel) {
    var base = "/companies/" + encodeURIComponent(symbol);
    var metricsP = P.api(base + "/metrics?year=" + sel.year + "&period=" + sel.period);
    // Peer ranks and the condensed statement are supplementary — neither may break the section.
    var peersP = P.api(base + "/peers?year=" + sel.year + "&period=" + sel.period)
      .catch(function () { return { peers: [] }; });
    var condensedP = P.api(base + "/statements/" + state.statement + "/condensed?period=FY&limit=4")
      .catch(function () { return null; });

    Promise.all([metricsP, peersP, condensedP]).then(
      function (res) {
        var by = {};
        (res[0].metrics || []).forEach(function (m) { by[m.metric] = m; });
        var peerBy = {};
        (res[1].peers || []).forEach(function (p) { peerBy[p.metric] = p; });

        var rendered = []; // groups that produced tiles -> section-nav targets
        var groups = CATEGORIES.map(function (cat) {
          var tiles = cat[1]
            .filter(function (k) { return by[k]; })
            .map(function (k) { return P.metricTile(by[k], { formula: FORMULAS[k], peer: peerBy[k] }); })
            .join("");
          if (!tiles) return "";
          var id = sectionId(cat[0]);
          rendered.push({ id: id, label: cat[0] });
          return '<section class="snap-group" id="' + id + '">' +
            '<h4 class="snap-group-title">' + P.esc(cat[0]) + "</h4>" +
            '<div class="mtile-grid">' + tiles + "</div></section>";
        }).join("");

        // The condensed response names the filing behind its newest column -- that is the
        // "Last filed" the entity bar wants, and it means Overview no longer has to render a
        // drained cell just because it never loads a full statement.
        var cols = (res[2] && res[2].columns) || [];
        var newest = cols[cols.length - 1];
        if (newest && newest.form && newest.filed) {
          state.lastFiled = newest.form + " · " + newest.filed;
          renderEntityBar();
        }
        $("ovDetail").innerHTML =
          secHead("02", "Financial detail", "statements & footnotes · XBRL facts as filed") +
          condensedCard(res[2]) +
          snapshotCard(groups, sel, res[1]);

        buildSectionNav(rendered);
        wireSnapshot();
        wireCondensed();
      },
      function (err) { $("ovDetail").innerHTML = metricsError(err); }
    );
  }

  // The prototype's condensed statements card (:888-962): statement tabs across the most recent
  // four fiscal years. A summary read — the exhaustive table with the source-tag audit column
  // lives in Financial history. Balance sheet uses the same table shape as the other two
  // (operator decision 2026-07-27: match the prototype; where balanceMatrix belongs is a later
  // call), so all three tabs are one uniform, comparable grid.
  function condensedCard(cond) {
    var tabs = CONDENSED_TABS.map(function (t) {
      return '<button type="button" class="pbtn' + (state.statement === t[0] ? " on" : "") +
        '" data-cond="' + t[0] + '">' + P.esc(t[1]) + "</button>";
    }).join("");

    var body;
    if (!cond || !cond.columns || !cond.columns.length || !cond.rows.length) {
      body = '<p class="ov-empty">No condensed ' + P.esc(CONDENSED_LABEL[state.statement] || "") +
        " on record for the last four fiscal years.</p>";
    } else {
      var head = '<div class="cond-row cond-head"><span class="cond-label"></span>' +
        cond.columns.map(function (c) {
          return '<span class="cond-amt">FY' + P.esc(String(c.fiscal_year)) + "</span>";
        }).join("") + "</div>";
      state.condRows = {};
      cond.rows.forEach(function (r) { state.condRows[r.canonical_concept] = r; });
      state.condCols = cond.columns;
      var rows = cond.rows.map(function (r) {
        var emph = EMPH[r.canonical_concept] || "line";
        var kind = unitKind(r.unit);
        var cells = r.values.map(function (v) {
          // null means the period did not report the line. N/A — never 0. This is the
          // whole reason the endpoint returns null instead of a default.
          return v === null || v === undefined
            ? '<span class="cond-amt na">N/A</span>'
            : '<span class="cond-amt">' + P.esc(fmtAbbrev(v, kind)) + "</span>";
        }).join("");
        // A row with two or more reported values opens a small trend of that line. It charts the
        // SAME values already shown in the row -- no extra request, and the chart cannot disagree
        // with the numbers above it (ROADMAP_APP_V3 §4.4: one fact, one source).
        var numeric = r.values.filter(function (v) { return v !== null && v !== undefined; });
        var chartable = numeric.length >= 2;
        return '<div class="cond-line">' +
          '<div class="cond-row emph-' + emph + (chartable ? " chartable" : "") + '"' +
          (chartable ? ' role="button" tabindex="0" aria-expanded="false" data-cond-row="' +
            P.esc(r.canonical_concept) + '"' : "") + ">" +
          '<span class="cond-label">' + P.esc(r.label) +
          (chartable ? '<span class="cond-cue" aria-hidden="true">▾</span>' : "") +
          (r.unit_mixed ? '<span class="cond-flag" title="This line\'s unit changed across periods — compare with care">unit varies</span>' : "") +
          "</span>" + cells + "</div>" +
          '<div class="cond-drawer" hidden></div></div>';
      }).join("");
      body = '<div class="cond-table">' + head + rows + "</div>";
    }

    var src = cond && cond.columns && cond.columns.length
      ? "Fiscal years " + cond.columns[0].fiscal_year + "–" +
        cond.columns[cond.columns.length - 1].fiscal_year + " · as-restated · " +
        cond.columns.length + (cond.columns.length === 1 ? " period" : " periods")
      : "as-restated";

    return (
      '<div class="ov-card cond-card">' +
      '<div class="cond-top"><span class="ov-card-title">Condensed statements</span>' +
      '<div class="cond-tabs">' + tabs + "</div></div>" +
      body +
      '<p class="ov-note">' + P.esc(src) + ". N/A marks a line the filer did not report that " +
      "period — it is not a zero. Full line detail, source tags and the raw JSON are in " +
      '<a class="ov-inline-link" href="#" data-goto="history">Financial history</a>.</p>' +
      "</div>"
    );
  }

  var CONDENSED_TABS = [["income", "Income"], ["balance", "Balance"], ["cashflow", "Cash flow"]];
  var CONDENSED_LABEL = { income: "income statement", balance: "balance sheet", cashflow: "cash-flow statement" };

  // The prototype's Financial snapshot (:964-1010), carrying every metric we compute rather
  // than the prototype's eight. This is the merge the operator asked for: the old 5-tile "At a
  // glance" band and the ~28-card metric grid are ONE surface now.
  function snapshotCard(groups, sel, peers) {
    if (!groups) return '<div class="ov-card"><p class="ov-empty">No metric resolved for this period.</p></div>';
    var quarterly = sel.period !== "FY"
      ? '<p class="ov-note">Quarterly view — flow metrics are trailing-twelve-month (TTM) through ' +
        P.esc(sel.period) + "; EPS shows N/M, because it is not summable across quarters.</p>"
      : "";
    return (
      '<div class="ov-card snap-card">' +
      '<div class="cond-top"><span class="ov-card-title">Financial snapshot</span>' +
      '<span class="ov-card-sub">XBRL facts · click a tile for the arithmetic</span></div>' +
      '<p class="ov-note">Movement arrows show direction across the quarters on file, not ' +
      "favorability — for several of these a higher value is not “better”.</p>" +
      quarterly +
      peerNote(peers) +
      groups +
      "</div>"
    );
  }

  // Tile interactions: open the drawer in place, lazily draw that metric's own history into it,
  // and hand a metric off to Financial history.
  function wireSnapshot() {
    document.querySelectorAll("#view [data-tile-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tile = btn.closest(".mtile");
        var drawer = tile.querySelector(".mtile-drawer");
        var open = !drawer.hidden;
        drawer.hidden = open;
        btn.setAttribute("aria-expanded", String(!open));
        tile.classList.toggle("open", !open);
        if (!open) loadTileHistory(tile, "annual");
      });
    });
    // Range control inside the drawer (the prototype's range tabs, minus the basis tabs D4 forbids).
    document.querySelectorAll("#view [data-tile-range]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tile = btn.closest(".mtile");
        tile.querySelectorAll("[data-tile-range]").forEach(function (b) {
          b.classList.toggle("on", b === btn);
        });
        var host = tile.querySelector(".mtile-hist");
        host.removeAttribute("data-loaded");
        loadTileHistory(tile, btn.getAttribute("data-tile-range"));
      });
    });
    document.querySelectorAll("#view [data-compare]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        toggleTray(a.getAttribute("data-compare"));
      });
    });
    syncTrayButtons();
    applyPendingTrend(); // ?trend=<metric> opens that tile's drawer, once
  }

  // One request, on open — the same lazy contract the old per-card Trend panel had.
  function loadTileHistory(tile, frequency) {
    var host = tile.querySelector(".mtile-hist");
    if (!host || host.getAttribute("data-loaded")) return;
    host.setAttribute("data-loaded", "1");
    var metric = host.getAttribute("data-hist");
    host.innerHTML = P.states.loading({ title: "Loading history", note: "" });
    fetchHistory(metric, frequency || "annual").then(
      function (hist) {
        // Measure BEFORE emptying: `.mtile-hist:empty` is display:none, so a cleared host has
        // zero width and the chart would silently fall back to its default instead of the
        // container width (§12.6 — never author a chart below its container).
        var w = P.measuredWidth(host, 420);
        host.innerHTML = "";
        if (!hist.points || !hist.points.length) {
          host.innerHTML = P.states.empty({ title: "No history", copy: "No annual history is on record for this metric yet." });
          return;
        }
        host.appendChild(P.metricSeriesChart([seriesFor(hist)], { width: w, height: 200 }));
      },
      function (err) { host.innerHTML = P.states.error({ copy: "Couldn't load history (" + (err.status || "network") + ")." }); }
    );
  }

  function wireCondensed() {
    // Row -> its own trend, drawn from the values already on screen.
    document.querySelectorAll("#view [data-cond-row]").forEach(function (row) {
      var open = function () {
        var concept = row.getAttribute("data-cond-row");
        var drawer = row.parentNode.querySelector(".cond-drawer");
        var show = drawer.hidden;
        drawer.hidden = !show;
        row.setAttribute("aria-expanded", String(show));
        row.classList.toggle("open", show);
        if (!show || drawer.getAttribute("data-drawn")) return;
        drawer.setAttribute("data-drawn", "1");
        var r = (state.condRows || {})[concept];
        var cols = state.condCols || [];
        if (!r) return;
        var w = P.measuredWidth(drawer, 520);
        drawer.appendChild(P.metricSeriesChart([{
          metric: concept, label: r.label, unit: r.unit,
          points: r.values.map(function (v, i) {
            return { period_end: cols[i] ? "FY" + cols[i].fiscal_year : String(i), value: v, status: v === null ? "na" : "ok" };
          }),
        }], { width: w, height: 190 }));
      };
      row.addEventListener("click", open);
      row.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    });
    document.querySelectorAll("#view [data-cond]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.statement = btn.getAttribute("data-cond");
        render();
      });
    });
    var goto = document.querySelector('#view [data-goto="history"]');
    if (goto) {
      goto.addEventListener("click", function (e) { e.preventDefault(); selectTab("history"); });
    }
  }

  // A one-line honesty note shown above the tiles when any peer bar is present.
  function peerNote(peers) {
    if (!peers || !peers.peers || !peers.peers.length) return "";
    return '<p class="ov-note">Peer bars show each metric\'s percentile within its ' +
      P.esc(peers.peer_basis || "SIC") + " peer group — position among peers, not a " +
      "good/bad verdict. Ranks exclude N/A peers.</p>";
  }

  // ---------- "On this page" section rail (dashboard prototype) ----------
  //
  // Turns the otherwise-empty lower half of the app sidebar into a scroll-tracking table of
  // contents for the fundamentals grid: one link per rendered category, with the section nearest
  // the top of the viewport highlighted. Injected into the shared shell sidebar (owned by
  // script.js) rather than a second on-page rail, and torn down on any tab switch.
  var sectionObserver = null;

  function clearSectionNav() {
    if (sectionObserver) { sectionObserver.disconnect(); sectionObserver = null; }
    var nav = document.getElementById("sectionNav");
    if (nav) nav.remove();
  }

  /* The prototype puts this in the VIEW RAIL, under a "Sections" label, as numbered entries with
   * a left-edge marker on the active one (:247-257) -- not as a plain link list in the sidebar.
   * Same scroll-spy behaviour, the prototype's placement and treatment. */
  function buildSectionNav(cats) {
    clearSectionNav();
    var rail = document.getElementById("viewRail");
    if (!rail || !cats.length) return;
    var nav = document.createElement("nav");
    nav.id = "sectionNav";
    nav.className = "rail-sections";
    nav.setAttribute("aria-label", "Sections");
    nav.innerHTML =
      '<div class="rail-sections-label">Sections</div>' +
      cats.map(function (c, i) {
        return '<a class="rail-section-link" href="#' + c.id + '">' +
          '<span class="rs-n">' + String(i + 1).padStart(2, "0") + "</span>" +
          '<span class="rs-l">' + P.esc(c.label) + "</span></a>";
      }).join("");
    rail.appendChild(nav);

    var links = {};
    nav.querySelectorAll(".rail-section-link").forEach(function (a) {
      links[a.getAttribute("href").slice(1)] = a;
    });
    var visible = {};
    sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting; });
      var order = cats.map(function (c) { return c.id; });
      var active = order.filter(function (id) { return visible[id]; })[0] || null;
      order.forEach(function (id) {
        if (links[id]) links[id].classList.toggle("active", id === active);
      });
    }, { rootMargin: "-96px 0px -55% 0px", threshold: 0 });
    cats.forEach(function (c) {
      var el = document.getElementById(c.id);
      if (el) sectionObserver.observe(el);
    });
  }

  // `?trend=<metric>` opens that metric's snapshot drawer on Overview — the successor to the
  // pre-V3-P4 behaviour, which opened the same metric's Trend panel on the Fundamentals card.
  // Kept working because the URL is shareable and the e2e drives it.
  var pendingTrend = new URLSearchParams(location.search).get("trend");

  function applyPendingTrend() {
    if (!pendingTrend) return;
    var tile = document.querySelector('#view .mtile[data-metric="' + pendingTrend + '"]');
    pendingTrend = null; // one-shot: don't re-open when the period changes
    var btn = tile && tile.querySelector("[data-tile-toggle]");
    if (btn) {
      btn.click();
      tile.scrollIntoView({ block: "center" });
    }
  }

  /* ---------- right rail: Filing timeline (prototype :3902-3922) ----------
   *
   * The prototype's rail lists every form as filed, with type filters. The DATA is Track-1 and
   * genuinely close -- `sec/insider.py:_recent_filings()` already walks the exact submissions-JSON
   * arrays it needs (form / accessionNumber / filingDate), just filtered to Forms 3/4/5 -- but
   * nothing serves it yet, and storing that metadata is **V3-P3's** declared job.
   *
   * So this ships as an honest placeholder (operator, 2026-07-28): the prototype's structure, the
   * real filter vocabulary rendered planned-and-inert, and NOT ONE fabricated filing, date, form
   * or count. It becomes real when V3-P3 lands, without moving.
   *
   * P4 owns Overview and Financial history only, so the rail is scoped to those two views; P5
   * decides what its own views carry. */
  var TIMELINE_FILTERS = ["All", "10-K", "10-Q", "8-K", "Ownership"];

  function renderRightRail() {
    var host = $("rightRail");
    if (!host) return;
    // The ported Institutional view carries the prototype's own rail frame (V3-P5a); Overview and
    // Financial history keep P4's. Every other view still has none.
    if (state.tab === "institutional") {
      host.hidden = false;
      host.innerHTML = ipRightRail();
      return;
    }
    var onP4View = state.tab === "hub" || state.tab === "history";
    host.hidden = !onP4View;
    if (!onP4View) { host.innerHTML = ""; return; }
    host.innerHTML =
      '<div class="rr-card">' +
      '<div class="rr-title">Filing timeline</div>' +
      '<div class="rr-sub">every form as filed</div>' +
      '<div class="rr-filters">' +
      TIMELINE_FILTERS.map(function (f) {
        // Planned-and-inert, exactly as the shell treats a nav subject it cannot yet route to:
        // no handler, drained, and self-explaining on hover (STYLE_GUIDE §10).
        return '<span class="rr-filter" title="Filing timeline filters arrive with the filing-index ' +
          'ingest">' + P.esc(f) + "</span>";
      }).join("") +
      "</div>" +
      '<div class="rr-empty"><span class="ex21-dash">—</span>' +
      "<p>Not available yet. The full filing index — every form this registrant has filed, with " +
      "its date — is not part of the structured data we store today.</p></div>" +
      '<a class="ov-link" href="' + edgarUrl("") + '" target="_blank" rel="noopener">' +
      "All filings on EDGAR ↗</a>" +
      '<div class="rr-note">Until then, each statement names the filing it came from, and the ' +
      "entity bar shows the most recent one.</div>" +
      "</div>";
  }

  /* ---------- the sticky comparison tray (prototype :1653-1677) ----------
   *
   * "+ chart" on a tile does NOT navigate: it drops the metric into a tray pinned to the bottom of
   * the viewport, so you can assemble a comparison while still reading the page you are on. The
   * tray persists across Overview <-> Financial history (it lives outside #view), and hands its
   * selection to the Financial history explorer on request.
   *
   * Same ceiling as the explorer: three metrics. A fourth is refused visibly, never silently. */
  var TRAY_MAX = 3;

  function toggleTray(metric) {
    var at = state.tray.indexOf(metric);
    if (at !== -1) state.tray.splice(at, 1);
    else if (state.tray.length >= TRAY_MAX) { flashTrayLimit(); return; }
    else { state.tray.push(metric); state.trayHidden = false; }
    renderTray();
    syncTrayButtons();
  }

  // Keep every "+ chart" button in step with the tray, including tiles rendered later.
  function syncTrayButtons() {
    document.querySelectorAll("[data-compare]").forEach(function (b) {
      var on = state.tray.indexOf(b.getAttribute("data-compare")) !== -1;
      b.textContent = on ? "✓ in chart" : "+ chart";
      b.classList.toggle("on", on);
    });
  }

  function renderTray() {
    var host = $("compareTray");
    if (!host) return;
    if (!state.tray.length) {
      host.hidden = true;
      host.innerHTML = "";
      document.body.classList.remove("tray-open", "tray-collapsed-mode");
      return;
    }
    host.hidden = false;
    document.body.classList.add("tray-open");
    document.body.classList.toggle("tray-collapsed-mode", !!state.trayHidden);
    if (state.trayHidden) {
      host.innerHTML =
        '<div class="tray tray-collapsed"><span class="tray-title">Comparison chart</span>' +
        '<span class="tray-count">' + state.tray.length +
        (state.tray.length === 1 ? " metric" : " metrics") + "</span>" +
        '<button type="button" class="pbtn" data-tray-show>Show</button>' +
        '<button type="button" class="pbtn" data-tray-clear>Clear</button></div>';
      wireTray();
      return;
    }
    var colors = ["var(--accent)", "var(--ink)", "var(--positive)"];
    var chips = state.tray.map(function (m, i) {
      return '<span class="tray-chip"><span class="hist-swatch" style="background:' + colors[i] + '"></span>' +
        P.esc(METRIC_LABELS[m] || m) +
        '<button type="button" class="hist-remove" data-tray-remove="' + P.esc(m) +
        '" aria-label="Remove ' + P.esc(METRIC_LABELS[m] || m) + ' from the comparison">×</button></span>';
    }).join("");
    host.innerHTML =
      '<div class="tray">' +
      '<div class="tray-head"><div class="tray-left">' +
      '<span class="tray-title">Comparison chart</span>' +
      '<a href="#" class="ov-inline-link" data-tray-open>Open in Financial history →</a>' +
      chips + "</div>" +
      '<div class="tray-actions">' +
      '<button type="button" class="pbtn" data-tray-clear>Clear</button>' +
      '<button type="button" class="pbtn" data-tray-hide>Hide</button></div></div>' +
      '<div id="trayChart"></div>' +
      '<div class="tray-foot"><span>' +
      (state.tray.length < TRAY_MAX
        ? "Add up to three metrics."
        : "Three metrics is the maximum — remove one to add another.") +
      "</span></div></div>";
    wireTray();
    drawTrayChart();
  }

  function drawTrayChart() {
    var slot = $("trayChart");
    if (!slot) return;
    Promise.all(state.tray.map(function (m) {
      return fetchHistory(m, "annual").catch(function () { return null; });
    })).then(function (res) {
      if (!$("trayChart")) return; // tray closed while loading
      var series = res.filter(Boolean).map(function (h) { return seriesFor(h); })
        .filter(function (s) { return s.points.length; });
      var w = P.measuredWidth(slot, 640);
      slot.innerHTML = "";
      slot.appendChild(P.metricSeriesChart(series, { width: w, height: 220 }));
    });
  }

  function wireTray() {
    var host = $("compareTray");
    host.querySelectorAll("[data-tray-remove]").forEach(function (b) {
      b.addEventListener("click", function () { toggleTray(b.getAttribute("data-tray-remove")); });
    });
    var clear = host.querySelector("[data-tray-clear]");
    if (clear) clear.addEventListener("click", function () {
      state.tray = []; state.trayHidden = false; renderTray(); syncTrayButtons();
    });
    var hide = host.querySelector("[data-tray-hide]");
    if (hide) hide.addEventListener("click", function () { state.trayHidden = true; renderTray(); });
    var show = host.querySelector("[data-tray-show]");
    if (show) show.addEventListener("click", function () { state.trayHidden = false; renderTray(); });
    var open = host.querySelector("[data-tray-open]");
    if (open) open.addEventListener("click", function (e) {
      e.preventDefault();
      state.histMetrics = state.tray.slice(0, TRAY_MAX);
      // selectTab() early-returns when the view is already active, so the hand-off would be a
      // no-op when the tray is used FROM Financial history -- re-render the explorer directly.
      if (state.tab === "history") renderExplorer();
      else selectTab("history");
    });
  }

  function flashTrayLimit() {
    var foot = document.querySelector("#compareTray .tray-foot");
    if (!foot) return;
    foot.classList.add("limit");
    setTimeout(function () { foot.classList.remove("limit"); }, 1200);
  }

  // ---------- metric history (shared by the Overview drawer and Financial history) ----------

  // Cached per (metric, frequency): the explorer re-renders on every range/selection change and
  // must not re-fetch a series it already holds.
  function fetchHistory(metric, frequency) {
    var slot = state.histCache[metric] || (state.histCache[metric] = {});
    if (slot[frequency]) return Promise.resolve(slot[frequency]);
    return P.api(
      "/companies/" + encodeURIComponent(symbol) + "/metrics/" +
      encodeURIComponent(metric) + "/history?frequency=" + frequency
    ).then(function (hist) {
      slot[frequency] = hist;
      return hist;
    });
  }

  // MetricHistory -> the shape metricSeriesChart consumes. Points keep their nulls: a period
  // the metric could not be computed for stays a gap, so the line breaks there.
  function seriesFor(hist, limit) {
    var pts = (hist.points || []).map(function (p) {
      return {
        period_end: p.period_end || (p.fiscal_period === "FY" ? "FY" + p.fiscal_year : "FY" + p.fiscal_year + " " + p.fiscal_period),
        value: p.value,
        status: p.status,
      };
    });
    if (limit && pts.length > limit) pts = pts.slice(pts.length - limit);
    return { metric: hist.metric, label: hist.label, unit: hist.unit, points: pts };
  }

  function metricsError(err) {
    var sel = currentSel();
    var lbl = sel ? "FY" + sel.year + (sel.period === "FY" ? "" : " " + sel.period) : "";
    if (err.status === 404) {
      return P.states.notFound({ copy: "No metrics for " + symbol.toUpperCase() + " " + lbl + ". Try another period." });
    }
    return P.states.error({ copy: "Couldn't compute metrics (" + (err.status || "network") + ")." });
  }

  // ---------- Financial history (view: history) ----------
  //
  // The prototype's Financial history (prototype.dc.html:1578-1679): "full XBRL fact history ·
  // any metric, any period on file". Two stacked surfaces —
  //   * the metric EXPLORER: grouped picker, overlay up to three, range tabs, gap-breaking line;
  //   * the full STATEMENT surface, moved here intact from the old Statements tab (tables, the
  //     source-tag audit column, the raw-JSON toggle, the segments spike, the viz charts).
  //
  // The prototype's two basis tabs (As filed / As restated) are deliberately NOT ported.
  // metrics.py emits `as-restated` unconditionally and no code path produces
  // `as-originally-reported`, so a toggle would return identical data on both settings —
  // fabricated precision, which STYLE_GUIDE §8.1 forbids outright. The basis is STATED instead.

  var HIST_RANGES = [["8q", "8 quarters"], ["20q", "20 quarters"], ["5y", "5 fiscal years"]];
  var HIST_MAX = 3;

  function renderHistory() {
    $("legend").innerHTML = "";
    $("disclosure").innerHTML = P.disclosure(["financials_floor", "not_advice"]);
    $("view").innerHTML =
      viewHeader("Financial history", "full XBRL fact history · any metric, any period on file") +
      '<div id="histExplorer">' + P.states.loading({ title: "Loading metric history" }) + "</div>" +
      '<div id="histStatements"></div>';
    renderExplorer();
    renderStatements($("histStatements"));
  }

  function renderExplorer() {
    var host = $("histExplorer");
    if (!host) return;
    var freq = state.histRange === "5y" ? "annual" : "quarterly";
    var wanted = state.histMetrics.slice(0, HIST_MAX);

    Promise.all(wanted.map(function (m) {
      return fetchHistory(m, freq).catch(function () { return null; });
    })).then(function (results) {
      var limit = state.histRange === "8q" ? 8 : state.histRange === "20q" ? 20 : 5;
      var series = results.filter(Boolean).map(function (h) { return seriesFor(h, limit); })
        .filter(function (s) { return s.points.length; });

      host.innerHTML =
        '<div class="ov-card hist-picker">' + metricPicker() + "</div>" +
        '<div class="ov-card hist-chart-card">' +
        '<div class="hist-top">' +
        '<span class="ov-card-title">' + P.esc(explorerTitle(series)) + "</span>" +
        '<div class="hist-controls">' + legendChips(series) + rangeTabs() + "</div>" +
        "</div>" +
        '<div id="histChart"></div>' +
        '<div class="hist-foot">' + explorerFooter(series) + "</div>" +
        "</div>";

      // Author at the container's measured width — the Views rail makes this column ~854px at a
      // 1280px viewport, so a default width would overflow or clip labels (§12.6). Measured
      // before the clear, same reason as the drawer above.
      var slot = $("histChart");
      var w = P.measuredWidth(slot, 700);
      slot.innerHTML = "";
      slot.appendChild(P.metricSeriesChart(series, { width: w, height: 330 }));
      wireExplorer();
    });
  }

  function explorerTitle(series) {
    if (!series.length) return "No metric selected";
    return series.length === 1 ? series[0].label : series.length + " metrics compared";
  }

  function metricPicker() {
    var groups = CATEGORIES.map(function (cat) {
      var chips = cat[1].map(function (k) {
        var on = state.histMetrics.indexOf(k) !== -1;
        return '<button type="button" class="hist-chip' + (on ? " on" : "") + '" data-hist-metric="' + k + '">' +
          P.esc(METRIC_LABELS[k] || k) + "</button>";
      }).join("");
      return '<div class="hist-group"><span class="hist-group-name">' + P.esc(cat[0]) + "</span>" + chips + "</div>";
    }).join("");
    return '<div class="hist-picker-head">Metrics <span>— click to overlay, up to three</span></div>' +
      '<div class="hist-groups">' + groups + "</div>";
  }

  function legendChips(series) {
    if (!series.length) return "";
    var colors = ["var(--accent)", "var(--ink)", "var(--positive)"];
    return '<div class="hist-legend">' + series.map(function (s, i) {
      var present = s.points.filter(function (p) { return p.value !== null && p.value !== undefined; });
      var latest = present.length ? P.fmtMetric({ metric: s.metric, unit: s.unit, value: present[present.length - 1].value, status: "ok" }).text : "—";
      return '<span class="hist-legend-item"><span class="hist-swatch" style="background:' + colors[i] + '"></span>' +
        P.esc(s.label) + '<span class="hist-latest">' + P.esc(latest) + "</span>" +
        '<button type="button" class="hist-remove" data-hist-remove="' + P.esc(s.metric) + '" ' +
        'aria-label="Remove ' + P.esc(s.label) + ' from the chart">×</button></span>';
    }).join("") + "</div>";
  }

  function rangeTabs() {
    return '<div class="segmented hist-range">' + HIST_RANGES.map(function (r) {
      return '<button type="button" data-hist-range="' + r[0] + '"' +
        (state.histRange === r[0] ? ' class="on"' : "") + ">" + P.esc(r[1]) + "</button>";
    }).join("") + "</div>";
  }

  function explorerFooter(series) {
    // The disclosed-period count is the chart card's own caption -- not repeated here.
    var bits = [];
    // The D4 resolution, stated rather than offered as a control (STYLE_GUIDE §8.1).
    bits.push("Basis: as-restated — every period reflects the latest filed figure for it. " +
      "Prior filed values are retained but are not yet servable as a separate as-filed series.");
    bits.push(state.histMetrics.length < HIST_MAX
      ? "Select up to three metrics to overlay."
      : "Three metrics is the maximum — deselect one to add another.");
    return bits.map(function (b) { return "<span>" + P.esc(b) + "</span>"; }).join("");
  }

  function wireExplorer() {
    document.querySelectorAll("#view [data-hist-metric]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var m = btn.getAttribute("data-hist-metric");
        var at = state.histMetrics.indexOf(m);
        if (at !== -1) {
          // Never leave the chart with nothing selected — the last one stays put.
          if (state.histMetrics.length > 1) state.histMetrics.splice(at, 1);
        } else if (state.histMetrics.length >= HIST_MAX) {
          flashPickerLimit();
          return;
        } else {
          state.histMetrics.push(m);
        }
        renderExplorer();
      });
    });
    document.querySelectorAll("#view [data-hist-remove]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var m = btn.getAttribute("data-hist-remove");
        var at = state.histMetrics.indexOf(m);
        if (at !== -1 && state.histMetrics.length > 1) {
          state.histMetrics.splice(at, 1);
          renderExplorer();
        }
      });
    });
    document.querySelectorAll("#view [data-hist-range]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.histRange = btn.getAttribute("data-hist-range");
        renderExplorer();
      });
    });
  }

  // Refusing a fourth metric has to be visible, not silent — the reader clicked something.
  function flashPickerLimit() {
    var foot = document.querySelector("#view .hist-foot");
    if (!foot) return;
    foot.classList.add("limit");
    setTimeout(function () { foot.classList.remove("limit"); }, 1200);
  }

  // Where the statement surface draws. Set by renderStatements() each time; the spike
  // renderers below are reached from inside it and share the same target.
  var stmtHost = null;

  // The full statement surface. Moved wholesale from the old Statements tab into Financial
  // history (V3-P4) -- same tables, same source-tag audit column, same raw-JSON toggle, same
  // segments spike, same viz charts. `host` is where it draws; everything else is untouched.
  function renderStatements(host) {
    stmtHost = host || $("view");
    if (state.statement === "segments") { renderSpikeSegments(); return; }
    var sel = currentSel();
    if (!sel) {
      stmtHost.innerHTML = P.states.empty({ title: "No period", copy: "No filed period on record to show a statement for." });
      return;
    }
    var periodLabel = sel.period === "FY" ? "FY" + sel.year : "FY" + sel.year + " " + sel.period;
    stmtHost.innerHTML = stmtControls() + P.states.loading({ title: "Loading statement" });
    wireStmtControls();
    P.api("/companies/" + encodeURIComponent(symbol) + "/statements/" + state.statement + "?year=" + sel.year + "&period=" + encodeURIComponent(sel.period)).then(
      function (stmt) {
        if (!stmt.lines || !stmt.lines.length) {
          stmtHost.innerHTML = stmtControls() + P.states.empty({ title: "No mapped lines", copy: "A filing is on record for this period, but no fields mapped to this statement." });
          wireStmtControls();
          return;
        }
        state.lastFiled = stmt.form && stmt.filed ? stmt.form + " · " + stmt.filed : state.lastFiled;
        stmtHost.innerHTML = stmtControls() + statementView(stmt, periodLabel);
        wireStmtControls();
        wireStatementView(stmt);
        renderEntityBar(); // "Last filed" is only knowable once a statement has loaded
      },
      function (err) {
        if (err.status === 404) {
          stmtHost.innerHTML = stmtControls() + P.states.notFound({ copy: "No " + state.statement + " statement for " + periodLabel + ". Try another period." });
          wireStmtControls();
        } else {
          stmtHost.innerHTML = stmtControls() + P.states.error({});
          wireStmtControls();
        }
      }
    );
  }

  /* The statement card's own header controls -- statement type and period. They used to sit in a
   * shared bar above the whole page; the prototype puts a card's controls in that card's header
   * (:889-895), and a page-level bar acting on one card read as leftover chrome. */
  var STMT_TABS = [["income", "Income"], ["balance", "Balance"], ["cashflow", "Cash flow"],
                   ["segments", "Segments · spike"]];

  function stmtControls() {
    var tabs = STMT_TABS.map(function (t) {
      return '<button type="button" class="pbtn' + (state.statement === t[0] ? " on" : "") +
        '" data-stmt-tab="' + t[0] + '">' + P.esc(t[1]) + "</button>";
    }).join("");
    var opts = state.stmtPeriods.map(function (p) {
      var label = p.period === "FY" ? "FY " + p.year : "FY" + p.year + " " + p.period;
      var v = p.year + "|" + p.period;
      return '<option value="' + v + '"' + (v === state.stmtValue ? " selected" : "") + ">" +
        P.esc(label) + "</option>";
    }).join("");
    var periodSel = state.statement === "segments" || !opts
      ? ""
      : '<label class="stmt-period"><span>Period</span>' +
        '<select id="stmt-period-select">' + opts + "</select></label>";
    return '<div class="stmt-controls"><div class="stmt-tabs">' + tabs + "</div>" + periodSel + "</div>";
  }

  function wireStmtControls() {
    document.querySelectorAll("[data-stmt-tab]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.statement = b.getAttribute("data-stmt-tab");
        renderStatements(stmtHost);
      });
    });
    var sel = document.getElementById("stmt-period-select");
    if (sel) {
      sel.addEventListener("change", function () {
        state.stmtValue = sel.value;
        renderStatements(stmtHost);
      });
    }
  }

  // ---------- statement view (the retired /explorer's presentation) ----------

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

  var UNIT_LABEL = { pershare: "per sh", count: "shares", ratio: "ratio", usd: "USD" };

  function statementView(stmt, periodLabel) {
    // Duration statements (income/cashflow) show start → end; instant ones (balance
    // sheet) have no period_start — show just the as-of date, not a dangling "— →".
    var range = stmt.period_start
      ? stmt.period_start + " → " + (stmt.period_end || "—")
      : stmt.period_end || "—";
    var metaGrid = [
      ["FORM", stmt.form],
      ["FILED", stmt.filed],
      [stmt.period_start ? "PERIOD" : "AS OF", range],
      ["ACCESSION", stmt.accession],
    ].map(function (pair) {
      return '<div><span class="field-label">' + pair[0] + "</span>" + P.esc(pair[1] || "—") + "</div>";
    }).join("");

    // The equity-section break: the first equity concept this filer actually reports.
    var equityStart = null;
    if (state.statement === "balance") {
      for (var i = 0; i < stmt.lines.length && !equityStart; i++) {
        if (EQUITY_CONCEPTS.indexOf(stmt.lines[i].canonical_concept) !== -1) {
          equityStart = stmt.lines[i].canonical_concept;
        }
      }
    }

    var normalRows = "", auditRows = "";
    stmt.lines.forEach(function (l) {
      var emph = EMPH[l.canonical_concept] || "line";
      var kind = unitKind(l.unit);
      var hasVal = l.value !== null && l.value !== undefined;
      var abbrev = hasVal ? fmtAbbrev(l.value, kind) : "—";
      var isBreak = BREAK_BEFORE[l.canonical_concept] || l.canonical_concept === equityStart;
      var rowCls = "emph-" + emph + (isBreak ? " row-break" : "");

      normalRows +=
        '<div class="data-row ' + rowCls + '">' +
        '<span class="row-label">' + P.esc(l.label) + "</span>" +
        '<span class="row-value-wrap">' +
        '<button type="button" class="row-value"' +
        (hasVal
          ? ' data-abbrev="' + P.esc(abbrev) + '" data-exact="' + P.esc(fmtExact(l.value, kind)) + '"'
          : "") +
        ">" + P.esc(abbrev) + "</button>" +
        '<span class="row-unit">' + UNIT_LABEL[kind] + "</span>" +
        "</span></div>";

      auditRows +=
        '<div class="audit-row ' + rowCls + '">' +
        '<span class="audit-tag-group">' +
        (l.is_extension
          ? '<span class="badge badge-ext">EXT</span>'
          : '<span class="badge badge-gaap">US-GAAP</span>') +
        "<code>" + P.esc(l.source_tag) + "</code></span>" +
        '<span class="audit-arrow">→</span>' +
        '<span class="audit-result-group">' +
        '<span class="row-label">' + P.esc(l.label) + "</span>" +
        '<span class="row-value">' + P.esc(abbrev) + "</span>" +
        "</span></div>";
    });

    var tableInner = (
      '<div class="filing-header">' +
      "<div>" +
      '<div class="filing-title">' + P.esc(STMT_TITLES[state.statement]) + "</div>" +
      '<div class="filing-sub">' + P.esc(periodLabel) + " · as-restated · CIK " + P.esc(String(stmt.cik)) + "</div>" +
      "</div>" +
      '<div class="filing-meta-grid">' + metaGrid + "</div>" +
      "</div>" +
      '<div class="stmt-bar">' +
      '<div class="row-count">' + stmt.lines.length + " concepts mapped</div>" +
      '<div class="stmt-bar-actions">' +
      '<span class="stmt-bar-caption">raw XBRL tag → clean field</span>' +
      '<button class="toggle-btn" id="stmt-json-btn" type="button" aria-pressed="false">{ } View raw JSON</button>' +
      '<button class="toggle-btn" id="stmt-audit-btn" type="button" aria-pressed="false">○ Show your work</button>' +
      "</div></div>" +
      '<div class="table-card">' +
      '<div id="stmt-normal">' +
      '<div class="table-head"><span>Concept</span><span>Value · click to reveal exact</span></div>' +
      normalRows +
      "</div>" +
      '<div id="stmt-audit" hidden>' +
      '<div class="table-head table-head-audit"><span>Raw XBRL tag (SEC)</span><span></span><span>ClearyFi schema</span></div>' +
      auditRows +
      "</div></div>" +
      '<pre class="raw-json" id="stmt-json" hidden></pre>' +
      '<p class="caveat">Sourced from SEC EDGAR filings — subject to normal filing lag (a 10-K posts ~45–90 days after period end). Values are raw USD unless noted; display figures are rounded, exact reported figures on click.</p>'
    );

    // The income statement, balance sheet and cash-flow statement get a chart view (income:
    // waterfall bridge + common-size; balance: capital-structure trend + working-capital bridge +
    // balance matrix; cashflow: cash bridge + FCF breakdown + earnings quality). Segments keep the
    // table-only view untouched.
    if (
      state.statement !== "income" &&
      state.statement !== "balance" &&
      state.statement !== "cashflow"
    )
      return tableInner;

    var tableHidden = state.stmtMode === "chart" ? " hidden" : "";
    var chartHidden = state.stmtMode === "chart" ? "" : " hidden";
    return (
      '<div class="stmt-view-toggle" role="group" aria-label="Statement view">' +
      '<button type="button" class="toggle-btn" data-stmt-mode="table" aria-pressed="' + (state.stmtMode === "table") + '">▤ Table</button>' +
      '<button type="button" class="toggle-btn" data-stmt-mode="chart" aria-pressed="' + (state.stmtMode === "chart") + '">▧ Chart</button>' +
      "</div>" +
      '<div id="stmt-table-wrap"' + tableHidden + ">" + tableInner + "</div>" +
      '<div id="stmt-chart-wrap"' + chartHidden + "></div>"
    );
  }

  function wireStatementView(stmt) {
    // Raw JSON: the retired /explorer's developer affordance — the exact response the
    // public statements endpoint served for the table on screen.
    var jsonBtn = $("stmt-json-btn"), pre = $("stmt-json");
    jsonBtn.addEventListener("click", function () {
      var show = pre.hidden;
      if (show && !pre.textContent) pre.textContent = JSON.stringify(stmt, null, 2);
      pre.hidden = !show;
      jsonBtn.setAttribute("aria-pressed", String(show));
      jsonBtn.textContent = (show ? "●" : "{ }") + " View raw JSON";
    });

    // "Show your work": swap the clean table for the raw-tag → clean-field audit rows.
    var auditBtn = $("stmt-audit-btn");
    auditBtn.addEventListener("click", function () {
      var showAudit = $("stmt-audit").hidden;
      $("stmt-audit").hidden = !showAudit;
      $("stmt-normal").hidden = showAudit;
      auditBtn.setAttribute("aria-pressed", String(showAudit));
      auditBtn.textContent = (showAudit ? "●" : "○") + " Show your work";
    });

    // Click a display value to toggle the exact reported figure (never fabricated
    // precision — the exact string comes from the same fact).
    $("stmt-normal").addEventListener("click", function (e) {
      var btn = e.target.closest(".row-value");
      if (!btn || !btn.hasAttribute("data-exact")) return;
      var revealed = btn.classList.toggle("revealed");
      btn.textContent = btn.getAttribute(revealed ? "data-exact" : "data-abbrev");
    });

    if (
      state.statement === "income" ||
      state.statement === "balance" ||
      state.statement === "cashflow"
    )
      wireStmtViewToggle(stmt);
  }

  // Table/Chart segmented toggle for the income statement and balance sheet. Chart mode lazily
  // fetches the derived viz endpoint(s) (server owns the honesty math) for the current period,
  // caches by statement, and renders the statement's chart cards. Toggling never refetches.
  function wireStmtViewToggle(stmt) {
    var toggle = document.querySelector(".stmt-view-toggle");
    if (!toggle) return;
    toggle.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-stmt-mode]");
      if (!btn) return;
      var mode = btn.getAttribute("data-stmt-mode");
      if (mode === state.stmtMode) return;
      state.stmtMode = mode;
      toggle.querySelectorAll("[data-stmt-mode]").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-stmt-mode") === mode));
      });
      $("stmt-table-wrap").hidden = mode === "chart";
      $("stmt-chart-wrap").hidden = mode !== "chart";
      if (mode === "chart") renderStmtCharts(stmt);
    });
    // If we re-entered the view already in chart mode (period change while charting), draw now.
    if (state.stmtMode === "chart") renderStmtCharts(stmt);
  }

  function renderStmtCharts(stmt) {
    var wrap = $("stmt-chart-wrap");
    if (!wrap) return;
    if (state.statement === "balance") { renderBalanceCharts(wrap, stmt); return; }
    if (state.statement === "cashflow") { renderCashflowCharts(wrap, stmt); return; }
    // Cache key includes the statement so income/balance never collide on the same (year, period).
    var key = state.statement + "|" + stmt.fiscal_year + "|" + stmt.fiscal_period;
    var cached = state.vizCache[key];
    if (cached) { paintStmtCharts(wrap, cached); return; }
    wrap.innerHTML = P.states.loading({ title: "Loading charts" });
    P.api(
      "/companies/" + encodeURIComponent(symbol) + "/statements/income/viz?year=" +
      stmt.fiscal_year + "&period=" + encodeURIComponent(stmt.fiscal_period)
    ).then(
      function (viz) { state.vizCache[key] = viz; if (state.stmtMode === "chart") paintStmtCharts(wrap, viz); },
      function (err) { wrap.innerHTML = P.states.error({ copy: "Couldn't load charts (" + (err.status || "network") + ")." }); }
    );
  }

  function paintStmtCharts(wrap, viz) {
    wrap.innerHTML = "";
    var w = P.measuredWidth(wrap, 640);
    wrap.appendChild(P.incomeBridge(viz.bridge, { width: w }));
    wrap.appendChild(P.commonSizeChart(viz.common_size, { width: w }));
    var cav = document.createElement("p");
    cav.className = "caveat";
    cav.textContent = (viz.caveats || []).join(" ");
    wrap.appendChild(cav);
  }

  // Balance sheet chart mode: the capital-structure TREND (multi-period, independent of the
  // selected period) + the per-period working-capital bridge and balance matrix. The trend
  // comes from a separate series endpoint, so we fetch two things and paint once they're both
  // resolved. The single-period viz is cached per (statement, year, period); the series is
  // cached once per statement (it doesn't vary with the selected period).
  function renderBalanceCharts(wrap, stmt) {
    var vizKey = "balance|" + stmt.fiscal_year + "|" + stmt.fiscal_period;
    var seriesKey = "balance|series";
    var viz = state.vizCache[vizKey], series = state.vizCache[seriesKey];
    if (viz && series) { paintBalanceCharts(wrap, viz, series); return; }
    wrap.innerHTML = P.states.loading({ title: "Loading charts" });
    var base = "/companies/" + encodeURIComponent(symbol) + "/statements/balance/";
    var pViz = viz ? Promise.resolve(viz) : P.api(
      base + "viz?year=" + stmt.fiscal_year + "&period=" + encodeURIComponent(stmt.fiscal_period)
    );
    var pSeries = series ? Promise.resolve(series) : P.api(base + "viz-series?period=FY");
    Promise.all([pViz, pSeries]).then(
      function (r) {
        state.vizCache[vizKey] = r[0];
        state.vizCache[seriesKey] = r[1];
        if (state.stmtMode === "chart") paintBalanceCharts(wrap, r[0], r[1]);
      },
      function (err) { wrap.innerHTML = P.states.error({ copy: "Couldn't load charts (" + (err.status || "network") + ")." }); }
    );
  }

  // Analytical grid layout for the statement chart views (dashboard review #3): instead of a
  // single column of full-width panels, lay charts out in rows where a two-item row becomes a
  // measured 2-up grid -- the primary/wide chart gets the full width, the supporting pair sits
  // side by side. Each `row` is an array of builder fns (width -> chartCard node); a 1-fn row is
  // full width, a 2-fn row splits. The 2-up grid collapses back to one column on narrow screens
  // (CSS), and we re-measure each cell so the Plot SVGs are sized to the column they land in.
  function chartRows(wrap, rows, caveats) {
    wrap.innerHTML = "";
    var w = P.measuredWidth(wrap, 640);
    rows.forEach(function (row) {
      if (row.length === 1) {
        wrap.appendChild(row[0](w));
        return;
      }
      var grid = document.createElement("div");
      grid.className = "stmt-chart-grid";
      wrap.appendChild(grid);
      var cells = row.map(function () {
        var c = document.createElement("div");
        c.className = "stmt-chart-cell";
        grid.appendChild(c);
        return c;
      });
      // Measure a cell after it's in the DOM so a collapsed (one-column) grid sizes charts to the
      // full width, and a split grid sizes them to the half-column they actually occupy.
      var colW = P.measuredWidth(cells[0], Math.floor((w - 16) / 2));
      row.forEach(function (fn, i) { cells[i].appendChild(fn(colW)); });
    });
    var cav = document.createElement("p");
    cav.className = "caveat";
    cav.textContent = (caveats || []).join(" ");
    wrap.appendChild(cav);
  }

  function paintBalanceCharts(wrap, viz, series) {
    // Full-width stack, not a 2-up grid: each balance chart needs the width -- the working-capital
    // diverging bar has left-edge category labels that collide with its value labels at a half
    // column, and the matrix is a wide two-column table. (2-up suits the compact cash-flow pair;
    // it doesn't suit these.) Brief priority order: trend (#2) -> working-capital (#4) -> matrix (#1).
    chartRows(wrap, [
      [function (w) { return P.capitalStructureTrend(series, { width: w }); }],
      [function (w) { return P.workingCapitalBridge(viz.working_capital, { width: w }); }],
      [function (w) { return P.balanceMatrix(viz.matrix, { width: w }); }],
    ], viz.caveats);
  }

  // Cash-flow chart mode: the single-period cash BRIDGE (#1) + the multi-period FCF breakdown (#2)
  // and earnings-quality combo (#3). Like the balance charts, the bridge is per (year, period) and
  // the series is period-independent, so we fetch two things and paint once both resolve. The
  // single-period viz is cached per (statement, year, period); the series is cached once per
  // statement (keyed "cashflow|series"), so income/balance/cashflow never collide.
  function renderCashflowCharts(wrap, stmt) {
    var vizKey = "cashflow|" + stmt.fiscal_year + "|" + stmt.fiscal_period;
    var seriesKey = "cashflow|series";
    var viz = state.vizCache[vizKey], series = state.vizCache[seriesKey];
    if (viz && series) { paintCashflowCharts(wrap, viz, series); return; }
    wrap.innerHTML = P.states.loading({ title: "Loading charts" });
    var base = "/companies/" + encodeURIComponent(symbol) + "/statements/cashflow/";
    var pViz = viz ? Promise.resolve(viz) : P.api(
      base + "viz?year=" + stmt.fiscal_year + "&period=" + encodeURIComponent(stmt.fiscal_period)
    );
    var pSeries = series ? Promise.resolve(series) : P.api(base + "viz-series?period=FY");
    Promise.all([pViz, pSeries]).then(
      function (r) {
        state.vizCache[vizKey] = r[0];
        state.vizCache[seriesKey] = r[1];
        if (state.stmtMode === "chart") paintCashflowCharts(wrap, r[0], r[1]);
      },
      function (err) { wrap.innerHTML = P.states.error({ copy: "Couldn't load charts (" + (err.status || "network") + ")." }); }
    );
  }

  function paintCashflowCharts(wrap, viz, series) {
    // The cash bridge (#1) leads full-width; the FCF breakdown (#2) and earnings-quality (#3)
    // combos pair side by side beneath it rather than stretching across the whole page.
    chartRows(wrap, [
      [function (w) { return P.cashFlowBridge(viz.bridge, { width: w }); }],
      [
        function (w) { return P.fcfBreakdown(series, { width: w }); },
        function (w) { return P.earningsQuality(series, { width: w }); },
      ],
    ], viz.caveats);
  }

  // ---------- Phase-3 dimensional spike view (merged from the retired /explorer) ----------

  function fmtB(v) {
    var neg = v < 0, a = Math.abs(v);
    var s = a >= 1e9 ? (a / 1e9).toFixed(2) + "B" : (a / 1e6).toFixed(1) + "M";
    return (neg ? "($" : "$") + s + (neg ? ")" : "");
  }

  function renderSpikeSegments() {
    if (spikeData) { renderSpikeView(); return; }
    stmtHost.innerHTML = P.states.loading({ title: "Loading spike extract" });
    fetch("/static/spike_dimensional.json")
      .then(function (r) { return r.json(); })
      .then(function (d) { spikeData = d; renderSpikeView(); })
      .catch(function () {
        stmtHost.innerHTML = P.states.error({ copy: "Could not load the static spike extract." });
      });
  }

  function renderSpikeView() {
    var sym = symbol.toUpperCase();
    var d = spikeData && spikeData[sym];
    var banner =
      '<div class="spike-banner"><span class="spike-tag">SPIKE</span> ' +
      "Dimensional (segment) data is a Phase-3 spike — a one-off static extract from the " +
      "SEC Financial Statement Data Sets for " + SPIKE_SYMBOLS.join(", ") +
      " only. Not served by the API; the period picker does not apply. " +
      "companyfacts (everything else on this page) carries no dimensional facts at all.</div>";
    if (!d) {
      stmtHost.innerHTML = '<div class="state">' + banner +
        '<div class="state-title">No spike extract for ' + P.esc(sym) + "</div>" +
        '<p class="state-copy">This prototype covers ' + SPIKE_SYMBOLS.join(", ") +
        ". Open one of them to see revenue by business segment, geography, and product.</p></div>";
      return;
    }
    var viewNames = Object.keys(d.views);
    if (!state.spikeAxis || viewNames.indexOf(state.spikeAxis) === -1) state.spikeAxis = viewNames[0];
    var rows = d.views[state.spikeAxis];
    var viewSum = rows.reduce(function (a, r) { return a + r.value; }, 0);
    var maxVal = rows.reduce(function (a, r) { return Math.max(a, r.value); }, 0);
    var sumsClean = d.consolidated_revenue &&
      Math.abs(viewSum - d.consolidated_revenue) / d.consolidated_revenue < 0.01;

    var toggle = '<div class="segmented spike-axis" role="tablist">' + viewNames.map(function (n) {
      return '<button type="button" role="tab"' + (n === state.spikeAxis ? ' class="on"' : "") +
        ' data-axis="' + P.esc(n) + '">' + P.esc(n) + "</button>";
    }).join("") + "</div>";

    var head = '<div class="spike-head"><div><div class="spike-title">' + P.esc(sym) + "</div>" +
      '<div class="spike-sub">Revenue by ' + P.esc(state.spikeAxis.toLowerCase()) + " · FY" + d.fiscal_year +
      " (ended " + P.esc(d.period_end) + ") · source tag " + P.esc(d.revenue_tag) + "</div></div>" + toggle + "</div>";

    var table = rows.map(function (r) {
      var pct = maxVal ? Math.round(100 * r.value / maxVal) : 0;
      var share = sumsClean ? '<span class="spike-share">' + (100 * r.value / viewSum).toFixed(1) + "%</span>" : "";
      var yoy = "";
      if (r.prior) {
        var g = (r.value / r.prior - 1) * 100;
        yoy = '<span class="spike-yoy ' + (g >= 0 ? "up" : "down") + '">' + (g >= 0 ? "+" : "") + g.toFixed(1) + "% yoy</span>";
      }
      return '<div class="spike-row">' +
        '<span class="spike-member">' + P.esc(r.member) + "</span>" +
        '<span class="spike-track"><i style="width:' + pct + '%"></i></span>' +
        '<span class="spike-value">' + fmtB(r.value) + "</span>" + share + yoy +
        "</div>";
    }).join("");

    var footnote = sumsClean
      ? '<p class="spike-footnote">Members sum to the consolidated revenue (' + fmtB(d.consolidated_revenue) + ") — shares shown against that total.</p>"
      : '<p class="spike-footnote">Members on this axis mix reporting levels (rollups and their components appear as siblings — the presentation-hierarchy problem in the spike notes), so share-of-total is not shown.</p>';

    stmtHost.innerHTML = '<div class="state spike-card">' + banner + head +
      '<div class="spike-table">' + table + "</div>" + footnote + "</div>";
    stmtHost.querySelectorAll("[data-axis]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.spikeAxis = btn.getAttribute("data-axis");
        renderSpikeView();
      });
    });
  }

  init();
})();
