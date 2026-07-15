# Inclusion Panel — Design Language

Panel-specific visual patterns — implementation detail tied to `panel.css` and Panel's own domain concepts (meetings, referral status). For portal-wide rules (tokens, layout primitives, typography, naming), see the root [DesignLanguage.md](../../../DesignLanguage.md); for motion/hover rules, see the root [InteractionLanguage.md](../../../InteractionLanguage.md).

---

## Flat section (`.referral-flat-section`)

When several always-visible sections already sit inside one outer bordered container (e.g. a modal body whose only bordered card is a decision-strip summary), Panel skips the border/background on each inner section rather than nesting a card per section — a bordered card per section there reads as cards nested inside the modal's own card. Sections aren't separated by their own border; instead `.referral-flat-section + .referral-flat-section` gets a `border-top` (the first section skips it, since it already sits directly below the decision strip's own border) — a single horizontal rule marking the boundary *between* sections, distinct from the finer divider each section's own last row already carries. One flat section may still be a native `<details>` when it's the one lower-priority, high-volume section in the group that's fine collapsed by default (e.g. Notes) — every other flat section in the group stays permanently open.

This is Panel's own convention where it came up (the referral decision/edit modals), not a portal-wide rule — root DesignLanguage.md deliberately leaves "nested card vs. flat section" as a per-app call.

---

## Meeting card (`.meeting-card`)

Styled as a row (`border-bottom: 1px solid var(--border-color)`, no own border/radius/shadow), stacked directly in `.list-card` alongside Students/Referrals/Actions' `.entity-row` — not a standalone floating card despite the class name. Hover/chosen: see "Hover on a selectable row" / "Chosen / selected state on a row" in root InteractionLanguage.md, same as any other list row.

The "Next Panel" heading (`.next-panel-label`, see below), when present, is a full-width banner directly inside `.meeting-card` — deliberately *outside* the column row (`.meeting-card-row`) below it, so it adds height above the row without ever affecting that row's own height, its vertical centring, or its divider lines. Whether or not a given card is flagged "next", every `.meeting-card-row` looks identical in cross-section.

Within `.meeting-card-row` (`display: flex; align-items: center`): fixed-width columns for the parts whose content length shouldn't reflow the rest of the row, flexible columns for the parts that should soak up whatever space is left. An optional slim logo column (`.meeting-card-logo`, `width: 32px`, only rendered in aggregate/all-schools views) sits to the left of everything else — icon only, no school name text. Main column (`.meeting-card-main`, fixed `flex: 0 0 300px` so every card's columns start at the same x position down the list regardless of panel name length): just the `<h3>` panel name and, below it, the date/time (`.meeting-date-line`, plain secondary text, no label). Two further `.meeting-card-info` columns (`flex: 1 1 0` — grow to fill whatever space remains between the fixed name column and the pinned action column): the first holds the status line (`.meeting-status-line`, no "Status:" text label — the pill speaks for itself — with any secondary pills like `.in_panel` "Today" or `.danger` "Needs referrals"/"No Panel Members" following at the same normal gap) above the referral count; the second holds Chair above the member count. Wording differs by what reads more naturally: Chair keeps a `Label value` row, label right-aligned in a `flex: 0 0 68px` sub-column with `::after { content: ":" }` so the colons line up down the list; referral/member counts lead with the number instead ("3 Referrals", "3 Panel Members") since that's clearer than "Referrals: 3" — no label prefix, just plain count-first text. Every column after the first gets a divider line (`.meeting-card-col:not(:first-child) { border-left: 1px solid var(--border-color); padding-left: var(--space-lg); }`). The action column (`.meeting-card-actions`) is pinned to the row's far edge with `margin-left: auto` and never changes size — it also carries `min-width: 320px; justify-content: flex-end` so a 1-button row (e.g. just "View Details" on a completed panel) reserves the same width as the up-to-3-button row (Start/Continue Panel, Edit, Delete) and right-aligns within it, rather than the whole row shifting depending on how many buttons happen to render.

---

## Pill / badge patterns

**Panel-specific status pill modifiers** (`panel.css`, same underlying tokens as the shared semantic pill classes in root DesignLanguage.md):

