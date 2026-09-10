/* The hub sidebar's icon-rail behaviour: collapse, lock, and the touch
   expand-in-place overlay.

   Layout tier - one sidebar, part of layout.html's frame, and it writes state
   on <html> and on .side-nav rather than on any element a caller passes in.

   The three media queries it reads are imported rather than declared: the
   1200px one used to be called narrowMql here, which is the name the 900px
   narrow tier now carries. See layout/breakpoints.js for why both moved. */

import { closest } from '../components/dom.js';
import { addBackdrop, removeBackdrop } from '../components/backdrop.js';
import { touchMql, railMql, hoverCapableMql, isTouchNav, onTouchNavChange } from './breakpoints.js';

// Icon-only rail behaviour for the hub sidebar. Desktop has no manual
// control here at all - below the narrow-window breakpoint a
// hover-capable pointer (a narrowed desktop browser window, not a touch
// tablet) just gets the rail forced and locked, no toggle to reach it
// with (hidden entirely at this width+pointer combo, see
// responsive.css). Forcing the .collapsed class rather than just
// leaving the width override to carry it visually also gets the forced
// rail every other .side-nav.collapsed behavior for free -
// tooltips-on-hover included, same as the always-icon-only .hub-rail.
//
// Touch/tablet (480-1180px, real hover:none or the dev breakpoint
// preview's forced override - see isTouchNav() above) sits icon-only at
// rest same as the locked desktop rail, but isn't locked: the corner
// toggle temporarily widens the rail in place instead (adds
// .touch-expanded, drops .collapsed - responsive.css positions it as an
// absolute overlay so it doesn't reflow <main>), closing back down on a
// second tap or a tap on the backdrop (#114/#129 follow-up - replaces
// the original off-canvas drawer, which needed a second always-visible
// burger button instead of reusing this one).
export function initSidebarCollapse() {
    var toggle = document.getElementById('sidebar-collapse-toggle');
    var nav = toggle && closest(toggle, '.side-nav');
    if (!toggle || !nav) return;
    // Two icon spans share this button (desktop chevron + touch burger,
    // CSS-swapped on .nav-touch-mode) - both get the tooltip kept in
    // sync since only one is ever visible at a time.
    var toggleIconEls = toggle.querySelectorAll('.icon-tooltip-host');
    var toggleLabelEl = document.getElementById('sidebar-collapse-toggle-label');
    // 1200px (railMql), not the shared 900px narrow tier other things in
    // this file use - live feedback: "can the desktop
    // compact side menu happen as a wider breakpoint", then "the
    // change to an arrow needs to be at that breakpoint aswell... as
    // does the extra icons being added" - this mql (via locked(),
    // below) is what actually adds/removes .side-nav.collapsed, which
    // drives the exit-hub label hiding to an arrow-only icon, the
    // .hub-rail visibility, and everything else CSS keys off
    // .collapsed - moving responsive.css's own @media(max-width:1200px)
    // rail-width rule alone left this JS mql still flipping at 900px,
    // so between 900-1200px the rail was visually narrow (CSS) but
    // .collapsed hadn't actually been added yet (JS), leaving the
    // label/hub-rail in their expanded state crammed into the now-
    // narrow rail. Must match responsive.css's own threshold exactly -
    // the two aren't otherwise linked to each other in any way that
    // would catch a mismatch automatically. (Live feedback tried
    // unifying this back to 900px for consistency with the other
    // narrow-desktop systems, then reversed that: "I think the side
    // nav should go back to 1200" - kept deliberately wider than those
    // again, same original reasoning.)
    /* railMql/hoverCapableMql/touchMql are imports (layout/breakpoints.js).
       They were declared here, and the 1200px one was called narrowMql -
       the name the 900px narrow tier now has. Two declaration sites for one
       tier list is how that collision arose; there is one site now. */

    // #142: desktop's own manual collapse/expand, persisted per-viewer -
    // only meaningful above 1200px (below that the rail is already
    // force-collapsed regardless, see locked() below and responsive.css's
    // matching @media block). Storage read/write wrapped - some browser
    // contexts (private windows, blocked site data) throw on access.
    var MANUAL_COLLAPSE_KEY = 'pref-sidebar-collapsed';
    function manualCollapsePreferred() {
        try { return localStorage.getItem(MANUAL_COLLAPSE_KEY) === '1'; } catch (e) { return false; }
    }
    function setManualCollapsePreferred(value) {
        try { localStorage.setItem(MANUAL_COLLAPSE_KEY, value ? '1' : '0'); } catch (e) { /* ignore */ }
    }
    function wideDesktop() {
        return hoverCapableMql.matches && !railMql.matches && !isTouchNav();
    }

    function locked() {
        // The dev breakpoint preview iframe (layout.html) can't make a
        // real mouse report hover:none/pointer:coarse, so it forces
        // isTouchNav() true via a class instead when previewing a touch
        // breakpoint - see isTouchNav() below.
        return railMql.matches && hoverCapableMql.matches && !isTouchNav();
    }
    function touchRailActive() {
        return touchMql.matches && isTouchNav();
    }

    function updateToggleLabel() {
        // wideDesktop() gets its own collapse/expand wording - "Open/
        // Close menu" (below) describes touch's temporary widen-in-place
        // overlay, which isn't what this button does above 1200px.
        // hubTitlePrefix still keys off plain `collapsed` either way.
        var collapsed = nav.classList.contains('collapsed');
        if (wideDesktop()) {
            var desktopLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
            toggle.setAttribute('aria-label', desktopLabel);
            toggle.setAttribute('aria-expanded', String(!collapsed));
            toggleIconEls.forEach(function (el) { el.setAttribute('data-tooltip', desktopLabel); });
            if (toggleLabelEl) toggleLabelEl.textContent = collapsed ? 'Expand' : 'Collapse';
        } else {
            var expanded = nav.classList.contains('touch-expanded');
            var label = expanded ? 'Close menu' : 'Open menu';
            toggle.setAttribute('aria-label', label);
            toggle.setAttribute('aria-expanded', String(expanded));
            toggleIconEls.forEach(function (el) { el.setAttribute('data-tooltip', label); });
            if (toggleLabelEl) toggleLabelEl.textContent = expanded ? 'Close' : 'Menu';
        }
        // Hub landing pages render their H1 as "Dashboard" with a hidden
        // "<Hub Name> " prefix (see e.g. hubs/inclusion/templates/hubs/inclusion/hub.html)
        // — once the sidebar collapses to an icon-only rail, the hub name
        // disappears from the nav-title there too, so the H1 is the only
        // place left to show it.
        var hubTitlePrefix = document.getElementById('hub-title-prefix');
        if (hubTitlePrefix) hubTitlePrefix.hidden = !collapsed;
    }

    function closeTouchExpand() {
        nav.classList.remove('touch-expanded');
        nav.classList.add('collapsed');
        updateToggleLabel();
        removeBackdrop();
    }
    function openTouchExpand() {
        nav.classList.remove('collapsed');
        nav.classList.add('touch-expanded');
        updateToggleLabel();
        addBackdrop(closeTouchExpand);
    }

    function syncCollapsed() {
        if (touchRailActive()) {
            // Rest state only - an already-open touch-expand shouldn't
            // snap shut just because some other matchMedia fired (e.g.
            // hoverCapableMql), only on an actual resize out of range
            // (handled separately below).
            if (!nav.classList.contains('touch-expanded')) {
                nav.classList.add('collapsed');
            }
            updateToggleLabel();
            return;
        }
        // Leaving touch range (resize, dev breakpoint preview switch)
        // shouldn't leave a stray .touch-expanded/backdrop behind.
        if (nav.classList.contains('touch-expanded')) closeTouchExpand();
        // Below 1200px this is always locked() (forced icon-only,
        // nothing to remember); at/above it, follow whatever the viewer
        // last manually chose (#142) - defaults to expanded (today's
        // only behaviour) until they ever toggle it themselves.
        nav.classList.toggle('collapsed', locked() || (wideDesktop() && manualCollapsePreferred()));
        updateToggleLabel();
    }

    syncCollapsed();
    // Live-updates across an actual resize (not just page load) -
    // matters for the dev breakpoint preview iframe, which loads once
    // at a fixed size, but also for a real browser window being
    // resized/dev-tools-docked mid-session.
    railMql.addEventListener('change', syncCollapsed);
    hoverCapableMql.addEventListener('change', syncCollapsed);
    touchMql.addEventListener('change', syncCollapsed);
    onTouchNavChange(syncCollapsed);

    // Expanded-mode tooltip for this button (collapsed mode already has
    // its own working ::after tooltip - see layout.css). A plain ::after
    // here would be clipped by .side-nav's own overflow:hidden, which
    // the width-transition genuinely needs kept hidden (removing it
    // caused a worse bug - see .rail-tooltip-fixed's own comment in
    // layout.css). position:fixed + real coordinates from
    // getBoundingClientRect() escapes that clipping instead of fighting
    // it - appended once to <body>, well outside the sidebar's own
    // overflow-clipped subtree.
    var railTooltip = document.createElement('div');
    railTooltip.className = 'rail-tooltip-fixed';
    railTooltip.hidden = true;
    document.body.appendChild(railTooltip);
    function showRailTooltip() {
        if (touchRailActive() || nav.classList.contains('collapsed')) return;
        var rect = toggle.getBoundingClientRect();
        railTooltip.textContent = toggle.getAttribute('aria-label') || '';
        railTooltip.style.left = (rect.right + 8) + 'px';
        railTooltip.style.top = (rect.top + rect.height / 2) + 'px';
        railTooltip.style.transform = 'translateY(-50%)';
        railTooltip.hidden = false;
    }
    function hideRailTooltip() {
        railTooltip.hidden = true;
    }
    toggle.addEventListener('mouseenter', showRailTooltip);
    toggle.addEventListener('mouseleave', hideRailTooltip);
    toggle.addEventListener('focus', showRailTooltip);
    toggle.addEventListener('blur', hideRailTooltip);

    toggle.addEventListener('click', function (e) {
        e.preventDefault();
        hideRailTooltip();
        if (touchRailActive()) {
            if (nav.classList.contains('touch-expanded')) closeTouchExpand(); else openTouchExpand();
            return;
        }
        // Below 1200px the button is CSS-hidden (responsive.css) - guard
        // anyway in case it's reached some other way (keyboard focus
        // retained from a wider layout, a pointer type change mid-tab).
        if (!wideDesktop()) return;
        var collapsedNow = !nav.classList.contains('collapsed');
        nav.classList.toggle('collapsed', collapsedNow);
        setManualCollapsePreferred(collapsedNow);
        updateToggleLabel();
    });
    // A link inside the temporarily-widened rail navigating to a new
    // page doesn't need an explicit close - the page reload takes care
    // of it - but clicking a trigger that opens another overlay from
    // inside (Hub Menu/Settings/School/Staff) still closes this rail,
    // same as before. What changed is *when* it visibly happens: the
    // overlay panel now slides fully over the rail first (opaque
    // background, matching width, higher z-index - see responsive.css),
    // so the rail's own collapse happens hidden behind it instead of
    // racing it in view - closing this rail immediately, in step with
    // the overlay opening, no longer reads as two competing animations.
    // It also means there's nothing left open underneath once the
    // overlay is later closed.
    nav.querySelectorAll('[data-overlay-target]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            if (nav.classList.contains('touch-expanded')) closeTouchExpand();
        });
    });
}
