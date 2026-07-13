---
label: wayfinder:grilling
status: closed
assignee: claude
map: ../map.md
---

# Review & improve Panel Meetings before it's the template

## Question

Students, Referrals, and Actions are about to be migrated to match Panel Meetings' AJAX-filtering pattern (see [map](../map.md)). Before that copying starts: what improvements, if any, does the Panel Meetings page itself need? Anything fixed here changes what the other three copy, so it goes first.

## Resolution

Six changes, all made directly to `meetings.html` / `_meetings_filtered_content.html` / `inclusion_panel_meetings` / shared CSS:

1. **Disabled Summary button**: was `<a href="#" class="btn-disabled">` (a real a11y/UX anti-pattern — focusable, clickable despite `aria-disabled`). Switched to `<span class="btn-disabled">`, matching Students' existing convention.
2. **Page-header button hierarchy**: `.key-actions` split into two stacked rows — app-wide actions (Search, Referral) on top, a page's own primary action (New Panel Meeting) in its own row below via `key_actions_extra`. Documented as a portal-wide convention in `DesignLanguage.md` ("Page header actions").
3. **Filter-bar border**: widened 1px → 2px (kept `--border-strong`, already the strongest existing border token — width was the only lever left to make it read as more prominent).
4. **Empty referral/priority breakdown**: when a card has 0 New / 0 Review, both the upcoming-panel and completed-panel breakdown now show a `.bd-pill.bd-empty` "No Referrals" pill instead of two zero-count pills; for upcoming panels this also naturally hides the now-pointless Priority label/divider, since priority counts are empty in exactly the same case.
5. **Delete meeting button**: `inclusion_panel_meeting_delete` already existed (with a `not started AND date >= today` guard) but was wired to no button anywhere. Added a Delete button to not-yet-started cards, reusing the existing generic `data-row-remove-form` convention (`panel.js`'s row-remove handler already matched `.meeting-card`). Also switched `.meeting-card-actions` to `flex-wrap: wrap` since it's now sized for 3 buttons, not the 2 it was built for.
6. **Tab-row removed entirely** (raised mid-review, not part of the original 4-item list): status filtering now lives only in the filter-bar as a plain Status dropdown (matching every other filter-bar field), not duplicated into a separate tab-row UI. `inclusion_panel_meetings` gained a `status` GET param, server-side `panels.filter(status=...)` (`Panel.STATUS_CHOICES`), and folded into `active_filter_count`; the now-unused `panels_draft`/`panels_ready`/etc. status-count context vars and all tab-row JS/markup were removed. **This reverses the map's original destination statement** (which had planned a tab-row for Referrals/Actions too) — see map Decisions-so-far and GitHub issues [#3](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/3)/[#4](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/4), both updated to drop that scope.

Also found and fixed in passing (not part of this ticket's actual scope, called out separately): a mojibake character-encoding bug in `_meetings_filtered_content.html`'s Chair/Duration fields, corrected in place along with 18 other files where the same corruption existed in already-uncommitted pending edits (not a historical committed bug — see commit history/discussion for detail).

Verified: Django checks pass; every affected page (meetings, agenda, setup, discussion, home, students, referrals, actions, panel home) smoke-tested at 200; server-side status filtering confirmed via direct GET (`?status=delayed` returns exactly the delayed panels, AJAX partial too); `active_filter_count` confirmed correct.
