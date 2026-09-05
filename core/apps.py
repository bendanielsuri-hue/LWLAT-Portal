from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'
    # Shown in the footer on pages that aren't owned by a specific hub (MAT
    # home, Portal Admin) - see docs/adr/0011.
    VERSION = '0.1.1'
