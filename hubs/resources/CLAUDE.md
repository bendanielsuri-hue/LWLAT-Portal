# Resources Hub — `hubs.resources`

Mounted at `/resources/`. Pages: Hub, Asset Register, Room Bookings.

## Data

No real models — all views return hardcoded data. No ORM use.

## Notable patterns

- `RESOURCES_MENU` — 2-item sidebar with `module_key` per entry.
- `_hub_context(request)` — one-line wrapper over `core.hub_context.hub_context`, returning the module-gated `local_menu` (from `RESOURCES_MENU`) plus `hub_title` (`'Resources'`). Spread into every view's render context instead of retyped per view.
- No static files specific to this hub.
