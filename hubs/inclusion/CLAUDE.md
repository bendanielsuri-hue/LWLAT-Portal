# Inclusion Hub — `hubs.inclusion`

Mounted at `/inclusion/`. Has two areas:

- **SEND & Provision** — 3 views: `inclusion_hub` (dashboard with SEN stats), `inclusion_provision_strategies`, `inclusion_diagnosis_tracker`. All in `hubs/inclusion/views.py`.
- **Inclusion Panel** — a full nested Django app at `hubs/inclusion/panel/`. See `hubs/inclusion/panel/CLAUDE.md`.

## Models

All models have moved to `hubs.inclusion.panel`. `hubs/inclusion/models.py` is empty. The `inclusion_hub` view imports `Referral` and `Action` from `hubs.inclusion.panel.models` to display stats.

## URLs

`hubs/inclusion/urls.py` mounts the panel sub-app:

```python
path('panel/', include('hubs.inclusion.panel.urls')),
```

All `/inclusion/panel/...` routing is handled by the panel app's own `urls.py`.

## Seeds

Core seeds only — inclusion has no seeds of its own:
```
manage.py seed_dummy_data    # Staff + Students (core)
manage.py seed_schools       # Schools (core)
```
Panel-specific seeds are documented in `hubs/inclusion/panel/CLAUDE.md`.
