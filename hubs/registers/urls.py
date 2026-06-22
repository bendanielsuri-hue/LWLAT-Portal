from django.urls import path
from . import views

urlpatterns = [
    path('', views.registers_home, name='registers'),
    path('clubs/', views.register_clubs, name='register_clubs'),
    path('isolation-room/', views.register_isolation_room, name='register_isolation_room'),
    path('reset-room/', views.register_reset_room, name='register_reset_room'),
    path('interventions/', views.register_interventions, name='register_interventions'),
]
