/* The mobile tab bar's geometry, as read by anything that has to avoid it.

   Layout tier - one tab bar, rendered by _hub_sidebar.html into the page
   frame. These are measurements rather than behaviour: the filter tray imports
   them to decide how far down it may extend. */

// How far .mobile-tab-fab's own top edge actually pokes above
// .mobile-tabbar's top edge, measured live rather than assumed off its
// CSS (margin-top: -28px, _hub_sidebar.html) - the tabbar's own
// padding eats into that margin, so the real on-screen protrusion is
// smaller than the margin alone suggests. Shared by positionFilterTray
// and setupListEndCapHeight (below) so both "how much should the FAB
// overlap X" calculations stay in step with each other and with any
// future FAB/tabbar sizing change, instead of two separately-tuned
// numbers that happen to agree today.
export function fabProtrusionAboveTabbar() {
    var fab = document.querySelector('.mobile-tab-fab');
    var tabbar = document.querySelector('.mobile-tabbar');
    // getClientRects().length, not offsetParent - same display: none-
    // stays-in-the-DOM gap as positionFilterTray's own tabbar check,
    // below: both elements are always present, only hidden by width via
    // CSS, so an existence-only check would read two display: none
    // boxes as "both visible at (0,0)" and return 0 instead of falling
    // back. offsetParent (an earlier version of this check) breaks for
    // a genuinely-visible .mobile-tabbar specifically because it's
    // position: fixed - offsetParent is defined to be null for any
    // fixed-position element regardless of visibility (confirmed live:
    // tabbarRect had real, on-screen coordinates while offsetParent
    // still read null), so that check silently treated the tabbar as
    // always hidden, ballooning the tray's own available height and
    // the list's own end-cap height calculations past the tabbar
    // entirely - live feedback: "the tray is meant to have a gap to
    // the bottom nav so that nothing is clipped... also meant to have
    // a bottom of list diagonal stripes" (the same broken tabbarVisible
    // read feeding both). getClientRects().length is 0 for display:
    // none (or detached) regardless of position, and non-zero for
    // anything actually rendered, fixed positioning included.
    var visible = fab && tabbar && fab.getClientRects().length !== 0 && tabbar.getClientRects().length !== 0;
    // The `short` tier (ADR 0016) turns the tabbar into a full-height
    // strip down the RIGHT edge, so tabbar.top is 0 and this subtraction
    // returns a large NEGATIVE number - which then inflates rather than
    // reserves every clearance derived from it (positionFilterTray's
    // maxHeight subtracts it; setupListEndCapHeight doubles it). There is
    // no vertical protrusion to measure there at all: the FAB sits fully
    // inside the strip and the strip isn't along the bottom edge, so
    // nothing needs clearing above it.
    if (document.documentElement.classList.contains('phone-chrome-side')) return 0;
    return visible ? (tabbar.getBoundingClientRect().top - fab.getBoundingClientRect().top) : 19;
}
// Extra clearance trimmed off however much the FAB would otherwise
// overlap - live feedback: "adjust the math so there is slightly less
// overlap. This is for both!", then "a bit more... fab should be about
// halfway into padding of last entity" (0.2 left the FAB nearly flush
// against the last entity row's own buttons). Expressed as a fraction of
// the FAB's own protrusion (not a flat px number) so it scales the same
// way the protrusion-based math it's trimming does, rather than
// drifting out of proportion if the FAB's size/offset ever changes.
export function fabOverlapClearance() {
    return fabProtrusionAboveTabbar() * 0.35;
}
