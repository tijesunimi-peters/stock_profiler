"""Classify an ASC 280 GEOGRAPHIC revenue member into domestic / international / other.

This is the MOAT (and the risk) for the sector geographic-revenue mix (Sector Analytics v2, P6b).
Filers disclose geography inconsistently: some report "United States / International", some by
country, some by region -- there is no canonical field. This module is the ONE documented,
principled place that reduces all of that to a small bucket set. It is deliberately separate from
`geography.classify_location` (which buckets a 13F filer's registered HQ `stateOrCountry` -- a
different domain: filer address, not revenue geography).

Operator decision (2026-07-24): a BINARY split -- Domestic (US) vs International -- plus an
`other` bucket for genuinely ambiguous / unclassifiable members. Chosen over a region set because
filers' region labels are too inconsistent to map reliably; the binary is robust and highest
coverage. Regions like Europe/Asia collapse into the single `international` bucket.

Three buckets, deliberately honest:
  * `domestic`      -- the member is unambiguously the United States (an EXACT match against a small
                       US token set; never a substring test, which would misfire on tokens like
                       "AUSTRALIA" that merely contain "US").
  * `international`  -- the member is a recognizable non-US country, a non-US region, or an explicit
                       "international / non-US / foreign / rest-of-world" label.
  * `other`         -- everything else: ambiguous rollups that INCLUDE the US ("Americas",
                       "North America"), non-geographic residuals ("Other", "Corporate",
                       "Consolidated"), or any member we can't confidently place. `other` is
                       SHOWN, never dropped -- an honest "we couldn't classify this", not a zero.

Unrecognized members fall to `other` on purpose: over-claiming a bucket would be dishonest. The
tables below are a principled starter set and are meant to grow as real filings surface new labels.
"""

from __future__ import annotations

import re
from typing import Literal

GeoBucket = Literal["domestic", "international", "other"]

# EXACT-match US identifiers (after normalization). Exact only -- never substring (see docstring).
_DOMESTIC_EXACT: frozenset[str] = frozenset(
    {"US", "USA", "UNITEDSTATES", "UNITEDSTATESOFAMERICA", "DOMESTIC", "USBASED"}
)

# EXACT-match ambiguous / non-geographic rollups -> `other`. These INCLUDE the US or are not a
# clean geography, so neither domestic nor international is honest. Checked BEFORE the international
# tests so e.g. "Americas" (US + Latin America) never leaks into `international`.
_AMBIGUOUS_EXACT: frozenset[str] = frozenset(
    {
        "AMERICAS", "NORTHAMERICA", "GLOBAL", "WORLDWIDE", "WORLD", "TOTAL", "CONSOLIDATED",
        "OTHER", "ALLOTHER", "CORPORATE", "ELIMINATIONS", "GEOGRAPHIC", "GEOGRAPHICAL",
        "UNALLOCATED", "SEGMENT", "REPORTABLESEGMENTS",
    }
)

# EXACT-match explicit international identifiers.
_INTERNATIONAL_EXACT: frozenset[str] = frozenset(
    {"INTERNATIONAL", "NONUS", "NONUNITEDSTATES", "FOREIGN", "OVERSEAS", "RESTOFWORLD", "ROW"}
)

# Substring markers that make a member international (applied only AFTER domestic/ambiguous exact
# checks, so an ambiguous token that also contains one of these has already been resolved to
# `other`). Region words + explicit foreign words. Deliberately excludes bare "AMERICA" (ambiguous).
_INTERNATIONAL_SUBSTR: tuple[str, ...] = (
    "INTERNATIONAL", "NONUS", "FOREIGN", "OVERSEAS", "RESTOFWORLD", "OUTSIDEUNITEDSTATES",
    "EUROPE", "EMEA", "ASIA", "PACIFIC", "AFRICA", "MIDDLEEAST", "LATINAMERICA", "SOUTHAMERICA",
    "GREATERCHINA", "CARIBBEAN", "OCEANIA", "NORDIC", "SCANDINAVIA", "EURASIA", "APAC",
    "COUNTRIES",  # e.g. "OtherCountries" -- residual FOREIGN countries, still international
)

