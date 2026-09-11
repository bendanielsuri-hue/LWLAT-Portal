/* The portal's breakpoint tiers, as JavaScript.

   One module, one declaration site. Every tier here has a matching row in the
   BREAKPOINT REGISTRY comment at the top of static/css/layout/responsive.css,
   which stays the canonical list - this file is the JS half of it and the
   export names deliberately match the registry's tier names, so a reader
   moving between the CSS and the JS carries one vocabulary.

   WHY THIS IS THE FIRST MODULE OUT OF main.js

   main.js's DOMContentLoaded handler is ~2,550 lines of unrelated setup blocks
   sharing one closure, and what they share is these media queries. Every other
   block in it closes over isTouchNav/narrowMql/portraitMql, so none of them
   could be lifted out until the queries had somewhere to live. Extracting this
   first is what makes the rest liftable one at a time rather than all at once.
   See docs/wayfinder/portal-static-assets/main-js-inventory.md section 3.

   THE RENAMES, AND THE COLLISION THEY HAD TO STEP AROUND

   Three of these were called something else in main.js:

     studentsNarrowMql  -> narrowMql   (max-width: 900px)
     narrowMql          -> railMql     (max-width: 1200px)
     touchRailMql       -> touchMql    (481-1180px)
     shortViewportMql   -> shortMql    (max-height: 500px)
     trueMobileMql      -> phoneMql    (max-width: 480px)

   `studentsNarrowMql` was a portal-wide tier named after one page - it gates
   the filter-bar mode for every filter bar in the portal, and the `students`
   prefix was only history. ADR 0020 says a promoted name drops its old prefix
   at promotion and never as a later pass, so it is renamed here.

   The registry's name for its tier is "narrow" - and `narrowMql` was already
   taken, by the 1200px rail tier down in the sidebar block. Renaming one onto
   the other's name without moving the other is exactly the mistake taxonomy
   section 6a lesson 1 records (#209 renamed a shell class onto a name
   layout.html was already using for the app's own outer shell, and threw on
   every panel page). So both moved here in the same commit, and each is now
   named for the registry tier it actually implements. That is also why the
   sidebar's three queries live in this file rather than staying where they
   were: two declaration sites for one tier list is how the collision happened
   in the first place.

   NOT A TIER: portraitMql, portraitWideMql, hoverCapableMql. Orientation and
   pointer capability are separate axes - a portrait tablet is caught by
   orientation precisely because width cannot catch it reliably (the reasoning
   is at each one's own call site). They live here because they are read
   alongside the tiers and belong to the same question, not because they are
   tiers.
*/

/* phone tier. */
export const phoneMql = window.matchMedia('(max-width: 480px)');

/* narrow tier. 900px - live feedback: "have more changes occur at the same
   breakpoint" - unified with initPageHeaderActions and the KPI carousel's
   auto-width cutoff (both already 900px), so a narrowed desktop window hits
   every one of these transitions together instead of drifting through several
   different in-between states. The sidebar's own auto-collapse was unified to
   this too and then deliberately reversed - see railMql below.

   Kept as the single source of truth: isFilterBarMobile /
   isFilterBarNarrowDesktop and setupFilterBarMoreFilters's retry fallback (all
   main.js) read this one query rather than each hardcoding the number.

   Its width-gated branch is non-touch only - a real portrait tablet is covered
   separately, by orientation, for the reason portraitMql gives. */
export const narrowMql = window.matchMedia('(max-width: 900px)');

/* touch tier - the tablet rail's expand-in-place range. Floored at 481px so
   it cannot overlap the phone tier: the registry's boundary rule is that a
   tier's max is N and its matching min is N+1. */
export const touchMql = window.matchMedia('(min-width: 481px) and (max-width: 1180px)');

/* rail tier - the hub sidebar auto-collapses to the 64px icon rail. Kept
   deliberately wider than the narrow tier: live feedback unified it to 900px
   for consistency and then reversed that ("I think the side nav should go
   back to 1200"). Must match responsive.css's own threshold exactly - nothing
   links the two automatically, so a mismatch would leave the rail visually
   narrow (CSS) while .collapsed had not been added yet (JS). */
export const railMql = window.matchMedia('(max-width: 1200px)');

/* short tier - the one tier measured on height, not width. See ADR 0016. A
   touch device under 500px tall is a phone in landscape: 667-932px wide, so
   every width tier above reads it as a tablet. Touch-gated at every call site
   (isShortTouch below), or a short desktop window would sprout phone chrome. */
export const shortMql = window.matchMedia('(max-height: 500px)');

/* NOT A TIER. Real portrait tablets used to be deliberately excluded from the
   narrow-desktop treatment (live feedback: "I did not want the filter change
   on narrow mobile to affect portrait tablet. It is only on very narrow
   desktop that had issues") - reversed on further live feedback once the
   tablet's own category-strip tray turned out to mean "a lot of scrolling" in
   practice ("I think I want this to apply to portrait tablet as it is
   narrow").

   Width alone can't reliably catch "a portrait tablet" the way it can "a
   narrowed desktop window" - a portrait iPad (768-834px) or iPad Pro 12.9"
   (1024px) would need a much wider threshold than a genuinely narrow desktop
   should ever trigger at - so this checks orientation instead, and only for
   touch devices (a narrowed *desktop* window is never orientation: portrait in
   the OS sense, so this can't misfire there). */
