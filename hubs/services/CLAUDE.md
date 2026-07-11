# Operations Hub — `hubs.services`

Mounted at `/services/`. Displayed as "Operations" in the nav. Pages: Home, Events Planner, Operations Dashboard, Exams Dashboard, Cover Manager, Duty & Rota Manager, Assembly Manager, Admissions.

## Data

No real models — all views return hardcoded data. No ORM use.

## Notable patterns

- `SERVICES_MENU` — 7-item sidebar, all entries carry `module_key`.
- `_local_menu(request)` — standard `filter_by_module` helper.
- `_hub_context(request)` — `{'local_menu': _local_menu(request), 'hub_title': 'Operations'}`, spread into every view's render context.
- No static files specific to this hub.
