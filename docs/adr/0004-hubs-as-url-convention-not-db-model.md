# Hubs are a URL/app/template grouping convention, not a database model

There is no `Hub` model. A "hub" is purely the combination of a Django app under `hubs/<name>/`, its own `urls.py` mount prefix in `mysite/urls.py`, and its own templates under `hubs/<name>/templates/hubs/<name>/`. Hubs are not nested in a parent-child DB relationship with each other — the one apparent exception, Inclusion Panel living under `/inclusion/panel/...`, is still a standalone Django app (`hubs.inclusion.panel`) with its own `urls.py`/`views.py`/models, just mounted under the Inclusion hub's URL prefix and carrying a "back to hub" link for UX continuity; it's not a foreign-keyed child record of an `Inclusion` row.

A future reader who sees `HUB_NAV_ITEMS`, `PANEL_MENU`, and per-hub `module_key` tagging might reasonably assume there's a `Hub` table somewhere driving all of this. There isn't — visibility/rollout is driven by the separate `Module` table (keyed on Django URL names, not a hub FK), and "which hub" is inferred entirely from URL structure and Python constants.

## Considered options

- **`Hub` model with FK'd pages/modules**: rejected — a hub has no data of its own (no settings, no ownership, nothing queried "by hub" beyond the nav grouping), so a table would exist only to be a label. `Module.key` matching a URL name already gives the same nav-filtering behaviour without an extra join, and adding a hub isn't a data migration — it's a new Django app plus a `urls.py` mount.
