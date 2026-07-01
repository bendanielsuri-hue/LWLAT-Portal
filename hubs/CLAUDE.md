# Hubs — Shared Conventions

All hubs follow the same Django app pattern. This file documents what's shared; each hub's own `CLAUDE.md` covers what's unique to it.

## View pattern

- All views are plain function-based views.
- Standard context keys per page: `local_menu` (list of `{name, url, icon, module_key}` for the hub sidebar) and `hub_title`.
- Most hubs use hardcoded dicts/lists in `views.py` — no ORM. `hubs.inclusion` and `hubs.inclusion.panel` are the exception.

## Menu + module filtering

Each hub defines a `<HUB>_MENU` list and a `_local_menu(request)` helper:

```python
def _local_menu(request):
    return filter_by_module(HUB_MENU, module_map(), request)
```

Every menu entry carries a `module_key` matching a Django URL name. `core.modules.filter_by_module` hides entries whose module is `hidden` (or `pilot` for the wrong school). Pass the filtered result as `local_menu` in context.

## Template structure

- Page template extends `templates/layout.html`.
- Includes `templates/hubs/_hub_sidebar.html` (driven by `local_menu`/`hub_title`) inside `{% block hub_sidebar %}`.
- Hub-specific templates live at `hubs/<name>/templates/hubs/<name>/`.
- Icons are shared SVG templates under `templates/icons/`.

## Adding a new page to a hub

1. Add a view function in `views.py`.
2. Add a URL pattern in `urls.py` with a URL name.
3. Add an entry to `<HUB>_MENU` with `module_key` = the URL name.
4. Run `seed_modules` (or add a row manually) so the Module system knows about it.
