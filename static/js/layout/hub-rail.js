/* The seam between the global hub rail and the hub sidebar beside it.

   Layout tier: there is one hub rail, it is part of layout.html's frame, and
   this measures it against .hub-rail-seam-top/-bottom/.hub-rail-active-fill in
   static/css/layout/layout.css.

   positionHubRailSeam is exported as well as run here because overlay-nav.js
   calls it directly: opening or closing an overlay changes which rail item
   reads as active, and the seam has to follow within the same frame. */

import { rafThrottle } from '../components/raf-throttle.js';

// Tab-linking (#131): sizes .hub-rail-seam-top/-bottom/.hub-rail-active-fill
// (layout.css) so the border/shadow separating the rail from the hub
// sidebar has a real gap at the current hub's row, instead of a
// fixed-width cover guessing how far the shadow's blur reaches. Measured
// via getBoundingClientRect rather than hardcoded row math so it stays
// correct regardless of which/how many hubs render (module visibility
// cascade, core/modules.py) or if the row height ever changes. No active
// item (e.g. the homepage) collapses back to a full, ungapped seam.
export function positionHubRailSeam() {
    var rail = document.querySelector('.hub-rail-inner');
    var seamTop = document.getElementById('hub-rail-seam-top');
    var seamBottom = document.getElementById('hub-rail-seam-bottom');
    var activeFill = document.getElementById('hub-rail-active-fill');
    if (!rail || !seamTop || !seamBottom || !activeFill) return;
    var active = rail.querySelector('.hub-rail-item.active');
    if (!active) {
        seamTop.style.height = '100%';
        seamBottom.style.top = '100%';
        activeFill.style.height = '0px';
        return;
    }
    var railRect = rail.getBoundingClientRect();
    // Measures the svg pill, not the outer flush item - the pill (44px,
    // centred, radius-sm on every corner) is what hover paints, so the
    // active fill has to match its box exactly (top/height/left) to
    // read as the same shape stretched into a tab, not a second,
    // differently-inset shape layered behind it.
    var pillRect = (active.querySelector('svg') || active).getBoundingClientRect();
    var top = pillRect.top - railRect.top;
    var left = pillRect.left - railRect.left;
    seamTop.style.height = top + 'px';
    seamBottom.style.top = (top + pillRect.height) + 'px';
    activeFill.style.top = top + 'px';
    activeFill.style.height = pillRect.height + 'px';
    activeFill.style.left = left + 'px';
}
export function initHubRailSeam() {
    positionHubRailSeam();
    /* Throttled: positionHubRailSeam takes two getBoundingClientRect reads
       and then writes five inline styles, so an unthrottled run per resize
       event is a read/write layout thrash on the hottest possible path. */
    window.addEventListener('resize', rafThrottle(positionHubRailSeam));
}
