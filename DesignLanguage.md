# Portal Design Language

Extracted from the Inclusion Panel and SEND & Provision hub — the most complete, stable UI in the codebase. Apply these rules to all future hub pages.

Covers static visual rules: colour, layout, typography, spacing, naming. For hover/focus/motion rules, see [InteractionLanguage.md](InteractionLanguage.md). For Inclusion Panel's own implementation-specific patterns (meeting cards, panel status pill modifiers), see [hubs/inclusion/panel/DesignLanguage.md](hubs/inclusion/panel/DesignLanguage.md).

---

## Design philosophy

- **Token-first**: every colour, radius, shadow, spacing unit and font size references a CSS custom property. No hardcoded hex values or pixel radii outside the token definitions in `static/css/tokens/`, `static/css/theme/`, and `static/css/style.css`.
- **Surface layering**: visual depth is expressed by background tokens alone — no box-shadows to simulate elevation except on floating surfaces (cards, modals). The five layers in ascending depth:
  - `--bg-page` → page canvas
  - `--bg-surface` → cards, list containers, panels
  - `--bg-surface-alt` → alternating rows, header strips, inputs, read-only fields; same depth as `--bg-surface`, different shade
  - `--bg-nested` → content semantically *inside* a card: sub-panels, expanded sections, indented child lists (meeting-card, referral-pick-item, action-item, agenda-preview-item)
  - `--bg-well` → deep trough within a nested section: a scrollable list well, a grouped field area; rarely needed

  **Alt vs nested** — the test: would a user describe this content as being *inside* or *under* something? Use `--bg-nested`. Or is it a visual stripe to break up peer items at the same level? Use `--bg-surface-alt`.
- **Meaning through colour, not decoration**: accent colour (`--primary`) and semantic signal colours (`--color-positive`, `--color-caution`, `--color-warning`, `--color-negative`, `--color-exceeding`) signal state; neutral tones (`--badge-bg`, `--text-secondary`) mean "no special significance". Never use a semantic colour purely for visual interest.
- **Interaction is consistent sitewide**: hover, selected, and focus-visible states use the same three tokens everywhere — `--row-hover-bg`, `--primary-light` + inset shadow, `outline: 2px solid var(--primary)`.
- **Personal theme layer**: on top of Theme Mode (`data-theme-mode`, light/dark) and the user's chosen accent colour (`data-color`, one of 8 hues), a `data-theme` attribute (`pastel` default, `vibrant`, `cool`, `minimal`, `neon`, `colourblind`) re-derives every colour token — including `--primary-base` per accent and the `--color-*` semantic set — and may also carry its own spacing/layout rules, not just colour. Never assume a fixed hex or spacing value for any token; everything must keep working across all Theme × accent × Theme Mode combinations. `/portal-admin/themes/` previews all of these live.

---

## Information hierarchy

1. **Page title** (`<h1>`, `--font-5xl`) — one per page, lives in `{% block page_title %}`.
2. **Card / column heading** (`<h2>`, `--font-xl`) — one per card or layout column, centre-aligned inside `.setup-col` / `.discussion-col` / `.panel-card`.
3. **Section heading** (`<h3>`, `--font-lg` or `--font-md`) — within a card, e.g. "Members", "Referral Selection".
4. **Row / item title** (`.entity-title`, `.panel-item-title`, `--font-md`, weight 600) — the primary label for a list row.
5. **Row metadata** (`.entity-meta`, `.panel-item-meta`, `--font-sm`, `--text-secondary`) — supporting detail on the same row.
6. **Note / faint detail** (`.panel-item-note`, `--font-sm`, `--text-muted`) — tertiary, lowest-contrast text.
7. **Field label** (`<label>`, `--font-sm`, weight 600, `--text-secondary`) — for a plain `.field-group` field, always sits above its control, never inline. A fused field (`.ui-fused-field`) is the deliberate exception — see Form control patterns below for when Left Fused (label beside control) applies instead.
8. **Source / context annotation** (`.field-source`, `--font-2xs`, uppercase, `letter-spacing: 0.03em`, `--text-faint`) — rendered above a label to explain where a read-only value comes from.

---

## Layout patterns

**Two-column split** (`.setup-columns`, `.discussion-columns`, `.panel-columns`)
```css
display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start;
```
Each column: `flex: 1 1 280px; min-width: 260px` (or `360px` for panel home cards). Columns wrap to single-column below ~600px.

