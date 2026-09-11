# The filter tray's height animates in CSS; JS never measures it

`.filter-bar-collapsible` opens and closes on a plain CSS `height: 0` ↔ `height: auto` transition, gated by `.tray-open` (panel.css) and made animatable by the site-wide `interpolate-size: allow-keywords` opt-in (layout.css). No JavaScript reads, caches or sets the tray's height. `expand-collapse.js` sets only what CSS genuinely cannot know — how long `.is-expanded` survives a close, and `positionFilterTray`'s `top`/`left`/`width`/`max-height`.

Do not reintroduce a measurement step. It looks necessary and is not.

## Why this is worth an ADR

A browser cannot animate a plain `height` transition to or from `auto` — it resolves the target in a single frame regardless of the declared duration. That is the fact everyone rediscovers, and every workaround for it is a plausible-looking dead end. Four were tried on this element before `interpolate-size` landed:

- **`grid-template-rows: 0fr` ↔ `minmax(0, 1fr)`.** Establishes the correct final height instantly, bounded to what's available, scrolling internally when the field grid is taller — which a fixed `height` cannot express up front, since long option text and variable field counts change it per render. But there is no visible transition on the grid property: probing via `getAnimations()` and computed styles showed the browser resolving the target in one frame whatever duration was declared.
- **A Web Animations API keyframe.** Only ever animated the CLOSE direction. By the time `animate()` runs, the class is already toggled and the grid has already resolved its real height, so open has nothing committed to animate *from*.
- **A FLIP-pattern height transition** — pin *before* as an inline style, force a commit with an `offsetHeight` read, hand *after* to a real CSS transition next frame. Still opened instantly. Root cause, found by comparing `box.style.height` mid-transition against the rendered height: this element also carries `flex: 1 1 0%` (needed so the tray grows to fill `.list-card`'s available space). `flex-basis: 0%` makes the flex algorithm ignore an explicit height entirely and recompute from `flex-grow` every frame, so the inline height was being silently overridden back to full size. Working around *that* meant opting the box out of flex sizing for the animation's duration and restoring `flex: 1 1 0%` afterwards — a second workaround stacked on the first.
- **JS measuring the natural height and handing CSS a fixed number.** This is the one that shipped for a while. It needs the box hidden while measured, and the measurement is unreliable for a frame or two on a genuinely auto-sized tray, so it needs a ResizeObserver settle-wait too — which is a visible delay before the tray starts opening at all, on top of a "bounce" bug when the read landed early.

`interpolate-size: allow-keywords` removes the problem at its root rather than working around it: the browser computes the tray's real height itself, every frame, the same way it always could for any other animatable property. Nothing is left for JS to measure, wait for, or get transiently wrong.

## What the remaining JS is for, and why none of it is a measurement

Three things in `expand-collapse.js` look like leftovers from the old technique and are not:

**Two forced reflows (`void box.offsetHeight`), one before the class change and one after.** They are not interchangeable and neither is redundant. The one *after* is what `calc-size()` needs to register a height transition at all. But running only that one means a normal property like `opacity` never gets a committed "before" frame — the browser batches the whole before/after cycle into one synchronous tick and skips the transition outright, which is why the inner content and sticky footer snapped instead of fading. The one *before* gives opacity its starting frame.

**`.is-expanded` stays on for the entire close.** Several tray styles are scoped to `.filter-bar.is-expanded`, so stripping it up front means the whole shrink plays out with the box visibly fallen back to non-tray styling — not a one-frame flash, the entire animation.

**The `transitionend` fallback timer reads the computed `transition-duration`.** It must never be a hardcoded number. A flat guess went stale the moment the CSS duration grew and was not updated alongside it, firing a full transition-length early on every close: that strips every `is-expanded`-gated style mid-shrink and restores `overflow-y` mid-animation, which feeds back into corrupting `calc-size()`'s own live `auto` recomputation for the rest of the close. It surfaces as a border flash, a height stall, section labels vanishing and fields shifting horizontally — on close only, which is what makes it hard to attribute.

## Consequences

`interpolate-size: allow-keywords` is a Chromium feature. On an engine without it the tray opens and closes instantly — no animation, no broken layout, and every position and cap still correct, since none of them depend on it. That is the accepted degradation, and it is why the opt-in sits site-wide in layout.css rather than being feature-detected here.

The tray is also the only element in the app relying on this. A second one should use the same CSS-only approach rather than growing a shared "animate to auto height" JS helper — the helper is the thing this ADR exists to prevent.
