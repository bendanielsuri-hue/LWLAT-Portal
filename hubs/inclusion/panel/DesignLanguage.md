# Inclusion Panel — Design Language

Panel-specific visual patterns — implementation detail tied to `panel.css` and Panel's own domain concepts (meetings, referral status). For portal-wide rules (tokens, layout primitives, typography, naming), see the root [DesignLanguage.md](../../../DesignLanguage.md); for motion/hover rules, see the root [InteractionLanguage.md](../../../InteractionLanguage.md).

---

## Meeting card (`.meeting-card`)

Uses `--bg-nested` (one level deeper than surface), `border-radius: var(--radius-lg)` (one step smaller than container), `box-shadow: var(--shadow-sm)`. Hover/chosen: see "Hover and chosen on a selectable card" in InteractionLanguage.md — unlike row/list selectables, this one stays off `--primary`/`--accent-border` entirely.

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
- **`ui-fused-field-group--force-stacked` always** — the group's own overflow-based per-field auto-stacking (`evaluateFusedFieldGroup` in `main.js`) used to leave Panel Group stacked (its select + "+" button don't fit beside a label) while Date/Time weren't (their content is narrower), giving three fields three different widths in the same dialog. Forcing every field to stack unconditionally is what makes them all read as one consistent-width group — the same reason Edit Panel Settings' own dialog already forced it before the merge.
- **Chair is deliberately not part of this dialog, in either mode.** It stays directly editable from the Panel Settings summary itself, autosaving on its own the moment it changes (`update_chair`, a narrow standalone action in `inclusion_panel_meeting_setup` — deliberately not routed through `Panel.update_details()`, which unconditionally overwrites time/panel_group_id too) rather than requiring a dialog round-trip. Its own `{% csrf_token %}` lives right beside the Chair select (guaranteed present whenever the select itself is), not borrowed from some other conditionally-rendered form on the page.
- **Saving always redirects/reloads the Panel Agenda Setup page** in both modes — there's no quieter in-place update anymore (that only ever covered Date/Time before the merge; Panel Group already needed a full reload since it can change the school-scoped referral/member lists shown elsewhere on the page, so once Date/Time joined an explicit-Save model there was no remaining case for a quieter path).
