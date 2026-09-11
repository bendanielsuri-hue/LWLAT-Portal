import { closest } from './components/dom.js';
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

    // Page-header actions (the {% block page_extras %} buttons/links beside
    // the page title, e.g. "Add Referral") crowd the title on narrow
    // screens. Below the existing 900px sidebar-collapse breakpoint, fold
    // them into an "Actions ▾" dropdown reusing the same .tab-row-more*
    // look as setupOverflowTabs() above. The real nodes are moved (not
    // cloned) so any click handlers/data attributes on them keep working.
    (function setupPageExtrasOverflow() {
        var mq = window.matchMedia('(max-width: 900px)');

        function collectActionItems(extras) {
            var items = [];
            Array.prototype.forEach.call(extras.children, function (el) {
                if (el.tagName === 'A' || el.tagName === 'BUTTON') {
                    items.push(el);
                } else if (el.classList.contains('key-actions')) {
                    Array.prototype.forEach.call(el.children, function (child) {
                        if (child.tagName === 'A' || child.tagName === 'BUTTON') items.push(child);
                    });
                }
            });
            return items;
        }

        document.querySelectorAll('.page-header-extras').forEach(function (extras) {
            var items = collectActionItems(extras);
            if (!items.length) return;

            items.forEach(function (item) {
                item._homeParent = item.parentElement;
                item._homeNext = item.nextSibling;
            });

            var moreWrap = document.createElement('div');
            moreWrap.className = 'tab-row-more hidden';
            var moreBtn = document.createElement('button');
            moreBtn.type = 'button';
            moreBtn.className = 'tab-row-more-btn';
            moreBtn.textContent = 'Actions ▾';
            var menu = document.createElement('div');
            menu.className = 'tab-row-more-menu hidden';
            moreWrap.appendChild(moreBtn);
            moreWrap.appendChild(menu);
            extras.appendChild(moreWrap);

            moreBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                menu.classList.toggle('hidden');
            });
            document.addEventListener('click', function () { menu.classList.add('hidden'); });

            function collapse() {
                items.forEach(function (item) { menu.appendChild(item); });
                moreWrap.classList.remove('hidden');
            }
            function expand() {
                items.slice().reverse().forEach(function (item) {
                    item._homeParent.insertBefore(item, item._homeNext);
                });
                moreWrap.classList.add('hidden');
                menu.classList.add('hidden');
            }

            function sync() {
                if (mq.matches) collapse(); else expand();
            }
            sync();
            mq.addEventListener('change', sync);
        });
    })();

    initCardSwitchers();

    initBreadcrumbs();

    document.querySelectorAll('.senco-carousel-wrap').forEach(function (wrap) {
        wireScrollCarousel(wrap, '.senco-carousel', '.senco-card', '.senco-carousel-arrow--prev', '.senco-carousel-arrow--next');
    });

    // Home's KPI row carousel (#116, rebuilt #132 for the "stack" effect,
    // simplified again - PROTOTYPE, live feedback: "we do not have an
    // active state for cards, it just scrolls. No dots, just a left and
    // right arrow to indicate there is more off screen"). No active card
    // any more - every card is always full size and fully clickable, so
    // there's nothing to centre, no per-card state to track, and no
    // "peeking card" to disambiguate a tap against. Arrows/fade just read
    // raw scroll position (start/end/overflowing); nothing here needs to
    // know which card, if any, is "the" one. Generic per-.stats-carousel-
    // wrap (forEach, not a singleton) - unlike My Referrals/My Actions
    // (home.html, page-specific), this was always meant to be reusable by
    // another KPI row.
    document.querySelectorAll('.stats-carousel-wrap').forEach(function (wrap) {
        var track = wrap.querySelector('.stats-carousel-track');
        var prev = wrap.querySelector('.stats-carousel-arrow--prev');
        var next = wrap.querySelector('.stats-carousel-arrow--next');
        var fadeL = wrap.querySelector('.stats-carousel-fade-l');
        var fadeR = wrap.querySelector('.stats-carousel-fade-r');
        if (!track || !prev || !next) return;

        function slots() {
            return Array.prototype.slice.call(track.children);
        }

        function step() {
            var slot = slots()[0];
            if (!slot) return track.clientWidth;
            var style = window.getComputedStyle(track);
            return slot.getBoundingClientRect().width + (parseFloat(style.columnGap || style.gap) || 0);
        }

        // "Fits without scrolling" check, independent of the carousel's own
        // edge inset (which would otherwise force scrollWidth to overflow
        // on its own, making a plain scrollWidth/clientWidth comparison
        // useless for deciding *whether to carry that inset at all*). Sums
        // each card's own offsetWidth + the row's real gaps against
        // track.clientWidth, which stays ~constant regardless of which
        // mode's padding is currently applied (that padding eats into the
        // content box, it doesn't change the track's own outer width).
        //
        // PROTOTYPE: never true at <=900px (matches panel.css's own
        // ≤900px auto-width block) - live feedback, screenshot: shrinking
        // the cards there (auto width + smaller everything) made all 6
        // technically fit unwrapped, which this function correctly
        // detected and switched to grid/wrap mode over - but that's the
        // wrong call at this width. Grid mode was meant for a couple of
        // KPI cards on a wide desktop screen where scrolling would be
        // silly, not for phone/tablet, where the carousel (arrows, fade,
        // drag) is the deliberately-built experience regardless of
        // whether the shrunk cards happen to squeeze in unwrapped.
        function fitsFlat() {
            if (window.matchMedia('(max-width: 900px)').matches) return false;
            var cards = slots();
            if (cards.length < 2) return true;
            var style = window.getComputedStyle(track);
            var gap = parseFloat(style.columnGap || style.gap) || 0;
            var total = gap * (cards.length - 1);
            cards.forEach(function (card) { total += card.offsetWidth; });
            return total <= track.clientWidth + 1;
        }

        function updateState() {
            var flat = fitsFlat();
            wrap.classList.toggle('is-flat', flat);

            if (flat) {
                // Grid mode: every card is already visible at once, so
                // there's nothing left for arrows/fade to drive.
                prev.hidden = true;
                next.hidden = true;
                if (fadeL) fadeL.style.opacity = 0;
                if (fadeR) fadeR.style.opacity = 0;
                return;
            }

            var overflowing = track.scrollWidth > track.clientWidth + 1;
            var atStart = track.scrollLeft <= 1;
            var atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 1;

            prev.hidden = !overflowing;
            next.hidden = !overflowing;
            prev.disabled = atStart;
            next.disabled = atEnd;
            if (fadeL) fadeL.style.opacity = (!overflowing || atStart) ? 0 : 1;
            if (fadeR) fadeR.style.opacity = (!overflowing || atEnd) ? 0 : 1;
        }

        prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); });
        next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: 'smooth' }); });
        track.addEventListener('scroll', updateState, { passive: true });
        window.addEventListener('resize', rafThrottle(updateState));
        wrap.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowRight') { e.preventDefault(); track.scrollBy({ left: step(), behavior: 'smooth' }); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); track.scrollBy({ left: -step(), behavior: 'smooth' }); }
        });

        // Click-and-drag (mouse/pen only - touch already gets native
        // panning/flick from overflow-x: auto). No fling-to-settle any
        // more (that projected a release's momentum onto the nearest
        // card's centre - meaningless now that no card is "the" one to
        // settle on) - a mouse drag just stops wherever it's released,
        // same as touch already does.
        var isPointerDown = false;
        var dragMoved = false;
        var startX = 0;
        var startScrollLeft = 0;
        track.addEventListener('pointerdown', function (e) {
            if (e.pointerType === 'touch') return;
            // Grid mode: everything already fits, there's nothing to drag-
            // scroll to - skip starting a drag at all so a slightly-jittery
            // click can never get misread as one and swallowed below.
            if (wrap.classList.contains('is-flat')) return;
            // Without this preventDefault, a mousedown+move over a
            // .stat-card (a real <a>) kicks off the browser's own native
            // link drag-and-drop instead of ever reaching pointermove below
            // with useful deltas. A real click still reaches the link
            // normally; only an actual drag (dragMoved) gets swallowed by
            // the click-capture guard below.
            e.preventDefault();
            isPointerDown = true;
            dragMoved = false;
            startX = e.clientX;
            startScrollLeft = track.scrollLeft;
        });
        track.addEventListener('pointermove', function (e) {
            if (!isPointerDown) return;
            var dx = e.clientX - startX;
            if (!dragMoved && Math.abs(dx) > 5) {
                dragMoved = true;
                track.classList.add('is-grabbing');
                track.setPointerCapture(e.pointerId);
            }
            if (dragMoved) track.scrollLeft = startScrollLeft - dx;
        });
        function endPointerDrag() {
            isPointerDown = false;
            track.classList.remove('is-grabbing');
        }
        track.addEventListener('pointerup', endPointerDrag);
        track.addEventListener('pointercancel', endPointerDrag);
        // Swallows the click that follows a drag (dragMoved) so releasing
        // a drag over a card doesn't also fire its link navigation - every
        // other click (no drag happened) falls straight through to the
        // card's own <a>, no exceptions, since there's no "peeking card"
        // needing a tap-to-advance any more.
        track.addEventListener('click', function (e) {
            if (dragMoved) { e.preventDefault(); e.stopPropagation(); dragMoved = false; }
        }, true);

        updateState();
    });

    initStickyZoneSentinels();







    // Auto-enhance every plain select/date/time field already in the page on
    // load (server-rendered pages). AJAX-injected modal content (e.g.
    // hubs/inclusion/panel/static/panel/js/panel.js) isn't in the DOM yet at this point,
    // so it calls window.enhanceFormControls(dialog) itself after injecting.
    window.enhanceFormControls(document);
});

