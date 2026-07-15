# Portal Interaction Language

Motion, hover/focus/selected states, and transition rules — portal-wide, split out from [DesignLanguage.md](DesignLanguage.md) (static visual rules). Every hub follows these. Hub-specific implementation (JS function names, worked examples) lives in that hub's own `InteractionLanguage.md` — see [hubs/inclusion/panel/InteractionLanguage.md](hubs/inclusion/panel/InteractionLanguage.md) for the current example. See [docs/agents/doc-conventions.md](docs/agents/doc-conventions.md) for what belongs at this level vs. app-level.

---

## Interaction patterns

**Hover on a selectable row** — `background: var(--row-hover-bg)` (see `static/css/tokens/colours.css` for the computed value) + title weight bumps to 700.

**Chosen / selected state on a row** (persistent after click) — `background: var(--primary-light); box-shadow: inset 3px 0 0 var(--accent-border)` + title weight 700. Hover on a chosen row keeps `--primary-light`, doesn't revert to plain hover.

**Hover and chosen on a selectable card** (as opposed to row-shaped) — cards stay off `--primary`/`--accent-border` entirely; the accent reads too strong at card scale where the whole tile carries the fill. Hover and chosen share one background token so a selected card already reads as "hover-lit"; chosen-and-hovered layers both insets so a selected card still gives tactile feedback rather than looking inert.

**Search** — hidden until typed, no exceptions (no "browse everything" default anywhere in the app); 250ms debounce, 2-character minimum; token-based matching (query splits on whitespace, every token must match somewhere in the name); group-by-kind headers only when a single search can legitimately return more than one entity type. Server-fetch for anything backed by real DB data — only genuinely static, small client-side data stays client-side. Implementation (the shared search endpoint, picker-specific wiring) is documented at hub level.

**Fade toggle** — for a small, same-size element popping in/out of an already-open dialog without changing its height, fade opacity rather than an instant `hidden`/`display:none` snap. Not a substitute for a height-changing swap (below).

**Focus visible** — `outline: 2px solid var(--primary); outline-offset: 2px`. Never suppress focus outlines.

**Row transition — none, deliberately.** Hover/focus/chosen changes on rows/cards/tabs/nav apply with no `transition` at all — they read as immediate, not a fade. `.btn` is the one exception (keeps a soft transition on hover/focus — a snappier button hover read as too harsh). Smooth transition/animation is reserved for things genuinely animating (entering/exiting, moving, resizing) — not a plain colour/background swap on `:hover`.

**Modal open/close** — `opacity: 0; transform: translateY(8px) scale(0.97)` → `opacity: 1; transform: translateY(0) scale(1)`, `450ms`. Backdrop transitions opacity.

**Modal content swap (height transition)** — any modal content change that alters the dialog's natural height animates via an explicit-pixel-snapshot/measure-then-transition technique, not a snap. Applies to an explicit view/step swap *and* a live filter hiding/showing already-rendered rows — the size of the change doesn't matter. A modal whose content resizes **repeatedly** while open anchors near the top of the viewport instead of vertically centring, so only the bottom edge moves as it grows/shrinks; a modal that switches once between fixed modes stays centred. A results/list area reserves placeholder content for its own empty/idle state rather than collapsing to zero height and growing again once populated.

**Row grow-in / shrink-fade-out** (adding/removing a list item) — animate `max-height`/`opacity`/padding/margin together via `Element.animate()`, not a CSS transition (CSS transitions intermittently snap to the end state on freshly-inserted/removed rows). ~900ms, paired with an instant colour-tint flash. Use for `div`/`li` rows spaced by padding + `border-bottom` — not `<table>` rows (browsers don't animate table-row height cleanly).

**Refreshing a live fragment in place** — a full `innerHTML` replace is fine for a fragment's first render, but on every subsequent update: capture and restore the scroll position of any scrollable descendant (a freshly-created element always starts at `scrollTop: 0`), and suppress replay of one-shot entrance animations gated only by a plain CSS `animation` (they'd otherwise replay on every refresh, reading as a flicker). Also render conditionally-empty structural elements unconditionally with their own empty state, when paired with a sibling that's still populated — otherwise the very action that emptied the data yanks the structure out of the refreshed fragment, reading as an involuntary UI switch.

**Modal header close button** — every modal gets a plain `×` (`.modal-close`) as the last child of the header, which lives outside the scrolling body so it's always visible. A modal's bottom row keeps its own Close/Done button only when there's at least one other action button next to it — a solitary dismiss button at the bottom duplicates the header `×`.

**Status-filter tab entering/leaving the tab row** — a tab still fully disappears at count 0 (no disabled/greyed state), but the disappearance eases (`opacity`/`max-width`/padding/margin collapsing, ~260ms) rather than snapping.

**Count-delta pulse** — any live `(N)` changing while already visible scales asymmetrically and tints, then settles: increase peaks larger with a positive tint and bounce easing; decrease dips smaller with a negative tint and plain easing. Fires the moment its own action is confirmed, synchronously, whenever the new value is fully knowable client-side — never deferred to wait for a row's own removal/move animation, or it reads as a laggy second-class citizen next to an update elsewhere that isn't gated. Implementation lives at hub level.

**`prefers-reduced-motion` scope** — suppresses motion attached to an interactive/hoverable element (hover lift/scale effects) — not a passive indicator reporting a change that already happened (e.g. the count-delta pulse above), which keeps animating regardless of the setting.

**Micro-interactions** — the only transform-based hover effects in the app: small lift/scale on chips, colour swatches, and text-size options. Don't add hover transforms to buttons or cards.

**Input focus ring** — `border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 25%, transparent)`.

---

## Anti-patterns

1. **Don't invent a new selected-state colour.** Selectables always use `background: var(--primary-light); box-shadow: inset 3px 0 0 var(--accent-border)`. A popover/dropdown option is the one deliberate exception to the accent-bar half — same fill, no bar, since a popover option is already corner-clipped to the popover's own radius.
2. **Don't apply `transform: translateY`/`scale` hover effects to buttons or cards.** Reserved for chips, swatches, text-size options — adding them elsewhere makes the UI feel unstable.
3. **Don't suppress `focus-visible` outlines.** Never set `outline: none` without an equivalent replacement.
4. **Don't blindly `innerHTML`-replace a live fragment on every update** without preserving scroll position and suppressing one-shot entrance animations — reads as a jarring full reload even though nothing navigated.
5. **Don't stack a full-weight creation modal on top of an already-open one.** A small, single-field quick-add can stay a second stacked dialog; a fuller creation flow (several fields) swaps the host modal's own content in place instead — see DesignLanguage.md's "Inline creation swap."
6. **Don't let a live filter or result count snap a modal's height.** Any content change that alters the dialog's natural height needs the same height-transition treatment as an explicit view/step swap.
7. **Don't show a Search box's full result set before the user has typed anything.** Every Search box is empty until typed — no picker gets a "browse everything" exception.
8. **Don't pre-render a full DB-backed list into the page and filter it in JS.** Query the shared search endpoint instead — doesn't scale past a small dataset and duplicates behaviour every other Search box already has.
