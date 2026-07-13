# Audit: Panel Discussion polish

Source-only review of `discussion.html` against `DesignLanguage.md`/`InteractionLanguage.md`
(root) and `hubs/inclusion/panel/DesignLanguage.md`, cross-checked against Panel Agenda
(`meeting_agenda.html`) and Panel Agenda Setup (`meeting_setup.html`) for the same underlying
data/actions rendered elsewhere.

## Bugs

1. **"More Details" buttons on Student Details are dead stubs.** The Attendance / Behaviour
   Summary / Exclusions cards (`discussion.html:165-182`) each render a plain
   `<div class="detail-stat-card">` with a `<button class="btn btn-helper btn-sm">More
   Details</button>` that has no `onclick`, `href`, `data-*` trigger, or form — it does nothing.
   This looks unintentional, not a placeholder-by-design: `.detail-stat-card summary { font-weight:
   600; cursor: pointer; }` already exists in panel.css (line 982-983), styling a `<summary>`
   element that doesn't exist anywhere in this markup — the CSS was written for a
   `<details><summary>` disclosure, the exact pattern this same page correctly uses two sections
   over for "All Meeting Notes" (`panel-notes-history`, line 51-63) and "Previous Referrals"
   (line 208-224). Most likely fix: convert these three cards to `<details><summary>` too (content
   to disclose still needs deciding — there's no student-detail drill-down data modeled yet, so
   this may resolve to "remove the button until there's something to show" rather than "wire it
   up").

2. **Stale CSS rule.** `.action-item .field-group select` (panel.css:1626) targets a `<select>`
   that doesn't exist in the Actions column's actual markup (`discussion.html:231-244` renders
   `field-readonly` + `status-pill`, no select) — likely left over from an earlier version of this
   column. Not visible to users, but dead weight; worth deleting when this file is next touched.

## Cross-page inconsistency

3. **"Escalate to MAT" is styled two different ways on two pages one click apart.** Discussion's
   Referral Details column renders it as `btn-tertiary` (`discussion.html:226`); Panel Agenda's
   Discussed column renders the identical action as `btn-secondary` (`meeting_agenda.html:195`).
   Same link (`inclusion_panel_referral_escalate`), same visual weight expected, two different
   button classes. Pick one (this map's Panel Agenda ticket set doesn't currently include this —
   worth a shared fix ticket touching both pages, or folding into whichever fix lands first).

## Design-language conformance — no findings

`field-group`/`field-readonly` usage, `status-pill` modifiers, `entity-thumb`, and the
`detail-stat-card`/`action-item` background-fill (`--bg-surface-alt`, one level deeper than the
parent card, matching the documented "Detail stat card" convention in `DesignLanguage.md:168`)
are all applied correctly and consistently on this page. Form controls (`note-author` select,
End Discussion's interval/date selects) get the standard `enhanceFormControls` auto-enhancement
like every other `<select>` in the app — no gap there.

## Out of scope for this ticket

- No changes made here — audit-only, per the map's ticket split.
