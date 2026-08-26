from django.db.models import Count
from django.utils import timezone

from core.models import AcademicYear, PageView


def _current_academic_year():
    today = timezone.localdate()
    return AcademicYear.objects.filter(start_date__lte=today, end_date__gte=today).first()


def most_used_apps(staff, tiered_registries, limit=10):
    # Ranks a staff member's own PageViews for the home page "Most Used
    # Apps" tray. `tiered_registries` is an ordered list of url_name ->
    # {url, icon, label} maps - leaf-level apps first, hub landing pages
    # last, since a hub is already one click away in the global rail on
    # every page, so it only fills a slot once real apps have run out (see
    # core/CONTEXT.md "Most Used Apps"). Each tier is exhausted through the
    # same four-source waterfall before the next tier is considered,
    # topping up whenever short of `limit` rather than swapping wholesale:
    # current-year personal -> current-year trust-wide popular -> all-time
    # personal -> all-time trust-wide popular.
    academic_year = _current_academic_year()
    ranked_keys = []
    seen = set()

    def take(queryset, registry):
        if len(ranked_keys) >= limit:
            return
        counts = queryset.values('url_name').annotate(opens=Count('id')).order_by('-opens')
        for row in counts:
            key = row['url_name']
            if key in seen or key not in registry:
                continue
            seen.add(key)
            ranked_keys.append(key)
            if len(ranked_keys) >= limit:
                return

    year_bounds = None
    if academic_year is not None:
        year_bounds = {
            'created_at__date__gte': academic_year.start_date,
            'created_at__date__lte': academic_year.end_date,
        }

    merged_registry = {}
    for registry in tiered_registries:
        if len(ranked_keys) < limit:
            if year_bounds is not None:
                take(PageView.objects.filter(staff=staff, **year_bounds), registry)
                take(PageView.objects.filter(**year_bounds), registry)
            take(PageView.objects.filter(staff=staff), registry)
            take(PageView.objects.all(), registry)
        merged_registry.update(registry)

    return [dict(merged_registry[key], url_name=key) for key in ranked_keys]


def personal_usage_counts(staff):
    # All-time opens per url_name for one staff member - used to reorder the
    # home page's own hub cards (most-opened item first within each card),
    # a lighter-weight sibling of most_used_apps' tray ranking: no tiering
    # or trust-wide fallback needed since every item is always shown either
    # way, just in a different order.
    return dict(
        PageView.objects.filter(staff=staff)
        .values('url_name')
        .annotate(opens=Count('id'))
        .values_list('url_name', 'opens')
    )
