/* Promoted out of panel.js (#211, ADR 0020) - generic "has this form
   actually changed" tracking, INT-U4's confirm-before-discard guard.

   Still also set on `window`, same reason as components/modal.js: panel.js's
   own dialogs are classic-script code and call these by that name from
   inside event handlers, so the window assignment keeps them working until
   those dialogs are migrated to import this directly. */

// Snapshot every field's value within `root` right after a modal's content
// loads, keyed by name (falling back to id, then DOM index) -
// formValuesDirty compares a live root against that snapshot to answer "has
// anything in this form actually changed since it opened," the shared check
// confirmModalDiscard (below) is built on. Any real field counts (select/
// date/checkbox included, not just typed text) - a step-switching UI (e.g.
// Add Action's details/Assign steps) keeps every field in the DOM the whole
// time, just hidden on the inactive step, so this still sees a change made
// on a step the user has since navigated away from.
export function snapshotFormValues(root) {
    var map = {};
    root.querySelectorAll('input, select, textarea').forEach(function (el, i) {
        var key = (el.name || el.id || ('idx' + i)) + (el.type === 'checkbox' || el.type === 'radio' ? ':' + el.value : '');
        map[key] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
    });
    return map;
}

export function formValuesDirty(root, snapshot) {
    var current = snapshotFormValues(root);
    for (var key in current) {
        if (current[key] !== snapshot[key]) return true;
    }
    return false;
}

// Confirm before letting a modal close discard real typed content (INT-U4)
// - every closing gesture (the header X, an explicit Cancel button, a
// backdrop click, Escape) weighs the same, not just the accidental ones; a
// form with nothing but untouched dropdowns has nothing worth guarding.
// `isDirty` is a caller-supplied predicate (each modal knows which of its
// own fields count) - returns whether the close should actually proceed.
export function confirmModalDiscard(isDirty) {
    return !isDirty() || window.confirm('Discard your changes?');
}

window.snapshotFormValues = snapshotFormValues;
window.formValuesDirty = formValuesDirty;
window.confirmModalDiscard = confirmModalDiscard;
