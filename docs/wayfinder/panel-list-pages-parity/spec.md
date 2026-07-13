---
status: ready-for-agent
tracker: none-configured (run /setup-matt-pocock-skills to wire a real tracker; filed as a repo markdown doc in the meantime)
map: map.md
---

# Spec: Panel List Pages Parity (Students / Referrals / Actions → Panel Meetings pattern)

## Problem Statement

Students, Referrals, and Actions — three of the Inclusion Panel's core list pages — render every row up front and filter entirely client-side (JS toggles `display:none` on rows already in the DOM). This doesn't scale as the number of students/referrals/actions grows, unlike the Panel Meetings page, which fetches only the filtered set from the server. The three pages also don't share Panel Meetings' filter-bar conventions (server-computed active-filter count, AJAX partial swap, status tab-row), so they feel like an older, inconsistent generation of the same UI pattern. Separately, the Actions page filters "Assigned to Me" against a page-local "who am I" picker (backed by its own localStorage key) instead of the portal-wide current-identity cookie every other hub page already uses, so a user's "me" can silently disagree between pages.

## Solution

Bring Students, Referrals, and Actions up to the Panel Meetings page's pattern: server-side filtering with an AJAX partial swap (GET request + `data-ajax-target`, reusing the generic filter-bar JS already in `main.js`), with `active_filter_count` computed server-side on first render. Actions' "Assigned to Me" filter is repointed at `core.identity.current_staff` and its page-local picker/localStorage key is removed. Before the three pages copy the pattern, Panel Meetings itself gets a review/polish pass, since every other ticket in this effort is copying it — that review (resolved) also settled that status filtering is filter-bar-dropdown only, no tab-row, so Referrals/Actions (which already have a Status dropdown) need no new status UI at all.

## User Stories

