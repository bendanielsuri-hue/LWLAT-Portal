/* Where the open filter tray sits on screen, and how tall it may be.

   The tray is position: fixed, so it has to be pinned to the bar's own
   on-screen rect every time it opens and every time that rect moves. Its
   bottom is capped just above the mobile tab bar - see layout/mobile-tabbar.js
   for the two measurements that cap comes from. */

import { rafThrottle } from '../raf-throttle.js';
import { fabProtrusionAboveTabbar, fabOverlapClearance } from '../../layout/mobile-tabbar.js';
import { resyncFilterSections } from './sections.js';

// Positions the floating tray (panel.css: .filter-bar-collapsible,
// position: fixed) against its own .filter-bar's current bottom edge,
// capped to clear the mobile tabbar. Factored out of the click handler
// below so the visualViewport listener further down can re-run the
// exact same calculation live, not just once at open time - a real
// mobile browser's address-bar/toolbar chrome can show/hide *after* the
// tray's already open (e.g. scrolling inside it), changing how much
// screen is actually visible without firing any DOM resize of its own;
// a one-time-at-open measurement goes stale the moment that happens.
//
// Caps against .mobile-tabbar's own top edge, not the true bottom of the
// screen, so the tray's sticky Clear/Close footer can never end up behind
// the tabbar's icon row. The FAB (.mobile-tab-fab) already floats above
// the tabbar's top edge by design, so it still pokes over the tray's edge
// - it covers no interactive content doing so. See docs/adr/0024.
export function positionFilterTray(bar, box) {
    var barRect = bar.getBoundingClientRect();
    var barBottom = barRect.bottom;
    // .getClientRects().length, not a bare querySelector and not
    // offsetParent. .mobile-tabbar stays in the DOM at every width (CSS
    // alone hides it below 480px), so mere existence proves nothing, and a
    // display: none element's getBoundingClientRect() resolves to all zeros
    // rather than where it would render - which silently caps maxHeight at
    // 0. offsetParent is the wrong tool despite looking right: it is null
    // for a display: none ancestor chain but ALSO null for any position:
    // fixed element regardless of visibility, and .mobile-tabbar is always
    // fixed - so it reads a genuinely visible tabbar as hidden.
    // getClientRects().length is 0 for display: none (or detached)
    // regardless of position, non-zero for anything actually rendered - the
    // same check fabProtrusionAboveTabbar (layout/mobile-tabbar.js) uses.
    var tabbar = document.querySelector('.mobile-tabbar');
    // Not in the `short` tier (ADR 0016): the tabbar is a full-height
    // strip down the right edge there, so its .top is 0 and using it as a
    // bottom limit caps the tray's maxHeight at nothing. It constrains
    // width, which the left/width anchoring below already handles via the
    // bar's own rect - it does not constrain height at all.
    var sideStrip = document.documentElement.classList.contains('phone-chrome-side');
    var tabbarVisible = tabbar && tabbar.getClientRects().length !== 0 && !sideStrip;
    var bottomLimit = tabbarVisible ? tabbar.getBoundingClientRect().top : (window.visualViewport ? window.visualViewport.height : window.innerHeight);
    /* No clamp against the counts strip in the `short` tier: the strip is
       list chrome the tray is entitled to cover, not furniture it has to
       respect. panel.css raises the tray's z-index in that tier to make
       that true rather than merely intended. See docs/adr/0024. */
    box.style.top = barBottom + 'px';
    // (INT-R2) left/width anchored to the bar's own rect, not the base CSS
    // rule's left: 0; right: 0 (panel.css). A no-op at true phone width,
    // where the bar already spans edge to edge - but narrow-desktop and
    // portrait-tablet still show the icon rail beside an inset card, and an
    // edge-to-edge tray there would float over the nav rail instead of over
    // the actual filter bar. Setting width explicitly (not just left) makes
    // the CSS right: 0 irrelevant: for a position: fixed box, left + width
    // alone fully determine its horizontal extent.
    //
    // Widened by .list-card's own left/right border width. The bar's rect
    // already sits inset from .list-card's true edge by that border (.list-
    // card .filter-bar has no border of its own), so anchoring to the bar's
    // rect verbatim leaves the tray flush against that border rather than
    // over it - which reads as the tray having a border it does not have.
    // Read off .list-card directly, not a hardcoded px, so it survives a
    // change to that token's value.
    var listCard = bar.closest('.list-card');
    var cardBorderLeft = listCard ? parseFloat(getComputedStyle(listCard).borderLeftWidth) || 0 : 0;
    var cardBorderRight = listCard ? parseFloat(getComputedStyle(listCard).borderRightWidth) || 0 : 0;
    box.style.left = (barRect.left - cardBorderLeft) + 'px';
    box.style.width = (barRect.width + cardBorderLeft + cardBorderRight) + 'px';
    // Derived from the FAB's own protrusion above the tabbar, never a fixed
    // number, so it stays correct if the FAB's size or offset changes. Half
    // of it: a small sliver of tray bottom padding stays clear of the FAB
    // rather than the FAB's whole reach overlapping it. Plus
    // fabOverlapClearance() on top - a bigger reserve here puts the FAB's
    // top edge further below the tray's bottom edge, i.e. less overlap.
    box.style.maxHeight = Math.max(0, bottomLimit - barBottom - (fabProtrusionAboveTabbar() / 2) - fabOverlapClearance()) + 'px';
    // Squares off the bottom corners when the tray is genuinely hard-capped:
    // a rounded corner at a clipped edge reads as a soft, natural end when
    // it is anything but. Measured on inner, not box - box's scrollHeight
    // always just matches whatever flex: 1 handed inner (its only child), so
    // it never reflects inner's own internal overflow. Re-checked on every
    // call, so a tray that WAS maxed un-squares itself if the screen grows
    // back enough to fit everything without scrolling.
    var inner = box.querySelector('.filter-bar-collapsible-inner');
    box.classList.toggle('is-maxed', !!inner && inner.scrollHeight > inner.clientHeight + 1);
    // The dim overlay stops above the stats strip rather than taking its
    // base inset: 0 (panel.css) all the way down behind it. The strip's own
    // z-index already keeps it undimmed and clickable, but the overlay was
    // still painting behind it and still dimming the list content right up
    // against the strip's top border - which reads as that border darkening,
    // purely from the contrast against the newly-dark strip above it.
    // Recomputed on every call alongside maxHeight, for the same "screen
    // size can change while open" reason. Scoped to the tray's own
    // .list-card rather than a hardcoded page id, so this works for any page
    // built on the same .list-card > .filter-bar / .filter-bar-overlay /
    // .stats-strip structure.
    var statsStrip = listCard ? listCard.querySelector('.stats-strip') : null;
    var overlayEl = listCard ? listCard.querySelector('.filter-bar-overlay') : null;
    if (overlayEl) overlayEl.style.bottom = statsStrip ? statsStrip.getBoundingClientRect().height + 'px' : '';
}