**Fixed-height list shell** (`.list-page-shell`)
A flex column that fills viewport height: content area (`flex: 1; min-height: 0; overflow-y: auto`) above a pinned `.stats-strip` footer. Any page whose list needs to scroll internally without growing the page uses this pattern. If the shell stacks more than one row (e.g. Panel Home's two `.panel-columns` rows above the stats strip), space the rows apart with `gap` on the shell itself, set to the same value as the row's own horizontal card gap (`--space-xl`) — not a per-row `margin-bottom` at a different scale. Scope that `gap` with `:has(.panel-columns)` (or similar) rather than adding it to `.list-page-shell` unconditionally, since other shell pages (Students/Referrals/Actions) use a single `.list-card` with its own margin-bottom in the same shell class and would double up on spacing otherwise.

**Put a non-.list-card header inside the shell, don't invent a second height calculation**
`.list-page-shell`'s height is measured once, off `.sticky-header-zone`'s bottom edge (`setupListPageShellHeight()` in `main.js`). Anything that needs to sit above the shell's scrolling body but isn't a `.list-card` filter bar — e.g. Panel Setup's `.panel-toolbar`, whose height varies with panel status — should be a flex-shrunk child *inside* the shell (`flex-shrink: 0`, same as `.list-page-shell .panel-card-header`/`.tab-row`) rather than living outside it and guessing a second `calc(100vh - Npx)` offset to compensate. The scrolling body then just needs `flex: 1; min-height: 0; overflow: hidden` (see `.list-page-shell .setup-columns`) — no matter how tall the header above it turns out to be, it's already accounted for by the shell's one measurement. Pair with `align-items: stretch` on a card row (overriding the two-column-split default of `align-items: flex-start` above) so every card fills that height and only the card's own overflow scrolls.

**Card-internal scroll with a fixed header** (`.setup-col`; also `dialog.modal-dialog`)
A card whose list can grow long (Panel Setup's Panel Details/Members, Panel Selection, Panel Agenda) is `display: flex; flex-direction: column; overflow: hidden` with two children: a plain, non-scrolling `.setup-col-header` (the card's `<h2>`) and a `.setup-col-body` (`flex: 1 1 auto; min-height: 0; overflow-y: auto`) holding everything else. The H2 lives structurally outside the scroll area rather than merely `position: sticky` inside it — scrolled content can then never visually collide with it at the top of the scroll. Every `dialog.modal-dialog` uses this same technique for the identical reason, plus one more: a `position: sticky` header *inside* the one element that scrolls (the old approach) means the scrollbar itself belongs to that same element, so it runs the dialog's full height — including behind the header — and sits flush against the dialog's own rounded corners rather than inset from them. Structurally separating `.modal-header` (`flex-shrink: 0`) from `.modal-body` (`flex: 1 1 auto; min-height: 0; overflow-y: auto`) fixes both: the scrollbar now starts exactly where the body starts, and it's inset by the body's own padding, clear of the corners. A sub-section heading inside the body (e.g. "Panel Members", "New Referrals") can still use `position: sticky; top: 0`, scoped to `.setup-col-body .setup-col-header` — safe because the body is its one true scrolling ancestor, no page-header offset to account for. `.setup-col-body` bleeds out via `margin: 0 calc(-1 * var(--space-lg)); padding: 0 var(--space-lg)` so its scrollbar sits flush against the card's right edge instead of inset by the card's own padding — same technique as `.panel-list`'s edge-to-edge bleed (see Row items below).

The same technique extends to a fixed *footer*, not just a header: a modal whose scrolling body needs a persistent action below it (e.g. Panel Group's Add Member/Back slot, see `hubs/inclusion/panel/DesignLanguage.md`) adds that action as a third flex child after `.modal-body`'s scrolling region — `flex-shrink: 0`, same as the header — rather than pinning it inside the scroll area with `position: sticky; bottom: 0`. A sticky-inside-the-scroller footer shares that element's own scrollbar (the same corner/inset problem `.modal-header` avoids by living outside the scroll area), where a true flex sibling doesn't.

**Agenda grid** (`.agenda-layout`)
```css
display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px;
```
Equal-width columns, auto-fills the row. Used when there are 3+ equal-weight sections.

**Filter bar** (`.filter-bar` + `.filter-field`)
A row of labelled controls. Each `.filter-field` contains a `<label>` (left-aligned over its control, matching every other label in the app — see "Text alignment" above) + one `<input>` or `<select>`. Two flavours, chosen by whether the underlying data needs a server round-trip:

- **Client-side row filter** (Students/Referrals/Actions list pages) — plain `<div class="filter-bar">` (no `<form>`), fields have no `name`; JS filters/hides `.entity-row`s in place via `data-*` attributes on each row. No page reload. Always precedes `.entity-list` or `.list-card`. A `filter-bar-clear` button is the last item.
- **Server-side dashboard filter** (default for any dashboard whose stats/charts/KPIs are computed server-side, e.g. `hubs/inclusion/templates/hubs/inclusion/hub.html`) — `<form method="get" class="filter-bar">` in `{% block page_filters %}` (see the sticky page-filter pattern below), and the view recomputes everything from `request.GET`. Use this — not the client-side flavour — whenever the numbers on the page (not just which rows are visible) must reflect the filter. This is progressive enhancement over two layers:
  - **Baseline**: no `onchange` on the `<select>`s at all — a plain GET form, submitted (however the browser would trigger it) reaches the fully server-rendered page with the correct filtered state, `active_filter_count`, and `filter-field--active` highlighting. This is also the fetch-failure fallback for the layer below, so it must keep working standalone.
  - **AJAX enhancement (default for new dashboards of this kind)**: add `data-ajax-target="<selector>"` to the `<form>`, pointing at a wrapper around just the filter-dependent markup (e.g. `#dashboard-filtered-content`). `static/js/main.js`'s `setupAjaxFilterBars()` then owns `change`/`.filter-bar-clear` clicks entirely — `fetch()`s the same URL with `X-Requested-With: XMLHttpRequest` (the existing AJAX convention from `hubs/inclusion/panel/views.py`'s modal endpoints), swaps the target's `innerHTML`, and `history.replaceState`s the querystring — no full navigation, no scroll jump. **Never include the `<form>` itself, any `<dialog>`, or anything with its own one-time JS wiring (carousels, etc.) inside the swapped target** — see `hub.html`'s comment above `#dashboard-filtered-content` for the two concrete bugs this avoids (a JS-captured element reference going stale, and losing a carousel's event listeners). Since the target swap never touches the filter bar, anything that filter bar itself needs to reflect (the count badge, active highlighting, cascading option lists) has to be re-derived client-side — see below — not re-rendered by the server response.

**Sticky page-filter bar**: `templates/layout.html` wraps `.page-header` in a `.sticky-header-zone` div with `{% block page_filters %}` immediately after it, inside the same sticky container — override that block (not `{% block content %}`) so the filter bar scrolls together with the page header instead of two independent `position: sticky; top: 0` siblings overlapping. Precede the `<form>` with `<div class="sticky-zone-sentinel"></div>` so `main.js`'s `setupStickyZoneSentinels()` can toggle `.is-stuck` (stronger shadow/border, tighter padding) once the bar is actually pinned.

**Active-filter count badge** (`.filter-bar-label` + `.filter-bar-count`): every filter bar, both flavours, starts with `<span class="filter-bar-label">Filters <span class="filter-bar-count filter-bar-count--empty">0</span></span>` as its first child — always render the count span itself — and toggle the `filter-bar-count--empty` class (`visibility: hidden`) when the count is 0. Conditionally *including* the element changes `.filter-bar-label`'s width and shoves every field after it sideways each time the count changes. The server's `active_filter_count` only ever backs the *first paint* now (baseline/no-JS/fetch-failure page load) — once JS is driving (either flavour, AJAX-enhanced or fully client-side), `wireFilterBarActiveState()` below is what keeps it in sync, since an AJAX dashboard's swapped target deliberately excludes the filter bar itself (see above), so the server never gets a chance to re-render this badge again after the first load. `.filter-bar-label`'s text is `--text-secondary` by default, only switching to `--primary` when the badge isn't empty (`.filter-bar-label:not(:has(.filter-bar-count--empty))`) — "Filters" is chrome labelling an otherwise-empty control, not itself an active/selected state, so it shouldn't borrow the app's "this is active" colour until a filter is actually applied.

**Active field highlight** (`.filter-field--active`): the highlight/background padding lives on the base `.filter-field` rule unconditionally, not on the `--active` modifier — the modifier only toggles `background`/`border-radius`/label colour. Putting padding only on `--active` grows the field's box when it activates, shifting neighbouring fields sideways.

**Wiring the count badge + active highlight client-side**: call `hubs/inclusion/panel/static/js/panel.js`'s `window.wireFilterBarActiveState(filterBarEl)` once (it returns a `refresh()` function) and invoke that `refresh()` on every relevant `change` — for the fully client-side flavour, at the end of the page's own `applyFilters()` (see `students.html`/`referrals.html`/`actions.html`); for an AJAX-enhanced server-side dashboard, on the filter bar's own `change` event directly (see `hub.html`'s inline script — it's independent of, and unrelated to, whether the AJAX content fetch itself succeeds). It treats any `.filter-field` as active when its control differs from default (non-empty select/text input, or an "on" `.toggle-pill`); mark a field `data-not-a-filter` to exclude it from both the highlight and the count when it merely feeds another filter rather than constraining the list itself (e.g. Actions' "Staff Assigned" identity picker, which only matters once "Assigned to Me" is toggled on).

**Cascading/dependent filter options**: when one filter option list is inherently scoped by another (e.g. Reg Group belongs to exactly one Year Group), compute the dependent choices from the base queryset filtered by the already-selected value (not the unfiltered set), and drop the dependent filter's own selected value if it no longer appears in the narrowed choices. Two layers, same as the filter bar itself: the view always narrows server-side for the baseline/first-paint page (`reg_group_choices`/`selected_reg_group` in `hubs/inclusion/views.py::inclusion_hub`); an AJAX-enhanced dashboard additionally needs the *same* narrowing done client-side, since its filter bar is never re-rendered after the first load — pass a `{parent_value: [child_options]}` map as JSON (`reg_groups_by_year_json`, same shape as `forms_by_year_json` in `hubs/inclusion/panel/views.py::inclusion_panel_students`) and rebuild the dependent `<select>`'s options on the parent's `change` (see `hub.html`'s `refreshRegOptions()`). If the dependent `<select>` has already been enhanced into a custom popover control by `enhanceFormControls()`, call `selectEl._uiSelect.refresh()` after mutating its options — the popover caches its option list at enhance time and won't otherwise notice an external change (same hook the date/time custom controls use for this). Independent filters (the common case) should keep computing their option lists from the unfiltered base set so their dropdowns don't shrink as other filters are used.

