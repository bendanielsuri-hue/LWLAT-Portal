# Registers Hub — `hubs.registers`

Mounted at `/registers/`. Pages: Home, Clubs, Library, Isolation Room, Reset Room, Interventions.

## Data

No real models — all views return hardcoded data. No ORM use.

## Notable patterns

- `REGISTERS_MENU` — 5-item sidebar with `module_key` per entry. Ordered voluntary-first (Clubs, Library) then sanctions (Isolation Room, Reset Room), not alphabetically.
- `_hub_context(request)` — one-line wrapper over `core.hub_context.hub_context`, returning the module-gated `local_menu` (from `REGISTERS_MENU`) plus `hub_title` (`'Registers'`). Spread into every view's render context instead of retyped per view.
- No static files specific to this hub.
