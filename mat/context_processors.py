from core.identity import current_staff
from core.models import Staff

from .views import build_school_nav, build_sections, build_search_items


def schools(request):
    return {'schools': build_school_nav()}


def search_items(request):
    return {'search_items': build_search_items(build_sections())}


def current_identity(request):
    # Surfaces the sidebar's "current user" identity switcher on every hub
    # (not just the Inclusion Panel) — see core.identity for the cookie/
    # fallback mechanics.
    staff = current_staff(request)
    return {
        'current_staff_list': Staff.objects.filter(is_active=True),
        'current_staff_id': str(staff.pk) if staff is not None else '',
        'current_staff': staff,
    }
