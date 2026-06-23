from django.shortcuts import render
from django.urls import reverse

from core.models import School

AGGREGATE_ENTRIES = [
    {'name': 'All Schools', 'category': None, 'aggregate': True, 'key': 'all'},
    {'name': 'All Primary', 'category': 'Primary', 'aggregate': True, 'key': 'primary'},
    {'name': 'All Secondary', 'category': 'Secondary', 'aggregate': True, 'key': 'secondary'},
]

# Single source of truth for the global hub-switcher rail and the "Switch Hub"
# picker overlay shown when the hub sidebar is collapsed — both render this
# same list so the hub order/icons never drift apart between the two.
HUB_NAV_ITEMS = [
    {'url_name': 'homepage', 'icon': 'icons/house_svg.html', 'label': 'LWLAT Portal', 'prefix': None},
    {'url_name': 'staff_hub', 'icon': 'icons/staff_svg.html', 'label': 'Staff', 'prefix': '/staff/'},
    {'url_name': 'student_hub', 'icon': 'icons/student_svg.html', 'label': 'Student', 'prefix': '/student/'},
    {'url_name': 'inclusion_hub', 'icon': 'icons/send_svg.html', 'label': 'SEND & Provision', 'prefix': '/inclusion/'},
    {'url_name': 'registers', 'icon': 'icons/registers_svg.html', 'label': 'Registers', 'prefix': '/registers/'},
    {'url_name': 'careers_hub', 'icon': 'icons/careers_svg.html', 'label': 'Careers', 'prefix': '/careers/'},
    {'url_name': 'services', 'icon': 'icons/services_svg.html', 'label': 'Operations', 'prefix': '/services/'},
    {'url_name': 'resources_hub', 'icon': 'icons/resources_svg.html', 'label': 'Resources', 'prefix': '/resources/'},
]


def build_hub_nav(request_path):
    items = []
    for entry in HUB_NAV_ITEMS:
        active = request_path == '/' if entry['prefix'] is None else request_path.startswith(entry['prefix'])
        items.append({
            'url': reverse(entry['url_name']),
            'icon': entry['icon'],
            'label': entry['label'],
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


def build_sections():
    return [
        {
            'title': 'Staff',
            'url': reverse('staff_hub'),
            'description': 'Personal self-service tools for staff — timetables, leave, pay and training.',
            'items': [
                {'name': 'My Timetable', 'url': reverse('staff_my_timetable')},
                {'name': 'Staff Directory', 'url': reverse('staff_directory')},
                {'name': 'Absence Request', 'url': reverse('staff_absence_request')},
                {'name': 'Payslips', 'url': reverse('staff_payslips')},
                {'name': 'CPD & Training', 'url': reverse('staff_cpd_training')},
                {'name': 'Staff Calendar', 'url': reverse('staff_calendar')},
                {'name': 'Assessment Calendar', 'url': reverse('staff_assessment_calendar')},
                {'name': 'School Map', 'url': reverse('staff_school_map')},
            ],
            'icon_template': 'icons/staff_svg.html',
        },
        {
            'title': 'Operations',
            'url': reverse('services'),
            'description': 'Running the school day-to-day — cover, rotas, events, rooms, resources and facilities.',
            'items': [
                {'name': 'Cover Manager', 'url': reverse('service_cover_manager')},
                {'name': 'Duty & Rota Manager', 'url': reverse('service_duty_rota')},
                {'name': 'Assembly Manager', 'url': reverse('service_assembly_manager')},
                {'name': 'Admissions', 'url': reverse('service_admissions')},
                {'name': 'Events Planner', 'url': reverse('service_events_planner')},
                {'name': 'Operations Overview', 'url': reverse('service_operations_dashboard')},
                {'name': 'Exams', 'url': reverse('service_exams_dashboard')},
            ],
            'icon_template': 'icons/services_svg.html',
        },
        {
            'title': 'Resources',
            'url': reverse('resources_hub'),
            'description': 'Asset tracking and room bookings for the school estate.',
            'items': [
                {'name': 'Asset Register', 'url': reverse('resource_asset_register')},
                {'name': 'Room Bookings', 'url': reverse('resource_room_bookings')},
            ],
            'icon_template': 'icons/resources_svg.html',
        },
        {
            'title': 'Student',
            'url': reverse('student_hub'),
            'description': 'Core student record — profile, progress and equipment standards.',
            'items': [
                {'name': 'Student Profile', 'url': reverse('student_profile')},
                {'name': 'Progress Tracker', 'url': reverse('student_progress_tracker')},
                {'name': 'Standards & Equipment', 'url': reverse('student_standards_equipment')},
                {'name': 'Pastoral Tracker', 'url': reverse('student_pastoral_tracker')},
            ],
            'icon_template': 'icons/student_svg.html',
        },
        {
            'title': 'SEND & Provision',
            'url': reverse('inclusion_hub'),
            'description': 'Provision, strategies and inclusion support for students with additional needs.',
            'items': [
                {'name': 'Provision & Strategies', 'url': reverse('inclusion_provision_strategies')},
                {'name': 'Inclusion Panel', 'url': reverse('inclusion_panel')},
                {'name': 'SEND Diagnosis Tracker', 'url': reverse('inclusion_diagnosis_tracker')},
            ],
            'icon_template': 'icons/send_svg.html',
        },
        {
            'title': 'Registers',
            'url': reverse('registers'),
            'description': 'Behaviour and pastoral registers — clubs, isolation, reset room, interventions and pastoral tracking.',
            'items': [
                {'name': 'Clubs', 'url': reverse('register_clubs')},
                {'name': 'Isolation Room', 'url': reverse('register_isolation_room')},
                {'name': 'Reset Room', 'url': reverse('register_reset_room')},
                {'name': 'Interventions', 'url': reverse('register_interventions')},
            ],
            'icon_template': 'icons/registers_svg.html',
        },
        {
            'title': 'Careers',
            'url': reverse('careers_hub'),
            'description': 'Careers guidance and destinations support.',
            'items': [],
            'icon_template': 'icons/careers_svg.html',
        },
    ]


def build_search_items(sections):
    search_items = []
    for section in sections:
        search_items.append({'name': section['title'], 'url': section['url'], 'hub': section['title']})
        for item in section['items']:
            search_items.append({'name': item['name'], 'url': item['url'], 'hub': section['title']})
    return search_items


def mat_home(request):
    sections = build_sections()
    return render(request, 'mat/home.html', {
        'sections': sections,
        'hub_title': 'Home',
        'local_menu': [],
        'home_inline_panels': True,
    })