# EXACT-match non-US ISO alpha-2 country codes (US intentionally absent). A representative set --
# grows with real filings. Exact only (a 2-letter code as the whole normalized token).
_COUNTRY_CODES: frozenset[str] = frozenset(
    {
        "CA", "MX", "BR", "AR", "CL", "CO", "PE",
        "GB", "UK", "IE", "FR", "DE", "IT", "ES", "PT", "NL", "BE", "LU", "CH", "AT", "SE",
        "NO", "DK", "FI", "PL", "CZ", "RU", "TR", "GR", "HU", "RO",
        "CN", "JP", "KR", "IN", "HK", "TW", "SG", "MY", "TH", "ID", "PH", "VN", "AU", "NZ",
        "IL", "SA", "AE", "QA", "ZA", "EG", "NG", "KE",
    }
)

# EXACT-match non-US country names.
_COUNTRY_NAMES: frozenset[str] = frozenset(
    {
        "CANADA", "MEXICO", "BRAZIL", "ARGENTINA", "CHILE", "COLOMBIA", "PERU",
        "UNITEDKINGDOM", "IRELAND", "FRANCE", "GERMANY", "ITALY", "SPAIN", "PORTUGAL",
        "NETHERLANDS", "BELGIUM", "LUXEMBOURG", "SWITZERLAND", "AUSTRIA", "SWEDEN", "NORWAY",
        "DENMARK", "FINLAND", "POLAND", "CZECHREPUBLIC", "RUSSIA", "TURKEY", "GREECE",
        "CHINA", "JAPAN", "KOREA", "SOUTHKOREA", "INDIA", "HONGKONG", "TAIWAN", "SINGAPORE",
        "MALAYSIA", "THAILAND", "INDONESIA", "PHILIPPINES", "VIETNAM", "AUSTRALIA",
        "NEWZEALAND", "ISRAEL", "SAUDIARABIA", "UNITEDARABEMIRATES", "QATAR", "SOUTHAFRICA",
        "EGYPT", "NIGERIA", "KENYA",
    }
)

_SUFFIX_RE = re.compile(r"(SEGMENT|MEMBER|REGION|GEOGRAPHY|GEOGRAPHIC|GEOGRAPHICAL)$")
_NONALNUM_RE = re.compile(r"[^A-Z0-9]")


def _normalize(member: str) -> str:
    """Uppercase, drop non-alphanumerics, and strip a trailing DERA/taxonomy suffix.

    DERA already shortens `...Member`, but filings vary ("USMember", "US", "U.S."), so we normalize
    defensively: "U.S." -> "US", "NonUsMember" -> "NONUS", "A.Pacific" -> "APACIFIC".
    """
    token = _NONALNUM_RE.sub("", member.upper())
    # Strip one trailing structural suffix if it leaves a non-empty stem.
    stripped = _SUFFIX_RE.sub("", token)
    return stripped or token


def classify_geography_member(member: str | None) -> GeoBucket:
    """Bucket one ASC 280 geography member. See the module docstring for the taxonomy.

    Order matters: US exact, then ambiguous-rollup exact (so US-inclusive regions never leak into
    `international`), then the international tests (exact / country / substring), else `other`.
    """
    if not member or not member.strip():
        return "other"
    token = _normalize(member)
    if not token:
        return "other"
    if token in _DOMESTIC_EXACT:
        return "domestic"
    if token in _AMBIGUOUS_EXACT:
        return "other"
    if (
        token in _INTERNATIONAL_EXACT
        or token in _COUNTRY_CODES
        or token in _COUNTRY_NAMES
        or any(marker in token for marker in _INTERNATIONAL_SUBSTR)
    ):
        return "international"
    return "other"
