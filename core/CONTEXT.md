# Core

Shared domain models used across every hub — Staff, Student, School, and the cross-cutting data that describes a student's pastoral/academic record independent of any one hub's own workflow.

## Language

**Attendance Day**:
One student's attendance record for a single school day — an AM and a PM session mark (present / absent unauthorised / absent authorised / late), matching how UK schools actually take a register twice daily. The stored source of truth; a week's or term's attendance percentage is always a derived rollup computed from these, never stored separately, so it can't drift out of sync.
_Avoid_: Attendance week/record (this project's grain is per-day, not per-week — a "week" is a query over Attendance Days, not its own table), attendance percentage (a derived value, not a stored fact)

**Behaviour Incident**:
A single logged behaviour event for a student — date, description, category (a fixed preset set, e.g. Disruption/Aggression/Defiance/Other, mirroring `ActionCategory`'s pattern), a separate severity, and who logged it. The behaviour picture shown anywhere in the app (a summary, a trend) is always derived from the incident log, never a standalone freeform summary field.
_Avoid_: Behaviour summary/note (a derived rollup of incidents, not a thing stored on its own)

**Exclusion**:
A single logged exclusion for a student — start date, end date (blank for permanent), type (fixed-term / permanent / internal), reason. `exclusions_count` shown anywhere in the app is always a derived count of these records, never its own stored counter.
_Avoid_: Exclusion count (a derived value, not a stored fact)

**Positive Behaviour Incident**:
A single logged positive-recognition event for a student — date, category (a fixed preset set: Merit/Effort/Achievement/Kindness/Other), a numeric `points` value, and who logged it. Deliberately a separate model from `Behaviour Incident`, not a positive severity option on it — the two log opposite signals and are displayed as independent Student Details cards (#95). Unlike `Behaviour Incident`'s severity (a per-event tier), `points` is summable: a student's points total is a derived sum across their log, same "never a stored summary field" rule as Attendance/Behaviour/Exclusions.
_Avoid_: Merit count/points total (a derived value, not a stored fact); positive severity (this model has no severity-style tier, only points)

**Safeguarding Note**:
A Designated Safeguarding Lead's atomic, one-line safeguarding statement about a student — no link to any hub-specific model, so any hub can read a student's safeguarding context, not just Inclusion Panel (the only current consumer; see [ADR 0001](../docs/adr/0001-shared-referral-base-table.md) for the sibling reasoning behind relocating a hub-born model to `core`). "Editing" never mutates a note in place — it creates a new active row with `supersedes` pointing at the note it replaces, auto-retiring the predecessor (`retired_at`/`retired_by`/`retirement_reason='superseded'`). The one in-place mutation is manual retirement (no successor). No hard delete, ever — see `hubs/inclusion/panel/CONTEXT.md` for the fuller history (#52, #77-#81) and gating rules (`Staff.is_dsl`).
_Avoid_: Safeguarding Briefing (the pre-decoupling model/screen name, still used for the Inclusion Panel screen itself, not the record)

**Module**:
Row in `core.models.Module` (`key`, `name`, `parent` self-FK, `status` hidden/pilot/live, `pilot_schools` M2M to `School`, `order`) gating whether a hub/page shows in the nav rail, home page cards, site search, or a hub's own sidebar menu — anywhere an entry is tagged with a `module_key` matching a Django URL name. `core.modules.filter_by_module`/`is_module_visible` do the filtering; `module_map()` loads the whole table once per request. `hidden` cascades to all children regardless of their own status; `live` is always visible; `pilot` is visible only when the sidebar's selected school (`core.identity.current_school_key`) is one of `pilot_schools` specifically, never for the `'all'`/`'primary'`/`'secondary'` aggregate views. The "Show all modules" Settings toggle (`core.modules.view_full_system`) bypasses all of this. No URL-level enforcement — a hidden/pilot-elsewhere page stays directly reachable by URL, a discoverability filter only. `seed_modules` creates all rows hidden by default except `inclusion_hub`/`inclusion_panel` (seeded live). `Module.name` can also override the hardcoded Python label for its entry (`core.modules.module_label`). See [ADR 0002](../docs/adr/0002-module-visibility-cascade-rules.md).
_Avoid_: "feature flag" (this is a DB-backed rollout row with cascade/pilot semantics, not a simple boolean)

**Page View**:
A logged record of one staff member's GET request that resolved to a real page — `staff`, `url_name` (matched against `Module.key` by the same convention `Module` gating already uses), and a timestamp. Written by middleware for every top-level page load, regardless of whether a `Module` row exists for that `url_name` — it's a raw activity record, not itself a visibility/permissions mechanism. AJAX, POST, static, and `/admin/`/`/portal-admin/` requests are never logged.
_Avoid_: Analytics event, activity log entry (both imply broader instrumentation than this narrow GET-page-load-only record)

**Most Used Apps** (home page tray):
The home-page shortcut tray, ranking one staff member's own `Page View`s (joined against `Module`) for the current `AcademicYear`. Leaf-level `Module`s (e.g. Referrals) always outrank hub landing pages (e.g. SEND & Provision) — a hub is already one click away in the global nav rail on every page, so it only fills a tray slot once leaf-level apps run out, never competing in the same ranked pool. Within each tier, when personal history has fewer than 10 entries, it tops up — in this order — with the current year's trust-wide popular apps, then all-time personal history, then all-time trust-wide popular, stopping once 10 slots are filled. Purely computed from `Page View`; no manual pin/unpin exists.
_Avoid_: Favourites (implies user-curated pinning, which this doesn't have); Most Used (drop "Apps" and it reads as ambiguous — most used *what*)

**Tiered Portal Settings**:
`School`, `core.models.CategorySettings` (one row per `School.CATEGORY_CHOICES`), and the singleton `core.models.MatSettings` (forced `pk=1`) all share the same seven optional fields: `student_term`, `staff_term`, `portal_title`, `accent_colour`, `logo_url`, `support_email`, `support_phone`. Blank means "inherit from the next tier down." `core.portal_settings.resolve_portal_settings(request)` resolves each field independently: School → Category → MAT → hardcoded Python constant, keyed entirely off the currently-selected school (`core.identity.current_school_key`) — deliberately not off the viewer's own identity/home school. `mat.views.build_sections`/`build_hub_nav` additionally use `student_term`/`staff_term` to override the `Student`/`Staff` hub labels, taking priority over `Module.name` for those two entries. See [ADR 0003](../docs/adr/0003-tiered-portal-settings-resolution.md).

**Developer flag** (`Staff.is_developer`):
The only "developer" flag in the app; boolean, mirrors `is_mat_staff`, seeded `True` for Benjamin Suri only (by `seed_benjamin_admin`). Gates visibility of `hubs.portaladmin` (`/portal-admin/`) — the one hub NOT gated by the `Module` system at all, full-system toggle or not. `portaladmin_home` redirects non-developers to `/` (same lightweight non-secure pattern as `hubs.inclusion.views._is_panel_staff`). The page is a plain-HTML form-per-row console over every `Module` row, the `MatSettings` singleton, both `CategorySettings` rows, and per-`School` overrides; Django admin (`/admin/`) has all of these registered as a fallback.
