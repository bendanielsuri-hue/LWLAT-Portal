- When Reporting information to me, be extremely consise and sacrifice grammar for the sake of concision

# TestProject — Django MAT Portal

A Django multi-hub portal for a Multi-Academy Trust (MAT). One project, several "hubs," each hub itself a Django app.

## Scalability

Scalability is a top priority for this project going forward — apply `(ENG-S1)` deliberately when touching models/schema (shared base tables with type-specific detail tables rather than ever-growing single tables, generic/reusable fields over one-off ones). See the `Referral` model in `core/models.py` for a concrete example: one shared base table now, empty room for per-type detail tables added only when a type actually needs one — see [docs/adr/0001-shared-referral-base-table.md](docs/adr/0001-shared-referral-base-table.md) for why.

## Hubs = Django apps

Each hub lives at `hubs/<name>/` with its own `apps.py`, `urls.py`, `views.py`, and `templates/hubs/<name>/`. There are no Hub database models — "hub" is purely a URL/app/template grouping convention. Hubs are NOT nested in a parent-child DB relationship; each is a standalone app. See [docs/adr/0004-hubs-as-url-convention-not-db-model.md](docs/adr/0004-hubs-as-url-convention-not-db-model.md) for why.

Root URLs (`mysite/urls.py`) mount each hub at its own prefix — see that file for the current list of mounts and apps. One non-obvious grouping worth flagging: SEND & Provision (`/inclusion/`, `hubs.inclusion`) nests the **Inclusion Panel** sub-area at `/inclusion/panel/...` (students, referrals, actions, meetings, meeting setup/agenda/discussion) with its own `PANEL_MENU`/`PANEL_BASE_CONTEXT` and a "back to hub" link up one level. Portal Admin (`/portal-admin/`, `hubs.portaladmin`) is a developer-only console — see [core/CONTEXT.md](core/CONTEXT.md).

## View pattern

