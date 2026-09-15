/* The preset-reason control's behaviour: reveal the free-text box only once
   "Other" is picked, and make it required exactly while it is visible, so a
   hidden field can't block submission and a shown one can't be skipped.

   One module for both call sites (#239) - Escalate to MAT's page entry
   (pages/escalate-form.js) and the Panel Group modal's deactivate-member step
   (dialogs/panel-group.js), which calls initPresetReasonFields again after
   every render because the dialog replaces its own subtree. The wired flag
   makes that idempotent, same guard as the dialog's own autosave forms.

   OTHER is reasons.OTHER and _preset_reason_field.html's `__other__` - see
   reasons.py for why the string is written out in all three languages. */

const OTHER = '__other__';

export function initPresetReasonFields(root) {
    (root || document).querySelectorAll('[data-preset-reason-field]').forEach(function (field) {
        if (field.dataset.presetReasonWired) return;
        var choice = field.querySelector('[data-preset-reason-choice]');
        var otherGroup = field.querySelector('[data-preset-reason-other-group]');
        var other = field.querySelector('[data-preset-reason-other]');
        if (!choice || !otherGroup || !other) return;
        field.dataset.presetReasonWired = '1';

        function sync() {
            var isOther = choice.value === OTHER;
            otherGroup.hidden = !isOther;
            other.required = isOther;
        }
        choice.addEventListener('change', sync);
        sync();
    });
}

/* Back to "nothing picked yet". Needed where the same field is reused without
   a re-render between uses - the Panel Group modal's deactivate step is
   entered once per member, and would otherwise open carrying the last
   member's answer. Dispatching `change` rather than calling sync() directly
   keeps this usable from outside the wiring above, and refreshes the
   enhanced <select>'s own popover, which caches the selection at enhance
   time (see static/js/components/select.js). */
export function resetPresetReasonField(field) {
    if (!field) return;
    var choice = field.querySelector('[data-preset-reason-choice]');
    var other = field.querySelector('[data-preset-reason-other]');
    if (other) other.value = '';
    if (!choice) return;
    choice.value = '';
    if (choice._uiSelect) choice._uiSelect.refresh();
    choice.dispatchEvent(new Event('change'));
}
