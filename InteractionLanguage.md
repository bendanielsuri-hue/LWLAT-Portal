# Portal Interaction Language

Motion, hover/focus/selected states, and transition rules — split out from [DesignLanguage.md](DesignLanguage.md), which covers static visual rules (colour, layout, typography). Extracted from the Inclusion Panel — the most complete, stable UI in the codebase. Apply these rules to all future hub pages.

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
`opacity: 0; transform: translateY(8px) scale(0.97)` → `opacity: 1; transform: translateY(0) scale(1)`. Duration `450ms`. Backdrop: `rgba(15,23,36,0.55)`, transitions opacity. Dark theme backdrop: `rgba(0,0,0,0.7)`.

**Modal content swap (height transition)** (e.g. New Referral's student-picker ↔ question-fields swap, Panel Group's inline "Create Panel Group" swap — see DesignLanguage.md's "Inline creation swap")
A modal that shows/hides different sections of its own content in place (not opening/closing — the dialog stays open throughout) eases to its new height instead of snapping, via `window.animateModalHeightChange(dialog, mutate)` (`hubs/inclusion/panel/static/js/panel.js`): snapshot the dialog's current rendered height as an explicit pixel value, run `mutate` (the actual DOM change), then on the next frame measure the new natural height (`scrollHeight`) and transition to *that* explicit value — clearing back to `height: auto` once the transition's had time to finish, so a later swap isn't pinned to a stale pixel height. This works because `dialog.modal-dialog` already carries a `height` transition in its base rule (`--modal-duration`, the same `450ms` as open/close) that nothing else uses — `height: auto` itself can't be transitioned, which is why the explicit-pixel snapshot/measure dance is needed at all. Wrap *every* content mutation this way, including a later "loading → loaded" replacement within the same swap, not just the initial show/hide — a second untransitioned jump right after the first undoes the smoothness.

**Row grow-in / shrink-fade-out** (adding/removing an item from a visible list)
Animate `max-height`/`opacity`/`padding-top`/`padding-bottom`/`margin-top`/`margin-bottom` together via `Element.animate()` (not a CSS transition — CSS transitions intermittently snap straight to the end state on freshly-inserted/removed rows instead of animating). Duration `900ms`, easing `cubic-bezier(0.4, 0, 0.2, 1)`, same properties/timing both directions (values simply reversed). Pair with an instant colour-tint flash (`.agenda-flash-added`/`.agenda-flash-removed`, `color-mix(...)` at 12% of `--color-positive`/`--color-negative`) for add/remove feedback. Use for `div`/`li` rows spaced by padding + `border-bottom` (e.g. `.entity-row`, `.settings-row`) — not for `<table>` rows (browsers don't animate table-row height cleanly) and not for margin/`gap`-spaced lists without adapting the technique first (gap won't collapse in lockstep with the animated row). Helpers (`shrinkAndFadeOut`, `growIn`, `flash`, `cancelRowAnim`, `wireRowRemoveForm`) live as top-level functions in `hubs/inclusion/panel/static/js/panel.js`, above `initAgendaDragDrop` — reuse them directly rather than reimplementing per hub.

**Refreshing a live fragment in place** (e.g. re-fetching a modal/panel's HTML after an autosave and swapping it back in)
A full `container.innerHTML = freshHtml` replace is fine for the *first* render of a fragment, but doing it on every subsequent update tears down and recreates every element inside — which silently reintroduces two problems: (1) any scrollable descendant (`overflow-y: auto`) loses its scroll position, since the freshly-created element always starts at `scrollTop: 0`, reading as the panel "jumping to the top"; (2) any element whose entrance animation is a plain unconditional CSS `animation` (not gated by JS), e.g. `.tab-row`'s `tab-row-fade-in`, replays that animation every time it's recreated, reading as a flash/flicker on an update rather than a one-off entrance. When a container is refreshed (not opened for the first time), capture the scroll position of its scrollable descendant(s) before replacing `innerHTML` and restore it after, and suppress replay of one-shot entrance animations on refresh renders (e.g. track an `hasRenderedOnce`-style flag per session and set `el.style.animation = 'none'` on the affected elements when true) — see the Panel Group modal's `render()` in `hubs/inclusion/panel/static/js/panel.js` for the reference implementation. A true DOM diff/patch avoids both problems more thoroughly but is a bigger lift than this codebase's fragment-replace pattern warrants for most cases — reach for it only if a container needs to preserve more than scroll position (e.g. focus, in-progress row animations). A third failure mode in the same family: if the server-rendered fragment conditionally omits a structural element once its underlying data hits zero (e.g. a tab whose panel only renders `{% if inactive_members %}`), then whatever emptied that data (the very action the user just took) yanks that structure out of the refreshed fragment, forcing the UI to fall back to some default view — reading as an involuntary "it switched tabs on me." Render the structure unconditionally (with its own empty state, e.g. "No inactive members") whenever it's paired with a sibling that's still populated, rather than gating its existence on the count that the user's own action just changed.

**Modal header close button** (`.modal-close`)
Every `dialog.modal-dialog` gets one: a plain `&times;` button (`font-size: var(--font-3xl); color: var(--text-faint)`, hover `--text-primary`, no border/background) as the last child of `.modal-header`, which lives outside the scrolling body — so it's always visible, even after scrolling. Wired generically via `data-modal-close` (the same attribute every in-body Cancel/Close button already uses) — for a dialog whose click listener is scoped to itself (`dialog.addEventListener('click', ...)` checking `e.target.closest('[data-modal-close]')`), adding the button is template-only, no JS needed. **A modal's bottom row keeps its own Close/Done button only when there's at least one other action button next to it** (Cancel+Save, Cancel+Create, Yes+No). A solitary dismiss button at the bottom — nothing but "Close" or "Done" — is redundant with the header X and gets removed entirely, not kept as a second way to do the same thing.

**Discussing pulse** (`.status-pill.discussing`)
`animation: discussing-pulse 2s ease-in-out infinite` — oscillates opacity 1 → 0.6. Only on the active-discussion state; do not use for general attention-drawing.

**Micro-interactions**
Priority chips: `transform: translateY(-1px)` on hover. Colour swatches: `transform: scale(1.12)`. Text-size options: `transform: translateY(-2px)`. These are the only elements that use transform-based hover — do not add hover transforms to buttons or cards.

**Input focus ring**
`border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 25%, transparent)`.

---

## Anti-patterns

1. **Don't invent a new selected-state colour**. Row selectables always use `background: var(--primary-light); box-shadow: inset 3px 0 0 var(--accent-border)`; card selectables always use `background: var(--meeting-card-hover-bg); box-shadow: inset 3px 0 0 var(--border-strong)` (see "Hover and chosen on a selectable card"). A different fill or an ad-hoc neutral (e.g. `--text-secondary`) breaks visual consistency with every other selectable of that shape in the app. Popover/dropdown options (`.ui-option.selected`, `components/forms.css`) are the one deliberate exception to the accent-bar half of this rule: same `--primary-light` fill, but no `--accent-border` bar — a popover option is already corner-clipped to the popover's own rounded corners, and a left bar reads oddly against that clipped edge.

2. **Don't apply `transform: translateY` or `scale` hover effects to buttons or cards**. Lift/scale transforms are reserved for chips, swatches, and text-size options. Adding them to buttons or cards makes the UI feel unstable.

3. **Don't suppress `focus-visible` outlines**. The design relies on `outline: 2px solid var(--primary); outline-offset: 2px` for keyboard accessibility. Never set `outline: none` without an equivalent replacement.

4. **Don't blindly `innerHTML`-replace a live fragment on every update without preserving scroll position and suppressing one-shot entrance animations**. See "Refreshing a live fragment in place" above — an unguarded refresh reads as a jarring "the whole panel just reloaded," even though no navigation happened.

5. **Don't stack a full-weight creation modal on top of an already-open one.** A "+" clicked from inside a modal that opens a *second*, heavier modal (its own multi-field form, its own header/footer) reads as "a small modal on top of a small modal." When the thing being added is itself a small, single-field affair (e.g. the shared "Add Expertise Tag"/"Add External Contact" dialogs), a second stacked `<dialog>` is fine — it's genuinely lightweight. When it's a fuller creation flow with several fields (e.g. Panel Group's "Create Panel Group"), swap the *host* modal's own content in place instead — see DesignLanguage.md's "Inline creation swap" and this file's "Modal content swap (height transition)" above. Judge by weight, not by a blanket "never nest dialogs" rule.
