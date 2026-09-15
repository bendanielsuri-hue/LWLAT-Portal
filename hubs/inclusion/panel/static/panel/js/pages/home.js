/* Moved out of home.html's inline <script> as-is (#211, #203's inline-
   template-script rule - this file had zero {{ }}/{% %} template refs to
   begin with, so the move is mechanical). Panel Home's own carousel/tab/
   AJAX-refresh wiring for My Referrals and My Actions - no other page
   uses any of it.

   Over the 600-line review trigger and stays one file: the My Referrals
   and My Actions carousels are Panel Home's own layout, used nowhere
   else, so splitting by card would draw a file boundary through the
   middle of one mechanism (the two card-stack carousels, below - #214
   folded what used to be two near-1:1 copies, and then the portal's three
   separate carousel implementations, into one shared component this file
   now merely configures) rather than separating two different things. */

import { initSelectable } from '../../../js/components/selectable.js';
import { setupOverflowTabs } from '../../../js/components/overflow-tabs.js';
import { initCarousel } from '../../../js/components/carousel.js';
import { touchMql, phoneMql } from '../../../js/layout/breakpoints.js';

// Shared by both tab rows (My Referrals' setupTabs below, My Actions'
// initActionTabs) - "All" is always first and never collapses on its own
// (zero-count tabs stay in the DOM collapsed rather than omitted), so it's
// normally a safe default. Carousel mode (panel.css, both cards' own
// breakpoint) hides "All" outright instead (one long combined carousel is a
// worse default there, and one less tab to fit on an already-narrow tab
// row) - skip past any hidden/collapsed button so the first genuinely
// visible one becomes active instead.
function firstUsableTabButton(buttons) {
    return Array.prototype.filter.call(buttons, function (b) {
        return !b.classList.contains('tab-collapsed') && getComputedStyle(b).display !== 'none';
    })[0] || buttons[0];
}

// Carousel-mode replacement for the tab row (still present in the DOM, just
// hidden at this width, panel.css) - a single compact trigger + popover list
// reads far more cheaply than a full row of buttons once the card itself is
// only carousel-width. Deliberately does not reimplement any filtering,
// carousel-reset, count-recompute or pulse-animation logic of its own -
// every option click just delegates to the real (hidden) tab button's own
// click handler, so setupTabs/recountTabsFromRows/refreshMyActionsCard stay
// the single source of truth for all of that; this only ever mirrors it.
// A MutationObserver on the tab row (rather than scattering manual resync
// calls across every place that can change it - a tab click, a delete-
// driven recount, an AJAX refresh) keeps the trigger's own label in sync
// with whichever button is .active, including its live count.
function wireCarouselFilterDropdown(rootSelector, tabRowSelector) {
    var root = document.querySelector(rootSelector);
    var tabRow = document.querySelector(tabRowSelector);
    var trigger = root && root.querySelector('[data-filter-trigger]');
    var label = root && root.querySelector('[data-filter-label]');
    var menu = root && root.querySelector('[data-filter-menu]');
    if (!root || !tabRow || !trigger || !label || !menu) return;

    function usableButtons() {
        return Array.prototype.filter.call(tabRow.querySelectorAll('button'), function (b) {
            return !b.classList.contains('tab-collapsed') && getComputedStyle(b).display !== 'none';
        });
    }

    // Tab button text is "Awaiting Discussion (4)" (its own .count span,
    // panel.css) - split the trailing "(N)" off into a small rounded badge
    // instead of carrying the literal parentheses into the dropdown, here
    // and in each menu option below.
    function renderWithBadge(el, text) {
        var match = /^(.*)\s\((\d+)\)$/.exec(text);
        el.textContent = '';
        if (!match) { el.textContent = text; return; }
        el.appendChild(document.createTextNode(match[1]));
        var badge = document.createElement('span');
        badge.className = 'carousel-filter-badge';
        badge.textContent = match[2];
        el.appendChild(badge);
    }

    function syncLabel() {
        var active = tabRow.querySelector('button.active') || usableButtons()[0];
        if (!active) return;
        // The previous call's badge (if any) already lives on the trigger
        // itself, not the label (moved out below) - renderWithBadge's own
        // `label.textContent = ''` never touches it, so without this it
        // just piled up a fresh one on every sync instead of replacing it
        // (confirmed empirically: the trigger showed two badges).
        var oldBadge = trigger.querySelector('.carousel-filter-badge');
        if (oldBadge) oldBadge.remove();
        renderWithBadge(label, active.textContent.trim());
        // Moves the badge renderWithBadge just appended into the label out
        // to the trigger itself, after the chevron span (panel.css) - a
        // real element, appendChild always places it last regardless of
        // where it started, landing it after the chevron rather than
        // before (live feedback: "the badge count... after the dropdown
        // arrow"). No-op (returns null) on a plain label with no count.
        var badge = label.querySelector('.carousel-filter-badge');
        if (badge) trigger.appendChild(badge);
    }

    function onOutsideClick(e) {
        if (!root.contains(e.target)) closeMenu();
    }

    function closeMenu() {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        trigger.classList.remove('open');
        document.removeEventListener('click', onOutsideClick, true);
    }

    function openMenu() {
        menu.innerHTML = '';
        usableButtons().forEach(function (btn) {
            var li = document.createElement('li');
            li.setAttribute('role', 'option');
            renderWithBadge(li, btn.textContent.trim());
            var isActive = btn.classList.contains('active');
            li.setAttribute('aria-selected', isActive ? 'true' : 'false');
            if (isActive) li.classList.add('active');
            li.addEventListener('click', function (e) {
                e.stopPropagation();
                btn.click();
                closeMenu();
            });
            menu.appendChild(li);
        });
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        trigger.classList.add('open');
        document.addEventListener('click', onOutsideClick, true);
    }

    trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        if (menu.hidden) openMenu(); else closeMenu();
    });
    trigger.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMenu();
    });

    // subtree+childList+characterData, not just the class attribute filter -
    // a live count changing (recountTabsFromRows' pulseCount targets a
    // button's own .count span text) needs to reach the trigger label too,
    // not just an active/collapsed class toggling.
    new MutationObserver(syncLabel).observe(tabRow, {
        subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'],
    });
    syncLabel();
}

