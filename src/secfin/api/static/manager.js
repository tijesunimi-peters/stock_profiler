/* Manager (13F filer) profile — /manager/{cik}. One manager's holdings snapshot + DERIVED
 * activity + co-filer roster, over the v1 API, built from the shared Profin components
 * (app.js). Sibling of the company hub's Institutional tab (issuer view); this is the
 * manager-centric view. Everything here renders what the API returns — no derived logic.
 */
(function () {
  "use strict";
  var P = window.Profin;
  var $ = function (id) { return document.getElementById(id); };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var ACTION_LABEL = { new: "New", added: "Added", reduced: "Reduced", exited: "Exited", unchanged: "Unchanged" };

  var cik = decodeURIComponent((location.pathname.split("/").filter(Boolean).pop() || "").trim());
  var state = { periods: [], value: null, name: null };

  function quarterLabel(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    return MONTHS[parseInt(p[1], 10) - 1] + " " + parseInt(p[2], 10) + ", " + p[0];
  }

  function setMasthead() {
    $("masthead").innerHTML = P.masthead({
      eyebrow: "Profin — 13F manager profile",
      title: state.name || "Manager CIK " + cik,
      meta: ["CIK " + cik, "13F holdings — quarter-end snapshot"],
    });
  }

  function init() {
    $("footer").innerHTML = P.footer();
    setMasthead();
    P.mountSearch($("search"), {
      onResolved: function (sym) { location.href = "/company/" + encodeURIComponent(sym); },
      onNotFound: function (sym) { $("view").innerHTML = P.states.notFound({ copy: 'We don\'t carry "' + sym + '".' }); },
      onError: function () { $("view").innerHTML = P.states.error({}); },
    });

    if (!cik || !/^\d+$/.test(cik)) {
      $("view").innerHTML = P.states.empty({ title: "No manager", copy: "A numeric 13F filer CIK is required in the URL, e.g. /manager/1067983." });
      return;
    }

    $("view").innerHTML = P.states.loading({ title: "Loading 13F quarters" });
    $("period-select").addEventListener("change", onPeriodChange);
    loadPeriods();
  }

  function loadPeriods() {
    P.api("/managers/" + encodeURIComponent(cik) + "/periods").then(
      function (res) {
        state.periods = res.periods || [];
        if (!state.periods.length) {
          $("disclosure").innerHTML = P.disclosure(["institutional_13f", "not_advice"]);
          $("view").innerHTML = P.states.empty({
            title: "No 13F holdings ingested",
            copy: "No 13F holdings snapshot has been ingested for this manager yet. Read as " +
              "outside coverage, not that the manager never filed — 13F is a ~45-day-lagged " +
              "quarter-end snapshot, visible here only once ingested.",
          });
          return;
        }
        state.value = state.periods[0];
        populate();
        $("controls").hidden = false;
        render();
      },
      function (err) {
        if (err.status === 401) P.mountNeedsKey($("view"), loadPeriods);
        else $("view").innerHTML = P.states.error({ copy: "Couldn't load 13F quarters (" + (err.status || "network") + ")." });
      }
    );
  }

  function populate() {
    $("period-select").innerHTML = state.periods
      .map(function (q) { return '<option value="' + P.esc(q) + '">' + P.esc(quarterLabel(q)) + "</option>"; })
      .join("");
    if (state.value) $("period-select").value = state.value;
  }

  function onPeriodChange(e) { state.value = e.target.value; render(); }

  function render() {
    var period = state.value;
    $("disclosure").innerHTML = P.disclosure(["institutional_13f", "not_advice"]);
    $("view").innerHTML = P.states.loading({ title: "Loading holdings for " + quarterLabel(period) });
    var base = "/managers/" + encodeURIComponent(cik);
    Promise.all([
      P.api(base + "/holdings?period=" + encodeURIComponent(period)),
      P.api(base + "/activity?period=" + encodeURIComponent(period)),
    ]).then(
      function (res) {
        var snapshot = res[0], act = res[1];
        if (snapshot.manager_name && snapshot.manager_name !== state.name) {
          state.name = snapshot.manager_name;
          setMasthead();
        }
        $("view").innerHTML =
          rosterSection(snapshot.other_managers || []) +
          holdingsSection(period, snapshot) +
          activitySection(period, act.from_period, act.activity || []) +
          caveatsBlock(act.caveats || []);
        mountCompositionChart(snapshot.holdings || []);
        mountActivityChart(period, act.from_period, act.activity || []);
      },
      function (err) {
        if (err.status === 401) P.mountNeedsKey($("view"), render);
        else if (err.status === 404) {
          $("view").innerHTML = P.states.empty({ title: "No snapshot for this quarter", copy: "No 13F snapshot is on record for the selected quarter." });
        } else {
          $("view").innerHTML = P.states.error({ copy: "Couldn't load holdings (" + (err.status || "network") + ")." });
        }
      }
    );
  }

  function issuerCell(h) {
    var name = h.issuer_name || "—";
    if (h.cik) return '<a href="/company/' + encodeURIComponent(h.cik) + '">' + P.esc(name) + "</a>";
    return P.esc(name);
  }

  function holdingsSection(period, snapshot) {
    var holdings = snapshot.holdings || [];
    var head = '<h3 class="metric-group-title">Holdings as of ' + P.esc(quarterLabel(period)) + "</h3>";
    if (!holdings.length) {
      return head + P.states.empty({ title: "No positions", copy: "This 13F snapshot reports no positions." });
    }
    // 5.1/5.2: composition bars (top-10 by value + "Other") and concentration stat tiles, above
    // the holdings table. statTiles is a plain HTML string; the bar chart is a Plot DOM node
    // mounted into #composition-chart-mount by mountCompositionChart() once this markup lands
    // in the page (called from render(), right after this string is assigned to innerHTML).
    var composition =
      '<div class="composition-block">' +
      P.statTiles(holdings) +
      '<div id="composition-chart-mount"></div>' +
      "</div>";
    var body = holdings.map(function (h) {
      return (
        "<tr>" +
        '<td class="stmt-label">' + issuerCell(h) + "</td>" +
        '<td class="stmt-tag">' + P.esc(h.cusip || "—") + "</td>" +
        '<td class="amt stmt-amt">' + P.esc(h.shares != null ? P.fmt.shares(h.shares) : "—") + "</td>" +
        '<td class="amt stmt-amt">' + P.esc(h.value != null ? P.fmt.usd(h.value) : "—") + "</td>" +
        "</tr>"
      );
    }).join("");
    var caption = "Reported 13F positions · quarter-end snapshot" +
      (snapshot.filed ? " · filed " + P.esc(snapshot.filed) : "") +
      (snapshot.accession ? " · " + P.esc(snapshot.accession) : "") +
      (snapshot.is_amendment ? " · amendment" : "");
    return (
      head +
      composition +
      '<table class="stmt-table"><thead><tr><th>Issuer</th><th>CUSIP</th>' +
      '<th class="amt">Shares</th><th class="amt">Value</th></tr></thead><tbody>' + body + "</tbody></table>" +
      '<p class="stmt-caption">' + caption + "</p>"
    );
  }

  // Appends the Plot-backed composition chart into the placeholder holdingsSection() just
  // rendered (Plot returns a DOM node, not a string -- see STYLE_GUIDE §6). Skips quietly when
  // there are no holdings at all (holdingsSection already showed its own empty state and
  // rendered no placeholder), and shows the standard honest empty-state note, instead of a
  // divide-by-zero chart, when nothing here carries a positive reported value.
  function mountCompositionChart(holdings) {
    var mount = $("composition-chart-mount");
    if (!mount) return;
    var node = P.compositionBars(holdings, { topN: 10 });
    if (node) {
      mount.appendChild(node);
    } else {
      mount.innerHTML = P.states.empty({
        title: "No reported value to chart",
        copy: "This snapshot's positions carry no usable value field, so composition can't be shown as a share of value.",
      });
    }
  }

  function activitySection(period, fromPeriod, activity) {
    var head = '<h3 class="metric-group-title" style="margin-top:26px">Derived activity vs. prior quarter</h3>';
    if (!activity.length) {
      return head + P.states.empty({
        title: "No prior-quarter comparison",
        copy: "No prior 13F quarter is ingested to diff against. This is a DERIVED view, never reported trades.",
      });
    }
    var body = activity.map(function (a) {
      var before = a.shares_before != null ? P.fmt.shares(a.shares_before) : "—";
      var after = a.shares_after != null ? P.fmt.shares(a.shares_after) : "—";
      var chg = a.shares_change != null ? signedShares(a.shares_change) : "—";
      var issuer = a.cik ? '<a href="/company/' + encodeURIComponent(a.cik) + '">' + P.esc(a.issuer_name || "—") + "</a>" : P.esc(a.issuer_name || "—");
      return (
        "<tr>" +
        '<td class="stmt-label">' + issuer + "</td>" +
        '<td class="stmt-tag">' + P.esc(a.cusip || "—") + "</td>" +
        "<td>" + P.esc(ACTION_LABEL[a.action] || a.action || "—") + "</td>" +
        '<td class="amt stmt-amt">' + P.esc(before) + "</td>" +
        '<td class="amt stmt-amt">' + P.esc(after) + "</td>" +
        '<td class="amt stmt-amt">' + P.esc(chg) + "</td>" +
        "</tr>"
      );
    }).join("");
    // Chart mount point (Phase 5.3): filled by mountActivityChart() after this markup lands in
    // the DOM, above the table -- Profin.divergingBars returns a DOM node (Plot renders SVG),
    // so it's appended post-innerHTML rather than built into this HTML string. Left empty (no
    // visual footprint) when divergingBars honestly has nothing to chart.
    var chartMount = '<div id="activity-chart-mount"></div>';
    return (
      head + chartMount +
      '<table class="stmt-table"><thead><tr><th>Issuer</th><th>CUSIP</th><th>Action</th>' +
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
  // returns null (nothing honest to chart -- e.g. every row was unchanged).
  function mountActivityChart(period, fromPeriod, activity) {
    var mount = $("activity-chart-mount");
    if (!mount) return;
    var node = P.divergingBars(activity, {
      fromLabel: quarterLabel(fromPeriod),
      toLabel: quarterLabel(period),
      fromPeriod: fromPeriod,
      toPeriod: period,
    });
    if (node) mount.appendChild(node);
  }

  function rosterSection(managers) {
    if (!managers.length) return "";
    var items = managers.map(function (m) {
      return "<li>" + P.esc(m.name || "—") + (m.file_number ? " <span class=\"stmt-tag\">(" + P.esc(m.file_number) + ")</span>" : "") + "</li>";
    }).join("");
    return (
      '<details class="disclosure" open style="margin-bottom:18px"><summary>Co-filing managers (' +
      managers.length + ")</summary><ul>" + items +
      "</ul><p class=\"stmt-caption\">Managers on this filing's cover-page roster; individual positions may " +
      "attribute discretion to them.</p></details>"
    );
  }

  function signedShares(v) {
    if (v === 0) return "0";
    return (v > 0 ? "+" : "−") + P.fmt.shares(Math.abs(v));
  }

  function caveatsBlock(caveats) {
    if (!caveats || !caveats.length) return "";
    var items = caveats.map(function (c) { return "<li>" + P.esc(c) + "</li>"; }).join("");
    return '<details class="disclosure" style="margin-top:18px"><summary>13F caveats (always apply)</summary><ul>' + items + "</ul></details>";
  }

  init();
})();
