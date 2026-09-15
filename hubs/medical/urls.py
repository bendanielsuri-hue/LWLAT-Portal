from django.urls import path
from . import views

urlpatterns = [
    path('', views.medical_hub, name='medical_hub'),
    path('profiles/', views.medical_profiles, name='medical_profiles'),
    path('log/', views.medical_log, name='medical_log'),
    path('accident-book/', views.medical_accident_book, name='medical_accident_book'),
    path('care-plans/', views.medical_care_plans, name='medical_care_plans'),
    path('consent/', views.medical_consent, name='medical_consent'),
    path('immunisations/', views.medical_immunisations, name='medical_immunisations'),
    path('equipment/', views.medical_equipment, name='medical_equipment'),
]