// Per-row carousel-mode dropdown for My Actions' own status changer
// (.ui-segmented--action-status) - same trigger+popover-delegates-to-the-
// real-hidden-control idea as wireCarouselFilterDropdown above, but wired
// once per row (one call per [data-action-status-filter], not a single
// page-wide call) since every action card has its own independent status
// rather than one shared tab row. Re-run after every AJAX refresh of the
// My Actions card (refreshMyActionsCard, below) - the buttons are fresh DOM
// nodes each time, same reasoning as initActionTabs/wireActionForms there.
function wireActionStatusFilters() {
    document.querySelectorAll('[data-action-status-filter]').forEach(function (root) {
        var segmented = root.querySelector('.ui-segmented--action-status');
        var trigger = root.querySelector('[data-filter-trigger]');
        var label = root.querySelector('[data-filter-label]');
        var menu = root.querySelector('[data-filter-menu]');
        if (!segmented || !trigger || !label || !menu) return;

        function options() {
            return Array.prototype.slice.call(segmented.querySelectorAll('.ui-segmented-option'));
        }

        // Just the value - the "Status" title is now a static fused segment
        // in the trigger markup itself (_my_actions_card.html), not built
        // here. data-status mirrors the active option's own value attribute
        // (incomplete/complete/not_needed) so the trigger's value segment
        // can pick up the same per-status colour the real segmented control
        // uses (.ui-segmented--action-status .ui-segmented-option[value=...]
        // .active, panel.css) instead of reading as a plain neutral pill.
        function syncLabel() {
            var active = segmented.querySelector('.ui-segmented-option.active') || options()[0];
            if (!active) return;
            label.textContent = active.textContent.trim();
            trigger.dataset.status = active.value;
        }

        function onOutsideClick(e) {
            if (!root.contains(e.target)) closeMenu();
        }

        function closeMenu() {
            menu.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
            trigger.classList.remove('open');
            document.removeEventListener('click', onOutsideClick, true);
        }

        function openMenu() {
            menu.innerHTML = '';
            options().forEach(function (btn) {
                var li = document.createElement('li');
                li.setAttribute('role', 'option');
                li.textContent = btn.textContent.trim();
                var isActive = btn.classList.contains('active');
                li.setAttribute('aria-selected', isActive ? 'true' : 'false');
                if (isActive) li.classList.add('active');
                li.addEventListener('click', function (e) {
                    e.stopPropagation();
                    // Real submit button, still in the DOM just hidden
                    // (panel.css) - .click() fires its form's own submit
                    // (wireActionForms, below) exactly as a direct tap on
                    // the segmented control itself would.
                    btn.click();
                    closeMenu();
                });
                menu.appendChild(li);
            });
            menu.hidden = false;
            trigger.setAttribute('aria-expanded', 'true');
            trigger.classList.add('open');
            document.addEventListener('click', onOutsideClick, true);
        }

        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            if (menu.hidden) openMenu(); else closeMenu();
        });
        trigger.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeMenu();
        });
        syncLabel();
    });
}

