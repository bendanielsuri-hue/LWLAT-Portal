# Resources Hub — `hubs.resources`

Mounted at `/resources/`. Pages: Hub, Asset Register, Room Bookings.

## Data

No real models — all views return hardcoded data. No ORM use.

## Notable patterns

- `RESOURCES_MENU` — 2-item sidebar with `module_key` per entry.
- `_local_menu(request)` — standard `filter_by_module` helper.
- `_hub_context(request)` — `{'local_menu': _local_menu(request), 'hub_title': 'Resources'}`, spread into every view's render context.
- No static files specific to this hub.
