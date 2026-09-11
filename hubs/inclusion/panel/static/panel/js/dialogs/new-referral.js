/* #new-referral-dialog (#211) - one of panel.js's nine independent dialog
   IIFEs, mechanical to extract since none of them share state
   (taxonomy.md §6). Also serves the "Referral Details" view/edit modals -
   same dialog element, opened in different modes (openModal/openEditModal/
   openViewModal) - and the inline Action status dropdown inside it.

   enhanceFormControls stays window.* - it's still main.js's, unsplit
   (#213). snapshotFormValues/formValuesDirty/confirmModalDiscard and
   closeModalWithFadeOut/animateModalHeightChange import from their real
   homes instead of reading window.* now that both have moved. */

import { closeModalWithFadeOut, animateModalHeightChange as sharedAnimateModalHeightChange } from '../../../js/components/modal.js';
import { snapshotFormValues, formValuesDirty, confirmModalDiscard } from '../../../js/components/form-dirty.js';

(function () {
    var dialog = document.getElementById('new-referral-dialog');
    if (!dialog) return;

    function openModal(studentId, nextUrl) {
        var url = '/inclusion/panel/referrals/new/?';
        if (studentId) url += 'student=' + encodeURIComponent(studentId) + '&';
        if (nextUrl) url += 'next=' + encodeURIComponent(nextUrl);
        loadModal(url);
    }

    function openEditModal(referralId, nextUrl) {
        var url = '/inclusion/panel/referrals/' + encodeURIComponent(referralId) + '/edit/?';
        if (nextUrl) url += 'next=' + encodeURIComponent(nextUrl);
        loadModal(url);
    }

    // "Referral Details" is always read-only, even for the referral's own
    // creator - view=1 forces that server-side regardless of the ownership
    // check inclusion_panel_referral_edit otherwise uses to gate editing.
    function openViewModal(referralId, nextUrl) {
        var url = '/inclusion/panel/referrals/' + encodeURIComponent(referralId) + '/edit/?view=1&';
        if (nextUrl) url += 'next=' + encodeURIComponent(nextUrl);
        loadModal(url);
    }

    function loadModal(url) {
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.text(); })
            .then(function (html) {
                dialog.innerHTML = html;
                window.enhanceFormControls(dialog);
                wireStudentPicker();
                // After wireStudentPicker's own initial setup (it can reset
                // fields, e.g. showPicker()'s input.value = '') so that
                // normalization doesn't itself register as a "change" -
                // see closeModal's INT-U4 guard below.
                dialog._formSnapshot = snapshotFormValues(dialog);
                dialog.showModal();
                // Autofocus the student search the moment the dialog opens,
                // but only when it's actually the visible step (a pre-selected
                // student, e.g. opened from a student's own page, hides the
                // search panel entirely - see _referral_form_fields.html).
                // Must run after showModal(): focusing a still-closed <dialog>
                // is silently ignored by the browser.
                var initialSearch = dialog.querySelector('[data-referral-student-search]');
                var initialSearchPanel = dialog.querySelector('[data-referral-student-search-panel]');
                if (initialSearch && initialSearchPanel && !initialSearchPanel.hidden) initialSearch.focus();
                requestAnimationFrame(function () { dialog.classList.add('is-open'); });
            });
    }

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

    function animateHeightChange(mutate) {
        sharedAnimateModalHeightChange(dialog, mutate);
    }

    function wireStudentPicker() {
        var form = dialog.querySelector('[data-referral-modal-form]');
        var saveBtn = dialog.querySelector('[data-referral-save]');
        var saveTooltip = dialog.querySelector('[data-referral-save-tooltip]');

        // A disabled <button> is inert to hover/focus in every browser, so a
        // `title` on the button itself never surfaces while disabled - the
        // wrapping span (still hoverable) carries the tooltip instead. Names
        // the actual unmet field (its <label for="...">) rather than a
        // generic "fill in required fields", so student picks it doesn't
        // have to go hunting for which one - falls back to the field's own
        // id/name when it has no <label> (e.g. the hidden student input).
        function updateSaveState() {
            if (!saveBtn || !form) return;
            var valid = form.checkValidity();
            saveBtn.disabled = !valid;
            if (!saveTooltip) return;
            if (valid) {
                saveTooltip.removeAttribute('title');
                return;
            }
            var studentInput = form.querySelector('[data-referral-student-input]');
            if (studentInput && !studentInput.value) {
                saveTooltip.title = 'Select a student before saving';
                return;
            }
            var invalidEl = form.querySelector(':invalid');
            var label = invalidEl && invalidEl.id && form.querySelector('label[for="' + invalidEl.id + '"]');
            var fieldName = label ? label.textContent.trim() : null;
            saveTooltip.title = fieldName ? fieldName + ' is blank' : 'Answer all required fields before saving';
        }

        if (form) {
            form.addEventListener('input', updateSaveState);
            form.addEventListener('change', updateSaveState);
        }
        updateSaveState();

        var picker = dialog.querySelector('[data-referral-student-picker]');
        if (!picker) return;

        var input = picker.querySelector('[data-referral-student-input]');
        var search = picker.querySelector('[data-referral-student-search]');
        var searchPanel = picker.querySelector('[data-referral-student-search-panel]');
        var resultsEl = picker.querySelector('[data-referral-student-results]');
        var selectedRow = picker.querySelector('[data-referral-student-selected]');
        var selectedName = picker.querySelector('[data-referral-student-selected-name]');
        var changeBtn = picker.querySelector('[data-referral-student-change]');
        var questionFields = dialog.querySelector('[data-referral-question-fields]');
        var btnRow = dialog.querySelector('.btn-row');
        var debounceTimer = null;

        function showForm() {
            animateHeightChange(function () {
                searchPanel.hidden = true;
                selectedRow.hidden = false;
                if (questionFields) questionFields.hidden = false;
                if (btnRow) btnRow.hidden = false;
                if (form) form.classList.remove('is-picking-student');
                updateSaveState();
            });
        }

        function renderResults(students) {
            animateHeightChange(function () {
                if (!students.length) {
                    resultsEl.innerHTML = '<p class="empty-note search-hint">No matching students.</p>';
                    return;
                }
                resultsEl.innerHTML = students.map(function (s) {
                    var display = s.name + (s.subtitle ? ' — ' + s.subtitle : '');
                    return '<button type="button" class="referral-student-option" data-id="' + s.id + '" data-name="' + s.name + '" data-display="' + display + '">' +
                        '<span class="referral-student-option-name">' + s.name + '</span>' +
                        '<span class="referral-student-option-meta">' + (s.subtitle || '') + '</span>' +
                        '</button>';
                }).join('');
            });
        }

        function runSearch(term) {
            fetch('/inclusion/panel/search/?kind=student&q=' + encodeURIComponent(term), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
                .then(function (res) { return res.json(); })
                .then(function (data) { renderResults(data.results); });
        }

        function showPicker() {
            animateHeightChange(function () {
                input.value = '';
                searchPanel.hidden = false;
                selectedRow.hidden = true;
                if (questionFields) questionFields.hidden = true;
                if (btnRow) btnRow.hidden = true;
                if (form) form.classList.add('is-picking-student');
                search.value = '';
                resultsEl.innerHTML = '<p class="empty-note search-hint">Start typing to search students…</p>';
                search.focus();
                updateSaveState();
            });
        }

        // Hidden until typed, server-fetched, debounced 250ms with a 2-char
        // minimum - the shared Search precedent (INT-P4), same numbers as
        // Panel search and Add Member.
        search.addEventListener('input', function () {
            var term = search.value.trim();
            clearTimeout(debounceTimer);
            if (!term) {
                animateHeightChange(function () {
                    resultsEl.innerHTML = '<p class="empty-note search-hint">Start typing to search students…</p>';
                });
                return;
            }
            if (term.length === 1) {
                debounceTimer = setTimeout(function () {
                    animateHeightChange(function () {
                        resultsEl.innerHTML = '<p class="empty-note search-hint">Keep typing… (2+ characters)</p>';
                    });
                }, 400);
                return;
            }
            debounceTimer = setTimeout(function () { runSearch(term); }, 250);
        });

        resultsEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.referral-student-option');
            if (!btn) return;
            input.value = btn.getAttribute('data-id');
            selectedName.textContent = btn.getAttribute('data-display') || btn.getAttribute('data-name');
            showForm();
        });

        if (changeBtn) changeBtn.addEventListener('click', showPicker);

        if (form) {
            form.addEventListener('input', updateSaveState);
            form.addEventListener('change', updateSaveState);
        }

        if (input.value) {
            showForm();
        } else {
            showPicker();
        }
    }

    document.addEventListener('click', function (e) {
        var trigger = e.target.closest('[data-new-referral-trigger]');
        if (trigger) {
            openModal(trigger.getAttribute('data-student-id'), trigger.getAttribute('data-next'));
            return;
        }
        var editTrigger = e.target.closest('[data-edit-referral-trigger]');
        if (editTrigger) {
            openEditModal(editTrigger.getAttribute('data-referral-id'), editTrigger.getAttribute('data-next'));
            return;
        }
        var viewTrigger = e.target.closest('[data-view-referral-trigger]');
        if (viewTrigger) {
            openViewModal(viewTrigger.getAttribute('data-referral-id'), viewTrigger.getAttribute('data-next'));
            return;
        }
        if (e.target.closest('[data-modal-close]')) {
            guardedClose();
        }
    });

    dialog.addEventListener('click', function (e) {
        if (e.target === dialog) guardedClose();
    });

    dialog.addEventListener('cancel', function (e) {
        e.preventDefault();
        guardedClose();
    });

    dialog.addEventListener('submit', function (e) {
        var form = e.target.closest('[data-referral-modal-form]');
        if (!form) return;
        e.preventDefault();

        fetch(form.action, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: new FormData(form),
        }).then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.success) {
                    closeModal();
                    window.location.reload();
                    return;
                }
                // Server-side rejected it (e.g. a required question like Main
                // Concern Category was left blank) - the client-side
                // `required` check should already have caught this, but that
                // can be bypassed (a disabled/hidden field is barred from
                // constraint validation), so this is the real backstop.
                var errorEl = form.querySelector('[data-referral-form-error]');
                if (errorEl && data.errors && data.errors.length) {
                    errorEl.textContent = 'Please answer: ' + data.errors.join(', ') + '.';
                    errorEl.hidden = false;
                }
            });
    });

    // Action status dropdown, in Referral Details' own Actions section - this
    // one's response is HTML (the whole Referral Details fragment, re-rendered
    // with the new status), not JSON, and never closes the dialog - the point
    // is to stay open while checking off several actions in a row.
    //
    // data-action-toggle-form is a plain <div>, not a real <form> - it lives
    // inside the referral modal's own outer <form data-referral-modal-form>,
    // and nested <form> elements are illegal HTML (the browser silently drops
    // one of the two), so the request is built by hand from its hidden inputs
    // instead of relying on form submission/FormData(form).
    dialog.addEventListener('change', function (e) {
        var select = e.target.closest('[data-action-status-select]');
        if (!select) return;
        var container = select.closest('[data-action-toggle-form]');
        if (!container) return;

        var body = new FormData();
        container.querySelectorAll('input').forEach(function (input) {
            body.append(input.name, input.value);
        });
        body.append(select.name, select.value);

        fetch(container.dataset.actionUrl, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: body,
        }).then(function (res) { return res.text(); })
            .then(function (html) {
                dialog.innerHTML = html;
                window.enhanceFormControls(dialog);
                wireStudentPicker();
            });
    });
})();
