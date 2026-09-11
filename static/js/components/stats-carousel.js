/* THIS IS THE SECOND OF THREE CAROUSEL IMPLEMENTATIONS in the codebase -
   carousel.js (wireScrollCarousel) is the first, home.html's referral
   carousel the third. Consolidating them is #214, held out of this
   promotion by ADR 0020's constraint 2; this move is only the promotion
   the taxonomy already assigned, so the duplication is unchanged. See
   main-js-inventory.md section 6.

   Home's KPI row carousel (#116, rebuilt #132 for the "stack" effect,
   simplified again - PROTOTYPE, live feedback: "we do not have an active
   state for cards, it just scrolls. No dots, just a left and right arrow to
   indicate there is more off screen"). No active card any more - every card
   is always full size and fully clickable, so there's nothing to centre, no
   per-card state to track, and no "peeking card" to disambiguate a tap
   against. Arrows/fade just read raw scroll position
   (start/end/overflowing); nothing here needs to know which card, if any, is
   "the" one. Generic per-.stats-carousel-wrap (forEach, not a singleton) -
   unlike My Referrals/My Actions (home.html, page-specific), this was always
   meant to be reusable by another KPI row. */

import { rafThrottle } from './raf-throttle.js';

// Home's KPI row carousel (#116, rebuilt #132 for the "stack" effect,
// simplified again - PROTOTYPE, live feedback: "we do not have an
// active state for cards, it just scrolls. No dots, just a left and
// right arrow to indicate there is more off screen"). No active card
// any more - every card is always full size and fully clickable, so
// there's nothing to centre, no per-card state to track, and no
// "peeking card" to disambiguate a tap against. Arrows/fade just read
// raw scroll position (start/end/overflowing); nothing here needs to
// know which card, if any, is "the" one. Generic per-.stats-carousel-
// wrap (forEach, not a singleton) - unlike My Referrals/My Actions
// (home.html, page-specific), this was always meant to be reusable by
// another KPI row.
export function initStatsCarousels() {
    document.querySelectorAll('.stats-carousel-wrap').forEach(function (wrap) {
    var track = wrap.querySelector('.stats-carousel-track');
    var prev = wrap.querySelector('.stats-carousel-arrow--prev');
    var next = wrap.querySelector('.stats-carousel-arrow--next');
    var fadeL = wrap.querySelector('.stats-carousel-fade-l');
    var fadeR = wrap.querySelector('.stats-carousel-fade-r');
    if (!track || !prev || !next) return;

    function slots() {
        return Array.prototype.slice.call(track.children);
    }

    function step() {
        var slot = slots()[0];
        if (!slot) return track.clientWidth;
        var style = window.getComputedStyle(track);
        return slot.getBoundingClientRect().width + (parseFloat(style.columnGap || style.gap) || 0);
    }

    // "Fits without scrolling" check, independent of the carousel's own
    // edge inset (which would otherwise force scrollWidth to overflow
    // on its own, making a plain scrollWidth/clientWidth comparison
    // useless for deciding *whether to carry that inset at all*). Sums
    // each card's own offsetWidth + the row's real gaps against
    // track.clientWidth, which stays ~constant regardless of which
    // mode's padding is currently applied (that padding eats into the
    // content box, it doesn't change the track's own outer width).
    //
    // PROTOTYPE: never true at <=900px (matches panel.css's own
    // ≤900px auto-width block) - live feedback, screenshot: shrinking
    // the cards there (auto width + smaller everything) made all 6
    // technically fit unwrapped, which this function correctly
    // detected and switched to grid/wrap mode over - but that's the
    // wrong call at this width. Grid mode was meant for a couple of
    // KPI cards on a wide desktop screen where scrolling would be
    // silly, not for phone/tablet, where the carousel (arrows, fade,
    // drag) is the deliberately-built experience regardless of
    // whether the shrunk cards happen to squeeze in unwrapped.
    function fitsFlat() {
        if (window.matchMedia('(max-width: 900px)').matches) return false;
        var cards = slots();
        if (cards.length < 2) return true;
        var style = window.getComputedStyle(track);
        var gap = parseFloat(style.columnGap || style.gap) || 0;
        var total = gap * (cards.length - 1);
        cards.forEach(function (card) { total += card.offsetWidth; });
        return total <= track.clientWidth + 1;
    }

    function updateState() {
        var flat = fitsFlat();
        wrap.classList.toggle('is-flat', flat);

        if (flat) {
            // Grid mode: every card is already visible at once, so
            // there's nothing left for arrows/fade to drive.
            prev.hidden = true;
            next.hidden = true;
            if (fadeL) fadeL.style.opacity = 0;
            if (fadeR) fadeR.style.opacity = 0;
            return;
        }

        var overflowing = track.scrollWidth > track.clientWidth + 1;
        var atStart = track.scrollLeft <= 1;
        var atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 1;

        prev.hidden = !overflowing;
        next.hidden = !overflowing;
        prev.disabled = atStart;
        next.disabled = atEnd;
        if (fadeL) fadeL.style.opacity = (!overflowing || atStart) ? 0 : 1;
        if (fadeR) fadeR.style.opacity = (!overflowing || atEnd) ? 0 : 1;
    }

    prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); });
    next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: 'smooth' }); });
    track.addEventListener('scroll', updateState, { passive: true });
    window.addEventListener('resize', rafThrottle(updateState));
    wrap.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); track.scrollBy({ left: step(), behavior: 'smooth' }); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); track.scrollBy({ left: -step(), behavior: 'smooth' }); }
    });

    // Click-and-drag (mouse/pen only - touch already gets native
    // panning/flick from overflow-x: auto). No fling-to-settle any
    // more (that projected a release's momentum onto the nearest
    // card's centre - meaningless now that no card is "the" one to
    // settle on) - a mouse drag just stops wherever it's released,
    // same as touch already does.
    var isPointerDown = false;
    var dragMoved = false;
    var startX = 0;
    var startScrollLeft = 0;
    track.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch') return;
        // Grid mode: everything already fits, there's nothing to drag-
        // scroll to - skip starting a drag at all so a slightly-jittery
        // click can never get misread as one and swallowed below.
        if (wrap.classList.contains('is-flat')) return;
        // Without this preventDefault, a mousedown+move over a
        // .stat-card (a real <a>) kicks off the browser's own native
        // link drag-and-drop instead of ever reaching pointermove below
        // with useful deltas. A real click still reaches the link
        // normally; only an actual drag (dragMoved) gets swallowed by
        // the click-capture guard below.
        e.preventDefault();
        isPointerDown = true;
        dragMoved = false;
        startX = e.clientX;
        startScrollLeft = track.scrollLeft;
    });
    track.addEventListener('pointermove', function (e) {
        if (!isPointerDown) return;
        var dx = e.clientX - startX;
        if (!dragMoved && Math.abs(dx) > 5) {
            dragMoved = true;
            track.classList.add('is-grabbing');
            track.setPointerCapture(e.pointerId);
        }
        if (dragMoved) track.scrollLeft = startScrollLeft - dx;
    });
    function endPointerDrag() {
        isPointerDown = false;
        track.classList.remove('is-grabbing');
    }
    track.addEventListener('pointerup', endPointerDrag);
    track.addEventListener('pointercancel', endPointerDrag);
    // Swallows the click that follows a drag (dragMoved) so releasing
    // a drag over a card doesn't also fire its link navigation - every
    // other click (no drag happened) falls straight through to the
    // card's own <a>, no exceptions, since there's no "peeking card"
    // needing a tap-to-advance any more.
    track.addEventListener('click', function (e) {
        if (dragMoved) { e.preventDefault(); e.stopPropagation(); dragMoved = false; }
    }, true);

    updateState();
    });
}
