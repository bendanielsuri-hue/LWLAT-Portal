from django.urls import include, path
from . import views

urlpatterns = [
    path('', views.inclusion_hub, name='inclusion_hub'),
    path('provision-strategies/', views.inclusion_provision_strategies, name='inclusion_provision_strategies'),
    path('diagnosis-tracker/', views.inclusion_diagnosis_tracker, name='inclusion_diagnosis_tracker'),

    path('panel/', include('hubs.inclusion.panel.urls')),
]
