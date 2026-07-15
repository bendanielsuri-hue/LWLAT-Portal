# Portal Design Language

Portal-wide static visual rules: colour, layout, typography, spacing, naming. Every hub follows these. For hover/focus/motion, see [InteractionLanguage.md](InteractionLanguage.md). Hub-specific implementation (concrete class names, worked examples, JS/view references) lives in that hub's own `DesignLanguage.md` — see [hubs/inclusion/panel/DesignLanguage.md](hubs/inclusion/panel/DesignLanguage.md) for the current example. See [docs/agents/doc-conventions.md](docs/agents/doc-conventions.md) for what belongs at this level vs. app-level, and this doc's own length budget.

---

## Design philosophy

1. **Token-first**: every colour, radius, shadow, spacing unit, font size references a CSS custom property (`static/css/tokens/`, `static/css/theme/`, `static/css/style.css`). No hardcoded hex or pixel radii.
2. **Surface layering**: nested/inset depth — content sitting *inside* or *under* something else — is expressed via background token alone, never a shadow trick. Five layers, in ascending depth:
   - `--bg-page` → page canvas
   - `--bg-surface` → cards, read-only containers
   - `--bg-surface-alt` → alternating rows, header strips, editable inputs (same depth as surface, different shade)
   - `--bg-nested` → content semantically *inside* a card (sub-panels, indented children)
   - `--bg-well` → deep trough within a nested section (rare)

   Test: would a user describe this as *inside/under* something → `--bg-nested`. A stripe breaking up peers at the same level → `--bg-surface-alt`.
3. **Elevation shadow is a separate axis from surface layering** — lifting a card or modal off the page it sits on, rather than expressing nesting. Not fixed: whether a given surface gets a shadow at all is theme-controlled, so it always routes through a shadow token, never a hardcoded shadow value — a theme may reduce or drop it in favour of the border alone doing the framing.
4. **Meaning through colour, not decoration**: accent (`--primary`) and semantic colours (`--color-positive/caution/warning/negative/exceeding`) signal state; neutral tones mean "no significance." Never use a semantic colour purely for visual interest.
5. **Interaction is consistent sitewide**: hover, selected, and focus-visible states use the same tokens everywhere (`--row-hover-bg`; `--primary-light` + inset shadow; `outline: 2px solid var(--primary)`).
6. **Personal theme layer**: Theme Mode (light/dark) × the user's accent colour × a `data-theme` flavour all re-derive every colour token, and may carry their own spacing/layout/shadow rules too. Never assume a fixed hex, spacing, or shadow value for any token — check `/portal-admin/themes/` (previews every combination live) rather than assuming.

---

## Information hierarchy

1. **Page title** — `<h1>`, `--font-5xl`, one per page.
2. **Card / column heading** — `<h2>`, `--font-xl`, one per card, centre-aligned.
3. **Section heading** — `<h3>`, `--font-lg`/`--font-md`, within a card.
4. **Row / item title** — `--font-md`, weight 600 — primary label for a list row.
5. **Row metadata** — `--font-sm`, `--text-secondary` — supporting detail, same row.
6. **Note / faint detail** — `--font-sm`, `--text-muted` — tertiary, lowest-contrast text.
7. **Field label** — `<label>`, `--font-sm`, weight 600, `--text-secondary`, above its control. A fused field is the deliberate exception — see Form control patterns.
8. **Source / context annotation** — `--font-2xs`, uppercase, `--text-faint` — above a label, explaining where a read-only value comes from.

---

## Layout patterns

Which pattern to reach for — work through in order, each answers "does this apply," not a menu to pick from freely:

