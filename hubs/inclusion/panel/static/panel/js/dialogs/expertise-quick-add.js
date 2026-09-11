/* #expertise-quick-add-dialog (#211) - one of panel.js's nine independent
   dialog IIFEs, mechanical to extract since none of them share state
   (taxonomy.md §6). One instance for the whole page, reused by every
   Expertise field's "+" button (there can be several, e.g. one per Panel
   Group member row) instead of each field expanding its own inline row.

   window.openExpertiseQuickAdd stays window.* -
   components/expertise-field.js calls it by name. */

import { closeModalWithFadeOut } from '../../../js/components/modal.js';

(function () {
    var dialog = document.getElementById('expertise-quick-add-dialog');
    if (!dialog) return;
    var form = dialog.querySelector('[data-expertise-quick-add-form]');
    var input = dialog.querySelector('[data-expertise-quick-add-input]');
    var targetSelect = null;

    function closeDialog() {
        closeModalWithFadeOut(dialog);
        targetSelect = null;
    }
    dialog.querySelectorAll('[data-modal-close]').forEach(function (btn) {
        btn.addEventListener('click', closeDialog);
    });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDialog(); });

    // select is the specific Expertise <select> whose "+" was clicked - the
    // page can have several, so the dialog needs to know which one to apply
    // the new tag/selection back to on save.
    window.openExpertiseQuickAdd = function (select) {
        targetSelect = select;
        input.value = '';
        dialog.showModal();
        requestAnimationFrame(function () {
            dialog.classList.add('is-open');
            input.focus();
        });
    };

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = input.value.trim();
        if (!name || !targetSelect) return;
        var csrfInput = targetSelect.closest('form') && targetSelect.closest('form').querySelector('input[name="csrfmiddlewaretoken"]');
        var fd = new FormData();
        fd.append('name', name);
        fd.append('school_id', targetSelect.dataset.expertiseSchoolId || '');
        fd.append('csrfmiddlewaretoken', csrfInput ? csrfInput.value : '');
        fetch('/inclusion/panel/settings/expertise/quick-add/', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: fd,
        }).then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data.success) return;
                var opt = document.createElement('option');
                opt.value = data.expertise.id;
                opt.textContent = data.expertise.name;
                targetSelect.appendChild(opt);
                targetSelect.value = data.expertise.id;
                // The select may already be enhanced into a custom popover
                // (enhanceFormControls) - it caches its option list at
                // enhance time and won't otherwise notice the new <option>.
                if (targetSelect._uiSelect) targetSelect._uiSelect.refresh();
                // Programmatic .value assignment doesn't fire 'change' on
                // its own - forms that autosave on change (e.g. a Panel
                // Group member's expertise row) need this to save the
                // newly-created tag immediately, not just populate the list.
                targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
                closeDialog();
            });
    });
})();
