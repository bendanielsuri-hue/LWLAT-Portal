/* Horizontal scroll-snap carousel.

   A component: it is wired to an element and knows nothing about what the
   cards contain. ADR 0020's example of the nature test - a carousel does not
   become domain-specific by being pointed at referrals.

   THIS IS ONE OF THREE CAROUSEL IMPLEMENTATIONS, and its click-drag is one of
   six copies of drag-to-scroll. Consolidating them is #214; this move is only
   the promotion the taxonomy already assigned, so the duplication is unchanged
   and is catalogued in main-js-inventory.md section 6. */

import { rafThrottle } from './raf-throttle.js';

// Horizontal scroll-snap carousel: a .*-carousel-wrap holding a scrolling
// track plus prev/next arrow buttons that nudge scrollLeft by one card
// width, auto-hiding themselves when the track doesn't actually overflow.
// Top-level (not nested in the DOMContentLoaded sweep, unlike its own
// original call sites below) so setupFilterBarMoreFilters (above) can reuse
// it directly for the narrow-tablet filter panel's own category carousel
// (#135 follow-up, live feedback: "add left and right arrows like we do
// with carousels") instead of reimplementing the same nudge/hide logic a
// third time. Returns updateArrows so a caller whose track content changes
// after setup (measure()'s own remeasure/rebuild, unlike the senco/stats
// carousels' static card lists) can re-run just the overflow check without
// re-registering the click handlers each time - re-calling this whole
// function on every remeasure would stack a fresh, duplicate click listener
// on the same prev/next buttons instead.
//
// options.scrollTo(track, direction) replaces what one arrow press moves,
// for a track whose items are NOT equal width. The default below nudges by
// one card plus the gap, which is exact for a carousel of uniform cards
// (senco/stats/referral/action all are) and lands mid-item for anything
// else - a filter row, where a toggle sits beside "Concern Category", can
// leave a dropdown half shown after a press that was meant to reveal it.
// Everything else - the wheel redirect, drag-to-scroll, arrow auto-hide and
// the edge state - is identical either way, which is the whole reason to
// pass a stepper rather than fork the function.
export function wireScrollCarousel(wrap, trackSelector, cardSelector, prevSelector, nextSelector, options) {
    var track = wrap.querySelector(trackSelector);
    var prevBtn = wrap.querySelector(prevSelector);
    var nextBtn = wrap.querySelector(nextSelector);
    if (!track || !prevBtn || !nextBtn) return;

    function step() {
        var card = track.querySelector(cardSelector);
        return card ? card.offsetWidth + 12 : track.clientWidth;
    }

    var customScroll = options && options.scrollTo;
    prevBtn.addEventListener('click', function () {
        if (customScroll) { customScroll(track, -1); return; }
        track.scrollBy({ left: -step(), behavior: 'smooth' });
    });
    nextBtn.addEventListener('click', function () {
        if (customScroll) { customScroll(track, 1); return; }
        track.scrollBy({ left: step(), behavior: 'smooth' });
    });

    // A mouse wheel only ever reports deltaY, so without this a horizontal-
    // only track (nothing to scroll vertically) just ignores the user's wheel
    // entirely - the arrows/drag-scroll were the only way to move it. Redirects
    // vertical wheel input into horizontal scroll, same convention browsers
    // themselves use for a horizontal <select>/overflow-x region. Only when
    // deltaY actually dominates deltaX - a real trackpad two-finger horizontal
    // swipe already reports deltaX and should pass through untouched rather
    // than being doubled up. { passive: false } so preventDefault can actually
    // stop the page itself from scrolling vertically while this redirects it.
    track.addEventListener('wheel', function (e) {
        if (track.scrollWidth <= track.clientWidth) return;
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        track.scrollLeft += e.deltaY;
        e.preventDefault();
    }, { passive: false });

    // Click-and-drag scroll for a mouse (touch already gets native
    // momentum-scroll from overflow-x: auto, and a pen isn't a horizontal-
    // drag gesture users expect here) - a strip this narrow relative to its
    // content otherwise only moves via the arrows or the wheel redirect
    // above, neither of which is how a mouse user instinctively tries to pan
    // a horizontal strip first (grabbing and dragging it). DRAG_THRESHOLD
    // defers "is this actually a drag" until real movement happens, so a
    // plain click still reaches whatever's under the pointer (a filter's
    // <select> trigger, a toggle) untouched - only once threshold is crossed
    // does this (a) start actually moving scrollLeft and (b) arm the one-shot
    // capturing click-suppressor below, so the click a real drag would
    // otherwise fire on release never reaches - and spuriously activates -
    // whatever the drag happened to start on top of.
    var DRAG_THRESHOLD = 6;
    var drag = null;
    track.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        if (track.scrollWidth <= track.clientWidth) return;
        drag = { startX: e.clientX, startScroll: track.scrollLeft, moved: false, id: e.pointerId };
    });
    track.addEventListener('pointermove', function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        var dx = e.clientX - drag.startX;
        if (!drag.moved) {
            if (Math.abs(dx) < DRAG_THRESHOLD) return;
            drag.moved = true;
            track.setPointerCapture(drag.id);
            track.classList.add('is-dragging');
        }
        track.scrollLeft = drag.startScroll - dx;
    });
    function endDrag(e) {
        if (!drag || e.pointerId !== drag.id) return;
        if (drag.moved) {
            track.classList.remove('is-dragging');
            var suppressClick = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
            track.addEventListener('click', suppressClick, { capture: true, once: true });
        }
        drag = null;
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    function updateArrows() {
        var overflowing = track.scrollWidth > track.clientWidth + 1;
        prevBtn.hidden = !overflowing;
        nextBtn.hidden = !overflowing;
        // Grab cursor only advertises drag when there's actually something to
        // drag - an unaffordanced default cursor on a track that's already
        // fully visible would be a lie.
        track.classList.toggle('is-draggable', overflowing);
        // is-at-edge (live feedback, the filter category strip specifically:
        // "They also cover up the first and last dropdown if scrolled all
        // the way. Can the arrow fade to nothing if scrolled all the way?")
        // - a fully-scrolled-to-one-end track has nothing left for that end's
        // own arrow to do, so it just sits there obscuring the now-fully-
        // revealed first/last card underneath instead of affording anything.
        // No CSS keys off this any more: the filter category strip that
        // asked for it has since dropped its arrows entirely (it wraps
        // instead of scrolling), and the carousels this function is still
        // shared with (senco/stats/referral/action) never styled it. Kept
        // because the state is real and correct - a future arrow that wants
        // to fade at the ends has the hook waiting.
        if (overflowing) {
            var maxScroll = track.scrollWidth - track.clientWidth;
            prevBtn.classList.toggle('is-at-edge', track.scrollLeft <= 1);
            nextBtn.classList.toggle('is-at-edge', track.scrollLeft >= maxScroll - 1);
        }
    }
    updateArrows();
    track.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', rafThrottle(updateArrows));
    return updateArrows;
}
