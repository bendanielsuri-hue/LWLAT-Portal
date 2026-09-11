/* Where the open filter tray sits on screen, and how tall it may be.

   The tray is position: fixed, so it has to be pinned to the bar's own
   on-screen rect every time it opens and every time that rect moves. Its
   bottom is capped just above the mobile tab bar - see layout/mobile-tabbar.js
   for the two measurements that cap comes from. */

import { rafThrottle } from '../raf-throttle.js';
import { fabProtrusionAboveTabbar, fabOverlapClearance } from '../../layout/mobile-tabbar.js';
import { groupFilterSections } from './sections.js';
import { wireFilterSectionScroll } from './section-scroll.js';

// #134: positions the floating tray (panel.css: .filter-bar-collapsible,
// position: fixed) against its own .filter-bar's current bottom edge,
// capped to clear the mobile tabbar. Factored out of the click handler
// below so the visualViewport listener further down can re-run the
// exact same calculation live, not just once at open time - a real
// mobile browser's address-bar/toolbar chrome can show/hide *after* the
// tray's already open (e.g. scrolling inside it), changing how much
// screen is actually visible without firing any DOM resize of its own;
// a one-time-at-open measurement goes stale the moment that happens.
//
// Caps against .mobile-tabbar's own top edge, not the true bottom of
// the screen - live feedback: an earlier version of this reached the
// full screen and painted over the tabbar (a deliberate main:has() +
// z-index escalation, git history), but that meant the tabbar's own
// icon row could end up covering the tray's sticky Clear/Close footer
// depending on how much of the tabbar the tray's bottom edge actually
// overlapped ("the mobile nav is covering the bottom button on the
// filter tray when its full screen"). Landing the cap just above the
// tabbar instead means the footer is never behind it, full stop - the
// FAB (.mobile-tab-fab, a separate circular button that already floats
// above the tabbar's own top edge by design) can still visually poke
// over the tray's edge without covering interactive content the same
// way ("I like the FAB overlaying it but not the whole bar").
export function positionFilterTray(bar, box) {
    var barRect = bar.getBoundingClientRect();
    var barBottom = barRect.bottom;
    // .getClientRects().length check, not just querySelector -
    // .mobile-tabbar stays in the DOM at every width (CSS alone hides
    // it below <=480px via display: none, layout.css), so a bare
    // existence check found it "present" for narrow-desktop/portrait-
    // tablet too once this function started running there - a display:
    // none element's own getBoundingClientRect() resolves to all
    // zeros, not where it would render if visible, which silently
    // capped maxHeight at 0 (top: 0, bar already well below that).
    // offsetParent (an earlier version of this check) isn't the right
    // tool here - it's null for a display: none ancestor chain, but
    // ALSO null for any position: fixed element regardless of
    // visibility, which .mobile-tabbar always is (layout.css) - so
    // that check was reading a genuinely visible tabbar as hidden at
    // every true-mobile width, live feedback: "the tray is meant to
    // have a gap to the bottom nav so that nothing is clipped" (this
    // fell back to the full viewport height instead of stopping above
    // the tabbar). getClientRects().length is 0 for display: none (or
    // detached) regardless of position, non-zero for anything actually
    // rendered - the correct general-purpose "is this really on
    // screen" check fabProtrusionAboveTabbar (layout/mobile-tabbar.js) uses.
    var tabbar = document.querySelector('.mobile-tabbar');
    // Not in the `short` tier (ADR 0016): the tabbar is a full-height
    // strip down the right edge there, so its .top is 0 and using it as a
    // bottom limit caps the tray's maxHeight at nothing. It constrains
    // width, which the left/width anchoring below already handles via the
    // bar's own rect - it does not constrain height at all.
    var sideStrip = document.documentElement.classList.contains('phone-chrome-side');
    var tabbarVisible = tabbar && tabbar.getClientRects().length !== 0 && !sideStrip;
    var bottomLimit = tabbarVisible ? tabbar.getBoundingClientRect().top : (window.visualViewport ? window.visualViewport.height : window.innerHeight);
    /* The `short` tier used to clamp this to the counts strip's own top,
       on the reasoning that a strip sticky to the foot of the viewport is
       this tier's bottom furniture, playing the role the tabbar plays in
       portrait. That was solving the real symptom (the tray's own footer
       rendered underneath the counts, unreachable however far you
       scrolled - "I can't get to bottom of filters if screen is this
       short") from the wrong end: the counts strip is not furniture the
       tray has to respect, it's list chrome the tray is entitled to cover
       while it's open, the same way it already covers the rows. Stopping
       short of it spent ~40px of the scarcest axis on this tier to show
       three numbers nobody is reading mid-filter (live feedback: "can the
       filter open tray go over the footer to use all available space").
       The tray now runs to the foot of the viewport and paints over the
       strip (panel.css raises its z-index in this tier to make that true
       rather than merely intended), so its Clear/Close footer sits at the
       screen's bottom edge with nothing over it - which is what made the
       original symptom a bug rather than a layout choice. */
    box.style.top = barBottom + 'px';
    // (INT-R2) left/width anchored to the bar's own rect, not the base CSS rule's
    // left: 0; right: 0 (panel.css) - true phone width has no side nav,
    // so the bar already spans edge to edge and this is a no-op there,
    // but narrow-desktop/portrait-tablet still show the icon rail beside
    // an inset card (live feedback: "I like the slide over the top that
    // mobile does... can we do this for portrait tablet as well") - an
    // edge-to-edge tray there would float under/over the nav rail
    // instead of over the actual filter bar, the exact misalignment that
    // originally kept this mode on a push-down layout instead. Setting
    // width explicitly (not just left) makes the CSS right: 0 irrelevant
    // for a position: fixed box - left + width alone fully determine its
    // horizontal extent.
    // Widened by .list-card's own left/right border width (live
    // feedback: "I am noticing a border around the filter tray... it is
    // likely within an element that probably already has border" -
    // exactly right: bar's own rect already sits inset from .list-card's
    // true edge by that border's width (.list-card .filter-bar, layout.
    // css, has no border of its own - the card's outer 1px border is
    // what bar's rect is inset from), so anchoring box to bar's rect
    // verbatim left it floating flush against, not over, that border -
    // confirmed via computed styles: .list-card's own border rendered
    // exactly along the tray's left/right edges, reading as if the tray
    // had a border of its own when it never did. Reading the border
    // width off .list-card directly (not a hardcoded px guess) so this
    // keeps working if that token's value ever changes.
    var listCard = bar.closest('.list-card');
    var cardBorderLeft = listCard ? parseFloat(getComputedStyle(listCard).borderLeftWidth) || 0 : 0;
    var cardBorderRight = listCard ? parseFloat(getComputedStyle(listCard).borderRightWidth) || 0 : 0;
    box.style.left = (barRect.left - cardBorderLeft) + 'px';
    box.style.width = (barRect.width + cardBorderLeft + cardBorderRight) + 'px';
    // Half the FAB's own protrusion above the tabbar, not a fixed number
    // - live feedback: "it should be based on math... the amount of Fab
    // that sticks out, the bottom padding of tray so this can be dynamic
    // if we change any of these settings." So this stays correct if the
    // FAB's size or offset ever changes. Landed on half - a small sliver
    // of tray bottom padding stays clear of the FAB rather than the
    // FAB's whole reach overlapping it. Plus fabOverlapClearance() on
    // top (live feedback: "slightly less overlap") - a bigger reserve
    // here means the FAB's own top edge sits that much further below
    // the tray's own bottom edge, i.e. less of the FAB overlaps it.
    box.style.maxHeight = Math.max(0, bottomLimit - barBottom - (fabProtrusionAboveTabbar() / 2) - fabOverlapClearance()) + 'px';
    // #134 follow-up (live feedback: "if filter tray is max size, can it
    // lose the bottom radius corners") - a rounded corner sitting right
    // at the tray's own hard-capped edge (where the field grid is
    // genuinely being clipped/scrolled, not just ending on its own)
    // reads as a deliberate stopping point rather than a soft, natural
    // end. .filter-bar-collapsible-inner's own scrollHeight vs
    // clientHeight is the standard "does this actually need to scroll"
    // check - inner (not box) because box's own scrollHeight always
    // just matches whatever flex: 1 handed inner (box's only child), it
    // never reflects inner's own internal overflow. Re-checked on every
    // call (open and the visualViewport listener, above), so a tray
    // that WAS maxed out un-squares itself again if the screen grows
    // back (e.g. the browser's own chrome collapsing) enough to fit
    // everything without scrolling.
    var inner = box.querySelector('.filter-bar-collapsible-inner');
    box.classList.toggle('is-maxed', !!inner && inner.scrollHeight > inner.clientHeight + 1);
    // Overlay's own bottom edge pinned to stop right above the stats
    // footer (Students/Referrals/Actions counts, last child of
    // #students-filtered-content, sibling of the overlay) instead of
    // its base inset: 0 (panel.css) reaching all the way down behind
    // it - the footer already stays undimmed/clickable through the
    // overlay via its own z-index (panel.css, live feedback: "overlay
    // should not overlay the stats footer"), but the overlay was still
    // painting behind it, and the entity-list content directly above
    // the footer's own border was still getting dimmed right up
    // against it - live feedback, on a tray short enough to leave that
    // gap exposed: "the border gets slightly darker" (confirmed via
    // pixel sampling: the border's own colour never actually changes -
    // this reads as darker purely from contrast against the newly-dark
    // strip sitting directly above it) - then "really the overlay
    // should not affect the stats bar at all. Are we not able to size
    // the overlay so it stops short?" Recomputed on every call here
    // (open, and the visualViewport listener, above) alongside the
    // tray's own maxHeight, for the same "screen size can change while
    // open" reasoning that recheck already exists for.
    // Scoped to the tray's own .list-card (already read above for its
    // border width), not a hardcoded #students-filtered-content - keeps
    // this reusable for any page built on the same .list-card >
    // .filter-bar / .filter-bar-overlay / .stats-strip structure, not
    // just Students.
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
                groupFilterSections(bar);
                wireFilterSectionScroll(bar);
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


    // .entity-list::after's own "end of content" stripe (panel.css) - live
    // feedback: "same for the last entity of filtered content... should be
    // based on math", the same complaint as positionFilterTray's own gap
    // above. Twice fabProtrusionAboveTabbar(), not half - the FAB should
    // cover roughly half of this box, so the box itself is twice however
    // far the FAB actually reaches. Exposed as a CSS custom property (not
    // set inline on the element, unlike the tray) because this is a
    // ::after - there's no real element for JS to style directly.
    (function setupListEndCapHeight() {
        function apply() {
            document.documentElement.style.setProperty('--list-endcap-height', (fabProtrusionAboveTabbar() * 2) + 'px');
            // Pushes the cap's own bottom edge up off the tabbar by the same
            // fabOverlapClearance() positionFilterTray now reserves (live
            // feedback: "slightly less overlap. This is for both!") - the
            // cap is otherwise flush with the scroll container's bottom, so
            // margin-bottom is what actually trims the FAB's overlap into it
            // rather than just changing its own height (which only changes
            // how much unobscured stripe shows above the overlap, not the
            // overlap itself).
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

