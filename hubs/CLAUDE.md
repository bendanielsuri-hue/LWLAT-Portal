# Hubs — Shared Conventions

All hubs follow the same Django app pattern. This file documents what's shared; each hub's own `CLAUDE.md` covers what's unique to it.

## View pattern

- All views are plain function-based views.
- Standard context keys per page: `local_menu` (list of `{name, url, icon, module_key}` for the hub sidebar) and `hub_title`.
- Most hubs use hardcoded dicts/lists in `views.py` — no ORM. `hubs.inclusion` and `hubs.inclusion.panel` are the exception.

## Menu + module filtering

Each hub defines a `<HUB>_MENU` list and calls the shared `core.hub_context.hub_context` helper, which does the module filtering:

```python
def _hub_context(request):
    return hub_context(request, HUB_MENU, 'Staff')
```

Every menu entry carries a `module_key` matching a Django URL name. `core.modules.filter_by_module` hides entries whose module is `hidden` (or `pilot` for the wrong school). Pass the filtered result as `local_menu` in context.

A menu entry gated by something other than the Module system (e.g. a role flag like `Staff.is_dsl`, for a page a whole class of staff should see regardless of the sidebar's module rollout state) skips `module_key`/`filter_by_module` entirely and is appended to `local_menu` by hand, conditionally, after the usual filtering — see `hubs/inclusion/panel/views/base.py`'s `_panel_base_context` (Safeguarding Notes) for the pattern.

`hub_context` returns `local_menu` and `hub_title`; anything a particular hub needs on top (the Inclusion Panel's back-to-hub link, say) rides in as a keyword argument rather than forking the helper. Each hub keeps the thin `_hub_context(request)` wrapper above so the title string isn't retyped in every view. Views with no extra context pass `_hub_context(request)` straight to `render`; views with extra keys spread it: `{**_hub_context(request), 'extra': ...}`.

The helper exists because these two keys are an unenforced interface — `templates/hubs/_hub_sidebar.html` reads exactly `hub_title` and `local_menu`, and a view that forgets either renders a blank title over an empty list with no error. When each hub carried its own copy, two of them drifted (see `core/hub_context.py`'s docstring).

## Template structure

- Page template extends `templates/layout.html`.
- Includes `templates/hubs/_hub_sidebar.html` (driven by `local_menu`/`hub_title`) inside `{% block hub_sidebar %}`.
- Hub-specific templates live at `hubs/<name>/templates/hubs/<name>/`.
- Icons are SVG assets under each hub's `static/<hub>/icons/`; shared controls belong under `static/img/icons/ui/` and global shell icons under `static/img/icons/portal/`.

## Adding a new page to a hub

1. Add a view function in `views.py`.
2. Add a URL pattern in `urls.py` with a URL name.
3. Add an entry to `<HUB>_MENU` with `module_key` = the URL name.
4. Run `seed_modules` (or add a row manually) so the Module system knows about it.
