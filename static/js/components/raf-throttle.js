/* Coalesces a resize/visualViewport-resize handler to at most once per
   animation frame - live feedback: "animations are now very stuttery... may be
   due to the amount of calculations". A live window-resize drag dispatches
   'resize' repeatedly, and the filter-bar work (positionFilterTray, the list
   shell height, the actions-right-width remeasure) added several handlers that
   each force a synchronous layout read (getBoundingClientRect/offsetWidth) on
   every single one of those events - competing with the side-nav's own CSS
   width transition (layout.css, which crosses the 900px breakpoint on the same
   resize) for main-thread budget mid-drag.

   Rate-limiting each handler to one run per frame doesn't remove any
   individual layout read, but stops them piling up faster than the browser can
   paint.

   PAIRS WITH components/debounce.js. Trailing-edge debounce is the right tool
   when only the final state matters and the work is expensive; this is the
   right tool when every frame should reflect the current state. They were
   split across main.js and panel.js for a long time, which is why each one's
   comment has to say the other exists. */
export function rafThrottle(fn) {
    var scheduled = false;
    return function () {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(function () {
            scheduled = false;
            fn();
        });
    };
}
