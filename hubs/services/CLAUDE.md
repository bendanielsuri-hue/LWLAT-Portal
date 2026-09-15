# Operations Hub — `hubs.services`

Mounted at `/services/`. Displayed as "Operations" in the nav. Pages: Home, Events Planner, Operations Dashboard, Exams Dashboard, Cover Manager, Duty & Rota Manager, Assembly Manager, Admissions.

## Data

No real models — all views return hardcoded data. No ORM use.

## Notable patterns

- `SERVICES_MENU` — 7-item sidebar, all entries carry `module_key`.
- `_hub_context(request)` — one-line wrapper over `core.hub_context.hub_context`, returning the module-gated `local_menu` (from `SERVICES_MENU`) plus `hub_title` (`'Operations'`). Spread into every view's render context instead of retyped per view.
- No static files specific to this hub.
