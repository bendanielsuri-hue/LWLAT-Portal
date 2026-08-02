from django.apps import AppConfig


class StaffConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'hubs.staff'
    # Shown in the footer - see docs/adr/0011.
    VERSION = '0.1.0'
