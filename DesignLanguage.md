# Portal Design Language

Extracted from the Inclusion Panel and SEND & Provision hub — the most complete, stable UI in the codebase. Apply these rules to all future hub pages.

---

## Design philosophy

- **Token-first**: every colour, radius, shadow, spacing unit and font size references a CSS custom property. No hardcoded hex values or pixel radii outside the token definitions in `static/css/tokens/`, `static/css/theme/`, and `static/css/style.css`.
- **Surface layering**: visual depth is expressed by background tokens alone — no box-shadows to simulate elevation except on floating surfaces (cards, modals). The four layers in ascending depth:
  - `--bg-page` → page canvas
  - `--bg-surface` → cards, list containers, panels
  - `--bg-surface-alt` → inputs, read-only fields, secondary/inner cards
  - `--bg-nested` → items nested inside a `--bg-surface` card (meeting-card, referral-pick-item, action-item, agenda-preview-item)
- **Meaning through colour, not decoration**: accent colour (`--primary`, `--success`, `--warning`, `--danger`) signals state; neutral tones (`--badge-bg`, `--text-secondary`) mean "no special significance". Never use a semantic colour purely for visual interest.
- **Interaction is consistent sitewide**: hover, selected, and focus-visible states use the same three tokens everywhere — `--row-hover-bg`, `--primary-light` + inset shadow, `outline: 2px solid var(--primary)`.

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
A flex column that fills viewport height: content area (`flex: 1; min-height: 0; overflow-y: auto`) above a pinned `.stats-strip` footer. Any page whose list needs to scroll internally without growing the page uses this pattern.

**Agenda grid** (`.agenda-layout`)
```css
display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px;
```
Equal-width columns, auto-fills the row. Used when there are 3+ equal-weight sections.

**Filter bar** (`.filter-bar` + `.filter-field`)
A row of labelled controls above a list. Always precedes `.entity-list` or `.list-card`. Each `filter-field` contains a `<label>` + one `<input>` or `<select>`. A `filter-bar-clear` button is the last item.

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
| `--font-2xs` | `.field-source`, `.next-badge`, `.priority-badge`, day-of-week in calendar |

**Font weight conventions:**
- 400 — body / metadata
- 600 — titles, labels, active tab, card count
- 700 — stat values, timers, chosen row title, bold emphasis

**Uppercase + letter-spacing** (`text-transform: uppercase; letter-spacing: 0.02–0.03em`) is reserved for `.field-source`, `.next-badge`, `.priority-badge` only. Do not apply to running text.

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
Uses `--bg-nested` (one level deeper than surface), `border-radius: var(--radius-lg)` (one step smaller than container), `box-shadow: var(--shadow-sm)`. Hover: `border-color: var(--accent-border)`.

**Stat card** (`.stat-card`)
`flex: 1 1 200px`, standard surface/border/radius-lg, `padding: 16px 20px`. Accent variant adds `border-left: 4px solid var(--primary/warning/success)` and a positioned icon at top-right (`position: absolute; top: 16px; right: 16px; width: 20px`).

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

**Hover on a selectable row or card**
`background: var(--row-hover-bg)` (= `color-mix(in srgb, var(--text-primary) 6%, var(--bg-surface))`) + title weight bumps to 700. Apply via `.selectable:hover` or explicit `.panel-list li:hover` / `tbody tr:hover`.

**Chosen / selected state** (persistent after click)
`background: var(--primary-light); box-shadow: inset 3px 0 0 var(--accent-border)` + title weight 700. Hover on a chosen row keeps `--primary-light` — does not revert to `--row-hover-bg`. Applied via `.chosen` on `entity-row`, `panel-list li`, `agenda-table tbody tr`, `meeting-card`.

**Focus visible**
`outline: 2px solid var(--primary); outline-offset: 2px`. Never suppress focus outlines.

**Row transition**
`transition: background var(--transition-fast), box-shadow var(--transition-fast)`.

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
| `btn-add` | Create / add action (uses `--btn-add-*` semantic tokens) |
| `btn-edit` | Edit action (uses `--btn-edit-*`) |
| `btn-delete` | Destructive action (uses `--btn-delete-*`) |
| `btn-success` | Positive completion (green fill) |
| `btn-sm` | Compact size — used in list rows, modals, filter bars |
| `btn-icon-only` | Square icon button, `padding: 0 14px; height: 41px` |

