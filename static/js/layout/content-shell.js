/* List-page shell height: sizes .content-shell to exactly fill the space
   between the sticky header zone and the bottom of <main>.

   Layout tier, and named to match static/css/layout/content-shell.css - the
   two are halves of one thing, so they carry one name.

   The class this measures is .content-shell rather than the shorter name it
   briefly had: #209 renamed it onto a name layout.html was already using for
   the app's own outer shell, and this code then walked that outer element and
   called closest('main') on something with no <main> inside it, throwing on
   every panel page. See taxonomy 6a lesson 1 before renaming it again. */

import { rafThrottle } from '../components/raf-throttle.js';

// List page shells (Students/Referrals/Actions): sized to exactly fill the
// space between the sticky page header and the bottom of the viewport, so
// the shell/page never scrolls — only the entity-list inside the list-card
// does. Measured off .sticky-header-zone rather than .page-header itself —
// the zone's own bottom padding sits below the header and before the shell,
// so measuring just the header undercounts that gap and leaves the shell a
// few pixels too tall (a permanent, near-invisible overflow scrollbar on
// main even though nothing looks cut off). The trailing subtraction must
// match .main-inner's own bottom padding exactly — that padding is
// rendered unconditionally after the shell regardless of the shell's own
// height, so subtracting anything less leaves main's content that much
// taller than the viewport, forcing a scrollbar even though every card
// looks perfectly laid out above it (confirmed: shrinking a hardcoded
// 16-then-32 constant here removed a reproducible bottom-of-page scroll
// on Inclusion Panel Home). Read live off .main-inner's own computed
// padding-bottom now, not a hardcoded 32px (git history) - that constant
// only ever matched the desktop --space-2xl value; Students zeroes
// .main-inner's own bottom padding at phone width entirely (panel.css,
// body:has(.students-page-shell) .main-inner, moving the FAB/tabbar
// clearance onto .entity-list's own padding instead), so hardcoding 32
// there left the shell ~32px short of main's real usable bottom edge -
// a visible gap of page background between the list-card and the mobile
// tab bar (live feedback: "I can see a white line or white shadow on
// the top edge of the Mobile bottom nav... only shows on student page").
// Reading the actual padding avoids this class of page-specific
// override silently drifting out of sync with a constant duplicated
// here.

