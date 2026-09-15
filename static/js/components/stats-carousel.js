/* Home's KPI row carousel (#116, rebuilt #132 for the "stack" effect,
   simplified again - PROTOTYPE, live feedback: "we do not have an active
   state for cards, it just scrolls. No dots, just a left and right arrow to
   indicate there is more off screen"). No active card any more - every card
   is always full size and fully clickable, so there is nothing to centre,
   no per-card state to track, and no peeking card to disambiguate a tap
   against. Arrows and fades read raw scroll position; nothing here needs to
   know which card, if any, is "the" one.

   All of that is `initCarousel`'s step mode now (#214): this file was the
   second of three carousel implementations and is the call site for one of
   them instead. What is left here is the two things that are genuinely this
   carousel's own - the markup contract (.stats-carousel-* selectors) and
   the flat/grid mode below. Generic per-.stats-carousel-wrap (forEach, not
   a singleton): unlike Panel Home's My Referrals/My Actions, this was
   always meant to be reusable by another KPI row.

   FLAT MODE is floored at the narrow tier, not left to the fit measurement
   alone - live feedback, with a screenshot: shrinking the cards below it
   (auto width plus smaller everything) made all six technically fit
   unwrapped, which the measurement correctly detected and switched to
   grid/wrap mode over, but that is the wrong call at that width. Grid mode
   was meant for a couple of KPI cards on a wide desktop screen where
   scrolling would be silly, not for phone/tablet, where the carousel
   (arrows, fade, drag) is the deliberately-built experience regardless of
   whether the shrunk cards happen to squeeze in. The tier comes from
   layout/breakpoints.js rather than a literal 900 here, so it stays one
   number with the registry (responsive.css). */

import { initCarousel } from './carousel.js';
import { narrowMql } from '../layout/breakpoints.js';

export function initStatsCarousels() {
    document.querySelectorAll('.stats-carousel-wrap').forEach(function (wrap) {
        initCarousel(wrap, {
            track: '.stats-carousel-track',
            prev: '.stats-carousel-arrow--prev',
            next: '.stats-carousel-arrow--next',
            fadeL: '.stats-carousel-fade-l',
            fadeR: '.stats-carousel-fade-r',
            disableArrowsAtEdges: true,
            keyboard: true,
            flat: { notWhen: narrowMql },
            drag: {
                threshold: 5,
                draggingClass: 'is-grabbing',
                /* Without this, a mousedown + move over a .stat-card (a
                   real <a>) kicks off the browser's own native link
                   drag-and-drop instead of ever reaching pointermove with
                   useful deltas. A real click still reaches the link
                   normally - only a drag that moved gets swallowed. */
                preventDefaultOnDown: true,
            },
        });
    });
}
