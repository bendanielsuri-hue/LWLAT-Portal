- When Reporting information to me, be extremely consise and sacrifice grammar for the sake of concision

# TestProject — Django MAT Portal

A Django multi-hub portal for a Multi-Academy Trust (MAT). One project, several "hubs," each hub itself a Django app.

## Scalability

Scalability is a top priority for this project going forward. When adding or changing models/schema, favor designs that extend cleanly to new types/hubs over designs that are merely convenient for the feature in front of you — e.g. shared base tables with type-specific detail tables rather than ever-growing single tables, generic/reusable fields over one-off ones. This does not mean over-engineering or building unused abstraction now — it means choosing the option that will not need a rewrite when the third or fourth use case shows up (see the `Referral` model in `core/models.py` for a concrete example: one shared base table now, empty room for per-type detail tables added only when a type actually needs one — see [docs/adr/0001-shared-referral-base-table.md](docs/adr/0001-shared-referral-base-table.md) for why).

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

Each hub lives at `hubs/<name>/` with its own `apps.py`, `urls.py`, `views.py`, and `templates/hubs/<name>/`. There are no Hub database models — "hub" is purely a URL/app/template grouping convention. Hubs are NOT nested in a parent-child DB relationship; each is a standalone app. See [docs/adr/0004-hubs-as-url-convention-not-db-model.md](docs/adr/0004-hubs-as-url-convention-not-db-model.md) for why.

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

- No requirements.txt/pyproject.toml/.env — settings.py has a hardcoded dev SECRET_KEY. `README.md` exists but is a one-line stub.
- No auth/permissions enforced yet despite the role-shaped hub design.
- Static: `static/css/style.css` (theme vars: 10 colors, light/dark, 3 text sizes), `static/js/main.js` (hub-switcher nav, sidebar toggles, localStorage theme persistence).

## Database / seed data

- `db.sqlite3` is gitignored — **not** committed/shared between machines. Each person has their own local copy, created by running migrations.
- After cloning or pulling, always run migrations first:
  ```
  .venv\Scripts\python.exe manage.py migrate
  ```
- Dummy/demo data is **not** seeded by migrations — migrations only create empty tables. It comes from management commands, which are deterministic (fixed lists, `get_or_create` keyed on stable fields like `staff_code`/`upn` — no `random`), so running them on any machine produces the same dataset and reruns are idempotent:
  ```
  .venv\Scripts\python.exe manage.py seed_dummy_data
  .venv\Scripts\python.exe manage.py seed_schools
  .venv\Scripts\python.exe manage.py seed_benjamin_admin
  .venv\Scripts\python.exe manage.py seed_modules
  ```
  Inclusion Panel has its own additional seed commands — see `hubs/inclusion/CLAUDE.md`.
  - `seed_dummy_data` (in `core/management/commands/`) — 10 Staff + 30 Student rows.
  - `seed_schools` (in `core/management/commands/`) — must run after `seed_dummy_data`. Creates the 5 real `School` rows (Heatherbrook/Woodstock = Primary, Babington/Lancaster/South Wigston Academy = Secondary) and backfills existing Staff/Student to a school round-robin.
  - `seed_benjamin_admin` (in `hubs/inclusion/management/commands/`) — must run after `seed_dummy_data`. Sets `is_mat_staff=True` and `is_developer=True` on Benjamin Suri and clears his school FK (MAT-wide, not tied to a school). `is_developer` is what makes him the one seeded user who can see the Portal Admin hub.
  - `seed_modules` (in `core/management/commands/`) — no dependency on the other seed commands, can run any time/order. Seeds the `Module` rollout-status table (one row per hub + per leaf page, see "Module rollout status" below). Reruns are idempotent on `key` and resync `name`/`parent` but never touch `status`/`pilot_schools` — those are an admin's deliberate decision, not seed data.

### Sidebar "current user" identity

- No login system exists. Every hub's sidebar (`templates/hubs/_hub_sidebar.html`) shows a "current user" dropdown (avatar + name + job title), backed by a `current_staff_id` cookie (see `CURRENT_STAFF_COOKIE` in `core/identity.py`) and mirrored to `localStorage`. Switching identity reloads the page.
- `core.identity.current_staff(request)` / `default_staff()` fall back to **Benjamin Suri** when no cookie is set — he's the default test identity for the whole app. `mat.context_processors.current_identity` surfaces this to every template (`current_staff`, `current_staff_id`, `current_staff_list`).
- If a hub page throws `OperationalError: no such table: ...`, it means migrations haven't been run locally yet — run `migrate` (and reseed if the table is one of the demo-data ones above).
- New models/migrations: if you add fields/models to `core` or `hubs.inclusion`, run `manage.py makemigrations` and commit the generated migration file(s) — migrations are tracked in git even though the database itself isn't.

