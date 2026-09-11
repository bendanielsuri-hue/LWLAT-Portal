import { initPageHeaderActions } from './layout/page-header-actions.js';
import { initStatsCarousels } from './components/stats-carousel.js';
import { enhanceFormControls } from './components/form-controls.js';
/* select-row.js exports nothing - its whole job is the delegated click
   listener it attaches at module-load time. A bare import is what makes
   that happen: nothing else in this file references it by name, so without
   this import the browser would never fetch or execute the module at all,
   and the listener would silently never attach - which is exactly what
   happened until this line was added (found live: the "Create new Panel
   Group" quick-add button stopped doing anything). */
import './components/select-row.js';
import { wireScrollCarousel } from './components/carousel.js';
import { initFilterBars } from './components/filter-bar/wire.js';
import { initCardSwitchers } from './components/card-switcher.js';
import { initBreadcrumbs } from './layout/breadcrumbs.js';
import { initStickyZoneSentinels } from './layout/sticky-zone.js';
import { initMatHome } from './pages/mat-home.js';
import { initSidebarCollapse } from './layout/sidebar.js';
import { initHubRailSeam } from './layout/hub-rail.js';
import { initOverlayNav } from './layout/overlay-nav.js';
import { rafThrottle } from './components/raf-throttle.js';
import { initSettingsPanel, initViewFullSystemToggle } from './layout/settings-panel.js';
import { initSchoolSwitcher, initIdentitySwitcher, initIdentitySearch } from './layout/identity-switcher.js';
import { initAppSearch } from './layout/app-search.js';
import { initContentShellHeight } from './layout/content-shell.js';
import { initAppStatus } from './layout/app-status.js';
import { initReportProblem } from './layout/report-problem.js';
import { initMobileSheet } from './layout/mobile-sheet.js';
import {
    phoneMql,
    narrowMql,
    shortMql,
    portraitMql,
    portraitWideMql,
    onTouchNavChange,
    initBreakpointClasses,
} from './layout/breakpoints.js';
import { wireDisabledTooltips } from './components/disabled-tooltip.js';
import { setupOverflowTabs } from './components/overflow-tabs.js';
import { isFilterBarMobile, isFilterBarNarrowDesktop } from './components/filter-bar/mobile-mode.js';

document.addEventListener('DOMContentLoaded', initApp);

// A module body runs after parsing but before DOMContentLoaded (measured,
// es-modules-findings.md §3) - a listener registered above is still in time.
function initApp() {

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
       raw media features. */
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

    initSettingsPanel();
    initViewFullSystemToggle();
    initSchoolSwitcher();
    initIdentitySwitcher();
    initIdentitySearch();
    initAppSearch();
    initContentShellHeight();
    initAppStatus();
    initReportProblem();
    initMobileSheet();

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
    // hubs/inclusion/panel/static/panel/js/dialogs/*.js) isn't in the DOM yet
    // at this point, so it imports enhanceFormControls and calls it directly
    // on the fresh dialog content after injecting.
    enhanceFormControls(document);
}
