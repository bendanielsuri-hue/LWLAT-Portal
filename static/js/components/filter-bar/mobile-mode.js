/* Which of the filter bar's two layout modes applies right now - the
   question main.js's own syncFilterBarMobileClass (still there; it also
   owns the document-class toggle, the mode-switch transition guard, and
   re-running each tray's dynamic-overflow measurement, none of which this
   module's own callers need) answers on every relevant media-query change.
   Promoted out as real exports (was window.isFilterBarMobile/
   window.isFilterBarNarrowDesktop) so expand-collapse.js/more-filters.js -
   both modules already - can import them directly. */

import { phoneMql, narrowMql, portraitMql, portraitWideMql, isTouchNav, isShortTouch } from '../../layout/breakpoints.js';

/* (#187) Every width uses the tray now - live feedback: "I think we make
   all the filter modes work like mobile. It's a great compromise!"

   This was the one tier test in the filter bar: true meant the slide-down
   tray, false meant the "View filters" panel and the dynamic-overflow
   measurement that fills it. Two rendering paths, two sets of rules to
   keep in step, and the reason several bugs on this branch only appeared
   at one width - the panel path is where "View filters" stopped opening,
   and it needed its own copy of the section-scroll wiring.

   Kept as a function rather than deleted at every call site: the callers
   still read better saying WHY they branch, the widths are still real
   (isFilterBarNarrowDesktop below still distinguishes them for styling),
   and if the panel ever comes back this is the one line to restore.

   The old expression, for that day:
     phoneMql.matches || isShortTouch() ||
     (narrowMql.matches && !isTouchNav()) ||
     (isTouchNav() && portraitMql.matches && !portraitWideMql.matches) */
export function isFilterBarMobile() {
    return true;
}

// The narrow-desktop sub-case specifically (filter-bar-mobile-mode minus
// true phone width) - live feedback: "all I can see is the overlay" -
// the tray's own position: fixed; left: 0; right: 0 (panel.css) is a
// viewport-anchored floating tray, correct on a real phone (no side nav,
// full-bleed card flush with the viewport edge) but wrong once the side
// nav stays put: the tray span no longer matches the (inset) filter bar
// above it. Originally solved by pushing the list down instead of
// floating over it in this state; reverted (live feedback: "I like the
// slide over the top that mobile does... can we do this for portrait
// tablet as well") once positionFilterTray started anchoring left/width
// to the bar's own rect (INT-R2) instead of the raw viewport edge, which
// fixes the misalignment without giving up the floating overlay. This
// class is now purely a styling hook (square tray corners, sticky-
// footer variant, category-strip panel at wider widths) - not a
// positioning branch.
export function isFilterBarNarrowDesktop() {
    return !phoneMql.matches && !isShortTouch() && ((narrowMql.matches && !isTouchNav()) || (isTouchNav() && portraitMql.matches && !portraitWideMql.matches));
}