// Dynamic fallback for the segmented status control's own overflow, above
// 1180px (carousel mode already handles its own dropdown swap via CSS
// alone - see the ≤1180px block, panel.css). A plain viewport breakpoint
// can't drive this: .stack-item-col--student's available width doesn't
// track viewport width alone (live feedback: a fixed 1181-1400px band
// "does not work for all widths" - missed narrower cases the band didn't
// cover). Measures each row's real fit instead and toggles
// .action-status-narrow (panel.css) - same "ResizeObserver + compare
// natural content size against the actual container" idea as
// setupOverflowTabs' own measure() (main.js), just per-row rather than
// page-wide since every action row's status control is independent.
function wireActionStatusOverflow() {
    document.querySelectorAll('[data-action-status-filter]').forEach(function (wrap) {
        var form = wrap.querySelector('form');
        // .stack-item-body--two-col, not .stack-item-col--student - the
        // student column is display: contents in the 1181-1400px stacked
        // band (panel.css), so it generates no box of its own there and
        // .clientWidth would always read 0, permanently forcing the
        // dropdown regardless of real available space (live feedback:
        // "status change... at bottom of card" landed on the dropdown
        // instead of the real control at that width - this was why). The
        // row container stays a real box in both layouts, and represents
        // the actual available width either way: above 1400px the student
        // column is shrink-to-fit (flex: 0 0 auto, panel.css) so it always
        // fits by definition regardless of exactly what's measured against;
        // in the stacked band the student column no longer constrains
        // width at all, so the row's own width is the real number.
        var column = wrap.closest('.stack-item-body--two-col');
        if (!form || !column) return;
        function check() {
            // Carousel mode drives its own dropdown swap entirely via CSS
            // (≤1180px block, panel.css) - leave its class state alone
            // rather than fight it from here.
            if (window.matchMedia('(max-width: 1180px)').matches) return;
            // Always re-measured fresh, never cached - a one-time
            // measurement can go stale (e.g. a web font swap landing after
            // the very first check) and there's no way back from it once
            // display: none has collapsed scrollWidth to 0, silently
            // pinning the row narrow forever regardless of how much room
            // opens up later (live feedback: "always this version now, no
            // longer has the three options" - happened even at a plainly
            // wide viewport). Un-hiding the real control before reading
            // its width, synchronously, then deciding - the two class
            // mutations land in the same task, before the next paint, so
            // there's nothing for the user to see flicker either way.
            wrap.classList.remove('action-status-narrow');
            var fits = form.scrollWidth <= column.clientWidth + 1;
            wrap.classList.toggle('action-status-narrow', !fits);
        }
        check();
        window.addEventListener('resize', check);
        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(check).observe(column);
        }
    });
}

