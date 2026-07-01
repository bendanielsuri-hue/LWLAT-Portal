from django import template

register = template.Library()


@register.simple_tag
def active_menu_item(path, item, menu):
    """Return 'active' for the menu item whose url is the longest matching
    prefix of path, so nested sub-pages (not themselves menu entries) still
    highlight their parent item instead of none at all."""
    candidates = [m for m in menu if path.startswith(m['url'])]
    if not candidates:
        return ''
    best = max(candidates, key=lambda m: len(m['url']))
    return 'active' if best['url'] == item['url'] else ''
