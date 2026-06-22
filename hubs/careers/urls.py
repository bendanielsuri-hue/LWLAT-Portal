from django.urls import path
from . import views

urlpatterns = [
    path('', views.careers_hub, name='careers_hub'),
]