| Modifier class | Semantic | Colours |
|---|---|---|
| *(none)* | Neutral / pending | `--badge-bg` / `--text-secondary` |
| `.open`, `.upcoming`, `.incomplete`, `.requires_follow_up`, `.type-external` | Needs attention | `--color-warning-bg` / `--color-warning` |
| `.closed`, `.discussed`, `.complete` | Done / positive | `--color-positive-bg` / `--color-positive` |
| `.in_panel`, `.assigned`, `.type-chair`, `.type-mat` | Active / institutional | `--primary-light` / `--primary` |
| `.danger` | Critical | `--color-negative-bg` / `--color-negative` |
| `.discussing` | Currently active + pulse | `--color-warning-bg` / `--color-warning` + animation |
| `.concern`, `.not_needed`, `.type-school` | Neutral classification | `--badge-bg` / `--text-secondary` |

**Status line** (`.meeting-status-line` on the Panel Meetings list): its own line below the card's `<h3>` name, `--font-sm`, weight 600, `--text-secondary`. No "Status:" text label — leads straight with the normal-sized `.status-pill` for the panel's actual status, then any further pills (`.in_panel` "Today", `.danger` "Needs referrals"/"No Panel Members") at the same `gap: var(--space-xs)`, no extra margin singling them out.

**Next-panel heading** (`.next-panel-label`): plain text, not a chip/pill — an `<h2>` (`--font-xl`, weight 700, `--primary`) that spans the full width of the meeting card, sitting above `.meeting-card-row` (not inside the name column), so it reads as a heading one level up and never perturbs the row's own height/alignment.

---

## Create/Edit Panel Meeting dialog (`_panel_meeting_form_modal.html`, `window.openPanelMeetingModal(panelId)`)

One shared dialog and template serve both "Create Panel Meeting" (`panelId` omitted) and "Edit Panel Settings" (`panelId` set) — same School/Panel Group/Date/Time fields, same field order, same explicit-Save submit model, `inclusion_panel_meeting_new(request, panel_id=None)` (views.py) branching on whether `panel_id` was passed. They used to be two independent dialogs/templates/views with the same fields in a different order and different submit behavior (create: explicit Save button; edit: autosave-per-field, no Save button) — merged after the drift between them (mismatched field order, Date/Time not matching Panel Group's width) became its own recurring complaint.

- **Field order is School, Panel Group, Date, Time** in both modes (School simply isn't rendered at all when `panel` is set — an existing Panel has no school of its own, only via `panel.panel_group.school`).
- **No `ui-fused-field-group--force-stacked`** — labels sit fused to the left of their field, same as everywhere else `.ui-fused-field-group` is used, with the group's own overflow-based per-field auto-stacking (`evaluateFusedFieldGroup` in `main.js`) still free to drop an individual row (e.g. Panel Group, whose select + "+" button need the most room) to label-above independently if it doesn't fit. An earlier version of this dialog forced every field to stack unconditionally so they'd all read as one consistent width; that traded away the left-fused label everywhere for consistency Panel Group alone needed, which wasn't worth it.
- **Chair is deliberately not part of this dialog, in either mode.** It stays directly editable from the Panel Settings summary itself, autosaving on its own the moment it changes (`update_chair`, a narrow standalone action in `inclusion_panel_meeting_setup` — deliberately not routed through `Panel.update_details()`, which unconditionally overwrites time/panel_group_id too) rather than requiring a dialog round-trip. Its own `{% csrf_token %}` lives right beside the Chair select (guaranteed present whenever the select itself is), not borrowed from some other conditionally-rendered form on the page.
- **Saving always redirects/reloads the Panel Agenda Setup page** in both modes — there's no quieter in-place update anymore (that only ever covered Date/Time before the merge; Panel Group already needed a full reload since it can change the school-scoped referral/member lists shown elsewhere on the page, so once Date/Time joined an explicit-Save model there was no remaining case for a quieter path).

---

## Edit Panel Group modal (`_panel_group_form_modal.html`, `#panel-group-dialog`)

**Persistent footer slot swaps between "Add Member" and "Back"** (`.panel-group-modal-footer`, `data-panel-group-footer`). The modal's `data-members-list-view`/`data-members-add-view` panels (Active/Inactive Members tabs vs. the member picker form) share one non-scrolling footer row pinned below `.panel-group-modal-scroll`, same fixed-header/scrolling-body split `dialog.modal-dialog` already uses generically (root DesignLanguage.md's "Card-internal scroll with a fixed header") extended to a fixed *footer* — the button itself swaps (`+ Add Member` in the list view, `← Back` in the add view) rather than each view rendering its own trailing button inline. Toggling between the two swaps the footer's own button label/handler alongside the existing `data-members-mode-toggle`/`data-members-back-btn` show/hide of the two view panels, wrapped in `animateModalHeightChange` like every other in-place content swap in this modal (see InteractionLanguage.md's "Modal content swap"). Kept out of the scrolling area specifically so it's reachable without scrolling down past a long member list or a tall picker — see root DesignLanguage.md's Anti-pattern #17 for why the "Add Member" trigger no longer lives beside the Active/Inactive tabs instead.

