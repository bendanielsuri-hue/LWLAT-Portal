# Registers Hub — `hubs.registers`

Mounted at `/registers/`. Pages: Home, Clubs, Isolation Room, Reset Room, Interventions.

## Data

No real models — all views return hardcoded data. No ORM use.

## Notable patterns

- `REGISTERS_MENU` — 4-item sidebar with `module_key` per entry.
- `_local_menu(request)` — standard `filter_by_module` helper.
- `_hub_context(request)` — `{'local_menu': _local_menu(request), 'hub_title': 'Registers'}`, spread into every view's render context.
- No static files specific to this hub.
