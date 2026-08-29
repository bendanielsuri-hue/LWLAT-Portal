from django.apps import apps as django_apps
from django.conf import settings

from core.identity import current_school_key, current_staff, staff_queryset_for_school_key
from core.modules import view_full_system
from core.portal_settings import resolve_portal_settings

from .views import build_hub_nav, build_school_nav, build_sections, build_search_items


def hub_nav(request):
    return {'hub_nav_items': build_hub_nav(request)}


def schools(request):
    selected_key = current_school_key(request)
    nav = build_school_nav(selected_key)
    selected = next((entry for entry in nav if entry['selected']), nav[0])
    return {'schools': nav, 'current_school_key': selected_key, 'current_school_label': selected['name']}


def search_items(request):
    return {'search_items': build_search_items(build_sections(request))}


def module_settings(request):
    return {'view_full_system': view_full_system(request)}


def portal_settings(request):
    return resolve_portal_settings(request)


# Mirrors the hub prefixes mounted in mysite/urls.py - maps each to the
# owning hub app's Django app_label so footer_meta() can look up its
# AppConfig.VERSION. Falls back to 'core' for pages no hub owns (MAT home,
# Portal Admin is itself a hub though, so it's listed) - see docs/adr/0011.
# 'inclusion/panel/' must precede 'inclusion/' - both prefix-match panel
# URLs, and the first hit wins below, so Panel's own entry (a nested but
# separate AppConfig, label='panel') has to be checked first or every panel
# page would fall through to the SEND & Provision hub's version instead.
_HUB_APP_LABELS_BY_URL_PREFIX = [
    ('staff/', 'staff'),
    ('student/', 'student'),
    ('services/', 'services'),
    ('registers/', 'registers'),
    ('inclusion/panel/', 'panel'),
    ('inclusion/', 'inclusion'),
    ('careers/', 'careers'),
    ('resources/', 'resources'),
    ('portal-admin/', 'portaladmin'),
]

# Mirrors each hub's own hub_title (set in its views.py) so the footer can
# show a display name next to its per-hub version without importing every
# hub's views module. 'core' has no entry - footer_meta() falls back to the
# resolved portal_title for pages no hub owns (MAT home).
_HUB_DISPLAY_NAMES_BY_APP_LABEL = {
    'staff': 'Staff',
    'student': 'Student',
    'services': 'Operations',
    'registers': 'Registers',
    'inclusion': 'SEND & Provision',
    'panel': 'Inclusion Panel',
    'careers': 'Careers',
    'resources': 'Resources',
    'portaladmin': 'Portal Admin',
}


def footer_meta(request):
    path = request.path.lstrip('/')
    app_label = next(
        (label for prefix, label in _HUB_APP_LABELS_BY_URL_PREFIX if path.startswith(prefix)),
        'core',
    )
    app_version = getattr(django_apps.get_app_config(app_label), 'VERSION', '')
    return {
        'footer_environment': settings.ENVIRONMENT,
        'footer_app_version': app_version,
        'footer_app_name': _HUB_DISPLAY_NAMES_BY_APP_LABEL.get(app_label, ''),
    }


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
