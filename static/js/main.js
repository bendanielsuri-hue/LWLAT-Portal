import { closest } from './components/dom.js';
import { initPageHeaderActions } from './layout/page-header-actions.js';
import { initStatsCarousels } from './components/stats-carousel.js';
import { enhanceFormControls } from './components/form-controls.js';
import { enhanceSelect } from './components/select.js';
/* select-row.js exports nothing - its whole job is the delegated click
   listener it attaches at module-load time. A bare import is what makes
   that happen: nothing else in this file references it by name, so without
   this import the browser would never fetch or execute the module at all,
   and the listener would silently never attach - which is exactly what
   happened until this line was added (found live: the "Create new Panel
   Group" quick-add button stopped doing anything). */
import './components/select-row.js';
import { wireScrollCarousel } from './components/carousel.js';
import { setupFilterBarMoreFilters } from './components/filter-bar/more-filters.js';
import { initFilterBars } from './components/filter-bar/wire.js';
import { initSelectable } from './components/selectable.js';
import { initCardSwitchers } from './components/card-switcher.js';
import { initBreadcrumbs } from './layout/breadcrumbs.js';
import { initStickyZoneSentinels } from './layout/sticky-zone.js';
import { fabProtrusionAboveTabbar, fabOverlapClearance } from './layout/mobile-tabbar.js';
import { initMatHome } from './pages/mat-home.js';
import { initSidebarCollapse } from './layout/sidebar.js';
import { initHubRailSeam } from './layout/hub-rail.js';
import { initOverlayNav } from './layout/overlay-nav.js';
import { rafThrottle } from './components/raf-throttle.js';
import { initSettingsPanel, initViewFullSystemToggle } from './layout/settings-panel.js';
import { initSchoolSwitcher, initIdentitySwitcher, initIdentitySearch } from './layout/identity-switcher.js';
import { initAppSearch } from './layout/app-search.js';
import { initContentShellHeight } from './layout/content-shell.js';
import {
    phoneMql,
    narrowMql,
    touchMql,
    railMql,
    shortMql,
    portraitMql,
    portraitWideMql,
    hoverCapableMql,
    isTouchNav,
    isShortTouch,
    onTouchNavChange,
    initBreakpointClasses,
} from './layout/breakpoints.js';


/* Still on window, deliberately, until #212 moves the inline <script> blocks
   that call them to modules: panel.js reads rafThrottle, and panel's home.html
   calls initSelectable on a fragment it has just swapped in. Both are modules
   now (components/raf-throttle.js, components/selectable.js) - this is the
   compatibility shim, not their definition. */
window.rafThrottle = rafThrottle;
window.initSelectable = initSelectable;
window.setupFilterBarMoreFilters = setupFilterBarMoreFilters;
/* Still on window, deliberately: panel.js (a non-module classic script) and
   inline <script> blocks in templates call these directly, and both move to
   modules in #212. enhanceSelect specifically: panel.js's own dialog-close
   cleanup re-enhances a stale zone's <select>s by calling window.enhanceSelect
   directly, not through enhanceFormControls (it doesn't want the date/time/
   fused-field passes that come with the full sweep). */
window.enhanceFormControls = enhanceFormControls;
window.enhanceSelect = enhanceSelect;

// Selectable cards/rows: clicking (or Enter/Space on) a card toggles a "chosen"
// state, without triggering when the click lands on an inner link/button.

