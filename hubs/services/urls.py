from django.urls import path
from . import views

urlpatterns = [
    path('', views.services_home, name='services'),
    path('events-planner/', views.service_events_planner, name='service_events_planner'),
    path('operations-dashboard/', views.service_operations_dashboard, name='service_operations_dashboard'),
    path('exams-dashboard/', views.service_exams_dashboard, name='service_exams_dashboard'),
    path('cover-manager/', views.service_cover_manager, name='service_cover_manager'),
    path('duty-rota/', views.service_duty_rota, name='service_duty_rota'),
    path('assembly-manager/', views.service_assembly_manager, name='service_assembly_manager'),
    path('admissions/', views.service_admissions, name='service_admissions'),
]
