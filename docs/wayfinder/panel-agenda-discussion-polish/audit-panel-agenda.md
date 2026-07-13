# Audit: Panel Agenda polish

Source-only review of `meeting_agenda.html` + `_agenda_order_controls.html` against
`DesignLanguage.md`/`InteractionLanguage.md` (root) and `hubs/inclusion/panel/DesignLanguage.md`,
compared against the sibling **Panel Agenda Setup** page (`meeting_setup.html`), which handles
the same "ordered agenda of referrals" concept for the same panel.

## Bugs

1. **Mojibake middot** — `meeting_agenda.html:89`, the Members Register's "Joined … Left …" line
   uses a literal `Â·` instead of `&middot;` (every other separator in the file, e.g. line 133,
   uses `&middot;` correctly). Straight encoding bug, one-line fix.

2. **Dead-end "More Details" buttons** — not on this page (see Discussion audit ticket), no
   equivalent here.

## Convention deviations (fix by reusing what already exists)

3. **Priority editing duplicates markup instead of reusing `_priority_mini.html`.**
   Pending column (`meeting_agenda.html:135-145`) hand-rolls a 3-button chip row
   (`priority-chip priority-low/medium/high`) for the same `update_priority` form action that
   `_priority_mini.html` (a single `<select>`, already used by Panel Agenda Setup's agenda card
   and elsewhere) wraps as a shared partial. The `update_priority` POST handler
   (`views.py:2367-2372`) is identical either way — only the widget differs. **Blocker to swap
   in the partial as-is: `inclusion_panel_meeting_agenda`'s view context has no
   `priority_choices` key** (only `inclusion_panel_meeting_setup` and one other view pass it,
   `views.py:1045`, `2332`) — needs a one-line view addition.

4. **Two competing "agenda order" widgets for the same concept.** The Pending column includes
   the shared `_agenda_order_controls.html` partial (`.agenda-order-controls` /
   `.agenda-order-arrows` / `.agenda-order-number`). Panel Agenda Setup's own agenda card
   (`meeting_setup.html:356-374`) does **not** use that partial — it hand-rolls a newer-looking,
   differently-classed version inline (`.agenda-order-rail` / `.agenda-order-rail-number` /
   `.agenda-order-buttons`) that visually reads as more integrated with the row (a numbered rail
   next to the drag handle, vs. a separate boxed control cluster). Both drive the same
   `move_agenda_referral` action. Worth deciding: is the Setup page's rail the newer intended
   pattern (in which case `_agenda_order_controls.html` should be updated to match and Panel
   Agenda's include picks it up for free), or were these meant to diverge?

5. **Pending/Discussed rows use the older flat `entity-row` shape, not the `.agenda-row` /
   `.referral-row-grid` / `.student-column` grid pattern.** Panel Agenda Setup's agenda card
   (`meeting_setup.html:354-417`) renders each referral as `.agenda-row` — a 3-column grid
   (drag handle / order rail / content) whose content further splits into `.referral-row-grid`
   (pills row, student thumb+name+meta column, and a details column that vertically centers
   across both rows). Panel Agenda's Pending/Discussed rows (`meeting_agenda.html:120-165`,
   `172-202`) instead use the plain `.entity-row` flex shape (thumb, then a single stacked
   `.entity-body` for everything — pills, meta lines, and the priority form all inline in one
   column). Same underlying data (a `PanelReferral` with student, status/stage pills, priority),
   two different visual structures across two pages that are one click apart in the same flow.
   `.agenda-row`/`.referral-row-grid` CSS already exists and is reusable — this isn't a new
   pattern to design, just an unapplied one.

## Structural / layout

6. **Not wrapped in `.list-page-shell`.** Every other Panel page with a card layout
   (`referrals.html`, `home.html`, `students.html`, `actions.html`, `meetings.html`,
   `meeting_setup.html`) wraps its content in `<div class="list-page-shell">`, which drives the
   fixed-height "card scrolls internally, toolbar stays put" behavior
   (`.list-page-shell .panel-toolbar { flex-shrink: 0 }`, `.list-page-shell .setup-columns`,
   panel.css:578-621). Panel Agenda's `content` block starts directly with the toolbar +
   `.agenda-layout` (a bare CSS grid, panel.css:991-993) with no shell wrapper, so the whole
   page scrolls with the document instead of each column scrolling internally under a pinned
   toolbar/stats bar. Given this is the "live meeting in progress" page — toolbar stats
   (elapsed timer, progress) arguably benefit from staying pinned while a long Pending/Discussed
   list scrolls, the same way Setup's toolbar stays pinned while its cards scroll. Flagging as a
   decision, not an assumed bug: confirm whether whole-page scroll was deliberate for this page
   before folding it into `.list-page-shell`.

## Out of scope for this ticket (belongs to the fix tickets)

- No changes made here — this ticket is audit-only, per the map's ticket split (audit produces
  the punch-list; separate graduated tickets do the implementation).
