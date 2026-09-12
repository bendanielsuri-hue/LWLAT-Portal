import json

import requests
from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.http import require_POST

from core.identity import current_staff
from core.models import School
from core.modules import filter_by_module, is_module_visible, module_label, module_map
from core.most_used import most_used_apps, personal_usage_counts
from core.portal_settings import resolve_portal_settings
from hubs.inclusion.views import INCLUSION_MENU
from hubs.registers.views import REGISTERS_MENU
from hubs.resources.views import RESOURCES_MENU
from hubs.services.views import SERVICES_MENU
from hubs.staff.views import STAFF_MENU
from hubs.student.views import STUDENT_MENU

# Each leaf page is declared once, by its own hub, in that hub's <HUB>_MENU
# (the same list that drives _hub_sidebar.html's local_menu). This indexes them
# by module_key so Home's sections can look a leaf up instead of restating it.
#
# _raw_sections below used to carry a second full copy of the inventory - every
# leaf's name and url written out again - joined to the hub menus only by the
# module_key string convention, with nothing checking the two agreed. They
# happened to agree; nothing made them.
_LEAF_BY_MODULE_KEY = {
    entry['module_key']: entry
    for menu in (STAFF_MENU, STUDENT_MENU, INCLUSION_MENU, REGISTERS_MENU, SERVICES_MENU, RESOURCES_MENU)
    for entry in menu
}


def _leaf(module_key):
    """Expand a curated module_key into a Home section item.

    `name` comes from the owning hub's menu. `url` comes from reverse(), since
    Module.key matches a Django URL name by convention (core.models.Module) -
    verified to hold for every key used here. Neither is restated locally, so
    renaming a page in its hub menu can no longer leave Home showing the old
    name, and moving a URL can no longer leave Home linking the old path.
    """
    entry = _LEAF_BY_MODULE_KEY.get(module_key)
    return {
        'name': entry['name'] if entry else module_key.replace('_', ' ').title(),
        'url': reverse(module_key),
        'module_key': module_key,
    }


# Category picked in the footer's "report a problem" form (#128) maps
# straight onto an existing repo label - see docs/adr/0012.
REPORT_PROBLEM_CATEGORY_LABELS = {
    'bug': "Something's broken",
    'enhancement': 'Suggestion',
    'question': 'Question',
}

AGGREGATE_ENTRIES = [
    {'name': 'All Schools', 'category': None, 'aggregate': True, 'key': 'all'},
    {'name': 'All Primary', 'category': 'Primary', 'aggregate': True, 'key': 'primary'},
    {'name': 'All Secondary', 'category': 'Secondary', 'aggregate': True, 'key': 'secondary'},
]

# Single source of truth for the global hub-switcher rail and the "All hubs"
# picker overlay shown when the hub sidebar is collapsed — both render this
# same list so the hub order/icons never drift apart between the two.
# module_key tags each entry for core.modules.filter_by_module/module_label;
# the Portal Admin entry is appended separately (developer-only, not module-gated).
HUB_NAV_ITEMS = [
    {'url_name': 'staff_hub', 'icon': 'icons/staff_svg.html', 'label': 'Staff', 'prefix': '/staff/', 'module_key': 'staff_hub'},
    {'url_name': 'student_hub', 'icon': 'icons/student_svg.html', 'label': 'Student', 'prefix': '/student/', 'module_key': 'student_hub'},
    {'url_name': 'inclusion_hub', 'icon': 'icons/send_svg.html', 'label': 'SEND & Provision', 'prefix': '/inclusion/', 'module_key': 'inclusion_hub'},
    {'url_name': 'registers', 'icon': 'icons/registers_svg.html', 'label': 'Registers', 'prefix': '/registers/', 'module_key': 'registers'},
    {'url_name': 'careers_hub', 'icon': 'icons/careers_svg.html', 'label': 'Careers', 'prefix': '/careers/', 'module_key': 'careers_hub'},
    {'url_name': 'services', 'icon': 'icons/services_svg.html', 'label': 'Operations', 'prefix': '/services/', 'module_key': 'services'},
    {'url_name': 'resources_hub', 'icon': 'icons/resources_svg.html', 'label': 'Resources', 'prefix': '/resources/', 'module_key': 'resources_hub'},
]

PORTAL_ADMIN_NAV_ITEM = {
    'url_name': 'portaladmin_home', 'icon': 'icons/shield_check_svg.html', 'label': 'Portal Admin', 'prefix': '/portal-admin/',
}


def _developer_nav_extras(request):
    staff = current_staff(request)
    return [PORTAL_ADMIN_NAV_ITEM] if staff and staff.is_developer else []


def build_hub_nav(request):
    modules = module_map()
    entries = filter_by_module(HUB_NAV_ITEMS, modules, request) + _developer_nav_extras(request)
    items = []
    for entry in entries:
        active = request.path.startswith(entry['prefix'])
        items.append({
            'url': reverse(entry['url_name']),
            'icon': entry['icon'],
            'label': module_label(entry.get('module_key'), modules, entry['label']),
            'active': active,
        })
    return items


