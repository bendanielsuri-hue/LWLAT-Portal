from django.urls import path
from . import views

urlpatterns = [
    path('', views.student_hub, name='student_hub'),
    path('dashboard/', views.student_dashboard, name='student_dashboard'),
    path('profile/', views.student_profile, name='student_profile'),
    path('progress-tracker/', views.student_progress_tracker, name='student_progress_tracker'),
    path('feedback-dashboard/', views.student_feedback_dashboard, name='student_feedback_dashboard'),
    path('standards-equipment/', views.student_standards_equipment, name='student_standards_equipment'),
    path('pastoral-tracker/', views.student_pastoral_tracker, name='student_pastoral_tracker'),
]
