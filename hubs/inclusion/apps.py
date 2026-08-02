from django.apps import AppConfig


class InclusionConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'hubs.inclusion'
    # Shown in the footer, including on nested /inclusion/panel/... pages
    # (panel doesn't version separately) - see docs/adr/0011.
    VERSION = '0.1.0'