1. **Two roughly-equal side-by-side content blocks?** → Two-column split: `display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start`; children `flex: 1 1 280px; min-width: 260px`; wraps to single-column below ~600px.
2. **A list that needs to scroll independently within a fixed viewport height, with a stats footer pinned below it?** → Fixed-height list shell: scrolling content (`flex: 1; min-height: 0; overflow-y: auto`) above a pinned stats strip. Only reach for this when the list genuinely needs internal scrolling — on a short/variable-height page it produces excess whitespace or a misplaced footer instead (see Anti-patterns). Anything sitting above the scrolling body that isn't a filter bar is a flex-shrunk child *inside* the shell (`flex-shrink: 0`) — not a sibling outside it guessing a second viewport-height calculation.
3. **A card or dialog holding a list that can grow long, needing a header/footer that stays put while the list scrolls?** → Card-internal scroll: `display: flex; flex-direction: column; overflow: hidden`, non-scrolling header/footer (`flex-shrink: 0`), scrolling body (`flex: 1 1 auto; min-height: 0; overflow-y: auto`). Applies to any such container, including every modal — keeps the scrollbar flush with the body's own edge/padding, never colliding with the header/footer or the container's corner radii.
4. **3+ equal-weight sections that should auto-fill a row?** → Equal-width grid: `display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px`.
5. **User-adjustable filtering?** → Filter bar: a row of `<label>` + input/select pairs. Client-side (hides rows in place via JS, no reload) when only *which rows are visible* changes; server-side (`<form method="get">`, recomputes from `request.GET`, progressively AJAX-enhanced so a plain GET submit always works standalone as the fetch-failure fallback) whenever the numbers on the page — stats/KPIs, not just row visibility — must reflect the filter. Always render the active-filter count badge (toggle a hidden state, don't conditionally include the element, so neighbouring fields don't shift sideways); the active-highlight's padding lives on the base field rule, not the active modifier, so activating a field doesn't grow its own box. A dependent filter's options narrow from the already-selected parent value and drop a selection that no longer appears in the narrowed set. A sticky filter bar shares the page header's own sticky container rather than being an independent `position: sticky` sibling.
6. **An at-a-glance KPI/count summary?** → Stats strip: `display: flex; gap: 16px; flex-wrap: wrap` of stat cards — bottom of a shell (pinned) or below a content section (not pinned), never at the top of a page.

---

## Spacing patterns

The spacing scale — every token's value and which contexts use it — is documented inline in `static/css/tokens/spacing.css`. Reference it there rather than a copy here (see Anti-patterns below for the one cross-cutting spacing rule: never add `margin-bottom` to the last card in a flex container).

---

## Typography patterns

The type scale — every token's value and which UI role uses it — is documented inline in `static/css/tokens/typography.css`. Reference it there rather than a copy here.

**Weight**: 400 body/metadata, 600 titles/labels/active state, 700 stat values/emphasis.

**Uppercase + letter-spacing** is reserved for source annotations and small badges only — never running text. **Avoid `text-transform: uppercase` on new labels** generally (user preference against all-caps text) — use weight/colour/size for emphasis instead.

**Centred headings** inside a centre-aligned column card stay centred — don't left-align an `<h2>` inside one.

---

## Card patterns

Building a new bordered container — start from the base case, then branch:

1. **Base case**: any bordered, filled, standalone container playing a "card" role — not a form input, popover, modal, or row divider: `background: var(--bg-surface); border: 1px solid var(--border-strong); border-radius: var(--radius-xl); padding: 20px; box-shadow: var(--card-shadow)`. Border is always `--border-strong` — a paler border can fail to read as an edge depending on the active theme's own surface tone. Shadow always goes through the `--card-shadow` token, never a shadow value hardcoded directly — see Design philosophy's box-shadow rule.
2. **Content needs to scroll independently?** → add `display: flex; flex-direction: column` to host a scrollable body (list container card).
3. **It's a compact metric tile, not a content container?** → `flex: 1 1 200px; padding: 16px 20px`; add `border-left: 4px solid <semantic colour>` + a top-right icon if it needs to flag a threshold (accent stat card).
4. **It's optional/collapsible detail?** → use `<details>` instead of a div, `▸`/`▾` pseudo-content, no native marker (settings section).

Whether several sections that already sit inside one outer bordered container should each get their own nested card, or stay borderless and divide with a rule between them, depends on the content and container too much to fix as one portal-wide answer — that's an app-level call where it comes up (see e.g. `hubs/inclusion/panel/DesignLanguage.md`'s flat section).

**Key-fact row** (`label: value`, one per line) — `display: grid; grid-template-columns: minmax(160px, 200px) 1fr; column-gap: 16px`, value `text-align: left`. Never right-align the value against a left-aligned label — a value pinned to the far edge reads as disconnected from it.

---

## Navigation patterns

