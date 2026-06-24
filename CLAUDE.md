# TestProject — Django MAT Portal

A Django multi-hub portal for a Multi-Academy Trust (MAT). One project, several "hubs," each hub itself a Django app.

## Layout

```
manage.py
db.sqlite3                  # SQLite, gitignored — not tracked, see "Database / seed data" below
mysite/                      # Django project config (settings.py, urls.py, wsgi.py, asgi.py)
mat/                         # Portal home — mat.views.mat_home renders the 7-hub landing page
core/                        # Shared ORM models used across hubs (Staff, Student, School)
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
| Portal Admin | `/portal-admin/` | `hubs.portaladmin` | developer-only console — see "Module rollout status" and "Tiered portal settings" below |

## View pattern

- All views are plain function-based views.
- Most hubs still use hardcoded dicts/lists in `views.py` for context data — no models/ORM use yet.
- `hubs.inclusion` and `core` are the exception: they have real Django models and applied migrations (`core.models.Staff`/`Student`/`School`, `hubs.inclusion.models` — Referral, Action, PanelReferral, etc.). Other hubs reference `core.models.Staff`/`Student` where they need real data (e.g. directory, dashboards) rather than duplicating hardcoded people. `Staff`/`Student` each have a nullable `school` FK to `core.models.School`; `mat.views.build_school_nav()` reads `School` rows (merged with hardcoded "All Schools"/"All Primary"/"All Secondary" aggregate entries) to drive the sidebar school-switcher instead of a hardcoded list.
- Standard context per page: `local_menu` (list of `{name, url, icon}` for the hub's sidebar) and `hub_title`.
- Templates: page extends `templates/layout.html`, includes `templates/hubs/_hub_sidebar.html` (driven by `local_menu`/`hub_title`) inside `{% block hub_sidebar %}`.
- Icons are shared SVG templates under `templates/icons/`.

## Other notes

- No requirements.txt/pyproject.toml/README/.env — settings.py has a hardcoded dev SECRET_KEY.
- No auth/permissions enforced yet despite the role-shaped hub design.
- Static: `static/css/style.css` (theme vars: 10 colors, light/dark, 3 text sizes), `static/js/main.js` (hub-switcher nav, sidebar toggles, localStorage theme persistence).

## Database / seed data

- `db.sqlite3` is gitignored — **not** committed/shared between machines. Each person has their own local copy, created by running migrations.
- After cloning or pulling, always run migrations first:
  ```
  .venv\Scripts\python.exe manage.py migrate
  ```
- Dummy/demo data (staff, students, referral categories, demo referrals) is **not** seeded by migrations — migrations only create empty tables. It comes from management commands, which are deterministic (fixed lists, `get_or_create` keyed on stable fields like `staff_code`/`upn` — no `random`), so running them on any machine produces the same dataset and reruns are idempotent:
  ```
  .venv\Scripts\python.exe manage.py seed_dummy_data
  .venv\Scripts\python.exe manage.py seed_schools
  .venv\Scripts\python.exe manage.py seed_referral_questions
  .venv\Scripts\python.exe manage.py seed_demo_referrals
  .venv\Scripts\python.exe manage.py seed_panel_groups
  .venv\Scripts\python.exe manage.py seed_benjamin_admin
  .venv\Scripts\python.exe manage.py seed_modules
  ```
  - `seed_dummy_data` (in `core/management/commands/`) — 10 Staff + 30 Student rows.
  - `seed_schools` (in `core/management/commands/`) — must run after `seed_dummy_data`. Creates the 5 real `School` rows (Heatherbrook/Woodstock = Primary, Babington/Lancaster/South Wigston Academy = Secondary) and backfills existing Staff/Student to a school round-robin.
  - `seed_referral_questions` (in `hubs/inclusion/management/commands/`) — default ReferralCategory/ReferralQuestion rows.
  - `seed_demo_referrals` (in `hubs/inclusion/management/commands/`) — tops up to 5 unassigned demo Referrals.
  - `seed_panel_groups` (in `hubs/inclusion/management/commands/`) — must run after `seed_schools`. Seeds `Expertise` tags (SEND, Pastoral, SENCO, Safeguarding, Attendance, Mental Health) and ensures every active `School` has a `PanelGroup` with a few `PanelGroupMember`s tagged by expertise.
  - `seed_benjamin_admin` (in `hubs/inclusion/management/commands/`) — must run after `seed_dummy_data` and `seed_schools` (requires Staff "Benjamin Suri" and School "Babington Academy" to already exist). Makes him chair of a "Babington Panel" `PanelGroup` (linked to School "Babington Academy"), gives him 3 demo Referrals/Actions, and sets `is_developer=True` so he's the one seeded user who can see the Portal Admin hub. Converges with `seed_panel_groups` on the same "Babington Panel" row regardless of run order.
  - `seed_modules` (in `core/management/commands/`) — no dependency on the other seed commands, can run any time/order. Seeds the `Module` rollout-status table (one row per hub + per leaf page, see "Module rollout status" below). Reruns are idempotent on `key` and resync `name`/`parent` but never touch `status`/`pilot_schools` — those are an admin's deliberate decision, not seed data.

### Sidebar "current user" identity

- No login system exists. Every hub's sidebar (`templates/hubs/_hub_sidebar.html`) shows a "current user" dropdown (avatar + name + job title), backed by a `current_staff_id` cookie (see `CURRENT_STAFF_COOKIE` in `core/identity.py`) and mirrored to `localStorage`. Switching identity reloads the page.
- `core.identity.current_staff(request)` / `default_staff()` fall back to **Benjamin Suri** when no cookie is set — he's the default test identity for the whole app. `mat.context_processors.current_identity` surfaces this to every template (`current_staff`, `current_staff_id`, `current_staff_list`). `hubs.inclusion.views` imports `current_staff`/`default_staff` from `core.identity` (aliased `_current_staff`/`_default_staff`) for its permission checks below.
- `_is_panel_staff(staff)` is the only "permission" check in the app: membership in any `PanelGroupMember` makes a Staff see sensitive `ActionCategory` items and add/edit `StudentNote`s. Benjamin is seeded as chair of "Babington Panel" so he passes this check — there is no separate admin/role field on `Staff`.
- `PanelGroup` has a nullable `school` FK to `core.models.School`; a School may have more than one `PanelGroup` (no uniqueness constraint). `PanelGroupMember` has a nullable `expertise` FK to `hubs.inclusion.models.Expertise` (a small lookup list managed at `/inclusion/panel/settings/expertise/`, not Django admin) describing the member's specialty (SEND, Pastoral, SENCO, etc.) — there is no "role" field on `PanelGroupMember`; chair status is tracked separately via `PanelGroup.default_chair`/`Panel.chair`. `PanelMember` (the per-meeting roster, distinct from `PanelGroupMember`) keeps its own unrelated `role` field (chair/member/note_taker/other). Due/incomplete follow-ups (`hubs.inclusion.views._due_followups`) are scoped strictly to the current `Panel`'s own `panel_group` so a follow-up raised in one group's panel can never surface in a different group's meeting — panels with no `panel_group` set see no due follow-ups. Pulling due follow-ups onto the agenda is an explicit action (`pull_in_followups` / "Pull In All Due Follow-ups" button on the agenda page), not an automatic side effect of saving panel details.
- If a hub page throws `OperationalError: no such table: ...`, it means migrations haven't been run locally yet — run `migrate` (and reseed if the table is one of the demo-data ones above).
- New models/migrations: if you add fields/models to `core` or `hubs.inclusion`, run `manage.py makemigrations` and commit the generated migration file(s) — migrations are tracked in git even though the database itself isn't.

### Module rollout status

- `core.models.Module` (`key`, `name`, `parent` self-FK, `status` hidden/pilot/live, `pilot_schools` M2M to `School`, `order`) gates which hubs/pages show up in the nav rail (`mat.views.HUB_NAV_ITEMS`), the home page cards (`mat.views.build_sections`), site search, and each hub's own sidebar local menu (e.g. `hubs.staff.views.STAFF_MENU`) — all of these tag their entries with a `module_key` matching a Django URL name. `core.modules.filter_by_module`/`is_module_visible` do the actual filtering; `core.modules.module_map()` loads the whole table once per request to avoid N+1.
- Visibility rule: `hidden` cascades down to all children regardless of their own status (e.g. hiding `inclusion_hub` hides `inclusion_panel` too even though the leaf itself is `live`); `live` is always visible; `pilot` is visible only when the sidebar's school switcher (`core.identity.current_school_key`) is set to one of `pilot_schools` specifically — never for the `'all'`/`'primary'`/`'secondary'` aggregate views. The "Show all modules (incl. unreleased)" toggle in Settings (`core.modules.view_full_system`, cookie-backed like everything else in `core.identity`) bypasses all of this.
- There is no URL-level enforcement — a hidden/pilot-elsewhere page stays directly reachable by URL, consistent with "no auth/permissions enforced yet" above. This is a discoverability filter only.
- `seed_modules` only ever creates hidden rows by default except `inclusion_hub`/`inclusion_panel` (seeded `live`, since Inclusion Panel is the only hub with real functionality today) — releasing a module is a pure data change (flip its `status` in `/portal-admin/` or `/admin/core/module/`), no code change needed.
- `Module.name` can also override the hardcoded Python label for its entry (`core.modules.module_label`) — renaming a hub/page in the admin UI doesn't need a deploy.

### Developer-only Portal Admin hub

- `Staff.is_developer` (boolean, mirrors `is_mat_staff`) is the only "developer" flag in the app — seeded `True` for Benjamin Suri by `seed_benjamin_admin`. `hubs.portaladmin` (`/portal-admin/`) is the one hub that is NOT gated by the `Module` system at all: `mat.views.build_hub_nav`/`build_sections` append it only when `core.identity.current_staff(request).is_developer` is true, full-system toggle or not, and `hubs.portaladmin.views.portaladmin_home` redirects to `/` for anyone else (same lightweight non-secure pattern as `hubs.inclusion.views._is_panel_staff`).
- The page itself is a plain-HTML form-per-row console (no Django forms) over three things: every `Module` row (status/pilot_schools/name), the singleton `MatSettings` row, the two `CategorySettings` rows (Primary/Secondary), and per-`School` overrides — see "Tiered portal settings" below. Django admin (`/admin/`) also has all of these registered as a fallback.

### Tiered portal settings (terminology, branding, contact info)

- `School`, `core.models.CategorySettings` (one row per `School.CATEGORY_CHOICES`), and the singleton `core.models.MatSettings` (forced `pk=1`) all share the same seven optional fields: `student_term`, `staff_term`, `portal_title`, `accent_colour` (one of the 10 `ACCENT_COLOUR_CHOICES` keys also used by the personal colour picker), `logo_url`, `support_email`, `support_phone`. Blank means "inherit from the next tier down."
- `core.portal_settings.resolve_portal_settings(request)` resolves each field independently: School → Category → MAT → hardcoded Python constant. Resolution is keyed **entirely off the currently-selected school** (`core.identity.current_school_key`, the same cookie that drives data filtering and `Module` pilot visibility) — deliberately not off the viewer's own identity/home school. Selecting `'all'` collapses straight to MAT → hardcoded; `'primary'`/`'secondary'` resolve Category → MAT → hardcoded; an individual school resolves all three tiers.
- Exposed to every template via the `mat.context_processors.portal_settings` context processor (`portal_title`, `student_term`, `staff_term`, `accent_colour`, `logo_url`, `support_email`, `support_phone`). Applied in `templates/layout.html` (page title, breadcrumb home link, `data-school-color` attribute consumed by `static/js/main.js`'s colour-init script), `mat/templates/mat/home.html` (`<h1>`), `templates/hubs/_hub_sidebar.html` (school-switcher logo), and `templates/_settings_content.html` (support contact line). `mat.views.build_sections`/`build_hub_nav` additionally use `student_term`/`staff_term` to override the `Student`/`Staff` hub labels specifically — the one place this mechanism and `Module.name` overlap; the term override always wins for those two entries.

## Running the server / known gotchas

- `.venv` ships with only `pip` preinstalled — run `.venv\Scripts\python.exe -m pip install django` before first `runserver`.
- `posts` was removed from `INSTALLED_APPS` (mysite/settings.py): it had no app on disk and crashed `manage.py runserver` outright. If reintroducing it, create the app first.
- Root URL `/` is wired directly to `mat.views.mat_home` in `mysite/urls.py` (not via `mysite/views.py`, which is otherwise unused).
