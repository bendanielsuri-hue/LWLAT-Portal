from django.shortcuts import render

from core.modules import filter_by_module, module_map

RESOURCES_MENU = [
    {'name': 'Asset Register', 'url': '/resources/asset-register/', 'icon': 'icons/registers_svg.html', 'module_key': 'resource_asset_register'},
    {'name': 'Room Bookings', 'url': '/resources/room-bookings/', 'icon': 'icons/service_svg.html', 'module_key': 'resource_room_bookings'},
]


def _local_menu(request):
    return filter_by_module(RESOURCES_MENU, module_map(), request)


def _hub_context(request):
    return {'local_menu': _local_menu(request), 'hub_title': 'Resources'}


def resources_hub(request):
    return render(request, 'hubs/resources/hub.html', _hub_context(request))


def resource_asset_register(request):
    return render(request, 'hubs/resources/asset_register.html', _hub_context(request))


def resource_room_bookings(request):
    return render(request, 'hubs/resources/room_bookings.html', _hub_context(request))
