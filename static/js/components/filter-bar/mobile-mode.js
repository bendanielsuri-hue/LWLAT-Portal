/* Which of the filter bar's two layout modes applies right now, and
   initFilterBarMobileMode (bottom of this file) which keeps the document
   classes every affected CSS rule keys off in step with it. Both were
   promoted out of main.js - isFilterBarMobile/isFilterBarNarrowDesktop
   first (were window.isFilterBarMobile/window.isFilterBarNarrowDesktop, so
   expand-collapse.js/more-filters.js could import them directly), then
   the orchestrator itself once it was clear this is where the state it
   drives actually belongs, not portal-wide boot glue. */

import { phoneMql, narrowMql, shortMql, portraitMql, portraitWideMql, isTouchNav, isShortTouch, onTouchNavChange } from '../../layout/breakpoints.js';

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

// Keeps html.filter-bar-mobile-mode/filter-bar-narrow-desktop in step with
// the two functions above on every relevant media-query change. Called
// once from main.js's own boot sequence.
export function initFilterBarMobileMode() {
    function syncFilterBarMobileClass() {
        // filter-bar-mode-switching (panel.css: forces transition: none on
        // .filter-bar-collapsible) - live feedback: "I saw [the tray reduce
        // in height, leaving a thin line] when I switched to portrait
        // tablet mode" - resizing/rotating into or out of mobile mode while
        // a page is already open re-triggers the exact same height/border-
        // bottom-color transition the layout.html head script's own
        // synchronous classification (same bug, same fix, on first paint)
        // was written to prevent - that fix only covers the very first
        // paint, not a live reclassification like this one. Without this
        // guard, .filter-bar-collapsible flips between display: contents
        // (no box, live at its full open content height) and the mobile
        // box (height: 0, a real transition property) in the same
        // recalculation triggered by this class toggle, so the browser
        // interpolates from that full height down to 0 - visibly, and
        // (confirmed via Playwright) with a wildly wrong intermediate
        // `top` too, since position: fixed's own static-position fallback
        // recomputes every frame as the box's height/flow changes mid-
        // transition. Only guards an actual VALUE change (below), not
        // every call - this also fires on every touch-nav toggle
        // (onTouchNavChange, breakpoints.js), most of which don't actually
        // flip either class.
        var wasMobile = document.documentElement.classList.contains('filter-bar-mobile-mode');
        var wasNarrow = document.documentElement.classList.contains('filter-bar-narrow-desktop');
        var nowMobile = isFilterBarMobile();
        var nowNarrow = isFilterBarNarrowDesktop();
        var modeChanged = wasMobile !== nowMobile || wasNarrow !== nowNarrow;
        if (modeChanged) document.documentElement.classList.add('filter-bar-mode-switching');
        document.documentElement.classList.toggle('filter-bar-mobile-mode', nowMobile);
        document.documentElement.classList.toggle('filter-bar-narrow-desktop', nowNarrow);
        // Re-run each tray bar's own dynamic-overflow measurement
        // (setupFilterBarMoreFilters's measure(), exposed as
        // bar._filterBarMeasure) on every call here, not just a genuine
        // bar.clientWidth change - this function also fires from a touch-
        // nav-only transition (onTouchNavChange, breakpoints.js), which flips
        // filter-bar-mobile-mode without necessarily resizing anything.
        // Skipping this left fields that measure() had already buried
        // behind the hidden "More filters" group (built while still non-
        // mobile) stuck there once mobile-mode's own CSS hid the only
        // control that could reveal it again - live feedback: "lost the
        // close and clear button" (they render, just via the wrong,
        // desktop-only .filter-actions-right placement, because the field
        // grid itself never made it back into the tray).
        document.querySelectorAll('.filter-bar-tray').forEach(function (trayBar) {
            if (trayBar._filterBarMeasure) trayBar._filterBarMeasure();
        });
        // Removes the guard one frame later (below), not synchronously -
        // the class toggle/measure() calls above still need to actually
        // commit and paint with transitions suppressed first; removing the
        // guard in the same tick would let the *next* recalculation (this
        // one) re-enable the transition before the browser ever renders a
        // frame with it off, defeating the whole guard.
        if (modeChanged) {
            requestAnimationFrame(function () {
                document.documentElement.classList.remove('filter-bar-mode-switching');
            });
        }
    }
    syncFilterBarMobileClass();
    phoneMql.addEventListener('change', syncFilterBarMobileClass);
    shortMql.addEventListener('change', syncFilterBarMobileClass);
    narrowMql.addEventListener('change', syncFilterBarMobileClass);
    portraitMql.addEventListener('change', syncFilterBarMobileClass);
    portraitWideMql.addEventListener('change', syncFilterBarMobileClass);
    onTouchNavChange(syncFilterBarMobileClass);
}