**Tab row** — decide in order when adding one:
1. Sharing a row with a button or other control? Don't — give the control its own row (a header row above, or a footer row below). A taller sibling makes the row inherit its height, leaving the tab underline floating with dead space beneath it.
2. Sitting directly above a scrolling list body? Make it sticky, scoped to that scrolling ancestor — otherwise it scrolls away with the content it's meant to be filtering.
3. Its container has its own padding the row needs to bleed past to reach the true edge? Set a two-sided margin on that container's own `.tab-row` rule, sized to its padding — never a bleed value on the base rule, since no single value fits every container.
4. Representing filterable statuses? Show each tab's live count in parentheses, always render an "All (N)" default tab, and collapse a zero-count tab out of the row (animated — see InteractionLanguage.md) rather than reserving space for it.

Visual chrome, independent of the above: underline indicator only, no background fill; animates in via `scaleX(0) → scaleX(1)` + opacity; hover = faint indicator + primary text, active = primary indicator + text; the row's own divider sits directly under the tabs, never on the static block above it.

**Side nav active state** — `background: var(--primary-light); color: var(--primary); box-shadow: inset 3px 0 0 var(--accent-border); font-weight: 600`.

**Breadcrumbs** — `--font-sm`, `--text-secondary`. Current page (last crumb): weight 600, no link.

**Back button** — icon + text, left of `<h1>`. `--text-secondary`, hover `--primary`.

---

## Table / list patterns