document.addEventListener('DOMContentLoaded', function () {
    function setupTabs(tabSelector, tabDataKey, rowSelector, rowDataKey, onApply) {
        var tabButtons = document.querySelectorAll(tabSelector);
        var rows = document.querySelectorAll(rowSelector);
        if (!tabButtons.length) return;

        function applyTab(tab) {
            rows.forEach(function (row) {
                row.style.display = (tab === 'all' || row.dataset[rowDataKey] === tab) ? '' : 'none';
            });
            if (onApply) onApply();
        }

        tabButtons.forEach(function (button) {
            button.addEventListener('click', function () {
                tabButtons.forEach(function (b) { b.classList.remove('active'); });
                button.classList.add('active');
                applyTab(button.dataset[tabDataKey]);
            });
        });

        var defaultButton = firstUsableTabButton(tabButtons);
        defaultButton.classList.add('active');
        applyTab(defaultButton.dataset[tabDataKey]);
    }

    // wireReferralCarouselInteractions before setupTabs, not after - it's
    // what creates the carousel (and does its own initial rebuild,
    // unfiltered). setupTabs' own default-tab applyTab (below)
    // synchronously triggers a rebuildReferralCarousel(true) of its own the
    // moment it's called (not deferred to a later click) - with the order
    // reversed, that first call ran with no carousel registered yet,
    // silently no-op'ing (rebuildReferralCarousel guards the call), so the default
    // active tab's carousel (whichever firstUsableTabButton picks - live
    // feedback: "Awaiting Discussion, 5 cards" - never got the dots/active-
    // card state actually recomputed against its own filtered card set.
    // Matches My Actions' own working order (wireActionCarouselInteractions
    // before initActionTabs, below) - live feedback: "it works on
    // Discussed" (not the default tab, so never hit this race at all).
    wireReferralCarouselInteractions();
    // onApply resets the carousel to its first card on every tab switch
    // (rebuildReferralCarousel(true)) - the phone-only (#my-referrals-list)
    // scroll-snap carousel dots/arrows track whichever cards the tab just
    // filtered to, not the full unfiltered set (#116 grilling).
    setupTabs('[data-referral-tab]', 'referralTab', '#my-referrals-list li[data-discussed]', 'discussed', function () {
        rebuildReferralCarousel(true);
    });
    wireReferralRecount();
    wireCarouselFilterDropdown('[data-referral-filter]', '[data-referral-tab-row]');

    wireActionCarouselInteractions();
    initActionTabs();
    wireActionForms();
    wireCarouselFilterDropdown('[data-action-filter]', '[data-action-tab-row]');
    wireActionStatusFilters();
    wireActionStatusOverflow();
    // Overflow handling for each card's own tab row (collapsing into "More"),
    // and the My Referrals/My Actions card switcher itself, are both wired up
    // generically in static/js/main.js — nothing page-specific needed here.
    wireCardCollapseToggles();
});

// Upcoming Panel Meetings/Recent Activity's stack-mode-only collapse toggle
// (panel.css: .card-collapsible's 0fr/1fr grid-row transition does the
// actual animating, this just flips the two states). No-op above 1180px -
// the button itself is display: none there (panel.css), so it's never
// reachable to click in the first place; this only needs to handle the one
// breakpoint where it's visible.
function wireCardCollapseToggles() {
    document.querySelectorAll('[data-card-collapse-toggle]').forEach(function (button) {
        button.addEventListener('click', function () {
            var card = button.closest('.card');
            var expanded = button.getAttribute('aria-expanded') === 'true';
            button.setAttribute('aria-expanded', expanded ? 'false' : 'true');
            if (card) card.classList.toggle('is-expanded', !expanded);
        });
    });
}

var referralMatchers = {
    all: function (row) { return true; },
    awaiting: function (row) { return row.dataset.discussed === 'awaiting'; },
    discussed: function (row) { return row.dataset.discussed === 'discussed'; },
};

// My Referrals has no status-change action on this page itself (moving a
// referral to "Discussed" only happens via the Panel Agenda's "start
// discussion" flow, elsewhere) - the one thing that can change its counts
// live here is deleting a referral (data-row-remove-form,
// static/js/components/row-list-patch.js), which
// fires 'panel:row-removed' once the row's actually gone. Recomputed purely
// from the remaining DOM rows - no server round-trip needed, unlike My
// Actions' status changes (see refreshMyActionsCard), since a delete doesn't
// need any server-derived field recomputed for the rows that remain.
function wireReferralRecount() {
    var card = document.getElementById('referrals-card');
    if (!card) return;
    card.addEventListener('panel:row-removed', function () {
        var rows = card.querySelectorAll('#my-referrals-list li[data-discussed]');
        var tabRow = card.querySelector('[data-referral-tab-row]');
        var heading = card.querySelector('[data-heading-count]');
        window.recountTabsFromRows(tabRow, rows, referralMatchers, 'referralTab', heading);
        // Deleting a row doesn't change *which* tab is active, so the
        // remaining cards' order/position is still valid - just rebuild the
        // dots to match the now-smaller set rather than resetting scroll.
        rebuildReferralCarousel(false);
    });
}