// (INT-U3) Why a disabled button is disabled. A disabled control swallows
// its own pointer events - a real [disabled] button gets no hover/mouse
// events at all in Chrome, and .btn-disabled sets pointer-events: none
// (buttons.css) - so a `title` sitting ON the button never surfaces: the
// attribute is there, the hover that would show it never arrives. Several
// pages had shipped exactly that and looked correct in the markup while
// showing nothing live.
// The reason therefore has to live on a wrapping element that still
// receives hover, which is what _disabled_btn.html builds by hand for the
// buttons it renders. This does the same automatically for every other
// disabled control: put the reason on the button as
// data-disabled-reason="...", and the wrapper is created, filled, and
// emptied again in step with the button's own disabled state - static
// markup, a JS toggle, and an AJAX-swapped fragment all covered by the
// observer in the DOMContentLoaded sweep below, so there is nothing
// per-page to remember to call.
function syncDisabledTooltip(el) {
    var reason = el.getAttribute('data-disabled-reason');
    var disabled = el.disabled === true
        || el.classList.contains('btn-disabled')
        || el.getAttribute('aria-disabled') === 'true';
    var parent = el.parentNode;
    if (!parent) return;
    var wrap = parent.classList && parent.classList.contains('disabled-btn-tooltip-wrap') ? parent : null;
    if (!disabled || !reason) {
        // The wrapper stays in place once built (display: contents, so it
        // costs nothing in the layout tree) - only the tooltip goes, so an
        // enabled button doesn't explain why it isn't disabled.
        if (wrap) wrap.removeAttribute('title');
        return;
    }
    if (!wrap) {
        wrap = document.createElement('span');
        wrap.className = 'disabled-btn-tooltip-wrap';
        parent.insertBefore(wrap, el);
        wrap.appendChild(el);
    }
    if (wrap.getAttribute('title') !== reason) wrap.setAttribute('title', reason);
}
// One caveat when adding a reason to a button that sits in a flex row
// styled with a `> *` child selector: the wrapper is display: contents, so
// the .btn stays the real flex item while `>` matches the wrapper instead -
// such a rule needs a `> .disabled-btn-tooltip-wrap > .btn` companion. See
// .meeting-card-actions (panel.css) for the reference pair.
function wireDisabledTooltips(root) {
    (root || document).querySelectorAll('[data-disabled-reason]').forEach(syncDisabledTooltip);
}
window.wireDisabledTooltips = wireDisabledTooltips;

// Generic overflow tabs: any row of <button>/<a> tabs opting in via
// [data-overflow-tabs] (or the two cases already relying on it — Inclusion
// Panel's per-card .tab-row and any .card-switcher) scrolls horizontally
// once it overflows, rather than hiding whichever tabs don't fit behind a
// "More ▾" dropdown (#131 — that dropdown duplicated every hidden tab's
// label in a floating menu, disliked, and needed a design pass). Drag/swipe
// to scroll, with a fade at whichever edge has more content, and selecting
// a tab scrolls it to the centre of the row so it's never left half-hidden.
// Pulled out of the DOMContentLoaded sweep and exposed on window for the
// same reason as initSelectable above — a tab row swapped in fresh via AJAX
// (e.g. Inclusion Panel Home's My Actions card refresh) needs this re-run on
// the new element, not just the page's original rows.
function setupOverflowTabs(row) {
    if (!row) return;
    var tabs = Array.prototype.slice.call(row.children).filter(function (el) {
        return el.tagName === 'BUTTON' || el.tagName === 'A';
    });
    if (tabs.length < 2) return;

    row.classList.add('overflow-scroll-row');
    var wrap = document.createElement('div');
    wrap.className = 'overflow-scroll-wrap';
    row.parentNode.insertBefore(wrap, row);
    wrap.appendChild(row);

    var fadeLeft = buildOverflowFade('left');
    var fadeRight = buildOverflowFade('right');
    wrap.appendChild(fadeLeft);
    wrap.appendChild(fadeRight);

    // Samples the actual background-colour of whatever tab is under each
    // edge, rather than assuming a fixed pair of colours — .card-switcher's
    // tabs alternate bg-page/bg-surface by active state, but .tab-row sits
    // on a single uniform background throughout, so hardcoding either
    // scheme would be wrong for the other call site.
    function sampleBackground(edgeX) {
        var el = document.elementFromPoint(edgeX, row.getBoundingClientRect().top + row.clientHeight / 2);
        var tab = el && el.closest('button, a');
        return getComputedStyle(tab || row).backgroundColor;
    }

    function measure() {
        // Epsilon wider than a plain rounding guard (was 2px) — on a
        // fractionally-scaled display (e.g. Windows 125%/150% scaling)
        // scrollWidth/clientWidth carry sub-pixel remainders, so even a
        // fully-scrolled row can sit >2px short of scrollWidth and never
        // clear has-more-right, leaving the edge fade permanently drawn
        // over the last tab (reads as a soft clip on its label).
        wrap.classList.toggle('has-more-left', row.scrollLeft > 4);
        wrap.classList.toggle('has-more-right', row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
        var rowRect = row.getBoundingClientRect();
        fadeLeft.style.backgroundColor = sampleBackground(rowRect.left + 8);
        fadeRight.style.backgroundColor = sampleBackground(rowRect.right - 8);
    }
    /* Throttled on every async trigger, not just resize: measure() runs two
       document.elementFromPoint hit-tests plus a getComputedStyle per call
       (sampleBackground, above), and scroll fires far more often than resize
       does. One coalesced run per frame is all the fades can actually paint
       anyway. The initial call below stays direct so the fades are correct on
       the first frame rather than one rAF late.

       The window listener is kept alongside the ResizeObserver here (unlike
       the two carousels further down, where it was redundant): measure()
       samples a colour by viewport coordinate, so it has to re-run when the
       row merely MOVES, which a size-only observer never reports. */
    var measureSoon = rafThrottle(measure);
    row.addEventListener('scroll', measureSoon, { passive: true });
    window.addEventListener('resize', measureSoon);
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(measureSoon).observe(row);
    }
    measure();

    setupOverflowDragScroll(row);

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            // Only when the row itself actually overflows - otherwise
            // there's nothing for scrollIntoView to do *within* row, so it
            // walks up to the next scrollable ancestor instead (the page
            // itself) and scrolls that to satisfy inline:'center',
            // shifting the whole layout sideways on desktop widths where
            // every tab already fits (live feedback: "changing tab in My
            // Actions shifts the whole page, cuts off the global menu").
            if (row.scrollWidth <= row.clientWidth + 1) return;
            tab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        });
    });
}
window.setupOverflowTabs = setupOverflowTabs;

