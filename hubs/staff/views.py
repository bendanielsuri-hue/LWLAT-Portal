from django.shortcuts import render

from core.models import Staff
from core.modules import filter_by_module, module_map

STAFF_MENU = [
    {'name': 'Staff Dashboard', 'url': '/staff/dashboard/', 'icon': 'icons/dashboard_svg.html', 'module_key': 'staff_dashboard'},
    {'name': 'Staff Reports', 'url': '/staff/reports/', 'icon': 'icons/reports_svg.html', 'module_key': 'staff_reports'},
    {'name': 'My Timetable', 'url': '/staff/my-timetable/', 'icon': 'icons/courses_svg.html', 'module_key': 'staff_my_timetable'},
    {'name': 'Staff Directory', 'url': '/staff/directory/', 'icon': 'icons/registers_svg.html', 'module_key': 'staff_directory'},
    {'name': 'Absence Request', 'url': '/staff/absence-request/', 'icon': 'icons/registers_svg.html', 'module_key': 'staff_absence_request'},
    {'name': 'Payslips', 'url': '/staff/payslips/', 'icon': 'icons/reports_svg.html', 'module_key': 'staff_payslips'},
    {'name': 'CPD & Training', 'url': '/staff/cpd-training/', 'icon': 'icons/courses_svg.html', 'module_key': 'staff_cpd_training'},
    {'name': 'Staff Calendar', 'url': '/staff/calendar/', 'icon': 'icons/courses_svg.html', 'module_key': 'staff_calendar'},
    {'name': 'Assessment Calendar', 'url': '/staff/assessment-calendar/', 'icon': 'icons/courses_svg.html', 'module_key': 'staff_assessment_calendar'},
    {'name': 'School Map', 'url': '/staff/school-map/', 'icon': 'icons/service_svg.html', 'module_key': 'staff_school_map'},
]


def _local_menu(request):
    return filter_by_module(STAFF_MENU, module_map(), request)


def staff_hub(request):
    return render(request, 'hubs/staff/hub.html', {'local_menu': _local_menu(request), 'hub_title': 'Staff'})


def staff_dashboard(request):
    return render(request, 'hubs/staff/dashboard.html', {'local_menu': _local_menu(request), 'hub_title': 'Staff'})


def staff_reports(request):
    return render(request, 'hubs/staff/reports.html', {'local_menu': _local_menu(request), 'hub_title': 'Staff'})


def staff_my_timetable(request):
    return render(request, 'hubs/staff/my_timetable.html', {'local_menu': _local_menu(request), 'hub_title': 'Staff'})


def staff_directory(request):
    return render(request, 'hubs/staff/directory.html', {
        'local_menu': _local_menu(request),
        'hub_title': 'Staff',
        'staff_list': Staff.objects.filter(is_active=True),
    })


def staff_absence_request(request):
    return render(request, 'hubs/staff/absence_request.html', {'local_menu': _local_menu(request), 'hub_title': 'Staff'})


def staff_payslips(request):
    return render(request, 'hubs/staff/payslips.html', {'local_menu': _local_menu(request), 'hub_title': 'Staff'})


def staff_cpd_training(request):
    return render(request, 'hubs/staff/cpd_training.html', {'local_menu': _local_menu(request), 'hub_title': 'Staff'})


def staff_calendar(request):
    return render(request, 'hubs/staff/calendar.html', {'local_menu': _local_menu(request), 'hub_title': 'Staff'})


def staff_assessment_calendar(request):
    return render(request, 'hubs/staff/assessment_calendar.html', {'local_menu': _local_menu(request), 'hub_title': 'Staff'})


def staff_school_map(request):
    return render(request, 'hubs/staff/school_map.html', {'local_menu': _local_menu(request), 'hub_title': 'Staff'})
