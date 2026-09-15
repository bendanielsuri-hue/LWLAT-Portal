/* #action-form-dialog (#211, see #51) - one of panel.js's nine independent
   dialog IIFEs, mechanical to extract since none of them share state
   (taxonomy.md §6). One dialog/fetch-fragment pair: openActionFormModal
   fetches _action_form_modal.html (inclusion_panel_action_new) into the
   shared #action-form-dialog shell (_base.html). Saving is a plain AJAX
   POST that redirects the whole page back to wherever it opened from
   (Discussion today, kept generic for other future callers) rather than
   swapping anything in place - there's no in-place update to do since the
   new Action's row belongs to a page this dialog doesn't own. It also serves
   edits (?edit=<id>, from the Actions list's Edit Action button and the
   Discussion row's Assigned-To button); what Panel Discussion still edits
   inline, without this dialog, is the assignment (see
   components/action-assign.js's own autosave IIFE). The Updates step is
   edit-only - a create has no Action for a thread to hang off yet.

   window.openActionFormModal stays window.* - _discussion_action_item.html
   calls it by name for both the create trigger and the Assigned-To Edit
   button (initialStep === 'assign'). */

import { closeModalWithFadeOut, animateModalHeightChange } from '../../../js/components/modal.js';
import { snapshotFormValues, formValuesDirty, confirmModalDiscard } from '../../../js/components/form-dirty.js';
import { enhanceFormControls } from '../../../js/components/form-controls.js';
import { initActionAssignFields } from '../components/action-assign.js';
import { shrinkAndFadeOut } from '../../../js/components/row-animate.js';

