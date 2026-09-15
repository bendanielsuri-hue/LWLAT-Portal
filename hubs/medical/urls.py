from django.urls import path
from . import views

urlpatterns = [
    path('', views.medical_hub, name='medical_hub'),
]
