/* #panel-meeting-dialog (#211) - one of panel.js's nine independent dialog
   IIFEs, mechanical to extract since none of them share state
   (taxonomy.md §6). One dialog/fetch path for both "Create Panel Meeting"
   and "Edit Panel Settings" (see openPanelMeetingModal's own comment).

   window.openPanelMeetingModal stays window.* - meetings.html's
   own [data-create-panel-trigger] delegated click above already covers the
   in-file trigger, but other panel pages/dialogs may still reach for it by
   name. */

import { closeModalWithFadeOut } from '../../../js/components/modal.js';
import { enhanceFormControls } from '../../../js/components/form-controls.js';

(function () {
    var dialog = document.getElementById('panel-meeting-dialog');
    if (!dialog) return;

    // Options for the Panel Group select, captured whole (including ones
    // hidden by the current School filter) so switching School back and
    // forth never permanently loses an option the way removing them from
    // the DOM would.
    var allGroupOptions = [];

    function closeModal() {
        closeModalWithFadeOut(dialog);
    }

    function applyGroupFilter() {
        var groupSelect = dialog.querySelector('#new-panel-group');
        var schoolSelect = dialog.querySelector('[data-panel-school-select]');
        if (!groupSelect) return;
        // No School select in the DOM at all (edit mode, see
        // _panel_meeting_form_modal.html) means no school-based filtering
        // applies - every group option stays visible. That's distinct from
        // an explicit "MAT-wide" choice (value 'none'), which narrows to
        // just the school-less groups rather than showing everything.
        var schoolId = schoolSelect ? schoolSelect.value : null;
        var placeholder = groupSelect.querySelector('option[value=""]');
        var previousValue = groupSelect.value;
        groupSelect.innerHTML = '';
        if (placeholder) groupSelect.appendChild(placeholder);
        var visible = allGroupOptions.filter(function (opt) {
            if (schoolId === null) return true;
            if (schoolId === 'none') return !opt.dataset.school;
            return opt.dataset.school === schoolId;
        });
        visible.forEach(function (opt) { groupSelect.appendChild(opt); });
        if (visible.some(function (opt) { return opt.value === previousValue; })) {
            groupSelect.value = previousValue;
        } else if (visible.length === 1) {
            groupSelect.value = visible[0].value;
        } else {
            groupSelect.value = '';
        }
        if (groupSelect._uiSelect) groupSelect._uiSelect.refresh();
    }

    function wireSchoolFilter() {
        var groupSelect = dialog.querySelector('#new-panel-group');
        if (!groupSelect) return;
        allGroupOptions = Array.prototype.slice.call(groupSelect.options).filter(function (opt) { return opt.value; });
        var schoolSelect = dialog.querySelector('[data-panel-school-select]');
        if (schoolSelect) schoolSelect.addEventListener('change', applyGroupFilter);
        applyGroupFilter();
    }

    function wireRequiredFields() {
        var form = dialog.querySelector('[data-panel-meeting-modal-form]');
        var saveBtn = dialog.querySelector('[data-create-panel-save]');
        if (!form || !saveBtn) return;
        function updateSaveState() { saveBtn.disabled = !form.checkValidity(); }
        form.addEventListener('input', updateSaveState);
        form.addEventListener('change', updateSaveState);
        updateSaveState();
    }

    // One dialog, one fetch/render path for both modes - `panelId` present
    // means "Edit Panel Settings" for that Panel, omitted means "Create
    // Panel Meeting" (see inclusion_panel_meeting_new in views.py, which
    // renders the same _panel_meeting_form_modal.html fragment either way).
    window.openPanelMeetingModal = function (panelId) {
        var url = panelId
            ? '/inclusion/panel/meetings/' + encodeURIComponent(panelId) + '/edit-details/'
            : '/inclusion/panel/meetings/new/';
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.text(); })
            .then(function (html) {
                dialog.innerHTML = html;
                wireSchoolFilter();
                wireRequiredFields();
                enhanceFormControls(dialog);
                dialog.showModal();
                requestAnimationFrame(function () { dialog.classList.add('is-open'); });
            });
    };

    document.addEventListener('click', function (e) {
        if (e.target.closest('[data-create-panel-trigger]')) {
            window.openPanelMeetingModal();
            return;
        }
        var editTrigger = e.target.closest('[data-edit-settings-trigger]');
        if (editTrigger) {
            window.openPanelMeetingModal(editTrigger.dataset.panelId);
            return;
        }
        if (e.target.closest('[data-modal-close]') && e.target.closest('#panel-meeting-dialog')) {
            closeModal();
        }
    });

    document.addEventListener('panel-group:created', function (e) {
        var groupSelect = dialog.querySelector('#new-panel-group');
        if (!groupSelect || !dialog.open) return;
        var group = e.detail;
        var option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name + (group.school_id ? '' : ' (No school)');
        option.dataset.school = group.school_id || '';
        groupSelect.appendChild(option);
        allGroupOptions.push(option);
        groupSelect.value = group.id;
        groupSelect.dispatchEvent(new Event('change'));
        if (groupSelect._uiSelect) groupSelect._uiSelect.refresh();
    });

    dialog.addEventListener('click', function (e) {
        if (e.target === dialog) closeModal();
    });

    dialog.addEventListener('submit', function (e) {
        var form = e.target.closest('[data-panel-meeting-modal-form]');
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
