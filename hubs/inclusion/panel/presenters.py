"""Display formatting shared by the panel's views and row partials.

Views hang computed values onto model instances for their templates to read.
That contract is undeclared and unenforced - a missing attribute renders as
empty string, so every failure in it is silent - which is exactly how
`duration_display` came to mean three different things.

It was produced at five sites in three formats with two empty sentinels: an
`H:MM:SS` clock from three verbatim six-line copies, a `2h 15m` short form from
a helper, and `None` for empty at four sites but `'—'` at a fifth (because one
template printed it raw instead of using `|default:"—"`). All five fed context
keys of the same name.

Both formats are legitimate - a discussion timer wants precision, a meeting
card wants brevity - so they keep their own names here rather than being
collapsed into one. What they now share is the empty sentinel: always None,
with templates supplying the dash via `|default:"—"`, so a caller can't invent
a third convention.
"""

import datetime


def clock_duration(td):
    """`0:15:00` - precise elapsed time, for a discussion's own timing.

    None when there's no duration, so the caller's template renders its own
    dash via `|default:"—"`.
    """
    if not td:
        return None
    total_seconds = int(td.total_seconds())
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f'{hours}:{minutes:02d}:{seconds:02d}'


def short_duration(td):
    """`2h 15m` / `45m` / `3h` - for a meeting card, where the verbose
    `str(timedelta)` default (`2:15:00`) reads as false precision."""
    if not td:
        return None
    total_minutes = int(td.total_seconds() // 60)
    hours, minutes = divmod(total_minutes, 60)
    if hours and minutes:
        return f'{hours}h {minutes}m'
    if hours:
        return f'{hours}h'
    return f'{minutes}m'


def sum_durations(durations):
    """Total of possibly-None durations, or None when there's nothing to add.

    Keeps "no discussions recorded" distinct from "discussions totalling zero",
    the same distinction the empty sentinel above preserves.
    """
    real = [d for d in durations if d]
    if not real:
        return None
    return sum(real, datetime.timedelta())