// Custom select / date / time controls — progressive enhancement over a native
// <select>/<input type=date>/<input type=time>: the native element stays in the
// DOM (visually hidden) as the real form field and the single source of truth,
// so `required`/`value`/`form.checkValidity()`/normal POST submission all keep
// working untouched. A custom trigger button + anchored popover (styled like
// .tab-row-more-menu/.side-nav option rows, see style.css) reads/writes that
// native element's value and fires a real `change` event on it whenever the
// user picks something, which is what any existing listener on the form
// reacts to. Top-level (not wrapped in DOMContentLoaded) so these are callable
// as soon as this script has executed, including from content injected later
// by AJAX-loaded modals (e.g. hubs/inclusion/panel/static/panel/js/panel.js).
(function () {
    function closeAllUiPopovers(except) {
        document.querySelectorAll('.ui-popover[open]').forEach(function (el) {
            if (el !== except) el.close();
        });
    }
    document.addEventListener('click', function (e) {
        if (e.target.closest('.ui-select, .ui-date, .ui-time')) return;
        closeAllUiPopovers();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        closeAllUiPopovers();
    });
    // A .ui-popover (calendar grid, time spinner, select dropdown) is
    // appended to document.body, a sibling of whatever modal it was opened
    // from — not a descendant — so closing that parent modal doesn't
    // automatically close it too. Without this, closing e.g. "Edit Panel
    // Settings" while the time picker is still open left the picker
    // orphaned on screen, still fully open and interactive, with no parent
    // dialog left to close it. 'close' doesn't bubble, so this has to be a
    // capture-phase listener on document rather than one bound per dialog.
    document.addEventListener('close', function (e) {
        if (!e.target.matches || !e.target.matches('dialog') || e.target.classList.contains('ui-popover')) return;
        closeAllUiPopovers();
    }, true);

    // Each popover is a modal <dialog>, which makes every OTHER trigger on
    // the page inert while it's open — so a click meant for a different
    // trigger never reaches it; it lands on the open popover's own
    // (transparent) backdrop instead, which just closes it. Once closed, the
    // rest of the page is no longer inert, so re-resolving the same screen
    // coordinates a tick later correctly finds the trigger the user actually
    // meant to click and clicks it for them — turning what would otherwise
    // be a "click to close, click again to open the other one" into one
    // click. Restricted to known trigger classes so an incidental click on
    // empty modal padding just closes the popover, without also forwarding
    // into (and accidentally triggering) the outer dialog's own
    // backdrop-click-to-close handler.
    function forwardClickThrough(x, y, ownTrigger) {
        requestAnimationFrame(function () {
            var el = document.elementFromPoint(x, y);
            var target = el && el.closest('.ui-select-trigger, .ui-date-calendar-btn, .ui-add-group-btn');
            // Don't re-click the trigger that just closed this very popover —
            // otherwise clicking anywhere over the trigger a second time
            // (which lands on the modal dialog's own transparent backdrop,
            // since the trigger is inert while its popover is open) would
            // immediately reopen what the user just closed.
            if (target && target !== ownTrigger) target.click();
        });
    }

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    // Positions a popover with explicit position:fixed coordinates anchored to
    // the trigger's getBoundingClientRect(), flipping above when there isn't
    // room below and clamping horizontally to the viewport. position:fixed
    // (rather than position:absolute relative to an in-flow ancestor) is
    // deliberate: these popovers live inside a scrollable <dialog>
    // (hubs/inclusion/panel/static/panel/css/panel.css's max-height/overflow-y on
    // dialog.modal-dialog), and an absolutely-positioned descendant of a
    // scroll-clipping ancestor can render outside the modal's visible box
    // once flipped — fixed positioning anchors purely to the viewport and
    // sidesteps that clipping ambiguity entirely. Must run after the
    // popover's content is rendered and made visible (display:none elements
    // report 0 for offsetHeight/offsetWidth), otherwise there's nothing to
    // measure.
    /* The gap a popover keeps between itself and every viewport edge. Was
       already the horizontal clamp's own literal 8 below; named here since
       the vertical cap (#183) needs the same number to mean the same thing
       on both axes. */
    var POPOVER_VIEWPORT_MARGIN = 8;
    /* Floor for the height cap - roughly three options plus the panel's own
       chrome, i.e. still recognisably a scrollable list rather than a
       letterbox. */
    var POPOVER_MIN_HEIGHT = 120;
    function positionPopover(panel, anchorEl, opts) {
        opts = opts || {};
        panel.style.position = 'fixed';
        // matchWidth is a floor, not an exact match: opts.contentWidth (the
        // widest option's own text, .ui-select-panel callers only) can push
        // the open panel wider than the closed trigger - a .filter-field
        // trigger is now sized to its label, not its widest option (main.js
        // resolveTriggerMinWidth, live feedback 2026-08-23), so the popover
        // still needs to be wide enough to show a long option on one line
        // rather than wrapping it just because the closed control is narrow.
        if (opts.matchWidth) panel.style.width = Math.max(anchorEl.getBoundingClientRect().width, opts.contentWidth || 0) + 'px';
        var rect = anchorEl.getBoundingClientRect();
        /* #183: cap the panel to the room that actually exists before
           placing it. Live feedback: "dropdown selection on a long list can
           be cut off and not reachable by scrolling! This is mobile
           landscape!" - .ui-popover's own max-height: 260px (forms.css) is
           a fixed number chosen with no reference to the viewport, so on a
           375px-tall one a long list overflowed whichever way it was
           placed: below, it ran past the bottom edge; flipped above, its
           top went negative. Unreachable either way rather than merely
           awkward - the panel scrolls INTERNALLY, so its own scrollbar only
           moves content inside a box whose far edge is off-screen, and the
           page can't be scrolled to it because the panel is position:
           fixed.
           Cleared first: this cap is an inline style, so a tighter one left
           by a previous open would otherwise still be in force and be
           measured as if it were the panel's natural height. */
        panel.style.maxHeight = '';
        /* visualViewport.height, not innerHeight - the visible height with
           browser chrome/an on-screen keyboard accounted for, which is the
           height a fixed panel actually has to fit inside. Same source
           positionFilterTray already measures against. */
        var viewportHeight = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
        var panelHeight = panel.offsetHeight;
        var spaceBelow = viewportHeight - rect.bottom - POPOVER_VIEWPORT_MARGIN;
        var spaceAbove = rect.top - POPOVER_VIEWPORT_MARGIN;
        // Unchanged flip rule - only the space either side of it is now
        // measured net of the margin the panel has to keep off each edge.
        var placeAbove = spaceBelow < panelHeight + 12 && spaceAbove > spaceBelow;
        /* The floor matters when the trigger itself sits near an edge: with
           no minimum, the "available" space on the chosen side can be a few
           px and the panel would collapse to an unusable sliver. Below the
           floor it deliberately overflows a little instead, and the clamp
           below is what keeps that overflow inside the viewport. */
        var available = Math.max(placeAbove ? spaceAbove : spaceBelow, POPOVER_MIN_HEIGHT);
        if (panelHeight > available) {
            panel.style.maxHeight = available + 'px';
            // Re-read AFTER the cap: the pre-cap height is what the top
            // arithmetic below would otherwise place against, which is
            // exactly how the flipped-above case ended up at a negative top.
            panelHeight = panel.offsetHeight;
        }
        var top = placeAbove
            ? rect.top - panelHeight - 4
            : rect.bottom + 4;
        /* Final guarantee, independent of everything above: neither edge
           leaves the viewport whatever the measurements said. Math.max on
           the upper bound keeps this from inverting into a negative top on
           a viewport too short to hold even the floored panel. */
        top = Math.min(
            Math.max(POPOVER_VIEWPORT_MARGIN, top),
            Math.max(POPOVER_VIEWPORT_MARGIN, viewportHeight - panelHeight - POPOVER_VIEWPORT_MARGIN)
        );
        var left = opts.alignRight ? rect.right - panel.offsetWidth : rect.left;
        var maxLeft = window.innerWidth - panel.offsetWidth - POPOVER_VIEWPORT_MARGIN;
        left = Math.min(Math.max(POPOVER_VIEWPORT_MARGIN, left), Math.max(POPOVER_VIEWPORT_MARGIN, maxLeft));
        panel.style.top = top + 'px';
        panel.style.left = left + 'px';
    }

    // How much wider than the widest option's own text the trigger should
    // be (room for its left/right padding + chevron) and the hard cap beyond
    // which a long option label just gets clipped instead of stretching the
    // control further.
    var SELECT_TRIGGER_PADDING = 48;
    var SELECT_TRIGGER_MAX_WIDTH = 240;
    // .filter-field has its own, smaller, fixed cap (components/forms.css
    // .filter-field { max-width: 200px }) - 200 minus the field's own
    // horizontal padding (--space-sm, 12px each side), since that padding
    // eats into the budget actually available to .ui-select-trigger inside
    // it. Using the generic 240px cap here would still overflow the field
    // by up to 16px - a smaller version of the exact bug this constant
    // exists to avoid (see grilling session 2026-07-12).
    var FILTER_FIELD_TRIGGER_MAX_WIDTH = 176;
    /* The shortest value a filter trigger is allowed to size itself to - see
       resolveTriggerMinWidth's floor. A string, not a number, so it is
       measured in the trigger's own live font. */
    var FILTER_FIELD_TRIGGER_MIN_TEXT = 'Yes';
    var selectWidthGhost = null;
    function textWidth(text, font) {
        if (!selectWidthGhost) {
            selectWidthGhost = document.createElement('span');
            selectWidthGhost.style.position = 'absolute';
            selectWidthGhost.style.visibility = 'hidden';
            selectWidthGhost.style.left = '-9999px';
            selectWidthGhost.style.whiteSpace = 'nowrap';
            document.body.appendChild(selectWidthGhost);
        }
        selectWidthGhost.style.font = font;
        selectWidthGhost.textContent = text;
        return selectWidthGhost.offsetWidth;
    }
    function maxOptionTextWidth(selectEl, font) {
        var max = 0;
        Array.prototype.forEach.call(selectEl.options, function (opt) {
            max = Math.max(max, textWidth(opt.textContent, font));
        });
        return max;
    }

    /* A filter label's own natural width - the widest LINE of its text, not
       the width of the box it happens to be rendered in.

       balanceFilterGroupLabels (components/filter-bar/more-filters.js) has
       already broken any multi-word
       label onto two lines with a <br> by the time this runs, so the widest
       line is what the label actually needs; the whole string would
       over-measure a two-line label by roughly double. Its own horizontal
       padding is added back from the computed style rather than assumed,
       since a panel strips it to 0 and the phone-portrait chip does not. */
    function labelTextWidth(label) {
        if (!label) return 0;
        var style = window.getComputedStyle(label);
        var span = label.querySelector('.filter-field-label-text') || label;
        var widest = 0;
        (span.innerHTML || '').split(/<br\s*\/?>/i).forEach(function (line) {
            var text = line.replace(/<[^>]*>/g, '').trim();
            if (text) widest = Math.max(widest, textWidth(text, style.font));
        });
        return widest ? widest + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) : 0;
    }

    /* Everything in the trigger that is not the value's own text: its side
       padding (the right side is the chevron's reserved room) and its own
       borders, plus a pixel of slack for sub-pixel rounding. Measured, not
       assumed, wherever the result is used as a hard ceiling. */
    function triggerChromeWidth(trigger) {
        var style = window.getComputedStyle(trigger);
        return parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) +
            parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth) + 1;
    }

    // The closed trigger's stable width, one rule for all three contexts a
    // select can be enhanced in:
    // - .ui-fused-field: no fixed pixel makes sense - the control is always
    //   meant to exactly fill a variable-width cell (an auto-aligned column,
    //   or the full row once stacked), so this is skipped entirely and the
    //   trigger just fills its cell via width: 100%, truncating with an
    //   ellipsis if a value doesn't fit.
    // - .filter-field: sized to its own *label*, not the widest option - a
    //   filter bar wants as many fields visible on screen as possible, so a
    //   field only grows past its label when the value actually picked needs
    //   more room (live feedback 2026-08-23: "filters should be the width of
    //   the label unless a wide selection has actually been selected"). Still
    //   capped at FILTER_FIELD_TRIGGER_MAX_WIDTH so one very long option
    //   value doesn't blow the field out past the field's own budget - it
    //   just clips with the trigger's existing ellipsis instead.
    //   In a filter PANEL (isWrappingFilterField, below) it still grows to
    //   the selection, but only as far as one line's worth; past the cap it
    //   asks for a two-LINE width instead of being truncated, because the
    //   trigger there wraps (panel.css). One line first, always - halving
    //   every value would wrap "All" as readily as a real phrase. Only a
    //   value that cannot fit one line inside the cap gets the two-line
    //   budget, which is roughly half the width for the same text.
    //   Why it matters: panel fields are content-sized flex items packed onto
    //   shared lines, so every pixel a field grows can push a whole section
    //   onto a new row. Sizing every field to its WIDEST option instead was
    //   tried and reverted - live feedback: "this takes too much space when
    //   mostly they are set to all". Whatever growth is left is animated
    //   rather than designed out (animateFilterTrayReflow, above).
    //   0.55, not a flat half: wrapping breaks at words, so two lines never
    //   pack perfectly full - the extra 10% is the same allowance the tray's
    //   own column-fit maths used before it. It applies to the TEXT only,
    //   with the chrome added back whole: side padding and the chevron's
    //   reserved room are spent once, not per line.
    //   That chrome is measured off the trigger rather than taken from
    //   SELECT_TRIGGER_PADDING here. The constant is a fair estimate when it
    //   only sets a floor, but applyTriggerWidth turns this number into a
    //   hard ceiling in a panel, and being a few px under then costs real
    //   text: every short value came back as "A" instead of "All" (live
    //   feedback: "it is all getting truncated").
    // - everywhere else: sized to the widest *option* (so picking a short
    //   option doesn't narrow the control down enough to clip a longer one
    //   next time it's opened), capped at the generic SELECT_TRIGGER_MAX_WIDTH.
    // An inline min-width always wins over max-width/width: 100% when they
    // conflict, which is exactly why .ui-fused-field and .filter-field each
    // need their own handling rather than the generic one (see grilling
    // session 2026-07-12).
    /* True for a filter field that sits in a filter PANEL - somewhere a long
       value is allowed to wrap onto a second line instead of demanding the
       width to sit on one (panel.css).

       Two of them: the tray (phone portrait, landscape phone, portrait tablet
       and a narrowed desktop window - every tier that renders fields in the
       tray at all), and the "View filters" panel every width above mobile
       drops down. Live feedback: "can desktop also have a wrap on long
       selected filters, are they less tall?" - they are, and a panel has
       vertical room to spend where it has no horizontal room to spare.

       Not the always-visible primary row: that is one line of controls beside
       the search box, where a field growing a second line would set the whole
       bar's height. Phone portrait used to be excluded too, because its chip
       grid pinned every trigger to min-width: 0 and sized it by its column,
       leaving no inline width to act on - that grid is gone (#185) and its
       fields are content-sized like every other tier's now.

       Read live rather than cached: the dev breakpoint preview and a real
       rotation both cross this boundary without a reload. */
    function isWrappingFilterField(filterField) {
        if (filterField.closest('.filter-secondary-fields')) return true;
        var root = document.documentElement;
        if (!(root.classList.contains('phone-chrome-side') ||
            root.classList.contains('filter-bar-mobile-mode'))) return false;
        return !!filterField.closest('.filter-bar-collapsible-inner');
    }
    function resolveTriggerMinWidth(selectEl, trigger) {
        if (selectEl.closest('.ui-fused-field')) return '';
        var font = window.getComputedStyle(trigger).font;
        var filterField = selectEl.closest('.filter-field');
        if (filterField) {
            var label = filterField.querySelector(':scope > label');
            var wraps = isWrappingFilterField(filterField);
            // In a panel the label is measured from its own TEXT, not from
            // its rendered box: it stretches to whatever width the field
            // currently is, so reading offsetWidth after a wide option had
            // widened the field fed that width straight back in as the floor
            // and the control could never shrink again - live feedback: "when
            // I drop back to all it does not revert back to narrow!".
            var labelWidth = wraps ? labelTextWidth(label) : (label ? label.offsetWidth : 0);
            var selectedOpt = selectEl.options[selectEl.selectedIndex];
            var selectedText = selectedOpt ? textWidth(selectedOpt.textContent, font) : 0;
            var valueWidth = selectedText ? selectedText + SELECT_TRIGGER_PADDING : 0;
            if (selectedText && wraps) {
                var chrome = triggerChromeWidth(trigger);
                var oneLine = selectedText + chrome;
                valueWidth = oneLine <= FILTER_FIELD_TRIGGER_MAX_WIDTH
                    ? oneLine
                    : (selectedText * 0.55) + chrome;
            }
            /* A floor, so a short value can't shrink the control below what
               a normal short value needs - live feedback: "can we change so
               that minimum width of dropdown is same as if Yes is selected.
               If I change it to Y it reduces in width!". The label is
               already a floor, but a field whose label is short too (EAL,
               More Able) had nothing else holding it, so picking a
               one-character value visibly narrowed the control and pushed
               its whole row around.
               Measured from the reference string through the same
               textWidth/chrome path as the value itself rather than set as
               a pixel number, so it tracks the font the trigger actually
               renders in instead of drifting from it. */
            var floorWidth = textWidth(FILTER_FIELD_TRIGGER_MIN_TEXT, font)
                + (wraps ? triggerChromeWidth(trigger) : SELECT_TRIGGER_PADDING);
            return Math.min(Math.max(labelWidth, valueWidth, floorWidth), FILTER_FIELD_TRIGGER_MAX_WIDTH) + 'px';
        }
        var widest = maxOptionTextWidth(selectEl, font);
        return Math.min(widest + SELECT_TRIGGER_PADDING, SELECT_TRIGGER_MAX_WIDTH) + 'px';
    }

    /* Sets the trigger's inline width from resolveTriggerMinWidth, as a floor
       everywhere and - in a filter panel - as a ceiling as well.

       The ceiling is what makes the two-line budget above mean anything. A
       panel field is a flex item with a basis of auto, so it sizes to its own
       max-content: without an upper bound the trigger simply grows until the
       whole value fits on one line, and the white-space: normal meant to wrap
       it (panel.css) never has a reason to. That shipped - live feedback, with
       a screenshot of a 240px-wide Ethnicity: "I do not see it wrapping onto
       two lines?".

       Same value for both bounds, so the control is exactly as wide as its own
       budget says and the text wraps inside it. Cleared elsewhere, where a
       trigger is free to size to its own content. */
    function applyTriggerWidth(selectEl, trigger) {
        var width = resolveTriggerMinWidth(selectEl, trigger);
        trigger.style.minWidth = width;
        var filterField = selectEl.closest('.filter-field');
        trigger.style.maxWidth = (width && filterField && isWrappingFilterField(filterField)) ? width : '';
    }

    /* Recompute every filter trigger's inline width in `bar` against the tier
       that is live NOW. resolveTriggerMinWidth's tray branch (above) reads
       root classes that a rotation, a window resize or the dev breakpoint
       preview can all change without any select being re-rendered - without
       this, a field keeps whichever rule applied the last time it happened to
       render. Idempotent: it only re-reads and re-writes the same property. */
    window.resyncFilterTriggerWidths = function (bar) {
        bar.querySelectorAll('.filter-field .ui-select').forEach(function (wrap) {
            var selectEl = wrap.querySelector('select');
            var trigger = wrap.querySelector('.ui-select-trigger');
            if (selectEl && trigger) applyTriggerWidth(selectEl, trigger);
        });
    };

    // The open popover's own width floor - always the generic
    // SELECT_TRIGGER_MAX_WIDTH cap regardless of context, never the tighter
    // FILTER_FIELD_TRIGGER_MAX_WIDTH: a .filter-field's closed trigger is
    // deliberately capped to its own column budget, but the popover is an
    // overlay positioned on top of the page, not confined to that column, so
    // a wide option (a long Panel Group name, say) can still show in full
    // instead of wrapping just because the closed control reads narrow.
    function popoverContentWidth(selectEl, trigger) {
        return Math.min(maxOptionTextWidth(selectEl, window.getComputedStyle(trigger).font) + SELECT_TRIGGER_PADDING, SELECT_TRIGGER_MAX_WIDTH);
    }

    window.enhanceSelect = function (selectEl) {
        if (!selectEl || selectEl._uiSelect) return;

        var wrap = document.createElement('span');
        wrap.className = 'ui-select';
        var trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'ui-select-trigger';
        trigger.disabled = selectEl.disabled;
        // (INT-U3) Carry the underlying <select>'s own disabled reason onto
        // the trigger that stands in for it - the native control is hidden
        // once enhanced, so a reason left on it could never be hovered.
        if (selectEl.dataset.disabledReason) trigger.dataset.disabledReason = selectEl.dataset.disabledReason;
        // A <dialog> shown via showModal(), not a plain div with the
        // popover attribute: the popover API's coexistence with an
        // already-open modal <dialog> turned out to make this element inert
        // in practice (clicks/hover passed straight through to whatever was
        // behind it) — nested modal dialogs are a far more battle-tested
        // browser pattern for "must stay on top of, and interactive
        // alongside, an open dialog."
        var panel = document.createElement('dialog');
        // Mirrors the source <select>'s own classes onto the panel, same as
        // render() below does for the trigger button - the panel is a
        // sibling of the trigger in document.body, not a descendant, so a
        // class like ui-select--center placed on the <select> in a template
        // wouldn't otherwise reach its popover options via CSS.
        panel.className = 'ui-select-panel ui-popover ' + Array.prototype.filter.call(
            selectEl.classList, function (c) { return c !== 'ui-select-native'; }
        ).join(' ');
        // .ui-fused-field--stacked selects (e.g. Chair) center their value
        // under a centered label - see DES-A2.
        // That context lives on an ancestor, not the <select>'s own class
        // list, so it can't be picked up by the mirroring above.
        if (selectEl.closest('.ui-fused-field--stacked')) {
            panel.classList.add('ui-select-panel--stacked-context');
        }

        selectEl.classList.add('ui-select-native');
        // tabIndex = -1: visually hidden (opacity: 0, 1x1px, forms.css) is
        // not the same as out of the tab order - a plain <select> stays
        // natively focusable regardless of how it's styled, so without this
        // Tab would stop on it AND the visible trigger button separately,
        // one invisible stop per field (live feedback: "why do I need to
        // hit tab twice to get to next filter"). Doesn't affect anything
        // else this element still needs to do scripted (reading/setting
        // .value, dispatching change, participating in form submission) -
        // tabindex only ever affects keyboard Tab traversal.
        selectEl.tabIndex = -1;
        selectEl.parentNode.insertBefore(wrap, selectEl);
        wrap.appendChild(selectEl);
        wrap.appendChild(trigger);
        document.body.appendChild(panel);
        panel.addEventListener('click', function (e) {
            if (e.target !== panel) return;
            var x = e.clientX, y = e.clientY;
            panel.close();
            forwardClickThrough(x, y, trigger);
        });
        // Flips the trigger's chevron to point up while its popover is open,
        // regardless of which of the several ways (re-click, outside click,
        // Escape, picking an option) closed it — a single `close` listener on
        // the <dialog> covers all of them instead of repeating this at every
        // call site that can close the panel.
        panel.addEventListener('close', function () {
            trigger.classList.remove('open');
        });

        function currentLabel() {
            var opt = selectEl.options[selectEl.selectedIndex];
            return opt ? opt.textContent : '';
        }

        function render() {
            /* The label goes in a span rather than straight onto the button.
               A <button> can't be a line-clamp container: Chrome blockifies
               display: -webkit-box on one to flow-root (measured - the clamp
               was silently ignored and a long value clipped mid-line with no
               ellipsis), so the one layout that wants a two-line value - the
               fused label-beside-control filter field, panel.css - needs a
               real element inside the button to clamp instead. Everywhere
               else this is invisible: the span is inline and inherits, and
               trigger.textContent still reads back exactly the same string,
               so resolveTriggerMinWidth and every other reader is unaffected.
               Rebuilt each render rather than reused - render() already
               rewrites the whole label on every change. */
            trigger.textContent = '';
            var labelSpan = document.createElement('span');
            labelSpan.className = 'ui-select-trigger-text';
            labelSpan.textContent = currentLabel();
            trigger.appendChild(labelSpan);
            // Mirror the wrapped select's own classes (e.g. a value-driven
            // colour class set server-side) onto the visible trigger button,
            // since the native select itself is hidden.
            var isPriority = selectEl.classList.contains('priority-select');
            trigger.className = 'ui-select-trigger ' + Array.prototype.filter.call(
                selectEl.classList, function (c) { return c !== 'ui-select-native'; }
            ).join(' ') + (isPriority ? ' priority-' + selectEl.value : '');
            // Size the closed control to the widest option rather than
            // whichever one happens to be selected, so picking a short
            // option doesn't narrow the control (and its popover list,
            // which mirrors this width) down enough to clip longer options
            // next time it's opened - see resolveTriggerMinWidth above for
            // the per-context caps (.ui-fused-field/.filter-field/generic).
            applyTriggerWidth(selectEl, trigger);
            panel.innerHTML = '';
            function appendOption(opt) {
                var row = document.createElement('div');
                row.className = 'ui-option' + (opt.selected ? ' selected' : '') + (opt.dataset.muted === '1' ? ' muted' : '') + (isPriority ? ' priority-' + opt.value : '');
                row.textContent = opt.textContent;
                row.dataset.value = opt.value;
                row.addEventListener('click', function () {
                    selectEl.value = opt.value;
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    render();
                    closeAllUiPopovers();
                });
                panel.appendChild(row);
            }
            // Walk the select's own direct children (not the flat .options
            // collection) so an <optgroup>'s label renders as a heading in
            // the popover instead of silently vanishing - the native select
            // always had this structure, the popover just never showed it.
            Array.prototype.forEach.call(selectEl.children, function (child) {
                if (child.tagName === 'OPTGROUP') {
                    var heading = document.createElement('div');
                    heading.className = 'ui-option-group-label';
                    heading.textContent = child.label;
                    panel.appendChild(heading);
                    Array.prototype.forEach.call(child.children, appendOption);
                } else {
                    appendOption(child);
                }
            });
        }

        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            var isOpen = panel.open;
            closeAllUiPopovers(panel);
            if (isOpen) {
                panel.close();
            } else {
                panel.showModal();
                trigger.classList.add('open');
                positionPopover(panel, trigger, { matchWidth: true, contentWidth: popoverContentWidth(selectEl, trigger) });
            }
        });

        trigger.addEventListener('keydown', function (e) {
            // Delete/Backspace clears back to a blank/placeholder option —
            // only for selects that actually have one (optional fields like
            // Default Chair/member staff/expertise). Required fields
            // (Day/Month/Year/Hour/Minute/Panel Group) never have a blank
            // `value=""` first option, so this guard naturally excludes them
            // with no per-field configuration needed.
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectEl.options.length && selectEl.options[0].value === '' && selectEl.selectedIndex !== 0) {
                    e.preventDefault();
                    selectEl.selectedIndex = 0;
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    render();
                }
                return;
            }
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            if (!panel.open) {
                // Matches native <select> behavior: arrow keys on a closed,
                // focused select cycle the value directly rather than
                // opening the list; Enter/Space still open it.
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    var delta = e.key === 'ArrowDown' ? 1 : -1;
                    var nextIdx = Math.min(selectEl.options.length - 1, Math.max(0, selectEl.selectedIndex + delta));
                    if (nextIdx !== selectEl.selectedIndex) {
                        selectEl.selectedIndex = nextIdx;
                        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                        render();
                    }
                    return;
                }
                closeAllUiPopovers(panel);
                panel.showModal();
                trigger.classList.add('open');
                positionPopover(panel, trigger, { matchWidth: true, contentWidth: popoverContentWidth(selectEl, trigger) });
                return;
            }
            var rows = Array.prototype.slice.call(panel.querySelectorAll('.ui-option'));
            var current = panel.querySelector('.ui-option.highlighted') || panel.querySelector('.ui-option.selected');
            var idx = rows.indexOf(current);
            if (e.key === 'ArrowDown') idx = Math.min(rows.length - 1, idx + 1);
            else if (e.key === 'ArrowUp') idx = Math.max(0, idx - 1);
            else if (current) { current.click(); return; }
            rows.forEach(function (r) { r.classList.remove('highlighted'); });
            if (rows[idx]) {
                rows[idx].classList.add('highlighted');
                rows[idx].scrollIntoView({ block: 'nearest' });
            }
        });

        selectEl._uiSelect = { refresh: render };
        render();
    };

    var CALENDAR_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '<rect x="4" y="5.5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" />'
        + '<path d="M4 9.5h16M8 3.5v3M16 3.5v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />'
        + '</svg>';
    var CLOCK_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6" />'
        + '<path d="M12 7.5v5l3.5 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />'
        + '</svg>';
    var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }

    window.enhanceDateInput = function (inputEl, opts) {
        if (!inputEl || inputEl._uiDate) return;
        opts = opts || {};

        var wrap = document.createElement('span');
        wrap.className = 'ui-date';
        var fields = document.createElement('span');
        fields.className = 'ui-date-fields';
        var daySelect = document.createElement('select');
        var monthSelect = document.createElement('select');
        var yearSelect = document.createElement('select');
        var calBtn = document.createElement('button');
        calBtn.type = 'button';
        calBtn.className = 'ui-date-calendar-btn btn btn-secondary btn-sm';
        calBtn.innerHTML = CALENDAR_ICON_SVG;
        // A <dialog>, not a popover-attribute div — see the matching comment
        // in enhanceSelect() for why (nested modal dialogs are the
        // reliably-interactive way to stay on top of an open dialog).
        var calPanel = document.createElement('dialog');
        calPanel.className = 'ui-calendar-popover ui-popover';

        inputEl.classList.add('ui-select-native');
        inputEl.parentNode.insertBefore(wrap, inputEl);
        wrap.appendChild(inputEl);
        fields.appendChild(daySelect);
        fields.appendChild(monthSelect);
        fields.appendChild(yearSelect);
        wrap.appendChild(fields);
        wrap.appendChild(calBtn);
        document.body.appendChild(calPanel);
        calPanel.addEventListener('click', function (e) {
            if (e.target !== calPanel) return;
            var x = e.clientX, y = e.clientY;
            calPanel.close();
            forwardClickThrough(x, y, calBtn);
        });

        var today = new Date();
        var nowYear = today.getFullYear();
        var nowMonth = today.getMonth() + 1;

        for (var y = (opts.noPast ? nowYear : nowYear - 1); y <= nowYear + (opts.noPast ? 2 : 1); y++) {
            var yOpt = document.createElement('option');
            yOpt.value = y;
            yOpt.textContent = y;
            yearSelect.appendChild(yOpt);
        }

        // Only relevant when opts.noPast: the current year's month/day lists
        // start at the current month/day instead of January/1st, so a Panel
        // meeting can never be scheduled in the past. Any other (future)
        // year/month is unrestricted.
        function rebuildMonthOptions(selectedMonth) {
            var year = parseInt(yearSelect.value, 10) || nowYear;
            var minMonth = (opts.noPast && year === nowYear) ? nowMonth : 1;
            monthSelect.innerHTML = '';
            for (var m = minMonth; m <= 12; m++) {
                var opt = document.createElement('option');
                opt.value = m;
                opt.textContent = MONTH_NAMES[m - 1];
                monthSelect.appendChild(opt);
            }
            monthSelect.value = Math.max(minMonth, Math.min(selectedMonth || minMonth, 12));
        }

        function rebuildDayOptions(selectedDay) {
            var year = parseInt(yearSelect.value, 10) || nowYear;
            var month = parseInt(monthSelect.value, 10) || 1;
            var max = daysInMonth(year, month);
            var min = (opts.noPast && year === nowYear && month === nowMonth) ? today.getDate() : 1;
            daySelect.innerHTML = '';
            for (var d = min; d <= max; d++) {
                var opt = document.createElement('option');
                opt.value = d;
                opt.textContent = d;
                daySelect.appendChild(opt);
            }
            daySelect.value = Math.max(min, Math.min(selectedDay || min, max));
        }

        function syncFromValue() {
            var parts = (inputEl.value || '').split('-');
            var year = parts.length === 3 ? parseInt(parts[0], 10) : nowYear;
            var month = parts.length === 3 ? parseInt(parts[1], 10) : nowMonth;
            var day = parts.length === 3 ? parseInt(parts[2], 10) : today.getDate();
            if (opts.noPast && year < nowYear) year = nowYear;
            if (!yearSelect.querySelector('option[value="' + year + '"]')) {
                var extra = document.createElement('option');
                extra.value = year; extra.textContent = year;
                yearSelect.insertBefore(extra, yearSelect.firstChild);
            }
            yearSelect.value = year;
            rebuildMonthOptions(month);
            rebuildDayOptions(day);
            [daySelect, monthSelect, yearSelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
        }

        function commit() {
            var year = parseInt(yearSelect.value, 10);
            var month = parseInt(monthSelect.value, 10);
            var day = parseInt(daySelect.value, 10);
            inputEl.value = year + '-' + pad2(month) + '-' + pad2(day);
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        [daySelect, monthSelect, yearSelect].forEach(function (select) {
            select.addEventListener('change', function () {
                if (select === yearSelect) {
                    rebuildMonthOptions(parseInt(monthSelect.value, 10));
                    if (monthSelect._uiSelect) monthSelect._uiSelect.refresh();
                }
                if (select !== daySelect) {
                    rebuildDayOptions(parseInt(daySelect.value, 10));
                    if (daySelect._uiSelect) daySelect._uiSelect.refresh();
                }
                commit();
                renderCalendar();
            });
            window.enhanceSelect(select);
            select.parentNode.classList.add('ui-select--sm');
        });

        function renderCalendar() {
            var year = parseInt(yearSelect.value, 10) || nowYear;
            var month = (parseInt(monthSelect.value, 10) || 1) - 1;
            calPanel.innerHTML = '';
            var header = document.createElement('div');
            header.className = 'ui-calendar-header';
            var prev = document.createElement('button');
            prev.type = 'button'; prev.className = 'btn btn-sm'; prev.textContent = '‹';
            prev.disabled = !!(opts.noPast && year === nowYear && (month + 1) === nowMonth);
            var label = document.createElement('span');
            label.textContent = MONTH_NAMES[month] + ' ' + year;
            var next = document.createElement('button');
            next.type = 'button'; next.className = 'btn btn-sm'; next.textContent = '›';
            prev.addEventListener('click', function (e) {
                e.stopPropagation();
                var d = new Date(year, month - 1, 1);
                if (!yearSelect.querySelector('option[value="' + d.getFullYear() + '"]')) syncYearOption(d.getFullYear());
                yearSelect.value = d.getFullYear();
                rebuildMonthOptions(d.getMonth() + 1);
                rebuildDayOptions(parseInt(daySelect.value, 10));
                [monthSelect, yearSelect, daySelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
                renderCalendar();
            });
            next.addEventListener('click', function (e) {
                e.stopPropagation();
                var d = new Date(year, month + 1, 1);
                if (!yearSelect.querySelector('option[value="' + d.getFullYear() + '"]')) syncYearOption(d.getFullYear());
                yearSelect.value = d.getFullYear();
                rebuildMonthOptions(d.getMonth() + 1);
                rebuildDayOptions(parseInt(daySelect.value, 10));
                [monthSelect, yearSelect, daySelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
                renderCalendar();
            });
            header.appendChild(prev); header.appendChild(label); header.appendChild(next);
            calPanel.appendChild(header);

            var grid = document.createElement('div');
            grid.className = 'ui-calendar-grid';
            ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(function (d) {
                var h = document.createElement('div');
                h.className = 'ui-calendar-dow';
                h.textContent = d;
                grid.appendChild(h);
            });

            var startOffset = new Date(year, month, 1).getDay();
            var max = daysInMonth(year, month + 1);
            var selected = inputEl.value;
            var todayStr = nowYear + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate());

            for (var i = 0; i < startOffset; i++) grid.appendChild(document.createElement('div'));
            for (var day = 1; day <= max; day++) {
                var cellDate = year + '-' + pad2(month + 1) + '-' + pad2(day);
                var cell = document.createElement('div');
                cell.className = 'ui-calendar-day';
                if (cellDate === todayStr) cell.classList.add('is-today');
                if (cellDate === selected) cell.classList.add('is-selected');
                cell.textContent = day;
                if (opts.noPast && cellDate < todayStr) {
                    cell.classList.add('is-past');
                } else {
                    cell.addEventListener('click', function (d) {
                        return function (e) {
                            e.stopPropagation();
                            daySelect.value = d;
                            if (daySelect._uiSelect) daySelect._uiSelect.refresh();
                            commit();
                            renderCalendar();
                            closeAllUiPopovers();
                        };
                    }(day));
                }
                grid.appendChild(cell);
            }
            calPanel.appendChild(grid);

            var footer = document.createElement('div');
            footer.className = 'ui-popover-footer';
            var todayBtn = document.createElement('button');
            todayBtn.type = 'button';
            todayBtn.className = 'ui-popover-footer-link';
            todayBtn.textContent = 'Today';
            todayBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (!yearSelect.querySelector('option[value="' + nowYear + '"]')) syncYearOption(nowYear);
                yearSelect.value = nowYear;
                rebuildMonthOptions(nowMonth);
                rebuildDayOptions(today.getDate());
                [monthSelect, yearSelect, daySelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
                commit();
                renderCalendar();
            });
            footer.appendChild(todayBtn);
            calPanel.appendChild(footer);
        }

        function syncYearOption(year) {
            var extra = document.createElement('option');
            extra.value = year; extra.textContent = year;
            yearSelect.insertBefore(extra, yearSelect.firstChild);
        }

        function toggleCalendar() {
            var isOpen = calPanel.open;
            closeAllUiPopovers(calPanel);
            if (isOpen) {
                calPanel.close();
            } else {
                renderCalendar();
                calPanel.showModal();
                positionPopover(calPanel, calBtn, { alignRight: true });
            }
        }
        calBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleCalendar(); });

        inputEl._uiDate = { refresh: syncFromValue };
        syncFromValue();
    };

    window.enhanceTimeInput = function (inputEl) {
        if (!inputEl || inputEl._uiTime) return;

        var wrap = document.createElement('span');
        wrap.className = 'ui-time';
        var fields = document.createElement('span');
        fields.className = 'ui-time-fields';
        var hourSelect = document.createElement('select');
        var minuteSelect = document.createElement('select');
        var ampmSelect = document.createElement('select');
        ['AM', 'PM'].forEach(function (label) {
            var opt = document.createElement('option');
            opt.value = label; opt.textContent = label;
            ampmSelect.appendChild(opt);
        });
        for (var m = 0; m < 60; m++) {
            var mOpt = document.createElement('option');
            mOpt.value = pad2(m); mOpt.textContent = pad2(m);
            minuteSelect.appendChild(mOpt);
        }
        // Clock button opening a picker popover — a quick way to set a time,
        // alongside (not instead of) the inline Hour/Minute/AM-PM selects,
        // same relationship the calendar-grid popover has to Date's own
        // inline Day/Month/Year selects. The popover is a fresh,
        // independently-rendered picker (see renderTimePopover below), not
        // a relocation of the inline selects — two surfaces, one underlying
        // value.
        var timeBtn = document.createElement('button');
        timeBtn.type = 'button';
        timeBtn.className = 'ui-time-picker-btn btn btn-secondary btn-sm';
        timeBtn.innerHTML = CLOCK_ICON_SVG;
        var timePanel = document.createElement('dialog');
        timePanel.className = 'ui-time-popover ui-popover';

        inputEl.classList.add('ui-select-native');
        inputEl.parentNode.insertBefore(wrap, inputEl);
        wrap.appendChild(inputEl);
        fields.appendChild(hourSelect);
        fields.appendChild(minuteSelect);
        fields.appendChild(ampmSelect);
        wrap.appendChild(fields);
        wrap.appendChild(timeBtn);
        document.body.appendChild(timePanel);
        timePanel.addEventListener('click', function (e) {
            if (e.target !== timePanel) return;
            var x = e.clientX, y = e.clientY;
            timePanel.close();
            forwardClickThrough(x, y, timeBtn);
        });

        // Time format (12h/24h) is a global Settings preference (data-time-format
        // on <html>, see templates/layout.html), not a per-field choice.
        var is12h = document.documentElement.getAttribute('data-time-format') === '12';

        // Hours outside the typical 08:00-17:00 school day are visually
        // muted (see isHourMuted) since they're rarely the right choice for
        // a panel meeting. A 12h hour maps to two different 24h hours
        // depending on AM/PM, so both are stashed on the inline <option>
        // for applyHourMuting to resolve against the current ampmSelect
        // value; the popover's own hour rows resolve the same 24h hour
        // directly from the row's own precomputed value (see
        // renderTimePopover) since they don't have an <option> to stash it on.
        function isHourMuted(hour24) { return hour24 < 8 || hour24 > 17; }

        function rebuildHourOptions() {
            hourSelect.innerHTML = '';
            var max = is12h ? 12 : 23;
            var start = is12h ? 1 : 0;
            for (var h = start; h <= max; h++) {
                var opt = document.createElement('option');
                opt.value = pad2(h); opt.textContent = pad2(h);
                if (is12h) {
                    opt.dataset.hour24Am = h === 12 ? 0 : h;
                    opt.dataset.hour24Pm = h === 12 ? 12 : h + 12;
                } else {
                    opt.dataset.hour24 = h;
                }
                hourSelect.appendChild(opt);
            }
            applyHourMuting();
        }

        function applyHourMuting() {
            Array.prototype.forEach.call(hourSelect.options, function (opt) {
                var hour24 = is12h
                    ? parseInt(ampmSelect.value === 'PM' ? opt.dataset.hour24Pm : opt.dataset.hour24Am, 10)
                    : parseInt(opt.dataset.hour24, 10);
                if (isHourMuted(hour24)) {
                    opt.dataset.muted = '1';
                } else {
                    delete opt.dataset.muted;
                }
            });
        }

        function currentParts() {
            var parts = (inputEl.value || '00:00').split(':');
            return { hour24: parseInt(parts[0], 10) || 0, minute: parts[1] || '00' };
        }

        function syncFromValue() {
            var parts = currentParts();
            rebuildHourOptions();
            if (is12h) {
                var isPM = parts.hour24 >= 12;
                var hour12 = parts.hour24 % 12;
                if (hour12 === 0) hour12 = 12;
                hourSelect.value = pad2(hour12);
                ampmSelect.value = isPM ? 'PM' : 'AM';
            } else {
                hourSelect.value = pad2(parts.hour24);
            }
            minuteSelect.value = parts.minute;
            [hourSelect, minuteSelect, ampmSelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
            if (timePanel.open) renderTimePopover();
        }

        function commit() {
            var minute = minuteSelect.value;
            var hour24;
            if (is12h) {
                var hour12 = parseInt(hourSelect.value, 10);
                var isPM = ampmSelect.value === 'PM';
                hour24 = isPM ? (hour12 === 12 ? 12 : hour12 + 12) : (hour12 === 12 ? 0 : hour12);
            } else {
                hour24 = parseInt(hourSelect.value, 10);
            }
            inputEl.value = pad2(hour24) + ':' + minute;
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        [hourSelect, minuteSelect, ampmSelect].forEach(function (select) {
            select.addEventListener('change', commit);
            window.enhanceSelect(select);
            select.parentNode.classList.add('ui-select--sm');
        });
        // AM/PM alone (without a 12h/24h toggle) changes which 24h hour each
        // option represents, so re-resolve muting and refresh the hour
        // dropdown's rendered rows whenever it changes.
        ampmSelect.addEventListener('change', function () {
            applyHourMuting();
            if (hourSelect._uiSelect) hourSelect._uiSelect.refresh();
        });
        ampmSelect.parentNode.classList.toggle('ui-hidden', !is12h);

        // Writes a 24h hour back onto hourSelect/ampmSelect (wrapping
        // 0-23) — the one place that translates a raw hour24 into the
        // 12h-vs-24h split those two selects actually store, so the spinner
        // arrows/typed input and the Now button all funnel through it
        // instead of re-deriving the split themselves.
        function applyHour24(hour24) {
            hour24 = ((hour24 % 24) + 24) % 24;
            if (is12h) {
                var isPM = hour24 >= 12;
                var hour12 = hour24 % 12; if (hour12 === 0) hour12 = 12;
                hourSelect.value = pad2(hour12);
                ampmSelect.value = isPM ? 'PM' : 'AM';
            } else {
                hourSelect.value = pad2(hour24);
            }
            applyHourMuting();
            if (hourSelect._uiSelect) hourSelect._uiSelect.refresh();
        }

        function applyMinute(minute) {
            minuteSelect.value = pad2(((minute % 60) + 60) % 60);
        }

        // Attached spinner picker ("Enter time"): big Hour:Minute digit
        // boxes stepped by up/down arrows (or typed directly), an AM/PM
        // toggle beside them in 12h mode, and Now/Clear footer actions —
        // mirrors common OS/Material time pickers. Deliberately a different
        // shape from .ui-popover's option-list style (Panel Group/Chair
        // selects, the calendar grid): there's no discrete list of times to
        // browse, so a spinner reads more honestly than a scrollable column
        // of every minute (DES-L1: layout follows what the content forces).
        function renderTimePopover() {
            var parts = currentParts();
            var isPM = parts.hour24 >= 12;
            var hour12 = parts.hour24 % 12; if (hour12 === 0) hour12 = 12;
            timePanel.innerHTML = '';

            var header = document.createElement('div');
            header.className = 'ui-time-spinner-header';
            var headerLabel = document.createElement('span');
            headerLabel.textContent = 'Enter time';
            header.appendChild(headerLabel);
            var closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'ui-time-spinner-close';
            closeBtn.setAttribute('aria-label', 'Close time picker');
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', function (e) { e.stopPropagation(); timePanel.close(); });
            header.appendChild(closeBtn);
            timePanel.appendChild(header);

            var body = document.createElement('div');
            body.className = 'ui-time-spinner-body';

            function buildUnit(label, value, muted, onStep, onType) {
                var unit = document.createElement('div');
                unit.className = 'ui-time-spinner-unit';
                var up = document.createElement('button');
                up.type = 'button';
                up.className = 'ui-time-spinner-arrow ui-time-spinner-arrow--up';
                up.setAttribute('aria-label', 'Increase ' + label);
                up.innerHTML = '&#9650;';
                up.addEventListener('click', function (e) { e.stopPropagation(); onStep(1); });
                var input = document.createElement('input');
                input.type = 'text';
                input.inputMode = 'numeric';
                input.maxLength = 2;
                input.className = 'ui-time-spinner-value' + (muted ? ' muted' : '');
                input.value = value;
                input.addEventListener('click', function (e) { e.stopPropagation(); input.select(); });
                input.addEventListener('change', function () {
                    var n = parseInt(input.value, 10);
                    onType(isNaN(n) ? 0 : n);
                });
                var down = document.createElement('button');
                down.type = 'button';
                down.className = 'ui-time-spinner-arrow ui-time-spinner-arrow--down';
                down.setAttribute('aria-label', 'Decrease ' + label);
                down.innerHTML = '&#9660;';
                down.addEventListener('click', function (e) { e.stopPropagation(); onStep(-1); });
                unit.appendChild(up);
                unit.appendChild(input);
                unit.appendChild(down);
                return unit;
            }

            body.appendChild(buildUnit('hour', pad2(is12h ? hour12 : parts.hour24), isHourMuted(parts.hour24),
                function (delta) {
                    applyHour24(parts.hour24 + delta);
                    commit();
                    renderTimePopover();
                },
                function (n) {
                    var hour24 = is12h ? (n % 12) + (isPM ? 12 : 0) : n;
                    applyHour24(hour24);
                    commit();
                    renderTimePopover();
                }));

            var sep = document.createElement('div');
            sep.className = 'ui-time-spinner-sep';
            sep.textContent = ':';
            body.appendChild(sep);

            body.appendChild(buildUnit('minute', parts.minute, false,
                function (delta) {
                    applyMinute(parseInt(parts.minute, 10) + delta);
                    commit();
                    renderTimePopover();
                },
                function (n) {
                    applyMinute(n);
                    commit();
                    renderTimePopover();
                }));

            if (is12h) {
                var ampmWrap = document.createElement('div');
                ampmWrap.className = 'ui-time-spinner-ampm';
                ['AM', 'PM'].forEach(function (label) {
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'ui-time-spinner-ampm-btn' + ((label === 'PM') === isPM ? ' selected' : '');
                    btn.textContent = label;
                    btn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        ampmSelect.value = label;
                        applyHourMuting();
                        if (hourSelect._uiSelect) hourSelect._uiSelect.refresh();
                        commit();
                        renderTimePopover();
                    });
                    ampmWrap.appendChild(btn);
                });
                body.appendChild(ampmWrap);
            }
            timePanel.appendChild(body);

            var footer = document.createElement('div');
            footer.className = 'ui-popover-footer';
            var nowBtn = document.createElement('button');
            nowBtn.type = 'button';
            nowBtn.className = 'ui-popover-footer-link';
            nowBtn.textContent = 'Now';
            nowBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                var now = new Date();
                inputEl.value = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                syncFromValue();
                renderTimePopover();
            });
            var clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'ui-popover-footer-link';
            clearBtn.textContent = 'Clear';
            clearBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                // "Clear" resets to midnight rather than emptying the native
                // input outright — hourSelect/minuteSelect are plain
                // <select>s with no real "no value" option of their own, so
                // an empty inputEl.value just meant the next syncFromValue()
                // fell back to '00:00' anyway (see currentParts()) while the
                // visible spinner still showed whatever it last rendered,
                // reading as "Clear did nothing."
                inputEl.value = '00:00';
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                syncFromValue();
                renderTimePopover();
            });
            footer.appendChild(nowBtn);
            footer.appendChild(clearBtn);
            timePanel.appendChild(footer);
        }

        function toggleTimePopover() {
            var isOpen = timePanel.open;
            closeAllUiPopovers(timePanel);
            if (isOpen) {
                timePanel.close();
            } else {
                renderTimePopover();
                timePanel.showModal();
                positionPopover(timePanel, timeBtn, { alignRight: true });
            }
        }
        timeBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleTimePopover(); });

        inputEl._uiTime = { refresh: syncFromValue };
        syncFromValue();
        if (!inputEl.value) commit();
    };

    // .ui-fused-field-group aligns its fused fields' labels to one shared,
    // auto-computed column (CSS subgrid — see components/forms.css) when
    // there's room. A single CSS breakpoint can't decide this per-field
    // though (querying an element's own size to decide the very grid span
    // that determines that size is circular, and a shared container query
    // can't let e.g. a long Panel Group value stack while a short Chair
    // value stays aligned in the same narrow column) — so each row's actual
    // available width is measured here instead, and only the rows that don't
    // fit fall back to label-above-field layout independently of their
    // siblings.
    var FUSED_FIELD_HYSTERESIS = 10;

    function evaluateFusedFieldGroup(groupEl) {
        // Some groups (e.g. Panel Setup's Panel Settings card) want every row
        // stacked label-above unconditionally, for visual consistency across
        // the group, rather than each row independently deciding based on its
        // own measured overflow - skip the measurement entirely for those.
        if (groupEl.classList.contains('ui-fused-field-group--force-stacked')) {
            groupEl.querySelectorAll('.ui-fused-field').forEach(function (row) {
                row.classList.add('ui-fused-field--stacked');
            });
            return;
        }
        // Stacking a row taller changes this group's own height, which would
        // otherwise re-fire the ResizeObserver below on itself even though
        // nothing about its *width* (the only dimension that matters here)
        // changed — without this guard that becomes a self-triggering loop,
        // visibly flickering as rows keep re-toggling.
        var width = groupEl.getBoundingClientRect().width;
        if (groupEl._labeledSelectWidth !== undefined && Math.abs(groupEl._labeledSelectWidth - width) < 1) return;
        groupEl._labeledSelectWidth = width;

        groupEl.querySelectorAll('.ui-fused-field').forEach(function (row) {
            var wasStacked = row.classList.contains('ui-fused-field--stacked');
            // Measure real overflow rather than approximating with a fixed
            // width guess — a row's actual required width varies (a single
            // select's own widest-option floor, vs. Date/Time's several
            // mini-dropdowns plus a calendar button), and only true overflow
            // (content wider than the row's own box) is what would actually
            // clip the chevron or squeeze the label. Un-stack first so the
            // measurement reflects the row's natural beside-label content
            // width, not whatever it measured last time.
            if (wasStacked) row.classList.remove('ui-fused-field--stacked');
            var overflow = row.scrollWidth - row.clientWidth;
            // A select's trigger (or the label) truncates its own text with
            // an ellipsis rather than growing past its grid cell, so the row
            // itself never registers scrollWidth > clientWidth even once the
            // selected option's been squeezed down to unreadable — check
            // those truncatable pieces directly too. Excludes Date/Time's
            // mini Day/Month/Year-style dropdowns (.ui-select--sm), which
            // fall back to a compact display of their own instead.
            row.querySelectorAll('.ui-fused-field-label, .ui-select:not(.ui-select--sm) > .ui-select-trigger').forEach(function (el) {
                overflow = Math.max(overflow, el.scrollWidth - el.clientWidth);
            });
            // Once stacked, require a bit of comfortable slack before
            // switching back, so a row doesn't flip-flop right at the
            // boundary while a container is being resized.
            var needsStacking = wasStacked ? overflow > -FUSED_FIELD_HYSTERESIS : overflow > 0;
            if (needsStacking) row.classList.add('ui-fused-field--stacked');
        });
    }

    window.initFusedFieldStacking = function (root) {
        (root || document).querySelectorAll('.ui-fused-field-group').forEach(function (groupEl) {
            evaluateFusedFieldGroup(groupEl);
            if (typeof ResizeObserver === 'undefined' || groupEl._labeledSelectObserved) return;
            groupEl._labeledSelectObserved = true;
            new ResizeObserver(function () { evaluateFusedFieldGroup(groupEl); }).observe(groupEl);
        });
    };

    // Single entry point for enhancing every select/date/time field under a
    // given root — called for the whole document on page load, and again by
    // AJAX-loaded modals (e.g. panel.js) on the subtree they just injected, so
    // every dropdown in the app gets the same custom-styled treatment without
    // each call site needing to know which fields exist. A date field opts
    // into "no past dates" via `data-no-past` on the <input> rather than a JS
    // option, since this helper has no per-field config of its own.
    window.enhanceFormControls = function (root) {
        (root || document).querySelectorAll('select').forEach(window.enhanceSelect);
        (root || document).querySelectorAll('input[type="date"]').forEach(function (el) {
            window.enhanceDateInput(el, { noPast: el.hasAttribute('data-no-past') });
        });
        (root || document).querySelectorAll('input[type="time"]').forEach(window.enhanceTimeInput);
        window.initFusedFieldStacking(root);
    };
})();

// Generic "select + add button" containers (`.ui-select-row` for a
// side-by-side pair, `.ui-fused-field` for a label+select+button fused
// into one control — both styled in components/forms.css). Any page can
// register a handler here, keyed by the button's `data-add-trigger` value,
// instead of writing its own dialog- or page-scoped click listener — this
// single delegated listener covers every such container on the page,
// including ones injected later into modals.
(function () {
    var CONTAINER_SELECTOR = '.ui-select-row, .ui-fused-field';
    window.uiSelectRowAdders = window.uiSelectRowAdders || {};
    document.addEventListener('click', function (e) {
        var trigger = e.target.closest(CONTAINER_SELECTOR + ' [data-add-trigger]');
        if (!trigger) return;
        var handler = window.uiSelectRowAdders[trigger.dataset.addTrigger];
        if (!handler) return;
        var row = trigger.closest(CONTAINER_SELECTOR);
        handler(row ? row.querySelector('select') : null, trigger);
    });
})();