/* Scrolls the real scroller (<main>) just far enough that a sticky filter
   bar reaches its pinned position, taking the page header off screen.
   Scoped to the `short` tier: it's the only one where the header scrolls
   and the bar sticks, so anywhere else this would scroll a page that had
   no reason to move. Honours prefers-reduced-motion (INT-M): the jump
   still happens, it just isn't animated. */
export function scrollStickyBarToTop(bar) {
    if (!document.documentElement.classList.contains('phone-chrome-side')) return;
    var scroller = bar.closest('main');
    if (!scroller) return;
    var delta = bar.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    // <= 1, not <= 0 - sub-pixel rounding leaves a fractional delta when
    // the bar is already pinned, and a "smooth" scroll of 0.4px still
    // costs a frame of animation for no visible movement.
    if (delta <= 1) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: reduce ? 'auto' : 'smooth' });
}

/* The side effects, called from main.js's DOMContentLoaded handler rather
   than run in this module's body. A module body executes after parsing but
   BEFORE DOMContentLoaded, and the end-cap block below measures the tab bar
   immediately - keeping the call where it always was means the measurement
   happens at the same point in the page lifecycle as before this move. */
export function initTrayPosition() {
    if (window.visualViewport) {
        /* Throttled - visualViewport resize fires every frame of the
           on-screen keyboard's slide-in animation, and this handler does a
           document-wide querySelectorAll plus a getBoundingClientRect per
           open tray on each one. */
        window.visualViewport.addEventListener('resize', rafThrottle(function () {
            document.querySelectorAll('.filter-bar.is-expanded').forEach(function (bar) {
                var box = bar.querySelector('.filter-bar-collapsible');
                // A resize can cross the phone-portrait/landscape-and-
                // tablet boundary, which is the one thing that changes
                // whether the tray's sections are wrapped - re-decide before
                // re-measuring the tray's own cap against the result.
                resyncFilterSections(bar);
                if (box) positionFilterTray(bar, box);
            });
        }));
    }
    /* The `short` tier pins the filter bar with position: sticky (panel.css),
       so unlike every other mode the bar's VIEWPORT position now changes as
       you scroll. The tray is position: fixed, anchored to that rect - and it
       was only ever re-anchored on open and on a visualViewport resize,
       neither of which fires on scroll. An open tray therefore detached from
       its bar and hung wherever the bar happened to be when it opened.
       Scoped to that tier: everywhere else the bar doesn't move relative to
       the viewport while scrolling, so this would be a scroll handler earning
       nothing. capture: true because <main> is the real scroll container here
       and scroll events don't bubble from an element to window. */
    var repositionStickyTrays = rafThrottle(function () {
        if (!document.documentElement.classList.contains('phone-chrome-side')) return;
        document.querySelectorAll('.filter-bar.is-expanded').forEach(function (bar) {
            var box = bar.querySelector('.filter-bar-collapsible');
            if (box) positionFilterTray(bar, box);
        });
    });
    window.addEventListener('scroll', repositionStickyTrays, true);


    // .entity-list::after's "end of content" stripe (panel.css), sized off
    // the same FAB measurement as the tray's own gap above. Twice
    // fabProtrusionAboveTabbar(), not half - the FAB should cover roughly
    // half of this box, so the box is twice however far the FAB reaches.
    // Exposed as a CSS custom property rather than set inline (unlike the
    // tray) because this is a ::after: there is no element to style.
    (function setupListEndCapHeight() {
        function apply() {
            document.documentElement.style.setProperty('--list-endcap-height', (fabProtrusionAboveTabbar() * 2) + 'px');
            // Pushes the cap's bottom edge off the tabbar by the same
            // fabOverlapClearance() positionFilterTray reserves. The cap is
            // otherwise flush with the scroll container's bottom, so
            // margin-bottom is what actually trims the FAB's overlap into
            // it - changing its height only changes how much unobscured
            // stripe shows above the overlap, not the overlap itself.
            document.documentElement.style.setProperty('--list-endcap-clearance', fabOverlapClearance() + 'px');
        }
        apply();
        /* visualViewport resize fires continuously while the on-screen
           keyboard animates in, so this one especially wants coalescing. */
        var applySoon = rafThrottle(apply);
        if (window.visualViewport) window.visualViewport.addEventListener('resize', applySoon);
        window.addEventListener('resize', applySoon);
    })();

}