**Default student-dashboard filter set**: any dashboard showing student-scoped data (attendance, behaviour, achievement, SEND, etc.) should offer these 8 contextual filters as a baseline rather than inventing an ad hoc subset — Year Group, Reg Group, Pupil Premium, Ethnicity, More Able, Gender, SEN Code, Prior Attainment Band — backed by `core.models.Student` fields `year_group`, `reg_form`, `is_pp`, `ethnicity`, `is_more_able`, `gender`, `sen_status`, `prior_attainment_band`.

**Scroll-position preservation on the fallback path**: an AJAX-enhanced dashboard filter never navigates on success, so there's no scroll jump to fix in the first place. `main.js`'s `setupFilterBarScrollRestore()` still matters as the safety net for the baseline/fetch-failure path — it saves `window.scrollY` to `sessionStorage` (capture-phase `change` listener on `form.filter-bar`, not a `submit` listener — `this.form.submit()`/a manual `window.location.href` assignment doesn't fire a `submit` event) and restores it once that real navigation's reload settles. Generic to any `form.filter-bar`, AJAX-enhanced or not — no extra wiring needed.

**Stats strip** (`.stats-strip`)
`display: flex; gap: 16px; flex-wrap: wrap` of `.stat-card`s. Sits either at the bottom of a `.list-page-shell` (pinned footer) or below a content section (not pinned). Never at the top of a page.

**Standalone action card above a list** (`.meeting-actions-card`, `.followups-card`)
A non-growing bordered card — `margin-bottom: 16px` — that holds at-a-glance stats and a primary CTA, sitting above the scrollable list container. Use when the list card's own header would be too cramped.

---

## Spacing patterns

| Context | Value |
|---|---|
| Gap between layout columns/cards | `24px` |
| Gap between list items (`.meeting-list`) | `12px` |
| Gap between filter fields | `12px` |
| Card internal padding (standard) | `20px` |
| Card internal padding (tighter) | `16px` |
| Card internal padding (compact) | `12px` |
| `margin-bottom` below a card `<h2>` | `16px` |
| `margin-bottom` below a section (`<h3>`, `.agenda-section`) | `28px` |
| `margin-bottom` between consecutive cards | `16px` |
| `margin-bottom` between `.field-group`s | `16px` |
| Gap inside a `.btn-row` | `8px` |
| Gap inside a `.panel-item-update` / inline stat row | `10px` |
| Gap inside `.mini-stats` | `10px` |

Do not add `margin-bottom` to the last card in a flex container — let `gap` on the parent do all the spacing.

---

## Typography patterns

| Token | Use |
|---|---|
| `--font-5xl` | `<h1>` page title only |
| `--font-4xl` | `.stat-value` (large stat number) |
| `--font-2xl` | Modal `<h2>`, `.discussion-timer` |
| `--font-xl` | Card / column `<h2>`, settings section `summary` |
| `--font-lg` | Meeting card `<h3>`, secondary column heading |
| `--font-md` | `.entity-title`, `.panel-item-title`, `<h3>` inside cards |
| `--font-base` | Body text, table cells, tab labels, button text |
| `--font-sm` | Metadata (`.entity-meta`), field labels, table `<th>` |
| `--font-xs` | Status pills, priority chips, toggle labels |
| `--font-2xs` | `.field-source`, `.priority-badge`, day-of-week in calendar |

**Font weight conventions:**
- 400 — body / metadata
- 600 — titles, labels, active tab, card count
- 700 — stat values, timers, chosen row title, bold emphasis

**Uppercase + letter-spacing** (`text-transform: uppercase; letter-spacing: 0.02–0.03em`) is reserved for `.field-source`, `.priority-badge` only. Do not apply to running text.

**Avoid `text-transform: uppercase` on new labels.** The user has expressed a general preference against all-caps text — e.g. the "Next Panel" heading reads in normal title case, not "NEXT PANEL". The two `text-transform: uppercase` exceptions above are pre-existing and left as-is, but don't reach for `text-transform: uppercase` on new labels/eyebrow text — use normal case with weight/colour/size for emphasis instead.

**Centred headings** inside `.setup-col`, `.discussion-col`, `.panel-card`: always `text-align: center`.

---

## Card patterns

**Standard content card** (`.panel-card`, `.setup-col`, `.discussion-col`)
```css
background: var(--bg-surface);
border: 1px solid var(--border-strong);
border-radius: var(--radius-xl);
padding: 20px;
box-shadow: var(--shadow-md);  /* or var(--card-shadow) */
```
**Every card border is `--border-strong`, never plain `--border-color`** — the latter is too pale to read as an edge against its own backdrop in Soft/pastel (confirmed portal-wide: `.list-card`, `.hub-card`, `.breakdown-card`, `.senco-card`, `.filter-bar`, `.panel-card`, `.setup-col`/`.discussion-col`, `.panel-toolbar`, `.settings-section`, `.detail-stat-card`, `.tab-row`'s own divider, all fixed together — see grilling session 2026-07-12). Applies to any bordered, background-filled standalone container playing a "card" role — not form inputs, popovers, modals, or internal row dividers, which are a different pattern and keep `--border-color`.

**List container card** (`.list-card`)
Same border/radius/surface as above but `display: flex; flex-direction: column` so it can host a scrollable list body.

**Stat card** (`.stat-card`)
`flex: 1 1 200px`, standard surface/border/radius-lg, `padding: 16px 20px`. Accent variant adds `border-left: 4px solid var(--primary/--color-warning/--color-positive)` and a positioned icon at top-right (`position: absolute; top: 16px; right: 16px; width: 20px`).

**Mini stat card** (`.mini-stat-card`)
Pill-shaped (`border-radius: var(--radius-pill)`), `padding: 6px 14px`, surface-alt background. Used inline beside buttons, not in a stats strip.

**Settings section** (`.settings-section`)
Collapsible `<details>`. `border-radius: var(--radius-xl); padding: 16px 20px`. Summary uses `▸ / ▾` pseudo-content, no webkit marker. Body revealed with `margin-top: 14px`.

**Detail stat card** (`.detail-stat-card`, inside `.discussion-col`)
`border-radius: var(--radius-md); padding: 10px 14px; background: var(--bg-surface-alt)` — one level deeper than its parent card.

**Accent / emphasis card** (`.set-action-card`)
`border: 2px solid var(--accent-border); box-shadow: var(--shadow-emphasis)` — used sparingly for the single most-important item on a page (e.g. current action being set during a discussion).

**Flat section** (`.referral-flat-section`)
No border/background/radius of its own — just a generous `margin-top` and a left-aligned `.referral-section-title` heading. Use this instead of `.settings-section`/`.panel-card` when several always-visible sections already sit inside one bordered container that already has its own card at the top (e.g. a modal body whose only bordered card is a decision-strip summary): stacking a bordered card per section below that would read as nested cards inside the modal's own card. Sections aren't separated by their own border — instead `.referral-flat-section + .referral-flat-section` gets a `border-top` (the first section skips it, since it already sits directly below the decision strip's own border) — a single horizontal rule marking the boundary *between* sections, distinct from the finer divider each section's own last row/item already carries (`.referral-view-fields`, an `.action-row-list`, `.referral-history-list`) between individual rows within it. One flat section may still be a native `<details>` (summary gets `.referral-section-title` too, plus the same `▸`/`▾` chevron treatment as `.settings-section`) when it's the one lower-priority, high-volume section in the group that's fine collapsed by default (e.g. a Notes section sitting alongside otherwise-always-open sections) — every other flat section in the group stays permanently open, no collapse.

**Action row card** (`.action-row--card`, applied to `.action-row`)
`border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-surface-alt); padding: 8px 16px`, stacked in `.action-row-list` (`display:flex; flex-direction:column; gap:12px` — no border/background of its own). Use for a short, low-volume list of actions inside a modal where each action is a distinct, individually-actionable item — a bordered card per row reads as more separable/scannable than a divided `.entity-list`. Bare `.action-row` (no `--card` modifier) is the page-level convention instead — combined with `.entity-row` inside an `.entity-list` on a full list page (e.g. Actions) — since a page-level list is expected to read as one continuous list, not a stack of cards. When the row's status is editable (a `<select>` styled as a pill, `data-action-status-select`), drop the plain status pill from the row's heading — the dropdown already shows the current value, so a separate pill next to it is redundant. Keep an "Overdue" pill regardless — that's signal the dropdown doesn't otherwise carry.

**Key-fact row** (`.summary-line`, e.g. `.referral-decision-strip .summary-line` / `.referral-view-fields .summary-line` / `.referral-history-grid .summary-line`)
A handful of `label: value` facts, one per line — inside one bordered card as an at-a-glance summary above more detailed sections (a modal's "should this go back to panel?" decision strip), as the compact read-only rendering of a longer field list (a Referral section's Concern/Referred By/questionnaire answers), or as a past discussion's own facts (Panel Meetings' Chair/Attendance/Duration/Actions Added, each on its own line rather than crammed two-per-row) — all the same row pattern, sharing the same `minmax(160px, 200px)` column width used by `.action-row-grid`'s left column too, so every section's left-hand column lines up down the same modal rather than each one picking its own floor. Each row: `display: grid; grid-template-columns: minmax(160px, 200px) 1fr; column-gap: 16px`, value `text-align: left`. **Never right-align the value against a left-aligned label** — a value pinned to the row's far edge, opposite a label pinned to its near edge, reads as disconnected from that label (the eye has to jump the full row width to reconnect them). Keep label and value close together, both left-aligned. **Don't reach for `.field-group`'s label-above-value stacking here either** — that's the live-form-field look (a disabled `<textarea>` in edit mode sits under exactly that label style), so using it for a read-only summary makes the summary look like a form again, which defeats the point of a compact read-only view. Rows are divided by `.summary-line + .summary-line { border-top: 1px solid var(--border-color) }` (decision strip) or `border-bottom` per row with the last one cleared (field-list use), not both. The denser field-list use keeps tighter vertical row padding (`--space-xs`) than the decision strip's (`--space-sm`) — it's meant to read as the more condensed of the two.

---

## Navigation patterns

**Tab row** (`.tab-row`)
- **Never shares a row with a button or any other control.** A `.tab-row` sitting beside a taller sibling (e.g. an "Add" button) inherits that sibling's height, leaving visible dead space under the tabs' own underline indicator — the tabs read as floating rather than flush against the content below them. Give the other control its own row (above the tabs, or a dedicated footer row) instead. No exceptions — a tab's own status-count badge lives *inside* that tab already (see below), so it isn't a competing control sharing the row.
- Underline indicator only — no background fill on tabs themselves.
- Indicator: `position: absolute; bottom: -1px; height: 2px; border-radius: 2px`.
- Animated in via `transform: scaleX(0) → scaleX(1)` (`--transition-pop`) and `opacity: 0 → 1`.
- Hover: indicator is `--text-faint`, text becomes `--text-primary`.
- Active: indicator is `--primary`, text is `--primary`.
- **The base `.tab-row` rule carries no horizontal margin at all — never give it one.** A single hardcoded bleed value can't be right for every container (a hardcoded `margin-left: -16px` here used to assume one specific ancestor's padding, and every other context either had to fight it back out or silently inherited a mismatched bleed — see grilling session 2026-07-12, "tabs not going edge to edge"). Any container that needs `.tab-row` bled to reach its own true edge sets its own **two-sided** margin (`margin-left`/`margin-right`, both, sized to that container's own real padding) — e.g. `.setup-col .tab-row`/`.panel-card .tab-row` both bleed by `--space-lg` since that's those containers' actual padding. A container with no padding of its own (e.g. Panel Meetings' `#meetings-filtered-content`) needs no bleed at all — `.tab-row` is already flush by default; use `padding-left` (not a margin) if the tab *text* still needs to line up with padded content elsewhere in the same card, so the border-bottom stays at the true edge instead of being pulled in with it.
- Panel Home cards use `flex-wrap: nowrap; overflow: hidden` — tab overflow is handled by JS (`.tab-row-more` dropdown in `style.css`).
- **Status-filter tab rows** (e.g. Panel Home's My Actions card, Panel Meetings' All/Draft/Ready/Live/Delayed/Completed): every tab carries its live count in parentheses, e.g. `Draft (3)`. An `All (N)` tab is always rendered — it's the default active tab and never hides. A status with nothing in it still shouldn't take up tab-row space, but *how* that's achieved now splits in two: a page with a live, in-page trigger that can change the count without a reload (Home's My Actions/My Referrals) always renders every tab and collapses the zero-count ones to nothing via CSS (`.tab-collapsed`, see InteractionLanguage.md's "Status-filter tab entering/leaving the tab row") so JS can animate the crossing; a page with no such trigger (Panel Meetings — Start/Delete both navigate away or reload) keeps the simpler `{% if count %}` omission, since there's nothing to animate a transition into. Filtering itself is plain JS matching a `data-status`/`data-*-tab` attribute on each row/card against the clicked tab's `data-*-tab` value (see `setupTabs()` in `home.html` and the inline script in `meetings.html`) — no server round-trip either way. The count itself changing while a tab (or a card/section heading) is visible also animates — see InteractionLanguage.md's "Count-delta pulse".
- **A `.tab-row` sitting directly above a scrolling list body is always sticky** (`position: sticky; top: 0; z-index: 1; background: var(--bg-surface)`), scoped to that scrolling ancestor — never left to scroll away with the content it filters. See `.setup-col-body .tab-row` (Referral Selection) and `#panel-group-dialog [data-members-list-view] > .tab-row` (Edit Panel Group's Active/Inactive Members tabs) for the two current instances.
- **The tab row's divider goes directly under the tabs, not between the tabs and whatever static content sits above them.** Use the base `.tab-row` rule's own `border-bottom` (don't override it away) — never a `border-bottom` on the preceding static block instead. See `.setup-col-body .tab-row` (Referral Selection, Panel Agenda Setup) for the canonical example. Static content above a tab row (e.g. Edit Panel Group's Name/Chair fields) stays undivided from the tabs — no border of its own.

**Side nav active state**
`background: var(--primary-light); color: var(--primary); box-shadow: inset 3px 0 0 var(--accent-border); font-weight: 600`.

**Breadcrumbs**
`--font-sm`, `--text-secondary`. Active link: `border-radius: var(--radius-pill); padding: 3px 8px`, hover gets `background: var(--primary-light)`. Current page (last crumb): weight 600, `--text-primary`, no link.

**Back button** (`.page-back-btn`)
Left of `<h1>` in `.page-heading-wrap`, separated by a left border. Icon + text. Colour `--text-secondary`, hover becomes `--primary` on `--primary-light`.

---

## Table / list patterns

**Entity list** (`.entity-list` / `.entity-row`)
`background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden`. Each row: `padding: 14px 20px; border-bottom: 1px solid var(--border-color)`. Last row: no border.

**Preference: any `.entity-list` with hover/selection feedback bleeds edge-to-edge.** Use the `.entity-list--bleed` modifier (negative margin matching the card's own padding, same technique `.panel-list` below uses) rather than leaving the row's hover/chosen background inset within the card's padding. Applies whenever a row is `.selectable` or otherwise interactive — a highlighted row should always reach the card's edges, never look padded/boxed-in. (Established on Inclusion Panel's Panel Setup member rows.)

**Panel list** (`.panel-list`)
`list-style: none; margin: 0 -20px` — negative margin bleeds to the `panel-card`'s padding so the hover/chosen background spans edge-to-edge. Each `li`: `padding: 12px 20px`.

**Agenda table** (`.agenda-table`)
`border-collapse: collapse; border: 1px solid var(--border-color); border-top: none; border-radius: 0 0 var(--radius-md) var(--radius-md)`. Section heading sits above as a separate element, creating the visual "table with a header block" appearance. `<th>`: `--font-sm`, `--text-secondary`, `--bg-surface-alt`. `<td>`: `--font-base`, `padding: 12px 16px`.

**Student / person thumbnail** (`.entity-thumb`, `.panel-thumb`)
`width: 42px; height: 56px` — portrait-ID ratio (3:4). `border-radius: var(--radius-sm); background: var(--bg-surface-alt); border: 1px solid var(--border-color)`. Placeholder SVG is `70%` width/height, `color: var(--text-faint)`. Discussion profile version is `56×72px`.

**Member result list** (`.member-result-list`, `.referral-student-results`)
Scrollable bounded list (`max-height: min(65vh, 480px); border: 1px solid; border-radius: var(--radius-md)`). Each option: full-width button, `padding: 8px 12px`, divided by `border-bottom`. Hover: `--row-hover-bg`. Selected: `--primary-light`.

**Empty state** (`.empty-note`)
`color: var(--text-muted); text-align: center; padding: 40px 0; font-size: var(--font-xl)`. Centred in its container, not left-aligned.

---

## Form control patterns

**Editable field background** (`--bg-surface-alt`)
Any control the user can type into or pick a value from — plain `.field-group`/`.filter-field` input or select, `.ui-fused-field`'s boxed control, `.ui-select-trigger`, and Search (`.app-search-input`) — fills with `var(--bg-surface-alt)` rather than the plain `var(--bg-surface)` used for cards/page background. This is a deliberate, if previously unwritten, signal: a subtly tinted fill reads as "you can act on this" the moment it renders, before any hover/focus interaction proves it. `--bg-surface` is reserved for things that merely *display* content (cards, panels, read-only rows) — using it on an editable control makes that control read as inert/decorative until someone happens to click it, which is exactly the bug Search had (it shared `--bg-surface` with plain page/card backgrounds instead of this token, so it looked flatter and less "clickable" than every field beside it). When adding a new editable control, default to `--bg-surface-alt` unless there's a specific reason to deviate — don't reach for `--bg-surface` on anything the user is meant to interact with.

**Single-line control height matches button height.** Any single-line text/select control — plain `.field-group`/`.filter-field` input or select, `.ui-select-trigger`, `.ui-fused-field`'s boxed control — uses `padding: var(--space-xs) var(--space-sm)` (vertical `--space-xs`, the same as `.btn`'s own vertical padding) rather than the more generous `--space-sm` vertical padding a field might default to. A field that renders taller than the buttons sitting beside or below it (e.g. a Group Name field above a Cancel/Save row) reads as an inconsistency, not a deliberate size choice — the height difference has no signal value. Doesn't apply to `<textarea>` or anything else inherently multi-line.

**Fused vs. plain, and Left vs. Upper fused.** Default to a fused field (`.ui-fused-field`, boxed label+control) over a plain `.field-group` (label above, unboxed) whenever a field has room for it — the boxed look reads as more deliberate and lines up with the rest of the app's controls. Within fused fields, pick the orientation by available width:
- **Left Fused** (label beside the control, one line, the `.ui-fused-field` default) — use whenever there's enough horizontal room for the label without truncating or cramping the control's own value. Its value follows the normal "Text alignment" rule below (left for names/descriptions, centre only for the short-enum exception).
- **Upper Fused** (label above the control, boxed, `.ui-fused-field--stacked`) — use where fields sit in a narrow multi-column row and a side-by-side label would eat too much of the control's width. Its value is **always centred, regardless of content type** — even a person's name (e.g. Panel Setup's stacked Chair field) — to match its already-centred label above it; this is a deliberate exception to "Text alignment" below, since the compact card shape reads as one balanced unit rather than a row with room to breathe. `.ui-fused-field--stacked .ui-select-trigger`'s override lives in `components/forms.css` beside the rest of the stacked layout rules.

**Exception: filter bars (`.filter-field`) are never fused.** The active-filter highlight (`.filter-field--active`) fills the *entire* label+control wrapper with `--primary-light` as a "chip" so an active filter pops against inactive ones in the same bar — see "Active field highlight" above. Wrapping every field in its own permanent border first (the fused look) would blunt that contrast, since active and inactive fields would already look boxed the same way. This is a deliberate carve-out, not an oversight — don't convert filter bars to `.ui-fused-field`/`.ui-fused-field--stacked` even though they're visually a stacked label-above-control layout like Upper Fused.

**Search** (`.app-search` → `.app-search-field` wrapping `.app-search-icon` + `.app-search-input`, plus a sibling `.app-search-results`)
The one shared search-box component, used identically for the Global Rail's app search, the homepage hero search, the staff-switcher overlay, Panel's search modal, and picker search fields (Add Member, referral-student picker) — this entry covers its visual chrome only. The behavioural rules every one of these boxes also shares (hidden until typed, server-fetch, debounce/token matching, when to group results) are documented in [InteractionLanguage.md](InteractionLanguage.md)'s own "Search" entry, not repeated here. Primary is reserved for the box actually holding a value, not for hover or plain focus — a search box announcing "I'm interactive" (hover) shouldn't look the same as one announcing "I'm filtering something" (has text):
- **Idle**: `1px solid var(--border-color)` border, `var(--bg-surface)` fill, `var(--radius-sm)`. Icon `var(--text-faint)`.
- **Hover**: border only, `var(--text-faint)`. No fill change. (Started as `var(--border-strong)`, which sits too close to `--border-color` to read as a state change — `--text-faint` gives an actually-visible jump.)
- **Focus-visible**: sets `border-color: var(--primary)` — the *same* property has-text uses, not a separately-coloured ring — plus an **inset** `box-shadow: inset 0 0 0 1px var(--primary)` on top of it. A plain a11y affordance, kept unconditional regardless of the states below (plain mouse `:focus` gets no ring at all, see the comment in `components/navigation.css`). Being the same colour and inset (not an offset `outline`) means a focused+has-text box reads as one thicker edge rather than two concentric rings — an earlier version used an offset outline here, which produced a visible "double border" whenever focus and has-text coincided, and could get clipped by a zero-padding scroll container (e.g. `dialog.modal-dialog .modal-body`) since it protruded past the box.
- **Has text** (`:not(:placeholder-shown)`): border and icon both go `var(--primary)`. This **outranks hover** — a filled box stays primary even while the pointer is over it, rather than flickering back to a neutral hover border.
- Background never changes across any state; only the border, ring, and icon move.

Selectors are scoped `.app-search-field .app-search-input` (not a bare `.app-search-input` class) so this wins on specificity over `.field-group input`'s generic border/padding (`components/forms.css`) whenever a Search field is nested inside a `.field-group` (e.g. the referral-student-picker) — a single-class selector would otherwise lose to `.field-group`'s two-selector one and silently drop the icon's left padding and the state borders above.

**Segmented control** (`.ui-segmented` wrapping `.ui-segmented-option` buttons)
For any control with **3 or fewer static options** — always show every option as its own button in one shared bordered box, never hide them behind a `<select>`. A hidden dropdown costs an extra click to even see what the choices are; for a small fixed set that cost buys nothing. (Options that are dynamic/data-driven, or exceed 3, stay a `<select>` — this is specifically about small, fixed, always-the-same option sets.)
- One bordered box: `border: 1px solid var(--border-color); border-radius: var(--radius-sm)`, options divided by `border-right: 1px solid var(--border-color)` rather than a gap between separate boxes.
- Inactive option: `var(--bg-well)` fill (the same tone `.ui-fused-field-label` uses, so segmented controls read as part of the same label/control family as fused fields), `var(--text-secondary)` text.
- Active option: `background: var(--primary-light); color: var(--primary); font-weight: 600` — the same "filled with primary-light = this is the active choice" vocabulary as `.filter-field--active` and Search's has-text state, so all three read as one consistent signal across the app.
- Not yet retrofitted onto any qualifying `<select>` in the app — treat this as the convention for new work, not a signal that every existing 2-3-option select needs an immediate audit.
- Applied to the member-picker's staff-source control (`<School> Staff` / `All MAT Staff` / `External`, `hubs/inclusion/panel/templates/hubs/inclusion/panel/_member_picker.html`), stacked full width above its Search box rather than beside it — the option text is long enough that sharing a row left Search cramped into whatever width was left over. Here specifically, the segmented row and Search box are also **visually fused into one component** (`.member-picker-controls`, `panel.css`): one shared outer border/corner radius, no radius seam between the two rows, a single divider line where they meet. This is an exception to the segmented control's own usual standalone bordered box — do it only when a segmented control is functioning as a search filter's mode switch immediately above that same search box, not as a general pattern for every segmented control that happens to sit near another field.
- **Fusing a segmented control into another component (rare)**: strip the segmented control's own outer border/radius (keep its internal `border-right` option dividers) and add a `border-bottom` in their place; strip the neighbouring field's own border/radius entirely; let the shared wrapper own one outer `border`/`border-radius`/`overflow: hidden`, and move that neighbouring field's own focus/has-text border-color signal onto the wrapper (`:has()`) instead, since the field itself no longer has a border to change colour.

**Fused field** (`.ui-fused-field`, e.g. Panel Setup's School/Panel Group/Date/Time/Chair fields)
A `<label>` + `<select>`/`<input>` + optional trailing button, sharing one bordered box (`components/forms.css`) rather than reading as separate controls — this is the pattern behind the *inset label* look (not a Material-style floating label, which animates from inside the field on focus; a fused label is permanently visible, closer to Bootstrap's "input group" or Stripe's "field group"). One or more fused fields sit inside a `.ui-fused-field-group`, which auto-aligns every field's label column via CSS subgrid.

- **Label always centres over the control's own value, not the row's full width.** When a field has a trailing button (Panel Group's "+", Date's calendar button, Time's clock button — all a fixed 38px), the button eats into the row without the label knowing, so the label needs matching `padding-right` to stay lined up with the value instead of drifting to centre over button-included space it doesn't actually occupy.
- **Trailing buttons are always real fused segments, never overlaid.** The calendar/time-picker/"+" buttons sit flush against the control, sharing the box's border (`border-left` only, no radius of their own) and taking real layout width — not `position: absolute`-ed over the control to save space. An overlaid button reads as a floating afterthought; a fused one reads as part of the same control.
- **A trailing "+" button keeps its semantic colour** (`btn-add`, green) even though it's a small icon — colour signals "this creates a new record" everywhere else in the app (see Button patterns below), and a `.ui-add-group-btn`-sized icon is no exception. Solve "doesn't look like a real button" with border/shape (the point above), not by stripping colour down to `btn-secondary`.
- **Multi-segment fields stay directly editable — no display-only fallback.** Date (Day/Month/Year) and Time (Hour/Minute/AM-PM) always show their live mini-dropdowns, in every layout (beside the label or stacked above it) — never collapsed down to a single read-only "11/07/2026" text button that requires opening a popover just to change one segment. The calendar/clock icon button beside them stays as a *supplementary* quick-picker (a full calendar grid; a spinner-style time picker, see below) for jumping to a value fast, not as the only way in.
- **A plain text `<input>` fuses the same way a `<select>` does.** The pattern isn't select-only — Panel Group's inline "Create Panel Group" form (see "Inline creation swap" below) fuses its Name field the same as School beside it, via a small border/background reset (`components/forms.css`) mirroring `.ui-select-trigger`'s equivalent reset. A fused field's control can be any of `.ui-select`/`.ui-date`/`.ui-time`/a raw text `<input>`, not just the enhanced controls.
- **Stacked fused fields in the same visual block share one `.ui-fused-field-group`, never one group per field.** Even when each field is its own `<form>` (e.g. Edit Panel Group's Name and Default Chair, each autosaved independently), wrap the `<form>`s in a single shared `.ui-fused-field-group` ancestor rather than giving each `<form>` that class itself — a `.ui-fused-field-group form { display: contents }` rule flattens any nested `<form>` so its fields land directly in the shared subgrid regardless of depth. One group per field defeats the subgrid: each label column then auto-sizes only to its own field's text ("Panel Group Name" vs. "Default Chair" render two different widths), which reads as sloppy rather than deliberate when the fields sit stacked right on top of each other. Only start a *new* group where the block is genuinely visually separated (a divider, a tab row, a different repeating list) — e.g. a member row's own "Expertise" field doesn't need to align with the header above it, but every "Expertise" field across the repeating member rows already matches for free since they're identical text at the same font size, independent of grouping.

**Text alignment.** Applies to any value display — a text `<input>`, an enhanced `<select>`'s closed trigger and popover options, a read-only field, a table/list cell:
- **Left** (the default) — text inputs, search boxes, read-only text fields, and dropdowns whose options are names (staff, Panel Group, School) or descriptions/categories (Expertise, ActionCategory, follow-up interval, "Year 7"-style labels, colour names). `.ui-select-trigger`/`.ui-option` (`components/forms.css`) default to `text-align: left` for exactly this reason — most selects in the app hold one of these.
- **Centre** — very short status/enum values (High/Medium/Low, Y/N, single-letter codes), bare numbers in a fixed-width column, badges/chips, icons. Opt in with the `.ui-select--center` modifier class on the source `<select>` — `enhanceSelect()` (`static/js/main.js`) mirrors a select's own classes onto both its trigger and its popover panel, so one class reaches both the closed value and the open option list (e.g. Actions/Referrals' Status filters, Priority, Gender/SEN Code/Pupil Premium/More Able filters, a bare numeric Year filter). `.ui-select--sm` (the Day/Month/Year and Hour/Minute mini-dropdowns) is centred inherently, no modifier needed — it's always a number. `.status-pill` is centred inherently too — badges read as a unit, not left-to-right text.
- **Right** — currency, percentages, and other numerical measures where magnitude comparison matters (e.g. `.breakdown-row-need-value` in `components/cards.css`, a count/percentage column).
- **Judgment calls worth knowing**: a value being short isn't enough on its own to centre it — "Year 7", "1 Week", a reg-group code, or a colour name are still descriptive *phrases*, not enums, and stay left. Only bare enums, bare numbers, or single letters/codes cross into the centred bucket. When genuinely unsure, err left — it's the default every other text value in the app already uses.
- See "Fused vs. plain, and Left vs. Upper fused" above for the one structural exception (Upper Fused always centres its value, whatever the content).

**Inline creation swap** (e.g. Panel Group's "+" opening "Create Panel Group" inside Edit Panel Settings / Create Panel Meeting, `openInlinePanelGroupCreate` in `hubs/inclusion/panel/static/js/panel.js`)
When a "+" trigger's quick-add flow is swapped into the *same* modal it was clicked from, rather than stacking a second modal on top or opening a heavyweight standalone dialog (see [InteractionLanguage.md](InteractionLanguage.md) anti-pattern #5 for when this applies vs. when a small stacked dialog is still fine):
- **The host modal's own `<h2>` takes over as the heading, not an injected sub-heading.** Swap its text (e.g. "Edit Panel Settings" → "Create Panel Group") for the duration of the inline form, restoring the original title on cancel/complete — don't add a second `<h3>` inside the body; one dialog only needs one heading at a time.
- **The header's `×` keeps its normal meaning: close the whole dialog.** It does not "back out" to the host form's own fields — that's what the inline form's own Cancel button is for. Every modal's `×` means the same thing everywhere; don't special-case it for a sub-view.
- **The swapped-in fields and its Cancel/Create buttons get separate rows** — a `.ui-fused-field-group` for the fields, then a `.btn-row` below for the actions — never packed into one shared flex row together (contrast the standalone dialog's own denser `.panel-group-modal-sticky-row`, which is a deliberately more compact treatment for a dialog that has nothing else sharing the screen with it).
- **The content swap animates via height, not a snap.** See InteractionLanguage.md's "Modal content swap (height transition)".

**Dropdown/select popover** (`.ui-popover`, `.ui-option`)
A floating `<dialog>`, not a plain positioned `<div>` — detached from its trigger by a small `4px` gap, fully rounded (`radius-md`), with its own elevation shadow. This is deliberate, not an oversight: it matches the dominant modern pattern (Material 3, Radix UI/shadcn, macOS/iOS) rather than the flush/square-cornered look of older native combo-boxes. Don't square the corners or remove the gap to make a popover read as "attached" to its trigger — that reads as dated, not modern, and nothing about this pattern has been flagged as a problem in practice. Every popover — including the calendar grid and the time-spinner below, not just plain option lists — anchors to the icon button that opened it (not the whole fused field) with this same small gap, so all three read as one consistent family. Selected-row styling is a fill-only variant of the sitewide `.chosen` convention: `background: var(--primary-light)` + bold text, deliberately **without** the left `--accent-border` bar `.chosen` rows elsewhere use — a popover option is already corner-clipped to the popover's own radius, where a left bar reads oddly against the clipped edge. See [InteractionLanguage.md](InteractionLanguage.md)'s anti-pattern #1.

**Time picker popover** (`.ui-time-popover`, the clock-icon quick-picker)
A spinner, not an option list: "Enter time" header, big Hour:Minute digit boxes stepped by up/down arrows or typed directly, an AM/PM toggle in 12h mode, Now/Clear footer actions. It's shaped differently from `.ui-option` rows because it isn't an option list — there's no discrete, browsable set of times the way there's a browsable set of Panel Groups or days-in-a-month, so a spinner is the honest shape for "dial in one arbitrary value" — but it keeps the same gapped positioning and rounded shell as every other popover (see above); it's a different *content* shape, not a different *frame*. The calendar grid popover shares the same footer pattern (`.ui-popover-footer`/`.ui-popover-footer-link`) for its own "Today" shortcut. Closing it: a header `×` closes it explicitly (don't rely on backdrop-click alone being discoverable), and closing whatever modal it was opened from must also close it — see `main.js`'s `close`-event listener on `document` (capture phase, since `.ui-popover` dialogs are appended to `document.body` as siblings of their opening modal, not descendants, so a parent modal's own `close()` doesn't cascade to them for free).

---

## Interaction patterns

See [InteractionLanguage.md](InteractionLanguage.md) for hover/focus/selected states, transitions, and animation rules.

---

## Button patterns

All buttons use the shared `btn` class from `style.css`. Variants are single modifiers:

| Class | Meaning |
|---|---|
| `btn-primary` | Primary / submit action (filled, accent) |
| `btn-secondary` | Secondary-tier action, one step down from Primary (accent-tinted; tracks the user's chosen `--primary`, not a fixed semantic colour) — **also** doubles as a modifier on `btn-add`/`btn-edit`/`btn-delete`/below, meaning "muted variant of that trio", when combined rather than used bare |
| `btn-tertiary` | Tertiary-tier action — outline variant of Secondary |
| `btn-add` | Create / add action (uses `--btn-add-*` semantic tokens) |
| `btn-edit` | Edit action (uses `--btn-edit-*`) |
| `btn-delete` | Destructive action (uses `--btn-delete-*`) |
| `btn-success` | Positive completion (green fill) |
| `btn-sm` | Compact size — used in list rows, modals, filter bars |
| `btn-icon-only` | Square icon button, `padding: 0 14px; height: 41px` |

**Default icons**: `btn-add`/`btn-edit`/`btn-delete` now render a default icon automatically (plus/pencil/trash, via a masked `::before` in `buttons.css` so it recolours with the button's own text colour). Add `btn-no-icon` to an instance to suppress it — use this where the label doesn't match the class's literal meaning (e.g. a "Save" button styled `btn-edit`).

**Custom icon inside a button**: `<span class="btn-icon">{% include 'icons/X_svg.html' %}</span>` before the label text — only needed when overriding with an icon *other than* the class's default (e.g. the checkmark on `btn-success`, or `play_svg` on a `btn-add` "Discuss" button). A manual `.btn-icon` automatically suppresses the class default, so nothing doubles up.

**Button group** (`.btn-row`): `display: flex; gap: 8px`. Use `flex-wrap: wrap` when overflow is possible. Stacked variant (`.btn-row-stacked`): `flex-direction: column; align-items: stretch` — each button and its wrapping `<form>` is `width: 100%`.

**Chair / toggle button** (`.member-row-chair-btn.is-chair`): `background: var(--primary-light); border-color: var(--primary); color: var(--primary); font-weight: 600`.

**"+" icon button** beside a select (`.ui-add-group-btn`, `.btn-icon-only`): `width: 38px; height: 38px; flex-shrink: 0` — sized to match the select's rendered height.

Never place a "Create new X" option inside a `<select>` or custom dropdown list. Use a `+` icon-button beside the select or a standalone `btn-add` below it.

**Page header actions** (`.key-actions`): app-wide actions (Search, Referral — available on every panel page) and a page's own primary action (e.g. Panel Meetings' "New Panel Meeting") sit in **separate stacked rows** (`.key-actions-row`), not one flat row — `flex-direction: column; align-items: flex-end` on the container, each row its own `display: flex; flex-wrap: wrap` line. This reinforces the intended hierarchy: a page's own action should read as the more prominent one (typically a bare `btn-add`), app-wide actions stay visually muted (plain `btn`/`btn-secondary`) beneath it, rather than all of them competing for attention on one line.

---

## Pill / badge patterns

**Status pill** (`.status-pill`)
`font-size: var(--font-xs); font-weight: 600; padding: var(--space-xxs) 10px; border-radius: var(--radius-pill); display: inline-block`. Base rule lives in the shared `pills.css`; page/hub-specific modifier classes (`.open`, `.complete`, etc.) live in that hub's own CSS (e.g. `panel.css`) but must still reference the shared `--color-*` tokens below — never a hardcoded hex or a one-off var.

**Shared semantic pill classes** (`pills.css` — theme-aware, prefer these over inventing a hub-specific modifier when the meaning is generic):

| Class | Semantic | Colours |
|---|---|---|
| `.pill-positive` | Done / good | `--color-positive-bg` / `--color-positive` |
| `.pill-caution` | Mild attention | `--color-caution-bg` / `--color-caution` |
| `.pill-warning` | Needs attention | `--color-warning-bg` / `--color-warning` |
| `.pill-negative` | Critical / bad | `--color-negative-bg` / `--color-negative` |
| `.pill-exceeding` | Above target / standout positive | `--color-exceeding-bg` / `--color-exceeding` |
| `.pill-purple`, `.pill-blue` | Named-hue classification (not a signal level) | `--color-{hue}-bg` / `--color-{hue}` |

Panel's own status pill modifiers (`.open`, `.discussing`, `.in_panel`, etc.), its meeting-card status line, and the next-panel heading are documented in [hubs/inclusion/panel/DesignLanguage.md](hubs/inclusion/panel/DesignLanguage.md) — they're Panel-specific implementation detail on top of these shared classes.

**Priority chip** (`.priority-chip`): `--font-xs`, weight 600, `padding: 4px 10px; border-radius: var(--radius-pill)`. Default (inactive): border-only, `--bg-surface`, `--text-secondary`. Active: filled with `--priority-{level}-bg`, coloured border and text. Tokens come from `theme/light.css` and `theme/themes.css` (`--priority-high/medium/low-bg/border/text`).

**Priority badge** (`.priority-badge`): `--font-2xs`, uppercase, `letter-spacing: 0.02em`, `padding: 3px 8px; border-radius: var(--radius-xs)`. Read-only display of priority. High = `--color-negative-bg/--color-negative`; Medium = `--badge-bg/--text-secondary`; Low = `--bg-surface-alt/--text-faint`.

---

## Naming conventions

**BEM-lite**: `block-element` with `--modifier` for variants. One level of element nesting maximum:
- ✓ `.panel-card`, `.panel-card-header`, `.panel-card-count`
- ✓ `.stat-card--accent-primary`
- ✗ `.panel-card__header__title` (too deep)

**Layout containers**: `*-columns`, `*-col`, `*-card`, `*-shell`, `*-layout`
**List wrappers**: `*-list`, `entity-list`, `panel-list`
**Row items**: `entity-row`, `.panel-list li`, `settings-row`, `meeting-card`
**Row sub-elements**: `-body`, `-title`, `-meta`, `-note`, `-thumb`, `-actions`, `-update` — always prefixed with the block name
**Toolbar / action strip**: `panel-toolbar`, `btn-row`, `panel-item-actions`
**Utility modifiers**: `--sm`, `--stacked`, `--compact`, `--accent-*`

**Template partials** start with `_` (`_base.html`, `_member_picker.html`). Full pages do not.

**data-* attributes**: kebab-case, describing the JS hook (`data-referral-tab`, `data-edit-referral-trigger`, `data-selectable`, `data-card-target`). The attribute name is the hook; its value is the variant or target ID.

---

## Anti-patterns

Each entry states what to avoid and why it breaks something.

### CSS / styling

1. **Don't hardcode colours** (`color: #6d28d9`, `background: #f0fdf4`). Use `var(--primary)`, `var(--color-positive-bg)`, etc. Hardcoded values break theme mode switching, theme switching, and school accent overrides.

2. **Don't hardcode border-radius values** (`border-radius: 8px`). Use the token scale (`var(--radius-md)`). Hardcoded radii drift silently when the scale is adjusted.

3. **Don't use a semantic colour for decoration**. Don't colour an icon or label `--color-warning` unless the user must act on a real warning. Overuse destroys the signal value — users stop noticing warnings.

4. **Don't use bare element selectors for scoped styles** (e.g. `h2 { … }` in panel.css). Always scope to a parent class (`.panel-card h2`). Bare element rules bleed across every instance of that element on the page.

### HTML / template structure

5. **Don't skip heading levels**. A page has one `<h1>` (page title), cards use `<h2>`, sections inside cards use `<h3>`. Jumping from `<h1>` to `<h3>` breaks screen-reader navigation and the visual rhythm.

6. **Don't left-align `<h2>` headings inside `.setup-col`, `.discussion-col`, or `.panel-card`**. These columns are centre-aligned by design. Left-aligned headings look like an oversight.

7. **Don't put an "Add new…" option inside a `<select>` or custom dropdown**. Use a `+` icon-button beside the select (`.ui-add-group-btn`) or a standalone `btn-add` below the list. A dropdown option that triggers a modal rather than selecting a value confuses the interaction model.

8. **Don't use `display: none` to hide elements that JS toggles**. Use the `hidden` attribute. The codebase's JS consistently toggles `hidden`; mixing in `display: none` breaks those assumptions.

9. **Don't place a bare SVG directly inside a button**. Wrap it in `<span class="btn-icon">{% include 'icons/X_svg.html' %}</span>`. A bare SVG skips the spacing rules that `.btn-icon` provides between icon and label text.

### Layout decisions

10. **Don't use CSS grid with fixed pixel column widths**. The pattern is `flex: 1 1 Xpx; min-width: Ypx` on children, or `repeat(auto-fit, minmax(280px, 1fr))` for equal-width grids. Fixed pixel columns break at unexpected viewport widths.

11. **Don't add `margin-bottom` to the last card in a flex container**. Spacing between cards comes entirely from `gap` on the parent. A trailing margin creates uneven space at the container's bottom.

12. **Don't add `margin-bottom` between list rows**. Row separation is `border-bottom: 1px solid var(--border-color)` on each row. Margins inside a list break the edge-to-edge bleed (negative-margin) pattern used by `.panel-list`.

13. **Don't use `.list-page-shell` on a page that doesn't need internal scrolling**. The shell assumes fixed viewport height and pins a stats footer at the bottom. On a short or variable-height page it produces excess whitespace or a misplaced footer.

14. **Don't go deeper than the defined depth stack**. The layers are: `--bg-surface` → `--bg-nested` → `--bg-well`. Nesting `--bg-nested` inside `--bg-nested`, or `--bg-well` inside `--bg-well`, produces backgrounds that are indistinguishable in light mode and invisible in dark mode. If you feel you need a fourth depth level, the component needs redesigning.

15. **Inside `.list-page-shell`, give every direct child of a card `min-height: 0`, not just the scrolling list.** Flex items default to `min-height: auto`, which floors them at their content's min-content size. A card's non-scrolling children (empty-state text, preview blocks) can silently refuse to shrink and reintroduce the "invisible overflow scrollbar" bug this shell exists to prevent — even though the scrolling list itself is fine.

16. **Don't let vertical spacing between stacked rows use a different scale than the horizontal gap between cards in a row.** If a page has both (e.g. `.panel-columns` rows spaced apart vertically, cards spaced apart horizontally within each row), use the same `gap` value for both. Mixing `--space-md` row spacing with `--space-xl` card spacing (or vice versa) reads as accidental, not deliberate rhythm.

17. **Don't pack a `.tab-row` into the same row as a button or other control.** See "Tab row" under Navigation patterns above. Give the other control its own row instead — a dedicated header row above the tabs, or a footer row below the tabbed content.

See [InteractionLanguage.md](InteractionLanguage.md) for interaction-specific anti-patterns (selected-state colours, hover transforms, focus-visible outlines).