1. As a panel staff member browsing Students, I want the list to filter without a full page reload, so that changing a filter feels instant and my scroll position isn't lost.
2. As a panel staff member browsing Students, I want the filter count badge to reflect active filters immediately on page load (not just after JS runs), so that arriving via a pre-filled link (e.g. from a staff member's search result) shows the correct count right away.
3. As a panel staff member, I want status to be filterable in exactly one place per page (the filter-bar's Status dropdown), so that I'm not choosing between two different controls that do the same thing.
4. As a panel staff member, I want "Assigned to Me" on the Actions page to use the same identity as the sidebar's current-user switcher, so that switching identity in the sidebar also changes what "my actions" means, without a separate picker to keep in sync.
5. As a developer maintaining these pages, I want each page's filtering logic to live server-side in its view function, so that filter behaviour doesn't fork between "what the page shows on load" and "what the JS re-derives after a change."
6. As a developer maintaining these pages, I want the AJAX partial-swap wiring to be the same generic mechanism already used by Panel Meetings and the SEND & Provision dashboard, so there's one convention to learn, not a new one per page.
7. As a panel staff member, I want all existing filters on each page preserved exactly (Students: Name Search, Year, Reg, Has Referrals, Overdue Actions; Referrals: Name Search, Section, Status, Raised By; Actions: Name Search, Category, Assigned To, Status, Overdue Only, Due This Week, Assigned to Me), so that migrating the underlying mechanism doesn't remove functionality I rely on.
8. As a panel staff member, I want existing query-param prefills (arriving from a student's "Referrals"/"Actions" button, or a staff member's "Referrals Raised"/"Actions Assigned" search result) to keep working after the migration, so that cross-page navigation isn't broken by the rework.
9. As a panel staff member, I want "Clear Filters" on each page to behave like it does on Panel Meetings (a real link back to the unfiltered URL, AJAX-swapped), so the three pages feel identical to use.
10. As a developer, I want Panel Meetings reviewed for rough edges before Students/Referrals/Actions copy its pattern, so that known issues aren't propagated into three more pages.
11. As a panel staff member on a school-scoped view, I want Students/Referrals/Actions' server-side filtering to continue respecting the current school-switcher scope (`current_school_key`), exactly as it does today, so switching schools still narrows these lists correctly.

## Implementation Decisions

- **Seam**: extend the three existing view functions (`inclusion_panel_students`, `inclusion_panel_referrals`, `inclusion_panel_actions` in `hubs/inclusion/panel/views.py`) in place, branching on `request.headers.get('X-Requested-With') == 'XMLHttpRequest'` to return a new partial template instead of the full page — the exact pattern already used by `inclusion_panel_meetings` and `inclusion_hub`. No new URLs, no new JS: the generic `data-ajax-target` filter-bar wiring in `static/js/main.js` (`setupAjaxFilterBars`) already handles the fetch/swap/history-replace for any `<form class="filter-bar" data-ajax-target="...">`.
- **New partial templates**: one per page, following `_meetings_filtered_content.html`'s shape — `_students_filtered_content.html`, `_referrals_filtered_content.html`, `_actions_filtered_content.html`, each containing the `entity-list` + `stats-strip` currently inline in the full-page templates.
- **Filter-bar markup change**: each page's `<div class="filter-bar">` becomes `<form method="get" class="filter-bar" data-ajax-target="#<page>-filtered-content">`, matching Meetings' `<form method="get" class="filter-bar" data-ajax-target="#meetings-filtered-content">`.
- **`active_filter_count`**: computed server-side in each view (count of non-empty filter GET params), same convention as `inclusion_panel_meetings`, replacing the current static `filter-bar-count--empty">0` markup that only becomes accurate after client JS runs.
- **Filtering logic moves server-side**: all current client-side predicate logic in each page's `<script>` block (name/year/reg/toggle matching for Students; name/section/status/raised-by for Referrals; name/category/assigned/status/overdue/due-this-week/assigned-to-me for Actions) is reimplemented as Django ORM filtering in the corresponding view, reading the same GET param names the pages already use for query-string prefill (`name`, `raised_by`, `assigned`, `status`, `overdue`, `due_this_week`, `section`).
- **No tab-row anywhere** (revised during the Panel Meetings review, see [ticket 001](tickets/001-review-panel-meetings.md)): Meetings' own tab-row was removed and replaced with a Status filter-bar dropdown, one place to filter by status instead of two competing UIs for the same field. Referrals and Actions already have a Status dropdown, so this migration adds no new status UI to either. Students has no status field regardless.
- **Actions identity unification**: the `me-select` control and its `inclusion-current-staff-id` localStorage key are removed from `actions.html`. "Assigned to Me" instead resolves against `core.identity.current_staff(request)` server-side, consistent with how every other hub page already determines "who am I."
- **School scoping unchanged**: each view continues to scope its base queryset via `current_school_key(request)` / `student_queryset_for_school_key` / `staff_queryset_for_school_key`, exactly as today — this migration only changes *how* filters are applied and rendered, not the school-scoping behaviour.
- **Panel Meetings review**: a separate, prior ticket (see [map](map.md), [ticket 001](tickets/001-review-panel-meetings.md)) covered reviewing/improving Panel Meetings itself before the above was built, since changes there change what these three tickets copy. Resolved — its outcome is already folded into this spec (no tab-row, status filter added to Meetings' filter-bar, button-row hierarchy, thicker filter-bar border, no-referrals empty state, delete-meeting button).
- **Out of this migration's scope, decided during charting**: no change to Panel Meetings' own behaviour beyond whatever ticket 001 turns up; no new filters beyond what each page already has; no change to the underlying `Referral`/`Action`/`Student` models or schema.

## Testing Decisions

- No test suite currently exists anywhere in this repo (no `test*.py` files at all) — there is no prior art for automated tests here yet. The project's stated verification practice (root `CLAUDE.md`, "Verifying UI changes") is manual: run the dev server and exercise the page, optionally with Playwright, asking before driving a browser automatically.
- Good tests here, if added, should assert on *response content given GET params* (external behaviour of the view: which rows appear in the rendered partial for a given filter combination, and that `active_filter_count` matches) rather than on internal query construction — the same black-box angle a Django `Client.get()` test naturally takes.
- If this is the codebase's first test, prefer starting it as a plain Django `TestCase` per view (`hubs/inclusion/panel/tests.py` or `tests/test_views.py`), asserting against `response.context` and rendered HTML for a couple of representative filter combinations per page, rather than introducing a new testing framework.
- Manual verification for this spec: run each page in the dev server, apply each filter (including combinations), confirm the swap happens without a full navigation (URL updates via `history.replaceState`, no page flash), confirm `active_filter_count` is correct on first load via a prefilled query string, and confirm Clear Filters returns to the unfiltered view via the same AJAX path.

## Out of Scope

- Any change to Panel Meetings' own filters/behaviour beyond what ticket 001 (its review) turns up.
- New filters not already present on Students/Referrals/Actions today.
- Schema/model changes to `Student`, `Referral`, `Action`, or related models.
- Introducing a shared generic list-filtering helper/base view across all four pages — each view stays its own function, matching the existing one-view-per-page convention (see `hubs/CLAUDE.md`, "View pattern").
- Auth/permissions enforcement — none exists in this codebase yet and this migration doesn't add any.

## Further Notes

- This spec covers GitHub issues [#1](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/1) (Students), [#3](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/3) (Referrals), [#4](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/4) (Actions), plus [#2](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/2) (Actions identity unification, closed); ticket 001 (Review Panel Meetings, resolved) was a separate, blocking, HITL grilling ticket kept as local markdown since it predates the tracker being configured.
- Issue tracker is now configured (`gh`, GitHub Issues on `bendanielsuri-hue/LWLAT-Portal`) — see `docs/agents/issue-tracker.md`. This spec and the map/ticket 001 remain local markdown since they were written before that; new work from here on should go straight to GitHub Issues.
- Relevant docs: [hubs/inclusion/panel/CLAUDE.md](../../../hubs/inclusion/panel/CLAUDE.md), [hubs/inclusion/panel/DesignLanguage.md](../../../hubs/inclusion/panel/DesignLanguage.md), [DesignLanguage.md](../../../DesignLanguage.md), [InteractionLanguage.md](../../../InteractionLanguage.md).
