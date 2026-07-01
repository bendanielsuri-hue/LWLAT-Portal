# Portal Admin Hub — `hubs.portaladmin`

Mounted at `/portal-admin/`. Developer-only console — NOT gated by the Module system. Visible only when `core.identity.current_staff(request).is_developer` is `True`; `portaladmin_home` redirects to `/` for anyone else.

## What it manages

A single page (`portaladmin_home`) with plain-HTML form-per-row controls over:
- Every `Module` row (status / pilot_schools / name)
- The singleton `MatSettings` row
- The two `CategorySettings` rows (Primary / Secondary)
- Per-`School` overrides for the same seven fields

Uses `core.portal_settings.FIELDS` to dynamically iterate and set attributes via `_apply_fields()` — no Django forms.

## Models used

All from `core.models`: `Module`, `School`, `MatSettings`, `CategorySettings`. Django admin (`/admin/`) also has all of these registered as a fallback.

## Menu

`PORTALADMIN_MENU` (in `views.py`) — two entries, Dashboard and Themes. Plain hardcoded list, not run through `filter_by_module`/`module_map()` (Portal Admin isn't gated by the Module system at all, per the top of this file).

## Themes page

`portaladmin_themes` (`/portal-admin/themes/`) — a static component gallery (every `.btn-*` variant, `.priority-chip`/`.status-pill` state, card/badge accent, and a swatch per surface/text/role colour token) for visually checking the theming system across Theme/Palette/Accent combinations. No DB reads; the three token lists (`surface_tokens`/`text_tokens`/`role_tokens`) are passed straight from the view. Same `is_developer` gate as `portaladmin_home`. Links `hubs/inclusion/panel/static/css/panel.css` (served at `css/panel.css`) for `.status-pill`/`.priority-chip`, which have no shared base outside that app yet — same reuse `portaladmin_home` already does for `.btn-edit`.

## Developer identity

`Staff.is_developer` is set by `seed_benjamin_admin` (in `hubs/inclusion/panel/management/commands/`). Benjamin Suri is the only seeded developer.