// Phone-only (<=479px, panel.css) card-stack carousel for My Referrals and
// My Actions - same "native scroll" base as the KPI stats row (#116) but
// with dots (touch) or arrows (mouse/trackpad - nav-touch-mode class)
// instead of that row's arrows-always treatment, since this only ever needs
// to work at one fixed breakpoint.
//
// THE MECHANISM IS NOT HERE ANY MORE (#214). My Referrals and My Actions
// were two near-1:1 copies of it, folded into one local implementation by
// #200; that local implementation was itself the third of the portal's
// three carousels, and this is the call site for the one shared component
// now - initCarousel's `card` mode (components/carousel.js). What stays
// here is what is genuinely Panel Home's: which elements to bind, which
// noun goes in front of "1 of 4", the first-card margin fix below, and the
// width at which tapping a peeking card means "bring it into view".
//
// wireReferralCarouselInteractions runs once (arrows/drag/scroll
// listeners); rebuildReferralCarousel re-runs whenever the *visible* card
// set changes (tab switch, delete) to rebuild the dots and re-sync the
// fade/arrow state. Both stay as the named entry points every other call
// site in this file already uses.
//
// A dot per card stops being a usable indicator (or a realistic tap
// target) past this many - the carousel switches to a plain "3 / 12" text
// label instead once the count exceeds it.
var CAROUSEL_COUNT_LABEL_THRESHOLD = 8;

// The live controllers, keyed by the viewport each one drives. Was
// window.updateReferralCarouselState / window.updateActionCarouselState - a
// module-local map now, since both the setter and every reader were always
// in this one file, and ADR 0021 wants nothing on window that an import can
// carry. My Actions' whole card is replaced via AJAX on every status change
// (refreshMyActionsCard, below), so its entry is simply overwritten by the
// re-wire that follows each swap; the old DOM and its listeners go with the
// discarded markup.
var cardStackCarousels = {};

// Carousel mode only, which is where most of a peeking card is genuinely
// off-screen. Registry tiers (layout/breakpoints.js) rather than a literal
// 1180: the touch tier is floored at 481px so it cannot overlap the phone
// tier, so "<= 1180px" is that tier OR the phone tier, and the pair states
// the boundary rule rather than restating a number.
function isCarouselMode() {
    return touchMql.matches || phoneMql.matches;
}

