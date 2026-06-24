from django.urls import path

from . import views

urlpatterns = [
    path('', views.portaladmin_home, name='portaladmin_home'),
]
