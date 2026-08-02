from django.apps import AppConfig


class ResourcesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'hubs.resources'
    # Shown in the footer - see docs/adr/0011.
    VERSION = '0.1.0'