**Group Name is Left Fused** (`.ui-fused-field`, label beside the text input), not a plain `.field-group` — it has the full width of the modal header to work with, so it follows the portal-wide "prefer fused, Left Fused when width allows" default (root DesignLanguage.md's Form control patterns) same as the Default Chair field beside it.

---

## Filter bar (Referral/Actions dashboards)

Implements the portal-wide two-layer filter bar pattern (root DesignLanguage.md's Layout patterns) — mechanics are commented inline at each function, referenced here rather than restated:

- AJAX enhancement wiring: `setupAjaxFilterBars()` in `static/js/main.js`.
- Active-filter count badge + highlight: `window.wireFilterBarActiveState()` in `panel.js` — call once per filter bar, invoke the returned `refresh()` on every relevant `change`.
- Cascading/dependent options (e.g. Reg Group scoped by Year Group): pass a `{parent_value: [child_options]}` JSON map (`reg_groups_by_year_json` in `hubs/inclusion/views.py::inclusion_hub`, same shape as `forms_by_year_json` in `hubs/inclusion/panel/views.py::inclusion_panel_students`) and rebuild the dependent `<select>`'s options on the parent's `change`. Call `selectEl._uiSelect.refresh()` afterward if the `<select>` has been enhanced by `enhanceFormControls()` — its popover caches options at enhance time.
- Default student-scoped filter set (any dashboard showing attendance/behaviour/achievement/SEND-type data): Year Group, Reg Group, Pupil Premium, Ethnicity, More Able, Gender, SEN Code, Prior Attainment Band — `core.models.Student`'s `year_group`/`reg_form`/`is_pp`/`ethnicity`/`is_more_able`/`gender`/`sen_status`/`prior_attainment_band`.

---

## Segmented control example (member-picker staff source)

`hubs/inclusion/panel/templates/hubs/inclusion/panel/_member_picker.html`'s `<School> Staff` / `All MAT Staff` / `External` control is the one case where a segmented control fuses into its neighbouring field (`.member-picker-controls`, `panel.css`) — one shared outer border, no radius seam, single divider where they meet. This is an exception to the segmented control's usual standalone bordered box (root DesignLanguage.md's Form control patterns) — reserve it for a segmented control acting as a search filter's mode switch immediately above that search box, not as a general pattern.

---

## Tab row examples

- Panel Home cards: `flex-wrap: nowrap; overflow: hidden`, overflow handled by the `.tab-row-more` dropdown (`style.css`).
- Status-filter tab rows (Panel Home's My Actions, Panel Meetings' All/Draft/Ready/Live/Delayed/Completed): filtering is plain JS matching a `data-status`/`data-*-tab` attribute per row against the clicked tab (`setupTabs()` in `home.html`, inline script in `meetings.html`) — no server round-trip. Panel Home's own live-updating tabs (My Actions/My Referrals) collapse zero-count tabs via CSS so JS can animate the crossing (see InteractionLanguage.md's "Status-filter tab entering/leaving"); Panel Meetings' tabs navigate/reload on every action, so they use the simpler `{% if count %}` omission instead — nothing to animate a transition into.
- Sticky-above-scroll instances: `.setup-col-body .tab-row` (Referral Selection), `#panel-group-dialog [data-members-list-view] > .tab-row` (Edit Panel Group's Active/Inactive tabs).
