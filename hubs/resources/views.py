from django.shortcuts import render

from core.hub_context import hub_context

RESOURCES_MENU = [
    {'name': 'Asset Register', 'url': '/resources/asset-register/', 'icon': 'resources/icons/asset_tag.svg', 'module_key': 'resource_asset_register'},
    {'name': 'Room Bookings', 'url': '/resources/room-bookings/', 'icon': 'services/icons/room_booking.svg', 'module_key': 'resource_room_bookings'},
]


def _hub_context(request):
    return hub_context(request, RESOURCES_MENU, 'Resources')


def resources_hub(request):
    return render(request, 'hubs/resources/hub.html', _hub_context(request))


def resource_asset_register(request):
    return render(request, 'hubs/resources/asset_register.html', _hub_context(request))


def resource_room_bookings(request):
    return render(request, 'hubs/resources/room_bookings.html', _hub_context(request))
