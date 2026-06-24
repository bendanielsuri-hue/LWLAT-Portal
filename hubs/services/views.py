from django.shortcuts import render

from core.modules import filter_by_module, module_map

SERVICES_MENU = [
    {'name': 'Events Planner', 'url': '/services/events-planner/', 'icon': 'icons/service_svg.html', 'module_key': 'service_events_planner'},
    {'name': 'Operations Overview', 'url': '/services/operations-dashboard/', 'icon': 'icons/reports_svg.html', 'module_key': 'service_operations_dashboard'},
    {'name': 'Exams', 'url': '/services/exams-dashboard/', 'icon': 'icons/reports_svg.html', 'module_key': 'service_exams_dashboard'},
    {'name': 'Cover Manager', 'url': '/services/cover-manager/', 'icon': 'icons/registers_svg.html', 'module_key': 'service_cover_manager'},
    {'name': 'Duty & Rota Manager', 'url': '/services/duty-rota/', 'icon': 'icons/registers_svg.html', 'module_key': 'service_duty_rota'},
    {'name': 'Assembly Manager', 'url': '/services/assembly-manager/', 'icon': 'icons/registers_svg.html', 'module_key': 'service_assembly_manager'},
    {'name': 'Admissions', 'url': '/services/admissions/', 'icon': 'icons/registers_svg.html', 'module_key': 'service_admissions'},
]


def _local_menu(request):
    return filter_by_module(SERVICES_MENU, module_map(), request)


def services_home(request):
    return render(request, 'hubs/services/home.html', {'local_menu': _local_menu(request), 'hub_title': 'Operations'})


def service_events_planner(request):
    return render(request, 'hubs/services/events_planner.html', {'local_menu': _local_menu(request), 'hub_title': 'Operations'})


def service_operations_dashboard(request):
    return render(request, 'hubs/services/operations_dashboard.html', {'local_menu': _local_menu(request), 'hub_title': 'Operations'})


def service_exams_dashboard(request):
    return render(request, 'hubs/services/exams_dashboard.html', {'local_menu': _local_menu(request), 'hub_title': 'Operations'})


def service_cover_manager(request):
    return render(request, 'hubs/services/cover_manager.html', {'local_menu': _local_menu(request), 'hub_title': 'Operations'})


def service_duty_rota(request):
    return render(request, 'hubs/services/duty_rota.html', {'local_menu': _local_menu(request), 'hub_title': 'Operations'})


def service_assembly_manager(request):
    return render(request, 'hubs/services/assembly_manager.html', {'local_menu': _local_menu(request), 'hub_title': 'Operations'})


def service_admissions(request):
    return render(request, 'hubs/services/admissions.html', {'local_menu': _local_menu(request), 'hub_title': 'Operations'})
