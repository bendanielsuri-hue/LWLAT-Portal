/* Promoted out of panel.js (#210, ADR 0020), reuniting it with rafThrottle -
   its own comment below always said the two were a pair, and they had ended
   up one in a hub file and one in a portal file.

   rafThrottle itself is still main.js's, read off `window` by the modules
   that want it, because main.js is a classic script until #213 splits it and
   nine of its own call sites need the function at parse time. That is the
   one remaining direction this file's pair points the wrong way.
*/

/* Trailing-edge debounce: runs once the size has actually stopped
   changing, rather than once per animation frame while it changes.
   Deliberately trailing-only (no leading call) - everything it drives is
   a correct-at-rest concern (shared column basis, cut-off fades, whether
   Status still fits), and CSS flex-grow keeps redistributing space live
   underneath it throughout the drag regardless, so there is nothing to
   see mid-drag that the browser isn't already doing for free.

   Reach for it whenever a measurement is correct-at-rest and pointless per
   frame; rafThrottle stays the right tool for a content change that has to
   land on the next frame. */
export function debounceTrailing(fn, wait) {
    var timer = null;
    return function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
            timer = null;
            fn();
        }, wait);
    };
}
