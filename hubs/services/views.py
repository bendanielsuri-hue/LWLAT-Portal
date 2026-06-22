from django.shortcuts import render

SERVICES_MENU = [
    {'name': 'Events Planner', 'url': '/services/events-planner/', 'icon': 'icons/service_svg.html'},
    {'name': 'Operations Overview', 'url': '/services/operations-dashboard/', 'icon': 'icons/reports_svg.html'},
    {'name': 'Exams', 'url': '/services/exams-dashboard/', 'icon': 'icons/reports_svg.html'},
    {'name': 'Cover Manager', 'url': '/services/cover-manager/', 'icon': 'icons/registers_svg.html'},
    {'name': 'Duty & Rota Manager', 'url': '/services/duty-rota/', 'icon': 'icons/registers_svg.html'},
    {'name': 'Assembly Manager', 'url': '/services/assembly-manager/', 'icon': 'icons/registers_svg.html'},
    {'name': 'Admissions', 'url': '/services/admissions/', 'icon': 'icons/registers_svg.html'},
]


def services_home(request):
    return render(request, 'hubs/services/home.html', {'local_menu': SERVICES_MENU, 'hub_title': 'Operations'})


def service_events_planner(request):
    return render(request, 'hubs/services/events_planner.html', {'local_menu': SERVICES_MENU, 'hub_title': 'Operations'})


def service_operations_dashboard(request):
    return render(request, 'hubs/services/operations_dashboard.html', {'local_menu': SERVICES_MENU, 'hub_title': 'Operations'})


def service_exams_dashboard(request):
    return render(request, 'hubs/services/exams_dashboard.html', {'local_menu': SERVICES_MENU, 'hub_title': 'Operations'})


def service_cover_manager(request):
    return render(request, 'hubs/services/cover_manager.html', {'local_menu': SERVICES_MENU, 'hub_title': 'Operations'})


def service_duty_rota(request):
    return render(request, 'hubs/services/duty_rota.html', {'local_menu': SERVICES_MENU, 'hub_title': 'Operations'})


def service_assembly_manager(request):
    return render(request, 'hubs/services/assembly_manager.html', {'local_menu': SERVICES_MENU, 'hub_title': 'Operations'})


def service_admissions(request):
    return render(request, 'hubs/services/admissions.html', {'local_menu': SERVICES_MENU, 'hub_title': 'Operations'})
