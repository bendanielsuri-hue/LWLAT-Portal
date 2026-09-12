- When Reporting information to me, be extremely consise and sacrifice grammar for the sake of concision. This applies to **reporting only** — code comments invert it (full prose, and delete rather than shorten); see [docs/agents/doc-conventions.md](docs/agents/doc-conventions.md).
- Prefer recording durable project knowledge (gotchas, conventions, non-obvious rationale) in this file or another repo doc over agent memory — memory is local to one machine/user and not shared with the team or other agents working in this repo; this file is.

# TestProject — Django MAT Portal

A Django multi-hub portal for a Multi-Academy Trust (MAT). One project, several "hubs," each hub itself a Django app.

## Scalability

Scalability is a top priority for this project going forward — apply `(ENG-S1)` deliberately when touching models/schema (shared base tables with type-specific detail tables rather than ever-growing single tables, generic/reusable fields over one-off ones). See the `Referral` model in `core/models.py` for a concrete example: one shared base table now, empty room for per-type detail tables added only when a type actually needs one — see [docs/adr/0001-shared-referral-base-table.md](docs/adr/0001-shared-referral-base-table.md) for why.

## Hubs = Django apps

Each hub lives at `hubs/<name>/` with its own `apps.py`, `urls.py`, `views.py`, and `templates/hubs/<name>/`. There are no Hub database models — "hub" is purely a URL/app/template grouping convention. Hubs are NOT nested in a parent-child DB relationship; each is a standalone app. See [docs/adr/0004-hubs-as-url-convention-not-db-model.md](docs/adr/0004-hubs-as-url-convention-not-db-model.md) for why.

Root URLs (`mysite/urls.py`) mount each hub at its own prefix — see that file for the current list of mounts and apps. One non-obvious grouping worth flagging: SEND & Provision (`/inclusion/`, `hubs.inclusion`) nests the **Inclusion Panel** sub-area at `/inclusion/panel/...` (students, referrals, actions, meetings, meeting setup/agenda/discussion) with its own `PANEL_MENU`/`PANEL_BASE_CONTEXT` and a "back to hub" link up one level. Portal Admin (`/portal-admin/`, `hubs.portaladmin`) is a developer-only console — see [core/CONTEXT.md](core/CONTEXT.md).

## Adding a page or a hub

A page is declared in several places joined only by a string convention, and most omissions **fail silently** rather than erroring. Work the list; don't trust "it renders".

**A new leaf page inside an existing hub:**

1. `hubs/<hub>/urls.py` — the path, with `name=` matching the module key (`core.models.Module.key` matches a Django URL name by convention, and `portal.views._leaf` relies on it).
2. `hubs/<hub>/views.py` — the view.
3. `hubs/<hub>/views.py` — an entry in that hub's `<HUB>_MENU`, which drives the sidebar.
4. The template, under `hubs/<hub>/templates/hubs/<hub>/`.
5. `core/management/commands/seed_modules.py` — a `Module` row, then rerun the command. **Omitting this doesn't hide the page — it defaults to visible**, so an unreleased page ships ungated.
6. `portal/views.py` — the hub's card `items` tuple on MAT Home. Nothing fails if you forget; the tile is simply absent from Home while the page works everywhere else.

Plus a new icon under `templates/icons/` if it needs one.

**A new hub** additionally needs: the app itself (`apps.py` carrying `VERSION`, see [ADR 0011](docs/adr/0011-per-app-version-on-appconfig.md)); `INSTALLED_APPS`; a mount in `mysite/urls.py`; `HUB_NAV_ITEMS` and a section card in `portal/views.py`, plus its menu added to the tuple `_LEAF_BY_MODULE_KEY` is built from; all three prefix maps in `portal/context_processors.py` (app label, display name, icon — note the ordering pitfall documented there); a `Module` row for the hub itself as the leaves' parent; and its own `hubs/<name>/CLAUDE.md`.

