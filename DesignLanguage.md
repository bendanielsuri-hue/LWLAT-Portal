# Portal Design Language

Extracted from the Inclusion Panel and SEND & Provision hub — the most complete, stable UI in the codebase. Apply these rules to all future hub pages.

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
7. **Field label** (`<label>`, `--font-sm`, weight 600, `--text-secondary`) — always sits above its control; never inline.
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

**Card-internal scroll with a fixed header** (`.setup-col`)
A card whose list can grow long (Panel Setup's Panel Details/Members, Panel Selection, Panel Agenda) is `display: flex; flex-direction: column; overflow: hidden` with two children: a plain, non-scrolling `.setup-col-header` (the card's `<h2>`) and a `.setup-col-body` (`flex: 1 1 auto; min-height: 0; overflow-y: auto`) holding everything else. The H2 lives structurally outside the scroll area rather than merely `position: sticky` inside it — scrolled content can then never visually collide with it at the top of the scroll. A sub-section heading inside the body (e.g. "Panel Members", "New Referrals") can still use `position: sticky; top: 0`, scoped to `.setup-col-body .setup-col-header` — safe because the body is its one true scrolling ancestor, no page-header offset to account for. `.setup-col-body` bleeds out via `margin: 0 calc(-1 * var(--space-lg)); padding: 0 var(--space-lg)` so its scrollbar sits flush against the card's right edge instead of inset by the card's own padding — same technique as `.panel-list`'s edge-to-edge bleed (see Row items below).

**Agenda grid** (`.agenda-layout`)
```css
display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px;
```
Equal-width columns, auto-fills the row. Used when there are 3+ equal-weight sections.

**Filter bar** (`.filter-bar` + `.filter-field`)
A row of labelled controls. Each `.filter-field` contains a `<label>` (centred over its control via `.filter-field label { text-align: center }`) + one `<input>` or `<select>`. Two flavours, chosen by whether the underlying data needs a server round-trip:

