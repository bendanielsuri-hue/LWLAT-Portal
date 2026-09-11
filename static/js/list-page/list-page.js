/* The list-page tier's payoff: one call a page's own entry module makes
   instead of hand-wiring the facts strip, stack mode, button-row overflow,
   filter-bar active state and infinite scroll separately.

       import { initListPage } from '…/list-page/list-page.js';
       initListPage(document.querySelector('#students-filtered-content'), {
           filterBar: document.querySelector('.filter-bar'),
           buttonRowSelector: '.btn-row',
       });

   ⚠️ IN PROGRESS - #210, slice E. Assembled but NOT yet imported by any page
   template - panel.js still holds the five inline copies of this wiring
   (students.html, referrals.html, actions.html, escalations.html,
   meetings.html) that actually run. Switching a page over is #211's job, one
   page at a time (taxonomy.md §4 - a module entry coexists with the classic
   scripts already loaded, so this is safe to do incrementally).

   `filterBar` is read off `window.wireFilterBarActiveState` rather than
   imported - that function is still a window global on purpose (#212 hasn't
   run yet: its callers are six inline <script> blocks, and moving its file
   and its calling convention in the same step would change six templates
   for two reasons at once, per its own header comment). This module reaches
   for the same global rather than inventing a second way to call it, and
   drops the reference cleanly once #212 gives it a real export.

   Owns the one thing none of facts-strip/stack-mode/button-row-overflow
   owns individually: the measurement-cache generation counter, and the
   MutationObserver/resize listeners that decide when to bump it. Each
   sub-module takes the counter as a parameter (their own headers explain
   why) - this is the "orchestrator" their comments already refer to. */

import { initFactsStrip } from './facts-strip.js';
import { initStackMode } from './stack-mode.js';
import { initButtonRowOverflow } from './button-row-overflow.js';
import { wireListInfiniteScroll } from '../components/infinite-scroll.js';
import { rafThrottle } from '../components/raf-throttle.js';
import { debounceTrailing } from '../components/debounce.js';

export function initListPage(root, options) {
    if (!root) return;
    options = options || {};
    var generation = 0;

    var factsStrip = initFactsStrip(root);
    var stackMode = initStackMode(root, { rowSelector: options.stackRowSelector });
    var buttonRowOverflow = initButtonRowOverflow(root, { rowSelector: options.buttonRowSelector });

    /* Same order panel.js's own refresh ran in, and for the same reasons
       (each step's own comment has the detail):
       1. Calibrate + apply the stack decision first - it decides which
          format (per-list or per-row column widths) every measurement
          below runs inside.
       2. Re-measure the facts strip in whatever format that left it in -
          calibration deliberately measures unstacked and restores the
          prior state, so this is not redundant even when the decision
          didn't change.
       3. Button-row overflow, after the strip - hiding a row's icons
          changes how wide its buttons are, so measuring anything button-
          width-dependent first would size against numbers about to change.
       4. Edge fades last - they read the strip's final scroll geometry. */
    function refresh() {
        stackMode.calibrate(generation, factsStrip.measure);
        stackMode.update();
        factsStrip.measure(generation);
        buttonRowOverflow.update(generation);
        factsStrip.markEdges();
    }

    refresh();

    // Two different triggers with two different urgencies (the resize
    // stutter this generation counter exists to fix - see facts-strip.js).
    // Content changes are urgent and rare: new rows have no widths at all
    // until this runs, so they refresh on the next frame, and they're the
    // one thing that genuinely invalidates the cached measurements. Resizes
    // are the opposite - frequent, and never invalidating - so they only
    // re-run the width-dependent decisions, and only once the drag has
    // actually stopped.
    var refreshSoon = rafThrottle(refresh);
    function refreshAfterContentChange() {
        generation++;
        refreshSoon();
    }
    var refreshAfterResize = debounceTrailing(refresh, 120);

    if (typeof MutationObserver !== 'undefined') {
        // childList only, never attributes - this refresh's own work IS a
        // pile of style/class writes on this root's descendants, so an
        // attribute-sensitive observer here would re-trigger itself.
        new MutationObserver(refreshAfterContentChange).observe(root, { childList: true, subtree: true });
    }
    window.addEventListener('resize', refreshAfterResize);
    // A window resize isn't the only way this root's own width changes -
    // the sidebar collapsing/expanding resizes the content column with no
    // 'resize' event of its own. A per-root ResizeObserver catches that too.
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(refreshAfterResize).observe(root);
    }
    // Phone chrome swaps the column-width scope from per-list to per-row
    // (facts-strip.js's syncFactsColumnWidths) - i.e. which element the
    // cached measurements belong to - so crossing it has to invalidate
    // them rather than wait for the resize debounce.
    if (window.matchMedia) {
        window.matchMedia('(max-width: 480px)').addEventListener('change', refreshAfterContentChange);
    }
    // Late webfont swaps change text metrics - and so every natural width
    // already measured - without any resize or DOM mutation firing to say
    // so. Cheap one-off correction after the page finishes loading.
    window.addEventListener('load', refreshAfterContentChange);

    wireListInfiniteScroll(root);

    if (options.filterBar && typeof window.wireFilterBarActiveState === 'function') {
        var refreshFilterState = window.wireFilterBarActiveState(options.filterBar);
        // One delegated listener covers every field this filter bar will
        // ever hold, present or future - the badge/highlight only need to
        // know THAT something changed, never which field, so there is no
        // page-specific wiring left for a page's own entry module to do.
        options.filterBar.addEventListener('change', refreshFilterState);
        options.filterBar.addEventListener('input', refreshFilterState);
    }
}
