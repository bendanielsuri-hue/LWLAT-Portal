# A height-based `short` tier for landscape phones, and a right-hand nav strip

The breakpoint registry (`static/css/layout/responsive.css`) was deliberately width-only: six tiers, every one a `max-width`, with an explicit instruction to add a tier there before using a new number anywhere. This ADR opens a second axis. That is the part worth explaining.

## The problem

A phone in landscape is 667–932px wide and 375–430px tall. Every width tier reads that as a tablet, so it got tablet chrome: the hub sidebar's collapsed icon rail, no tab bar, no FAB (the FAB is a child of `.mobile-tabbar`, so it disappears with it — see ADR 0013).

Nothing was strictly *unreachable* in that state — the rail still navigates, and the FAB only ever proxy-clicked the real page-header button, which is visible at those widths. But the rail is a vertical list of every menu entry plus search and headers, and it does not fit in 430px of height. The layout was tablet-shaped on a surface with no tablet's worth of vertical space.

## Why not just prevent landscape

Considered and rejected on two grounds.

It doesn't work: `screen.orientation.lock()` requires fullscreen and **Safari does not implement it at all**, so every iPhone user in Safari can rotate regardless. A PWA manifest's `orientation: "portrait"` only applies to an installed standalone app (and this is not a PWA); iOS support is partial and version-dependent. The only universally-effective method is a CSS "please rotate your device" overlay.

That overlay is also the one thing we must not ship: WCAG 2.2 SC 1.3.4 (Orientation, AA) prohibits restricting content to a single display orientation unless essential, academy trusts are generally in scope for the UK public sector accessibility regulations, and it breaks anyone whose device is fixed in a landscape mount. Landscape is going to happen; the only real question was what it renders.

## Decision

A `short` tier: **touch input AND `max-height: 500px`** takes phone chrome.

- **Height, not `orientation: landscape`.** A landscape iPad is also landscape and must keep the rail. At 744px+ tall it clears the ceiling; a landscape phone at 430px does not.
- **Touch-gated**, or a short *desktop* browser window would sprout a phone tab bar. Width and touch are independent signals (INT-R1).
- **500px** sits between the tallest landscape phone (430, iPhone 16 Max) and the shortest landscape tablet (744, iPad Mini), with room for larger phones.

Because it depends on touch as well as size, this tier **cannot be expressed as a media query**. It resolves to two classes — `html.phone-chrome` and `html.phone-chrome-side` — computed synchronously in `templates/layout.html`'s head script before first paint (the FOUC-avoidance pattern `nav-touch-mode` and `filter-bar-mobile-mode` already use) and maintained afterwards by `syncPhoneChromeClass()` in `main.js`. The rules that used to sit in `@media (max-width: 480px)` and are shared by both tiers moved onto `html.phone-chrome`.

### Which rules moved, and which didn't

The phone tier's rules split cleanly by *why* they exist, and only one half generalises:

| Rule | Driven by | In `short`? |
|---|---|---|
| Hub sidebar hidden, tab bar shown | nav — rail doesn't fit vertically | yes |
| Breadcrumbs hidden | saves vertical space | yes |
| Filter bar collapses to tap-to-expand | saves vertical space | yes |
| Quick-nav row re-enabled | sidebar is gone behind "Menu" | yes |
| Switch School inside Appearance | Settings tab opens Appearance directly | yes |
| `.main-inner` 12px margins | narrow width | **no** |
| Page-header actions hidden | narrow width | **no** |

Page-header actions are the one that looks inconsistent and isn't: the header row exists to carry the page title regardless, so a button in it costs **zero** additional vertical space — the only scarce axis here. Meanwhile the FAB's whole justification was that the header button was hidden at phone width, which is untrue at 932px. So landscape shows both, and they are not redundant so much as differently-priced.

## The bar rotates to a right-hand strip

`flex-direction: column` on the same `.mobile-tabbar` markup — not a second component. One markup order stays the single source of truth for the five slots, so rotating the device rotates the bar and nothing moves relative to its neighbours.

**Right edge, not left.** iOS's interactive swipe-back gesture owns the left screen edge, so a strip there fights the system gesture on every tap and drag. This costs the portal its usual left-hand nav position and departs from Material's leading-edge rail, both accepted: a nav element you cannot reliably tap is worse than one that moved.

It also spends the right axis — ~56px of the abundant 667–932px width instead of ~47px of the scarce 430px height, buying back roughly 11% of the usable viewport, and clearing the bottom edge where iOS's home indicator lives.

The FAB's "punched through the bar" negative margin becomes `margin-left` rather than `margin-top`: it straddles whichever edge faces the content. Transient sheets (`dialog.modal-dialog`, `.side-nav.overlay-nav`, `.mobile-more-sheet`) become right-anchored full-height panels instead of bottom sheets — 80vh of 430px covers the screen, and a bottom sheet would slide out of an edge that no longer holds its trigger (INT-R2).

Tabs get `clamp(48px, 13vh, 64px)` rather than the portrait bar's `flex: 1 1 0`. Justifying five slots down 430px would push the outermost to the very top and bottom, and in a landscape grip the thumb pivots from the bottom corner — bigger targets only help among targets you can reach.

## Consequences

- The registry now has two axes. A new rule must ask which one it belongs to; "phone chrome" and "narrow width" are no longer the same question.
- Anything that means "phone chrome is active" must read `html.phone-chrome`, **not** `matchMedia('(max-width: 480px)')`. The FAB-wheel setup guard in `_hub_sidebar.html` was one such site and was migrated; `isFilterBarMobile()`/`isFilterBarNarrowDesktop()` in `main.js` were updated to match the head script, since those two disagreeing is exactly the drift the head script warns about.
- Device detection is still nowhere in the codebase, and this doesn't introduce any. Size remains the only signal, which is what makes foldables fall out correctly for free: a Galaxy Z Fold is ~350px wide folded (phone chrome) and ~880×2200 unfolded (tablet chrome, since it is neither narrow nor short).