- **Client-side row filter** (Students/Referrals/Actions list pages) — plain `<div class="filter-bar">` (no `<form>`), fields have no `name`; JS filters/hides `.entity-row`s in place via `data-*` attributes on each row. No page reload. Always precedes `.entity-list` or `.list-card`. A `filter-bar-clear` button is the last item.
- **Server-side dashboard filter** (default for any dashboard whose stats/charts/KPIs are computed server-side, e.g. `hubs/inclusion/templates/hubs/inclusion/hub.html`) — `<form method="get" class="filter-bar">` in `{% block page_filters %}` (see the sticky page-filter pattern below), and the view recomputes everything from `request.GET`. Use this — not the client-side flavour — whenever the numbers on the page (not just which rows are visible) must reflect the filter. This is progressive enhancement over two layers:
  - **Baseline**: no `onchange` on the `<select>`s at all — a plain GET form, submitted (however the browser would trigger it) reaches the fully server-rendered page with the correct filtered state, `active_filter_count`, and `filter-field--active` highlighting. This is also the fetch-failure fallback for the layer below, so it must keep working standalone.
  - **AJAX enhancement (default for new dashboards of this kind)**: add `data-ajax-target="<selector>"` to the `<form>`, pointing at a wrapper around just the filter-dependent markup (e.g. `#dashboard-filtered-content`). `static/js/main.js`'s `setupAjaxFilterBars()` then owns `change`/`.filter-bar-clear` clicks entirely — `fetch()`s the same URL with `X-Requested-With: XMLHttpRequest` (the existing AJAX convention from `hubs/inclusion/panel/views.py`'s modal endpoints), swaps the target's `innerHTML`, and `history.replaceState`s the querystring — no full navigation, no scroll jump. **Never include the `<form>` itself, any `<dialog>`, or anything with its own one-time JS wiring (carousels, etc.) inside the swapped target** — see `hub.html`'s comment above `#dashboard-filtered-content` for the two concrete bugs this avoids (a JS-captured element reference going stale, and losing a carousel's event listeners). Since the target swap never touches the filter bar, anything that filter bar itself needs to reflect (the count badge, active highlighting, cascading option lists) has to be re-derived client-side — see below — not re-rendered by the server response.

**Sticky page-filter bar**: `templates/layout.html` wraps `.page-header` in a `.sticky-header-zone` div with `{% block page_filters %}` immediately after it, inside the same sticky container — override that block (not `{% block content %}`) so the filter bar scrolls together with the page header instead of two independent `position: sticky; top: 0` siblings overlapping. Precede the `<form>` with `<div class="sticky-zone-sentinel"></div>` so `main.js`'s `setupStickyZoneSentinels()` can toggle `.is-stuck` (stronger shadow/border, tighter padding) once the bar is actually pinned.

**Active-filter count badge** (`.filter-bar-label` + `.filter-bar-count`): every filter bar, both flavours, starts with `<span class="filter-bar-label">Filters <span class="filter-bar-count filter-bar-count--empty">0</span></span>` as its first child — always render the count span itself — and toggle the `filter-bar-count--empty` class (`visibility: hidden`) when the count is 0. Conditionally *including* the element changes `.filter-bar-label`'s width and shoves every field after it sideways each time the count changes. The server's `active_filter_count` only ever backs the *first paint* now (baseline/no-JS/fetch-failure page load) — once JS is driving (either flavour, AJAX-enhanced or fully client-side), `wireFilterBarActiveState()` below is what keeps it in sync, since an AJAX dashboard's swapped target deliberately excludes the filter bar itself (see above), so the server never gets a chance to re-render this badge again after the first load.

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
border: 1px solid var(--border-color);
border-radius: var(--radius-xl);
padding: 20px;
box-shadow: var(--shadow-md);  /* or var(--card-shadow) */
```

**List container card** (`.list-card`)
Same border/radius/surface as above but `display: flex; flex-direction: column` so it can host a scrollable list body.

**Meeting card** (`.meeting-card`)
Uses `--bg-nested` (one level deeper than surface), `border-radius: var(--radius-lg)` (one step smaller than container), `box-shadow: var(--shadow-sm)`. Hover/chosen: see "Hover and chosen on a selectable card" below — unlike row/list selectables, this one stays off `--primary`/`--accent-border` entirely.

The "Next Panel" heading (`.next-panel-label`, see below), when present, is a full-width banner directly inside `.meeting-card` — deliberately *outside* the column row (`.meeting-card-row`) below it, so it adds height above the row without ever affecting that row's own height, its vertical centring, or its divider lines. Whether or not a given card is flagged "next", every `.meeting-card-row` looks identical in cross-section.

Within `.meeting-card-row` (`display: flex; align-items: center`): fixed-width columns for the parts whose content length shouldn't reflow the rest of the row, flexible columns for the parts that should soak up whatever space is left. An optional slim logo column (`.meeting-card-logo`, `width: 32px`, only rendered in aggregate/all-schools views) sits to the left of everything else — icon only, no school name text. Main column (`.meeting-card-main`, fixed `flex: 0 0 300px` so every card's columns start at the same x position down the list regardless of panel name length): just the `<h3>` panel name and, below it, the date/time (`.meeting-date-line`, plain secondary text, no label). Two further `.meeting-card-info` columns (`flex: 1 1 0` — grow to fill whatever space remains between the fixed name column and the pinned action column): the first holds the status line (`.meeting-status-line`, no "Status:" text label — the pill speaks for itself — with any secondary pills like `.in_panel` "Today" or `.danger` "Needs referrals"/"No Panel Members" following at the same normal gap) above the referral count; the second holds Chair above the member count. Wording differs by what reads more naturally: Chair keeps a `Label value` row, label right-aligned in a `flex: 0 0 68px` sub-column with `::after { content: ":" }` so the colons line up down the list; referral/member counts lead with the number instead ("3 Referrals", "3 Panel Members") since that's clearer than "Referrals: 3" — no label prefix, just plain count-first text. Every column after the first gets a divider line (`.meeting-card-col:not(:first-child) { border-left: 1px solid var(--border-color); padding-left: var(--space-lg); }`). The action column (`.meeting-card-actions`) is pinned to the row's far edge with `margin-left: auto` and never changes size — it also carries `min-width: 320px; justify-content: flex-end` so a 1-button row (e.g. just "View Details" on a completed panel) reserves the same width as the up-to-3-button row (Start/Continue Panel, Edit, Delete) and right-aligns within it, rather than the whole row shifting depending on how many buttons happen to render.

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

---

## Navigation patterns

**Tab row** (`.tab-row`)
- Underline indicator only — no background fill on tabs themselves.
- Indicator: `position: absolute; bottom: -1px; height: 2px; border-radius: 2px`.
- Animated in via `transform: scaleX(0) → scaleX(1)` (`--transition-pop`) and `opacity: 0 → 1`.
- Hover: indicator is `--text-faint`, text becomes `--text-primary`.
- Active: indicator is `--primary`, text is `--primary`.
- The `.tab-row` itself bleeds left via `margin-left: -16px` (matching the list-card's own padding) so tab text aligns with list content.
- Panel Home cards use `flex-wrap: nowrap; overflow: hidden` — tab overflow is handled by JS (`.tab-row-more` dropdown in `style.css`).
- **Status-filter tab rows** (e.g. Panel Home's My Actions card, Panel Meetings' All/Draft/Ready/Live/Delayed/Completed): every tab carries its live count in parentheses, e.g. `Draft (3)`. An `All (N)` tab is always rendered — it's the default active tab and never hides. Every other tab is wrapped in `{% if count %}` and simply isn't rendered when its count is 0, rather than rendering a disabled/greyed-out tab — a status with nothing in it shouldn't take up tab-row space at all. Filtering itself is plain JS matching a `data-status`/`data-*-tab` attribute on each row/card against the clicked tab's `data-*-tab` value (see `setupTabs()` in `home.html` and the inline script in `meetings.html`) — no server round-trip.

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

## Interaction patterns

**Hover on a selectable row**
`background: var(--row-hover-bg)` (= `color-mix(in srgb, var(--text-primary) 6%, var(--bg-surface))`) + title weight bumps to 700. Apply via `.selectable:hover` or explicit `.panel-list li:hover` / `tbody tr:hover`.

**Chosen / selected state on a row** (persistent after click)
`background: var(--primary-light); box-shadow: inset 3px 0 0 var(--accent-border)` + title weight 700. Hover on a chosen row keeps `--primary-light` — does not revert to `--row-hover-bg`. Applied via `.chosen` on `entity-row`, `panel-list li`, `agenda-table tbody tr`.

**Hover and chosen on a selectable card** (`.meeting-card`, and any future card-shaped — as opposed to row-shaped — selectable)
Cards stay off `--primary`/`--accent-border` entirely; the accent colour reads as too strong at card scale, where the whole tile (not a thin row) carries the fill. Both states share one background token so a selected card already reads as "hover-lit":
- Hover: `border-color: var(--border-strong); box-shadow: var(--shadow-sm), inset 0 0 0 1px var(--border-strong); background: var(--meeting-card-hover-bg)` + title weight 700.
- Chosen: same `background: var(--meeting-card-hover-bg)`, `box-shadow: var(--shadow-sm), inset 3px 0 0 var(--border-strong)` + title weight 700.
- Chosen *and* hovered: layer both insets — `box-shadow: var(--shadow-sm), inset 3px 0 0 var(--border-strong), inset 0 0 0 1px var(--border-strong)` — so a selected card still gives tactile feedback on hover instead of looking inert. Needs an explicit `.chosen:hover` rule since `.chosen` and `:hover` are equal-specificity classes and `.chosen` alone would otherwise always win by source order.
- `--border-strong` (not a fixed neutral like `--text-secondary`) is the right token here because it's already redefined per theme flavour in `themes.css` — the emphasis stays "on-theme" without touching `--primary`.

**Focus visible**
`outline: 2px solid var(--primary); outline-offset: 2px`. Never suppress focus outlines.

**Row transition — none, deliberately**
Hover/focus/chosen state changes on rows/cards/tabs/nav (background, border-color, box-shadow, color) apply with no `transition` at all — they should read as immediate, not a fade. This applies to `.selectable`, tabs (`.tab-row`, `.card-tab`, `.tab-row-more-btn`), breadcrumbs, the nav rail, `.agenda-table tbody tr`, `.panel-list li`, etc. `.btn` (and its variants) is the one deliberate exception — it keeps a soft `transition: background var(--transition-slide), border-color var(--transition-slide), color var(--transition-slide)` on hover/focus (the slower 360ms token, not `--transition-fast`), since a snappier button hover read as too harsh. Beyond that, smooth `transition`/`animation` is reserved for things that are genuinely animating — an element entering/exiting, moving, or resizing (modal open/close, sidebar collapse, row grow-in/shrink-out, the tab-underline pop-in, the discussing pulse) — not for a plain colour/background swap on `:hover`. The handful of transform-based hover micro-interactions below (chip lift, swatch scale, nav icon nudge) are movement, not a fade, so they keep their transition.

**Modal open/close animation**
`opacity: 0; transform: translateY(8px) scale(0.97)` → `opacity: 1; transform: translateY(0) scale(1)`. Duration `250ms`. Backdrop: `rgba(15,23,36,0.55)`, transitions opacity. Dark theme backdrop: `rgba(0,0,0,0.7)`.

**Discussing pulse** (`.status-pill.discussing`)
`animation: discussing-pulse 2s ease-in-out infinite` — oscillates opacity 1 → 0.6. Only on the active-discussion state; do not use for general attention-drawing.

**Micro-interactions**
Priority chips: `transform: translateY(-1px)` on hover. Colour swatches: `transform: scale(1.12)`. Text-size options: `transform: translateY(-2px)`. These are the only elements that use transform-based hover — do not add hover transforms to buttons or cards.

**Input focus ring**
`border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 25%, transparent)`.

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

**Panel-specific status pill modifiers** (`panel.css`, same underlying tokens):

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

3. **Don't invent a new selected-state colour**. Row selectables always use `background: var(--primary-light); box-shadow: inset 3px 0 0 var(--accent-border)`; card selectables always use `background: var(--meeting-card-hover-bg); box-shadow: inset 3px 0 0 var(--border-strong)` (see "Hover and chosen on a selectable card"). A different fill, an ad-hoc neutral (e.g. `--text-secondary`), or a non-left inset shadow breaks visual consistency with every other selectable of that shape in the app.

4. **Don't use a semantic colour for decoration**. Don't colour an icon or label `--color-warning` unless the user must act on a real warning. Overuse destroys the signal value — users stop noticing warnings.

5. **Don't apply `transform: translateY` or `scale` hover effects to buttons or cards**. Lift/scale transforms are reserved for chips, swatches, and text-size options. Adding them to buttons or cards makes the UI feel unstable.

6. **Don't suppress `focus-visible` outlines**. The design relies on `outline: 2px solid var(--primary); outline-offset: 2px` for keyboard accessibility. Never set `outline: none` without an equivalent replacement.

7. **Don't use bare element selectors for scoped styles** (e.g. `h2 { … }` in panel.css). Always scope to a parent class (`.panel-card h2`). Bare element rules bleed across every instance of that element on the page.

### HTML / template structure

8. **Don't skip heading levels**. A page has one `<h1>` (page title), cards use `<h2>`, sections inside cards use `<h3>`. Jumping from `<h1>` to `<h3>` breaks screen-reader navigation and the visual rhythm.

9. **Don't left-align `<h2>` headings inside `.setup-col`, `.discussion-col`, or `.panel-card`**. These columns are centre-aligned by design. Left-aligned headings look like an oversight.

10. **Don't put an "Add new…" option inside a `<select>` or custom dropdown**. Use a `+` icon-button beside the select (`.ui-add-group-btn`) or a standalone `btn-add` below the list. A dropdown option that triggers a modal rather than selecting a value confuses the interaction model.

11. **Don't use `display: none` to hide elements that JS toggles**. Use the `hidden` attribute. The codebase's JS consistently toggles `hidden`; mixing in `display: none` breaks those assumptions.

12. **Don't place a bare SVG directly inside a button**. Wrap it in `<span class="btn-icon">{% include 'icons/X_svg.html' %}</span>`. A bare SVG skips the spacing rules that `.btn-icon` provides between icon and label text.

### Layout decisions

13. **Don't use CSS grid with fixed pixel column widths**. The pattern is `flex: 1 1 Xpx; min-width: Ypx` on children, or `repeat(auto-fit, minmax(280px, 1fr))` for equal-width grids. Fixed pixel columns break at unexpected viewport widths.

14. **Don't add `margin-bottom` to the last card in a flex container**. Spacing between cards comes entirely from `gap` on the parent. A trailing margin creates uneven space at the container's bottom.

15. **Don't add `margin-bottom` between list rows**. Row separation is `border-bottom: 1px solid var(--border-color)` on each row. Margins inside a list break the edge-to-edge bleed (negative-margin) pattern used by `.panel-list`.

16. **Don't use `.list-page-shell` on a page that doesn't need internal scrolling**. The shell assumes fixed viewport height and pins a stats footer at the bottom. On a short or variable-height page it produces excess whitespace or a misplaced footer.

17. **Don't go deeper than the defined depth stack**. The layers are: `--bg-surface` → `--bg-nested` → `--bg-well`. Nesting `--bg-nested` inside `--bg-nested`, or `--bg-well` inside `--bg-well`, produces backgrounds that are indistinguishable in light mode and invisible in dark mode. If you feel you need a fourth depth level, the component needs redesigning.

18. **Inside `.list-page-shell`, give every direct child of a card `min-height: 0`, not just the scrolling list.** Flex items default to `min-height: auto`, which floors them at their content's min-content size. A card's non-scrolling children (empty-state text, preview blocks) can silently refuse to shrink and reintroduce the "invisible overflow scrollbar" bug this shell exists to prevent — even though the scrolling list itself is fine.

19. **Don't let vertical spacing between stacked rows use a different scale than the horizontal gap between cards in a row.** If a page has both (e.g. `.panel-columns` rows spaced apart vertically, cards spaced apart horizontally within each row), use the same `gap` value for both. Mixing `--space-md` row spacing with `--space-xl` card spacing (or vice versa) reads as accidental, not deliberate rhythm.
