from django.apps import AppConfig


class RegistersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'hubs.registers'
    # Shown in the footer - see docs/adr/0011.
    VERSION = '0.1.0'
