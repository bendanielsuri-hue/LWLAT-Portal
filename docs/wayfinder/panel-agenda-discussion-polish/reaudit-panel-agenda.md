# Re-audit: Panel Agenda + its modals polish (#72)

Follow-up to [Audit Panel Agenda for polish](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/23)
(#23, folded into #22's earlier batches). Source-only review of `meeting_agenda.html`, `panel.css`,
`panel.js`'s agenda/attendance/discussion-summary wiring, and the modals it opens
(`attendance-dialog` in-page; `new-referral-dialog`/`panel-group-dialog`/`action-form-dialog`/
`discussion-summary-dialog` from `_base.html`, as rendered from this page specifically), against
root DesignLanguage.md/InteractionLanguage.md and Panel's own. Compared throughout against **Panel
Agenda Setup** (`meeting_setup.html`), the sibling page handling the same "ordered agenda of
referrals" concept — #23's punch-list (mojibake, priority-mini, `.agenda-row`/`.referral-row-grid`
adoption, `.list-page-shell`) is already fixed (`8e5a289`, folded via #28/#29/#32/#41).

## Findings

1. **Pending/Discussed rows lost `.selectable`, so they get no hover feedback at all.**
   `meeting_agenda.html:146` (Pending) and `:230` (Discussed) render `<div class="entity-row
   agenda-row" ...>`. Setup's identical-shaped row (`meeting_setup.html:354`) is `<div
   class="entity-row agenda-row selectable" ...>`. `.selectable` is the only thing that puts
   `background: var(--row-hover-bg)` + bold title on hover (`cards.css:165-166`,
   InteractionLanguage.md's "Hover on a selectable row") — bare `.entity-row`/`.agenda-row` carry
   no hover rule of their own. Since #23 was fixed by adopting Setup's exact row markup, this
   class was the one piece left behind — worth picking up in the same pass rather than opening a
   third ticket for it.

2. **Pending row's Remove button is unstyled relative to the same action everywhere else on this
   page.** `meeting_agenda.html:212`, `<button type="submit" class="btn btn-sm">Remove</button>` —
   plain `.btn`, no icon, no destructive tint. Compare: the Discussed row's own Cancel-followup
   button three rows below it (`:267`) is `.btn.btn-secondary.btn-delete.btn-sm` with the shared
   `.btn-delete::before` icon mask, and Setup's equivalent Remove button
   (`meeting_setup.html:415`) is `.btn.btn-secondary.btn-delete.btn-sm` with an explicit
   `remove_svg.html` icon. Same destructive "take this referral off the agenda" action, three
   different presentations across one page and its sibling.

3. **Student meta line dropped from both Pending and Discussed rows.** Setup's `.student-column`
   (`meeting_setup.html:386`) shows `Year {{ student.year_group }} · {{ student.reg_form }}`
   directly under the student name. Agenda's Pending (`:172-178`) and Discussed (`:237-244`) rows
   render only the thumb + name in `.student-column`, no meta line — same `PanelReferral`→
   `Referral`→`Student` chain, one click apart, with the identifying detail (year/reg form) simply
   missing on the live-meeting page where a chair is most likely to want it at a glance.

4. **"New" vs "Review" downgraded from a pill to plain text on Pending, and disappears entirely on
   Discussed.** Setup's `.referral-pills` (`meeting_setup.html:378`) carries this as a real
   `.status-pill type-new`/`type-followup` (`New Referral` / a proper review label) — the same
   visual weight as every other pill on the row. Agenda's Pending row (`:186`) instead renders it
   as a bare `.entity-meta` text line (`{% if pr.is_followup %}Review{% else %}New{% endif %}`),
   and Discussed's own `.entity-meta` for the same flag (`:242`) is inside `.student-column`
   rather than `.referral-details` where Pending puts it — inconsistent placement of the same data
   point between the two columns of the same page, and a downgrade from Setup's pill treatment in
   both.

## Not re-flagged (already conformant / out of scope)

- `.list-page-shell`, `.agenda-row`/`.referral-row-grid`/`.student-column` grid, the Setup-style
  `.agenda-order-rail`, and `_priority_mini.html` reuse are all in place — #23's four items are
  done.
- `new-referral-dialog` and `action-form-dialog` are never opened from this page (Agenda has no
  agenda-composition UI of its own — see `hubs/inclusion/panel/CLAUDE.md`'s `_due_followups` note)
  — nothing to audit there.
- `panel-group-dialog` (Edit Group Membership) and `discussion-summary-dialog` (Discussion
  Summary) are shared, generic fetch-fragment modals identical everywhere they're opened from —
  no Agenda-specific drift found in either.
- The live `discussion-timer`/`panel-timer` JS, drag-reorder (`initAgendaDragDrop`), and
  attendance-dialog auto-open/toggle wiring all match their documented InteractionLanguage.md
  patterns (fade toggle, no reload-triggering animation claims made for this page's plain-POST
  actions).

## Out of scope for this ticket

- No changes made here — audit-only, per the map's ticket split (audit produces the punch-list;
  a separate graduated fix ticket does the implementation).