That this list is long is a known problem, tracked with a proposed fix in [#191](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/191) — derive what's derivable rather than restating it. Until that lands, the restatements are real and all of them are load-bearing.

## View pattern

- School scoping (the sidebar switcher's `all`/`primary`/`secondary`/`School.id` key) goes through `core.school_scope.SchoolScope` — `scope.narrow(qs, via=..., mat_wide=...)`, plus `selects_every_school` and `is_aggregate`, which look like the same question and are not. The four-branch cascade used to be written out five times across two apps. `core.identity`'s `staff_queryset_for_school_key`/`student_queryset_for_school_key`/`is_aggregate_school_key` still exist and are still the names to call; they are thin wrappers now.
- `hubs.inclusion` and `core` are the exception to plain hardcoded views: they have real Django models and applied migrations (`core.models.Staff`/`Student`/`School`, `hubs.inclusion.models` — Referral, Action, PanelReferral, etc.). Other hubs reference `core.models.Staff`/`Student` where they need real data (e.g. directory, dashboards) rather than duplicating hardcoded people. `Staff`/`Student` each have a nullable `school` FK to `core.models.School`; `portal.views.build_school_nav()` reads `School` rows (merged with hardcoded "All Schools"/"All Primary"/"All Secondary" aggregate entries) to drive the sidebar school-switcher instead of a hardcoded list.
- Standard context per page: `local_menu` (list of `{name, url, icon}` for the hub's sidebar) and `hub_title`.
- Templates: page extends `templates/layout.html`, includes `templates/hubs/_hub_sidebar.html` (driven by `local_menu`/`hub_title`) inside `{% block hub_sidebar %}`.
- Icons are shared SVG templates under `templates/icons/`.

## Other notes

- `requirements.txt` and `.env.example` exist; there is no pyproject.toml. settings.py still has a hardcoded dev SECRET_KEY fallback. `README.md` exists but is a one-line stub.
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
  - `seed_student_history` (in `core/management/commands/`) — must run after `seed_dummy_data`/`seed_schools`. Seeds `AttendanceDay`/`BehaviourIncident`/`Exclusion`/`PositiveBehaviourIncident` rows (see `core/CONTEXT.md` and [ADR 0007](docs/adr/0007-student-history-tables-not-summary-fields.md)) — the real per-record history behind `core.student_history`'s derived percentage/summary/count helpers, replacing the old `Student.attendance_pct`/`behaviour_summary`/`exclusions_count` scalar fields.
  - `seed_safeguarding_notes` (in `core/management/commands/`) — must run after `seed_dummy_data`. Seeds one active `core.models.SafeguardingNote` per every 4th `Student`, authored by a seeded `is_dsl` `Staff` — the student-scoped, panel-decoupled note model that replaced `hubs.inclusion.panel.SafeguardingBriefing` (see #77-#81).

### Sidebar "current user" identity

- No login system exists. Every hub's sidebar (`templates/hubs/_hub_sidebar.html`) shows a "current user" dropdown (avatar + name + job title), backed by a `current_staff_id` cookie (see `CURRENT_STAFF_COOKIE` in `core/identity.py`) and mirrored to `localStorage`. Switching identity reloads the page.
- `core.identity.current_staff(request)` / `default_staff()` fall back to **Benjamin Suri** when no cookie is set — he's the default test identity for the whole app. `portal.context_processors.current_identity` surfaces this to every template (`current_staff`, `current_staff_id`, `current_staff_list`).
- If a hub page throws `OperationalError: no such table: ...`, it means migrations haven't been run locally yet — run `migrate` (and reseed if the table is one of the demo-data ones above).
- New models/migrations: if you add fields/models to `core` or `hubs.inclusion`, run `manage.py makemigrations` and commit the generated migration file(s) — migrations are tracked in git even though the database itself isn't.

### Per-app VERSION auto-bump

Each app's `VERSION` (ADR 0011) patch-bumps automatically on any commit touching that app's own files (`hubs/<name>/**`, `core/**`), via a `.githooks/pre-commit` hook (`scripts/bump_versions.py`) — see #149/#150 for the full decision trail. **Not enabled by default per clone** — run once after cloning:
```
git config core.hooksPath .githooks
```
Editing an app's `VERSION` line by hand in the same commit (e.g. a deliberate minor/major bump, see `/suggest-version-bump`) skips the auto-bump for that app so it doesn't get clobbered. A handful of portal-wide files (`static/css/layout/layout.css`, `static/css/style.css`, `static/js/main.js`, `templates/layout.html`, `templates/hubs/_hub_sidebar.html`, `templates/icons/**`, `mysite/**`, `portal/**`) are nobody's own and never trigger a bump — see `scripts/bump_versions.py` for the exact ownership rules.

### Module rollout status, Portal Admin hub, tiered portal settings

Domain vocabulary and mechanism for `Module` (rollout/visibility cascade), the developer-only Portal Admin hub, and tiered `School`/`CategorySettings`/`MatSettings` resolution now live in [core/CONTEXT.md](core/CONTEXT.md) — see the Language section there. ADRs [0002](docs/adr/0002-module-visibility-cascade-rules.md) and [0003](docs/adr/0003-tiered-portal-settings-resolution.md) hold the why.

## Running the server / known gotchas

- `.venv` ships with only `pip` preinstalled — run `.venv\Scripts\python.exe -m pip install django` before first `runserver`.
- `posts` was removed from `INSTALLED_APPS` (mysite/settings.py): it had no app on disk and crashed `manage.py runserver` outright. If reintroducing it, create the app first.
- Root URL `/` is wired directly to `portal.views.mat_home` in `mysite/urls.py` (not via `mysite/views.py`, which is otherwise unused).
- **Django's `{# ... #}` comment tag is single-line only** — if the comment text wraps onto a second line, Django doesn't parse it as a comment at all and renders it as literal visible text on the page instead (this has actually happened and shipped, e.g. `hubs/inclusion/panel/templates/hubs/inclusion/panel/_referral_form_fields.html`). Any comment explaining more than one line's worth of "why" — which most of this codebase's comments do — must use the block form instead: `{% comment %}...{% endcomment %}`. Reach for `{# ... #}` only for a genuinely single-line, single-sentence note.
- **There are no `?v=N` cache-bust markers any more, and none should be added back.** `static/css/style.css` is still an `@import` chain, but the markers it used to carry (plus the ones on `panel.css`/`panel.js`/`main.js` in the templates) were a workaround for the dev server serving static with `Last-Modified` and no `Cache-Control`, which lets a browser apply a heuristic freshness window and serve a file with no request at all. `core/management/commands/runserver.py` now sends `Cache-Control: no-cache, must-revalidate` for static under DEBUG, which fixes the actual cause — see that file for the measurements. If a stale asset ever reappears, check that header is present before reaching for a version marker.

## Responsive breakpoints

The canonical tier list (phone/stacked/narrow/tablet/touch/rail, what each owns, and which JS media queries mirror it) is a **breakpoint registry comment at the top of [static/css/layout/responsive.css](static/css/layout/responsive.css)** — add a tier there before using a new number anywhere. Boundary rule: a tier's max is `N`, its matching min is `N+1`; never pair `max-width: N` with `min-width: N`, and never write a floor as `max-width: N-1`. Both mistakes had shipped (an end-of-list stripe that vanished at exactly 480px; a mobile tab bar that didn't render at exactly 480px) — the registry records them so they aren't reintroduced.

## Static assets: where a file goes, how it loads

Why in ADRs [0020](docs/adr/0020-static-assets-shared-by-nature-not-usage.md) (nature-not-usage, tiers, split axis, size trigger), [0021](docs/adr/0021-native-es-modules-one-entry-per-page.md) (ES modules, entry points, context-as-data), [0022](docs/adr/0022-hub-static-is-app-namespaced.md) (app-namespacing). The operational rules:

- **Portal-wide** is `static/css/{tokens,theme,layout,components,list-page,pages}/` and `static/js/{components,list-page,pages}/` — folders appear when the migration first puts something in them, so trust `ls` over this list. **Hub-owned** is `hubs/<hub>/static/<hub>/{css,js}/{components,pages}/` — the repeated app name is load-bearing (0022: without it a hub file sharing a portal file's name is silently shadowed), and a hub never defines a token or a theme.
- **Nature, not usage.** No domain vocabulary under `static/` — a carousel wired to referrals is still a carousel. Nothing under `hubs/*/static/` that another hub could want. Where a portal component composes with a domain one (`.ui-select-trigger.status-pill`), both ingredients promote and the composition stays hub-owned. A `panel-` prefix under `static/` means a move was left unfinished.
- A component's media queries live in the component's own file; `layout/responsive.css` keeps the breakpoint registry (above) and layout-tier rules.
- **JS is ES modules**, one entry module per page template, imported rather than installed on `window`. Shared page wiring becomes a module (`initListPage(root, options)`), never a fatter entry.
- **Template context reaches JS as data, never as code**: `json_script` for structured data, a `data-` attribute on the wired element for scalars, `{% url %}`, and anything a module should branch on. No inline script containing code — `<script type="application/json">` is data and is fine. One exception: `layout.html`'s pre-paint theme block, which must stay inline and blocking and must carry no template context.
- Three advisory checkers, none of them commit hooks — `check_file_size.py` (code lines vs the ~600 trigger), `check_inline_js.py`, `check_stale_comments.py`. Crossing the size trigger is a question ("one module or two?"), and a legitimate "one" is answered in the file's header comment.

**Migration is in progress and page-by-page, not big-bang.** `panel.css`, `panel.js` and `main.js` are the three big files and none is split yet, so generic code still lives in hub files and both shapes coexist. Run `check_file_size.py` for their current sizes rather than trusting a number quoted in prose. The plan is [docs/wayfinder/portal-static-assets/](docs/wayfinder/portal-static-assets/) — read `taxonomy.md` for the target file list before adding a static file, and the per-file inventories (`inventory.md` for the panel pair, `main-js-inventory.md`) for what is actually in them.

## Design Language

Portal-wide visual/interaction rules live as principles in [PRINCIPLES-DESIGN.md](PRINCIPLES-DESIGN.md) (colour, layout, typography, controls, hierarchy, ...) and [PRINCIPLES-INTERACTION.md](PRINCIPLES-INTERACTION.md) (hover/focus/motion/behaviour). Cite an entry from outside its own file with a domain prefix — `DES-F1`, `INT-U2`. Concrete implementation detail (token values, component recipes, hub-specific class names) lives as comments colocated directly in the CSS/template/JS file it describes, not in a separate design doc — see e.g. `static/css/theme/light.css` for `DES-F1`'s implementation. A cross-cutting index that doesn't reduce to one code location (which helper function to reach for) lives in the owning hub's own `CLAUDE.md` — see `hubs/inclusion/panel/CLAUDE.md`'s "Key helpers". See [docs/agents/doc-conventions.md](docs/agents/doc-conventions.md) for the full rules on what becomes a principle vs. a colocated comment.

## Agent skills

### Issue tracker

GitHub Issues (plus per-App Projects/roadmap boards) on `bendanielsuri-hue/LWLAT-Portal`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix), unchanged. See `docs/agents/triage-labels.md`.

### Grilling sessions

When asking a multiple-choice question during a grilling/interview flow, put **each option on its own line**, not run together inside a prose paragraph. Options are scanned and compared against each other, which a wall of prose makes needlessly hard.

### Domain docs

Read order and glossary-usage rules for agents (which `CONTEXT.md`/ADRs to consult before exploring, how to flag an ADR conflict) — see `docs/agents/domain.md`. What these docs are and when they get created is covered under "Architecture decisions" and "Domain glossary" below.

## Architecture decisions

Hard-to-reverse design decisions with non-obvious rationale are recorded in `docs/adr/` as they come up — see the existing ADRs there for the format. Not every decision needs one; see `docs/adr/` only when a future reader would plausibly ask "why did we do it this way?"

## Domain glossary

Apps with real, non-obvious domain vocabulary get a `CONTEXT.md` glossary alongside their `CLAUDE.md` — see `hubs/inclusion/panel/CONTEXT.md` for Inclusion Panel's terms (Referral vs PanelReferral, Panel vs PanelGroup, discussion stages, etc.). Created lazily — only once an app has real terms worth pinning down.

## Verifying UI changes

Don't use the Playwright MCP browser tools — the user checks UI/layout changes themselves against the running dev server. Reason from the CSS/box model and report the change made; don't drive a browser to self-verify.

## Diagnosing perf issues

Before blaming a resize/animation stutter on JS or animation cost, reproduce it with JS disabled — if it's still slow, the cost is DOM size/render, not the script (see `hubs/inclusion/panel/views.py`'s Students pagination for a case where this ruled out the actual culprit).

## Design mockups

When building an HTML mockup/artifact to compare UI design alternatives, style it in the app's **Soft** theme (`data-theme="pastel"`), light mode — not the cool blue-grey default. Pull the actual token values from `static/css/theme/light.css` + the `[data-theme="pastel"]` block in `static/css/theme/themes.css` rather than approximating — including the `(DES-F1)` comment there on which fill goes on actionable vs. read-only chrome.