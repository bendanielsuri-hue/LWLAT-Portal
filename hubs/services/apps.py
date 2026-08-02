from django.apps import AppConfig


class ServicesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'hubs.services'
    # Shown in the footer - see docs/adr/0011.
    VERSION = '0.1.0'
