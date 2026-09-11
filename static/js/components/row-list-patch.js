/* Promoted out of panel.js (#211, ADR 0020) - generic keyed row-list
   diff/patch and remove-row wiring, no SEND vocabulary in it.

   Still also set on `window`, same reason as components/modal.js: panel.js's
   own dialogs are classic-script code and call these by that name from
   inside event handlers, so the window assignment keeps them working until
   those dialogs are migrated to import this directly. */

import { shrinkAndFadeOut, growIn } from './row-animate.js';

// Diffs two row-list containers by a caller-given key attribute (e.g.
// 'data-member-id', 'data-drop-id') and animates only the delta (grow-in
// newly added rows, shrink-fade-out removed ones, in-place swap for changed
// content) instead of a wholesale innerHTML/replaceWith of the whole list.
// Generic version of what started as a one-off for Panel Agenda Setup's
// read-only Members card mirror - pulled out so Edit Panel Group's own
// member list and Panel Agenda Setup's drag zones can reuse it too, instead
// of each doing a full-container swap that tears out whatever unrelated row
// happens to still be mid-animation from a *different*, concurrent click.
// That full-swap-on-every-update pattern was the actual root cause of rows
// "vanishing"/animations cutting short under rapid clicking - not a flaw in
// the animations themselves (see grilling session 2026-07-12).
//
// onRowChanged(row), if given, fires for every row that's newly inserted or
// had its content replaced (not for rows left untouched) - callers with
// per-row listeners that don't survive a fresh DOMParser parse (e.g. Agenda
// Setup's drag handlers, bound directly to each row) use it to rebind just
// those rows instead of every row in the list. Returns the grow-in promises
// for newly-inserted rows so a caller that needs to know when the patch has
// fully settled (not just started) can wait on them.
export function diffPatchRowList(oldList, freshList, keyAttr, onRowChanged) {
    function rowMap(list) {
        var map = {};
        list.querySelectorAll(':scope > [' + keyAttr + ']').forEach(function (row) {
            map[row.getAttribute(keyAttr)] = row;
        });
        return map;
    }
    var oldRows = rowMap(oldList);
    var freshOrder = Array.prototype.slice.call(freshList.querySelectorAll(':scope > [' + keyAttr + ']'));
    var freshIds = {};
    freshOrder.forEach(function (row) { freshIds[row.getAttribute(keyAttr)] = true; });

    Object.keys(oldRows).forEach(function (id) {
        if (!freshIds[id]) {
            shrinkAndFadeOut(oldRows[id], function () { oldRows[id].remove(); });
        }
    });

    // Unchanged rows whose content differs swap in place with no animation -
    // only presence/absence is animated here.
    freshOrder.forEach(function (freshRow) {
        var id = freshRow.getAttribute(keyAttr);
        var oldRow = oldRows[id];
        if (oldRow && oldRow.outerHTML !== freshRow.outerHTML) {
            oldRow.replaceWith(freshRow);
            oldRows[id] = freshRow;
            if (onRowChanged) onRowChanged(freshRow);
        }
    });

    var emptyNote = oldList.querySelector(':scope > .empty-note');
    if (emptyNote && freshOrder.length) emptyNote.remove();

    // Added rows: insert before whichever later fresh row already has a
    // place in oldList, so a newly-added row lands in the same sorted
    // position it has in the fresh render instead of always at the end.
    var growPromises = [];
    freshOrder.forEach(function (freshRow, index) {
        var id = freshRow.getAttribute(keyAttr);
        if (oldRows[id]) return;
        var beforeEl = null;
        for (var i = index + 1; i < freshOrder.length; i++) {
            var nextRow = oldRows[freshOrder[i].getAttribute(keyAttr)];
            if (nextRow) { beforeEl = nextRow; break; }
        }
        if (beforeEl) oldList.insertBefore(freshRow, beforeEl);
        else oldList.appendChild(freshRow);
        growPromises.push(growIn(freshRow));
        oldRows[id] = freshRow;
        if (onRowChanged) onRowChanged(freshRow);
    });

    if (!freshOrder.length && !oldList.querySelector(':scope > .empty-note')) {
        var freshEmpty = freshList.querySelector(':scope > .empty-note');
        if (freshEmpty) oldList.appendChild(freshEmpty);
    }
    return growPromises;
}

// Generic wiring for "delete/remove-this-row" forms: submits over fetch
// instead of letting the browser navigate, and on success shrink-fades the
// row out of the DOM instead of a full page reload. Falls back to a normal
// (unanimated) form submit on network failure or a non-2xx/non-success
// response, so the row's own delete button still works even if AJAX wiring
// breaks for some reason - never silently does nothing.
//
// Confirmation (data-confirm-message) is handled *inside* this same
// listener rather than via a separate onsubmit="return confirm(...)"
// attribute - two independent submit listeners racing on the same event
// is exactly how a Cancel click ended up not actually stopping this
// listener's own fetch/animate (a plain `return false` from an onsubmit
// attribute only preventDefault()s the browser's native submission; it
// doesn't stop *other* listeners on the same event from still running).
// Keeping one listener as the single source of truth avoids that class of
// bug entirely.
export function wireRowRemoveForm(form) {
    var row = form.closest('.entity-row, .settings-row, .meeting-card, li');
    // If the row lives inside a tab-row/heading-count container (e.g. My
    // Referrals' <ul>), fire a plain DOM event once it's actually gone so
    // that page's own inline script can recount its own tabs/heading - see
    // recountTabsFromRows (components/tabs.js). Kept as a generic event
    // rather than calling that function directly from here, since the
    // matchers/keyAttr needed are page-specific and this helper is reused
    // well beyond referrals.
    var recountContainer = form.closest('[data-recount-container]');
    form.addEventListener('submit', function (e) {
        if (form.dataset.submitting) { e.preventDefault(); return; }
        var confirmMessage = form.dataset.confirmMessage;
        if (confirmMessage && !confirm(confirmMessage)) {
            e.preventDefault();
            return;
        }
        e.preventDefault();
        form.dataset.submitting = '1';
        var submitBtn = form.querySelector('button[type="submit"]');
        // (INT-U3/F1) Disabled only while the request is in flight - the
        // reason says so rather than reading as a permanently blocked
        // action; the catch below re-enables it.
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.dataset.disabledReason = 'Working on it…';
        }
        fetch(form.action, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: new FormData(form),
        }).then(function (res) {
            if (!res.ok) throw new Error('bad status');
            return res.json();
        }).then(function (data) {
            if (!data.success) throw new Error('not successful');
            if (row) {
                shrinkAndFadeOut(row, function () {
                    if (row.parentNode) row.parentNode.removeChild(row);
                    if (recountContainer) {
                        recountContainer.dispatchEvent(new CustomEvent('panel:row-removed', { bubbles: true }));
                    }
                });
            }
        }).catch(function () {
            delete form.dataset.submitting;
            if (submitBtn) submitBtn.disabled = false;
            form.submit();
        });
    });
}

window.diffPatchRowList = diffPatchRowList;
window.wireRowRemoveForm = wireRowRemoveForm;

document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-row-remove-form]').forEach(wireRowRemoveForm);
});