function buildOverflowFade(side) {
    var fade = document.createElement('div');
    fade.className = 'overflow-scroll-fade overflow-scroll-fade--' + side;
    return fade;
}

// Pointer-based drag-to-scroll (mouse and touch alike — devtools mobile
// emulation and non-touch trackpads don't get native touch-scroll for
// free). Suppresses the click that would otherwise fire on the tab under
// the pointer once the drag has moved past a small threshold, so dragging
// doesn't also switch tabs.
function setupOverflowDragScroll(el) {
    var dragging = false;
    var moved = false;
    var startX = 0;
    var startScroll = 0;

    el.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragging = true;
        moved = false;
        startX = e.clientX;
        startScroll = el.scrollLeft;
        el.classList.add('overflow-scroll-dragging');
    });
    el.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - startX;
        if (Math.abs(dx) > 4) moved = true;
        el.scrollLeft = startScroll - dx;
    });
    function endDrag() {
        dragging = false;
        el.classList.remove('overflow-scroll-dragging');
    }
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('pointerleave', function () { if (dragging) endDrag(); });
    el.addEventListener('click', function (e) {
        if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
    }, true);
}


document.addEventListener('DOMContentLoaded', function () {

    // (INT-U3) Disabled-reason tooltips, wired once for the whole document
    // (see syncDisabledTooltip above). The observer - not a call per page -
    // is the point: a reason has to keep up with a button that gets
    // disabled/enabled by JS (a modal's Save while its form is invalid) or
    // arrives in an AJAX-swapped fragment, and every page that forgot to
    // re-run it would silently lose the tooltip again. attributeFilter keeps
    // it to the four attributes that can change the answer, and the pass
    // itself is idempotent, so the DOM edits it makes settle immediately
    // rather than re-triggering the observer indefinitely.
    wireDisabledTooltips();
    var syncDisabledTooltips = rafThrottle(function () { wireDisabledTooltips(); });
    new MutationObserver(syncDisabledTooltips).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['disabled', 'class', 'aria-disabled', 'data-disabled-reason']
    });

    /* Tiers, touch-nav detection and the phone-chrome classes all live in
       layout/breakpoints.js now. Called here rather than from that module's
       body so the first classification still happens at exactly this point in
       the page lifecycle: every subscriber registered by a later module is in
       place by now, and this notifies all of them. */
    initBreakpointClasses();
    /* The filter bar's "mobile" treatment covers a narrowed desktop browser
       window too, not just a true phone (live feedback: "I basically want
       everything to be the same as mobile except we keep the side nav and do
       not have the bottom mobile nav" - after two narrower bespoke
       narrow-desktop attempts both still read as unfinished).
       html.filter-bar-mobile-mode is the single switch every affected CSS rule
       keys off, rather than each rule re-deriving this same OR condition from
       raw media features.

       narrowMql / portraitMql / portraitWideMql / isShortTouch are imports now
       - layout/breakpoints.js carries the reasoning for each, which is where a
       reader asking "why 900px, and why orientation rather than width?" should
       find it. What stays here is which COMBINATION of them means mobile
       treatment, which is the filter bar's own question and nobody else's. */
    /* (#187) Every width uses the tray now - live feedback: "I think we make
       all the filter modes work like mobile. It's a great compromise!"

       This was the one tier test in the filter bar: true meant the slide-down
       tray, false meant the "View filters" panel and the dynamic-overflow
       measurement that fills it. Two rendering paths, two sets of rules to
       keep in step, and the reason several bugs on this branch only appeared
       at one width - the panel path is where "View filters" stopped opening,
       and it needed its own copy of the section-scroll wiring.

       Kept as a function rather than deleted at every call site: the callers
       still read better saying WHY they branch, the widths are still real
       (isFilterBarNarrowDesktop below still distinguishes them for styling),
       and if the panel ever comes back this is the one line to restore.

       The old expression, for that day:
         phoneMql.matches || isShortTouch() ||
         (narrowMql.matches && !isTouchNav()) ||
         (isTouchNav() && portraitMql.matches && !portraitWideMql.matches) */
    function isFilterBarMobile() {
        return true;
    }
    // The narrow-desktop sub-case specifically (filter-bar-mobile-mode minus
    // true phone width) - live feedback: "all I can see is the overlay" -
    // the tray's own position: fixed; left: 0; right: 0 (panel.css) is a
    // viewport-anchored floating tray, correct on a real phone (no side nav,
    // full-bleed card flush with the viewport edge) but wrong once the side
    // nav stays put: the tray span no longer matches the (inset) filter bar
    // above it. Originally solved by pushing the list down instead of
    // floating over it in this state; reverted (live feedback: "I like the
    // slide over the top that mobile does... can we do this for portrait
    // tablet as well") once positionFilterTray started anchoring left/width
    // to the bar's own rect (INT-R2) instead of the raw viewport edge, which
    // fixes the misalignment without giving up the floating overlay. This
    // class is now purely a styling hook (square tray corners, sticky-
    // footer variant, category-strip panel at wider widths) - not a
    // positioning branch.
    function isFilterBarNarrowDesktop() {
        return !phoneMql.matches && !isShortTouch() && ((narrowMql.matches && !isTouchNav()) || (isTouchNav() && portraitMql.matches && !portraitWideMql.matches));
    }
    function syncFilterBarMobileClass() {
        // filter-bar-mode-switching (panel.css: forces transition: none on
        // .filter-bar-collapsible) - live feedback: "I saw [the tray reduce
        // in height, leaving a thin line] when I switched to portrait
        // tablet mode" - resizing/rotating into or out of mobile mode while
        // a page is already open re-triggers the exact same height/border-
        // bottom-color transition the layout.html head script's own
        // synchronous classification (same bug, same fix, on first paint)
        // was written to prevent - that fix only covers the very first
        // paint, not a live reclassification like this one. Without this
        // guard, .filter-bar-collapsible flips between display: contents
        // (no box, live at its full open content height) and the mobile
        // box (height: 0, a real transition property) in the same
        // recalculation triggered by this class toggle, so the browser
        // interpolates from that full height down to 0 - visibly, and
        // (confirmed via Playwright) with a wildly wrong intermediate
        // `top` too, since position: fixed's own static-position fallback
        // recomputes every frame as the box's height/flow changes mid-
        // transition. Only guards an actual VALUE change (below), not
        // every call - this fires on every touch-nav toggle too (this
        // function's own comment elsewhere), most of which don't actually
        // flip either class.
        var wasMobile = document.documentElement.classList.contains('filter-bar-mobile-mode');
        var wasNarrow = document.documentElement.classList.contains('filter-bar-narrow-desktop');
        var nowMobile = isFilterBarMobile();
        var nowNarrow = isFilterBarNarrowDesktop();
        var modeChanged = wasMobile !== nowMobile || wasNarrow !== nowNarrow;
        if (modeChanged) document.documentElement.classList.add('filter-bar-mode-switching');
        document.documentElement.classList.toggle('filter-bar-mobile-mode', nowMobile);
        document.documentElement.classList.toggle('filter-bar-narrow-desktop', nowNarrow);
        // Re-run each tray bar's own dynamic-overflow measurement
        // (setupFilterBarMoreFilters's measure(), exposed as
        // bar._filterBarMeasure) on every call here, not just a genuine
        // bar.clientWidth change - this function also fires from a touch-
        // nav-only transition (onTouchNavChange, breakpoints.js), which flips
        // filter-bar-mobile-mode without necessarily resizing anything.
        // Skipping this left fields that measure() had already buried
        // behind the hidden "More filters" group (built while still non-
        // mobile) stuck there once mobile-mode's own CSS hid the only
        // control that could reveal it again - live feedback: "lost the
        // close and clear button" (they render, just via the wrong,
        // desktop-only .filter-actions-right placement, because the field
        // grid itself never made it back into the tray). Only one tray bar
        // is ever on screen per page, but querySelectorAll here (not a
        // single querySelector) costs nothing and needs no per-page change
        // if that ever stops being true.
        document.querySelectorAll('.filter-bar-tray').forEach(function (trayBar) {
            if (trayBar._filterBarMeasure) trayBar._filterBarMeasure();
        });
        // Removes the guard one frame later (below), not synchronously -
        // the class toggle/measure() calls above still need to actually
        // commit and paint with transitions suppressed first; removing the
        // guard in the same tick would let the *next* recalculation (this
        // one) re-enable the transition before the browser ever renders a
        // frame with it off, defeating the whole guard.
        if (modeChanged) {
            requestAnimationFrame(function () {
                document.documentElement.classList.remove('filter-bar-mode-switching');
            });
        }
    }
    syncFilterBarMobileClass();
    phoneMql.addEventListener('change', syncFilterBarMobileClass);
    shortMql.addEventListener('change', syncFilterBarMobileClass);
    narrowMql.addEventListener('change', syncFilterBarMobileClass);
    portraitMql.addEventListener('change', syncFilterBarMobileClass);
    portraitWideMql.addEventListener('change', syncFilterBarMobileClass);
    onTouchNavChange(syncFilterBarMobileClass);
    /* Exposed globally because inline <script> blocks in templates read them.
       They move to modules in #212 and these two lines go with them.

       The three media queries that used to be exported alongside them
       (window.studentsNarrowMql/studentsPortraitMql/studentsPortraitWideMql)
       are already gone: their only reader was setupFilterBarMoreFilters, which
       imports them from layout/breakpoints.js directly now. */
    window.isFilterBarMobile = isFilterBarMobile;
    window.isFilterBarNarrowDesktop = isFilterBarNarrowDesktop;

    initSidebarCollapse();

    // The sidebar's correct collapsed/touch state is fully applied by this
    // point (initBreakpointClasses and initSidebarCollapse above, both called
    // synchronously) - safe to lift the transition suppression layout.html
    // added before first paint. One rAF so it lifts after this state has
    // actually been painted, not mid-frame.
    requestAnimationFrame(function () {
        document.documentElement.classList.remove('js-preload');
    });

    initHubRailSeam();

    initOverlayNav();

    initMatHome();

    /* Layout chrome. Each of these was an IIFE inline in this handler; they are
       modules under js/layout/ now and this is the whole of what is left. Order
       is the order they ran in before, which is not known to matter - none of
       them reads state another one writes - but preserving it costs nothing and
       makes the extraction a move rather than a change. */
    initSettingsPanel();
    initViewFullSystemToggle();
    initSchoolSwitcher();
    initIdentitySwitcher();
    initIdentitySearch();
    initAppSearch();
    initContentShellHeight();

    document.querySelectorAll('.card .tab-row, .card-switcher, [data-overflow-tabs]').forEach(setupOverflowTabs);
    initFilterBars();

    initPageHeaderActions();

    initCardSwitchers();

    initBreadcrumbs();

    document.querySelectorAll('.senco-carousel-wrap').forEach(function (wrap) {
        wireScrollCarousel(wrap, '.senco-carousel', '.senco-card', '.senco-carousel-arrow--prev', '.senco-carousel-arrow--next');
    });

    initStatsCarousels();

    initStickyZoneSentinels();


    // Auto-enhance every plain select/date/time field already in the page on
    // load (server-rendered pages). AJAX-injected modal content (e.g.
    // hubs/inclusion/panel/static/panel/js/panel.js) isn't in the DOM yet at this point,
    // so it calls window.enhanceFormControls(dialog) itself after injecting.
    enhanceFormControls(document);
});
