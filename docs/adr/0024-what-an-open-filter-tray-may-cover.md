# What an open filter tray may cover

The open tray is `position: fixed` and pinned to its bar's on-screen rect, so what it may and may not paint over is a decision rather than a consequence of layout. The rule: **it covers list content freely, and stops short of navigation.**

Concretely, in `tray-position.js`'s `positionFilterTray`:

- **Bottom capped at `.mobile-tabbar`'s top edge**, never the true bottom of the screen.
- **Not capped at the stats/counts strip.** The tray runs to the foot of the viewport and paints over it; panel.css raises the tray's z-index in the `short` tier so that is actually true rather than merely intended.
- **The dim overlay stops above the stats strip**, which is a separate question from the tray's own extent — see below.

## Why the tabbar is a hard floor

An earlier version reached the full screen and painted over the tabbar via a deliberate `main:has()` + z-index escalation. The tabbar's icon row then covered the tray's own sticky Clear/Close footer, by an amount that varied with how far the tray's bottom edge happened to overlap it — so the primary control for closing the tray was sometimes unreachable and sometimes fine.

Landing the cap just above the tabbar makes the footer never-covered, full stop, rather than usually-not-covered. The FAB (`.mobile-tab-fab`) is the deliberate exception: it already floats above the tabbar's top edge by design, so it still pokes over the tray's edge — it covers no interactive content doing so, which is the distinction that matters.

Both clearances are derived from the FAB's own measured protrusion (`fabProtrusionAboveTabbar`, `fabOverlapClearance` in `layout/mobile-tabbar.js`), never from fixed pixel values, so they stay correct if the FAB's size or offset changes.

## Why the counts strip is not a floor

The `short` tier (ADR 0016) used to clamp the tray to the counts strip's top, reasoning that a strip sticky to the foot of the viewport is that tier's bottom furniture, playing the role the tabbar plays in portrait. That is the wrong reading.

The symptom it was solving was real — the tray's footer rendered underneath the counts, unreachable however far you scrolled — but the fix addressed it from the wrong end. The counts strip is not furniture the tray has to respect; it is list chrome the tray is entitled to cover while open, the same way it already covers the rows. Stopping short of it spent roughly 40px of the scarcest axis on this tier to keep three numbers visible that nobody reads mid-filter.

The tray now runs to the foot of the viewport, so its Clear/Close footer sits at the screen's bottom edge with nothing over it — which is what made the original symptom a bug rather than a layout choice.

## The distinction to hold on to

**Navigation is furniture; list chrome is content.** A tray that covers the list is doing its job — you opened it to change what the list shows. A tray that covers navigation, or that lets navigation cover its own controls, is a trap. When a new sticky element appears near the tray, that is the question to ask about it, not "is it at the bottom of the screen".

The dim overlay follows the same rule from the other side. It stops above the stats strip rather than taking its base `inset: 0` down behind it: the strip's own z-index already keeps it undimmed and clickable, but an overlay painting behind it still dims the list content right up against the strip's top border, which reads as that border darkening — purely from contrast against the newly-dark strip above it, though the border's colour never changes.

## Consequences

Both caps are recomputed on every call, not once at open: a `visualViewport` resize (mobile browser chrome showing or hiding, an on-screen keyboard animating in) changes how much screen is visible without firing any DOM resize, and in the `short` tier a scroll moves the sticky bar the tray is anchored to. A one-time-at-open measurement goes stale the moment either happens.

Everything is scoped to the tray's own `.list-card` rather than a page-specific id, so this works for any page built on the same `.list-card > .filter-bar` / `.filter-bar-overlay` / `.stats-strip` structure.
