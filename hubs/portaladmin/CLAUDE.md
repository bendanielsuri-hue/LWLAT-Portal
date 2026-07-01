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

## No menu

Portal Admin has no local sidebar menu — it's a single-page console.

## Developer identity

`Staff.is_developer` is set by `seed_benjamin_admin` (in `hubs/inclusion/panel/management/commands/`). Benjamin Suri is the only seeded developer.
