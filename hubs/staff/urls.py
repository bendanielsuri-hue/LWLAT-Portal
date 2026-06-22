from django.urls import path
from . import views

urlpatterns = [
    path('', views.staff_hub, name='staff_hub'),
    path('dashboard/', views.staff_dashboard, name='staff_dashboard'),
    path('reports/', views.staff_reports, name='staff_reports'),
    path('my-timetable/', views.staff_my_timetable, name='staff_my_timetable'),
    path('directory/', views.staff_directory, name='staff_directory'),
    path('absence-request/', views.staff_absence_request, name='staff_absence_request'),
    path('payslips/', views.staff_payslips, name='staff_payslips'),
    path('cpd-training/', views.staff_cpd_training, name='staff_cpd_training'),
    path('calendar/', views.staff_calendar, name='staff_calendar'),
    path('assessment-calendar/', views.staff_assessment_calendar, name='staff_assessment_calendar'),
    path('school-map/', views.staff_school_map, name='staff_school_map'),
]