def build_school_nav(selected_key='all'):
    schools = [dict(AGGREGATE_ENTRIES[0])]
    for category, aggregate_entry in (('Primary', AGGREGATE_ENTRIES[1]), ('Secondary', AGGREGATE_ENTRIES[2])):
        category_schools = School.objects.filter(category=category, is_active=True)
        if not category_schools.exists():
            continue
        schools.append(dict(aggregate_entry))
        schools.extend(
            {
                'name': school.name, 'category': category, 'aggregate': False,
                'key': str(school.id), 'logo_url': school.logo_url,
            }
            for school in category_schools
        )
    for entry in schools:
        entry['selected'] = entry['key'] == selected_key
    return schools


def _leaf_icon(module_key, fallback):
    # A leaf's icon is owned by its hub menu, same as its name; the parent
    # hub's own icon is the fallback for anything not found there.
    entry = _LEAF_BY_MODULE_KEY.get(module_key)
    return entry['icon'] if entry else fallback


def _raw_sections():
    # Order matches HUB_NAV_ITEMS (the sidebar rail) above - one nav order for
    # the whole app rather than two lists that can drift apart.
    #
    # `items` is a curated list of module_keys, NOT simply every leaf in the
    # hub's menu: Home lists the tools in a hub, so the hub's own dashboard and
    # reports pages are deliberately left out (Staff omits staff_dashboard and
    # staff_reports, Student omits student_dashboard), and Operations orders
    # its items differently from its menu. That curation is the only thing this
    # list still owns - name, url and icon all come from the hub's menu via
    # _leaf().
    return [
        {
            'title': 'Staff',
            'module_key': 'staff_hub',
            'url': reverse('staff_hub'),
            'description': 'Personal self-service tools for staff — timetables, leave, pay and training.',
            'items': [_leaf(k) for k in (
                'staff_my_timetable', 'staff_directory', 'staff_absence_request', 'staff_payslips',
                'staff_cpd_training', 'staff_calendar', 'staff_assessment_calendar', 'staff_school_map',
            )],
            'icon_template': 'icons/staff_svg.html',
        },
        {
            'title': 'Student',
            'module_key': 'student_hub',
            'url': reverse('student_hub'),
            'description': 'Core student record — profile, progress and equipment standards.',
            'items': [_leaf(k) for k in (
                'student_profile', 'student_progress_tracker', 'student_standards_equipment',
                'student_pastoral_tracker',
            )],
            'icon_template': 'icons/student_svg.html',
        },
        {
            'title': 'SEND & Provision',
            'module_key': 'inclusion_hub',
            'url': reverse('inclusion_hub'),
            'description': 'SEND register, provision mapping and the Inclusion Panel referral process.',
            'items': [_leaf(k) for k in (
                'inclusion_provision_strategies', 'inclusion_panel', 'inclusion_diagnosis_tracker',
            )],
            'icon_template': 'icons/send_svg.html',
        },
        {
            'title': 'Registers',
            'module_key': 'registers',
            'url': reverse('registers'),
            'description': 'Behaviour and pastoral registers — clubs, library, isolation, reset room, interventions and pastoral tracking.',
            'items': [_leaf(k) for k in (
                'register_clubs', 'register_library', 'register_isolation_room', 'register_reset_room',
                'register_interventions',
            )],
            'icon_template': 'icons/registers_svg.html',
        },
        {
            'title': 'Careers',
            'module_key': 'careers_hub',
            'url': reverse('careers_hub'),
            'description': 'Careers guidance and destinations support.',
            'items': [],
            'icon_template': 'icons/careers_svg.html',
        },
        {
            'title': 'Operations',
            'module_key': 'services',
            'url': reverse('services'),
            'description': 'Running the school day-to-day — cover, rotas, events, rooms, resources and facilities.',
            'items': [_leaf(k) for k in (
                'service_cover_manager', 'service_duty_rota', 'service_assembly_manager', 'service_admissions',
                'service_events_planner', 'service_operations_dashboard', 'service_exams_dashboard',
            )],
            'icon_template': 'icons/services_svg.html',
        },
        {
            'title': 'Resources',
            'module_key': 'resources_hub',
            'url': reverse('resources_hub'),
            'description': 'Asset tracking and room bookings for the school estate.',
            'items': [_leaf(k) for k in ('resource_asset_register', 'resource_room_bookings')],
            'icon_template': 'icons/resources_svg.html',
        },
    ]


def build_sections(request):
    modules = module_map()
    settings = resolve_portal_settings(request)
    # Generic role-noun overrides only apply to these two hub entries — every
    # other hub's label comes from Module.name/hardcoded default, see plan notes.
    term_overrides = {'staff_hub': settings['staff_term'], 'student_hub': settings['student_term']}

    sections = []
    for section in _raw_sections():
        if not is_module_visible(section['module_key'], modules, request):
            continue
        label = term_overrides.get(section['module_key']) or module_label(section['module_key'], modules, section['title'])
        items = filter_by_module(section['items'], modules, request)
        items = [
            {**item, 'icon': _leaf_icon(item.get('module_key'), section['icon_template'])}
            for item in items
        ]
        sections.append({
            **section,
            'title': label,
            'items': items,
        })

    staff = current_staff(request)
    if staff and staff.is_developer:
        sections.append({
            'title': 'Portal Admin',
            'module_key': None,
            'url': reverse('portaladmin_home'),
            'description': 'Manage module rollout status and per-school portal settings.',
            'items': [],
            'icon_template': 'icons/shield_check_svg.html',
        })
    return sections


