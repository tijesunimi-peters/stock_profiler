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
    instPeriods: null, // 13F quarter-ends with holdings data (Institutional); null = not loaded yet
    tab: "fundamentals",
    statement: "income",
    fundValue: null, // "year|period" selected on Fundamentals
    stmtValue: null, // "year|FY" selected on Statements
    instValue: null, // quarter-end string selected on Institutional
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

  // Deep-link support: /company/{symbol}?tab=insider selects a tab on load (shareable URLs,
  // and lets the e2e check target a tab directly).
  function applyTabFromUrl() {
    var t = new URLSearchParams(location.search).get("tab");
    if (["fundamentals", "statements", "insider", "institutional", "beneficial"].indexOf(t) !== -1) state.tab = t;
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
      $("period-label").textContent = "Fiscal year";
      sel.innerHTML = state.fyYears.map(function (y) { return '<option value="' + y + '|FY">FY ' + y + "</option>"; }).join("");
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
        $("view").innerHTML = institutionalView(period, holders, activity, fromPeriod, caveats);
        // Plot builders return DOM nodes (not HTML strings) -- mount them into the placeholder
        // divs institutionalView()'s markup just landed, same pattern as manager.js's render().
        mountHoldersChart(holders);
        mountActivityChart(period, fromPeriod, activity);
        mountDumbbellChart(period, fromPeriod, holders);
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

  function institutionalView(period, holders, activity, fromPeriod, caveats) {
    return (
      institutionalStandingCaveat() +
      holdersSection(period, holders) + activitySection(period, fromPeriod, activity) + caveatsBlock(caveats)
    );
  }

  function managerLink(cik, name) {
    return '<a href="/manager/' + encodeURIComponent(cik) + '">' + P.esc(name || "CIK " + cik) + "</a>";
  }

  function holdersSection(period, holders) {
    if (!holders.length) {
      return "<h3 class=\"metric-group-title\">Holders as of " + P.esc(quarterLabel(period)) + "</h3>" +
        P.states.empty({ title: "No holders for this quarter", copy: "No manager reported holding this issuer for the selected quarter." });
    }
    // Phase 5.6: reuse of the manager page's composition builders on the issuer side --
    // "who holds this stock," ranked by reported value, plus the same concentration stat
    // tiles reframed for an issuer (holder count / top-1/5/10 share of REPORTED 13F value
    // across ingested filers, never % of shares outstanding or all institutional owners).
    // statTiles is a plain HTML string; the ranked-bar chart is a Plot DOM node mounted into
    // #holders-chart-mount by mountHoldersChart() once this markup lands in the page.
    // The "share of reported 13F value... not shares outstanding... not all institutional
    // owners" precision framing renders once, above, via institutionalStandingCaveat() -- not
    // repeated here (Phase 5 polish: caption dedup).
    var composition =
      '<div class="composition-block">' +
      P.statTiles(holders, {
        rowLabel: "Holders reported",
        totalNote: "Reported 13F value across all ingested filers for this issuer",
      }) +
      '<div id="holders-chart-mount"></div>' +
      "</div>";
    var body = holders.map(function (h) {
      return (
        "<tr>" +
        '<td class="stmt-label">' + managerLink(h.manager_cik, h.manager_name) + "</td>" +
        '<td class="stmt-tag">' + P.esc(h.cusip || "—") + "</td>" +
        '<td class="amt stmt-amt">' + P.esc(h.shares != null ? P.fmt.shares(h.shares) : "—") + "</td>" +
        '<td class="amt stmt-amt">' + P.esc(h.value != null ? P.fmt.usd(h.value) : "—") + "</td>" +
        "</tr>"
      );
    }).join("");
    return (
      '<h3 class="metric-group-title">Holders as of ' + P.esc(quarterLabel(period)) + "</h3>" +
      composition +
      '<table class="stmt-table"><thead><tr><th>Manager</th><th>CUSIP</th>' +
      '<th class="amt">Shares</th><th class="amt">Value</th></tr></thead><tbody>' + body + "</tbody></table>" +
      '<p class="stmt-caption">Reported 13F positions across all ingested managers · quarter-end ' +
      "snapshot, not real-time · long positions in 13(f) securities only.</p>"
    );
  }

  // Appends the Plot-backed composition chart into the placeholder holdersSection() just
  // rendered (Plot returns a DOM node, not a string -- STYLE_GUIDE §6). Skips quietly when
  // there are no holders at all (holdersSection already showed its own empty state and
  // rendered no placeholder), and shows the standard honest empty-state note, instead of a
  // divide-by-zero chart, when nothing here carries a positive reported value.
  function mountHoldersChart(holders) {
    var mount = $("holders-chart-mount");
    if (!mount) return;
    // No captionLead here (Phase 5 polish: caption dedup) -- the "share of reported 13F
    // value... not shares outstanding... not all institutional owners" framing already renders
    // once at the top of the tab via institutionalStandingCaveat(); this chart's own caption
    // carries only its chart-specific mechanics.
    var node = P.compositionBars(holders, {
      topN: 10,
      labelField: "manager_name",
      unknownLabel: "Unknown manager",
      rowNoun: { singular: "holder", plural: "holders" },
      linkField: "manager_cik",
      linkBase: "/manager/",
      captionLead: "",
      width: P.measuredWidth(mount, 640),
    });
    if (node) {
      mount.appendChild(node);
    } else {
      mount.innerHTML = P.states.empty({
        title: "No reported value to chart",
        copy: "These holders carry no usable value field, so composition can't be shown as a share of value.",
      });
    }
  }

  function activitySection(period, fromPeriod, activity) {
    var head = '<h3 class="metric-group-title" style="margin-top:26px">Derived activity vs. prior quarter</h3>';
    if (!activity.length) {
      return head + P.states.empty({
        title: "No prior-quarter comparison",
        copy: "No prior 13F quarter is ingested to diff against — the earliest ingested quarter " +
          "has nothing to compare to. This is a DERIVED view, never reported trades.",
      });
    }
    var body = activity.map(function (a) {
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
    }).join("");
    // Phase 5 polish pass reuse (issuer-centric twin of manager.js's wiring): summary tiles
    // first (headline counts), then the diverging-bars chart (or its <3-changed-rows sentence),
    // then the dumbbell (prior->current % of this issuer's total reported 13F value across
    // ingested filers) -- same order/reasoning as the manager page. Both Plot chart mounts are
    // filled post-innerHTML (Profin.divergingBars/dumbbellChart return DOM nodes); left empty
    // (no visual footprint) when either honestly has nothing to show.
    var tiles = P.activitySummaryTiles(activity);
    var chartMount = '<div id="activity-chart-mount"></div>';
    var dumbbellMount = '<div id="activity-dumbbell-mount"></div>';
    return (
      head + tiles + chartMount + dumbbellMount +
      '<table class="stmt-table"><thead><tr><th>Manager</th><th>Action</th>' +
      '<th class="amt">Shares before</th><th class="amt">Shares after</th><th class="amt">Change</th>' +
      "</tr></thead><tbody>" + body + "</tbody></table>" +
      '<p class="stmt-caption">DERIVED by diffing ' + P.esc(quarterLabel(fromPeriod)) + " → " +
      P.esc(quarterLabel(period)) + " 13F snapshots — never reported trades. Positions that " +
      "opened/closed appear as New/Exited.</p>"
    );
  }

  // Appends the Profin.divergingBars chart into #activity-chart-mount, once activitySection's
  // markup (including that placeholder) is in the DOM. No-ops when the placeholder is absent
  // (the "no prior-quarter comparison" empty state never renders it) or when divergingBars
  // returns null (nothing honest to chart -- e.g. every row was unchanged). Rows are per
  // manager here (the issuer-centric twin of the manager page's per-issuer bars), so the chart
  // is labeled/tooltipped by manager instead of by issuer.
  function mountActivityChart(period, fromPeriod, activity) {
    var mount = $("activity-chart-mount");
    if (!mount) return;
    var node = P.divergingBars(activity, {
      fromLabel: quarterLabel(fromPeriod),
      toLabel: quarterLabel(period),
      fromPeriod: fromPeriod,
      toPeriod: period,
      labelField: "manager_name",
      tipLabelKey: "Manager",
      title: "Derived holder activity",
      width: P.measuredWidth(mount, 640),
    });
    if (node) mount.appendChild(node);
  }

  // Phase 5 polish pass, dumbbell chart (issuer-centric twin of manager.js's): the prior
  // quarter's holders ARE cleanly available here -- `/companies/{symbol}/institutional-holders`
  // takes the same `period=` query param manager.js's `/managers/{cik}/holdings` does, so
  // fetching it for `fromPeriod` is the same one-extra-request pattern, just against the
  // issuer-centric endpoint instead of the manager-centric one. Rows are matched between
  // quarters by (manager_cik, cusip) -- normalize/flows.diff_holders' own key -- not cusip
  // alone, since two different managers holding the same issuer share a cusip. No-ops quietly
  // (never an error state) when there's no prior quarter, or when the fetch fails.
  function mountDumbbellChart(period, fromPeriod, currentHolders) {
    var mount = $("activity-dumbbell-mount");
    if (!mount || !fromPeriod) return;
    var base = "/companies/" + encodeURIComponent(symbol);
    P.api(base + "/institutional-holders?period=" + encodeURIComponent(fromPeriod)).then(
      function (res) {
        var node = P.dumbbellChart(currentHolders, res.holders || [], {
          fromLabel: quarterLabel(fromPeriod),
          toLabel: quarterLabel(period),
          width: P.measuredWidth(mount, 640),
          labelField: "manager_name",
          idField: ["manager_cik", "cusip"],
          unknownLabel: "Unknown manager",
          rowNoun: { singular: "holder", plural: "holders" },
          title: "Prior → current holder allocation",
        });
        if (node) mount.appendChild(node);
      },
      function () { /* prior-quarter fetch failed -- skip the dumbbell, never break the page */ }
    );
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
        var html = CATEGORIES.map(function (cat) {
          var cards = cat[1]
            .filter(function (k) { return by[k]; })
            .map(function (k) { return P.metricCard(by[k], { formula: FORMULAS[k], trend: true, peer: peerBy[k] }); })
            .join("");
          if (!cards) return "";
          return '<section class="metric-group"><h3 class="metric-group-title">' + P.esc(cat[0]) +
            '</h3><div class="card-grid">' + cards + "</div></section>";
        }).join("");
        $("view").innerHTML = banner + peerNote(res[1]) + (html || P.states.empty({}));
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
