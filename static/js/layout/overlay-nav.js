/* Overlay navs: "Switch Hub", "Select School", "Select User", "Settings".

   Layout tier - these are layers of layout.html's own chrome, one set per page.

   They are absolutely-positioned layers stacked inside one shared
   `.overlay-slot`, the flex column that slides out beside the primary
   sidebar/rail (CSS `order` places it after the rail, before <main>). Opening
   one shows that layer and widens the slot from 0, pushing <main> over, and
   dims <main> behind a backdrop scoped to it. */

import { closest } from '../components/dom.js';
import { addBackdrop, removeBackdrop } from '../components/backdrop.js';
import { positionHubRailSeam } from './hub-rail.js';

// Generic overlay nav handling: "Switch Hub", "Select School", "Select User" and
// "Settings" are absolutely-positioned layers stacked inside one shared
// `.overlay-slot`, which is the actual flex column that slides out beside the
// primary sidebar/rail (CSS `order` places it after the rail, before <main>) —
// opening a panel shows that layer and widens the slot from 0, pushing <main>
// over, and dims <main> behind a backdrop scoped to it.
// Settings/Search are ordinary .hub-rail-items (#131) sharing its .active
// styling (icon colour + positionHubRailSeam's fused seam bar) - while
// their overlay is open they should read as the current tab instead of
// whatever hub page's icon is still marked active underneath. Tracks the
// one suppressed item (not a class toggle on it) so positionHubRailSeam's
// single `.hub-rail-item.active` query stays unambiguous, and only
// restores once every overlay has closed (switching Settings -> School
// shouldn't flash the original hub active in between).
var suppressedRailActive = null;
function setOverlayTriggerActive(navEl, isOpen) {
    var triggers = document.querySelectorAll('[data-overlay-target="#' + navEl.id + '"]');
    if (!triggers.length) return;
    triggers.forEach(function (btn) { btn.classList.toggle('active', isOpen); });
    if (isOpen) {
        if (!suppressedRailActive) {
            suppressedRailActive = document.querySelector('.hub-rail-item.active:not([data-overlay-target])');
            if (suppressedRailActive) suppressedRailActive.classList.remove('active');
        }
    } else if (!document.querySelector('.overlay-nav.open')) {
        if (suppressedRailActive) {
            suppressedRailActive.classList.add('active');
            suppressedRailActive = null;
        }
    }
    positionHubRailSeam();
}

export function openOverlay(navEl) {
    if (!navEl) return;
    document.querySelectorAll('.overlay-nav.open').forEach(function (other) {
        if (other !== navEl) closeOverlay(other);
    });
    navEl.classList.add('open');
    var slot = closest(navEl, '.overlay-slot');
    if (slot) slot.classList.add('open');
    addBackdrop(function () { closeOverlay(navEl); });
    var input = navEl.querySelector('.nav-header input, .nav-scroll input');
    if (input) input.focus();
    setOverlayTriggerActive(navEl, true);
}
export function closeOverlay(navEl) {
    if (!navEl) return;
    navEl.classList.remove('open');
    var slot = closest(navEl, '.overlay-slot');
    if (slot && !slot.querySelector('.overlay-nav.open')) slot.classList.remove('open');
    removeBackdrop();
    setOverlayTriggerActive(navEl, false);
}

export function initOverlayNav() {
    document.querySelectorAll('[data-overlay-target]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            var navEl = document.querySelector(btn.dataset.overlayTarget);
            if (!navEl) return;
            if (navEl.classList.contains('open')) {
                closeOverlay(navEl);
            } else {
                openOverlay(navEl);
            }
            // A hub-rail link's :hover/:focus-visible tooltip (icon-tooltip-
            // host::after) never lingers because clicking it navigates away,
            // tearing down the whole DOM with it. Settings/Search don't
            // navigate - they open an overlay in place - so without this the
            // button keeps browser focus (mouse clicks still count for
            // :focus-visible in some browsers) and its tooltip card stays
            // stuck open, shadow and all, the entire time the shelf is open.
            btn.blur();
        });
    });

    // Close button inside any overlay
    document.querySelectorAll('.overlay-nav .nav-close-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            closeOverlay(closest(e.target, '.overlay-nav'));
        });
    });

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var openNav = document.querySelector('.overlay-nav.open');
        if (openNav) closeOverlay(openNav);
    });
}