function wireCardStackCarousel(cfg) {
    var wrap = document.querySelector(cfg.wrapSelector);
    var viewport = document.getElementById(cfg.viewportId);
    if (!wrap || !viewport) return;
    cardStackCarousels[cfg.viewportId] = initCarousel(wrap, {
        mode: 'card',
        track: '#' + cfg.viewportId,
        prev: cfg.prevArrowSelector,
        next: cfg.nextArrowSelector,
        fadeL: cfg.fadeLSelector,
        fadeR: cfg.fadeRSelector,
        dots: cfg.dotsSelector,
        dotClass: cfg.dotClass,
        dotThreshold: CAROUSEL_COUNT_LABEL_THRESHOLD,
        countLabel: cfg.countSelector,
        liveRegion: cfg.liveSelector,
        itemLabel: cfg.itemLabel,
        spacerClass: cfg.spacerClass,
        disableArrowsAtEdges: true,
        keyboard: true,
        fling: true,
        // Tab filtering hides rows with style.display: none rather than
        // removing them, and the list carries a spacer and an empty-state
        // note that are not cards - counting any of them would throw every
        // index, dot and count readout off.
        visible: function (track) {
            return Array.prototype.filter.call(track.children, function (li) {
                return li.style.display !== 'none'
                    && !li.classList.contains('empty-note')
                    && !li.classList.contains(cfg.spacerClass);
            });
        },
        /* panel.css's `> li:first-child { margin-left: 0 }` only zeroes the
           -60px stack-overlap margin for the DOM's literal first child -
           tab-filtering very often leaves the true :first-child a *hidden*
           row, not the first visible card. That card then silently kept a
           -60px it was never meant to have, starving it of exactly the room
           needed to reach true centre, and the nearest-to-centre test
           (correctly measuring distance) then always preferred card 2
           instead (live feedback + repro: loaded straight onto "2 / 4"). An
           explicit inline override rather than relying on the CSS selector
           at all, re-applied on every rebuild since a tab switch or a
           delete can change which card is now first. */
        onRebuild: function (cards) {
            cards.forEach(function (card, i) {
                card.style.marginLeft = i === 0 ? '0px' : '';
            });
        },
        drag: {
            threshold: 5,
            draggingClass: 'is-grabbing',
            /* A real control (Edit/Delete, the row-remove form) needs its
               own native mousedown/focus/click untouched - preventDefault
               plus pointer capture was hijacking that on every pointerdown
               regardless of target, silently breaking clicks on any button
               inside the carousel (live feedback: "selecting buttons does
               not work"). Without the preventDefault, though, a mousedown +
               move over a row (role="button") kicks off native drag or text
               selection and never delivers useful deltas - so it is the
               pair that works, not either alone. */
            ignoreSelector: 'button, a, form',
            preventDefaultOnDown: true,
            /* The tap-neighbour handler is capture-phase on this same
               element and already has to know whether a drag happened, so
               it swallows the post-drag click itself rather than have a
               second suppressor race it. */
            suppressClick: false,
        },
        tapNeighbour: {
            when: isCarouselMode,
            ignoreSelector: 'button, a, form',
            itemSelector: 'li',
        },
    });
}

function rebuildCardStackCarousel(cfg, resetScroll) {
    var carousel = cardStackCarousels[cfg.viewportId];
    if (carousel) carousel.rebuild(resetScroll);
}

var REFERRAL_CAROUSEL = {
    wrapSelector: '[data-referral-carousel]',
    viewportId: 'my-referrals-list',
    prevArrowSelector: '.referral-carousel-arrow--prev',
    nextArrowSelector: '.referral-carousel-arrow--next',
    fadeLSelector: '.referral-carousel-fade-l',
    fadeRSelector: '.referral-carousel-fade-r',
    countSelector: '[data-referral-count]',
    liveSelector: '[data-referral-live]',
    dotsSelector: '[data-referral-dots]',
    dotClass: 'referral-carousel-dot',
    spacerClass: 'referral-carousel-spacer',
    itemLabel: 'Referral',
};

function wireReferralCarouselInteractions() { wireCardStackCarousel(REFERRAL_CAROUSEL); }
function rebuildReferralCarousel(resetScroll) { rebuildCardStackCarousel(REFERRAL_CAROUSEL, resetScroll); }

var ACTION_CAROUSEL = {
    wrapSelector: '[data-action-carousel]',
    viewportId: 'my-actions-list',
    prevArrowSelector: '.action-carousel-arrow--prev',
    nextArrowSelector: '.action-carousel-arrow--next',
    fadeLSelector: '.action-carousel-fade-l',
    fadeRSelector: '.action-carousel-fade-r',
    countSelector: '[data-action-count]',
    liveSelector: '[data-action-live]',
    dotsSelector: '[data-action-dots]',
    dotClass: 'action-carousel-dot',
    spacerClass: 'action-carousel-spacer',
    itemLabel: 'Action',
};

// My Actions' whole card is replaced via AJAX on every status change
// (refreshMyActionsCard, below), discarding the old #my-actions-list/
// .action-carousel-wrap DOM along with any listeners on it -
// wireActionCarouselInteractions is called again there, fresh, after every
// such swap (as well as once at DOMContentLoad), each call targeting a
// brand-new element, so there's no double-binding risk to guard against.
function wireActionCarouselInteractions() { wireCardStackCarousel(ACTION_CAROUSEL); }
function rebuildActionCarousel(resetScroll) { rebuildCardStackCarousel(ACTION_CAROUSEL, resetScroll); }

var actionMatchers = {
    all: function (row) { return true; },
    incomplete: function (row) { return row.dataset.status === 'incomplete'; },
    overdue: function (row) { return row.dataset.overdue === 'true'; },
    not_needed: function (row) { return row.dataset.status === 'not_needed'; },
    complete: function (row) { return row.dataset.status === 'complete'; },
};

