"""Classify a 13F filer's reported `stateOrCountry` code into a display bucket.

`sec/institutional.parse_filing_manager_location` pulls the raw `stateOrCountry` code off a
13F cover page and stores it verbatim (the store keeps raw units/identities -- see CLAUDE.md).
This is where that raw code is interpreted, at the serve/UI edge, so the `sec/` client stays
free of business logic.

Three buckets, deliberately honest:
  * `state`   -- one of the 50 US states or DC. These are the codes the holder-geography
                 choropleth can actually render (Plot's `albers-usa` projection covers the 50
                 states + DC, not the territories).
  * `other`   -- any other non-empty code: a foreign country OR a US territory (PR/GU/VI/AS/MP),
                 which `albers-usa` does not draw. Labelled "outside the 50 states & DC" rather
                 than "foreign" so a Puerto Rico filer is never mislabelled as foreign.
  * `unknown` -- no code at all (None/blank): a snapshot ingested before the location column
                 existed, or a filing that didn't carry the field. An honest gap, never a zero.

HONESTY: the underlying code is the filer's registered *business address*, not where its
capital originates and not the issuer's location -- callers must label it as such.
"""

from __future__ import annotations

from typing import Literal

# The 50 US states + DC -- the set the `albers-usa` choropleth can place. US territories
# (PR/GU/VI/AS/MP) are deliberately NOT here: they're US, but off the map, so they fall to the
# `other` bucket (labelled "outside the 50 states & DC", not "foreign").
US_STATE_CODES: frozenset[str] = frozenset(
    {
        "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
        "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
        "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
        "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
        "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
        "DC",
    }
)

LocationBucket = Literal["state", "other", "unknown"]


def classify_location(code: str | None) -> LocationBucket:
    """Bucket a raw `stateOrCountry` code. See the module docstring for the three buckets.

    Normalizes case/whitespace before matching; a blank string is treated as `unknown`.
    """
    if not code or not code.strip():
        return "unknown"
    return "state" if code.strip().upper() in US_STATE_CODES else "other"
