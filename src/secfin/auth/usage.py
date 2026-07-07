"""Usage-summary construction over stored per-day counts.

Kept as a pure function separate from the SQL layer (storage/api_key_repository.py),
the same shape as normalize/cusip.py's `cusip_resolution_stats` sitting over
`CusipMapRepository`. The repository returns only the days that actually saw traffic (a
sparse SQL result -- no row for a day with zero requests); this fills the requested
window with explicit zero-count days, since a billing view should show "0 requests on
this day", not silently omit it.
"""

from __future__ import annotations

import datetime as dt

from secfin.auth.models import ApiKeyRecord, DailyUsage, UsageSummary


def usage_summary(
    record: ApiKeyRecord, stored: list[DailyUsage], days: int, today: dt.date
) -> UsageSummary:
    """`stored` need not cover every day in the window or be sorted -- both are handled
    here. `today` is caller-supplied so this stays pure w.r.t. wall-clock time.
    """
    counts_by_date = {row.date: row.request_count for row in stored}
    usage_by_day = [
        DailyUsage(date=day.isoformat(), request_count=counts_by_date.get(day.isoformat(), 0))
        for day in (today - dt.timedelta(days=offset) for offset in range(days - 1, -1, -1))
    ]
    return UsageSummary(
        tier=record.tier,
        rate_limit_per_sec=record.rate_limit_per_sec,
        daily_quota=record.daily_quota,
        usage_by_day=usage_by_day,
    )
