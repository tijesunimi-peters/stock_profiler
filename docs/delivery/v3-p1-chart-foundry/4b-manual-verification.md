# 4b — Operator manual verification: V3-P1 peer distribution strip

**Purpose:** your hands-on acceptance of the change QA reported. QA's own evidence never counts as
acceptance — this file records yours.

| | |
|---|---|
| **Branch** | `v3-p1-chart-foundry` |
| **QA verdict** | ✅ PASS (18/18 in-scope ACs) |
| **Operator verdict** | ✅ **CONFIRMED — accepted 2026-07-26**, after 2 fix cycles |
| **Classification** | **Interactive/logic change → blocking.** Not accept-at-QA-level |
| **Start the app** | `docker compose build api && docker compose up api` |
| **Open** | http://localhost:8000/sectors?view=company and http://localhost:8000/components |

> **The load-bearing rule for this change:** a dot's position must **mean** something. The old
> version placed peers vertically by their position in a list — pure decoration. If re-focusing
> makes the peers jump around, that promise is broken and this fails.

---

## Checklist

| # | Step | Expected result | AC | Result (✅/❌) | Notes |
|---|---|---|---|---|---|
| 1 | Open `/sectors?view=company`. Look at any metric card | A band (middle half), a vertical median line, small grey dots for filers, one terracotta **diamond** for the focal filer | 1, 9 | ✅ | confirmed in the walkthrough |
| 2 | Ignore colour — squint or imagine greyscale. Find the focal filer | The diamond is findable by **shape and size** alone, not because it's the coloured one | 3 | ✅ | confirmed in the walkthrough |
| 3 | Note where a few dots sit. **Click a different dot** | Focal switches to that filer (breadcrumb, snapshot, percentiles update) **and the other dots stay exactly where they were** — only the diamond moves | 4, 11 | ✅ | confirmed in the walkthrough |
| 4 | Click 2–3 more dots in a row | Same each time; no reshuffling, no drift, no flicker | 4 | ✅ | confirmed in the walkthrough |
| 5 | Hover a dot | Tooltip names the filer and its value | — | | |
| 6 | Click a sparkline in a metric header | The trailing-trend panel still opens (unchanged behaviour) | 18 | | |
| 7 | Narrow the window to phone width | Cards stack; strips stay inside their card; no clipped labels, no sideways page scroll | 17 | | |
| 8 | Tab through the page | Focus is visible on interactive marks; nothing is a keyboard trap | — | | |
| 9 | Open `/components`, scroll to **06 Peer distribution strip** | Five cards render: with focal, without focal, some-filers-excluded, nothing-comparable, one-filer | 16 | | |
| 10 | Read the **"some filers have no comparable value"** caption | Says *"3 of 9 filers are excluded — no comparable value reported (N/A or N/M), not a zero"* — the excluded ones are **counted, not hidden** | 7a | | |
| 11 | Read the **"only one comparable filer"** card | Shows the single value with **no** median line and **no** band, and explains why neither is meaningful from one value | 8 | | |
| 12 | Honesty scan across every card | No dot sits at zero standing in for missing data; nothing is coloured good/bad; no number appears without its basis | 6, 7a | | |

## Known and accepted (not defects)

- **Peer counts don't say what was excluded** in the sector app — e.g. "11 filers" won't tell you
  how many were dropped as N/A. The API strips those server-side and returns no count. Recorded in
  `docs/BUILDER_INVENTORY.md`; needs a small backend change, targeted at V3-P4/P5. **AC-7b, out of
  scope here.**
- The e2e suite still reports FAIL overall — pre-existing Company-view 502s in the offline test
  sandbox, unrelated to this change. This change actually fixed four previously-failing shots.
- The app is single-theme; there is no dark mode to check.

---

## Sign-off

**Verdict** (tick one):

- [x] **Confirmed** — drove it, accepted
- [ ] **Accepted at QA-tester level** — didn't hand-run; QA's evidence stands
- [ ] **Defect found** — details below (→ loops back to the engineer, `qa_cycles` +1)

**Operator:** tijesunimi-peters  **Date:** 2026-07-26

**Discrepancies found and resolved during the walkthrough (2 cycles):**

```
CYCLE 1 — "Take the colour scheme back to what it was" / "Take it back to what it was" /
          "The previous metrics look and behaviour is better."
  -> The engineer had restyled four things the brief never asked for (band fill, dot size+
     colour, focal size+stroke, min/median/max moved into the chart). All restored.
     Scope confirmed with the operator first: restore the look, KEEP the density-derived
     placement. Index jitter did not come back.

CYCLE 2 — "I don't see the grid any longer" -> "I mean the chart grid"
          -> "Make it look exactly like the updated prototype"
  -> Not the baseline hairline (guess 1) and not gridlines (guess 2): it was the prototype's
     TINTED PLOT PANEL. Resolved by reading prototype.dc.html peerDots() (line 5494) and
     matching it field by field -- container, band, median tick, dots, focal lozenge, 8%
     padded scale, no gridlines.

FINAL — operator confirmed the strip matches the prototype and accepted.
  Walkthrough checks: look restored, caption restored, click re-focuses, peers stay put.
```