- `hubs.inclusion` and `core` are the exception to plain hardcoded views: they have real Django models and applied migrations (`core.models.Staff`/`Student`/`School`, `hubs.inclusion.models` — Referral, Action, PanelReferral, etc.). Other hubs reference `core.models.Staff`/`Student` where they need real data (e.g. directory, dashboards) rather than duplicating hardcoded people. `Staff`/`Student` each have a nullable `school` FK to `core.models.School`; `mat.views.build_school_nav()` reads `School` rows (merged with hardcoded "All Schools"/"All Primary"/"All Secondary" aggregate entries) to drive the sidebar school-switcher instead of a hardcoded list.
- Standard context per page: `local_menu` (list of `{name, url, icon}` for the hub's sidebar) and `hub_title`.
- Templates: page extends `templates/layout.html`, includes `templates/hubs/_hub_sidebar.html` (driven by `local_menu`/`hub_title`) inside `{% block hub_sidebar %}`.
- Icons are shared SVG templates under `templates/icons/`.

## Other notes

- No requirements.txt/pyproject.toml/.env — settings.py has a hardcoded dev SECRET_KEY. `README.md` exists but is a one-line stub.
- No auth/permissions enforced yet despite the role-shaped hub design.

## Database / seed data

- `db.sqlite3` is gitignored — **not** committed/shared between machines. Each person has their own local copy, created by running migrations.
- No production deployment exists yet, so every row in every table is dummy/seed/hand-created data. When a schema change would otherwise need a backfill/migration of *existing rows* onto a new shape, prefer dropping and reseeding over writing preservation logic — there's no real data to lose (see #80/[decoupled SafeguardingNote](hubs/inclusion/panel/CONTEXT.md) for a concrete instance of this call). Revisit this default once a real deployment exists.
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
  .venv\Scripts\python.exe manage.py seed_staff_groups
  .venv\Scripts\python.exe manage.py seed_student_history
  .venv\Scripts\python.exe manage.py seed_safeguarding_notes
  ```
  Inclusion Panel has its own additional seed commands — see `hubs/inclusion/CLAUDE.md`.
  - `seed_dummy_data` (in `core/management/commands/`) — Staff + Student rows. Also sets `Staff.is_dsl=True` for every seeded SENDCo (the closest real-world overlap this dummy data has with a Designated Safeguarding Lead — gates who can write a `core.models.SafeguardingNote`).
  - `seed_schools` (in `core/management/commands/`) — must run after `seed_dummy_data`. Creates the 5 real `School` rows (Heatherbrook/Woodstock = Primary, Babington/Lancaster/South Wigston Academy = Secondary) and backfills existing Staff/Student to a school round-robin.
  - `seed_benjamin_admin` (in `hubs/inclusion/management/commands/`) — must run after `seed_dummy_data`. Sets `is_mat_staff=True`, `is_developer=True`, and `is_dsl=True` on Benjamin Suri and clears his school FK (MAT-wide, not tied to a school). `is_developer` is what makes him the one seeded user who can see the Portal Admin hub.
  - `seed_modules` (in `core/management/commands/`) — no dependency on the other seed commands, can run any time/order. Seeds the `Module` rollout-status table (one row per hub + per leaf page — see [core/CONTEXT.md](core/CONTEXT.md)). Reruns are idempotent on `key` and resync `name`/`parent` but never touch `status`/`pilot_schools` — those are an admin's deliberate decision, not seed data.
  - `seed_staff_groups` (in `core/management/commands/`) — must run after `seed_dummy_data`/`seed_schools`. Seeds `core.StaffGroup` rows a task/action can be assigned to instead of one individual: a SENCo Team per school (reusing the existing SENDCo assignment), Head of Year N per school/year group (created with no members — no data models who actually holds that role yet), and one MAT-wide Careers Team.
  - `seed_student_history` (in `core/management/commands/`) — must run after `seed_dummy_data`/`seed_schools`. Seeds `AttendanceDay`/`BehaviourIncident`/`Exclusion` rows (see `core/CONTEXT.md` and [ADR 0007](docs/adr/0007-student-history-tables-not-summary-fields.md)) — the real per-record history behind `core.student_history`'s derived percentage/summary/count helpers, replacing the old `Student.attendance_pct`/`behaviour_summary`/`exclusions_count` scalar fields.
  - `seed_safeguarding_notes` (in `core/management/commands/`) — must run after `seed_dummy_data`. Seeds one active `core.models.SafeguardingNote` per every 4th `Student`, authored by a seeded `is_dsl` `Staff` — the student-scoped, panel-decoupled note model that replaced `hubs.inclusion.panel.SafeguardingBriefing` (see #77-#81).

### Sidebar "current user" identity

- No login system exists. Every hub's sidebar (`templates/hubs/_hub_sidebar.html`) shows a "current user" dropdown (avatar + name + job title), backed by a `current_staff_id` cookie (see `CURRENT_STAFF_COOKIE` in `core/identity.py`) and mirrored to `localStorage`. Switching identity reloads the page.
- `core.identity.current_staff(request)` / `default_staff()` fall back to **Benjamin Suri** when no cookie is set — he's the default test identity for the whole app. `mat.context_processors.current_identity` surfaces this to every template (`current_staff`, `current_staff_id`, `current_staff_list`).
- If a hub page throws `OperationalError: no such table: ...`, it means migrations haven't been run locally yet — run `migrate` (and reseed if the table is one of the demo-data ones above).
- New models/migrations: if you add fields/models to `core` or `hubs.inclusion`, run `manage.py makemigrations` and commit the generated migration file(s) — migrations are tracked in git even though the database itself isn't.

### Module rollout status, Portal Admin hub, tiered portal settings

Domain vocabulary and mechanism for `Module` (rollout/visibility cascade), the developer-only Portal Admin hub, and tiered `School`/`CategorySettings`/`MatSettings` resolution now live in [core/CONTEXT.md](core/CONTEXT.md) — see the Language section there. ADRs [0002](docs/adr/0002-module-visibility-cascade-rules.md) and [0003](docs/adr/0003-tiered-portal-settings-resolution.md) hold the why.

## Running the server / known gotchas

- `.venv` ships with only `pip` preinstalled — run `.venv\Scripts\python.exe -m pip install django` before first `runserver`.
- `posts` was removed from `INSTALLED_APPS` (mysite/settings.py): it had no app on disk and crashed `manage.py runserver` outright. If reintroducing it, create the app first.
- Root URL `/` is wired directly to `mat.views.mat_home` in `mysite/urls.py` (not via `mysite/views.py`, which is otherwise unused).
- **Django's `{# ... #}` comment tag is single-line only** — if the comment text wraps onto a second line, Django doesn't parse it as a comment at all and renders it as literal visible text on the page instead (this has actually happened and shipped, e.g. `hubs/inclusion/panel/templates/hubs/inclusion/panel/_referral_form_fields.html`). Any comment explaining more than one line's worth of "why" — which most of this codebase's comments do — must use the block form instead: `{% comment %}...{% endcomment %}`. Reach for `{# ... #}` only for a genuinely single-line, single-sentence note.

## Design Language

Portal-wide visual/interaction rules live as principles in [PRINCIPLES-DESIGN.md](PRINCIPLES-DESIGN.md) (colour, layout, typography, controls, hierarchy, ...) and [PRINCIPLES-INTERACTION.md](PRINCIPLES-INTERACTION.md) (hover/focus/motion/behaviour). Cite an entry from outside its own file with a domain prefix — `DES-F1`, `INT-U3`. Concrete implementation detail (token values, component recipes, hub-specific class names) lives as comments colocated directly in the CSS/template/JS file it describes, not in a separate design doc — see e.g. `static/css/theme/light.css` for `DES-F1`'s implementation. A cross-cutting index that doesn't reduce to one code location (which helper function to reach for) lives in the owning hub's own `CLAUDE.md` — see `hubs/inclusion/panel/CLAUDE.md`'s "Key helpers". See [docs/agents/doc-conventions.md](docs/agents/doc-conventions.md) for the full rules on what becomes a principle vs. a colocated comment.

## Agent skills

### Issue tracker

GitHub Issues (plus per-App Projects/roadmap boards) on `bendanielsuri-hue/LWLAT-Portal`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix), unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Read order and glossary-usage rules for agents (which `CONTEXT.md`/ADRs to consult before exploring, how to flag an ADR conflict) — see `docs/agents/domain.md`. What these docs are and when they get created is covered under "Architecture decisions" and "Domain glossary" below.

### Grilling sessions

Always ask each question via the AskUserQuestion widget, not as inline plain-text prose — even for the first question opening the session.

## Architecture decisions

Hard-to-reverse design decisions with non-obvious rationale are recorded in `docs/adr/` as they come up — see the existing ADRs there for the format. Not every decision needs one; see `docs/adr/` only when a future reader would plausibly ask "why did we do it this way?"

## Domain glossary

Apps with real, non-obvious domain vocabulary get a `CONTEXT.md` glossary alongside their `CLAUDE.md` — see `hubs/inclusion/panel/CONTEXT.md` for Inclusion Panel's terms (Referral vs PanelReferral, Panel vs PanelGroup, discussion stages, etc.). Created lazily — only once an app has real terms worth pinning down.

## Verifying UI changes

Ask before using the Playwright MCP browser tools to visually verify a change — don't reach for them by default. The user can usually eyeball a UI/layout change themselves against the running dev server; offer Playwright as an option rather than driving the browser automatically. Reserve unprompted Playwright use for cases where self-verification genuinely isn't practical.

## Design mockups

When building an HTML mockup/artifact to compare UI design alternatives, style it in the app's **Soft** theme (`data-theme="pastel"`), light mode — not the cool blue-grey default. Pull the actual token values from `static/css/theme/light.css` + the `[data-theme="pastel"]` block in `static/css/theme/themes.css` rather than approximating — including the `(DES-F1)` comment there on which fill goes on actionable vs. read-only chrome.
