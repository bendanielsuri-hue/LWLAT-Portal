/* Moved out of home.html's inline <script> as-is (#211, #203's inline-
   template-script rule - this file had zero {{ }}/{% %} template refs to
   begin with, so the move is mechanical). Panel Home's own carousel/tab/
   AJAX-refresh wiring for My Referrals and My Actions - no other page
   uses any of it.

   Over the 600-line review trigger (742 code lines) and stays one file:
   the My Referrals and My Actions carousels are a deliberate parallel
   implementation, not a shared one (each function below says so inline,
   e.g. wireActionCarouselInteractions' own header comment) - splitting
   by card would just draw the file boundary through the middle of one
   mechanism twice, publishing nothing a reader gains from. */

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
    // what defines window.updateReferralCarouselState (and does its own
    // initial rebuildReferralCarousel(true) call, unfiltered). setupTabs'
    // own default-tab applyTab (below) synchronously triggers a
    // rebuildReferralCarousel(true) of its own the moment it's called (not
    // deferred to a later click) - with the order reversed, that first call
    // ran with window.updateReferralCarouselState still undefined, silently
    // no-op'ing (rebuildReferralCarousel guards the call), so the default
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

// Phone-only (<=479px, panel.css) horizontal scroll-snap carousel for My
// Referrals - same "native scroll + scroll-snap" base as the KPI stats row
// (#116) but with dots (touch) or arrows (mouse/trackpad - nav-touch-mode
// class, main.js) instead of that row's own arrows-always/peek-mode
// treatment, since this only ever needs to work at one fixed breakpoint.
// wireReferralCarouselInteractions runs once (arrows/drag/scroll listeners);
// rebuildReferralCarousel re-runs whenever the *visible* card set changes
// (tab switch, delete) to rebuild the dots and re-sync fade/arrow state.
// A dot per card stops being a usable indicator (or a realistic tap
// target) past this many - rebuildReferralCarousel/rebuildActionCarousel
// switch to a plain "3 / 12" text label instead once the count exceeds it.
var CAROUSEL_COUNT_LABEL_THRESHOLD = 8;