### Module rollout status

- `core.models.Module` (`key`, `name`, `parent` self-FK, `status` hidden/pilot/live, `pilot_schools` M2M to `School`, `order`) gates which hubs/pages show up in the nav rail (`mat.views.HUB_NAV_ITEMS`), the home page cards (`mat.views.build_sections`), site search, and each hub's own sidebar local menu (e.g. `hubs.staff.views.STAFF_MENU`) — all of these tag their entries with a `module_key` matching a Django URL name. `core.modules.filter_by_module`/`is_module_visible` do the actual filtering; `core.modules.module_map()` loads the whole table once per request to avoid N+1.
- Visibility rule: `hidden` cascades down to all children regardless of their own status (e.g. hiding `inclusion_hub` hides `inclusion_panel` too even though the leaf itself is `live`); `live` is always visible; `pilot` is visible only when the sidebar's school switcher (`core.identity.current_school_key`) is set to one of `pilot_schools` specifically — never for the `'all'`/`'primary'`/`'secondary'` aggregate views. The "Show all modules (incl. unreleased)" toggle in Settings (`core.modules.view_full_system`, cookie-backed like everything else in `core.identity`) bypasses all of this. See [docs/adr/0002-module-visibility-cascade-rules.md](docs/adr/0002-module-visibility-cascade-rules.md) for why.
- There is no URL-level enforcement — a hidden/pilot-elsewhere page stays directly reachable by URL, consistent with "no auth/permissions enforced yet" above. This is a discoverability filter only.
- `seed_modules` only ever creates hidden rows by default except `inclusion_hub`/`inclusion_panel` (seeded `live`, since Inclusion Panel is the only hub with real functionality today) — releasing a module is a pure data change (flip its `status` in `/portal-admin/` or `/admin/core/module/`), no code change needed.
- `Module.name` can also override the hardcoded Python label for its entry (`core.modules.module_label`) — renaming a hub/page in the admin UI doesn't need a deploy.

### Developer-only Portal Admin hub

- `Staff.is_developer` (boolean, mirrors `is_mat_staff`) is the only "developer" flag in the app — seeded `True` for Benjamin Suri by `seed_benjamin_admin`. `hubs.portaladmin` (`/portal-admin/`) is the one hub that is NOT gated by the `Module` system at all: `mat.views.build_hub_nav`/`build_sections` append it only when `core.identity.current_staff(request).is_developer` is true, full-system toggle or not, and `hubs.portaladmin.views.portaladmin_home` redirects to `/` for anyone else (same lightweight non-secure pattern as `hubs.inclusion.views._is_panel_staff`).
- The page itself is a plain-HTML form-per-row console (no Django forms) over three things: every `Module` row (status/pilot_schools/name), the singleton `MatSettings` row, the two `CategorySettings` rows (Primary/Secondary), and per-`School` overrides — see "Tiered portal settings" below. Django admin (`/admin/`) also has all of these registered as a fallback.

### Tiered portal settings (terminology, branding, contact info)