export function initContentShellHeight() {
    var header = document.querySelector('.sticky-header-zone') || document.querySelector('.page-header');
    var shells = document.querySelectorAll('.content-shell');
    if (!header || !shells.length) return;

    // The card should use all the space main actually has to give,
    // short of what's genuinely needed for real trailing content.
    // Panel Home's KPI toggle/carousel (home.html) render as the
    // shell's own trailing siblings, not inside it - above 480px the
    // carousel is always visible (no toggle to collapse it there, see
    // responsive.css), so it genuinely needs its share reserved or it
    // overflows main outright. At phone width the collapsed carousel
    // itself measures 0, so this sums to just the small toggle - the
    // card still gets everything else.
    // Every content-shell gets its height pinned in JS, trailing
    // content or not - a shell with nothing trailing it does NOT
    // already get the same result for free from its own flex: 1
    // (layout.css): that only bounds a flex item to its container's
    // definite size, and .main-inner (this shell's flex parent) is
    // deliberately min-height: 100%, not height: 100% (see that rule's
    // own comment - other pages' sticky headers need main-inner able to
    // grow past one screen), so main-inner has no definite height of
    // its own to distribute in the first place whenever a shell's real
    // content (e.g. Students' full unfiltered row count) is taller than
    // the viewport - flex: 1 alone just lets the shell grow to fit that
    // content instead of capping it, and .entity-list's own internal
    // overflow-y: auto never gets a bounded box to scroll within either
    // (confirmed: Students' 240 seeded rows produced a ~29000px-tall
    // main scrolling the whole page - filter bar included - instead of
    // the entity list alone).
    function applyHeight() {
        var headerBottom = header.getBoundingClientRect().bottom;
        shells.forEach(function (shell) {
            var trailing = 0;
            var sib = shell.nextElementSibling;
            while (sib) {
                var sibCs = getComputedStyle(sib);
                trailing += sib.getBoundingClientRect().height
                    + parseFloat(sibCs.marginTop || 0)
                    + parseFloat(sibCs.marginBottom || 0);
                sib = sib.nextElementSibling;
            }
            // Budget against main's own rendered bottom edge, not
            // window.innerHeight - anything below main in the layout
            // (e.g. the mobile bottom nav bar) eats into innerHeight
            // without main actually having that space to give. Clamped
            // to the mobile tabbar's own top (when it's genuinely
            // visible - getClientRects().length, not offsetParent,
            // which is always null for a position: fixed element like
            // this one regardless of visibility) rather than trusting
            // main's own edge to already exclude it - true for most
            // pages (the app-wide .main-inner padding-bottom reserves
            // it, _hub_sidebar.html), but Students zeroes that padding
            // specifically (this file, below, "moves the app-wide
            // bottom-nav scroll clearance... onto .entity-list itself")
            // and nothing then re-reserved it here, so the shell (and
            // the entity-list scrolling inside it) silently grew to
            // reach past the tabbar's own top, behind its opaque,
            // higher-stacked bar - live feedback: "meant to have a
            // bottom of list diagonal stripes" (.entity-list::after,
            // below) - the end-cap was genuinely rendering, just
            // entirely hidden behind the tabbar instead of sitting
            // visibly above it the way its own "FAB covers roughly
            // half of this box" design assumes. A plain Math.min is a
            // no-op wherever main's edge is already above the tabbar
            // (every other page, via that padding), so this only ever
            // changes something for a shell that actually needs it.
            var tabbar = document.querySelector('.mobile-tabbar');
            var tabbarTop = (tabbar && tabbar.getClientRects().length !== 0) ? tabbar.getBoundingClientRect().top : Infinity;
            var mainBottom = Math.min(shell.closest('main').getBoundingClientRect().bottom, tabbarTop);
            var mainInner = shell.closest('.main-inner');
            var mainInnerPaddingBottom = mainInner ? parseFloat(getComputedStyle(mainInner).paddingBottom || 0) : 0;
            var next = mainBottom - headerBottom - mainInnerPaddingBottom - trailing;
            // Skip a no-op (sub-px difference) re-apply - the actual
            // fix for the on-load snap a previous version of this code
            // hit and dodged by routing Students around this whole
            // function instead (git history): the ResizeObserver below
            // is guaranteed to fire once immediately on ro.observe(),
            // redoing the same computation the explicit applyHeight()
            // call a few lines below this function just made by hand -
            // and any later re-fire at a genuinely unchanged
            // headerBottom hits the same no-op. Only a real, >=1px
            // difference (an actual header reflow) should ever touch
            // shell.style.height again.
            if (Math.abs(next - (parseFloat(shell.style.height) || 0)) < 1) return;
            // flex: none (not just flexGrow/flexShrink: 0) - the base
            // CSS's flex: 1 shorthand also sets flex-basis: 0%, which
            // wins over an explicit height for a flex item's main size
            // even with grow/shrink zeroed out, so leaving flex-basis
            // alone would still ignore the pixel height set below.
            shell.style.flex = 'none';
            shell.style.height = next + 'px';
        });
    }

    applyHeight();
    /* Kept alongside the ResizeObserver below (which watches the header
       and its trailing siblings): the shell's target height is derived
       from the viewport too, so a resize that leaves both observed
       elements the same size still has to re-run. Throttled, since it
       measures and then writes inline styles. */
    window.addEventListener('resize', rafThrottle(applyHeight));
    if (typeof ResizeObserver !== 'undefined') {
        var ro = new ResizeObserver(applyHeight);
        ro.observe(header);
        // Also watches the trailing siblings themselves, so a trailing
        // element resizing (e.g. the KPI carousel re-measuring on
        // window resize) shrinks the shell to make room, rather than
        // only reacting to header resizes.
        shells.forEach(function (shell) {
            var sib = shell.nextElementSibling;
            while (sib) { ro.observe(sib); sib = sib.nextElementSibling; }
        });
    }
}