function wireReferralCarouselInteractions() {
    var wrap = document.querySelector('[data-referral-carousel]');
    var viewport = document.getElementById('my-referrals-list');
    if (!wrap || !viewport) return;
    var prev = wrap.querySelector('.referral-carousel-arrow--prev');
    var next = wrap.querySelector('.referral-carousel-arrow--next');
    var fadeL = wrap.querySelector('.referral-carousel-fade-l');
    var fadeR = wrap.querySelector('.referral-carousel-fade-r');
    var countLabel = document.querySelector('[data-referral-count]');
    var liveRegion = document.querySelector('[data-referral-live]');
    var lastAnnouncedIndex = -1;

    function visibleCards() {
        return Array.prototype.filter.call(viewport.children, function (li) {
            return li.style.display !== 'none' && !li.classList.contains('referral-carousel-spacer');
        });
    }

    function step() {
        var card = visibleCards()[0];
        if (!card) return viewport.clientWidth;
        var style = window.getComputedStyle(viewport);
        return card.getBoundingClientRect().width + (parseFloat(style.columnGap || style.gap) || 0);
    }

    // Nearest card to the viewport's own centre (in scroll-space) - matches
    // goTo's own centering target (viewport.scrollTo, above) exactly, card
    // centre vs viewport centre. Previously compared raw offsetLeft against
    // scrollLeft (a left-edge-to-left-edge distance), which was consistent
    // back when goTo scrolled each card flush to the start - once goTo
    // switched to centering cards instead, that left-edge heuristic no
    // longer agreed with where goTo actually parked the "active" card,
    // reliably picking the *previous* card instead (confirmed empirically:
    // dot 4 activated card 3) and meaning the last card could never win the
    // comparison at all (nothing scrolls further left of it to make its own
    // offsetLeft "closest" to a scrollLeft that maxes out before reaching
    // it).
    //
    // card.offsetLeft is relative to card.offsetParent, not necessarily
    // viewport - here it's actually .referral-carousel-wrap (the nearest
    // positioned ancestor), a different coordinate origin than viewport's
    // own scrollLeft/clientWidth. Mixing the two silently threw every
    // distance below off by a constant amount (live feedback, reproduced
    // via Playwright: page loaded straight onto "2 / 4" with card 2 marked
    // active, not card 1 - offsetLeft read ~59px short of viewport's own
    // left edge, enough to flip which card this centre-distance math
    // preferred once auto-width made cards this narrow). cardLeft() below
    // diffs getBoundingClientRect() against viewport's own rect (plus its
    // current scrollLeft, since getBoundingClientRect is scroll-position-
    // dependent where offsetLeft isn't) to get the card's true position in
    // viewport's own coordinate space regardless of offsetParent.
    function cardLeft(card) {
        return card.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft;
    }

    function activeIndex() {
        var cards = visibleCards();
        var viewportCenter = viewport.scrollLeft + viewport.clientWidth / 2;
        var closestIndex = 0;
        var closestDist = Infinity;
        cards.forEach(function (card, i) {
            var cardCenter = cardLeft(card) + card.offsetWidth / 2;
            var dist = Math.abs(cardCenter - viewportCenter);
            if (dist < closestDist) { closestDist = dist; closestIndex = i; }
        });
        return { cards: cards, index: closestIndex };
    }

    // Scrolls to and (optionally) focuses card `index` - the one shared
    // path behind prev/next arrows, keyboard paging, dot taps, and tapping
    // a peeking neighbour card directly. focusCard is skipped for the
    // initial/reset call (home.html's rebuildReferralCarousel) - autofocus
    // on page load or a tab switch the user didn't ask to navigate away
    // from would be a worse surprise than not moving focus at all.
    function goTo(index, focusCard) {
        var cards = visibleCards();
        var card = cards[index];
        if (!card) return;
        // Explicit scrollLeft, not card.scrollIntoView({inline: 'center'}) -
        // scrollIntoView only scrolls the *minimum* needed to satisfy its
        // own "is this already visible" heuristic, which doesn't know two
        // overlapping cards (the stack effect, panel.css) are meant to
        // trade places - it can decide the target card is already
        // "visible enough" mid-stack and never actually scroll at all
        // (confirmed empirically: scrollLeft unchanged after goTo). Always
        // computes and sets a real target instead.
        viewport.scrollTo({ left: cardLeft(card) - (viewport.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' });
        if (focusCard) card.focus({ preventScroll: true });
    }

    function updateState() {
        var overflowing = viewport.scrollWidth > viewport.clientWidth + 1;
        var active = activeIndex();
        var cards = active.cards;
        var closestIndex = active.index;
        var atStart = closestIndex === 0;
        var atEnd = closestIndex === cards.length - 1;

        if (prev) { prev.hidden = !overflowing; prev.disabled = atStart; }
        if (next) { next.hidden = !overflowing; next.disabled = atEnd; }
        if (fadeL) fadeL.style.opacity = (!overflowing || atStart) ? 0 : 1;
        if (fadeR) fadeR.style.opacity = (!overflowing || atEnd) ? 0 : 1;

        // Raises whichever card is currently "active" (nearest the
        // viewport's centre) above its neighbours - the "stack" effect
        // (panel.css, #my-referrals-list > li): the active card scales up
        // front and centre (highest z-index, via --absdist below) while
        // its neighbours shrink, dim, and tuck behind it. --dist (signed)
        // drives left/right-specific transforms where a variant wants them
        // (e.g. rotation); --absdist (unsigned) drives symmetric ones
        // (scale, opacity).
        cards.forEach(function (card, i) {
            card.classList.toggle('is-active', i === closestIndex);
            var dist = i - closestIndex;
            card.style.setProperty('--dist', dist);
            card.style.setProperty('--absdist', Math.abs(dist));
            // Capped at 10 (was 100) - the fade/arrow chrome and the
            // carousel-filter dropdown (panel.css) sit at fixed z-indexes
            // above this range on purpose; a card near either edge used to
            // outrank them outright, covering the arrow (reading as
            // "disabled") or rendering over the dropdown.
            card.style.zIndex = String(Math.max(1, 10 - Math.abs(dist)));
        });

        var dots = wrap.parentNode.querySelectorAll('.referral-carousel-dot');
        dots.forEach(function (dot, i) {
            var isActive = i === closestIndex;
            dot.classList.toggle('active', isActive);
            dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        if (countLabel && cards.length > 1) {
            countLabel.textContent = (closestIndex + 1) + ' / ' + cards.length;
            countLabel.classList.add('has-cards');
            countLabel.classList.toggle('many-cards', cards.length > CAROUSEL_COUNT_LABEL_THRESHOLD);
        } else if (countLabel) {
            countLabel.classList.remove('has-cards', 'many-cards');
        }

        if (liveRegion && cards.length > 1 && closestIndex !== lastAnnouncedIndex) {
            lastAnnouncedIndex = closestIndex;
            liveRegion.textContent = 'Referral ' + (closestIndex + 1) + ' of ' + cards.length;
        }
    }

    if (prev) prev.addEventListener('click', function () { goTo(activeIndex().index - 1, true); });
    if (next) next.addEventListener('click', function () { goTo(activeIndex().index + 1, true); });
    viewport.addEventListener('scroll', updateState);
    // Instant (no smooth), not just updateState - a resize/orientation
    // change can leave the active card off-centre at the new width, so it's
    // re-centred outright rather than just re-syncing the fade/arrow/dot
    // indicators around a now-stale scroll position.
    window.addEventListener('resize', function () {
        goTo(activeIndex().index, false);
        updateState();
    });
    // Left/Right pages through the carousel whenever focus is anywhere
    // inside it (a card, an arrow) - the arrow buttons already have their
    // own click handlers above, so this mostly matters for a focused card.
    wrap.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); goTo(activeIndex().index + 1, true); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(activeIndex().index - 1, true); }
    });

    // Click-and-drag (mouse/pen only - touch already gets native
    // panning/flick from the CSS overflow-x: auto). Same plain scrollLeft
    // manipulation as the KPI carousel (main.js), not a transform, so
    // scroll-snap still settles it on release.
    var isPointerDown = false;
    var dragMoved = false;
    var startX = 0;
    var startScrollLeft = 0;
    // Momentum tracking: scrollLeft-per-ms sampled every ~frame during the
    // drag, so a fast flick keeps travelling briefly after release instead
    // of stopping dead exactly where the pointer let go - matches the free
    // feel touch already gets natively from the browser's own panning.
    var lastSampleScrollLeft = 0;
    var lastSampleTime = 0;
    var flingVelocity = 0;
    viewport.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch') return;
        // A real control (Edit/Delete, the row-remove form) needs its own
        // native mousedown/focus/click behaviour untouched - preventDefault
        // + setPointerCapture below (for drag-to-scroll) was hijacking that
        // on every pointerdown regardless of target, silently breaking
        // clicks on any button inside the carousel (live feedback:
        // "selecting buttons does not work"). Same guard as the click
        // handler further down.
        if (e.target.closest('button, a, form')) return;
        // Without this, a mousedown+move over a referral row (role="button")
        // can kick off native drag/text-selection instead of ever reaching
        // pointermove below with useful deltas.
        e.preventDefault();
        isPointerDown = true;
        dragMoved = false;
        startX = e.clientX;
        startScrollLeft = viewport.scrollLeft;
        lastSampleScrollLeft = viewport.scrollLeft;
        lastSampleTime = performance.now();
        flingVelocity = 0;
    });
    viewport.addEventListener('pointermove', function (e) {
        if (!isPointerDown) return;
        var dx = e.clientX - startX;
        // setPointerCapture only once an actual drag starts, not on every
        // pointerdown - capturing immediately retargeted the eventual
        // click event to the viewport itself rather than whatever card was
        // actually under the pointer (confirmed empirically:
        // document.elementFromPoint found the right <li>, but the click
        // event's own target was the <ul>), silently breaking "click a
        // peeking card to activate it" for any tap/click that never moved
        // (live feedback: "can selecting a non active card activate that
        // card"). A real drag still needs capture so tracking continues
        // even if the pointer leaves the element's bounds mid-drag.
        if (!dragMoved && Math.abs(dx) > 5) {
            dragMoved = true;
            viewport.classList.add('is-grabbing');
            viewport.setPointerCapture(e.pointerId);
        }
        if (dragMoved) {
            viewport.scrollLeft = startScrollLeft - dx;
            var now = performance.now();
            var dt = now - lastSampleTime;
            if (dt > 8) {
                flingVelocity = (viewport.scrollLeft - lastSampleScrollLeft) / dt;
                lastSampleScrollLeft = viewport.scrollLeft;
                lastSampleTime = now;
            }
        }
    });
    function endPointerDrag() {
        isPointerDown = false;
        viewport.classList.remove('is-grabbing');
        if (dragMoved) {
            // Distance capped to 1.5 cards - a hard flick shouldn't be able
            // to rocket past several at once. Projects where the fling
            // would land, then hands off to goTo (above) for whichever
            // card ends up nearest that point - no CSS scroll-snap (still
            // deliberately absent, see #my-referrals-list's own "No
            // scroll-snap" comment, panel.css: a snap point catching
            // mid-flick felt bad), but a release with real momentum still
            // wants to finish centred on a card rather than wherever the
            // raw scroll happened to stop (live feedback: "on release can
            // the active card transition to center position").
            var distance = 0;
            if (Math.abs(flingVelocity) > 0.05) {
                var cap = step() * 1.5;
                distance = Math.max(-cap, Math.min(cap, flingVelocity * 220));
            }
            var projectedCenter = viewport.scrollLeft + distance + viewport.clientWidth / 2;
            var cards = visibleCards();
            var settleIndex = 0;
            var settleDist = Infinity;
            cards.forEach(function (card, i) {
                var d = Math.abs((cardLeft(card) + card.offsetWidth / 2) - projectedCenter);
                if (d < settleDist) { settleDist = d; settleIndex = i; }
            });
            goTo(settleIndex, false);
        }
        flingVelocity = 0;
    }
    viewport.addEventListener('pointerup', endPointerDrag);
    viewport.addEventListener('pointercancel', endPointerDrag);
    // A drag that actually moved shouldn't also fire the row's own
    // select-toggle (initSelectable, main.js) - swallow that one click in
    // the capture phase before it reaches the list's own click listener.
    // Tapping a *peeking* (not currently centred) card is redirected to
    // advance to it instead of toggling its selection - you can only see a
    // sliver of it, so selecting it outright isn't a meaningful action;
    // properly bringing it into view is what the tap actually meant.
    viewport.addEventListener('click', function (e) {
        // Same ≤1180px guard as wireActionStatusOverflow's own carousel-vs-
        // stacked check (above) - this whole "advance to the tapped
        // neighbour instead of toggling it" behaviour only makes sense in
        // carousel mode, where most of a peeking card is genuinely off-
        // screen. Missed here originally: above 1180px this handler still
        // ran (registered once, unconditionally, not re-wired per width)
        // and, being capture-phase on the same element initSelectable's
        // own toggle listens on, silently swallowed every click before the
        // row's chosen/primary-fill state could ever be set - live
        // feedback: "the active row does not seem to change when a
        // different row is selected" (desktop/stacked mode only - Students/
        // Referrals have no such handler, hence homepage-only).
        if (!window.matchMedia('(max-width: 1180px)').matches) return;
        if (dragMoved) { e.preventDefault(); e.stopPropagation(); dragMoved = false; return; }
        // A real control (Edit/Delete, the row-remove form) always gets its
        // own click through untouched, active card or not - the "advance to
        // this neighbour" hijack below is only ever meant for taps on the
        // card's own passive area (thumb, text, background). Missed
        // originally when peeking cards only showed a bare sliver with no
        // real controls to tap by accident; auto-width cards (live
        // feedback) now show full cards side by side, so a tap actually
        // meant for a neighbour's own Edit/Delete was being swallowed here
        // before it ever reached the button.
        if (e.target.closest('button, a, form')) return;
        var li = e.target.closest('li');
        if (!li || li.classList.contains('referral-carousel-spacer')) return;
        var cards = visibleCards();
        var idx = cards.indexOf(li);
        if (idx === -1 || idx === activeIndex().index) return;
        e.preventDefault();
        e.stopPropagation();
        goTo(idx, true);
    }, true);

    window.updateReferralCarouselState = updateState;
    // true (not false) - centres the first card on initial mount, same as
    // any other reset. Without this, initial scrollLeft was just the
    // default 0 (flush at the start of any padding-left, live feedback:
    // "active card should be in the middle").
    rebuildReferralCarousel(true);
}

