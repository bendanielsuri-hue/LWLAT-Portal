"""K/E/N SEND breakdowns for a set of grouped counts.

"KEN" is the three SEN statuses a cohort splits into: K (SEN Support), E
(EHCP), N (neither). Every dashboard that shows a SEND split - the SEND &
Provision hub and the Inclusion Panel's own pages - wants the same row shape,
so it lives here rather than in either hub.

It used to live in both. `_pct` was byte-identical in hubs/inclusion/views.py
and hubs/inclusion/panel/views.py, and `_ken_breakdown` was a near-copy where
the panel version silently dropped the `total` and `send_pct` keys: two
functions, one name, different output shapes, both feeding templates that read
keys by name. A template moved between the two hubs would have rendered blank
rather than erroring. This version returns the superset - a caller that
ignores a key costs nothing, a caller missing one renders an empty cell.
"""


def pct(numerator, denominator):
    if not denominator:
        return 0
    return round(numerator * 100 / denominator)


def ken_breakdown(rows, label_key):
    """Rows of {label_key, total, k_count, e_count} -> display rows.

    `rows` is normally a values() queryset annotated with k_count/e_count/total
    (see the Count(..., filter=Q(sen_status=...)) aggregates at the call
    sites). n_count is derived, never queried: N is "neither K nor E", so
    counting it separately would be a third aggregate that could disagree
    with the other two.
    """
    breakdown = []
    for row in rows:
        k_count = row['k_count']
        e_count = row['e_count']
        total = row['total']
        n_count = total - k_count - e_count
        breakdown.append({
            'label': row[label_key],
            'total': total,
            'k_count': k_count,
            'e_count': e_count,
            'n_count': n_count,
            'k_pct': pct(k_count, total),
            'e_pct': pct(e_count, total),
            'n_pct': pct(n_count, total),
            'send_pct': pct(k_count + e_count, total),
        })
    return breakdown
