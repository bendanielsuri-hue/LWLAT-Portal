from django.shortcuts import render

from core.modules import filter_by_module, request_module_map

SERVICES_MENU = [
    {'name': 'Events Planner', 'url': '/services/events-planner/', 'icon': 'services/icons/calendar_star.svg', 'module_key': 'service_events_planner'},
    {'name': 'Operations Overview', 'url': '/services/operations-dashboard/', 'icon': 'services/icons/operations_overview.svg', 'module_key': 'service_operations_dashboard'},
    {'name': 'Exams', 'url': '/services/exams-dashboard/', 'icon': 'services/icons/exams.svg', 'module_key': 'service_exams_dashboard'},
    {'name': 'Cover Manager', 'url': '/services/cover-manager/', 'icon': 'services/icons/cover_manager.svg', 'module_key': 'service_cover_manager'},
    {'name': 'Duty & Rota Manager', 'url': '/services/duty-rota/', 'icon': 'services/icons/rota.svg', 'module_key': 'service_duty_rota'},
    {'name': 'Assembly Manager', 'url': '/services/assembly-manager/', 'icon': 'services/icons/assembly.svg', 'module_key': 'service_assembly_manager'},
    {'name': 'Admissions', 'url': '/services/admissions/', 'icon': 'resources/icons/admissions.svg', 'module_key': 'service_admissions'},
]


def _local_menu(request):
    return filter_by_module(SERVICES_MENU, request_module_map(request), request)


def _hub_context(request):
    return {'local_menu': _local_menu(request), 'hub_title': 'Operations'}


def services_home(request):
    return render(request, 'hubs/services/home.html', _hub_context(request))


def service_events_planner(request):
    return render(request, 'hubs/services/events_planner.html', _hub_context(request))


def service_operations_dashboard(request):
    return render(request, 'hubs/services/operations_dashboard.html', _hub_context(request))


def service_exams_dashboard(request):
    return render(request, 'hubs/services/exams_dashboard.html', _hub_context(request))


def service_cover_manager(request):
    return render(request, 'hubs/services/cover_manager.html', _hub_context(request))


def service_duty_rota(request):
    return render(request, 'hubs/services/duty_rota.html', _hub_context(request))


def service_assembly_manager(request):
    return render(request, 'hubs/services/assembly_manager.html', _hub_context(request))


def service_admissions(request):
    return render(request, 'hubs/services/admissions.html', _hub_context(request))