function applyActionTab(key) {
    var matcher = actionMatchers[key] || actionMatchers.all;
    document.querySelectorAll('#my-actions-list li[data-status]').forEach(function (row) {
        row.style.display = matcher(row) ? '' : 'none';
    });
}

// Re-run after every full page load and every AJAX refresh of the My Actions
// card (see refreshMyActionsCard below) — the buttons are fresh DOM nodes
// each time, so their click listeners need re-wiring rather than surviving
// from before.
function initActionTabs() {
    var actionTabButtons = document.querySelectorAll('[data-action-tab]');
    if (!actionTabButtons.length) return;
    actionTabButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            if (button.classList.contains('tab-collapsed')) return;
            actionTabButtons.forEach(function (b) { b.classList.remove('active'); });
            button.classList.add('active');
            applyActionTab(button.dataset.actionTab);
            // Resets the carousel to its first card - same "the just-
            // applied filter is a different card set now" reasoning as My
            // Referrals' own setupTabs onApply hook.
            rebuildActionCarousel(true);
        });
    });
    // Prefers an already-active button (set by refreshMyActionsCard,
    // restoring whichever tab was active before this refresh) over picking
    // a fresh default - firstUsableTabButton (skips "All" in carousel mode,
    // see its own comment) only kicks in when nothing's active yet, i.e.
    // the very first page load.
    var active = Array.prototype.filter.call(actionTabButtons, function (b) {
        return b.classList.contains('active') && !b.classList.contains('tab-collapsed');
    })[0] || firstUsableTabButton(actionTabButtons);
    active.classList.add('active');
    applyActionTab(active.dataset.actionTab);
    rebuildActionCarousel(true);
}

// The segmented status control's own submit posts via fetch instead of a
// full page reload, so the tab counts/rows can animate instead of snapping
// (INT-M2: count-delta pulse; INT-M1: transition rather than a jump for
// tabs entering/leaving the tab row). data-ajax-wired guards against double-
// binding the same form across repeated initActionTabs-style re-inits.
// FormData(form, submitter) picks up the clicked option's own name/value
// pair, same as Panel Discussion's inline Actions column
// (panel/js/components/action-assign.js).
function wireActionForms() {
    document.querySelectorAll('#actions-card [data-action-status-form]').forEach(function (form) {
        if (form.dataset.ajaxWired) return;
        form.dataset.ajaxWired = 'true';
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            // Dims the segmented control it's on for the round trip - on a
            // slow connection there was previously no feedback at all
            // between the tap and the card refreshing, which could read as
            // unresponsive. The success path doesn't need to remove this
            // itself - refreshMyActionsCard replaces the whole card (this
            // form included), so the class just goes with it; only the
            // failure path needs to clean up manually, since then the old
            // form is what's left on screen.
            form.classList.add('is-submitting');
            fetch(form.action, {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                body: new FormData(form, e.submitter),
            }).then(function (res) { return res.text(); })
                .then(function (html) { refreshMyActionsCard(html); })
                .catch(function () { form.classList.remove('is-submitting'); });
        });
    });
}