**Entity list** — `background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden`; rows divided by `border-bottom`, last row none. Any list with hover/selection feedback bleeds edge-to-edge (negative margin matching the card's own padding) rather than leaving the highlight inset within the card's padding.

**Table** — `border-collapse: collapse; border: 1px solid var(--border-color)`. `<th>`: `--font-sm`, `--text-secondary`, `--bg-surface-alt`. `<td>`: `--font-base`, `padding: 12px 16px`.

**Person / entity thumbnail** — portrait-ID ratio (3:4), `border-radius: var(--radius-sm); background: var(--bg-surface-alt); border: 1px solid var(--border-color)`.

**Result list** (search/picker) — scrollable bounded list (`max-height: min(65vh, 480px)`), each option a full-width button divided by `border-bottom`. Hover `--row-hover-bg`, selected `--primary-light`.

**Empty state** — `color: var(--text-muted); text-align: center; padding: 40px 0; font-size: var(--font-xl)` — centred in its container, not left-aligned.

---

## Form control patterns

**Editable field background** — always `var(--bg-surface-alt)`, never plain `var(--bg-surface)`. A tinted fill signals "you can act on this" before any hover/focus proves it; `--bg-surface` is reserved for things that merely *display* content.

**Single-line control height matches button height** — same vertical padding as `.btn` (`--space-xs`), not a more generous default. Doesn't apply to `<textarea>` or other inherently multi-line controls.

**Fused vs. plain fields** — decide in order:
1. Is this a filter-bar field? → Never fuse it — the active-filter highlight needs to fill the whole label+control wrapper as a "chip"; a permanent fused border on every field would blunt that contrast.
2. Otherwise, is there horizontal room beside the control for its label without cramping the value? → Left Fused: label beside control, one shared border — the default whenever there's room, since the boxed look reads as more deliberate than a plain label-above field.
3. Not enough width (a narrow multi-column row)? → Upper Fused: label above, boxed, value always centred regardless of content — matches its own centred label, since the compact shape reads as one balanced unit rather than a row with room to breathe.
4. Neither fits at all? → Fall back to a plain label-above `.field-group`.

**Search box chrome** — idle: plain border, faint icon. Hover: border only, no fill change. Focus-visible: primary border + inset ring. Has-text: primary border + icon — this **outranks hover**, so a filled box stays primary even while hovered. Background never changes across states. Behavioural rules (debounce, hidden-until-typed, server-fetch) are cross-hub and covered in InteractionLanguage.md's Search entry.

**Segmented control** — for 3 or fewer static options, show every option as its own button in one shared bordered box — never hide a small fixed set behind a `<select>`. Inactive: `--bg-well` fill. Active: `--primary-light` fill + primary text — the same "filled = active" vocabulary as an active filter field or Search's has-text state. Exception: inside a filter bar, use a dropdown even for <=3 options — horizontal space in a filter bar is at a premium, so this control stays consistent with its sibling filter fields there; the segmented default still applies everywhere else (row-level controls, detail views, etc.).

**Dropdown/select popover** — a floating `<dialog>` detached from its trigger by a small gap, fully rounded, own elevation shadow (matches the modern convention — Material 3, Radix/shadcn, macOS/iOS). Never flush/square-cornered. Selected option: `--primary-light` fill + bold text, no accent bar — the popover's own corner radius already clips it.

**Text alignment** — left by default (names, descriptions, any text input, most dropdown options). Centre only for short enums/codes/single letters/badges/icons. Right for currency/percentages/measures where magnitude comparison matters. When genuinely unsure, use left.

---

## Interaction patterns

See [InteractionLanguage.md](InteractionLanguage.md) for hover/focus/selected states, transitions, and animation rules.

---

## Button patterns

Button variants (`btn-primary`/`secondary`/`tertiary`/`add`/`edit`/`delete`/`success`/`sm`/`icon-only`), their meaning, default icons, and hover/disabled states are documented inline in `static/css/components/buttons.css`. One layout convention isn't a CSS fact, so it stays here: app-wide page-header actions (Search, global actions) and a page's own primary action sit in separate stacked rows, not one flat row — the page's own action should read as the more prominent one. (See Anti-patterns below for the "no create-new option inside a `<select>`" rule.)

---

## Pill / badge patterns

The `.status-pill` base rule and shared semantic modifiers (`.pill-positive`/`caution`/`warning`/`negative`/`exceeding`) are documented inline in `static/css/components/pills.css`. Hub-specific status modifier classes live in that hub's own CSS but must still reference the same shared `--color-*` tokens — never a hardcoded hex.

**Priority chip** — border-only when inactive, filled with `--priority-{level}-*` tokens when active. **Priority badge** — `--font-2xs`, uppercase, read-only display of priority.

---

## Naming conventions

**BEM-lite**: `block-element` with `--modifier` for variants, one level of element nesting maximum (`.panel-card-header`, not `.panel-card__header__title`).

- Layout containers: `*-columns`, `*-col`, `*-card`, `*-shell`, `*-layout`
- List wrappers: `*-list`
- Row items: `*-row`
- Row sub-elements: `-body`, `-title`, `-meta`, `-note`, `-thumb`, `-actions` — always prefixed with the block name
- Template partials start with `_`; full pages don't
- `data-*` attributes: kebab-case, name is the JS hook, value is the variant/target

---

## Anti-patterns

1. **Don't hardcode colours or radii.** Use tokens. Breaks theme mode/flavour/accent switching.
2. **Don't use a semantic colour for decoration.** Overuse destroys the signal value.
3. **Don't use bare element selectors for scoped styles.** They bleed across every instance of that element on the page.
4. **Don't skip heading levels** (`<h1>` → card `<h2>` → section `<h3>`). Breaks screen-reader navigation.
5. **Don't left-align headings inside centre-aligned columns.**
6. **Don't put a "create new" option inside a `<select>`.** Use a `+` button or standalone `btn-add`.
7. **Don't use `display: none` to hide JS-toggled elements.** Use the `hidden` attribute.
8. **Don't place a bare SVG inside a button.** Wrap it so icon/label spacing rules apply.
9. **Don't use CSS grid with fixed pixel column widths.** Use `flex: 1 1 Xpx; min-width: Ypx`, or `repeat(auto-fit, minmax(...))`.
10. **Don't add `margin-bottom` to the last card in a flex container, or between list rows.** Spacing comes from `gap`/`border-bottom`.
11. **Don't use a fixed-height list shell on a page that doesn't need internal scrolling.**
12. **Don't nest background layers deeper than `--bg-surface → --bg-nested → --bg-well`.** A fourth level means the component needs redesigning.
13. **Don't mix spacing scales between a row's cards (horizontal gap) and the rows themselves (vertical gap).** Use the same value for both.
14. **Don't hardcode `--shadow-md` (or any shadow token) directly on a card's resting state.** Use `--card-shadow` — some theme flavours zero it out in favour of the border alone; a hardcoded shadow token silently opts a card out of that.

See [InteractionLanguage.md](InteractionLanguage.md) for interaction-specific anti-patterns.