export const portraitMql = window.matchMedia('(orientation: portrait)');

/* NOT A TIER, despite sharing narrowMql's number. Live feedback: "some bigger
   tablets in portrait may benefit from seeing the filters" - a portrait iPad
   Pro 12.9" (1024px) has exactly the room to show the inline bar like desktop
   does, so the touch+portrait branch needs its own explicit cap even though it
   happens to share the narrow tier's 900px value. The two are read
   independently (touch+portrait vs narrowed desktop) and only coincide
   numerically after the #121-era unification. This cap still exists to keep a
   standard portrait iPad (768-834px) from being caught by the touch+portrait
   branch's otherwise-unbounded width. */
export const portraitWideMql = window.matchMedia('(min-width: 900px)');

/* NOT A TIER - pointer capability. Distinguishes a narrowed desktop browser
   window from a touch tablet at the same width, which is the whole reason the
   rail is forced-and-locked in one and expand-in-place in the other. */
export const hoverCapableMql = window.matchMedia('(hover: hover) and (pointer: fine)');

const realHoverNoneMql = window.matchMedia('(hover: none)');
const touchNavListeners = [];

/* Also checks window.top.__devBpTouch (dev breakpoint preview, same-origin
   synchronous read - see layout.html's own head script) alongside
   force-touch-nav - without this, this function's very first call ran before
   the preview's postMessage handshake had a chance to arrive (that only fires
   on frame.onload, later than DOMContentLoaded) and force-touch-nav wasn't set
   yet, so it disagreed with the correct state layout.html's synchronous
   scripts had already rendered - flipping the sidebar open again for the brief
   window until the postMessage handler finally set force-touch-nav and this
   got called a second time to correct it. That "closed, then open, then
   closed" cascade is what this line closes. */
export function isTouchNav() {
    if (realHoverNoneMql.matches || document.documentElement.classList.contains('force-touch-nav')) return true;
    try { if (window.self !== window.top && window.top.__devBpTouch) return true; } catch (e) { }
    return false;
}

/* A landscape phone takes phone chrome throughout: an inline filter bar is
   pure vertical-space cost at 430px tall, which is the scarce axis there.

   Callers that include this must exclude it from their narrow-DESKTOP variant
   for the same reason they include it here - that state means "phone-ish
   treatment but the side nav stayed put", and in this tier the side nav is
   gone. */
export function isShortTouch() {
    return isTouchNav() && shortMql.matches;
}

/* Touch-nav is not a media query - it folds in a class and a cross-frame read
   (isTouchNav above), so it has no `change` event of its own to listen to.
   This is that event. */
export function onTouchNavChange(fn) {
    touchNavListeners.push(fn);
}

function syncTouchNavClass() {
    document.documentElement.classList.toggle('nav-touch-mode', isTouchNav());
    touchNavListeners.forEach(function (fn) { fn(); });
}

/* The phone-chrome pair, kept in step as the window resizes or the device
   rotates. layout.html's head script sets these same two classes
   synchronously before first paint (the FOUC-avoidance pattern
   syncTouchNavClass documents above); this is what keeps them right
   afterwards. */
function syncPhoneChromeClass() {
    const shortTouch = isShortTouch();
    const root = document.documentElement;
    root.classList.toggle('phone-chrome', phoneMql.matches || shortTouch);
    root.classList.toggle('phone-chrome-side', shortTouch && !phoneMql.matches);
}

realHoverNoneMql.addEventListener('change', syncTouchNavClass);
phoneMql.addEventListener('change', syncPhoneChromeClass);
shortMql.addEventListener('change', syncPhoneChromeClass);
onTouchNavChange(syncPhoneChromeClass);

/* Dev breakpoint preview (layout.html): the preview iframe is just a resized
   window still driven by the real desktop mouse, so it can never make
   hover:none media queries true on its own - previewing "Tablet Portrait" /
   "Tablet Wide" would otherwise always exercise the hover-capable
   narrow-window path (locked rail), never the touch-only drawer.
   layout.html's postMessage handler calls this when switching breakpoints.

   DELIBERATELY STILL ON window, and it stays there after the rest of the
   migration finishes. Its caller is layout.html's postMessage handler, which
   is an inline script in a template and not part of any import graph. It is
   not dead code and it is not an oversight - see the inventory's section 7. */
window.__setDevBpTouch = function (touch) {
    document.documentElement.classList.toggle('force-touch-nav', !!touch);
    syncTouchNavClass();
};

/* Runs the initial classification. Called from main.js's DOMContentLoaded
   handler rather than from this module's body, so the first sync happens at
   exactly the point in the page lifecycle it always has - subscribers
   registered by later modules are all in place by then, and syncTouchNavClass
   notifies every one of them. */
export function initBreakpointClasses() {
    syncTouchNavClass();
    syncPhoneChromeClass();
}