// Swaps in the freshly-rendered My Actions card fragment, then diffs the old
// tab row against the new one to animate whatever changed — a tab crossing
// to/from zero (setTabCollapsed) and/or a visible tab's own count changing
// (pulseCount) — rather than the new counts just appearing. Both helpers
// are defined in static/js/components/tabs.js.
function refreshMyActionsCard(html) {
    var card = document.getElementById('actions-card');
    if (!card) return;
    var oldList = card.querySelector('#my-actions-list');
    var scrollTop = oldList ? oldList.scrollTop : 0;
    var oldTabRow = card.querySelector('[data-action-tab-row]');
    var activeBtn = oldTabRow ? oldTabRow.querySelector('button.active') : null;
    var activeKey = activeBtn ? activeBtn.dataset.actionTab : 'all';
    var oldCounts = {};
    if (oldTabRow) {
        oldTabRow.querySelectorAll('[data-action-tab]').forEach(function (btn) {
            oldCounts[btn.dataset.actionTab] = {
                count: parseInt(btn.dataset.count, 10) || 0,
                collapsed: btn.classList.contains('tab-collapsed'),
            };
        });
    }
    var oldHeading = card.querySelector('[data-heading-count]');
    var oldHeadingCount = oldHeading ? parseInt(oldHeading.dataset.count, 10) || 0 : 0;

    var temp = document.createElement('div');
    temp.innerHTML = html;
    var freshCard = temp.querySelector('#actions-card');
    if (!freshCard) return;
    card.replaceWith(freshCard);

    var newList = freshCard.querySelector('#my-actions-list');
    // Only meaningful above the carousel breakpoint (panel.css) - #my-
    // actions-list is a plain vertically-scrolling list there, a no-op
    // horizontally-scrolling carousel everywhere else (wireActionCarousel
    // Interactions, below, resets that scroll position itself).
    if (newList) newList.scrollTop = scrollTop;
    initSelectable(freshCard);
    // The old wrap/list DOM (and every listener wireActionCarouselInteractions
    // attached to it) went away with card.replaceWith above - re-wire fresh
    // against the new one, same as a first page load.
    wireActionCarouselInteractions();

    var newHeading = freshCard.querySelector('[data-heading-count]');
    if (newHeading) {
        var newHeadingCount = parseInt(newHeading.dataset.count, 10) || 0;
        if (oldHeading && newHeadingCount !== oldHeadingCount) {
            window.pulseCount(newHeading, newHeadingCount > oldHeadingCount ? 'up' : 'down');
        }
    }

    var newTabRow = freshCard.querySelector('[data-action-tab-row]');
    if (newTabRow) {
        // The one-shot tab-row-fade-in shouldn't replay on a refresh (INT-P3:
        // a targeted in-place refresh shouldn't reset state that was already settled).
        // But if the row didn't exist before (the tab-row itself just
        // crossed from a single populated bucket to its first second one),
        // this genuinely is its first appearance, so let it fade in.
        if (oldTabRow) newTabRow.style.animation = 'none';
        newTabRow.querySelectorAll('[data-action-tab]').forEach(function (btn) {
            var key = btn.dataset.actionTab;
            var prev = oldCounts[key];
            var isCollapsedNow = btn.classList.contains('tab-collapsed');
            if (!prev) return;
            if (prev.collapsed !== isCollapsedNow) {
                // Force the old visual state first so setTabCollapsed has
                // something to transition away from, not just snap into.
                if (prev.collapsed) { btn.classList.add('tab-collapsed'); btn.setAttribute('tabindex', '-1'); }
                else { btn.classList.remove('tab-collapsed'); btn.removeAttribute('tabindex'); }
                void btn.offsetWidth;
                window.setTabCollapsed(btn, isCollapsedNow);
            }
            var newCount = parseInt(btn.dataset.count, 10) || 0;
            if (prev.count !== newCount && !isCollapsedNow) {
                window.pulseCount(btn.querySelector('.count'), newCount > prev.count ? 'up' : 'down');
            }
            if (key === activeKey && !isCollapsedNow) btn.classList.add('active');
        });
        // Fall back if the previously active tab just collapsed away -
        // firstUsableTabButton (not a hardcoded grab of "All") so this
        // doesn't activate a hidden All button in carousel mode, same
        // "All" is unusable there as everywhere else it's picked.
        if (!newTabRow.querySelector('button.active')) {
            firstUsableTabButton(newTabRow.querySelectorAll('[data-action-tab]')).classList.add('active');
        }
        // The old row's own overflow-scroll wiring (components/overflow-
        // tabs.js) went away with it — re-init on the fresh row rather than
        // leaving narrow viewports without one.
        setupOverflowTabs(newTabRow);
    }

    initActionTabs();
    wireActionForms();
    // The old dropdown (and its MutationObserver, watching the old tab row
    // that just went away with card.replaceWith above) goes with it - wire a
    // fresh one against the new tab row, same as everything else re-wired
    // above.
    wireCarouselFilterDropdown('[data-action-filter]', '[data-action-tab-row]');
    // Same reasoning - every row's own status dropdown (data-action-status-
    // filter) is fresh DOM too, re-wire from scratch.
    wireActionStatusFilters();
    wireActionStatusOverflow();
}
