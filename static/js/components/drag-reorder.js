/* Promoted out of panel.js (#211, ADR 0020, taxonomy.md §3) as
   initDragReorder - renamed from initAgendaDragDrop on the way out (it was
   never actually agenda-specific; "agenda" was just the first caller).
   Generic drag-and-drop for moving rows between/within any number of
   named zones: one "sink" zone supports live reordering, any number of
   "pool" zones are add sources and double as remove targets when
   something is dragged back out of the sink. Dropped rows are never
   mutated directly - every drop either persists a new order (no reload,
   the drag already left the DOM in the right shape) or calls the
   caller-supplied form_action the existing Add/Remove buttons already
   use, then refreshes so counts/tabs/empty-states stay in sync.

   options.removeAction has no default any more (taxonomy.md §3: "already
   parameterised; drop the removeAction default") - the old
   'remove_referral_from_agenda' fallback was Inclusion Panel's own
   action name leaking into an otherwise generic module, and both actual
   callers (meeting_agenda.html, meeting_setup.html) already pass it
   explicitly.

   Still also set on `window` as both initDragReorder and the pre-rename
   initAgendaDragDrop: meeting_agenda.html/meeting_setup.html's own inline
   <script> blocks call it from a plain DOMContentLoaded handler, which
   this repo's convention (see doc-conventions.md's "inline template
   scripts" rule, #203) hasn't relocated yet - the old name stays a
   working alias rather than a silent break for whichever call site isn't
   updated to the new one in the same pass. flash/shrinkAndFadeOut/growIn/
   cancelRowAnim/ROW_ANIM_DURATION/ROW_ANIM_EASING/diffPatchRowList/
   pulseCount import from their real homes now that they have one;
   enhanceSelect stays window.* - it's still main.js's, unsplit (#213). */

import { flash } from './flash.js';
import { shrinkAndFadeOut, growIn, cancelRowAnim, ROW_ANIM_DURATION, ROW_ANIM_EASING } from './row-animate.js';
import { diffPatchRowList } from './row-list-patch.js';
import { pulseCount } from './tabs.js';