**Icon inside a button**: `<span class="btn-icon">{% include 'icons/X_svg.html' %}</span>` before the label text.

**Button group** (`.btn-row`): `display: flex; gap: 8px`. Use `flex-wrap: wrap` when overflow is possible. Stacked variant (`.btn-row-stacked`): `flex-direction: column; align-items: stretch` — each button and its wrapping `<form>` is `width: 100%`.

**Chair / toggle button** (`.member-row-chair-btn.is-chair`): `background: var(--primary-light); border-color: var(--primary); color: var(--primary); font-weight: 600`.

**"+" icon button** beside a select (`.ui-add-group-btn`, `.btn-icon-only`): `width: 38px; height: 38px; flex-shrink: 0` — sized to match the select's rendered height.

Never place a "Create new X" option inside a `<select>` or custom dropdown list. Use a `+` icon-button beside the select or a standalone `btn-add` below it.

---

## Pill / badge patterns

**Status pill** (`.status-pill`)
`font-size: var(--font-xs); font-weight: 600; padding: 4px 10px; border-radius: var(--radius-pill); display: inline-block`.

| Modifier class | Semantic | Colours |
|---|---|---|
| *(none)* | Neutral / pending | `--badge-bg` / `--text-secondary` |
| `.open`, `.upcoming`, `.incomplete`, `.requires_follow_up` | Needs attention | `--warning-bg` / `--warning` |
| `.closed`, `.discussed`, `.complete` | Done / positive | `--success-bg` / `--success` |
| `.in_panel`, `.assigned`, `.type-chair`, `.type-mat` | Active / institutional | `--primary-light` / `--primary` |
| `.danger` | Critical | `--danger-bg` / `--danger` |
| `.discussing` | Currently active + pulse | `--warning-bg` / `--warning` + animation |
| `.type-external` | External / guest | `--warning-bg` / `--warning` |
| `.concern`, `.not_needed`, `.type-school` | Neutral classification | `--badge-bg` / `--text-secondary` |

**Next-panel badge** (`.next-badge`): `--font-2xs`, uppercase, `letter-spacing: 0.03em`, `--primary` on `--primary-light`, `padding: 3px 8px; border-radius: var(--radius-xs)`. Used inline after a meeting card heading.

**Priority chip** (`.priority-chip`): `--font-xs`, weight 600, `padding: 4px 10px; border-radius: var(--radius-pill)`. Default (inactive): border-only, `--bg-surface`, `--text-secondary`. Active: filled with `--priority-{level}-bg`, coloured border and text. Tokens come from `theme/light.css` and `theme/palettes.css` (`--priority-high/medium/low-bg/border/text`).

**Priority badge** (`.priority-badge`): `--font-2xs`, uppercase, `letter-spacing: 0.02em`, `padding: 3px 8px; border-radius: var(--radius-xs)`. Read-only display of priority. High = `--danger-bg/--danger`; Medium = `--badge-bg/--text-secondary`; Low = `--bg-surface-alt/--text-faint`.

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

1. **Don't hardcode colours** (`color: #6d28d9`, `background: #f0fdf4`). Use `var(--primary)`, `var(--success-bg)`, etc. Hardcoded values break dark mode, theme-switching, and school accent overrides.

2. **Don't hardcode border-radius values** (`border-radius: 8px`). Use the token scale (`var(--radius-md)`). Hardcoded radii drift silently when the scale is adjusted.

3. **Don't invent a new selected-state colour**. Chosen state is always `background: var(--primary-light); box-shadow: inset 3px 0 0 var(--accent-border)`. A different fill or a non-left inset shadow breaks visual consistency with every other selectable row/card in the app.

4. **Don't use a semantic colour for decoration**. Don't colour an icon or label `--warning` unless the user must act on a real warning. Overuse destroys the signal value — users stop noticing warnings.

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

17. **Don't nest `--bg-nested` inside another `--bg-nested` container**. The depth layers are: `--bg-surface` (card) → `--bg-nested` (item inside card). Going deeper produces backgrounds that are indistinguishable in light mode and invisible in dark mode.
