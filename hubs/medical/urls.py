from django.urls import path
from . import views

urlpatterns = [
    path('', views.medical_hub, name='medical_hub'),
    path('profiles/', views.medical_profiles, name='medical_profiles'),
    path('log/', views.medical_log, name='medical_log'),
    path('immunisations/', views.medical_immunisations, name='medical_immunisations'),
    path('stock/', views.medical_stock, name='medical_stock'),
]