(function () {
    var dialog = document.getElementById('action-form-dialog');
    if (!dialog) return;

    function closeModal() {
        closeModalWithFadeOut(dialog);
    }

    // INT-U4: every closing gesture (X, Cancel, backdrop click, Escape)
    // goes through this instead of calling closeModal() directly - a
    // successful submit still calls closeModal() straight, bypassing the
    // guard, since that's a save, not a discard.
    function guardedClose() {
        if (confirmModalDiscard(function () {
            return formValuesDirty(dialog, dialog._formSnapshot || {});
        })) closeModal();
    }

    // The category select's auto-assign-by-category behaviour can't be an
    // inline <script> here - this fragment is injected via dialog.innerHTML,
    // and a <script> tag inserted that way never executes. Reads the
    // json_script data island the fragment renders instead (see
    // _action_form_modal.html). Create mode only - editing an existing
    // Action starts from its own real assignment, not a category
    // suggestion. Pre-selects into the Assign Staff Mode fields (#98)
    // rather than a plain <select>'s value - select()'s own
    // 'action-assign:change' event keeps the details step's static display
    // in sync even though the user never has to open Assign Staff Mode to
    // see it take effect.
    function wireAutoAssign() {
        var category = dialog.querySelector('[data-action-modal-category]');
        var fieldsRoot = dialog.querySelector('[data-action-assign-fields-root]');
        var dataEl = dialog.querySelector('[data-action-modal-auto-assign]');
        if (!category || !fieldsRoot || !dataEl) return;
        var autoAssignByCategory = JSON.parse(dataEl.textContent);
        category.addEventListener('change', function () {
            var suggestion = autoAssignByCategory[category.value];
            if (suggestion && fieldsRoot._actionAssignFields) {
                fieldsRoot._actionAssignFields.select('staff', String(suggestion.id), suggestion.name);
            }
        });
    }

    // Posting an update can't be a submit: this dialog's content is one
    // <form> already and HTML forbids a nested one, so the Post Update button
    // sends the panel's add_action_update form_action as a fetch body to the
    // same view the form posts to, and appends the entry it answers with.
    // Nothing else on the page changes, so there is nothing to reload - and a
    // reload here would throw away whatever the user had half-typed on the
    // details step.
    //
    // The textarea is left in the dirty snapshot deliberately: an update typed
    // but never posted is real content, and INT-U4's discard guard should ask
    // about it. Clearing it after a successful post puts it back to the
    // snapshotted empty string, so a posted update leaves the modal clean.
    function postUpdate() {
        var form = dialog.querySelector('[data-action-modal-form]');
        var textarea = dialog.querySelector('[data-action-update-body]');
        var thread = dialog.querySelector('[data-action-updates-thread]');
        if (!form || !textarea || !thread || !textarea.value.trim()) return;

        var body = new FormData();
        body.append('csrfmiddlewaretoken', form.querySelector('[name=csrfmiddlewaretoken]').value);
        body.append('form_action', 'add_action_update');
        body.append('action_id', form.querySelector('[name=action_id]').value);
        body.append('body', textarea.value);

        fetch(form.action, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: body,
        }).then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data.success) return;
                animateModalHeightChange(dialog, function () {
                    thread.insertAdjacentHTML('beforeend', data.html);
                    textarea.value = '';
                    var empty = dialog.querySelector('[data-action-updates-empty]');
                    if (empty) empty.hidden = true;
                    var count = dialog.querySelector('[data-action-updates-count]');
                    if (count) count.textContent = thread.children.length;
                });
                thread.scrollTop = thread.scrollHeight;
            });
    }

    // Author-only edit/delete on one already-posted update entry - the
    // buttons and inline edit form come from the shared
    // _thread_entry_edit_delete.html partial (only rendered at all when the
    // view already decided the current-staff identity is this entry's
    // author; the fetch below still gets rejected server-side if that ever
    // disagrees, e.g. a stale fragment left open after switching identity).
    //
    // update_id/add_action_update's own field names are hardcoded here
    // rather than read off the entry's data attributes - Action Updates is
    // the only thread wired up to this dialog today. The shared partial
    // still renders entry_id_field/edit_form_action/delete_form_action so a
    // second consumer (the meeting-note thread, #236) has real values to
    // read once it needs to branch on them.
    function threadEntryItem(el) {
        return el.closest('[data-thread-entry-id]');
    }

    function setThreadEntryEditing(item, editing) {
        var view = item.querySelector('[data-thread-entry-view]');
        var form = item.querySelector('[data-thread-entry-edit-form]');
        if (!view || !form) return;
        var textarea = form.querySelector('[data-thread-entry-edit-textarea]');
        animateModalHeightChange(dialog, function () {
            view.hidden = editing;
            form.hidden = !editing;
            if (editing && textarea) {
                textarea.focus();
            } else if (textarea) {
                // Cancel (or a fresh re-open later) starts from what's
                // actually on the entry, not whatever was left half-typed.
                textarea.value = textarea.dataset.threadEntryOriginalBody;
            }
        });
    }

    function postThreadEntryEdit(item) {
        var textarea = item.querySelector('[data-thread-entry-edit-textarea]');
        var form = item.closest('form');
        if (!textarea || !form || !textarea.value.trim()) return;

        var body = new FormData();
        body.append('csrfmiddlewaretoken', form.querySelector('[name=csrfmiddlewaretoken]').value);
        body.append('form_action', 'edit_action_update');
        body.append('action_id', form.querySelector('[name=action_id]').value);
        body.append('update_id', item.dataset.threadEntryId);
        body.append('body', textarea.value);

        fetch(form.action, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: body,
        }).then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data.success) return;
                animateModalHeightChange(dialog, function () {
                    item.outerHTML = data.html;
                });
            });
    }

    function deleteThreadEntry(item) {
        if (!window.confirm('Delete this update? This cannot be undone.')) return;
        var form = item.closest('form');
        var thread = item.closest('[data-action-updates-thread]');
        if (!form) return;

        var body = new FormData();
        body.append('csrfmiddlewaretoken', form.querySelector('[name=csrfmiddlewaretoken]').value);
        body.append('form_action', 'delete_action_update');
        body.append('action_id', form.querySelector('[name=action_id]').value);
        body.append('update_id', item.dataset.threadEntryId);

        fetch(form.action, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: body,
        }).then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data.success) return;
                shrinkAndFadeOut(item, function () {
                    item.remove();
                    if (!thread) return;
                    var count = dialog.querySelector('[data-action-updates-count]');
                    if (count) count.textContent = thread.children.length;
                    var empty = dialog.querySelector('[data-action-updates-empty]');
                    if (empty) empty.hidden = thread.children.length !== 0;
                });
            });
    }

    // Toggles between the details step and Assign Staff Mode (#98 revision)
    // - same hidden-view-swap + animateModalHeightChange convention as the
    // Panel Group modal's list/add modes. Both create and edit open on
    // details; the only entry into Assign Staff Mode is the Staff Assigned
    // row's own Edit button, or a trigger passing initialStep === 'assign'
    // (the Discussion row's dedicated Assigned-To Edit button - see
    // openActionFormModal). Back always returns to details.
    function wireSteps(initialStep) {
        var detailsStep = dialog.querySelector('[data-action-step-details]');
        var assignStep = dialog.querySelector('[data-action-step-assign]');
        var updatesStep = dialog.querySelector('[data-action-step-updates]');
        var updatesToggleBtn = dialog.querySelector('[data-action-updates-toggle]');
        var updatePostBtn = dialog.querySelector('[data-action-update-post-btn]');
        var assignToggleBtn = dialog.querySelector('[data-action-assign-toggle]');
        var cancelBtn = dialog.querySelector('[data-action-cancel-btn]');
        var backBtn = dialog.querySelector('[data-action-back-btn]');
        var saveBtn = dialog.querySelector('[data-action-save-btn]');
        var titleEl = dialog.querySelector('[data-action-modal-title]');
        var assignDisplay = dialog.querySelector('[data-action-assign-display]');
        if (!detailsStep || !assignStep) return;

        // Cancel/Back/Save toggle via a plain `hidden` flip, not
        // setFadeHidden's crossfade - setFadeHidden keeps the hiding
        // element in flow for 160ms so it can fade, but Back sits before
        // Save in the DOM, so during that overlap the flex-end .btn-row
        // briefly shows both ("Back Save") before Save's delayed
        // hidden=true collapses it and the remaining button snaps
        // rightward into the row's true single-button position - a visible
        // jump. An instant swap avoids the overlap entirely; the height
        // transition around this (below) already carries the visual
        // smoothness. Cancel and Back never show together (opposite of
        // Cancel/Save's own split), so there's nothing to reorder for them.
        function applyStep(step) {
            detailsStep.hidden = step !== 'details';
            assignStep.hidden = step !== 'assign';
            // Updates is edit-only, so this step is absent in create mode -
            // every read of it stays optional rather than the whole step
            // machinery bailing out when it isn't there.
            if (updatesStep) updatesStep.hidden = step !== 'updates';
            if (cancelBtn) cancelBtn.hidden = step !== 'details';
            if (backBtn) backBtn.hidden = step === 'details';
            if (saveBtn) saveBtn.hidden = step !== 'details';
            // Save belongs to the action, Post Update to the thread - one
            // button per step rather than a Save that means two things.
            if (updatePostBtn) updatePostBtn.hidden = step !== 'updates';
            if (titleEl) {
                titleEl.textContent = step === 'assign' ? 'Assign Staff to Action'
                    : step === 'updates' ? 'Action Updates'
                    : titleEl.dataset.actionModalTitleBase;
            }
        }

        function setStep(step) {
            animateModalHeightChange(dialog, function () { applyStep(step); });
        }

        if (assignToggleBtn) assignToggleBtn.addEventListener('click', function () { setStep('assign'); });
        if (updatesToggleBtn) updatesToggleBtn.addEventListener('click', function () { setStep('updates'); });
        if (updatePostBtn) updatePostBtn.addEventListener('click', postUpdate);
        if (backBtn) backBtn.addEventListener('click', function () { setStep('details'); });
        // Bubbles from initActionAssignFields' select() (a live pick, or
        // wireAutoAssign's category-driven suggestion) - keeps the details
        // step's static "Staff Assigned" text current without requiring the
        // user to have actually opened Assign Staff Mode.
        dialog.addEventListener('action-assign:change', function (e) {
            if (assignDisplay) assignDisplay.textContent = e.detail.name || 'Unassigned';
        });

        applyStep(initialStep === 'assign' ? 'assign' : 'details');
    }

    // Due Date is a "1 Week/2 Weeks/1 Month/Next Half Term/Next Term/Other"
    // preset select, not a raw date field shown unconditionally - "Other"
    // reveals the real #action-modal-due-date picker instead. Resolves
    // straight into that field (the one actually named due_date) since this
    // modal has one explicit Save button, not per-field autosave to race
    // with the picker widget's own change event.
    function wireDueDatePreset() {
        var intervalSelect = dialog.querySelector('[data-modal-due-date-interval]');
        var customWrap = dialog.querySelector('[data-modal-due-date-custom-wrap]');
        var customInput = dialog.querySelector('#action-modal-due-date');
        if (!intervalSelect || !customWrap || !customInput) return;
        intervalSelect.addEventListener('change', function () {
            var value = intervalSelect.value;
            if (value === 'other') {
                customWrap.hidden = false;
                return;
            }
            customWrap.hidden = true;
            if (/^\d+$/.test(value)) {
                var d = new Date();
                d.setDate(d.getDate() + parseInt(value, 10));
                customInput.value = d.toISOString().slice(0, 10);
            } else {
                customInput.value = value; // '' or an ISO date
            }
            if (customInput._uiDate) customInput._uiDate.refresh();
        });
    }

    // editActionId (#98): the Actions list page's "Edit Action" button
    // reuses this same fetch-fragment-into-dialog flow, just with
    // ?edit=<id> - the fragment opens on the details step like any other
    // edit, since it's editing the whole Action, not specifically its
    // assignment. initialStep === 'assign' is the one exception: the
    // Discussion row's dedicated Assigned-To Edit button passes it to land
    // straight in Assign Staff Mode, since that trigger exists
    // specifically to change the assignment - see
    // _discussion_action_item.html.
    window.openActionFormModal = function (referralId, panelReferralId, editActionId, initialStep) {
        var params = new URLSearchParams();
        if (panelReferralId) params.set('panel_referral', panelReferralId);
        if (editActionId) params.set('edit', editActionId);
        params.set('next', window.location.pathname);
        var url = '/inclusion/panel/referrals/' + encodeURIComponent(referralId) + '/actions/new/?' + params.toString();
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.text(); })
            .then(function (html) {
                dialog.innerHTML = html;
                wireAutoAssign();
                wireDueDatePreset();
                wireSteps(initialStep);
                dialog.querySelectorAll('[data-action-assign-fields-root]').forEach(initActionAssignFields);
                enhanceFormControls(dialog);
                // After every wireXxx() above (they can set initial values,
                // e.g. an auto-assign suggestion) so that setup doesn't
                // itself register as a "change" - see guardedClose's INT-U4
                // guard above.
                dialog._formSnapshot = snapshotFormValues(dialog);
                dialog.showModal();
                requestAnimationFrame(function () { dialog.classList.add('is-open'); });
            });
    };

    document.addEventListener('click', function (e) {
        if (e.target.closest('[data-add-action-trigger]')) {
            var trigger = e.target.closest('[data-add-action-trigger]');
            window.openActionFormModal(trigger.dataset.referralId, trigger.dataset.panelReferralId, trigger.dataset.editActionId, trigger.dataset.openStep);
            return;
        }
        if (e.target.closest('[data-modal-close]') && e.target.closest('#action-form-dialog')) {
            guardedClose();
        }
    });
    dialog.addEventListener('click', function (e) {
        if (e.target === dialog) { guardedClose(); return; }
        var item;
        if (e.target.closest('[data-thread-entry-edit-btn]')) {
            item = threadEntryItem(e.target);
            if (item) setThreadEntryEditing(item, true);
            return;
        }
        if (e.target.closest('[data-thread-entry-edit-cancel]')) {
            item = threadEntryItem(e.target);
            if (item) setThreadEntryEditing(item, false);
            return;
        }
        if (e.target.closest('[data-thread-entry-edit-save]')) {
            item = threadEntryItem(e.target);
            if (item) postThreadEntryEdit(item);
            return;
        }
        if (e.target.closest('[data-thread-entry-delete-btn]')) {
            item = threadEntryItem(e.target);
            if (item) deleteThreadEntry(item);
            return;
        }
    });
    dialog.addEventListener('cancel', function (e) {
        e.preventDefault();
        guardedClose();
    });

    dialog.addEventListener('submit', function (e) {
        var form = e.target.closest('[data-action-modal-form]');
        if (!form) return;
        e.preventDefault();

        fetch(form.action, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: new FormData(form),
        }).then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.success) {
                    window.location = data.redirect;
                }
            });
    });
})();
