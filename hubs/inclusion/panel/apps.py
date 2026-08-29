from django.apps import AppConfig


class PanelConfig(AppConfig):
    name = 'hubs.inclusion.panel'
    label = 'panel'
    default_auto_field = 'django.db.models.BigAutoField'
    # Shown in the footer on /inclusion/panel/... pages - versions separately
    # from the SEND & Provision hub above it, since Panel is its own
    # AppConfig (label='panel') and evolves independently - see docs/adr/0011.
    VERSION = '0.1.0'
