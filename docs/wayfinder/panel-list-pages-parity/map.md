---
label: wayfinder:map
status: closed
---

# Map: Panel List Pages Parity

## Destination

Students, Referrals, and Actions (Inclusion Panel) converted to match the Panel Meetings page's pattern: server-side AJAX-filtered content (GET request swaps a partial via `data-ajax-target`, `active_filter_count` computed server-side) instead of today's render-everything + client-side `display:none` filtering. Status filtering lives only in the filter-bar dropdown, no tab-row anywhere (Meetings' own tab-row was removed during its review — see Decisions below). Actions' page-local "who am I" picker (localStorage `inclusion-current-staff-id`) is dropped in favour of `core.identity.current_staff` — the same identity cookie the sidebar switcher already sets everywhere else.

Reached when all three pages match this pattern. Starts with a review/polish pass on Panel Meetings itself, since it's the reference every other ticket copies.

**Reached.** All four tickets closed — [#1](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/1) Students, [#2](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/2) Actions identity unification, [#3](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/3) Referrals, [#4](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/4) Actions — plus [ticket 001](tickets/001-review-panel-meetings.md) (Panel Meetings review). Students, Referrals, and Actions now match Panel Meetings' server-side AJAX-filtering pattern exactly.

## Notes

- Domain: `hubs/inclusion/panel/` — see [hubs/inclusion/panel/CLAUDE.md](../../../hubs/inclusion/panel/CLAUDE.md), [CONTEXT.md](../../../hubs/inclusion/panel/CONTEXT.md), [DesignLanguage.md](../../../hubs/inclusion/panel/DesignLanguage.md).
- Portal-wide: [DesignLanguage.md](../../../DesignLanguage.md), [InteractionLanguage.md](../../../InteractionLanguage.md).
- Reference implementation: `hubs/inclusion/panel/templates/hubs/inclusion/panel/meetings.html` + `_meetings_filtered_content.html` + the `inclusion_panel_meetings` view.
- Identity: `core/identity.py` (`current_staff`, `CURRENT_STAFF_COOKIE`) — Actions' "Assigned to Me" should resolve against this, not its own localStorage key.
- Scalability is a stated project priority (root CLAUDE.md) — server-side filtering was chosen over client-side for this reason, not just visual parity.
- No tracker was configured when this map was charted, so it (and ticket 001) stayed local markdown (this file + sibling `tickets/*.md`, blocking recorded as a body line since markdown has no native dependency graph). A tracker (GitHub Issues) was configured partway through — tickets 002–004 were published there instead as GitHub issues #1/#3/#4 (see `docs/agents/issue-tracker.md`); this map/ticket 001 weren't migrated retroactively.

## Decisions so far

- [Review & improve Panel Meetings before it's the template](tickets/001-review-panel-meetings.md) — disabled Summary button switched from `<a href="#">` to `<span>`; page-header actions split into two stacked rows (app-wide vs page-specific) and documented in DesignLanguage.md; filter-bar border widened to 2px; empty referral/priority breakdown replaced with a "No Referrals" pill; delete-meeting button wired onto not-yet-started cards; **tab-row removed entirely, status filtering folded into the filter-bar as a plain dropdown** — this last one reverses the original destination statement above (tab-row was previously planned for Referrals/Actions too) and is now the pattern all three migration tickets follow instead.
- [Migrate Students to server-side AJAX filtering (#1)](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/1) — own bespoke view (no shared filtering helper across pages, per the spec's Out of Scope); fixed an N+1 query pattern along the way via `Count(..., distinct=True)` annotations. "Has Referrals"/"Overdue Actions" toggles became `.filter(referrals_count__gt=0)`/`.filter(overdue_actions_count__gt=0)` on the annotated queryset.
- [Unify Actions' "Assigned to Me" onto core.identity (#2)](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/2) — dropped the page-local localStorage picker; resolves against the sidebar's identity cookie everywhere.
- [Migrate Referrals to server-side AJAX filtering (#3)](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/3) — Name/Status/Raised-By filter via the ORM; Section (unassigned/due-follow-up) stays a Python-level filter over the already-prefetched `panel_referrals`, since "unassigned" needs an `exclude()` across a multi-valued relation that's easy to get subtly wrong.
- [Migrate Actions to server-side AJAX filtering (#4)](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/4) — all 7 filters (Name, Category, Assigned To, Status, Overdue, Due This Week, Assigned to Me) as plain ORM `.filter()` calls.
- **Clear Filters**: every page uses a real `<a href="{% url ... %}">` link (matching Meetings), not a JS-only reset.

## Not yet specified

(none — destination reached, nothing left to specify)

## Out of scope

(none)
