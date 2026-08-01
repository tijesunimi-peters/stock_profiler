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

  var IP_DONE = ["01"]; // sections wired to real filings data

  var IP_DATA = {
    symbol: null,
    period: null,       // the 13F quarter-end being described
    periods: [],        // every ingested quarter, newest first
    register: null,     // /institutional-register       -- one quarter's shape
    shape: null,        // /institutional-register-shape -- across quarters
    filed: null,        // /institutional-filed-since    -- what landed after the register closed
    activity: null,     // /institutional-activity       -- DERIVED per-manager quarter-over-quarter
    status: "idle",     // idle | loading | ready | error
    error: null,
  };

  /* One load per (symbol, period). The four calls are independent, and a failure in any ONE of
   * them must not blank the others -- a section whose endpoint failed renders its own error, the
   * rest of the page still renders. So: settle every promise, never reject the whole load. */
  function ipLoad(symbol, period) {
    IP_DATA.symbol = symbol;
    IP_DATA.status = "loading";
    IP_DATA.error = null;
    var base = "/companies/" + encodeURIComponent(symbol) + "/institutional";
    var q = period ? "?period=" + encodeURIComponent(period) : "";

    var soft = function (p) { return p.then(function (v) { return v; }, function (e) { return { _err: e }; }); };

    return P.api(base + "-periods")
      .then(function (per) {
        IP_DATA.periods = per.periods || [];
        // The caller's period wins; otherwise the newest quarter we have actually ingested.
        IP_DATA.period = period || IP_DATA.periods[0] || null;
        var pq = IP_DATA.period ? "?period=" + encodeURIComponent(IP_DATA.period) : q;
        return Promise.all([
          soft(P.api(base + "-register" + pq)),
          soft(P.api(base + "-register-shape" + pq)),
          soft(P.api(base + "-filed-since" + pq)),
          soft(P.api(base + "-activity" + pq)),
        ]);
      })
      .then(function (r) {
        IP_DATA.register = r[0];
        IP_DATA.shape = r[1];
        IP_DATA.filed = r[2];
        IP_DATA.activity = r[3];
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
      ipLoad(sym, null).then(ipPaint);
      return;
    }
    ipPaint();
  }

  function ipPaint() {
    // Sections build one at a time, in order, each diffed against its capture before the next
    // starts (P1e). A section with no builder yet renders as an empty shell.
    var IP_BODIES = { "01": ipSection01, "02": ipSection02, "03": ipSection03, "04": ipSection04, "05": ipSection05, "06": ipSection06, "07": ipSection07 };

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
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { ipFitDumbbell(); });
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

  /* ============================ §02 · Register over time & holders ============================
   * Ground truth: proto-i2.png / proto-i2-open.png + literals-open.json.
   * ⚠️ EVERY VALUE IS A PROTOTYPE LITERAL. Chart series were RECOVERED from the captured SVG path
   * data (the same technique as §01's dumbbell), not transcribed by eye. */
  var IP02 = {
    quarters5: ["1Q25", "2Q25", "3Q25", "4Q25", "1Q26"],
    quarters9: ["1Q24", "3Q24", "1Q25", "3Q25", "1Q26"],   // only every other one is labelled
    /* Tick labels are carried as LITERALS rather than computed. The prototype's own axis maxima
     * are fractional (~1814.2 and ~837.8), so computing the quarters from a rounded max lands one
     * off on two of them -- 210M/629M where the prototype prints 209M/628M. */
    managers: { values: [1509, 1560, 1612, 1633, 1681], axisMax: 1814, color: "var(--accent)",
      ticks: ["0", "454", "907", "1361", "1814"] },
    shares: { values: [722.8, 733.2, 742.6, 764.7, 776.3], axisMax: 838, color: "var(--gaap-color)",
      ticks: ["0M", "209M", "419M", "628M", "838M"] },
    netChange: "Net change this quarter: −33 holders",
    // Stacked manager mix, nine quarters. `share` is the band's own share per quarter.
    mix: [
      { label: "Index / passive", pct: "40%", prior: "40%", color: "#c0703a", share: [0.424, 0.4286, 0.4195, 0.4182, 0.4071, 0.4117, 0.4097, 0.4013, 0.3981] },
      { label: "Active fundamental", pct: "33%", prior: "33%", color: "#3d6a8a", share: [0.2961, 0.3006, 0.3104, 0.3078, 0.3162, 0.3208, 0.3188, 0.3279, 0.3338] },
      { label: "Hedge fund", pct: "14%", prior: "14%", color: "#8b8579", share: [0.1422, 0.1396, 0.137, 0.139, 0.1429, 0.1396, 0.1403, 0.1396, 0.139] },
      { label: "Pension & sovereign", pct: "9%", prior: "9%", color: "#a88c5f", share: [0.0994, 0.0942, 0.0948, 0.0968, 0.0968, 0.0922, 0.0935, 0.0942, 0.0942] },
      { label: "Other", pct: "4%", prior: "4%", color: "#4e4a42", share: [0.0383, 0.037, 0.0383, 0.0383, 0.037, 0.0357, 0.0377, 0.037, 0.0351] },
    ],
    mixCaption: "Share of the 13F-reported register by manager type, nine quarters. Colour is categorical identity only.",
    topTen: { value: "69.9%", note: "Share of 13F-reported holdings held by the ten largest reporting managers." },
    /* Expander. The prototype puts TWO things behind the bar, not one: a 3x4 grid of per-manager
     * sparkline panels, then a table of the ten largest. `spark` is each series normalised 0..1,
     * recovered from the captured SVG path data. */
    panels: [
      { name: "Index manager A", cls: "index / passive", shares: "112.4M", delta: "\u2193 \u221216%", color: "#c0703a", spark: [1, 0.689, 0.653, 0.617, 0.639, 0.325, 0.289, 0.256, 0] },
      { name: "Index manager B", cls: "index / passive", shares: "81.5M", delta: "\u2193 \u22124%", color: "#c0703a", spark: [0.761, 0.497, 1, 0.736, 0.561, 0.294, 0.8, 0.533, 0] },
      { name: "Index manager C", cls: "index / passive", shares: "37.3M", delta: "\u2191 +9%", color: "#c0703a", spark: [0.203, 0, 0.278, 0.508, 0.694, 0.925, 0.769, 1, 0.933] },
      { name: "Active manager D", cls: "insurance", shares: "42.9M", delta: "\u2191 +36%", color: "#a88c5f", spark: [0, 0.25, 0.317, 0.381, 0.592, 0.658, 0.722, 0.789, 1] },
      { name: "Active manager E", cls: "hedge fund", shares: "48.7M", delta: "\u2193 \u221213%", color: "#8b8579", spark: [1, 0.917, 0.833, 0.747, 0.664, 0.253, 0.167, 0.083, 0] },
      { name: "Pension system F", cls: "sovereign", shares: "51.7M", delta: "\u2193 \u22127%", color: "#a88c5f", spark: [1, 0.706, 0.339, 0.725, 0.358, 0.064, 0.375, 0.081, 0] },
      { name: "Sovereign fund G", cls: "index / passive", shares: "33.6M", delta: "\u2191 +4%", color: "#c0703a", spark: [0.336, 0, 0.292, 0.522, 0.814, 0.478, 0.769, 1, 0.722] },
      { name: "Hedge fund H", cls: "quantitative", shares: "37.2M", delta: "\u2191 +21%", color: "#8b8579", spark: [0, 0.064, 0.128, 0.469, 0.531, 0.594, 0.658, 1, 0.947] },
      { name: "Insurance manager I", cls: "pension", shares: "42.1M", delta: "\u2191 +30%", color: "#a88c5f", spark: [0, 0.181, 0.139, 0.319, 0.547, 0.725, 0.686, 0.867, 1] },
      { name: "Endowment J", cls: "index / passive", shares: "45.5M", delta: "\u2193 \u221211%", color: "#c0703a", spark: [1, 0.814, 0.594, 0.742, 0.589, 0.406, 0.186, 0, 0.181] },
      { name: "Quant manager K", cls: "pension", shares: "13.0M", delta: "\u2191 +21%", color: "#a88c5f", spark: [0, 0.089, 0.178, 0.267, 0.583, 0.672, 0.761, 0.85, 1] },
      { name: "Bank trust L", cls: "hedge fund", shares: "10.9M", delta: "\u2191 +16%", color: "#8b8579", spark: [0, 0.169, 0.375, 0.542, 0.675, 0.494, 0.7, 0.867, 1] },
    ],
    panelsNote: "Each panel is rebuilt from that manager\u2019s own 13F-HR filings as they were filed. Panels are scaled independently, so read the trajectory and the printed figures, not the relative heights.",
    table: [
      { name: "Index manager A", meta: "index / passive \u00b7 13F-HR \u00b7 filed 2026-05-11", shares: "114.8M", pct: "9.11%", delta: "\u2193 \u22128.4%" },
      { name: "Index manager B", meta: "index / passive \u00b7 13F-HR \u00b7 filed 2026-05-14", shares: "82.7M", pct: "6.57%", delta: "\u2193 \u22121.7%" },
      { name: "Index manager C", meta: "index / passive \u00b7 13F-HR \u00b7 filed 2026-05-03", shares: "38.2M", pct: "3.03%", delta: "\u2191 +5.0%" },
      { name: "Active manager D", meta: "insurance \u00b7 13F-HR \u00b7 13G \u00b7 filed 2026-05-06", shares: "42.2M", pct: "3.35%", delta: "\u2191 +11.7%" },
      { name: "Active manager E", meta: "hedge fund \u00b7 13F-HR \u00b7 filed 2026-05-09", shares: "48.0M", pct: "3.81%", delta: "\u2193 \u22125.3%" },
      { name: "Pension system F", meta: "sovereign \u00b7 13F-HR \u00b7 filed 2026-05-13", shares: "50.8M", pct: "4.03%", delta: "\u2191 +1.4%" },
      { name: "Sovereign fund G", meta: "index / passive \u00b7 13F-HR \u00b7 13G \u00b7 filed 2026-05-02", shares: "34.4M", pct: "2.73%", delta: "\u2191 +8.1%" },
      { name: "Hedge fund H", meta: "quantitative \u00b7 13F-HR \u00b7 filed 2026-05-05", shares: "37.7M", pct: "2.99%", delta: "\u2191 +14.8%" },
      { name: "Insurance manager I", meta: "pension \u00b7 13F-HR \u00b7 filed 2026-05-14", shares: "42.4M", pct: "3.37%", delta: "\u2193 \u22122.2%" },
      { name: "Endowment J", meta: "index / passive \u00b7 13F-HR \u00b7 filed 2026-05-03", shares: "44.5M", pct: "3.53%", delta: "\u2191 +4.6%" },
    ],
    holdersNote: "Managers are named as they appear on the cover of the 13F-HR; affiliated entities file separately and are not consolidated here.",
  };

  function ipSection02() {
    return (
      '<div class="ip-grid2">' + ip02OverTime() + ip02Mix() + "</div>" +
      ipExpander(
        "Also in this section",
        "each manager over nine quarters · the largest reporting managers",
        ip02Holders()
      )
    );
  }

  function ip02OverTime() {
    return (
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Register over time</h3>' +
      '<span class="ip-card-note">holder count and reported shares, five quarters</span>' +
      ipChip("02-register") +
      ipLink("13F filings ↗") +
      "</div>" +
      '<div class="ip-micro ip-micro--tight">Reporting managers</div>' +
      ipAreaChart(IP02.managers, IP02.quarters5) +
      '<div class="ip-micro ip-micro--tight ip-micro--gap">Shares reported (M)</div>' +
      ipAreaChart(IP02.shares, IP02.quarters5) +
      '<div class="ip-caption">' + P.esc(IP02.netChange) + "</div>" +
      "</div>"
    );
  }

  function ip02Mix() {
    var legend = IP02.mix
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
          '<div class="ip-bar-tick" style="left:' + P.esc(m.prior) + '"></div></div>' +
          '<div class="ip-bar-note">tick: prior quarter <span>' + P.esc(m.prior) + "</span></div>" +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Manager mix</h3>' +
      '<span class="ip-card-note">classification assigned by ClearyFi</span>' +
      ipBadge("02-mix") +
      "</div>" +
      ipDerivationPanel("02-mix") +
      ipStackedArea(IP02.mix, IP02.quarters9) +
      '<div class="ip-caption">' + P.esc(IP02.mixCaption) + "</div>" +
      '<div class="ip-legend">' + legend + "</div>" +
      '<div class="ip-topten">' +
      '<div class="ip-topten-head"><span class="ip-topten-label">Top ten managers</span>' +
      '<span class="ip-topten-val"><span>' + P.esc(IP02.topTen.value) + "</span></span></div>" +
      '<div class="ip-topten-foot"><span class="ip-topten-note"><span>' + P.esc(IP02.topTen.note) +
      "</span></span>" +
      ipBadge("02-topten") + "</div>" +
      ipDerivationPanel("02-topten") +
      "</div>" +
      "</div>"
    );
  }

  function ip02Panels() {
    return IP02.panels
      .map(function (m) {
        return (
          '<div class="ip-panel" style="border-left-color:' + m.color + '">' +
          '<div class="ip-panel-name">' + P.esc(m.name) + "</div>" +
          '<div class="ip-panel-cls">' + P.esc(m.cls) + "</div>" +
          ipSparkline(m.spark, m.color) +
          '<div class="ip-panel-foot"><span>' + P.esc(m.shares) + "</span>" +
          "<span>" + P.esc(m.delta) + "</span></div>" +
          "</div>"
        );
      })
      .join("");
  }

  function ip02Holders() {
    var panels = ip02Panels();
    var rows = IP02.table
      .map(function (r) {
        return (
          '<div class="ip-mtab-row">' +
          '<span class="ip-mtab-id"><span class="ip-mtab-name">' + P.esc(r.name) + "</span>" +
          '<span class="ip-mtab-meta">' + P.esc(r.meta) + "</span></span>" +
          '<span class="ip-mtab-num">' + P.esc(r.shares) + "</span>" +
          '<span class="ip-mtab-num">' + P.esc(r.pct) + "</span>" +
          '<span class="ip-mtab-num ip-mtab-num--delta">' + P.esc(r.delta) + "</span>" +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="ip-card">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Largest reporting managers</h3>' +
      '<span class="ip-card-note">13F-HR, position as of 1Q26 · Δ is quarter over quarter in shares</span>' +
      ipLink("Read the 13F table ↗") +
      "</div>" +
      '<div class="ip-subbar">' +
      '<span class="ip-micro">Reported shares, nine quarters · one panel per manager</span>' +
      ipChip("02-panels") +
      "</div>" +
      '<div class="ip-panels">' + panels + "</div>" +
      '<div class="ip-caption"><span>' + P.esc(IP02.panelsNote) + "</span></div>" +
      '<div class="ip-mtab-head"><span>Manager · classification</span>' +
      '<span class="ip-r">Shares</span><span class="ip-r">% out</span><span class="ip-r">Δ qoq</span></div>' +
      rows +
      '<div class="ip-caption"><span>' + P.esc(IP02.holdersNote) + "</span></div>" +
      "</div>"
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
    // Nine quarters, five labels -- the prototype labels every other one.
    var xl = labels.map(function (l, i) {
      return '<text x="' + (X0 + i * 2 * step).toFixed(1) + '" y="182" text-anchor="middle" class="ip-ax2">' +
        P.esc(l) + "</text>";
    });
    return (
      '<div class="ip-chart"><svg width="100%" viewBox="0 0 ' + W + " " + H + '" ' +
      'preserveAspectRatio="xMidYMid meet" style="display:block;max-width:100%" role="img" ' +
      'aria-label="Share of the register by manager type, nine quarters">' +
      ticks.join("") + paths.join("") + xl.join("") + "</svg></div>"
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

  /* ============================ §03 · Flows & concentration ============================
   * Every number below is a prototype literal. The four chart series were RECOVERED NUMERICALLY
   * from the captured SVG (docs/delivery/v3-p5a-institutional/prototype-ground-truth), never
   * transcribed by eye — see 5-design-port-log.md for the recovery and its round-trip checks. */
  var IP03 = {
    quarters6: ["4Q24", "1Q25", "2Q25", "3Q25", "4Q25", "1Q26"],
    /* Diverging flows. `add`/`red` are in millions of shares; the net rule is add − red, which is
     * what the prototype draws (verified: recomputing the net reproduces all six rule positions to
     * 1e-4 px). The absolute scale is arbitrary — geometry depends only on each value over the
     * largest — so these are the capture's pixel heights carried back through a 74.25M maximum. */
    flows: {
      add: [46.7915, 33.0622, 74.25, 60.5207, 53.2178, 39.4886],
      red: [45.5331, 58.4042, 19.7907, 32.6619, 39.5084, 52.3796],
      ticks: ["+74M", "+37M", "+0M", "−37M", "−74M"],
    },
    // The printed table is rounded to one decimal and carried separately from the chart series.
    flowRows: [
      ["4Q24", "+46.8M", "−45.5M", "+1.3M"],
      ["1Q25", "+33.1M", "−58.4M", "−25.3M"],
      ["2Q25", "+74.2M", "−19.8M", "+54.4M"],
      ["3Q25", "+60.5M", "−32.7M", "+27.9M"],
      ["4Q25", "+53.2M", "−39.5M", "+13.7M"],
      ["1Q26", "+39.5M", "−52.4M", "−12.9M"],
    ],
    flowsNote:
      "Gross adds and reductions are aggregated across every reporting manager. A quarter with " +
      "large gross flows and a small net is a change of hands, not a change of ownership level.",
    countLabel: "This quarter by manager count · 1Q26 vs 4Q25",
    counts: [
      { label: "New positions", value: "56", note: "10.4M" },
      { label: "Added to", value: "371", note: "29.0M" },
      { label: "Reduced", value: "127", note: "45.8M" },
      { label: "Exited", value: "89", note: "6.6M" },
    ],
    countsNote:
      "Counts are managers; share figures are the aggregate change in reported shares. " +
      "Direction is described, not scored.",
    /* Ranked share. `share` is each manager's own percentage — recovered as the first difference
     * of the cumulative curve's circle centres, which carry full precision in the capture. It
     * reproduces all ten bar heights to 5e-14. `pct` is what the prototype PRINTS above each bar
     * (rounded), which is not the same number. */
    ranked: {
      rows: [
        { label: "Idx  A", pct: "15.0%", share: 14.975066, color: "#c0703a" },
        { label: "Idx  B", pct: "10.8%", share: 10.787787, color: "#c0703a" },
        { label: "Idx  C", pct: "5.0%", share: 4.982992, color: "#c0703a" },
        { label: "Act  D", pct: "5.5%", share: 5.504772, color: "#a88c5f" },
        { label: "Act  E", pct: "6.3%", share: 6.261352, color: "#8b8579" },
        { label: "Pen  F", pct: "6.6%", share: 6.626597, color: "#a88c5f" },
        { label: "Sov  G", pct: "4.5%", share: 4.487302, color: "#c0703a" },
        { label: "HF  H", pct: "4.9%", share: 4.91777, color: "#8b8579" },
        { label: "Ins  I", pct: "5.5%", share: 5.530861, color: "#a88c5f" },
        { label: "End  J", pct: "5.8%", share: 5.804795, color: "#c0703a" },
      ],
      // The dotted line is its own cumulative series (the same ten managers a quarter earlier),
      // not a transform of the solid one.
      prior: [16.7816, 28.1034, 32.9885, 38.046, 44.8276, 51.5517, 55.8046, 60.2299, 66.0345, 71.7241],
      legend: "─ cumulative share of the register     ··· same managers, prior quarter",
      ticks: ["0%", "25%", "50%", "75%", "100%"],
    },
    rankedNote:
      "Bars are each manager’s share of the 13F-reported register; the solid line is the running " +
      "total, the dotted line the same ten managers one quarter earlier. Everything past the " +
      "tenth manager is the remaining 30%.",
    effective: { value: "17", of: "1,669" },
    /* Lorenz. 61 cumulative-share points, then the jump to (100%, 100%) — the last bucket is a
     * sliver of managers carrying 70% of the register, which is the whole point of the curve. */
    lorenz: [
      0.0581, 0.0581, 0.1163, 0.1163, 0.1744, 0.1744, 0.2326, 0.2907, 0.3488, 0.3488, 0.407,
      0.4651, 0.5233, 0.6395, 0.6977, 0.814, 0.8721, 0.9884, 1.1047, 1.2209, 1.3953, 1.5698,
      1.7442, 1.9186, 2.093, 2.3256, 2.5581, 2.8488, 3.0814, 3.4302, 3.7209, 4.0698, 4.4186,
      4.8256, 5.2326, 5.6977, 6.1628, 6.686, 7.2093, 7.7907, 8.4302, 9.0698, 9.7093, 10.4651,
      11.1628, 11.9767, 12.7907, 13.6628, 14.593, 15.5814, 16.5698, 17.6163, 18.7209, 19.8837,
      21.0465, 22.3256, 23.6047, 25.0, 26.3953, 27.907, 29.4186,
    ],
    hhiNote:
      "HHI is computed on each manager's share of 13F-reported holdings; the effective number of " +
      "holders is 10,000 ÷ HHI. Affiliated entities that file separately count separately, which " +
      "raises the effective number.",
    domicile: [
      { label: "United States · Pennsylvania", pct: "26.1%", prior: "25.7%", shares: "200M" },
      { label: "United States · New York", pct: "21.1%", prior: "20.2%", shares: "162M" },
      { label: "United States · California", pct: "15.6%", prior: "15.9%", shares: "120M" },
      { label: "United States · Massachusetts", pct: "10.7%", prior: "11.2%", shares: "82M" },
      { label: "Canada", pct: "7.4%", prior: "7.4%", shares: "57M" },
      { label: "United Kingdom", pct: "6.1%", prior: "6%", shares: "47M" },
      { label: "Switzerland", pct: "5.2%", prior: "5.4%", shares: "40M" },
      { label: "Singapore", pct: "4.0%", prior: "3.9%", shares: "30M" },
      { label: "Norway · sovereign fund", pct: "1.6%", prior: "1.7%", shares: "12M" },
      { label: "Rest of world", pct: "2.2%", prior: "2.2%", shares: "17M" },
    ],
    domicileNote:
      "Domicile is the business address on the 13F-HR cover page — where the manager files from, " +
      "not where the capital originates.",
    domicileTick: " The tick on each bar is the same group one quarter earlier.",
    /* Peer matrix. Each cell carries BOTH the printed percentage and the capture's own
     * fill-opacity: the opacity is not a linear function of the rounded percentage. The label
     * flips to the card colour above 0.47 — a rule checked against all 30 cells, 0 misses. */
    peers: ["AVGO", "NVDA", "AMD", "INTC", "TXN", "QCOM"],
    matrix: [
      [null, [56, 0.4443], [51, 0.3867], [28, 0.152], [61, 0.4913], [25, 0.1242]],
      [[65, 0.5383], null, [52, 0.4039], [29, 0.1587], [60, 0.4837], [26, 0.1306]],
      [[62, 0.5017], [55, 0.4308], null, [33, 0.2036], [61, 0.4934], [23, 0.12]],
      [[65, 0.5366], [58, 0.456], [63, 0.5136], null, [63, 0.5165], [25, 0.1207]],
      [[64, 0.5239], [55, 0.4249], [53, 0.4067], [29, 0.1579], null, [24, 0.12]],
      [[65, 0.5347], [57, 0.4553], [48, 0.3537], [28, 0.1474], [57, 0.4553], null],
    ],
    matrixNote:
      "Cell is the share of the ROW issuer's reporting managers that also report the column " +
      "issuer, so the matrix is deliberately asymmetric — a smaller register overlapping a larger " +
      "one reads high in one direction and low in the other.",
    overlapLabel: "Largest holders, and how many peers they also hold",
    overlap: [
      { name: "Index manager A", peers: "4 of 5 peers", pct: "9.11%" },
      { name: "Index manager B", peers: "5 of 5 peers", pct: "6.57%" },
      { name: "Index manager C", peers: "3 of 5 peers", pct: "3.03%" },
      { name: "Active manager D", peers: "4 of 5 peers", pct: "3.35%" },
      { name: "Active manager E", peers: "4 of 5 peers", pct: "3.81%" },
    ],
    overlapNote:
      "Overlap counts managers whose 13F-HR reports both issuers in the same quarter. A high " +
      "overlap usually reflects index construction rather than a view on either company.",
    attribution: [
      { label: "13F-reported institutional", value: "767M", pct: "60.8%", src: "13F-HR" },
      { label: "Insider & affiliate", value: "80M", pct: "6.4%", src: "DEF 14A, Forms 3/4/5" },
      { label: "Strategic 13D stakes", value: "0M", pct: "0.0%", src: "SC 13D" },
      { label: "Unreported residual", value: "413M", pct: "32.8%", src: "no filing obligation" },
    ],
    residualNote:
      "The residual is what no filing accounts for — retail holders and managers below the $100M " +
      "13(f) threshold. It is a remainder, not a measurement.",
    stable: { weighted: "44%", first: "13%" },
    cohorts: [
      { label: "Held 8+ quarters", pct: "27%", weight: "1.00" },
      { label: "4–7 quarters", pct: "34%", weight: "0.50" },
      { label: "2–3 quarters", pct: "26%", weight: "0.25" },
      { label: "First quarter held", pct: "13%", weight: "0.00" },
    ],
    cohortsNote:
      "Stable-capital share weights each cohort by tenure: 8+ quarters counts fully, 4–7 at half, " +
      "2–3 at a quarter, first-quarter holders at zero. The weights are ours and shown so they " +
      "can be argued with.",
  };

  function ipSection03() {
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

  function ip03Flows() {
    var rows = IP03.flowRows
      .map(function (r) {
        return (
          '<div class="ip-flowtab-row">' +
          '<span class="ip-flowtab-q">' + P.esc(r[0]) + "</span>" +
          '<span class="ip-flowtab-v">' + P.esc(r[1]) + "</span>" +
          '<span class="ip-flowtab-v">' + P.esc(r[2]) + "</span>" +
          '<span class="ip-flowtab-v ip-flowtab-v--net">' + P.esc(r[3]) + "</span>" +
          "</div>"
        );
      })
      .join("");
    var tiles = IP03.counts
      .map(function (c) {
        return (
          '<div class="ip-ftile">' +
          '<span class="ip-micro">' + P.esc(c.label) + "</span>" +
          '<span class="ip-ftile-val">' + P.esc(c.value) + "</span>" +
          '<span class="ip-ftile-note"><span>' + P.esc(c.note) + "</span> of shares</span>" +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="ip-card">' +
      '<div class="ip-card-head">' +
      '<h3 class="ip-card-title">Position changes over time</h3>' +
      '<span class="ip-card-note">shares added above the axis, reduced below · rule marks the net</span>' +
      ipChip("03-flows") +
      ipLink("13F filings ↗") +
      "</div>" +
      ipDivergingBars(IP03.flows, IP03.quarters6) +
      '<div class="ip-flowtab-head"><span>Quarter</span><span class="ip-r">Added</span>' +
      '<span class="ip-r">Reduced</span><span class="ip-r">Net</span></div>' +
      rows +
      '<div class="ip-caption">' + P.esc(IP03.flowsNote) + "</div>" +
      '<div class="ip-micro ip-micro--block">' + P.esc(IP03.countLabel) + "</div>" +
      '<div class="ip-ftiles">' + tiles + "</div>" +
      '<div class="ip-caption">' + P.esc(IP03.countsNote) + "</div>" +
      "</div>"
    );
  }

  function ip03WhoHolds() {
    return (
      '<div class="ip-card">' +
      '<div class="ip-card-head">' +
      '<h3 class="ip-card-title">Who holds what</h3>' +
      '<span class="ip-card-note">ranked manager share of the 13F-reported register · 1Q26</span>' +
      '<div class="ip-toggles" data-ip-group="03-ranked">' +
      '<button type="button" class="ip-toggle ip-toggle--on" data-ip-view="cumulative" aria-pressed="true">Cumulative share</button>' +
      '<button type="button" class="ip-toggle" data-ip-view="treemap" aria-pressed="false">Treemap</button>' +
      "</div>" +
      ipChip("03-ranked") +
      ipLink("13F table ↗") +
      "</div>" +
      '<div data-ip-chart="03-ranked">' + ipRankedShare(IP03.ranked) + "</div>" +
      '<div class="ip-caption" data-ip-note="03-ranked">' + P.esc(IP03.rankedNote) + "</div>" +
      "</div>"
    );
  }

  function ip03Concentration() {
    return (
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">How concentrated the register is</h3>' +
      '<span class="ip-card-note">HHI · effective holders · Lorenz</span>' +
      "</div>" +
      '<div class="ip-stat-row ip-stat-row--baseline">' +
      '<div class="ip-stat ip-stat--live" role="button" tabindex="0" data-ip-trend="effective" aria-expanded="false">' +
      '<span class="ip-micro">Effective holders</span>' +
      '<span class="ip-stat-val"><span>' + P.esc(IP03.effective.value) + "</span></span>" +
      '<span class="ip-stat-note">of <span>' + P.esc(IP03.effective.of) +
      "</span> reporting · click for the trend and the constituents</span>" +
      "</div>" +
      "</div>" +
      ipTrendPanel("effective") +
      ipLorenz(IP03.lorenz) +
      '<div class="ip-caption ip-caption--tight"><span>' + P.esc(IP03.hhiNote) + "</span></div>" +
      "</div>"
    );
  }

  function ip03Domicile() {
    var rows = IP03.domicile
      .map(function (d) {
        return (
          '<div class="ip-dom-row">' +
          '<span class="ip-dom-label"><span>' + P.esc(d.label) + "</span></span>" +
          '<span class="ip-track"><span class="ip-track-fill" style="width:' + P.esc(d.pct) + '"></span>' +
          '<span class="ip-track-tick" style="left:' + P.esc(d.prior) + '"></span></span>' +
          '<span class="ip-dom-val"><span>' + P.esc(d.shares) + "</span></span>" +
          '<span class="ip-dom-pct"><span>' + P.esc(d.pct) + "</span></span>" +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head">' +
      '<h3 class="ip-card-title">Manager domicile</h3>' +
      '<span class="ip-card-note">13F-HR cover page address</span>' +
      "</div>" +
      rows +
      '<div class="ip-caption"><span>' + P.esc(IP03.domicileNote) + "</span>" +
      P.esc(IP03.domicileTick) + "</div>" +
      "</div>"
    );
  }

  function ip03Overlap() {
    var rows = IP03.overlap
      .map(function (o) {
        return (
          '<div class="ip-peer-row">' +
          '<span class="ip-peer-name"><span>' + P.esc(o.name) + "</span></span>" +
          '<span class="ip-peer-peers"><span>' + P.esc(o.peers) + "</span></span>" +
          '<span class="ip-peer-pct"><span>' + P.esc(o.pct) + "</span></span>" +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--split">' +
      '<div class="ip-head-group">' +
      '<h3 class="ip-card-title">Overlap with sector peers</h3>' +
      '<span class="ip-card-note">managers reporting both issuers</span>' +
      "</div>" +
      '<div class="ip-toggles" data-ip-group="03-overlap">' +
      '<button type="button" class="ip-toggle ip-toggle--on" data-ip-view="matrix" aria-pressed="true">Peer matrix</button>' +
      '<button type="button" class="ip-toggle" data-ip-view="sets" aria-pressed="false">Set intersections</button>' +
      ipChip("03-matrix") +
      "</div>" +
      "</div>" +
      '<div data-ip-chart="03-overlap">' + ipPeerMatrix(IP03.peers, IP03.matrix) + "</div>" +
      '<div class="ip-caption" data-ip-note="03-overlap">' + P.esc(IP03.matrixNote) + "</div>" +
      '<div class="ip-micro ip-micro--peers">' + P.esc(IP03.overlapLabel) + "</div>" +
      rows +
      '<div class="ip-caption"><span>' + P.esc(IP03.overlapNote) + "</span></div>" +
      "</div>"
    );
  }

  function ip03Attribution() {
    var rows = IP03.attribution
      .map(function (a) {
        return (
          '<div class="ip-attr">' +
          '<div class="ip-attr-head">' +
          '<span class="ip-attr-label"><span>' + P.esc(a.label) + "</span></span>" +
          '<span class="ip-attr-val"><span>' + P.esc(a.value) + "</span> · <span>" +
          P.esc(a.pct) + "</span></span>" +
          "</div>" +
          '<div class="ip-attr-bar"><div class="ip-attr-fill" style="width:' + P.esc(a.pct) + '"></div></div>' +
          '<div class="ip-attr-src"><span>' + P.esc(a.src) + "</span></div>" +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Where every share sits</h3>' +
      '<span class="ip-card-note">shares outstanding, fully attributed</span>' +
      "</div>" +
      rows +
      '<div class="ip-attr-foot">' +
      '<span class="ip-attr-foot-label">Residual over time</span>' +
      '<button type="button" class="ip-minibtn" data-ip-trend="residual" aria-expanded="false">Trend</button>' +
      "</div>" +
      ipTrendPanel("residual") +
      '<div class="ip-caption ip-caption--tight"><span>' + P.esc(IP03.residualNote) + "</span></div>" +
      "</div>"
    );
  }

  function ip03Stable() {
    var rows = IP03.cohorts
      .map(function (c) {
        return (
          '<div class="ip-coh-row">' +
          '<span class="ip-coh-label"><span>' + P.esc(c.label) + "</span></span>" +
          '<span class="ip-coh-bar"><span class="ip-coh-fill" style="width:' + P.esc(c.pct) + '"></span></span>' +
          '<span class="ip-coh-share"><span>' + P.esc(c.pct) + "</span></span>" +
          '<span class="ip-coh-weight"><span>' + P.esc(c.weight) + "</span></span>" +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Stable-capital share</h3>' +
      '<span class="ip-card-note">register weighted by holding tenure</span>' +
      "</div>" +
      '<div class="ip-stat-row">' +
      '<div class="ip-stat">' +
      '<span class="ip-micro">Tenure-weighted stable</span>' +
      '<span class="ip-stat-val ip-stat-val--sm"><span>' + P.esc(IP03.stable.weighted) + "</span></span>" +
      "</div>" +
      '<div class="ip-stat">' +
      '<span class="ip-micro">First-quarter holders</span>' +
      '<span class="ip-stat-val ip-stat-val--sm ip-stat-val--plain"><span>' +
      P.esc(IP03.stable.first) + "</span></span>" +
      "</div>" +
      "</div>" +
      '<div class="ip-coh-head"><span>Cohort</span><span></span>' +
      '<span class="ip-r">Share</span><span class="ip-r">Weight</span></div>' +
      rows +
      '<div class="ip-caption ip-caption--tight"><span>' + P.esc(IP03.cohortsNote) + "</span></div>" +
      "</div>"
    );
  }

  /* ============================ §04 · Ownership & stewardship ============================
   * Every value is a prototype literal. The lane chart's x positions were RECOVERED from the
   * captured SVG (the prototype maps filing dates to a time axis we do not have), like §01's
   * dumbbell — read back, never invented. */
  var IP04 = {
    // Quarter gridlines: x and label, straight off the capture.
    laneGrid: [[228.3412, "2025-03"], [344.911, "2025-06"], [461.4807, "2025-09"], [576.7834, "2025-12"]],
    lanes: [
      { name: "Index manager B", form: "SC 13G",
        events: [[215.6706, "10.3%", "initial"], [399.3947, "11.3%", "amendment 1"], [622.3976, "11.6%", "amendment 2"]] },
      { name: "Activist partners LP", form: "SC 13G",
        events: [[223.273, "12.9%", "initial"], [389.2582, "12.5%", "amendment 1"], [630, "13.7%", "amendment 2"]] },
      { name: "Strategic holder Inc.", form: "SC 13G",
        events: [[203, "7.1%", "initial"], [348.7122, "8.1%", "amendment 1"], [448.8101, "7.7%", "amendment 2"], [559.0445, "7.4%", "amendment 3"]] },
    ],
    laneNote:
      "Each lane is one holder above the 5% threshold; the dot is a filing and the figure above it " +
      "the stake reported in that filing. 13D and 13G are the holder\u2019s own categorical choice of " +
      "form, shown as identity, not judgment.",
    filings: [
      { name: "Index manager B", purpose: "Passive — held in the ordinary course of business",
        latest: "Amendment 3 · 2026-03-23", form: "SC 13G", stake: "11.6%" },
      { name: "Activist partners LP", purpose: "Passive — held in the ordinary course of business",
        latest: "Amendment 1 · 2026-02-02", form: "SC 13G", stake: "13.7%" },
      { name: "Strategic holder Inc.", purpose: "Passive — held in the ordinary course of business",
        latest: "Amendment 5 · 2026-06-08", form: "SC 13G", stake: "7.4%" },
    ],
    filingsNote:
      "13D and 13G are categorical filing choices, not a judgment about the holder. Purpose language " +
      "is quoted in condensed form from Item 4.",
    voteTiles: [
      ["Say-on-pay support", "59.5%", true],
      ["Director withhold", "8.3%", true],
      ["Turnout", "80.2%", false],
      ["Ballot items", "5", false],
    ],
    // Ordered by the against share, which is what the micro-label above them says.
    voteItems: [
      { item: "Report on political spending", who: "shareholder", outcome: "not approved", forPct: "16.4%", against: "83.6%", abstain: "0.0%" },
      { item: "Say-on-pay (advisory)", who: "management", outcome: "approved", forPct: "59.5%", against: "40.5%", abstain: "0.0%" },
      { item: "Election of directors (slate)", who: "management", outcome: "all elected", forPct: "91.7%", against: "8.3%", abstain: "0.0%" },
      { item: "Ratification of auditor", who: "management", outcome: "approved", forPct: "97.3%", against: "2.4%", abstain: "0.3%" },
    ],
    voteItemsNote:
      "Every bar is 100% of the shares voted on that item, split for / against / abstain-or-withheld, " +
      "ordered by the against share. Totals are the certified figures in 8-K Item 5.07.",
    dissenters: [
      ["Pension system F", "against say-on-pay", "18.5M"],
      ["Index manager C", "withheld from 2 directors", "9.6M"],
      ["Index manager B", "for the shareholder proposal", "36.3M"],
      ["Index manager A", "against auditor ratification", "27.4M"],
    ],
    votingNote:
      "Outcomes are certified in 8-K Item 5.07. Manager-level votes come from each fund's N-PX and " +
      "are reported for the most recent annual meeting.",
    voteWeighted: [
      ["Voted with management", "46%", "var(--accent)"],
      ["Voted against at least one item", "40%", "var(--gaap-color)"],
      ["No N-PX record", "14%", "var(--ink-soft)"],
    ],
    dissentShares: "310M",
    voteWeightedNote:
      "Shares are matched from 13F-HR to the filing manager's N-PX record for the most recent annual " +
      "meeting, and reconciled against the certified outcome in 8-K Item 5.07 — dissent here is at " +
      "least the institutional portion of the largest against-vote on the ballot. Managers with no " +
      "N-PX on file, including non-fund managers not subject to it, are reported separately rather " +
      "than assumed either way.",
    activism: {
      head: "No SC 13D on file — every holder above the 5% threshold has filed on Schedule 13G.",
      sub: "3 beneficial ownership filings currently on file, all passive · no cooperation or standstill agreement filed as an 8-K exhibit.",
      note:
        "Item 4 is the holder's own stated purpose. Amendments are required when that purpose " +
        "materially changes — the sequence is the record, not an inference.",
    },
  };

  function ipSection04() {
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

  function ip04Beneficial() {
    var rows = IP04.filings
      .map(function (f) {
        return (
          '<div class="ip-bo-row">' +
          '<div class="ip-bo-id">' +
          '<span class="ip-bo-name"><span>' + P.esc(f.name) + "</span></span>" +
          '<span class="ip-bo-purpose"><span>' + P.esc(f.purpose) + "</span></span>" +
          '<span class="ip-bo-latest"><span>' + P.esc(f.latest) + "</span></span>" +
          "</div>" +
          '<span class="ip-bo-form"><span>' + P.esc(f.form) + "</span></span>" +
          '<span class="ip-bo-stake"><span>' + P.esc(f.stake) + "</span></span>" +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="ip-card">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Beneficial ownership filings</h3>' +
      '<span class="ip-card-note">SC 13D / 13G · above the 5% threshold</span>' +
      ipLink("Read the filings ↗", IP_EDGAR_SC13) +
      "</div>" +
      '<div class="ip-subbar ip-subbar--tight">' +
      '<span class="ip-micro">Filing history · stake as reported in each filing</span>' +
      ipChip("04-lanes") +
      "</div>" +
      '<div data-ip-chart="04-lanes">' + ipLaneChart(IP04, 660, 278) + "</div>" +
      '<div class="ip-caption"><span>' + P.esc(IP04.laneNote) + "</span></div>" +
      '<div class="ip-micro ip-micro--block">Current filings on file</div>' +
      rows +
      '<div class="ip-caption">' + P.esc(IP04.filingsNote) + "</div>" +
      "</div>"
    );
  }

  function ip04Voting() {
    var tiles = IP04.voteTiles
      .map(function (t) {
        return (
          '<div class="ip-vtile">' +
          '<span class="ip-micro">' + P.esc(t[0]) + "</span>" +
          '<span class="ip-vtile-val' + (t[2] ? "" : " ip-vtile-val--plain") + '"><span>' +
          P.esc(t[1]) + "</span></span>" +
          "</div>"
        );
      })
      .join("");
    var items = IP04.voteItems
      .map(function (v) {
        return (
          '<div class="ip-vote">' +
          '<div class="ip-vote-head">' +
          '<span class="ip-vote-item"><span>' + P.esc(v.item) + "</span></span>" +
          '<span class="ip-vote-meta"><span>' + P.esc(v.who) + "</span> · <span>" +
          P.esc(v.outcome) + "</span></span>" +
          "</div>" +
          '<div class="ip-vote-bar">' +
          '<div class="ip-vote-for" style="width:' + P.esc(v.forPct) + '"></div>' +
          '<div class="ip-vote-against" style="width:' + P.esc(v.against) + '"></div>' +
          '<div class="ip-vote-abstain" style="width:' + P.esc(v.abstain) + '"></div>' +
          "</div>" +
          '<div class="ip-vote-legend"><span>for <span>' + P.esc(v.forPct) + "</span></span>" +
          "<span>against <span>" + P.esc(v.against) + "</span></span>" +
          "<span>abstain / withheld <span>" + P.esc(v.abstain) + "</span></span></div>" +
          "</div>"
        );
      })
      .join("");
    var dissent = IP04.dissenters
      .map(function (d) {
        return (
          '<div class="ip-vm-row">' +
          '<span class="ip-vm-name"><span>' + P.esc(d[0]) + "</span></span>" +
          '<span class="ip-vm-how"><span>' + P.esc(d[1]) + "</span></span>" +
          '<span class="ip-vm-shares"><span>' + P.esc(d[2]) + "</span></span>" +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="ip-card">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Voting behavior</h3>' +
      '<span class="ip-card-note">8-K Item 5.07 outcomes · manager-level votes from N-PX</span>' +
      ipLink("Read Item 5.07 ↗", IP_EDGAR_8K) +
      ipLink("N-PX ↗", IP_EDGAR_NPX) +
      "</div>" +
      '<div class="ip-vtiles">' + tiles + "</div>" +
      '<div class="ip-micro ip-micro--votes">How each item was voted · ordered by the against share</div>' +
      items +
      '<div class="ip-caption"><span>' + P.esc(IP04.voteItemsNote) + "</span></div>" +
      '<div class="ip-micro ip-micro--dissent">Managers voting against management</div>' +
      dissent +
      '<div class="ip-caption"><span>' + P.esc(IP04.votingNote) + "</span></div>" +
      "</div>"
    );
  }

  function ip04VoteWeighted() {
    var rows = IP04.voteWeighted
      .map(function (r) {
        return (
          '<div class="ip-vw">' +
          '<div class="ip-vw-head"><span class="ip-vw-label"><span>' + P.esc(r[0]) + "</span></span>" +
          '<span class="ip-vw-val"><span>' + P.esc(r[1]) + "</span></span></div>" +
          '<div class="ip-vw-bar"><div class="ip-vw-fill" style="width:' + P.esc(r[1]) +
          ";background:" + r[2] + '"></div></div>' +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Vote-weighted ownership</h3>' +
      '<span class="ip-card-note">13F shares matched to the manager\'s N-PX record</span>' +
      "</div>" +
      rows +
      '<div class="ip-vw-foot">' +
      '<span class="ip-vw-foot-label">Shares behind a dissenting vote</span>' +
      '<span class="ip-vw-foot-val"><span>' + P.esc(IP04.dissentShares) + "</span></span>" +
      "</div>" +
      '<div class="ip-caption ip-caption--tight"><span>' + P.esc(IP04.voteWeightedNote) + "</span></div>" +
      "</div>"
    );
  }

  function ip04Activism() {
    return (
      '<div class="ip-card">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Activism trail</h3>' +
      '<span class="ip-card-note">SC 13D amendments · 8-K Item 1.01 exhibits</span>' +
      ipLink("Read the 13D chain ↗", IP_EDGAR_SC13) +
      "</div>" +
      '<div class="ip-act">' +
      '<span class="ip-act-head"><span>' + P.esc(IP04.activism.head) + "</span></span>" +
      '<span class="ip-act-sub"><span>' + P.esc(IP04.activism.sub) + "</span></span>" +
      "</div>" +
      '<div class="ip-caption"><span>' + P.esc(IP04.activism.note) + "</span></div>" +
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
   * Prototype literals throughout. The cohort heatmap carries BOTH the printed retention and the
   * capture's own fill-opacity per cell: the opacity is computed from the unrounded share, so it
   * is not recoverable from the label (same as §03's peer matrix). */
  var IP05 = {
    stats: [
      ["Register turnover", "26.1%", true, "05-turnover"],
      ["Median holding period", "5.9 quarters", false, "05-tenure"],
    ],
    cohorts: ["1Q24", "2Q24", "3Q24", "4Q24", "1Q25", "2Q25", "3Q25", "4Q25", "1Q26"],
    // Triangular: cohort r has 9-r observed quarters. [printed value, fill-opacity].
    retention: [
      [[100, 0.7], [97, 0.6796], [81, 0.5807], [71, 0.5172], [67, 0.494], [54, 0.4173], [46, 0.3677], [41, 0.3364], [40, 0.3273]],
      [[100, 0.7], [83, 0.5962], [79, 0.5686], [72, 0.524], [64, 0.4744], [54, 0.4154], [52, 0.4035], [48, 0.3797]],
      [[100, 0.7], [82, 0.5913], [73, 0.5302], [67, 0.4935], [63, 0.4682], [51, 0.3932], [44, 0.3502]],
      [[100, 0.7], [88, 0.6255], [74, 0.5393], [60, 0.4492], [54, 0.4123], [46, 0.3665]],
      [[100, 0.7], [84, 0.5999], [74, 0.5358], [67, 0.4969], [64, 0.4772]],
      [[100, 0.7], [83, 0.5941], [78, 0.565], [71, 0.519]],
      [[100, 0.7], [80, 0.5781], [69, 0.508]],
      [[100, 0.7], [82, 0.589]],
      [[100, 0.7]],
    ],
    retentionNote:
      "Each row is the managers that first appeared in the register that quarter; each cell is the " +
      "share of that cohort still reporting a position N quarters later. A manager dropping below " +
      "the $100M reporting threshold reads as an exit.",
    tenure: [
      ["Held 8+ quarters", "27%"],
      ["4–7 quarters", "34%"],
      ["2–3 quarters", "26%"],
      ["First quarter held", "13%"],
    ],
    tenureNote:
      "Computed by matching manager CIKs across consecutive 13F-HR filings. Managers falling below " +
      "the reporting threshold appear as exits.",
    funds: [
      { fund: "Balanced allocation fund", manager: "Index manager B", asOf: "2026-04-30", bar: "26%", ofFund: "0.98%", shares: "15.46M", delta: "↑ +2.1%" },
      { fund: "Dividend appreciation fund", manager: "Active manager D", asOf: "2026-04-30", bar: "46%", ofFund: "1.74%", shares: "9.80M", delta: "↓ −6.9%" },
      { fund: "Total market index fund", manager: "Insurance manager I", asOf: "2026-04-30", bar: "75%", ofFund: "2.86%", shares: "4.14M", delta: "↓ −15.8%" },
      { fund: "Large-cap growth fund", manager: "Index manager A", asOf: "2026-04-30", bar: "95%", ofFund: "3.62%", shares: "23.78M", delta: "↑ +15.2%" },
    ],
    fundsNote:
      "N-PORT reports monthly holdings at the individual fund level, more granular and more current " +
      "than the manager-level 13F. Share counts shown; position values in N-PORT are market-derived " +
      "and excluded here.",
    fundsNote2:
      "Share of fund is the position as a percentage of the fund\u2019s reported portfolio, from the " +
      "same N-PORT filing.",
  };

  function ipSection05() {
    /* The expander bar and what it reveals are GRID ITEMS here, not siblings after the grid — the
     * prototype gives the bar `grid-column: 1 / -1` and lets the grid's own 14px gap space it.
     * Outside the grid it loses that gap, and the whole lower half of the section rides 14px high. */
    return (
      '<div class="ip-grid1">' +
      ip05Persistence() +
      ipExpander("Also in this section", "fund-level N-PORT positions, monthly", ip05Funds()) +
      "</div>"
    );
  }

  function ip05Persistence() {
    var stats = IP05.stats
      .map(function (t) {
        return (
          '<div class="ip-stat">' +
          '<span class="ip-micro">' + P.esc(t[0]) + "</span>" +
          '<span class="ip-stat-val ip-stat-val--19' + (t[2] ? "" : " ip-stat-val--plain") +
          '"><span>' + P.esc(t[1]) + "</span></span>" +
          "</div>"
        );
      })
      .join("");
    var tenure = IP05.tenure
      .map(function (t) {
        return (
          '<div class="ip-coh-row ip-coh-row--3">' +
          '<span class="ip-coh-label"><span>' + P.esc(t[0]) + "</span></span>" +
          '<span class="ip-coh-bar"><span class="ip-coh-fill" style="width:' + P.esc(t[1]) + '"></span></span>' +
          '<span class="ip-coh-share"><span>' + P.esc(t[1]) + "</span></span>" +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Holder persistence</h3>' +
      '<span class="ip-card-note">CIK matched across consecutive 13F-HR filings</span>' +
      ipBadge("05-turnover") + ipBadge("05-tenure") +
      "</div>" +
      '<div class="ip-stat-row ip-stat-row--05">' + stats + "</div>" +
      '<div class="ip-subbar ip-subbar--tight">' +
      '<span class="ip-micro">Retention by entry cohort · % of cohort still reporting</span>' +
      ipChip("05-cohorts") +
      "</div>" +
      ipCohortGrid(IP05, 660, 274) +
      '<div class="ip-caption"><span>' + P.esc(IP05.retentionNote) + "</span></div>" +
      '<div class="ip-micro ip-micro--block">Register today, by tenure</div>' +
      tenure +
      '<div class="ip-caption"><span>' + P.esc(IP05.tenureNote) + "</span></div>" +
      ipDerivationPanel("05-turnover") +
      ipDerivationPanel("05-tenure") +
      "</div>"
    );
  }

  function ip05Funds() {
    var rows = IP05.funds
      .map(function (f) {
        return (
          '<div class="ip-fund-row">' +
          '<span class="ip-fund-id">' +
          '<span class="ip-fund-name"><span>' + P.esc(f.fund) + "</span></span>" +
          '<span class="ip-fund-meta"><span>' + P.esc(f.manager) + "</span> · as of <span>" +
          P.esc(f.asOf) + "</span></span>" +
          '<span class="ip-fund-weight">' +
          '<span class="ip-fund-bar"><span class="ip-fund-fill" style="width:' + P.esc(f.bar) + '"></span></span>' +
          '<span class="ip-fund-pct"><span>' + P.esc(f.ofFund) + "</span> of fund</span>" +
          "</span></span>" +
          '<span class="ip-fund-shares"><span>' + P.esc(f.shares) + "</span></span>" +
          '<span class="ip-fund-delta"><span>' + P.esc(f.delta) + "</span></span>" +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Fund-level positions</h3>' +
      '<span class="ip-card-note">N-PORT · monthly, named funds</span>' +
      ipLink("Read N-PORT ↗", IP_EDGAR_NPORT) +
      "</div>" +
      rows +
      '<div class="ip-caption"><span>' + P.esc(IP05.fundsNote) + "</span> <span>" +
      P.esc(IP05.fundsNote2) + "</span></div>" +
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

  /* ============================ §06 · Register limits & supply ============================ */
  var IP06 = {
    supply: [
      "No lock-up restrictions currently on file",
      "No tender offer on file",
      "No Form 25 or Form 15 filed",
    ],
    // Windows on a shared time axis; x positions recovered from the capture, like §04's lanes.
    timeline: {
      grid: [[233.2381, ""], [311.8901, "Jan 26"], [387.9634, "Mar 26"], [466.6154, "May 26"], [545.2674, "Jul 26"]],
      today: [574.9231, "today"],
      rows: [
        { name: "10b5-1 cooling-off", sub: "Rule 10b5-1 · 90 days", x: 250, w: 116.044,
          mark: 366.044, label: "first trade eligible", anchor: "start" },
        { name: "Next 13F window", sub: "13F-HR · 45 days", x: 543.978, w: 58.022,
          mark: 602, label: "filing deadline", anchor: "end" },
      ],
    },
    timelineNote:
      "Only windows that are actually on file appear here — a row exists when a filing dates it. " +
      "Dates come from the filings themselves. A registration or an expiry establishes when shares " +
      "may be sold; it does not say that any sale occurred.",
    supplyNote:
      "Registration statements establish which shares may be resold; they do not indicate that a " +
      "sale occurred.",
    plans: "6 officers and directors with 10b5-1 plans referenced in the trailing year",
    delinquent: "No Item 405 delinquencies disclosed",
    insiderXrefNote:
      "Section 16 filings are reported in full on their own view. Insider ownership above comes " +
      "from the DEF 14A table, which is dated as of the proxy record date.",
    mechanics: [
      "No confidential treatment requests on file this quarter",
      "14 amended 13F-HR filings restating a prior position",
      "Index-manager share counts stepped up together in 3Q25 — consistent with an index inclusion event",
      "Median filing lag 40 days after quarter end",
    ],
    // Acceptance-lag histogram. Counts recovered from the bar heights and they come out integral,
    // which is the check that the axis was recovered rather than guessed.
    lag: {
      counts: [3, 2, 9, 20, 41, 84, 118, 163, 89, 71, 43, 16, 5, 4],
      axisMax: 163,
      yTicks: ["0", "82", "163"],
      xLabels: [[0, "33"], [2, "35"], [4, "37"], [6, "39"], [8, "41"], [10, "43"], [12, "45"]],
      median: { i: 7, label: "median 40" },
      caption: "days after quarter end",
    },
    lagNote:
      "Distribution of EDGAR acceptance lag across this quarter’s 13F-HR filings, in days after " +
      "quarter end. The statutory deadline is 45 days, so the register is never complete before then.",
    amendments: {
      values: [4.9119, 2.9, 9.8833, 7.8714, 3.972, 10.9553, 8.9434, 6.9315, 6.7995],
      axisMin: 2.9, axisMax: 11.6, color: "var(--gaap-color)",
      ticks: ["2.9", "5.1", "7.3", "9.5", "11.6"],
    },
    quarters9: ["1Q24", "2Q24", "3Q24", "4Q24", "1Q25", "2Q25", "3Q25", "4Q25", "1Q26"],
    amendmentsNote:
      "Amended 13F-HR filings per 100 filings in the register, by quarter. Amendments restate a " +
      "position already reported — a higher rate means the first read of a quarter is less reliable.",
    mechanicsNote: "Mechanics describe the completeness of the register itself, not the company.",
  };

  function ipSection06() {
    return (
      '<div class="ip-grid2">' +
      ip06Supply() +
      ipExpander(
        "Also in this section",
        "insider filings beyond Form 4 · how complete the register itself is",
        '<div class="ip-grid2 ip-grid2--nested">' + ip06Form144() + ip06Mechanics() + "</div>"
      ) +
      "</div>"
    );
  }

  function ip06Supply() {
    return (
      '<div class="ip-card ip-card--flush ip-card--full">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Supply-side events</h3>' +
      '<span class="ip-card-note">S-1 / S-3 · SC TO · Form 25 / 15</span>' +
      "</div>" +
      '<div class="ip-facts">' +
      IP06.supply.map(function (t) { return "<span><span>" + P.esc(t) + "</span></span>"; }).join("") +
      "</div>" +
      '<div class="ip-subbar ip-subbar--windows">' +
      '<span class="ip-micro">Windows and expiries ahead</span>' +
      ipChip("06-windows") +
      "</div>" +
      ipTimeline(IP06.timeline, 660, 154) +
      '<div class="ip-caption"><span>' + P.esc(IP06.timelineNote) + "</span></div>" +
      '<div class="ip-caption ip-caption--10"><span>' + P.esc(IP06.supplyNote) + "</span></div>" +
      "</div>"
    );
  }

  /* Prototype v4 gutted this card. The Form 144 dot calendar, its ⤡ Expand, the notices list and
   * the cooling-off line are all gone from the design — Section 16 moved to a view of its own.
   * Ported as-is, which also retires the largest CANNOT-SOURCE row in 3-implementation.md: we
   * were about to build an honest empty state for a card the design no longer has. */
  function ip06Form144() {
    return (
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Insider filings</h3>' +
      '<span class="ip-card-note">Forms 3/4/5 · Form 144 · Item 405</span>' +
      "</div>" +
      '<div class="ip-plan-line">' + P.esc(IP06.plans) + "</div>" +
      '<div class="ip-plan-line ip-plan-line--soft">' + P.esc(IP06.delinquent) + "</div>" +
      ipGoLink(
        "Insider activity view — ledger, transaction codes, Form 144 notices →",
        "ip-xref-link--block"
      ) +
      '<div class="ip-caption">' + P.esc(IP06.insiderXrefNote) + "</div>" +
      "</div>"
    );
  }

  function ip06Mechanics() {
    return (
      '<div class="ip-card ip-card--flush">' +
      '<div class="ip-card-head ip-card-head--tight">' +
      '<h3 class="ip-card-title">Register mechanics</h3>' +
      '<span class="ip-card-note">completeness of the register itself</span>' +
      "</div>" +
      '<div class="ip-facts ip-facts--7">' +
      IP06.mechanics.map(function (t) { return "<span><span>" + P.esc(t) + "</span></span>"; }).join("") +
      "</div>" +
      '<div class="ip-micro ip-micro--block">Acceptance lag across this quarter’s filings</div>' +
      ipHistogram(IP06.lag, 306, 175) +
      '<div class="ip-caption"><span>' + P.esc(IP06.lagNote) + "</span></div>" +
      '<div class="ip-micro ip-micro--block">Amendments per 100 filings</div>' +
      ipAreaChart(IP06.amendments, IP06.quarters9, 306, 160) +
      '<div class="ip-caption"><span>' + P.esc(IP06.amendmentsNote) + "</span></div>" +
      '<div class="ip-caption ip-caption--10"><span>' + P.esc(IP06.mechanicsNote) + "</span></div>" +
      "</div>"
    );
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
  var IP_TRENDS = {
    residual: {
      title: "Unreported residual",
      value: "32.8%",
      delta: "→ 0.6% over nine quarters",
      quarters: ["1Q24", "2Q24", "3Q24", "4Q24", "1Q25", "2Q25", "3Q25", "4Q25", "1Q26"],
      series: { values: [32.9676, 32.6417, 32.2907, 31.9648, 32.9175, 32.5915, 32.2656, 31.9397, 32.767],
        axisMax: 35.6, color: "var(--accent)", ticks: ["0.0%", "8.9%", "17.8%", "26.7%", "35.6%"] },
    },
    effective: {
      title: "Effective number of holders",
      value: "17",
      delta: "↑ +6.0% over nine quarters",
      quarters: ["1Q24", "2Q24", "3Q24", "4Q24", "1Q25", "2Q25", "3Q25", "4Q25", "1Q26"],
      series: { values: [16.0, 16.2, 16.3, 16.5, 16.6, 16.8, 16.9, 17.0, 17.0],
        axisMax: 18, color: "var(--accent)", ticks: ["0", "5", "9", "14", "18"] },
      measures: [
        ["HHI", "589", "effective holders is 10,000 ÷ HHI", true],
        ["Gini", "0.84", "inequality across holders, from the curve below", true],
        ["Half the register", "7", "managers hold 50%", false],
      ],
    },
  };

  /* Set-intersections (UpSet) view of the overlap card. Eight exclusive combinations; the dot
   * matrix and the connector line are derived from each combination's membership, and the bar
   * scale is the largest count on the prototype's own 150px plot. */
  var IP_UPSET = {
    peers: ["AVGO", "TXN", "NVDA", "AMD"],
    rows: [
      { label: "AVGO + TXN + NVDA", members: [1, 1, 1, 0], n: 283, share: "17%" },
      { label: "AVGO + TXN + NVDA + AMD", members: [1, 1, 1, 1], n: 277, share: "17%" },
      { label: "AVGO + TXN + AMD", members: [1, 1, 0, 1], n: 235, share: "14%" },
      { label: "AVGO + TXN", members: [1, 1, 0, 0], n: 222, share: "13%" },
      { label: "AVGO + NVDA + AMD", members: [1, 0, 1, 1], n: 192, share: "12%" },
      { label: "AVGO + NVDA", members: [1, 0, 1, 0], n: 189, share: "11%" },
      { label: "AVGO + AMD", members: [1, 0, 0, 1], n: 144, share: "9%" },
      { label: "AVGO only", members: [1, 0, 0, 0], n: 127, share: "8%" },
    ],
    ticks: ["0", "142", "283"],
    note:
      "Each bar is the number of managers whose 13F reports exactly that combination — exclusive, " +
      "not cumulative. The bars sum to 1,669, the full AVGO register.",
  };

  var IP_TREEMAP = {
    vb: [660, 343],
    // Squarified layout recovered from the capture. Reimplementing squarify would not reproduce
    // it cell-for-cell; the geometry IS the prototype's, read off its own render.
    cells: [
      [1, 1, 196.8, 341, null, "All other reporting managers", "18.32%"],
      [199.8, 1, 168.03, 197.37, 0.4286, "Index manager A", "9.11%"],
      [199.8, 200.37, 168.03, 141.63, 0.3591, "Index manager B", "6.57%"],
      [369.83, 1, 152.91, 94.84, 0.29, "Pension system F", "4.03%"],
      [369.83, 97.84, 152.91, 89.5, 0.2839, "Active manager E", "3.81%"],
      [524.75, 1, 134.25, 94.44, 0.2764, "Endowment J", "3.53%"],
      [524.75, 97.44, 134.25, 89.89, 0.2718, "Insurance manager I", "3.37%"],
      [369.83, 189.34, 151.51, 79.18, 0.2714, "Active manager D", "3.35%"],
      [369.83, 270.52, 151.51, 71.48, 0.2627, "Index manager C", "3.03%"],
      [523.34, 189.34, 135.66, 78.87, 0.2616, "Hedge fund H", "2.99%"],
      [523.34, 270.21, 135.66, 71.79, 0.2545, "Sovereign fund G", "2.73%"],
    ],
    note:
      "Percentages are of shares outstanding. Managers below the ten largest are grouped; " +
      "affiliated entities that file separately are not consolidated.",
  };

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
        return (
          '<rect x="' + x + '" y="' + y + '" width="' + c[2] * kx + '" height="' + c[3] * ky + '" ' +
          fill + ' stroke="var(--bg-card)" stroke-width="1.5" rx="3"></rect>' +
          '<text x="' + (x + 7) + '" y="' + (y + 16) + '" class="ip-tm-name">' + P.esc(c[5]) + "</text>" +
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
    "02-mix": {
      formula: "Assigned by ClearyFi, not a filed field",
      inputs: [
        ["Basis", "the manager's own registration and fund filings — ADV brochure language, N-PORT fund objectives, 13F cover"],
      ],
      note: "Form 13F contains no strategy field. This label is our judgment and should be treated as such.",
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
    "05-tenure": {
      formula: "Median consecutive quarters a manager appears in the register",
      inputs: [["Appearance history", "13F-HR filings back to 1Q22"]],
      note:
        "Truncated at the start of the observation window: managers holding since before 1Q22 are " +
        "counted from 1Q22.",
    },
    "02-topten": {
      formula: "Shares held by the ten largest reporting managers ÷ all 13F-reported shares",
      inputs: [
        ["Manager holdings", "13F-HR information table"],
        ["Total reported", "sum across all reporting managers"],
      ],
      note:
        "Affiliated entities that file separately are counted separately, which understates " +
        "concentration for large fund families.",
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
    var t = IP_TRENDS[key];
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
    var rows = d.inputs
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
      '<div class="ip-deriv-formula"><span>' + P.esc(d.formula) + "</span></div>" +
      rows +
      '<div class="ip-deriv-note"><span>' + P.esc(d.note) + "</span></div>" +
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
      note: "reporting managers, then shares reported · five quarters",
      render: function (w) {
        return (
          '<div class="ip-micro ip-micro--tight">Reporting managers</div>' +
          ipAreaChart(IP02.managers, IP02.quarters5, w, 260) +
          '<div class="ip-micro ip-micro--tight ip-micro--gap">Shares reported (M)</div>' +
          ipAreaChart(IP02.shares, IP02.quarters5, w, 260)
        );
      },
    },
    "02-panels": {
      title: "Largest managers over time",
      note: "reported shares, nine quarters, one panel per manager",
      render: function () { return '<div class="ip-panels">' + ip02Panels() + "</div>"; },
    },
    "03-flows": {
      title: "Position changes over time",
      note: "shares added above the axis, reduced below · rule marks the net",
      render: function (w) { return ipDivergingBars(IP03.flows, IP03.quarters6, w, 210); },
    },
    /* View-aware, like the prototype's: opening Expand while the treemap is showing opens the
     * TREEMAP, under its own title. Verified by driving both states. */
    "03-ranked": {
      title: function () {
        return ipRankedView === "treemap" ? "Who holds what" : "Cumulative share of the register";
      },
      note: function () {
        return ipRankedView === "treemap"
          ? "area is share of the 13F-reported register"
          : "ranked manager share with the running total, prior quarter ghosted";
      },
      render: function (w) {
        if (ipRankedView !== "treemap") return ipRankedShare(IP03.ranked, w, 460);
        /* ⚠ DEVIATION, listed: the prototype RE-SQUARIFIES the treemap at the modal's aspect, so
         * its cells are arranged differently there. We scale the card's own layout to the modal
         * viewBox instead — every cell keeps its exact share of the area, but not its position.
         * Reproducing the re-squarified arrangement needs the prototype's squarify variant, which
         * its markup does not expose. */
        return ipTreemap(IP_TREEMAP, w, Math.round((w * 658) / 1316));
      },
    },
    "06-windows": {
      title: "Windows and expiries ahead",
      note: "every dated window currently on file",
      render: function (w) { return ipTimeline(IP06.timeline, w, 154); },
    },
    "05-cohorts": {
      title: "Holder persistence by entry cohort",
      note: "share of each entry cohort still reporting N quarters later",
      render: function (w) { return ipCohortGrid(IP05, w, 274); },
    },
    "04-lanes": {
      title: "Beneficial ownership filings",
      note: "one lane per holder above the 5% threshold",
      render: function (w) { return ipLaneChart(IP04, w, 278); },
    },
    /* View-aware, like "03-ranked": Expand opens whichever view the card is showing. Both titles
     * and notes are the prototype's own, driven out of it. */
    "03-matrix": {
      title: function () {
        return ipOverlapView === "sets" ? "Manager set intersections" : "Peer overlap matrix";
      },
      note: function () {
        return ipOverlapView === "sets"
          ? "exclusive combinations across AVGO, TXN, NVDA, AMD"
          : "share of the row issuer's managers that also report the column issuer";
      },
      render: function (w) {
        if (ipOverlapView === "sets") return ipUpset(IP_UPSET, "modal");
        return ipPeerMatrix(IP03.peers, IP03.matrix, Math.round((w * 936) / 1316));
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
  function ipBindAffordances() {
    var view = $("view");
    if (!view) return;
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
    if (view === "treemap") {
      mount.innerHTML = ipTreemap(IP_TREEMAP);
      if (note) note.textContent = IP_TREEMAP.note;
    } else {
      mount.innerHTML = ipRankedShare(IP03.ranked);
      if (note) note.textContent = IP03.rankedNote;
    }
    if (chip) chip.hidden = false;   // the prototype keeps it in both views
  }

  function ipSwitchOverlap(view) {
    ipOverlapView = view;
    var mount = document.querySelector('[data-ip-chart="03-overlap"]');
    var note = document.querySelector('[data-ip-note="03-overlap"]');
    if (!mount) return;
    if (view === "sets") {
      mount.innerHTML = ipUpset(IP_UPSET) + ipCombTable(IP_UPSET);
      if (note) note.textContent = IP_UPSET.note;
    } else {
      mount.innerHTML = ipPeerMatrix(IP03.peers, IP03.matrix);
      if (note) note.textContent = IP03.matrixNote;
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
      '<path d="' + path(spec.prior) + '" fill="none" stroke="var(--mono-muted)" stroke-width="1.5" stroke-dasharray="4 3"></path>' +
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
    // Fitted to the capture: x0 = 38.24, step = 4.2384 reproduces all 61 printed abscissae at the
    // prototype's own one-decimal precision. The interior stops short of X1; the last segment is
    // the jump.
    var x = function (i) { return (38.24 + i * 4.2384).toFixed(1); };
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
      .join(" ") +
      " L" + X1.toFixed(1) + " " + YT.toFixed(1) + " L" + X1.toFixed(1) + " " + YT.toFixed(1);
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
    var heads = labels
      .map(function (t, i) {
        var c = O + i * S + C / 2;
        return (
          '<text x="' + c + '" y="' + 50 * k + '" text-anchor="middle" class="ip-mx-head">' + P.esc(t) + "</text>" +
          '<text x="' + 50 * k + '" y="' + c + '" text-anchor="end" dominant-baseline="middle" class="ip-mx-head">' +
          P.esc(t) + "</text>"
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
