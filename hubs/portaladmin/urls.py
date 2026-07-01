from django.urls import path

from . import views

urlpatterns = [
    path('', views.portaladmin_home, name='portaladmin_home'),
    path('themes/', views.portaladmin_themes, name='portaladmin_themes'),
]
