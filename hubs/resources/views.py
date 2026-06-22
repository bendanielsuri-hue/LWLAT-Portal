from django.shortcuts import render

RESOURCES_MENU = [
    {'name': 'Asset Register', 'url': '/resources/asset-register/', 'icon': 'icons/registers_svg.html'},
    {'name': 'Room Bookings', 'url': '/resources/room-bookings/', 'icon': 'icons/service_svg.html'},
]


def resources_hub(request):
    return render(request, 'hubs/resources/hub.html', {'local_menu': RESOURCES_MENU, 'hub_title': 'Resources'})


def resource_asset_register(request):
    return render(request, 'hubs/resources/asset_register.html', {'local_menu': RESOURCES_MENU, 'hub_title': 'Resources'})


def resource_room_bookings(request):
    return render(request, 'hubs/resources/room_bookings.html', {'local_menu': RESOURCES_MENU, 'hub_title': 'Resources'})