export function initDragReorder(zoneConfig, options) {
    options = options || {};
    var removeAction = options.removeAction;
    var zones = {};
    var dragged = null;

    // A single shared "drop here" bar, moved to wherever the pointer is
    // hovering in a sink list - shown instead of live-reordering the actual
    // rows during drag, so the list doesn't visibly swap/shuffle around
    // until the drop actually happens.
    var dropIndicator = document.createElement('div');
    dropIndicator.className = 'drop-indicator';

    function removeIndicator() {
        if (dropIndicator.parentNode) dropIndicator.parentNode.removeChild(dropIndicator);
    }

    Object.keys(zoneConfig).forEach(function (name) {
        var el = document.querySelector('[data-drop-zone="' + name + '"]');
        if (!el) return;
        zones[name] = {
            el: el,
            role: zoneConfig[name].role === 'sink' ? 'sink' : 'pool',
            addAction: zoneConfig[name].addAction,
        };
    });
    var zoneNames = Object.keys(zones);
    if (!zoneNames.length) return;

    function csrfToken() {
        var input = document.querySelector('input[name="csrfmiddlewaretoken"]');
        return input ? input.value : '';
    }

    function postForm(body) {
        body.append('csrfmiddlewaretoken', csrfToken());
        return fetch(window.location.pathname, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: body,
        });
    }

    // Fires a plain <form> submit (Add/Remove buttons) over fetch instead of
    // letting the browser navigate, so it can run *alongside* the row's
    // shrink/fade animation (via Promise.all below) rather than only
    // starting once that animation has already finished.
    function submitFormAsync(form) {
        return fetch(form.action || window.location.pathname, {
            method: (form.method || 'POST').toUpperCase(),
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: new FormData(form),
        });
    }

    // growIn runs *after* a column has already been swapped (flashAcrossZones
    // calls it at the tail end of applyFreshDoc, on the freshly-inserted
    // row), so it needs to register with this closure's column swap gate
    // (see beginColumnAnim) for the duration of the grow-in - without this a
    // second, unrelated action landing on this same column while this row is
    // still mid-grow would see no pending animation to wait for and swap the
    // column again immediately, tearing this row back out before it ever
    // finished appearing. The shared top-level growIn() has no knowledge of
    // this closure's column-gate machinery, so this thin wrapper is the one
    // agenda-specific call site that still needs it.
    function growInWithColumnGate(el) {
        var release = beginColumnAnim(el.closest('.setup-col'));
        return growIn(el).then(function () {
            release();
        });
    }

    // FLIP-style slide: el has already been moved to its new DOM position by
    // the time this is called - oldRect is where it used to sit on screen.
    // Animates a translateY from that old offset back down to 0, i.e. the
    // row visibly travels from where it was to where it now is. Used for the
    // up/down arrow swap, where two adjacent rows trade places - sliding both
    // of them past each other reads as an obvious "swap" the way the
    // shrink/grow-in-place treatment (built for rows entering/leaving a list
    // entirely) doesn't, since here neither row's height/opacity/position in
    // the list is really changing except by one slot.
    //
    // Every animating row gets an explicit solid background for the
    // duration of the slide - .entity-row has none of its own (it relies on
    // the shared .entity-list background showing through), so any row
    // without an opaque fill would let whatever's stacked behind it bleed
    // through as it crosses paths with another sliding row. This isn't only
    // the primary row vs. its neighbour: a multi-row drag reorder can shift
    // several rows at once, and any two of *those* can cross each other too.
    // onTop, if passed, additionally lifts this one row above every other
    // (via z-index) - only the actively-dragged/clicked row needs that, so
    // it stays visually on top of whichever rows it happens to pass over.
    function slideRow(el, oldRect, onTop) {
        if (!el) return;
        cancelRowAnim(el);
        var newRect = el.getBoundingClientRect();
        var deltaY = oldRect.top - newRect.top;
        el.style.background = 'var(--bg-surface)';
        if (onTop) {
            el.style.position = 'relative';
            el.style.zIndex = '1';
        }
        function clearStyles() {
            el.style.background = '';
            if (onTop) { el.style.position = ''; el.style.zIndex = ''; }
        }
        if (!deltaY) {
            clearStyles();
            return;
        }
        var anim = el.animate([
            { transform: 'translateY(' + deltaY + 'px)' },
            { transform: 'translateY(0)' },
        ], { duration: ROW_ANIM_DURATION, easing: ROW_ANIM_EASING, fill: 'forwards' });
        el._rowAnim = anim;
        var finished = false;
        function finish() {
            if (finished) return;
            finished = true;
            // Only clear these styles if this is still the row's current
            // animation. If a second move landed on this same row (e.g.
            // dragged again, or swapped a second time) before this one
            // finished, cancelRowAnim() above would have already cancelled
            // this animation from *that* newer call - its own cancel event
            // still fires here, asynchronously, but by then el._rowAnim
            // points at the newer animation and its own styles are the ones
            // that should stay in place. Without this guard, this stale
            // finish() would wipe out the newer animation's solid background
            // out from under it mid-flight - exactly the "transparency shows
            // up sometimes" symptom, only when two moves overlapped in time.
            var isCurrent = el._rowAnim === anim;
            if (isCurrent) el._rowAnim = null;
            anim.cancel();
            if (isCurrent) clearStyles();
        }
        anim.onfinish = finish;
        anim.oncancel = finish;
        setTimeout(finish, ROW_ANIM_DURATION + 150);
    }

    // Re-finds a row by referral id across the given zones (post-refresh, so
    // it's whatever fresh element now represents that referral) and flashes
    // it - the in-page replacement for the old sessionStorage-based
    // flash-after-reload handoff, now that nothing actually reloads. Scoped
    // to just the zones that were actually just swapped (not all of them) -
    // otherwise, while a deferred zone still holds the old, mid-shrink
    // version of the same referral (see refreshZonesAfter), this would find
    // it too and wrongly grow it back in, cancelling its own shrink.
    //
    // info.kind picks the flash colour (green 'added'/red 'removed') and is
    // purely about how the action reads, independent of info.grow (whether
    // this reappearing row should also grow-in) - e.g. Remove reappears the
    // referral back in Referral Selection, which still needs to grow in, but
    // that's a removal from the agenda, so it should flash red, not green.
    function flashAcrossZones(info, names) {
        var growPromises = [];
        if (!info) return growPromises;
        (names || zoneNames).forEach(function (name) {
            rowsIn(zones[name]).forEach(function (row) {
                var referralId = row.dataset.referralId || row.dataset.dropId;
                if (referralId !== info.id) return;
                flash(row, info.kind);
                if (info.grow) growPromises.push(growInWithColumnGate(row));
            });
        });
        return growPromises;
    }

    // Fetches this same page fresh (does not touch the DOM yet).
    function fetchFreshDoc() {
        return fetch(window.location.pathname, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (resp) { return resp.text(); })
            .then(function (html) { return new DOMParser().parseFromString(html, 'text/html'); });
    }

    // Applies a freshly-fetched document's state for the given zone names,
    // instead of a full window.location.reload() - keeps counts/tabs/order
    // in sync with the server without the jarring full-page flash. Used to
    // replace the whole owning .setup-col wholesale (oldCol.replaceWith),
    // which meant tearing out and recreating every row in that column - tab
    // buttons, drag zones, everything - on every single Add/Remove/reorder,
    // even the rows nothing about this action touched. Now diff-patches just
    // each zone's own row list (diffPatchRowList, keyed on
    // data-drop-id) in place instead: a row this action didn't touch keeps
    // its exact DOM node - and any shrink/grow animation still playing on it
    // from a *different*, concurrent action - rather than being destroyed
    // and rebuilt from the fresh HTML (see grilling session 2026-07-12).
    // Since the column itself is never replaced anymore, the tab/active-card
    // carry-over hacks below used to need (freshCol always rendering with
    // the template's hardcoded defaults) simply don't apply - the live
    // column's own state was never disturbed to begin with. Same reasoning
    // for zone.el and each row's drag listeners: they're bound once (init /
    // first insertion) and stay valid for as long as the node they're bound
    // to stays in the document, which - for anything this diff-patch left
    // untouched - is indefinitely.
    function applyFreshDoc(doc, flashInfo, names) {
        names = names || zoneNames;
        var growPromises = [];
        var patchedCols = [];
        names.forEach(function (name) {
            var freshZoneEl = doc.querySelector('[data-drop-zone="' + name + '"]');
            var oldZoneEl = zones[name].el;
            if (!freshZoneEl || !oldZoneEl) return;
            growPromises = growPromises.concat(
                diffPatchRowList(oldZoneEl, freshZoneEl, 'data-drop-id', function (row) { bindRow(row, name); })
            );
            // freshZoneEl's <select>s (Priority, etc.) are plain DOMParser
            // output, never run through enhanceSelect - enhanceSelect is
            // idempotent (its own _uiSelect guard), so it's safe to call
            // broadly here rather than tracking exactly which rows the diff
            // just touched.
            if (window.enhanceSelect) {
                oldZoneEl.querySelectorAll('select').forEach(window.enhanceSelect);
            }

            var oldCol = oldZoneEl.closest('.setup-col') || oldZoneEl;
            if (patchedCols.indexOf(oldCol) !== -1) return;
            patchedCols.push(oldCol);
            var freshCol = freshZoneEl.closest('.setup-col') || freshZoneEl;
            // Tab/heading counts (INT-M2) live in the column's header/tab-row, not
            // inside the zone element itself - sync them directly from the
            // fresh doc now that a whole-column swap doesn't bring them
            // along for free.
            oldCol.querySelectorAll('[data-count-key]').forEach(function (el) {
                var key = el.dataset.countKey;
                var freshEl = freshCol.querySelector('[data-count-key="' + key + '"]');
                if (!freshEl) return;
                var oldCount = parseInt(el.dataset.count, 10) || 0;
                var newCount = parseInt(freshEl.dataset.count, 10) || 0;
                if (oldCount === newCount) return;
                el.dataset.count = String(newCount);
                var countEl = el.classList.contains('count') ? el : el.querySelector('.count');
                if (countEl) {
                    countEl.textContent = '(' + newCount + ')';
                    pulseCount(countEl, newCount > oldCount ? 'up' : 'down');
                }
            });
        });
        return growPromises.concat(flashAcrossZones(flashInfo, names));
    }

    // --- Column swap serialization ---------------------------------------
    // A column's zones must never be re-fetched-and-diff-patched (see
    // applyFreshDoc above) while any row inside them is still mid
    // shrink/grow - whether that animation belongs to the same action that's
    // asking to apply this fetch, or a *different*, concurrent one (e.g.
    // Remove's immediate "referral reappears in the pool" swap racing an
    // unrelated Add whose pool row is still shrinking away in that very same
    // column). Applying early cuts the other animation short - the row
    // doesn't finish fading, it just vanishes. Every swap request, whether
    // it would previously have been "immediate" or "deferred", is funnelled
    // through requestSwap()/flushColumn() below, keyed by column, so a
    // fetch+apply only ever actually happens once nothing in that column is
    // animating. This still matters even though applyFreshDoc's own diff no
    // longer destroys untouched rows - fetchFreshDoc() re-reads the entire
    // page's server state, so two overlapping fetches for the same column
    // would still risk the older one's snapshot landing after, and
    // overwriting, whatever the newer one already applied.
    function columnState(col) {
        if (!col._swapState) col._swapState = { pendingAnims: 0, flushing: false, names: [], flashes: [], pendingFlush: null, resolvePendingFlush: null };
        return col._swapState;
    }

    // Call once right when a row's shrink/grow starts in this column, and
    // resolve the returned "done" function once that row's own animDone
    // fires. Any swap requested for this column while the count is above
    // zero is queued rather than applied immediately.
    function beginColumnAnim(col) {
        if (!col) return function () { };
        columnState(col).pendingAnims += 1;
        var released = false;
        return function () {
            if (released) return;
            released = true;
            var state = columnState(col);
            state.pendingAnims -= 1;
            if (state.pendingAnims <= 0) {
                state.pendingAnims = 0;
                maybeFlush(col);
            }
        };
    }

    // Every add/remove/drag action fires its own POST *immediately*, in
    // parallel with every other one in flight - nothing waits its turn to
    // even start. What still has to be serialized, per column, is the
    // fetchFreshDoc()-and-swap that follows: fetchFreshDoc() re-fetches the
    // *entire* page's current server state, so if two of those requests for
    // the same column were ever genuinely in flight at once, whichever
    // resolves last would win regardless of which action actually finished
    // last server-side - stomping the other's freshly-applied change with a
    // snapshot that might predate it. `flushing` extends the existing
    // pendingAnims gate to cover that fetch+apply window too, so a second
    // action landing on the same column while one is already being applied
    // coalesces into the next flush instead of racing it. This never blocks
    // a *click*, an action's own row animation, or its POST - only when a
    // same-column swap actually lands.
    function maybeFlush(col) {
        var state = columnState(col);
        if (state.pendingAnims <= 0 && !state.flushing && state.names.length) flushColumn(col);
    }

    function flushColumn(col) {
        var state = columnState(col);
        if (!state.names.length) return Promise.resolve();
        var names = state.names;
        var flashes = state.flashes;
        // Any requestSwap() call(s) that arrived while this column was still
        // busy (see below) are waiting on this same promise, not their own -
        // resolve it once this flush (fetch + swap + every grow-in it
        // triggers) genuinely finishes, not when it merely gets kicked off.
        var resolvePendingFlush = state.resolvePendingFlush;
        state.names = [];
        state.flashes = [];
        state.pendingFlush = null;
        state.resolvePendingFlush = null;
        state.flushing = true;
        return fetchFreshDoc().then(function (doc) {
            var growPromises = applyFreshDoc(doc, flashes[0] || null, names);
            for (var i = 1; i < flashes.length; i++) growPromises = growPromises.concat(flashAcrossZones(flashes[i], names));
            // Waiting on these here (rather than letting flushColumn's own
            // promise resolve the instant the swap lands) is what makes the
            // grow-in animation count as part of "this flush is still
            // settling", so a same-column action that arrived mid-flush
            // stays coalesced into the *next* flush rather than being able
            // to sneak its own fetch in during the grow-in.
            return Promise.all(growPromises);
        }).then(function () {
            state.flushing = false;
            if (resolvePendingFlush) resolvePendingFlush();
            // Anything that landed on this column while this flush was in
            // flight got queued (see requestSwap's `flushing` check below)
            // rather than starting its own racing fetch - drain it now,
            // exactly like beginColumnAnim's release() drains whatever
            // queued up while a row was animating.
            maybeFlush(col);
        });
    }

    // Queues these names (and optional flashInfo) to swap on their owning
    // column - swaps right away if nothing's currently animating or being
    // applied there, otherwise waits for whatever's in flight (a row
    // animation via beginColumnAnim, or another flush via flushColumn) to
    // finish, at which point flushColumn() fetches fresh (so it always
    // reflects every action that completed in the meantime, not just the
    // one that happened to trigger this particular call) and applies every
    // queued name/flash together in one swap.
    function requestSwap(col, names, flashInfo) {
        var state = columnState(col);
        names.forEach(function (n) { if (state.names.indexOf(n) === -1) state.names.push(n); });
        if (flashInfo) state.flashes.push(flashInfo);
        if (state.pendingAnims > 0 || state.flushing) {
            // Deferred - maybeFlush() will pick this up once the column is
            // actually free, at some later point this function has no
            // direct handle on. Returning early here (rather than waiting
            // for the swap this call just queued to actually happen) would
            // let whichever action triggered *this* call consider itself
            // fully settled while a third action's swap could still land in
            // the meantime. Returning the same pending promise every
            // deferred caller for this column shares means they all
            // correctly wait for that eventual flush instead.
            if (!state.pendingFlush) {
                state.pendingFlush = new Promise(function (resolve) { state.resolvePendingFlush = resolve; });
            }
            return state.pendingFlush;
        }
        return flushColumn(col);
    }

    // Groups zone names by their owning .setup-col (two zone names, e.g.
    // "new-referrals"/"followups", can share one physical column - the
    // tabbed Referral Selection panel) and requests a swap for each group.
    function requestSwapAll(names, flashInfo) {
        var cols = [];
        var colNames = [];
        names.forEach(function (name) {
            var zoneEl = zones[name].el;
            var col = zoneEl && (zoneEl.closest('.setup-col') || zoneEl);
            if (!col) return;
            var idx = cols.indexOf(col);
            if (idx === -1) { cols.push(col); colNames.push([name]); }
            else colNames[idx].push(name);
        });
        return Promise.all(cols.map(function (col, i) { return requestSwap(col, colNames[i], flashInfo); }));
    }

    // For actions with no local row animation to protect (reorder fallback,
    // drag-add's source side) - still goes through requestSwap so it queues
    // behind any *other*, unrelated action's row that happens to be
    // animating in the same column, instead of swapping straight away
    // regardless.
    function refreshZones(flashInfo) {
        return requestSwapAll(zoneNames, flashInfo);
    }

    // A pool row carries its own origin (see _referral_selection_row.html's
    // data-add-action) regardless of which zone/tab it's currently shown
    // under - lets a row leaving any of Referral Selection's three zones
    // (All, New, Reviews Due) resolve which specific count-key(s) it affects
    // without this file needing to know Referral Selection's own domain
    // vocabulary beyond this one lookup.
    var ADD_ACTION_TO_COUNT_KEY = { add_referral: 'new', add_followup_to_agenda: 'followup' };

    // The increase side of an Add/Remove already pulses immediately (the
    // *other* column's swap isn't gated - see refreshZonesAfter below). The
    // decrease side used to wait out the full ~900ms shrink-out before its
    // count changed at all, since that's genuinely how long the column swap
    // that carries the new number is held off (see beginColumnAnim below) -
    // correct for the DOM swap, but read as a laggy, asymmetric pulse next to
    // the instant increase. This settles the count(s) the instant the row
    // starts leaving, ahead of the real swap: by the time that swap lands,
    // the freshly-fetched number already matches what's showing, so nothing
    // re-pulses - it's a genuine early decrement, not a fake one that gets
    // corrected later.
    function optimisticallyDecrementCounts(row, col) {
        if (!col) return;
        var keyEls = col.querySelectorAll('[data-count-key]');
        if (!keyEls.length) return;
        var targetKeys;
        if (row.dataset.addAction) {
            var originKey = ADD_ACTION_TO_COUNT_KEY[row.dataset.addAction];
            targetKeys = originKey ? ['all', originKey] : ['all'];
        } else if (keyEls.length === 1) {
            // A column with a single count (Panel Agenda's heading, Meeting
            // Agenda's Students Pending heading) - unambiguous, no per-row
            // classification needed.
            targetKeys = [keyEls[0].dataset.countKey];
        } else {
            return;
        }
        keyEls.forEach(function (el) {
            if (targetKeys.indexOf(el.dataset.countKey) === -1) return;
            var oldCount = parseInt(el.dataset.count, 10) || 0;
            var newCount = Math.max(0, oldCount - 1);
            el.dataset.count = String(newCount);
            var countEl = el.classList.contains('count') ? el : el.querySelector('.count');
            if (countEl) {
                countEl.textContent = '(' + newCount + ')';
                pulseCount(countEl, 'down');
            }
        });
    }

    // Starts a row's local shrink-out animation *and* registers it with the
    // column swap gate in the same synchronous tick (see beginColumnAnim) -
    // both have to happen together, with nothing async in between. Doing the
    // registration later (refreshZonesAfter used to call beginColumnAnim
    // itself, once this action's own POST had resolved) left a gap between
    // "row visibly starts shrinking" and "column is marked busy" that a
    // second, faster click's swap could land in and still see the column as
    // idle - discarding this row mid-animation instead of waiting for it.
    // Returns the column (for refreshZonesAfter to skip flashing it) and the
    // animDone promise (already wired to release the column once it
    // settles).
    function startRowRemoval(row) {
        var col = row.closest('.setup-col');
        optimisticallyDecrementCounts(row, col);
        var release = beginColumnAnim(col);
        var animDone = new Promise(function (resolve) { shrinkAndFadeOut(row, resolve); });
        animDone.then(release);
        return { col: col, animDone: animDone };
    }

    // For actions that also shrink a row locally (Add/Remove buttons,
    // drag-remove/drag-add). The animating row's own column (registered via
    // startRowRemoval above, before this function is even called) is only
    // actually swapped once animDone fires and no other concurrent animation
    // in that column is still running - so the row keeps shrinking
    // undisturbed, in its normal layout position, right where it already is,
    // rather than being pulled into a separate overlay to fake the overlap.
    // Every other column swaps through the same requestSwap path, so it
    // still applies promptly (letting the row reappearing elsewhere, e.g.
    // back in Referral Selection after Remove, flash+grow immediately)
    // unless something else happens to be animating there too.
    function refreshZonesAfter(animatingCol, flashInfo) {
        return Promise.all(zoneNames.reduce(function (acc, name) {
            var zoneEl = zones[name].el;
            var col = zoneEl && (zoneEl.closest('.setup-col') || zoneEl);
            if (!col) return acc;
            var entry = acc.filter(function (e) { return e.col === col; })[0];
            if (!entry) { entry = { col: col, names: [] }; acc.push(entry); }
            entry.names.push(name);
            return acc;
        }, []).map(function (entry) {
            // The animating row's own column never gets flashInfo (nothing
            // there needs a flash/grow - it's the row that's leaving,
            // already handled by its own local shrink animation) and relies
            // purely on beginColumnAnim/release above to know when it's
            // safe to swap. Every other column swaps with flashInfo intact,
            // subject to whatever's already queued/animating on it.
            return requestSwap(entry.col, entry.names, entry.col === animatingCol ? null : flashInfo);
        }));
    }

    // The Add/Remove/Priority-up-down buttons are plain <form> submits - this
    // intercepts them so they go through the same fetch + refreshZones path
    // as drag-and-drop, instead of a full browser navigation.
    var FORM_ACTION_KIND = {
        add_referral: 'added',
        add_followup_to_agenda: 'added',
    };
    var REMOVE_ACTIONS = ['remove_referral_from_agenda', 'unassign_referral'];

    // Add/Remove (button or drag) starts a row shrinking immediately and
    // fires its POST immediately too - every action's own click and network
    // request go out in parallel with everyone else's, nothing waits its
    // turn. The only thing serialized is the eventual column swap, and only
    // per-column: see the `flushing` gate on requestSwap/flushColumn above,
    // which coalesces same-column swaps together instead of racing two
    // fetchFreshDoc() calls against each other.

    function wirePlainFormFlash() {
        document.addEventListener('submit', function (e) {
            // The Remove form's onsubmit="return confirm(...)" cancels the
            // submit (and thus this event) when the user backs out - skip
            // animating/queuing a flash for an action that didn't happen.
            if (e.defaultPrevented) return;
            var form = e.target;
            var actionInput = form.querySelector('input[name="form_action"]');
            var actionValue = actionInput && actionInput.value;
            var row = form.closest('[draggable="true"]');
            if (!row) return;
            var referralId = row.dataset.referralId || row.dataset.dropId;
            if (actionValue === 'update_priority') {
                // The trigger's own colour/label already updated the instant
                // the popover option was clicked (see enhanceSelect's
                // render() in main.js) - this just persists it in the
                // background, no page navigation or zone refresh needed.
                e.preventDefault();
                submitFormAsync(form);
                return;
            }
            if (REMOVE_ACTIONS.indexOf(actionValue) !== -1) {
                e.preventDefault();
                // A quick second click on this same row's Remove button,
                // before the row has actually left the DOM, used to restart
                // the shrink from scratch (cancelRowAnim inside
                // startRowRemoval/shrinkAndFadeOut cancels the first
                // in-flight animation and measures fresh) - visually that's a
                // snap back to full size for a frame before the second
                // animation takes over, which read as "the click didn't
                // register", and also fired a second, redundant remove
                // request for a row the server was already removing. Once a
                // row is being removed, further clicks on it are ignored
                // outright instead.
                if (row._rowBusy) return;
                row._rowBusy = true;
                flash(row, 'removed');
                // Row's shrink-out - and its column-gate registration - start
                // right here, synchronously, rather than waiting on the
                // submit (see startRowRemoval). The DOM swap (once the submit
                // resolves) doesn't wait for the shrink to finish either -
                // see refreshZonesAfter, which keeps this row alive as a
                // ghost so the swap can happen immediately without cutting it
                // short.
                var removal = startRowRemoval(row);
                submitFormAsync(form).then(function () {
                    // The referral reappears in its pool list (Referral
                    // Selection) once zones refresh - grow it in there too,
                    // not just a silent reappearance, flashing red (not
                    // green) since this is still fundamentally a removal.
                    return refreshZonesAfter(removal.col, { id: referralId, kind: 'removed', grow: true });
                }).then(function () { row._rowBusy = false; }, function () { row._rowBusy = false; });
                return;
            }
            if (FORM_ACTION_KIND[actionValue] === 'added') {
                // Same shrink-and-fade treatment as Remove, so the row leaving
                // the pool list reads as a deliberate action instead of just
                // vanishing the instant the page refreshes.
                e.preventDefault();
                // Same double-click guard as Remove above.
                if (row._rowBusy) return;
                row._rowBusy = true;
                flash(row, 'added');
                var addRemoval = startRowRemoval(row);
                submitFormAsync(form).then(function () {
                    return refreshZonesAfter(addRemoval.col, { id: referralId, kind: 'added', grow: true });
                }).then(function () { row._rowBusy = false; }, function () { row._rowBusy = false; });
                return;
            }
            if (actionValue === 'move_agenda_referral') {
                // Click-based up/down fallback for reordering - the swap is
                // always with the immediate sibling, so (unlike Add/Remove,
                // which need the server's response to know what changed) the
                // new position is already known client-side, and no full
                // zone refresh is needed since nothing but these two rows'
                // positions actually changed. Both rows slide past each
                // other (slideRow) rather than the moved row just
                // shrinking/growing back in roughly the same spot - a literal
                // swap reads as a much more obvious "these two traded places"
                // than a barely-there shrink/grow at an almost identical
                // position would.
                e.preventDefault();
                var zoneEl = row.closest('[data-drop-zone]');
                var direction = form.querySelector('input[name="direction"]');
                direction = direction && direction.value;
                var sibling = direction === 'up' ? row.previousElementSibling : row.nextElementSibling;
                if (zoneEl && sibling) {
                    var zone = zones[zoneEl.dataset.dropZone];
                    var rowOldRect = row.getBoundingClientRect();
                    var siblingOldRect = sibling.getBoundingClientRect();
                    zoneEl.insertBefore(row, direction === 'up' ? sibling : sibling.nextElementSibling);
                    renumber(zone);
                    slideRow(row, rowOldRect, true);
                    slideRow(sibling, siblingOldRect);
                }
                submitFormAsync(form);
            }
        });
    }

    function rowsIn(zone) {
        return Array.prototype.slice.call(zone.el.querySelectorAll(':scope > [draggable="true"]'));
    }

    function rowAfter(zone, y) {
        return rowsIn(zone).filter(function (row) { return row !== dragged.el; }).reduce(function (closest, row) {
            var box = row.getBoundingClientRect();
            var offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) return { offset: offset, element: row };
            return closest;
        }, { offset: -Infinity, element: null }).element;
    }

    function renumber(zone) {
        var rows = rowsIn(zone);
        rows.forEach(function (row, index) {
            var numberEl = row.querySelector('.agenda-order-rail-number');
            if (numberEl) numberEl.textContent = index + 1;
            // The up/down buttons' disabled state is only ever set
            // server-side, at initial render, based on forloop.first/
            // forloop.last. Any reorder that happens purely client-side
            // (arrows, drag) needs to refresh it too, or a row that's no
            // longer first/last is stuck with a disabled arrow that should
            // now be enabled (and vice versa) until the next full page load -
            // e.g. moving the first item down used to leave its up arrow
            // disabled forever. Selected by their hidden `direction` input
            // rather than position, since the rail's middle button (Setup's
            // agenda card) is Remove, not Down.
            var upBtn = row.querySelector('form:has(input[name="direction"][value="up"]) button');
            var downBtn = row.querySelector('form:has(input[name="direction"][value="down"]) button');
            if (upBtn) upBtn.disabled = index === 0;
            if (downBtn) downBtn.disabled = index === rows.length - 1;
        });
    }


    function persistReorder(zone) {
        var body = new URLSearchParams();
        body.append('form_action', 'reorder_agenda');
        rowsIn(zone).forEach(function (row) { body.append('panel_referral_id', row.dataset.dropId); });
        // The slide itself already played (see the drop handler, which runs
        // before this) - no flash here, since the green "added" tint is
        // reserved for a referral actually entering the agenda, not for one
        // that's simply been reordered within it.
        postForm(body);
    }

    function handleDrop(targetName, insertBeforeId) {
        var target = zones[targetName];
        var source = zones[dragged.sourceZone];
        var id = dragged.id;
        var referralId = dragged.referralId;
        if (target.role === 'sink' && source.role === 'sink') {
            persistReorder(target);
        } else if (target.role === 'sink' && source.role === 'pool') {
            var rowEl = dragged.el;
            // Same shrink-and-fade treatment as the Add button and the
            // sink->pool drag-remove case below, so the source row leaving
            // the pool list always animates the same way regardless of how
            // the add was triggered - started immediately, in parallel with
            // the request, rather than gated behind it.
            flash(rowEl, 'added');
            var removal = startRowRemoval(rowEl);
            // The new PanelReferral always lands at the bottom of the agenda
            // server-side (see _next_agenda_order) - follow up the add with
            // a reorder_agenda call that puts it where the drop indicator
            // actually was, using the id the add response hands back.
            var body = new URLSearchParams();
            // Referral Selection's "All" tab mixes New Referral and Review
            // Due rows in one zone - the row's own data-add-action
            // (set per-row in _referral_selection_row.html) tells them apart;
            // new-referrals/followups rows don't set it, so those zones fall
            // back to their single zone-level addAction as before.
            body.append('form_action', rowEl.dataset.addAction || source.addAction);
            body.append('referral_id', id);
            postForm(body).then(function (resp) { return resp.json(); }).then(function (data) {
                var newId = data && data.panel_referral_id;
                if (!newId) return Promise.resolve();
                var ids = rowsIn(target).map(function (row) { return row.dataset.dropId; });
                var insertIndex = insertBeforeId ? ids.indexOf(String(insertBeforeId)) : -1;
                // The add already landed it at the bottom server-side - if
                // that's also where the drop indicator was (insertIndex ===
                // -1, i.e. nothing to insert before), skip the extra
                // reorder_agenda round-trip entirely, so a bottom drop is
                // exactly as fast as Remove instead of paying for a request
                // that would just re-confirm the same order.
                if (insertIndex === -1) return Promise.resolve();
                ids.splice(insertIndex, 0, String(newId));
                var reorderBody = new URLSearchParams();
                reorderBody.append('form_action', 'reorder_agenda');
                ids.forEach(function (idVal) { reorderBody.append('panel_referral_id', idVal); });
                return postForm(reorderBody);
            }).then(function () {
                return refreshZonesAfter(removal.col, { id: referralId, kind: 'added', grow: true });
            });
        } else if (target.role === 'pool' && source.role === 'sink') {
            removeDraggedFromAgenda();
        }
    }

    // Pulled out of handleDrop's pool<-sink branch so the card-level
    // catch-all below (dropping anywhere on the Referral Selection card, not
    // just precisely on its row list) can reuse the exact same logic. Never
    // depends on which specific pool zone/tab received the drop - Referral
    // Selection's two zones (new-referrals/followups) share one card and
    // this same removal happens regardless of which tab is active.
    function removeDraggedFromAgenda() {
        var id = dragged.id;
        var referralId = dragged.referralId;
        var removeBody = new URLSearchParams();
        removeBody.append('form_action', removeAction);
        removeBody.append('panel_referral_id', id);
        var rowEl = dragged.el;
        flash(rowEl, 'removed');
        // Same overlap as the Remove button: the refresh fetch starts as
        // soon as the removal itself is persisted, in parallel with the
        // shrink animation, and the DOM swap doesn't wait for the shrink
        // either (refreshZonesAfter ghosts the row instead).
        var removal = startRowRemoval(rowEl);
        postForm(removeBody).then(function () {
            // Reappears back in Referral Selection - flash red (a removal),
            // not green, since nothing was actually added.
            return refreshZonesAfter(removal.col, { id: referralId, kind: 'removed', grow: true });
        });
    }

    function bindRow(row, name) {
        row.addEventListener('dragstart', function (e) {
            dragged = { el: row, sourceZone: name, id: row.dataset.dropId, referralId: row.dataset.referralId || row.dataset.dropId };
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', row.dataset.dropId || '');
            // A Panel Agenda row can only ever be dropped back onto Referral
            // Selection as a removal - arm every pool card with a subtle red
            // hint the moment it's picked up, rather than making the user
            // hover one first to discover it. bindZone's dragover/dragleave
            // layer the much louder .drag-over-remove on top of this once
            // the drag is actually over a given card.
            if (zones[name].role === 'sink') {
                zoneNames.forEach(function (n) {
                    if (zones[n].role !== 'pool') return;
                    dragOverTarget(zones[n].el).classList.add('drag-remove-armed');
                });
            } else {
                // Mirror image of the above: picking up a Referral Selection
                // row can only ever be dropped onto Panel Agenda as an add -
                // arm every sink card with the same dashed "drop here" outline
                // it would otherwise only get once actually hovered (see
                // bindZone's dragover handler, which also adds .drag-over).
                // No separate subtle/loud tiers needed here like the remove
                // case above - Add is the primary, non-destructive action, so
                // showing the full outline for the whole drag is fine.
                zoneNames.forEach(function (n) {
                    if (zones[n].role !== 'sink') return;
                    dragOverTarget(zones[n].el).classList.add('drag-add-armed');
                });
            }
        });
        row.addEventListener('dragend', function () {
            if (dragged) dragged.el.classList.remove('dragging');
            dragged = null;
            removeIndicator();
            zoneNames.forEach(function (n) {
                clearDragOver(zones[n].el);
                dragOverTarget(zones[n].el).classList.remove('drag-remove-armed', 'drag-add-armed');
            });
        });
    }

    // Highlighting the whole card (header included), not just the inner row
    // list, on pages built with that layout - so the highlight reads as
    // "drop into this container" with a shape that matches the card itself,
    // rather than one that shrinks/grows with however many rows happen to be
    // in the zone right now. Falls back to the zone element itself on pages
    // (e.g. meeting_agenda.html) that use this same drag-drop JS without
    // that column structure.
    function dragOverTarget(zoneEl) {
        return zoneEl.closest('.setup-col') || zoneEl;
    }

    // Only clears the hover-only "actually over this card right now" state -
    // .drag-remove-armed is set once for the whole drag (dragstart) and
    // cleared once for the whole drag (dragend), not on every hover in/out.
    function clearDragOver(zoneEl) {
        dragOverTarget(zoneEl).classList.remove('drag-over', 'drag-over-remove');
    }

    // Only zones panel.js actually does something with on drop should light
    // up as a target - dragging a Referral Selection row over another
    // Referral Selection tab (pool -> pool) isn't a handled case in
    // handleDrop, so it shouldn't invite a drop with a highlight either.
    function canDropInto(sourceRole, targetRole) {
        return !(sourceRole === 'pool' && targetRole === 'pool');
    }

    // Referral Selection's two zones (new-referrals/followups) share one
    // card, and dropping a Panel Agenda row anywhere on that card - not just
    // precisely on whichever row list is currently visible - should remove
    // it, matching the highlight now covering the full card. Bound once per
    // physical card element (tracked here) rather than once per zone name,
    // so a shared card doesn't end up with two listeners double-firing the
    // same removal.
    var removeDropCardsWired = new WeakSet();
    function wireCardRemoveDrop(card) {
        if (!card || removeDropCardsWired.has(card)) return;
        removeDropCardsWired.add(card);
        card.addEventListener('dragover', function (e) {
            if (!dragged || zones[dragged.sourceZone].role !== 'sink') return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            card.classList.add('drag-over', 'drag-over-remove');
        });
        card.addEventListener('dragleave', function (e) {
            if (!dragged || zones[dragged.sourceZone].role !== 'sink') return;
            // dragleave bubbles up from whichever child the pointer actually
            // left, so e.target is almost never the card itself - checking
            // relatedTarget (what's being entered) against contains() is the
            // reliable way to tell a real exit from the card apart from just
            // crossing between two of its children.
            if (card.contains(e.relatedTarget)) return;
            clearDragOver(card);
        });
        card.addEventListener('drop', function (e) {
            if (!dragged || zones[dragged.sourceZone].role !== 'sink') return;
            e.preventDefault();
            clearDragOver(card);
            removeDraggedFromAgenda();
        });
    }

    // Wires up a zone's dragover/dragleave/drop handling plus its rows -
    // called at init and again after refreshZones() swaps in fresh zone
    // elements, since listeners don't carry over to the new nodes.
    function bindZone(name) {
        var zone = zones[name];
        // Only wire the card-level catch-all when there's actually a
        // distinct .setup-col ancestor to bind it to (meeting_setup.html's
        // layout) - on pages without one (e.g. meeting_agenda.html),
        // dragOverTarget falls back to zone.el itself, and binding "the
        // card's" listener there would just be a second drop listener on
        // the same element that already has its own, double-firing the
        // removal.
        if (zone.role === 'pool') {
            var card = zone.el.closest('.setup-col');
            if (card) wireCardRemoveDrop(card);
        }

        zone.el.addEventListener('dragover', function (e) {
            if (!dragged) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            var source = zones[dragged.sourceZone];
            if (canDropInto(source.role, zone.role)) {
                var target = dragOverTarget(zone.el);
                target.classList.add('drag-over');
                // Dragging an agenda row back onto Referral Selection removes
                // it - a red "Remove" treatment rather than the usual green
                // "valid drop" one, so the action it actually performs is
                // obvious before you let go.
                target.classList.toggle('drag-over-remove', source.role === 'sink' && zone.role === 'pool');
            }
            if (zone.role === 'sink') {
                var after = rowAfter(zone, e.clientY);
                if (after == null) zone.el.appendChild(dropIndicator);
                else zone.el.insertBefore(dropIndicator, after);
            } else {
                removeIndicator();
            }
        });
        zone.el.addEventListener('dragleave', function (e) {
            // Same relatedTarget-containment check as wireCardRemoveDrop's
            // dragleave, and for the same reason - e.target here is almost
            // always whatever child row/element the pointer left, not
            // zone.el itself.
            if (zone.el.contains(e.relatedTarget)) return;
            clearDragOver(zone.el);
        });
        zone.el.addEventListener('drop', function (e) {
            e.preventDefault();
            // Stops this from also bubbling up into wireCardRemoveDrop's
            // card-level listener above, which would otherwise double-fire
            // the removal for a drop that landed precisely on the row list
            // itself (as opposed to elsewhere on the card).
            e.stopPropagation();
            clearDragOver(zone.el);
            if (!dragged) return;
            var source = zones[dragged.sourceZone];
            // Capture what row the indicator was sitting before, so an add
            // from a pool zone can tell the server where to insert the new
            // referral (see the reorder_agenda follow-up in handleDrop).
            var insertBeforeId = null;
            if (zone.role === 'sink' && dropIndicator.parentNode === zone.el) {
                var beforeRow = dropIndicator.nextElementSibling;
                insertBeforeId = beforeRow ? beforeRow.dataset.dropId : null;
            }
            // Reordering within the sink list: commit the real row to the
            // indicator's position now, so persistReorder (which reads the
            // list straight off the DOM) picks up the right order. Same
            // slide treatment as the up/down arrows: capture every row's
            // on-screen position before the move, then slide whichever ones
            // actually shifted a slot back from their old position - the
            // dragged row on top with a solid fill (it may cross several
            // rows, not just one neighbour), the displaced rows underneath -
            // instead of the dragged row just teleporting to its new spot
            // with only its own arrival animated.
            if (zone.role === 'sink' && source.role === 'sink' && dropIndicator.parentNode === zone.el) {
                var isNoOpMove = dropIndicator.previousElementSibling === dragged.el;
                if (!isNoOpMove) {
                    var oldRects = rowsIn(zone).map(function (row) { return { el: row, rect: row.getBoundingClientRect() }; });
                    zone.el.insertBefore(dragged.el, dropIndicator);
                    renumber(zone);
                    oldRects.forEach(function (entry) { slideRow(entry.el, entry.rect, entry.el === dragged.el); });
                } else {
                    zone.el.insertBefore(dragged.el, dropIndicator);
                    renumber(zone);
                }
            }
            removeIndicator();
            handleDrop(name, insertBeforeId);
        });

        rowsIn(zone).forEach(function (row) { bindRow(row, name); });
    }

    zoneNames.forEach(bindZone);

    wirePlainFormFlash();

    // Auto-scroll while dragging near a scrollable column's top/bottom edge.
    // Native browser drag auto-scroll only kicks in right at the true edge
    // and then jumps at a fixed fast speed - there's no way to tune that, so
    // it's replaced here with a custom rAF loop whose speed ramps smoothly
    // with proximity: barely moving at the outer boundary of the trigger
    // zone, fastest right at the container's true edge, rather than
    // "nothing, then suddenly fast". On top of that, the speed proximity
    // sets is only a *target* - actual scroll speed additionally ramps up
    // over AUTOSCROLL_RAMP_MS from a standstill each time the drag enters
    // the trigger zone (or reverses direction), rather than jumping straight
    // to that target the instant the pointer crosses the threshold.
    var AUTOSCROLL_EDGE = 90; // px from the scrollable container's edge that starts scrolling
    var AUTOSCROLL_MAX_SPEED = 9; // px per animation frame at the very edge
    var AUTOSCROLL_RAMP_MS = 700; // time to reach full (proximity-scaled) speed after entering the zone
    var autoScrollEl = null;
    var autoScrollTargetSpeed = 0;
    var autoScrollDir = 0; // -1 up, 1 down, 0 idle - direction changes restart the ramp
    var autoScrollRampStart = 0;
    var autoScrollRaf = null;

    function autoScrollStep() {
        if (!autoScrollEl || !autoScrollTargetSpeed) { autoScrollRaf = null; return; }
        var ramp = Math.min((performance.now() - autoScrollRampStart) / AUTOSCROLL_RAMP_MS, 1);
        ramp = 1 - Math.pow(1 - ramp, 2); // ease-out: quick to start moving, gentle at the top
        autoScrollEl.scrollTop += autoScrollTargetSpeed * ramp;
        autoScrollRaf = requestAnimationFrame(autoScrollStep);
    }

    function stopAutoScroll() {
        autoScrollEl = null;
        autoScrollTargetSpeed = 0;
        autoScrollDir = 0;
        if (autoScrollRaf) { cancelAnimationFrame(autoScrollRaf); autoScrollRaf = null; }
    }

    // Walks up from the element under the pointer rather than hardcoding
    // .setup-col-body, so this keeps working if this drag-drop JS is ever
    // reused on a page with a differently-named scrolling ancestor.
    function closestScrollable(el) {
        while (el instanceof Element && el !== document.body) {
            var style = getComputedStyle(el);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }

    document.addEventListener('dragover', function (e) {
        if (!dragged) return;
        var scrollEl = closestScrollable(e.target);
        if (!scrollEl) { stopAutoScroll(); return; }
        var rect = scrollEl.getBoundingClientRect();
        var distFromTop = e.clientY - rect.top;
        var distFromBottom = rect.bottom - e.clientY;
        var speed = 0;
        if (distFromTop >= 0 && distFromTop < AUTOSCROLL_EDGE && scrollEl.scrollTop > 0) {
            speed = -AUTOSCROLL_MAX_SPEED * (1 - distFromTop / AUTOSCROLL_EDGE);
        } else if (distFromBottom >= 0 && distFromBottom < AUTOSCROLL_EDGE
            && scrollEl.scrollTop + scrollEl.clientHeight < scrollEl.scrollHeight) {
            speed = AUTOSCROLL_MAX_SPEED * (1 - distFromBottom / AUTOSCROLL_EDGE);
        }
        if (!speed) { stopAutoScroll(); return; }
        var dir = speed < 0 ? -1 : 1;
        // Entering the trigger zone fresh, switching to a different
        // scrollable column, or reversing direction (up <-> down) all
        // restart the ramp from a standstill, rather than keeping whatever
        // speed a previous, unrelated scroll had already built up.
        if (autoScrollEl !== scrollEl || autoScrollDir !== dir) {
            autoScrollRampStart = performance.now();
            autoScrollDir = dir;
        }
        autoScrollEl = scrollEl;
        autoScrollTargetSpeed = speed;
        if (!autoScrollRaf) autoScrollRaf = requestAnimationFrame(autoScrollStep);
    }, true); // capture: zone-level dragover handlers above call stopPropagation()
    document.addEventListener('dragend', stopAutoScroll, true);
    document.addEventListener('drop', stopAutoScroll, true);
}

window.initDragReorder = initDragReorder;
window.initAgendaDragDrop = initDragReorder;
