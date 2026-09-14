/* Generic overflow tabs: any row of <button>/<a> tabs opting in via
   [data-overflow-tabs] (or the two cases already relying on it — Inclusion
   Panel's per-card .tab-row and any .card-switcher) scrolls horizontally
   once it overflows, rather than hiding whichever tabs don't fit behind a
   "More ▾" dropdown (#131 — that dropdown duplicated every hidden tab's
   label in a floating menu, disliked, and needed a design pass). Drag/swipe
   to scroll, with a fade at whichever edge has more content, and selecting
   a tab scrolls it to the centre of the row so it's never left half-hidden.

   Promoted out of main.js as a real export (was window.setupOverflowTabs) -
   its own caller in home.js (a tab row swapped in fresh via AJAX, e.g.
   Inclusion Panel Home's My Actions card refresh, needs this re-run on the
   new element, not just the page's original rows) is itself a module now,
   so it imports this directly instead of reaching through window. */

import { rafThrottle } from './raf-throttle.js';
import { wireDragToScroll } from './drag-scroll.js';

export function setupOverflowTabs(row) {
    if (!row) return;
    var tabs = Array.prototype.slice.call(row.children).filter(function (el) {
        return el.tagName === 'BUTTON' || el.tagName === 'A';
    });
    if (tabs.length < 2) return;

    row.classList.add('overflow-scroll-row');
    var wrap = document.createElement('div');
    wrap.className = 'overflow-scroll-wrap';
    row.parentNode.insertBefore(wrap, row);
    wrap.appendChild(row);

    var fadeLeft = buildOverflowFade('left');
    var fadeRight = buildOverflowFade('right');
    wrap.appendChild(fadeLeft);
    wrap.appendChild(fadeRight);

    // Samples the actual background-colour of whatever tab is under each
    // edge, rather than assuming a fixed pair of colours — .card-switcher's
    // tabs alternate bg-page/bg-surface by active state, but .tab-row sits
    // on a single uniform background throughout, so hardcoding either
    // scheme would be wrong for the other call site.
    function sampleBackground(edgeX) {
        var el = document.elementFromPoint(edgeX, row.getBoundingClientRect().top + row.clientHeight / 2);
        var tab = el && el.closest('button, a');
        return getComputedStyle(tab || row).backgroundColor;
    }

    function measure() {
        // Epsilon wider than a plain rounding guard (was 2px) — on a
        // fractionally-scaled display (e.g. Windows 125%/150% scaling)
        // scrollWidth/clientWidth carry sub-pixel remainders, so even a
        // fully-scrolled row can sit >2px short of scrollWidth and never
        // clear has-more-right, leaving the edge fade permanently drawn
        // over the last tab (reads as a soft clip on its label).
        wrap.classList.toggle('has-more-left', row.scrollLeft > 4);
        wrap.classList.toggle('has-more-right', row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
        var rowRect = row.getBoundingClientRect();
        fadeLeft.style.backgroundColor = sampleBackground(rowRect.left + 8);
        fadeRight.style.backgroundColor = sampleBackground(rowRect.right - 8);
    }
    /* Throttled on every async trigger, not just resize: measure() runs two
       document.elementFromPoint hit-tests plus a getComputedStyle per call
       (sampleBackground, above), and scroll fires far more often than resize
       does. One coalesced run per frame is all the fades can actually paint
       anyway. The initial call below stays direct so the fades are correct on
       the first frame rather than one rAF late.

       The window listener is kept alongside the ResizeObserver here (unlike
       the carousels, where it was redundant): measure() samples a colour by
       viewport coordinate, so it has to re-run when the row merely MOVES,
       which a size-only observer never reports. */
    var measureSoon = rafThrottle(measure);
    row.addEventListener('scroll', measureSoon, { passive: true });
    window.addEventListener('resize', measureSoon);
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(measureSoon).observe(row);
    }
    measure();

    setupOverflowDragScroll(row);

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            // Only when the row itself actually overflows - otherwise
            // there's nothing for scrollIntoView to do *within* row, so it
            // walks up to the next scrollable ancestor instead (the page
            // itself) and scrolls that to satisfy inline:'center',
            // shifting the whole layout sideways on desktop widths where
            // every tab already fits (live feedback: "changing tab in My
            // Actions shifts the whole page, cuts off the global menu").
            if (row.scrollWidth <= row.clientWidth + 1) return;
            tab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        });
    });
}

function buildOverflowFade(side) {
    var fade = document.createElement('div');
    fade.className = 'overflow-scroll-fade overflow-scroll-fade--' + side;
    return fade;
}

// Pointer-based drag-to-scroll, via the one shared implementation (#214 -
// drag-scroll.js, which six copies of this folded into). The three things
// this row needs that a carousel does not, each an option there rather than
// a fork here:
//
//   touch: true            - devtools mobile emulation and non-touch
//                            trackpads never get native touch-scroll for
//                            free, and this row has to work in both.
//   moveBeforeThreshold    - the row starts moving from the first pixel;
//                            the threshold only decides whether the click
//                            that follows gets suppressed, so dragging
//                            never also switches tab.
//   endOnPointerLeave,     - the drag ends the moment the pointer leaves
//   pointerCapture: false    the row, rather than tracking globally.
//
// requireOverflow is off too: a row measures its own overflow constantly
// (measure(), above), and gating pointerdown on it as well would just mean
// a second, staler answer to the same question.
function setupOverflowDragScroll(el) {
    wireDragToScroll(el, {
        touch: true,
        threshold: 5,
        moveBeforeThreshold: true,
        pointerCapture: false,
        endOnPointerLeave: true,
        requireOverflow: false,
        draggingClass: 'overflow-scroll-dragging',
    });
}
