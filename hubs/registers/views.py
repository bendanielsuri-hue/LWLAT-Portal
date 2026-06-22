from django.shortcuts import render

REGISTERS_MENU = [
    {'name': 'Clubs', 'url': '/registers/clubs/', 'icon': 'icons/register_svg.html'},
    {'name': 'Isolation Room', 'url': '/registers/isolation-room/', 'icon': 'icons/register_svg.html'},
    {'name': 'Reset Room', 'url': '/registers/reset-room/', 'icon': 'icons/register_svg.html'},
    {'name': 'Interventions', 'url': '/registers/interventions/', 'icon': 'icons/register_svg.html'},
]


def registers_home(request):
    return render(request, 'hubs/registers/home.html', {'local_menu': REGISTERS_MENU, 'hub_title': 'Registers'})


def register_clubs(request):
    return render(request, 'hubs/registers/clubs.html', {'local_menu': REGISTERS_MENU, 'hub_title': 'Registers'})


def register_isolation_room(request):
    return render(request, 'hubs/registers/isolation_room.html', {'local_menu': REGISTERS_MENU, 'hub_title': 'Registers'})


def register_reset_room(request):
    return render(request, 'hubs/registers/reset_room.html', {'local_menu': REGISTERS_MENU, 'hub_title': 'Registers'})


def register_interventions(request):
    return render(request, 'hubs/registers/interventions.html', {'local_menu': REGISTERS_MENU, 'hub_title': 'Registers'})