def build_search_items(sections):
    search_items = []
    for section in sections:
        search_items.append({'name': section['title'], 'url': section['url'], 'hub': section['title']})
        for item in section['items']:
            search_items.append({'name': item['name'], 'url': item['url'], 'hub': section['title']})
    return search_items


def _most_used_registries(sections):
    # url_name -> {url, icon, label} for every currently-visible app, keyed
    # the same way core.models.PageView.url_name is written (and Module.key
    # is matched, by convention) - split into two tiers so leaf-level apps
    # always outrank hub landing pages in the ranking (a hub is already one
    # click away in the global rail, so it's not worth a "Most Used Apps"
    # slot until real apps run out - see core/CONTEXT.md). Reuses `sections`
    # rather than re-deriving it, so the tray only ever ranks apps that
    # build_sections has already filtered/labelled via the Module system.
    leaf_registry = {}
    hub_registry = {}
    for section in sections:
        if section.get('module_key'):
            hub_registry[section['module_key']] = {
                'url': section['url'], 'icon': section['icon_template'], 'label': section['title'],
            }
        for item in section['items']:
            if item.get('module_key'):
                icon = _leaf_icon(item['module_key'], section['icon_template'])
                leaf_registry[item['module_key']] = {
                    'url': item['url'], 'icon': icon, 'label': item['name'],
                }
    return [leaf_registry, hub_registry]


def _sorted_by_usage(sections, usage_counts):
    # Reorders each hub card's own item badges by this staff member's usage
    # (most-opened first, stable so never-opened items keep build_sections'
    # original order at the end) - a display-only copy, so it doesn't touch
    # the `sections` build_search_items/most_used_apps already consumed.
    return [
        {**section, 'items': sorted(section['items'], key=lambda item: -usage_counts.get(item.get('module_key'), 0))}
        for section in sections
    ]


def mat_home(request):
    sections = build_sections(request)
    staff = current_staff(request)
    most_used = most_used_apps(staff, _most_used_registries(sections)) if staff else []
    usage_counts = personal_usage_counts(staff) if staff else {}
    return render(request, 'portal/home.html', {
        'sections': _sorted_by_usage(sections, usage_counts),
        'hub_title': 'Home',
        'local_menu': [],
        'most_used': most_used,
    })


@require_POST
def report_problem(request):
    # One issue-reporting path for every audience (#128 follow-up grilling) -
    # files the GitHub issue server-side via GITHUB_TOKEN instead of sending
    # the reporter to GitHub themselves. See docs/adr/0012. `errors`, when
    # present, is the dev-only footer error console's recorded JS errors
    # (window.__footerErrors) - attached silently, never shown in the form,
    # so developers still get that context without a separate report button.
    try:
        payload = json.loads(request.body)
    except (ValueError, TypeError):
        return JsonResponse({'error': 'Invalid request.'}, status=400)

    description = (payload.get('description') or '').strip()
    category = payload.get('category') or 'bug'
    page_url = payload.get('page_url') or ''
    errors = payload.get('errors') or []
    if not description:
        return JsonResponse({'error': 'Description is required.'}, status=400)
    if category not in REPORT_PROBLEM_CATEGORY_LABELS:
        category = 'bug'

    if not settings.GITHUB_TOKEN:
        return JsonResponse({'error': 'Reporting is not configured on this server.'}, status=503)

    staff = current_staff(request)
    reporter = f'{staff.first_name} {staff.last_name}' if staff else 'Unknown user'
    body_lines = [
        description,
        '',
        f'**Reported by:** {reporter}',
        f'**Page:** {page_url}',
        f'**Category:** {REPORT_PROBLEM_CATEGORY_LABELS[category]}',
    ]
    if errors:
        body_lines.append('')
        body_lines.append('**JS errors:**')
        body_lines.extend(f'- {str(error)}' for error in errors)
    title = description.splitlines()[0][:80] or 'User-reported problem'

    response = requests.post(
        f'https://api.github.com/repos/{settings.GITHUB_REPO}/issues',
        headers={
            'Authorization': f'Bearer {settings.GITHUB_TOKEN}',
            'Accept': 'application/vnd.github+json',
        },
        json={
            'title': title,
            'body': '\n'.join(body_lines),
            'labels': [category, 'needs-triage'],
        },
        timeout=10,
    )
    if response.status_code != 201:
        return JsonResponse({'error': 'GitHub declined the report.'}, status=502)

    return JsonResponse({'issue_url': response.json().get('html_url', '')}, status=201)
