from django.shortcuts import render
from django.urls import reverse

from core.identity import current_staff
from core.models import School
from core.modules import filter_by_module, is_module_visible, module_label, module_map
from core.portal_settings import resolve_portal_settings

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
            {'name': school.name, 'category': category, 'aggregate': False, 'key': str(school.id)}
            for school in category_schools
        )
    for entry in schools:
        entry['selected'] = entry['key'] == selected_key
    return schools


def _raw_sections():
    return [
        {
            'title': 'Staff',
            'module_key': 'staff_hub',
            'url': reverse('staff_hub'),
            'description': 'Personal self-service tools for staff — timetables, leave, pay and training.',
            'items': [
                {'name': 'My Timetable', 'url': reverse('staff_my_timetable'), 'module_key': 'staff_my_timetable'},
                {'name': 'Staff Directory', 'url': reverse('staff_directory'), 'module_key': 'staff_directory'},
                {'name': 'Absence Request', 'url': reverse('staff_absence_request'), 'module_key': 'staff_absence_request'},
                {'name': 'Payslips', 'url': reverse('staff_payslips'), 'module_key': 'staff_payslips'},
                {'name': 'CPD & Training', 'url': reverse('staff_cpd_training'), 'module_key': 'staff_cpd_training'},
                {'name': 'Staff Calendar', 'url': reverse('staff_calendar'), 'module_key': 'staff_calendar'},
                {'name': 'Assessment Calendar', 'url': reverse('staff_assessment_calendar'), 'module_key': 'staff_assessment_calendar'},
                {'name': 'School Map', 'url': reverse('staff_school_map'), 'module_key': 'staff_school_map'},
            ],
            'icon_template': 'icons/staff_svg.html',
        },
        {
            'title': 'Operations',
            'module_key': 'services',
            'url': reverse('services'),
            'description': 'Running the school day-to-day — cover, rotas, events, rooms, resources and facilities.',
            'items': [
                {'name': 'Cover Manager', 'url': reverse('service_cover_manager'), 'module_key': 'service_cover_manager'},
                {'name': 'Duty & Rota Manager', 'url': reverse('service_duty_rota'), 'module_key': 'service_duty_rota'},
                {'name': 'Assembly Manager', 'url': reverse('service_assembly_manager'), 'module_key': 'service_assembly_manager'},
                {'name': 'Admissions', 'url': reverse('service_admissions'), 'module_key': 'service_admissions'},
                {'name': 'Events Planner', 'url': reverse('service_events_planner'), 'module_key': 'service_events_planner'},
                {'name': 'Operations Overview', 'url': reverse('service_operations_dashboard'), 'module_key': 'service_operations_dashboard'},
                {'name': 'Exams', 'url': reverse('service_exams_dashboard'), 'module_key': 'service_exams_dashboard'},
            ],
            'icon_template': 'icons/services_svg.html',
        },
        {
            'title': 'Resources',
            'module_key': 'resources_hub',
            'url': reverse('resources_hub'),
            'description': 'Asset tracking and room bookings for the school estate.',
            'items': [
                {'name': 'Asset Register', 'url': reverse('resource_asset_register'), 'module_key': 'resource_asset_register'},
                {'name': 'Room Bookings', 'url': reverse('resource_room_bookings'), 'module_key': 'resource_room_bookings'},
            ],
            'icon_template': 'icons/resources_svg.html',
        },
        {
            'title': 'Student',
            'module_key': 'student_hub',
            'url': reverse('student_hub'),
            'description': 'Core student record — profile, progress and equipment standards.',
            'items': [
                {'name': 'Student Profile', 'url': reverse('student_profile'), 'module_key': 'student_profile'},
                {'name': 'Progress Tracker', 'url': reverse('student_progress_tracker'), 'module_key': 'student_progress_tracker'},
                {'name': 'Standards & Equipment', 'url': reverse('student_standards_equipment'), 'module_key': 'student_standards_equipment'},
                {'name': 'Pastoral Tracker', 'url': reverse('student_pastoral_tracker'), 'module_key': 'student_pastoral_tracker'},
            ],
            'icon_template': 'icons/student_svg.html',
        },
        {
            'title': 'SEND & Provision',
            'module_key': 'inclusion_hub',
            'url': reverse('inclusion_hub'),
            'description': 'Provision, strategies and inclusion support for students with additional needs.',
            'items': [
                {'name': 'Provision & Strategies', 'url': reverse('inclusion_provision_strategies'), 'module_key': 'inclusion_provision_strategies'},
                {'name': 'Inclusion Panel', 'url': reverse('inclusion_panel'), 'module_key': 'inclusion_panel'},
                {'name': 'SEND Diagnosis Tracker', 'url': reverse('inclusion_diagnosis_tracker'), 'module_key': 'inclusion_diagnosis_tracker'},
            ],
            'icon_template': 'icons/send_svg.html',
        },
        {
            'title': 'Registers',
            'module_key': 'registers',
            'url': reverse('registers'),
            'description': 'Behaviour and pastoral registers — clubs, isolation, reset room, interventions and pastoral tracking.',
            'items': [
                {'name': 'Clubs', 'url': reverse('register_clubs'), 'module_key': 'register_clubs'},
                {'name': 'Isolation Room', 'url': reverse('register_isolation_room'), 'module_key': 'register_isolation_room'},
                {'name': 'Reset Room', 'url': reverse('register_reset_room'), 'module_key': 'register_reset_room'},
                {'name': 'Interventions', 'url': reverse('register_interventions'), 'module_key': 'register_interventions'},
            ],
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
        sections.append({
            **section,
            'title': label,
            'items': filter_by_module(section['items'], modules, request),
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


def mat_home(request):
    sections = build_sections(request)
    return render(request, 'mat/home.html', {
        'sections': sections,
        'hub_title': 'Home',
        'local_menu': [],
    })
