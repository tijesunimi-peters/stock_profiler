"""Anchor taxonomies for embedding-cosine classification (Track 2 Wave B §8.1/§8.3).

The last piece of §8.4 step 1's scope ("anchor-corpus authoring") plus the taxonomy content step 4
needs to wire against. Each anchor is a short, human-written description of the CONCEPT a theme or
CAM topic covers -- embedded once (lazily, cached per-process, `normalize/theme_classifier.py`),
never per-filing -- and a filing's sentences are scored against these by cosine similarity, not
literal keyword match. Checked in as plain Python (not a serialized vector blob) so the anchor TEXT
stays the single source of truth and always regenerates the same vectors from the same model --
same discipline `afinn_wordlist.txt` gives the tone lexicon, adapted for content that's short
enough to live directly in source rather than a separate data file.

## Risk themes: `QUAL_THEMES`' 9 names, not a new list

These are the EXACT 9 theme names already live in `clearyfi_frontend/app/data/qualitative.ts`'s
`QUAL_THEMES` fixture -- `docs/ROADMAP_TRACK2.md` §8.4 step 4 names `QUAL_THEMES` explicitly as
what this wires against, so inventing a different list here would silently diverge from the UI
that's meant to consume it. **This does NOT resolve §5's still-open "theme taxonomy ownership"
decision** -- these 9 were authored as sector-agnostic PROTOTYPE content (illustrated with
semiconductor-industry examples) and may read oddly against a non-tech filer; broadening or
revising the list stays a separate, later call, not made here.

## CAM topics: extends `CAMS`' 5 names, not a wholesale replacement

The first 5 entries are `CAMS`' existing fixture names, verbatim, for the same continuity reason.
The remaining ~9 are standard categories from audit literature and PCAOB inspection reports, cross-
checked against the real CAM matters this project has actually extracted (Wave B step 3's spike):
Apple's "Uncertain Tax Positions", Microsoft's "Revenue Recognition" and "Income Taxes -- Uncertain
Tax Positions", JPMorgan's "Allowance for Loan Losses" and "Fair Value of Certain Level 3 Financial
Instruments" all map cleanly onto an entry below -- not guessed blind.
"""

from __future__ import annotations

from dataclasses import dataclass

#: Bumped whenever an anchor's description text changes, or an entry is added/removed/renamed --
#: forces every stored classification to re-derive rather than silently drifting against an anchor
#: set that no longer matches what produced it. Distinct from EMBEDDINGS_SCHEMA_VERSION (that one
#: tracks the embedding MODEL; this one tracks the anchor CONTENT).
#:
#: 1 -- initial 9 risk themes (QUAL_THEMES) + 14 CAM topics (extends CAMS' 5).
TAXONOMY_VERSION = 1


@dataclass(frozen=True)
class ThemeAnchor:
    name: str
    description: str


#: Verbatim `QUAL_THEMES` names -- see the module docstring for why this list isn't authored fresh.
RISK_THEMES: tuple[ThemeAnchor, ...] = (
    ThemeAnchor(
        "Foundry / supply concentration",
        "Reliance on a limited number of third-party foundries or contract manufacturers for "
        "production capacity, creating exposure if a key supplier's capacity is disrupted or "
        "unavailable.",
    ),
    ThemeAnchor(
        "Export controls & geopolitics",
        "Restrictions on international trade, including export controls, tariffs, sanctions, and "
        "geopolitical tensions that could affect cross-border operations, sales, or supply chains.",
    ),
    ThemeAnchor(
        "Customer concentration",
        "A significant portion of revenue is derived from a small number of large customers, "
        "creating dependence on their continued purchasing decisions.",
    ),
    ThemeAnchor(
        "Cyclical demand / inventory",
        "Product demand fluctuates with economic or industry cycles, creating risk of excess or "
        "obsolete inventory during downturns.",
    ),
    ThemeAnchor(
        "Talent & skilled labor",
        "Difficulty attracting, retaining, or hiring employees with the specialized technical "
        "skills the business needs to operate and compete.",
    ),
    ThemeAnchor(
        "Capital intensity",
        "The business requires substantial ongoing capital expenditures for equipment, facilities, "
        "or infrastructure in order to remain competitive.",
    ),
    ThemeAnchor(
        "IP & patent litigation",
        "Exposure to intellectual property infringement claims, patent litigation, or challenges "
        "protecting the company's own proprietary technology.",
    ),
    ThemeAnchor(
        "AI-demand dependence",
        "Revenue growth is increasingly dependent on demand for artificial intelligence products, "
        "services, or supporting infrastructure.",
    ),
    ThemeAnchor(
        "Water / energy for fabs",
        "Manufacturing operations rely on significant water and energy resources, exposing the "
        "business to resource scarcity, regulation, or cost increases.",
    ),
)

#: First 5 entries are `CAMS`' existing fixture names verbatim -- see the module docstring.
CAM_TOPICS: tuple[ThemeAnchor, ...] = (
    ThemeAnchor(
        "Revenue recognition (multiple-element)",
        "Judgment in the timing or measurement of revenue recognized from contracts with multiple "
        "performance obligations or elements.",
    ),
    ThemeAnchor(
        "Inventory valuation / excess & obsolete",
        "Judgment in estimating net realizable value of inventory and reserves for excess or "
        "obsolete inventory.",
    ),
    ThemeAnchor(
        "Goodwill & intangible impairment",
        "Judgment in estimating the fair value of a reporting unit or intangible asset to test "
        "goodwill or intangible assets for impairment.",
    ),
    ThemeAnchor(
        "Income taxes / uncertain positions",
        "Judgment in evaluating uncertain tax positions and estimating related tax reserves across "
        "multiple jurisdictions.",
    ),
    ThemeAnchor(
        "Business-combination purchase accounting",
        "Judgment in valuing and allocating the purchase price to assets acquired and liabilities "
        "assumed in a business combination.",
    ),
    ThemeAnchor(
        "Allowance for credit / loan losses",
        "Judgment in estimating expected credit losses on loans or receivables using forecasted "
        "macroeconomic assumptions and internally developed models.",
    ),
    ThemeAnchor(
        "Fair value of Level 3 financial instruments",
        "Valuation of financial instruments using significant unobservable inputs and internally "
        "developed valuation models.",
    ),
    ThemeAnchor(
        "Litigation and legal contingencies",
        "Judgment in estimating the probability and amount of loss for pending litigation, claims, "
        "or regulatory matters.",
    ),
    ThemeAnchor(
        "Warranty and product liability reserves",
        "Judgment in estimating reserves for product warranty claims or product liability "
        "exposure.",
    ),
    ThemeAnchor(
        "Insurance reserves and claims liabilities",
        "Actuarial judgment in estimating insurance policy reserves or claims liabilities.",
    ),
    ThemeAnchor(
        "Long-lived asset impairment",
        "Judgment in testing property, plant, and equipment or other long-lived assets for "
        "impairment.",
    ),
    ThemeAnchor(
        "Pension and postretirement obligations",
        "Actuarial assumptions used to measure pension or other postretirement benefit "
        "obligations.",
    ),
    ThemeAnchor(
        "Stock-based compensation valuation",
        "Judgment in valuing complex equity awards or performance-based compensation "
        "arrangements.",
    ),
    ThemeAnchor(
        "Revenue-related variable consideration",
        "Judgment in estimating variable consideration such as rebates, discounts, or product "
        "returns against revenue.",
    ),
)
