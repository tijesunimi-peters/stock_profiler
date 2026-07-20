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

  var CATEGORIES = [
    ["Profitability", ["gross_margin", "operating_margin", "net_margin", "roa", "roe", "roic"]],
    ["Growth", ["revenue_growth_yoy", "earnings_growth_yoy", "ocf_growth_yoy", "growth_acceleration"]],
    ["Financial health", ["current_ratio", "quick_ratio", "debt_to_equity", "net_debt", "interest_coverage"]],
    ["Cash flow", ["fcf", "fcf_margin", "accruals"]],
    ["Efficiency", ["asset_turnover", "inventory_turnover", "dso"]],
    ["Per-share", ["eps_basic", "eps_diluted", "book_value_per_share", "fcf_per_share", "share_count"]],
  ];

  // "At a glance" hero band (dashboard prototype): a handful of headline metrics that answer
  // "how is this company doing?" in one row, spanning profitability / growth / returns / cash /
  // liquidity. Rendered from the same metric objects as the grid, so an N/A stays honestly N/A.
  var GLANCE = [
    ["net_margin", "Net margin"],
    ["revenue_growth_yoy", "Revenue growth"],
    ["roe", "Return on equity"],
    ["fcf", "Free cash flow"],
    ["current_ratio", "Current ratio"],
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
    asset_turnover: "Revenue ÷ Average total assets",
    inventory_turnover: "Cost of revenue ÷ Average inventory",
    dso: "Average receivables ÷ Revenue × 365",
    eps_basic: "Reported basic EPS",
    eps_diluted: "Reported diluted EPS",
    book_value_per_share: "Equity ÷ Shares outstanding",
    fcf_per_share: "Free cash flow ÷ Diluted shares",
    share_count: "Diluted weighted-average shares",
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

  var symbol = decodeURIComponent((location.pathname.split("/").filter(Boolean).pop() || "").trim());
  var state = {
    cik: null,
    stmtPeriods: [], // statement-layer {year, period} keys (for the Statements tab, FY + quarters)
    fundPeriods: [], // {year, period, period_end} the metric engine can compute (Fundamentals)
    instPeriods: null, // 13F quarter-ends with holdings data (Institutional); null = not loaded yet
    tab: "fundamentals",
    statement: "income",
    fundValue: null, // "year|period" selected on Fundamentals
    stmtValue: null, // "year|period" selected on Statements
    instValue: null, // quarter-end string selected on Institutional
    instGroup: "holders", // Institutional sub-view: "holders" | "geography" | "activity"
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
    $("masthead").innerHTML = P.masthead({
      title: symbol ? symbol.toUpperCase() : "Company",
    });
    // Company lookup lives in the app shell's topbar search (script.js); the on-page
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

    $("tabs").addEventListener("click", onTabClick);
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

    $("masthead").innerHTML = P.masthead({
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

  // Deep-link support: /company/{symbol}?tab=insider selects a tab on load, and
  // ?tab=statements&stmt=balance a statement type (shareable URLs, the e2e check, and the
  // /explorer redirect's translated deep links).
  function applyTabFromUrl() {
    var q = new URLSearchParams(location.search);
    var t = q.get("tab");
    if (["fundamentals", "statements", "insider", "institutional", "beneficial"].indexOf(t) !== -1) state.tab = t;
    var s = q.get("stmt");
    if (["income", "balance", "cashflow", "segments"].indexOf(s) !== -1) {
      state.tab = "statements";
      state.statement = s;
      var sBtn = document.querySelector('#stmt-types button[data-stmt="' + s + '"]');
      if (sBtn) setOn("#stmt-types button", sBtn);
    }
    var btn = document.querySelector('#tabs button[data-tab="' + state.tab + '"]');
    if (btn) setOn("#tabs button", btn);
    $("stmt-types").hidden = state.tab !== "statements";
  }

  // Show/populate the shared period picker for the active tab. Insider/13D-G have no period.
  // Institutional IS a period tab, but on an async axis (institutional-periods) that
  // renderInstitutional loads and reveals once ready — so keep the control hidden here.
  function updatePeriodControl() {
    if (NON_PERIOD_TABS.indexOf(state.tab) !== -1 || state.tab === "institutional") {
      $("period-control").hidden = true;
      return;
    }
    $("period-control").hidden = false;
    populatePeriodSelect();
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
    } else if (state.tab === "institutional") {
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
    if (state.tab === "fundamentals") state.fundValue = e.target.value;
    else if (state.tab === "institutional") state.instValue = e.target.value;
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
        recovery: [{ label: "Try AAPL ↗", href: "/company/AAPL" }, { label: "Data coverage ↗", href: "/coverage" }],
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
    updatePeriodControl(); // shows/populates the picker for the tab's own axis (or hides it)
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
    clearSectionNav(); // the "On this page" rail belongs to the fundamentals grid only
    if (state.tab === "fundamentals") renderFundamentals();
    else if (state.tab === "statements") renderStatements();
    else if (state.tab === "insider") renderInsider();
    else if (state.tab === "institutional") renderInstitutional();
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

  // ---------- Institutional (13F) ownership — issuer view ----------

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
    var base = "/companies/" + encodeURIComponent(symbol);
    var metricsP = P.api(base + "/metrics?year=" + sel.year + "&period=" + sel.period);
    // Peer ranks are supplementary — a failure/empty must not break the metric grid.
    var peersP = P.api(base + "/peers?year=" + sel.year + "&period=" + sel.period)
      .catch(function () { return { peers: [] }; });
    Promise.all([metricsP, peersP]).then(
      function (res) {
        var by = {};
        (res[0].metrics || []).forEach(function (m) { by[m.metric] = m; });
        var peerBy = {};
        (res[1].peers || []).forEach(function (p) { peerBy[p.metric] = p; });
        var rendered = []; // categories that actually produced cards -> section-nav targets
        var html = CATEGORIES.map(function (cat) {
          var cards = cat[1]
            .filter(function (k) { return by[k]; })
            .map(function (k) { return P.metricCard(by[k], { formula: FORMULAS[k], trend: true, peer: peerBy[k] }); })
            .join("");
          if (!cards) return "";
          var id = sectionId(cat[0]);
          rendered.push({ id: id, label: cat[0] });
          return '<section class="metric-group" id="' + id + '"><h3 class="metric-group-title">' + P.esc(cat[0]) +
            '</h3><div class="card-grid">' + cards + "</div></section>";
        }).join("");
        $("view").innerHTML = glanceBand(by) + banner + peerNote(res[1]) + (html || P.states.empty({}));
        buildSectionNav(rendered);
        wireTrendPanels();
      },
      function (err) { $("view").innerHTML = metricsError(err); }
    );
  }

  // A one-line honesty note shown above the grid when any peer bar is present.
  function peerNote(peers) {
    if (!peers || !peers.peers || !peers.peers.length) return "";
    return '<p class="stmt-caption" style="margin:0 0 14px">Peer bars show each metric\'s percentile ' +
      "within its " + P.esc(peers.peer_basis || "SIC") + " peer group — position among peers, not a " +
      "good/bad verdict (for some metrics a higher value is not “better”). Ranks exclude N/A peers.</p>";
  }

  // "At a glance" hero band: the GLANCE metrics as prominent stat tiles above the full grid,
  // giving a 5-second read before the exhaustive card grid. Reuses the .stat-tile visual
  // vocabulary; each tile carries the same status glyph + basis as its card, so honesty is
  // preserved (an N/A metric shows N/A here too). Skipped entirely if none resolve.
  function glanceBand(by) {
    var tiles = GLANCE.map(function (g) {
      var mv = by[g[0]];
      if (!mv) return "";
      var f = P.fmtMetric(mv);
      var st = P.STATUS[mv.status] || P.STATUS.ok;
      var basis = mv.basis === "TTM" ? "TTM" : "As-of";
      return (
        '<div class="glance-tile' + (f.drained ? " drained" : "") + '">' +
        '<span class="glance-label">' + P.esc(g[1]) + "</span>" +
        '<span class="glance-value">' + P.esc(f.text) + "</span>" +
        '<span class="glance-foot"><span class="glance-dot glance-' + mv.status + '">' + st.glyph + "</span>" +
        P.esc(basis) + "</span></div>"
      );
    }).join("");
    if (!/glance-tile/.test(tiles)) return "";
    return (
      '<section class="glance">' +
      '<div class="glance-eyebrow">At a glance</div>' +
      '<div class="glance-tiles">' + tiles + "</div></section>"
    );
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

  function buildSectionNav(cats) {
    clearSectionNav();
    var side = document.getElementById("appSide");
    if (!side || !cats.length) return;
    var foot = side.querySelector(".app-side-foot");
    var nav = document.createElement("nav");
    nav.id = "sectionNav";
    nav.className = "side-group section-nav";
    nav.setAttribute("aria-label", "On this page");
    nav.innerHTML =
      '<div class="side-group-label">On this page</div>' +
      cats.map(function (c) {
        return '<a class="side-link section-link" href="#' + c.id + '">' + P.esc(c.label) + "</a>";
      }).join("");
    // Sit above the pinned footer (which uses margin-top:auto), below the primary nav groups.
    if (foot) side.insertBefore(nav, foot); else side.appendChild(nav);

    // Scroll-spy: highlight the section whose heading is nearest the top of the viewport.
    var links = {};
    nav.querySelectorAll(".section-link").forEach(function (a) {
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

  // Expandable multi-year trend per metric card (Phase 1b). Lazy: the fuller chart +
  // Tier-2 signals load from /metrics/{metric}/history only when a card's Trend panel is
  // first opened. `?trend=<metric>` auto-opens one panel (shareable / e2e-targetable).
  var pendingTrend = new URLSearchParams(location.search).get("trend");

  function wireTrendPanels() {
    document.querySelectorAll("#view .trend-panel[data-metric]").forEach(function (panel) {
      panel.addEventListener("toggle", function () {
        if (!panel.open || panel.getAttribute("data-loaded")) return;
        panel.setAttribute("data-loaded", "1");
        loadTrend(panel);
      });
    });
    if (pendingTrend) {
      var p = document.querySelector('#view .trend-panel[data-metric="' + pendingTrend + '"]');
      pendingTrend = null; // one-shot: don't re-open when the period changes
      if (p && !p.open) p.open = true; // fires 'toggle' -> loads
    }
  }

  function loadTrend(panel) {
    var metric = panel.getAttribute("data-metric");
    var body = panel.querySelector(".trend-body");
    body.innerHTML = P.states.loading({ title: "Loading trend", note: "" });
    P.api("/companies/" + encodeURIComponent(symbol) + "/metrics/" + encodeURIComponent(metric) + "/history?frequency=annual").then(
      function (hist) {
        if (!hist.points || !hist.points.length) {
          body.innerHTML = P.states.empty({ title: "No history", copy: "No annual history is on record for this metric yet." });
          return;
        }
        body.innerHTML = P.trendChart(hist);
      },
      function (err) { body.innerHTML = P.states.error({ copy: "Couldn't load trend (" + (err.status || "network") + ")." }); }
    );
  }

  function metricsError(err) {
    var sel = currentSel();
    var lbl = sel ? "FY" + sel.year + (sel.period === "FY" ? "" : " " + sel.period) : "";
    if (err.status === 404) {
      return P.states.notFound({ copy: "No metrics for " + symbol.toUpperCase() + " " + lbl + ". Try another period." });
    }
    return P.states.error({ copy: "Couldn't compute metrics (" + (err.status || "network") + ")." });
  }

  function renderStatements() {
    $("legend").innerHTML = ""; // statements carry EXT badges, not status chips
    $("disclosure").innerHTML = P.disclosure(["financials_floor", "not_advice"]);
    if (state.statement === "segments") { renderSpikeSegments(); return; }
    var sel = currentSel();
    if (!sel) {
      $("view").innerHTML = P.states.empty({ title: "No period", copy: "No filed period on record to show a statement for." });
      return;
    }
    var periodLabel = sel.period === "FY" ? "FY" + sel.year : "FY" + sel.year + " " + sel.period;
    $("view").innerHTML = P.states.loading({ title: "Loading statement" });
    P.api("/companies/" + encodeURIComponent(symbol) + "/statements/" + state.statement + "?year=" + sel.year + "&period=" + encodeURIComponent(sel.period)).then(
      function (stmt) {
        if (!stmt.lines || !stmt.lines.length) {
          $("view").innerHTML = P.states.empty({ title: "No mapped lines", copy: "A filing is on record for this period, but no fields mapped to this statement." });
          return;
        }
        $("view").innerHTML = statementView(stmt, periodLabel);
        wireStatementView(stmt);
      },
      function (err) {
        if (err.status === 404) {
          $("view").innerHTML = P.states.notFound({ copy: "No " + state.statement + " statement for " + periodLabel + ". Try another period." });
        } else {
          $("view").innerHTML = P.states.error({});
        }
      }
    );
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
    $("view").innerHTML = P.states.loading({ title: "Loading spike extract" });
    fetch("/static/spike_dimensional.json")
      .then(function (r) { return r.json(); })
      .then(function (d) { spikeData = d; renderSpikeView(); })
      .catch(function () {
        $("view").innerHTML = P.states.error({ copy: "Could not load the static spike extract." });
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
      $("view").innerHTML = '<div class="state">' + banner +
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

    $("view").innerHTML = '<div class="state spike-card">' + banner + head +
      '<div class="spike-table">' + table + "</div>" + footnote + "</div>";
    $("view").querySelectorAll("[data-axis]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.spikeAxis = btn.getAttribute("data-axis");
        renderSpikeView();
      });
    });
  }

  init();
})();
