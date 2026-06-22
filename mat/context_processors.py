from core.identity import current_school_key, current_staff, staff_queryset_for_school_key

from .views import build_school_nav, build_sections, build_search_items


def schools(request):
    selected_key = current_school_key(request)
    nav = build_school_nav(selected_key)
    selected = next((entry for entry in nav if entry['selected']), nav[0])
    return {'schools': nav, 'current_school_key': selected_key, 'current_school_label': selected['name']}


def search_items(request):
    return {'search_items': build_search_items(build_sections())}


def current_identity(request):
    # Surfaces the sidebar's "current user" identity switcher on every hub
    # (not just the Inclusion Panel) — see core.identity for the cookie/
    # school-key fallback mechanics.
    school_key = current_school_key(request)
    staff = current_staff(request)
    return {
        'current_staff_list': staff_queryset_for_school_key(school_key),
        'current_staff_id': str(staff.pk) if staff is not None else '',
        'current_staff': staff,
    }