// Rebuilds the dots row to match whichever cards are *currently visible*
// (tab-filtered) - one dot per visible card, none at all for 0-1 (nothing to
// page through). resetScroll snaps back to the first card, used on a tab
// switch (the previous scroll position belongs to a different card set) but
// not on a delete (the remaining cards' order is still valid - #116
// grilling: "dots track filtered set").
function rebuildReferralCarousel(resetScroll) {
    var dotsContainer = document.querySelector('[data-referral-dots]');
    var viewport = document.getElementById('my-referrals-list');
    if (!dotsContainer || !viewport) return;

    // Same coordinate-origin fix as wireReferralCarouselInteractions' own
    // cardLeft (above) - card.offsetLeft is relative to card.offsetParent
    // (.referral-carousel-wrap), not viewport, so it can't be compared
    // against viewport.clientWidth/scrollLeft directly.
    function cardLeft(card) {
        return card.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft;
    }

    var cards = Array.prototype.filter.call(viewport.children, function (li) {
        return li.style.display !== 'none' && !li.classList.contains('empty-note')
            && !li.classList.contains('referral-carousel-spacer');
    });
    // panel.css's #my-referrals-list > li:first-child { margin-left: 0 }
    // only zeroes the -60px stack-overlap margin for the DOM's literal
    // first child - tab-filtering (setupTabs' applyTab, above) hides rows
    // via style.display: none without removing them, so the true
    // :first-child is very often a *hidden* row once a tab narrows the
    // set, not the first visible card. That card then silently kept the
    // base -60px it was never meant to have, starving it of exactly the
    // room needed to ever reach true centre - activeIndex() (correctly
    // measuring distance, see cardLeft above) then always preferred card 2
    // instead (live feedback + Playwright repro: loaded straight onto
    // "2 / 4"). Explicit inline override instead of relying on the CSS
    // selector at all - re-applied on every rebuild (tab switch or
    // delete), since either can change which card is now first.
    cards.forEach(function (card, i) {
        card.style.marginLeft = i === 0 ? '0px' : '';
    });
    // Deferred one frame, not read/applied synchronously - this runs
    // straight out of setupTabs' own initial applyTab call (home.html,
    // DOMContentLoaded), before the browser has necessarily finished its
    // first real layout pass on these auto-width flex cards. Reading
    // offsetLeft/offsetWidth that early can catch them mid-resolution
    // (still 0 or a stale intrinsic value), computing a centering target
    // for card 0 that's wrong - reachable by later scrolling (goTo's own
    // measurements, taken well after that first paint, are fine) but not
    // actually centered on load (live feedback: "first card is not
    // centred but can be navigated to"). requestAnimationFrame guarantees
    // a completed layout/paint has happened before these reads.
    if (resetScroll && cards[0]) {
        requestAnimationFrame(function () {
            viewport.scrollTo({ left: cardLeft(cards[0]) - (viewport.clientWidth - cards[0].offsetWidth) / 2 });
            if (window.updateReferralCarouselState) window.updateReferralCarouselState();
        });
    }

    dotsContainer.innerHTML = '';
    // Past CAROUSEL_COUNT_LABEL_THRESHOLD, a dot per card stops being a
    // usable indicator (or a realistic tap target) - leave the row empty
    // and let the "3 / 12" text label (.referral-carousel-count, styled in
    // panel.css, kept in sync by updateState) carry the signal instead.
    if (cards.length > 1 && cards.length <= CAROUSEL_COUNT_LABEL_THRESHOLD) {
        cards.forEach(function (card, i) {
            var dot = document.createElement('button');
            dot.type = 'button';
            dot.setAttribute('role', 'tab');
            dot.className = 'referral-carousel-dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
            dot.setAttribute('aria-label', 'Go to referral ' + (i + 1) + ' of ' + cards.length);
            dot.addEventListener('click', function () {
                // Explicit scrollLeft, not scrollIntoView - see goTo's own
                // identical change (wireReferralCarouselInteractions, above)
                // for why.
                viewport.scrollTo({ left: cardLeft(card) - (viewport.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' });
                card.focus({ preventScroll: true });
            });
            dotsContainer.appendChild(dot);
        });
    }
    if (window.updateReferralCarouselState) window.updateReferralCarouselState();
}

// My Actions carousel - mirrors wireReferralCarouselInteractions/
// rebuildReferralCarousel above 1:1 (see panel.css's own .action-carousel-*
// comment for why this is a parallel implementation, not a shared one).
// The one real difference: My Actions' whole card is replaced via AJAX on
// every status change (refreshMyActionsCard, below), discarding the old
// #my-actions-list/.action-carousel-wrap DOM along with any listeners on it
// - wireActionCarouselInteractions is called again there, fresh, after every
// such swap (as well as once at DOMContentLoad), each call targeting a
// brand-new element, so there's no double-binding risk to guard against.
function wireActionCarouselInteractions() {
    var wrap = document.querySelector('[data-action-carousel]');
    var viewport = document.getElementById('my-actions-list');
    if (!wrap || !viewport) return;
    var prev = wrap.querySelector('.action-carousel-arrow--prev');
    var next = wrap.querySelector('.action-carousel-arrow--next');
    var fadeL = wrap.querySelector('.action-carousel-fade-l');
    var fadeR = wrap.querySelector('.action-carousel-fade-r');
    var countLabel = document.querySelector('[data-action-count]');
    var liveRegion = document.querySelector('[data-action-live]');
    var lastAnnouncedIndex = -1;

    function visibleCards() {
        return Array.prototype.filter.call(viewport.children, function (li) {
            return li.style.display !== 'none' && !li.classList.contains('action-carousel-spacer');
        });
    }

    function step() {
        var card = visibleCards()[0];
        if (!card) return viewport.clientWidth;
        var style = window.getComputedStyle(viewport);
        return card.getBoundingClientRect().width + (parseFloat(style.columnGap || style.gap) || 0);
    }

    // Card centre vs viewport centre - see My Referrals' identical change
    // (wireReferralCarouselInteractions, above) for why, including the
    // card.offsetLeft/offsetParent coordinate-origin fix below (cardLeft) -
    // same mirrored bug, same fix.
    function cardLeft(card) {
        return card.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft;
    }

    function activeIndex() {
        var cards = visibleCards();
        var viewportCenter = viewport.scrollLeft + viewport.clientWidth / 2;
        var closestIndex = 0;
        var closestDist = Infinity;
        cards.forEach(function (card, i) {
            var cardCenter = cardLeft(card) + card.offsetWidth / 2;
            var dist = Math.abs(cardCenter - viewportCenter);
            if (dist < closestDist) { closestDist = dist; closestIndex = i; }
        });
        return { cards: cards, index: closestIndex };
    }

    function goTo(index, focusCard) {
        var cards = visibleCards();
        var card = cards[index];
        if (!card) return;
        // Explicit scrollLeft, not card.scrollIntoView({inline: 'center'}) -
        // scrollIntoView only scrolls the *minimum* needed to satisfy its
        // own "is this already visible" heuristic, which doesn't know two
        // overlapping cards (the stack effect, panel.css) are meant to
        // trade places - it can decide the target card is already
        // "visible enough" mid-stack and never actually scroll at all
        // (confirmed empirically: scrollLeft unchanged after goTo). Always
        // computes and sets a real target instead.
        viewport.scrollTo({ left: cardLeft(card) - (viewport.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' });
        if (focusCard) card.focus({ preventScroll: true });
    }

    function updateState() {
        var overflowing = viewport.scrollWidth > viewport.clientWidth + 1;
        var active = activeIndex();
        var cards = active.cards;
        var closestIndex = active.index;
        var atStart = closestIndex === 0;
        var atEnd = closestIndex === cards.length - 1;

        if (prev) { prev.hidden = !overflowing; prev.disabled = atStart; }
        if (next) { next.hidden = !overflowing; next.disabled = atEnd; }
        if (fadeL) fadeL.style.opacity = (!overflowing || atStart) ? 0 : 1;
        if (fadeR) fadeR.style.opacity = (!overflowing || atEnd) ? 0 : 1;

        // --dist/--absdist and z-index drive the stack effect (panel.css,
        // #my-actions-list > li) - see My Referrals' identical addition
        // (above) for the full reasoning.
        cards.forEach(function (card, i) {
            card.classList.toggle('is-active', i === closestIndex);
            var dist = i - closestIndex;
            card.style.setProperty('--dist', dist);
            card.style.setProperty('--absdist', Math.abs(dist));
            // See My Referrals' identical change (wireReferralCarouselInteractions,
            // above) for why this is capped rather than left at 100.
            card.style.zIndex = String(Math.max(1, 10 - Math.abs(dist)));
        });

        var dots = wrap.parentNode.querySelectorAll('.action-carousel-dot');
        dots.forEach(function (dot, i) {
            var isActive = i === closestIndex;
            dot.classList.toggle('active', isActive);
            dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        if (countLabel && cards.length > 1) {
            countLabel.textContent = (closestIndex + 1) + ' / ' + cards.length;
            countLabel.classList.add('has-cards');
            countLabel.classList.toggle('many-cards', cards.length > CAROUSEL_COUNT_LABEL_THRESHOLD);
        } else if (countLabel) {
            countLabel.classList.remove('has-cards', 'many-cards');
        }

        if (liveRegion && cards.length > 1 && closestIndex !== lastAnnouncedIndex) {
            lastAnnouncedIndex = closestIndex;
            liveRegion.textContent = 'Action ' + (closestIndex + 1) + ' of ' + cards.length;
        }
    }

    if (prev) prev.addEventListener('click', function () { goTo(activeIndex().index - 1, true); });
    if (next) next.addEventListener('click', function () { goTo(activeIndex().index + 1, true); });
    viewport.addEventListener('scroll', updateState);
    window.addEventListener('resize', function () {
        goTo(activeIndex().index, false);
        updateState();
    });
    wrap.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); goTo(activeIndex().index + 1, true); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(activeIndex().index - 1, true); }
    });

    var isPointerDown = false;
    var dragMoved = false;
    var startX = 0;
    var startScrollLeft = 0;
    var lastSampleScrollLeft = 0;
    var lastSampleTime = 0;
    var flingVelocity = 0;
    viewport.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch') return;
        // See My Referrals' identical guard (wireReferralCarouselInteractions,
        // above) for why - a real control needs its own pointerdown/click
        // untouched, not hijacked into a drag-to-scroll start.
        if (e.target.closest('button, a, form')) return;
        e.preventDefault();
        isPointerDown = true;
        dragMoved = false;
        startX = e.clientX;
        startScrollLeft = viewport.scrollLeft;
        lastSampleScrollLeft = viewport.scrollLeft;
        lastSampleTime = performance.now();
        flingVelocity = 0;
    });
    viewport.addEventListener('pointermove', function (e) {
        if (!isPointerDown) return;
        var dx = e.clientX - startX;
        // setPointerCapture only once an actual drag starts, not on every
        // pointerdown - capturing immediately retargeted the eventual
        // click event to the viewport itself rather than whatever card was
        // actually under the pointer (confirmed empirically:
        // document.elementFromPoint found the right <li>, but the click
        // event's own target was the <ul>), silently breaking "click a
        // peeking card to activate it" for any tap/click that never moved
        // (live feedback: "can selecting a non active card activate that
        // card"). A real drag still needs capture so tracking continues
        // even if the pointer leaves the element's bounds mid-drag.
        if (!dragMoved && Math.abs(dx) > 5) {
            dragMoved = true;
            viewport.classList.add('is-grabbing');
            viewport.setPointerCapture(e.pointerId);
        }
        if (dragMoved) {
            viewport.scrollLeft = startScrollLeft - dx;
            var now = performance.now();
            var dt = now - lastSampleTime;
            if (dt > 8) {
                flingVelocity = (viewport.scrollLeft - lastSampleScrollLeft) / dt;
                lastSampleScrollLeft = viewport.scrollLeft;
                lastSampleTime = now;
            }
        }
    });
    function endPointerDrag() {
        isPointerDown = false;
        viewport.classList.remove('is-grabbing');
        if (dragMoved) {
            // See My Referrals' identical change (wireReferralCarouselInteractions,
            // above) for why this projects+settles via goTo rather than a
            // plain momentum scrollBy.
            var distance = 0;
            if (Math.abs(flingVelocity) > 0.05) {
                var cap = step() * 1.5;
                distance = Math.max(-cap, Math.min(cap, flingVelocity * 220));
            }
            var projectedCenter = viewport.scrollLeft + distance + viewport.clientWidth / 2;
            var cards = visibleCards();
            var settleIndex = 0;
            var settleDist = Infinity;
            cards.forEach(function (card, i) {
                var d = Math.abs((cardLeft(card) + card.offsetWidth / 2) - projectedCenter);
                if (d < settleDist) { settleDist = d; settleIndex = i; }
            });
            goTo(settleIndex, false);
        }
        flingVelocity = 0;
    }
    viewport.addEventListener('pointerup', endPointerDrag);
    viewport.addEventListener('pointercancel', endPointerDrag);
    viewport.addEventListener('click', function (e) {
        // See #my-referrals-list's own identical guard (wireReferralCarousel
        // Interactions, above) for why - same fix, same bug.
        if (!window.matchMedia('(max-width: 1180px)').matches) return;
        if (dragMoved) { e.preventDefault(); e.stopPropagation(); dragMoved = false; return; }
        // See #my-referrals-list's own identical guard for why - the status
        // segmented control (Incomplete/Complete/Not Required) is a real
        // control too, same reasoning.
        if (e.target.closest('button, a, form')) return;
        var li = e.target.closest('li');
        if (!li || li.classList.contains('action-carousel-spacer')) return;
        var cards = visibleCards();
        var idx = cards.indexOf(li);
        if (idx === -1 || idx === activeIndex().index) return;
        e.preventDefault();
        e.stopPropagation();
        goTo(idx, true);
    }, true);

    window.updateActionCarouselState = updateState;
    // true (not false) - see My Referrals' identical change
    // (wireReferralCarouselInteractions, above) for why. Also re-centres
    // after every status-change refresh (refreshMyActionsCard calls this
    // again fresh) - consistent with "the active card is always front and
    // centre" being the whole point of the stack effect, not just its
    // first-load state.
    rebuildActionCarousel(true);
}

function rebuildActionCarousel(resetScroll) {
    var dotsContainer = document.querySelector('[data-action-dots]');
    var viewport = document.getElementById('my-actions-list');
    if (!dotsContainer || !viewport) return;

    // Same coordinate-origin fix as rebuildReferralCarousel's own cardLeft
    // (above).
    function cardLeft(card) {
        return card.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft;
    }

    var cards = Array.prototype.filter.call(viewport.children, function (li) {
        return li.style.display !== 'none' && !li.classList.contains('empty-note')
            && !li.classList.contains('action-carousel-spacer');
    });
    // Same :first-child-vs-first-visible fix as rebuildReferralCarousel's
    // own identical change (above) - see there for the full reasoning.
    cards.forEach(function (card, i) {
        card.style.marginLeft = i === 0 ? '0px' : '';
    });
    // Deferred one frame - see rebuildReferralCarousel's own identical
    // change for why.
    if (resetScroll && cards[0]) {
        requestAnimationFrame(function () {
            viewport.scrollTo({ left: cardLeft(cards[0]) - (viewport.clientWidth - cards[0].offsetWidth) / 2 });
            if (window.updateActionCarouselState) window.updateActionCarouselState();
        });
    }

    dotsContainer.innerHTML = '';
    if (cards.length > 1 && cards.length <= CAROUSEL_COUNT_LABEL_THRESHOLD) {
        cards.forEach(function (card, i) {
            var dot = document.createElement('button');
            dot.type = 'button';
            dot.setAttribute('role', 'tab');
            dot.className = 'action-carousel-dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
            dot.setAttribute('aria-label', 'Go to action ' + (i + 1) + ' of ' + cards.length);
            dot.addEventListener('click', function () {
                // Explicit scrollLeft, not scrollIntoView - see goTo's own
                // identical change (wireReferralCarouselInteractions, above)
                // for why.
                viewport.scrollTo({ left: cardLeft(card) - (viewport.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' });
                card.focus({ preventScroll: true });
            });
            dotsContainer.appendChild(dot);
        });
    }
    if (window.updateActionCarouselState) window.updateActionCarouselState();
}

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
    window.initSelectable(freshCard);
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
        // The old row's own "More" overflow dropdown (static/js/main.js) went
        // away with it — re-init on the fresh row rather than leaving narrow
        // viewports without one.
        window.setupOverflowTabs(newTabRow);
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
