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
import { initSettingsPanel, initViewFullSystemToggle } from './layout/settings-panel.js';
import { initSchoolSwitcher, initIdentitySwitcher, initIdentitySearch } from './layout/identity-switcher.js';
import { initAppSearch } from './layout/app-search.js';
import { initContentShellHeight } from './layout/content-shell.js';
import { initAppStatus } from './layout/app-status.js';
import { initReportProblem } from './layout/report-problem.js';
import { initMobileSheet } from './layout/mobile-sheet.js';
import { initBreakpointClasses } from './layout/breakpoints.js';
import { initDisabledTooltips } from './components/disabled-tooltip.js';
import { setupOverflowTabs } from './components/overflow-tabs.js';
import { initFilterBarMobileMode } from './components/filter-bar/mobile-mode.js';

document.addEventListener('DOMContentLoaded', initApp);

// A module body runs after parsing but before DOMContentLoaded (measured,
// es-modules-findings.md §3) - a listener registered above is still in time.
function initApp() {

    initDisabledTooltips();

    // Full reasoning in layout/breakpoints.js.
    initBreakpointClasses();
    initFilterBarMobileMode();

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


    // Full reasoning in components/form-controls.js.
    enhanceFormControls(document);
}
