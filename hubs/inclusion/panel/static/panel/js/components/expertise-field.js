/* Promoted out of panel.js (#211) - wires a single Expertise field's "+" to
   the shared quick-add dialog (dialogs/expertise-quick-add.js). Extracted
   from a DOMContentLoaded block that only ever ran once, against the
   page's initial HTML, into a reusable function so any code that injects a
   fresh copy of _expertise_field.html later - e.g. the Panel Group modal
   re-rendering per-member expertise pickers after every autosave - can
   wire it too, via initExpertiseFields(root).

   Still also set on `window`: dialogs/panel-group.js calls
   window.initExpertiseFields by name (guarded, since it hasn't migrated to
   import this directly), and this file's own DOMContentLoaded wiring below
   needs the same name every other page's inline script already expects. */

export function initExpertiseField(row) {
    var toggleBtn = row.querySelector('[data-expertise-add-toggle]');
    var select = row.querySelector('[data-expertise-select]');
    if (!toggleBtn || !select || toggleBtn.dataset.expertiseWired) return;
    toggleBtn.dataset.expertiseWired = '1';
    toggleBtn.addEventListener('click', function () { window.openExpertiseQuickAdd(select); });
}

// .expertise-field-row is the wrapper in the plain (label-above) layout;
// the merged=True .ui-fused-field layout (Panel Group modal's member
// rows) has no such wrapper - .ui-fused-field's own subgrid placement
// requires it to be a direct child of its .ui-fused-field-group grid
// parent, so it can't be nested in an extra wrapper div - its nearest
// shared container is .expertise-field-form instead.
// initExpertiseField's own data-expertise-wired guard makes matching the
// same element via both selectors harmless.
export function initExpertiseFields(root) {
    (root || document).querySelectorAll('.expertise-field-row, .expertise-field-form').forEach(initExpertiseField);
}

window.initExpertiseField = initExpertiseField;
window.initExpertiseFields = initExpertiseFields;

document.addEventListener('DOMContentLoaded', function () {
    initExpertiseFields(document);
});
