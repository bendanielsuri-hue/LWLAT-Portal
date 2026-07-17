# Re-audit: Panel Discussion + its modals polish (#73)

Card-by-card walkthrough of `discussion.html` and its modals (`end-discussion-dialog`,
`leave-confirm-dialog`, `safeguarding-briefing-dialog`, all in-page) against the running app,
using `PanelReferral` #110 (Taylor, Amelia — panel #28) as a worked example: a discussed referral
with notes, actions, and 2 previous referrals. Unlike #72 (Panel Agenda, source-only), this pass
was live-driven — the user browsed the actual page and flagged items directly, with source
verification done inline for anything that looked like it might be a real bug rather than a
preference.

## Findings, graduated into fix/decision/grilling tickets

1. [#93](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/93) Safeguarding Notes: hide
   the inline Student Details card entirely when a student has zero notes (today it renders an
   empty state instead); drop the bulleted list for both the inline card and the auto-pop modal
   in favour of horizontal dividers between entries.
2. [#94](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/94) Student profile header:
   give the name real heading-scale prominence (no label), add the unused `Student.house` field
   alongside Reg/Year on the same line.
3. [#95](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/95) **Grill** — rework the
   Attendance/Behaviour/Exclusions cards into a richer dashboard: reorder Safeguarding Notes to
   after them, more detail per card, good/bad colour-coding, a new Positive Behaviour card (open
   question: own card or merged with Behaviour — no such data model exists yet), swap the native
   `<details>` disclosure for a "More details" button.
4. [#96](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/96) Decide whether Referral
   Details' `qa-definition-list` should right-align its labels (colon-aligned, same precedent as
   the meeting-card's Chair row) instead of today's left/left.
5. [#97](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/97) Actions row: fused labels
   for Category/Assigned To/Due Date, a proper fused date component for Due Date, fix the
   Action Status control's top spacing, and fix its `<select>`s rendering as unstyled native
   dropdowns (`.field-editable` skips `enhanceFormControls()`).
6. [#98](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/98) **Grill** — how should
   staff/group assignment actually work on an Action row (a dedicated "Assigning staff" mode on
   Add Action vs. a fused Edit button) — two floated directions, neither decided.
7. [#99](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/99) **Real bug**, verified in
   source: End Discussion's custom date picker (`.ui-fused-field-group`, toggled via `hidden`)
   never actually hides, because `forms.css:598`'s `.ui-fused-field-group { display: grid }`
   overrides the native `[hidden]` rule regardless of which "Review in..." option is selected.
8. [#100](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/100) End Discussion's term
   options: name them with the real `Term.name` (Spring/Summer/etc, already available in
   `core.term_dates.next_term()` but discarded) instead of generic "Next Term"; list every
   remaining term in the current academic year, not just the next one; offer "Next Autumn Term"
   when already in Summer Term.
9. [#101](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/101) Leave-confirm modal's
   Yes/No buttons are too small for a consequential prompt — centre them, give them a minimum
   width.

## Not flagged

- Meeting Notes card, Discussion Controls card (elapsed timer/End Discussion/Escalate), and the
  Discussion Summary modal (shared with Agenda, already covered by #72) — no changes wanted.

## Out of scope for this ticket

- No changes made here — audit-only, per the map's ticket split (audit produces the punch-list;
  separate graduated tickets do the implementation).
