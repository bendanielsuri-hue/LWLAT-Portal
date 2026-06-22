# TestProject — Django MAT Portal

A Django multi-hub portal for a Multi-Academy Trust (MAT). One project, several "hubs," each hub itself a Django app.

## Layout

```
manage.py
db.sqlite3                  # SQLite, no models defined yet anywhere
mysite/                      # Django project config (settings.py, urls.py, wsgi.py, asgi.py)
mat/                         # Portal home — mat.views.mat_home renders the 7-hub landing page
hubs/                        # Package containing one Django app per hub
templates/                   # Shared/global templates
static/                      # Shared CSS/JS/icons
```

## Hubs = Django apps

Each hub lives at `hubs/<name>/` with its own `apps.py`, `urls.py`, `views.py`, and `templates/hubs/<name>/`. There are no Hub database models — "hub" is purely a URL/app/template grouping convention. Hubs are NOT nested in a parent-child DB relationship; each is a standalone app.

Root URLs (`mysite/urls.py`) mount each hub at its own prefix:

| Hub | Mount | App | Notes |
|---|---|---|---|
| Staff | `/staff/` | `hubs.staff` | dashboard, timetable, directory, absence, payslips, CPD, calendar, school map |
| Student | `/student/` | `hubs.student` | dashboard, profile, progress tracker, feedback, standards/equipment, pastoral tracker |
| Operations | `/services/` | `hubs.services` | cover, duty rotas, assembly, admissions, events, ops dashboard, exams |
| Registers | `/registers/` | `hubs.registers` | clubs, isolation room, reset room, interventions |
| SEND & Provision | `/inclusion/` | `hubs.inclusion` | provision strategies, diagnosis tracker, + nested **Inclusion Panel** sub-area at `/inclusion/panel/...` (students, referrals, actions, meetings, meeting setup/agenda/discussion) — has its own `PANEL_MENU`/`PANEL_BASE_CONTEXT` and a "back to hub" link up one level |
| Careers | `/careers/` | `hubs.careers` | skeleton only, no features yet |
| Resources | `/resources/` | `hubs.resources` | asset register, room bookings |

## View pattern

- All views are plain function-based views, no models/ORM use yet — context data is hardcoded dicts/lists in `views.py`.
- Standard context per page: `local_menu` (list of `{name, url, icon}` for the hub's sidebar) and `hub_title`.
- Templates: page extends `templates/layout.html`, includes `templates/hubs/_hub_sidebar.html` (driven by `local_menu`/`hub_title`) inside `{% block hub_sidebar %}`.
- Icons are shared SVG templates under `templates/icons/`.

## Other notes

- No requirements.txt/pyproject.toml/README/.env — settings.py has a hardcoded dev SECRET_KEY.
- No auth/permissions enforced yet despite the role-shaped hub design.
- Static: `static/css/style.css` (theme vars: 10 colors, light/dark, 3 text sizes), `static/js/main.js` (hub-switcher nav, sidebar toggles, localStorage theme persistence).

## Running the server / known gotchas

- `.venv` ships with only `pip` preinstalled — run `.venv\Scripts\python.exe -m pip install django` before first `runserver`.
- `posts` was removed from `INSTALLED_APPS` (mysite/settings.py): it had no app on disk and crashed `manage.py runserver` outright. If reintroducing it, create the app first.
- Root URL `/` is wired directly to `mat.views.mat_home` in `mysite/urls.py` (not via `mysite/views.py`, which is otherwise unused).
