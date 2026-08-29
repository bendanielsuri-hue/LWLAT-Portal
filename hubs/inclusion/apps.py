from django.apps import AppConfig


class InclusionConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'hubs.inclusion'
    # Shown in the footer on SEND & Provision pages. Nested /inclusion/panel/
    # pages show hubs.inclusion.panel's own VERSION instead - see its apps.py
    # and docs/adr/0011.
    VERSION = '0.1.0'
