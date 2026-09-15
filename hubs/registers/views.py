from django.shortcuts import render

from core.hub_context import hub_context

REGISTERS_MENU = [
    {'name': 'Clubs', 'url': '/registers/clubs/', 'icon': 'registers/icons/clubs.svg', 'module_key': 'register_clubs'},
    {'name': 'Library', 'url': '/registers/library/', 'icon': 'registers/icons/library.svg', 'module_key': 'register_library'},
    {'name': 'Isolation Room', 'url': '/registers/isolation-room/', 'icon': 'registers/icons/isolation_room.svg', 'module_key': 'register_isolation_room'},
    {'name': 'Reset Room', 'url': '/registers/reset-room/', 'icon': 'registers/icons/reset_room.svg', 'module_key': 'register_reset_room'},
    {'name': 'Interventions', 'url': '/registers/interventions/', 'icon': 'inclusion/icons/interventions.svg', 'module_key': 'register_interventions'},
]


def _hub_context(request):
    return hub_context(request, REGISTERS_MENU, 'Registers')


def registers_home(request):
    return render(request, 'hubs/registers/home.html', _hub_context(request))


def register_clubs(request):
    return render(request, 'hubs/registers/clubs.html', _hub_context(request))


def register_library(request):
    return render(request, 'hubs/registers/library.html', _hub_context(request))


def register_isolation_room(request):
    return render(request, 'hubs/registers/isolation_room.html', _hub_context(request))


def register_reset_room(request):
    return render(request, 'hubs/registers/reset_room.html', _hub_context(request))


def register_interventions(request):
    return render(request, 'hubs/registers/interventions.html', _hub_context(request))
