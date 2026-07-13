---
label: wayfinder:map
status: open
---

# Map: Panel List Pages Parity

## Destination

Students, Referrals, and Actions (Inclusion Panel) converted to match the Panel Meetings page's pattern: server-side AJAX-filtered content (GET request swaps a partial via `data-ajax-target`, `active_filter_count` computed server-side) instead of today's render-everything + client-side `display:none` filtering. Status filtering lives only in the filter-bar dropdown, no tab-row anywhere (Meetings' own tab-row was removed during its review — see Decisions below). Actions' page-local "who am I" picker (localStorage `inclusion-current-staff-id`) is dropped in favour of `core.identity.current_staff` — the same identity cookie the sidebar switcher already sets everywhere else.

Reached when all three pages match this pattern. Starts with a review/polish pass on Panel Meetings itself, since it's the reference every other ticket copies.

## Notes

- Domain: `hubs/inclusion/panel/` — see [hubs/inclusion/panel/CLAUDE.md](../../../hubs/inclusion/panel/CLAUDE.md), [CONTEXT.md](../../../hubs/inclusion/panel/CONTEXT.md), [DesignLanguage.md](../../../hubs/inclusion/panel/DesignLanguage.md).
- Portal-wide: [DesignLanguage.md](../../../DesignLanguage.md), [InteractionLanguage.md](../../../InteractionLanguage.md).
- Reference implementation: `hubs/inclusion/panel/templates/hubs/inclusion/panel/meetings.html` + `_meetings_filtered_content.html` + the `inclusion_panel_meetings` view.
- Identity: `core/identity.py` (`current_staff`, `CURRENT_STAFF_COOKIE`) — Actions' "Assigned to Me" should resolve against this, not its own localStorage key.
- Scalability is a stated project priority (root CLAUDE.md) — server-side filtering was chosen over client-side for this reason, not just visual parity.
- No tracker was configured when this map was charted, so it (and ticket 001) stayed local markdown (this file + sibling `tickets/*.md`, blocking recorded as a body line since markdown has no native dependency graph). A tracker (GitHub Issues) was configured partway through — tickets 002–004 were published there instead as GitHub issues #1/#3/#4 (see `docs/agents/issue-tracker.md`); this map/ticket 001 weren't migrated retroactively.

## Decisions so far

- [Review & improve Panel Meetings before it's the template](tickets/001-review-panel-meetings.md) — disabled Summary button switched from `<a href="#">` to `<span>`; page-header actions split into two stacked rows (app-wide vs page-specific) and documented in DesignLanguage.md; filter-bar border widened to 2px; empty referral/priority breakdown replaced with a "No Referrals" pill; delete-meeting button wired onto not-yet-started cards; **tab-row removed entirely, status filtering folded into the filter-bar as a plain dropdown** — this last one reverses the original destination statement above (tab-row was previously planned for Referrals/Actions too) and is now the pattern all three migration tickets follow instead.

## Not yet specified

- Whether the three pages share a backend filtering helper/partial-rendering convention, or each gets its own bespoke view (mirrors how much `_meetings_filtered_content.html`'s approach generalises once we're actually building it).
- Whether "Clear Filters" becomes a real URL link per page (like Meetings' `<a href="{% url ... %}">`) and how existing query-param prefills (`?name=`, `?raised_by=`, `?assigned=`, `?status=`, `?overdue=1`, `?due_this_week=1`) survive the move to server-rendered partials.
- Implementation shape of entity-specific filters once server-side: Students' "Has Referrals" / "Overdue Actions" toggles; Actions' Category / Overdue / Due This Week toggles.

## Out of scope

(none yet)
