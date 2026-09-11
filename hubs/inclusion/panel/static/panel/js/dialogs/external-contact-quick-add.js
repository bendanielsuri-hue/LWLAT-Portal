/* #external-contact-quick-add-dialog (#211) - one of panel.js's nine
   independent dialog IIFEs, mechanical to extract since none of them share
   state (taxonomy.md §6). Same reasoning as expertise-quick-add.js: one
   instance for the whole page, reused by every member picker's "Add New
   External Contact" button rather than each picker expanding its own
   inline fields.

   window.openExternalContactQuickAdd stays window.* - initMemberPicker
   (still panel.js's own top-level function, not yet a module) calls it by
   name. */

import { closeModalWithFadeOut } from '../../../js/components/modal.js';

(function () {
    var dialog = document.getElementById('external-contact-quick-add-dialog');
    if (!dialog) return;
    var form = dialog.querySelector('[data-external-contact-quick-add-form]');
    var nameInput = dialog.querySelector('[data-external-contact-quick-add-name]');
    var companyInput = dialog.querySelector('[data-external-contact-quick-add-company]');
    var targetPickerRoot = null;

    function closeDialog() {
        closeModalWithFadeOut(dialog);
        targetPickerRoot = null;
    }
    dialog.querySelectorAll('[data-modal-close]').forEach(function (btn) {
        btn.addEventListener('click', closeDialog);
    });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDialog(); });

    // pickerRoot is the specific [data-member-picker-root] whose "Add New
    // External Contact" button was clicked - the page can have several
    // picker instances, so the dialog needs to know which one to hand the
    // new contact back to on save.
    window.openExternalContactQuickAdd = function (pickerRoot) {
        targetPickerRoot = pickerRoot;
        nameInput.value = '';
        companyInput.value = '';
        dialog.showModal();
        requestAnimationFrame(function () {
            dialog.classList.add('is-open');
            nameInput.focus();
        });
    };

    // Delegated at the document level (rather than wired per-picker inside
    // initMemberPicker) so one listener covers every picker instance on the
    // page, present now or rendered in later. The toggle itself now lives in
    // the including page's own footer (e.g. .panel-group-modal-footer), not
    // inside the picker's own root (see _member_picker.html's doc comment),
    // so it can't be found via toggle.closest('[data-member-picker-root]')
    // any more - only one picker is ever visible per dialog at a time, so
    // scoping the lookup to the toggle's nearest <dialog> instead finds the
    // same, single, currently-active picker root.
    document.addEventListener('click', function (e) {
        var toggle = e.target.closest('[data-member-add-external-toggle]');
        if (!toggle) return;
        var scope = toggle.closest('dialog') || document;
        var pickerRoot = scope.querySelector('[data-member-picker-root]');
        if (pickerRoot) window.openExternalContactQuickAdd(pickerRoot);
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = nameInput.value.trim();
        if (!name || !targetPickerRoot) return;
        var company = companyInput.value.trim();
        var csrfForm = targetPickerRoot.closest('form');
        var csrfInput = csrfForm ? csrfForm.querySelector('input[name="csrfmiddlewaretoken"]') : null;
        var fd = new FormData();
        fd.append('name', name);
        fd.append('job_title', company);
        fd.append('csrfmiddlewaretoken', csrfInput ? csrfInput.value : '');
        fetch('/inclusion/panel/external-contacts/quick-add/', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: fd,
        }).then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data.success) return;
                if (targetPickerRoot._memberPicker && targetPickerRoot._memberPicker.addExternalContact) {
                    targetPickerRoot._memberPicker.addExternalContact(data.contact);
                }
                closeDialog();
            });
    });
})();
