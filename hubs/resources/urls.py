from django.urls import path
from . import views

urlpatterns = [
    path('', views.resources_hub, name='resources_hub'),
    path('asset-register/', views.resource_asset_register, name='resource_asset_register'),
    path('room-bookings/', views.resource_room_bookings, name='resource_room_bookings'),
]
