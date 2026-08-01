"""Classify a 13F filer's own SIC code into a display bucket.

Every EDGAR filer carries an SIC code in the top level of its `/submissions/CIK##########.json`
(`sic`, `sicDescription`) -- the same two fields `ingest/sic_backfill.py` already reads for
issuers. A 13F manager is an EDGAR filer, so this is the only manager classification that
covers the WHOLE register rather than the few filers who cross 5% and file a Schedule 13D/G.

This is where the raw code is interpreted, at the serve/UI edge, so `sec/` stays free of
business logic -- the same split as `geography.py` (filer HQ) and `segment_geography.py`
(ASC 280 revenue geography).

WHAT THIS IS
------------
SIC is a **registration** fact: the code the filer selected when it registered with the SEC.
It says what kind of BUSINESS the filing entity is, and that is genuinely useful -- a bank, an
insurer and a registered adviser are different institutions holding shares for different
reasons.

WHAT THIS IS NOT -- and the caller MUST label it accordingly
------------------------------------------------------------
It is **not a strategy or style**. Nothing here distinguishes an index fund from a
stock-picking fund from a quant shop: all three register as 6282, Investment advice. Form 13F
contains no strategy field at all, and inferring one from a manager's name would be our label
presented as theirs. A composition built on these buckets is composition by *registration
category*, and the caption has to say so.

Three further limits, all real:
  * **Self-assigned and rarely revisited.** A filer picks its code at registration; nothing
    forces it to keep it current.
  * **Coarse.** One code per filing entity, however many businesses it runs.
  * **Entity, not complex.** A fund family's 13F filer may be a holding company (6733) while
    the adviser doing the investing sits on another CIK.

BUCKETS
-------
`unclassified` is deliberately NOT a bucket of its own here -- it is the absence of an answer,
returned as `None`, so a caller can never render "no SIC on file" as if it were a category
alongside the real ones. `other` means the opposite: we HAVE a code and it isn't one of the
named institution types. Conflating the two would turn a coverage gap into a finding.
"""

from __future__ import annotations

from typing import Literal

ManagerCategory = Literal[
    "bank",
    "adviser",
    "insurance",
    "fund",
    "broker_dealer",
    "trust",
    "other",
]

# SIC -> bucket. Codes are from the SEC's own division-H (Finance, Insurance, Real Estate)
# list, which is the range essentially every 13F filer falls in. Grouped rather than shown
# raw because 6021/6022/6029 are three flavours of "commercial bank" and a reader does not
# need the distinction to read a register's composition.
_SIC_CATEGORY: dict[str, ManagerCategory] = {
    # --- depository institutions ---
    "6020": "bank",
    "6021": "bank",  # national commercial banks
    "6022": "bank",  # state commercial banks
    "6029": "bank",
    "6035": "bank",  # savings institutions, federally chartered
    "6036": "bank",  # savings institutions, state chartered
    "6099": "bank",
    "6111": "bank",
    "6141": "bank",
    "6159": "bank",
    "6162": "bank",
    "6172": "bank",
    "6189": "bank",
    # --- securities / brokerage ---
    "6199": "broker_dealer",
    "6200": "broker_dealer",
    "6211": "broker_dealer",  # security brokers, dealers & flotation companies
    "6221": "broker_dealer",
    "6231": "broker_dealer",
    # --- investment advice: the single biggest bucket in any real register ---
    "6282": "adviser",  # investment advice
    # --- insurance ---
    "6311": "insurance",  # life insurance
    "6321": "insurance",
    "6324": "insurance",
    "6331": "insurance",  # fire, marine & casualty
    "6351": "insurance",
    "6361": "insurance",
    "6399": "insurance",
    "6411": "insurance",  # agents, brokers & service
    # --- pooled vehicles ---
    "6722": "fund",  # management investment offices, open-end
    "6726": "fund",  # investment offices NEC (closed-end funds, UITs)
    "6770": "fund",
    "6795": "fund",
    "6798": "fund",  # REITs
    # --- fiduciary / holding ---
    "6733": "trust",  # trusts, except educational, religious & charitable
    "6792": "trust",
    "6794": "trust",
}

# Shown to a reader. Named for what the SIC code actually says, not for how the firm invests.
CATEGORY_LABELS: dict[str, str] = {
    "bank": "Bank or savings institution",
    "adviser": "Registered investment adviser",
    "insurance": "Insurance",
    "fund": "Investment company or fund",
    "broker_dealer": "Broker-dealer",
    "trust": "Trust or holding company",
    "other": "Other registrant type",
}

# Stable render order: largest-in-practice first, `other` always last so a residual bucket
# never leads. Not a ranking of anything.
CATEGORY_ORDER: tuple[str, ...] = (
    "adviser",
    "bank",
    "insurance",
    "fund",
    "broker_dealer",
    "trust",
    "other",
)


def classify_manager_sic(sic: str | None) -> ManagerCategory | None:
    """Bucket one filer's SIC code.

    Returns `None` when there is no code to classify -- NOT `"other"`. A caller must render
    that as an explicit coverage gap ("no SIC on file"), never as a category, and never as a
    zero. `"other"` means we have a code and it is not one of the named institution types.

    Pure: no DB, no network, no clock.
    """
    if sic is None:
        return None
    code = sic.strip()
    if not code:
        return None
    # SEC pads to four digits in some payloads and not others; normalize before lookup.
    code = code.zfill(4) if code.isdigit() and len(code) < 4 else code
    return _SIC_CATEGORY.get(code, "other")