- `School`, `core.models.CategorySettings` (one row per `School.CATEGORY_CHOICES`), and the singleton `core.models.MatSettings` (forced `pk=1`) all share the same seven optional fields: `student_term`, `staff_term`, `portal_title`, `accent_colour` (one of the 10 `ACCENT_COLOUR_CHOICES` keys also used by the personal colour picker), `logo_url`, `support_email`, `support_phone`. Blank means "inherit from the next tier down."
- `core.portal_settings.resolve_portal_settings(request)` resolves each field independently: School → Category → MAT → hardcoded Python constant. Resolution is keyed **entirely off the currently-selected school** (`core.identity.current_school_key`, the same cookie that drives data filtering and `Module` pilot visibility) — deliberately not off the viewer's own identity/home school. Selecting `'all'` collapses straight to MAT → hardcoded; `'primary'`/`'secondary'` resolve Category → MAT → hardcoded; an individual school resolves all three tiers. See [docs/adr/0003-tiered-portal-settings-resolution.md](docs/adr/0003-tiered-portal-settings-resolution.md) for why.
- Exposed to every template via the `mat.context_processors.portal_settings` context processor (`portal_title`, `student_term`, `staff_term`, `accent_colour`, `logo_url`, `support_email`, `support_phone`). Applied in `templates/layout.html` (page title, breadcrumb home link, `data-school-color` attribute consumed by `static/js/main.js`'s colour-init script), `mat/templates/mat/home.html` (`<h1>`), `templates/hubs/_hub_sidebar.html` (school-switcher logo), and `templates/_settings_content.html` (support contact line). `mat.views.build_sections`/`build_hub_nav` additionally use `student_term`/`staff_term` to override the `Student`/`Staff` hub labels specifically — the one place this mechanism and `Module.name` overlap; the term override always wins for those two entries.

## Running the server / known gotchas

- `.venv` ships with only `pip` preinstalled — run `.venv\Scripts\python.exe -m pip install django` before first `runserver`.
- `posts` was removed from `INSTALLED_APPS` (mysite/settings.py): it had no app on disk and crashed `manage.py runserver` outright. If reintroducing it, create the app first.
- Root URL `/` is wired directly to `mat.views.mat_home` in `mysite/urls.py` (not via `mysite/views.py`, which is otherwise unused).
- **Django's `{# ... #}` comment tag is single-line only** — if the comment text wraps onto a second line, Django doesn't parse it as a comment at all and renders it as literal visible text on the page instead (this has actually happened and shipped, e.g. `hubs/inclusion/panel/templates/hubs/inclusion/panel/_referral_form_fields.html`). Any comment explaining more than one line's worth of "why" — which most of this codebase's comments do — must use the block form instead: `{% comment %}...{% endcomment %}`. Reach for `{# ... #}` only for a genuinely single-line, single-sentence note.

## Design Language

See [DesignLanguage.md](DesignLanguage.md) for the portal-wide visual design language (colour, layout, typography, spacing, cards, navigation, table/list, button, pill/badge patterns, naming conventions) and [InteractionLanguage.md](InteractionLanguage.md) for hover/focus/motion rules — both extracted from the Inclusion Panel (the most complete, stable UI in the codebase). All future hub pages should follow these rules. Hub-specific implementation detail that isn't portal-wide (e.g. Panel's own status pill modifiers, meeting-card anatomy) lives in that hub's own `DesignLanguage.md` alongside its `CLAUDE.md` — see `hubs/inclusion/panel/DesignLanguage.md`.

## Agent skills

### Issue tracker

GitHub Issues on `bendanielsuri-hue/LWLAT-Portal` (uses the `gh` CLI — not yet installed on this machine). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix), unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Per-app `CONTEXT.md` files created lazily alongside each app's own `CLAUDE.md`; single shared `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Architecture decisions

Hard-to-reverse design decisions with non-obvious rationale are recorded in `docs/adr/` as they come up — see the existing ADRs there for the format. Not every decision needs one; see `docs/adr/` only when a future reader would plausibly ask "why did we do it this way?"

## Domain glossary

Apps with real, non-obvious domain vocabulary get a `CONTEXT.md` glossary alongside their `CLAUDE.md` — see `hubs/inclusion/panel/CONTEXT.md` for Inclusion Panel's terms (Referral vs PanelReferral, Panel vs PanelGroup, discussion stages, etc.). Created lazily — only once an app has real terms worth pinning down.

## Verifying UI changes

Ask before using the Playwright MCP browser tools to visually verify a change — don't reach for them by default. The user can usually eyeball a UI/layout change themselves against the running dev server; offer Playwright as an option rather than driving the browser automatically. Reserve unprompted Playwright use for cases where self-verification genuinely isn't practical.

## Design mockups

When building an HTML mockup/artifact to compare UI design alternatives, style it in the app's **Soft** theme (`data-theme="pastel"`), light mode — not the cool blue-grey default. Pull the actual token values from `static/css/theme/light.css` + the `[data-theme="pastel"]` block in `static/css/theme/themes.css` rather than approximating. Remember the "Editable field background" rule ([DesignLanguage.md](DesignLanguage.md) "Form control patterns"): pickable/label-like chrome (segmented options, fused-field labels) fills with `--bg-well`, actual text/search fields fill with `--bg-surface-alt` — never plain white `--bg-surface`, which is reserved for cards/read-only surfaces.
