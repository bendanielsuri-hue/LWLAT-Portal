from django.shortcuts import render

from core.modules import filter_by_module, module_map

REGISTERS_MENU = [
    {'name': 'Clubs', 'url': '/registers/clubs/', 'icon': 'icons/register_svg.html', 'module_key': 'register_clubs'},
    {'name': 'Isolation Room', 'url': '/registers/isolation-room/', 'icon': 'icons/register_svg.html', 'module_key': 'register_isolation_room'},
    {'name': 'Reset Room', 'url': '/registers/reset-room/', 'icon': 'icons/register_svg.html', 'module_key': 'register_reset_room'},
    {'name': 'Interventions', 'url': '/registers/interventions/', 'icon': 'icons/register_svg.html', 'module_key': 'register_interventions'},
]


def _local_menu(request):
    return filter_by_module(REGISTERS_MENU, module_map(), request)


def _hub_context(request):
    return {'local_menu': _local_menu(request), 'hub_title': 'Registers'}


def registers_home(request):
    return render(request, 'hubs/registers/home.html', _hub_context(request))


def register_clubs(request):
    return render(request, 'hubs/registers/clubs.html', _hub_context(request))


def register_isolation_room(request):
    return render(request, 'hubs/registers/isolation_room.html', _hub_context(request))


def register_reset_room(request):
    return render(request, 'hubs/registers/reset_room.html', _hub_context(request))


def register_interventions(request):
    return render(request, 'hubs/registers/interventions.html', _hub_context(request))
