// Resolves which school's Panel Groups should be shown, without a page-local
// School dropdown: the sidebar's School switcher (localStorage 'pref-school',
// a school name — set by main.js) is the source of truth once it has run.
// "All Schools"/"All Primary"/"All Secondary" explicitly mean "no filter" —
// only a genuinely-unset pref-school (shouldn't normally happen) falls back
// to the current identity's own school.
window.resolvePanelSchoolFilter = function (groupOptions, currentStaffSchoolId) {
    var prefSchool;
    try { prefSchool = localStorage.getItem('pref-school'); } catch (e) { }
    if (!prefSchool) return currentStaffSchoolId || '';
    if (prefSchool.indexOf('All ') === 0) return '';
    var match = groupOptions.filter(function (opt) { return opt.dataset.schoolName === prefSchool; })[0];
    return match ? match.dataset.school : (currentStaffSchoolId || '');
};

// Client-side filter bars (Students/Referrals/Actions) don't submit/reload —
// they filter .entity-rows in place — but should still get the same
// .filter-bar-label/.filter-bar-count active-count badge and
// .filter-field--active highlight as the server-side dashboard flavour (see
// DesignLanguage.md "Filter bar"). Rather than duplicate that bookkeeping in
// each page's own inline <script>, wire it once here: pass the .filter-bar
// element, get back a refresh() to call from the page's own
// applyFilters()/clearFilters() whenever a control changes.
//
// A field counts as "active" when its control differs from its default
// (non-empty select, non-empty text input, or an "on" toggle-pill) — unless
// the field is marked [data-not-a-filter], for fields that merely feed
// another filter rather than constrain the list themselves (e.g. Actions'
// "Staff Assigned" identity picker, which only matters once "Assigned to Me"
// is toggled on).
window.wireFilterBarActiveState = function (filterBar) {
    if (!filterBar) return function () { };
    var badge = filterBar.querySelector('.filter-bar-count');
    var fields = Array.prototype.slice.call(filterBar.querySelectorAll('.filter-field')).filter(function (field) {
        return !field.hasAttribute('data-not-a-filter') && !field.querySelector('.filter-bar-clear');
    });

    function isActive(field) {
        var select = field.querySelector('select');
        if (select) return select.value !== '';
        var input = field.querySelector('input[type=text], input[type=search]');
        if (input) return input.value.trim() !== '';
        var toggle = field.querySelector('.toggle-pill');
        if (toggle) return toggle.classList.contains('on');
        return false;
    }

    function refresh() {
        var count = 0;
        fields.forEach(function (field) {
            var active = isActive(field);
            field.classList.toggle('filter-field--active', active);
            if (active) count++;
        });
        if (badge) {
            badge.textContent = count;
            badge.classList.toggle('filter-bar-count--empty', count === 0);
        }
    }

    refresh();
    return refresh;
};

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

    function loadModal(url) {
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.text(); })
            .then(function (html) {
                dialog.innerHTML = html;
                window.enhanceFormControls(dialog);
                wireStudentPicker();
                dialog.showModal();
                requestAnimationFrame(function () { dialog.classList.add('is-open'); });
            });
    }

    function getModalDuration() {
        return parseFloat(getComputedStyle(dialog).getPropertyValue('--modal-duration')) || 250;
    }

    function closeModal() {
        dialog.classList.remove('is-open');
        setTimeout(function () { dialog.close(); }, getModalDuration());
    }

    function animateHeightChange(mutate) {
        if (!dialog.open) {
            mutate();
            return;
        }
        var startHeight = dialog.getBoundingClientRect().height;
        dialog.style.height = startHeight + 'px';
        mutate();
        requestAnimationFrame(function () {
            dialog.style.height = dialog.scrollHeight + 'px';
        });
        setTimeout(function () { dialog.style.height = ''; }, getModalDuration());
    }

    function wireStudentPicker() {
        var picker = dialog.querySelector('[data-referral-student-picker]');
        if (!picker) return;

        var form = dialog.querySelector('[data-referral-modal-form]');
        var input = picker.querySelector('[data-referral-student-input]');
        var search = picker.querySelector('[data-referral-student-search]');
        var searchPanel = picker.querySelector('[data-referral-student-search-panel]');
        var results = picker.querySelectorAll('.referral-student-option');
        var selectedRow = picker.querySelector('[data-referral-student-selected]');
        var selectedName = picker.querySelector('[data-referral-student-selected-name]');
        var changeBtn = picker.querySelector('[data-referral-student-change]');
        var questionFields = dialog.querySelector('[data-referral-question-fields]');
        var btnRow = dialog.querySelector('.btn-row');
        var saveBtn = dialog.querySelector('[data-referral-save]');

        function updateSaveState() {
            if (saveBtn && form) saveBtn.disabled = !form.checkValidity();
        }

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

        function showPicker() {
            animateHeightChange(function () {
                input.value = '';
                searchPanel.hidden = false;
                selectedRow.hidden = true;
                if (questionFields) questionFields.hidden = true;
                if (btnRow) btnRow.hidden = true;
                if (form) form.classList.add('is-picking-student');
                search.value = '';
                results.forEach(function (btn) { btn.hidden = false; });
                search.focus();
                updateSaveState();
            });
        }

        search.addEventListener('input', function () {
            var term = search.value.trim().toLowerCase();
            results.forEach(function (btn) {
                var name = (btn.getAttribute('data-name') || '').toLowerCase();
                btn.hidden = term.length > 0 && name.indexOf(term) === -1;
            });
        });

        results.forEach(function (btn) {
            btn.addEventListener('click', function () {
                input.value = btn.getAttribute('data-id');
                selectedName.textContent = btn.getAttribute('data-display') || btn.getAttribute('data-name');
                showForm();
            });
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
        if (e.target.closest('[data-modal-close]')) {
            closeModal();
        }
    });

    dialog.addEventListener('click', function (e) {
        if (e.target === dialog) closeModal();
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
})();

(function () {
    var dialog = document.getElementById('panel-group-dialog');
    if (!dialog) return;

    function getModalDuration() {
        return parseFloat(getComputedStyle(dialog).getPropertyValue('--modal-duration')) || 250;
    }

    function closeModal() {
        dialog.classList.remove('is-open');
        setTimeout(function () { dialog.close(); }, getModalDuration());
    }

    function wireRequiredFields() {
        var form = dialog.querySelector('[data-panel-group-modal-form]');
        var saveBtn = dialog.querySelector('[data-create-group-save]');
        if (!form || !saveBtn) return;
        var dataEl = document.getElementById('existing-panel-groups');
        var existingGroups = dataEl ? JSON.parse(dataEl.textContent) : [];

        function updateSaveState() {
            var name = (form.elements.name.value || '').trim();
            var schoolVal = form.elements.school ? form.elements.school.value : '';
            var valid = form.checkValidity() && !!name && !!schoolVal;
            if (valid) {
                var nameLower = name.toLowerCase();
                var schoolIdNum = parseInt(schoolVal, 10);
                var duplicate = existingGroups.some(function (g) {
                    return g.name.toLowerCase() === nameLower && g.school_id === schoolIdNum;
                });
                valid = !duplicate;
            }
            saveBtn.disabled = !valid;
        }
        form.addEventListener('input', updateSaveState);
        form.addEventListener('change', updateSaveState);
        updateSaveState();
    }

    window.openPanelGroupModal = function (schoolId) {
        var url = '/inclusion/panel/groups/new/?';
        if (schoolId) url += 'school=' + encodeURIComponent(schoolId);
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.text(); })
            .then(function (html) {
                dialog.innerHTML = html;
                window.enhanceFormControls(dialog);
                wireRequiredFields();
                dialog.showModal();
                requestAnimationFrame(function () { dialog.classList.add('is-open'); });
            });
    };

    // Registered with the generic `.ui-select-row` "+" button handler in
    // main.js (see `window.uiSelectRowAdders`) — works for any Panel Group
    // select on any page, not just the ones panel.js itself renders.
    window.uiSelectRowAdders = window.uiSelectRowAdders || {};
    window.uiSelectRowAdders['panel-group'] = function (select) {
        var schoolId = '';
        if (select) {
            var options = Array.prototype.slice.call(select.options).filter(function (opt) { return opt.value; });
            schoolId = window.resolvePanelSchoolFilter(options, select.dataset.currentStaffSchool);
        }
        window.openPanelGroupModal(schoolId);
    };

    document.addEventListener('click', function (e) {
        if (e.target.closest('[data-modal-close]') && e.target.closest('#panel-group-dialog')) {
            closeModal();
        }
    });

    dialog.addEventListener('click', function (e) {
        if (e.target === dialog) closeModal();
    });

    dialog.addEventListener('submit', function (e) {
        var form = e.target.closest('[data-panel-group-modal-form]');
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
                    document.dispatchEvent(new CustomEvent('panel-group:created', { detail: data.group }));
                }
            });
    });
})();

(function () {
    var dialog = document.getElementById('panel-meeting-dialog');
    if (!dialog) return;

    // Options for the Panel Group select, captured whole (including ones
    // hidden by the current School filter) so switching School back and
    // forth never permanently loses an option the way removing them from
    // the DOM would.
    var allGroupOptions = [];

    function getModalDuration() {
        return parseFloat(getComputedStyle(dialog).getPropertyValue('--modal-duration')) || 250;
    }

    function closeModal() {
        dialog.classList.remove('is-open');
        setTimeout(function () { dialog.close(); }, getModalDuration());
    }

    function applyGroupFilter() {
        var groupSelect = dialog.querySelector('#new-panel-group');
        var schoolSelect = dialog.querySelector('[data-panel-school-select]');
        if (!groupSelect) return;
        var schoolId = schoolSelect ? schoolSelect.value : '';
        var placeholder = groupSelect.querySelector('option[value=""]');
        var previousValue = groupSelect.value;
        groupSelect.innerHTML = '';
        if (placeholder) groupSelect.appendChild(placeholder);
        var visible = allGroupOptions.filter(function (opt) {
            return !schoolId || opt.dataset.school === schoolId;
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

    window.openPanelMeetingModal = function () {
        fetch('/inclusion/panel/meetings/new/', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.text(); })
            .then(function (html) {
                dialog.innerHTML = html;
                wireSchoolFilter();
                wireRequiredFields();
                window.enhanceFormControls(dialog);
                dialog.showModal();
                requestAnimationFrame(function () { dialog.classList.add('is-open'); });
            });
    };

    document.addEventListener('click', function (e) {
        if (e.target.closest('[data-create-panel-trigger]')) {
            window.openPanelMeetingModal();
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

// "View Actions" - lets a Referral Selection row check on/toggle a referral's
// actions without navigating away from Panel Setup. Unlike the other modals
// here, the toggle-status form's response is HTML (the same fragment,
// re-rendered with the new status), not JSON, and never reloads the page or
// closes the dialog - the whole point is to stay open while checking off
// several actions in a row. The row's own "X of Y complete" count is left to
// go stale until the next natural page load, deliberately, rather than
// wiring up a live patch for what's secondary information.
(function () {
    var dialog = document.getElementById('referral-actions-dialog');
    if (!dialog) return;

    function getModalDuration() {
        return parseFloat(getComputedStyle(dialog).getPropertyValue('--modal-duration')) || 250;
    }

    function closeModal() {
        dialog.classList.remove('is-open');
        setTimeout(function () { dialog.close(); }, getModalDuration());
    }

    function openActionsModal(referralId) {
        var url = '/inclusion/panel/referrals/' + encodeURIComponent(referralId) + '/actions/modal/';
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.text(); })
            .then(function (html) {
                dialog.innerHTML = html;
                window.enhanceFormControls(dialog);
                dialog.showModal();
                requestAnimationFrame(function () { dialog.classList.add('is-open'); });
            });
    }

    document.addEventListener('click', function (e) {
        var trigger = e.target.closest('[data-view-actions-trigger]');
        if (trigger) {
            openActionsModal(trigger.getAttribute('data-referral-id'));
            return;
        }
        if (e.target.closest('[data-modal-close]') && e.target.closest('#referral-actions-dialog')) {
            closeModal();
        }
    });

    dialog.addEventListener('click', function (e) {
        if (e.target === dialog) closeModal();
    });

    dialog.addEventListener('submit', function (e) {
        var form = e.target.closest('[data-action-toggle-form]');
        if (!form) return;
        e.preventDefault();

        fetch(form.action, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: new FormData(form),
        }).then(function (res) { return res.text(); })
            .then(function (html) {
                dialog.innerHTML = html;
                window.enhanceFormControls(dialog);
            });
    });

    // A plain <select> change doesn't submit its form on its own - the
    // status dropdown auto-submits so there's no separate save button to
    // click per action.
    dialog.addEventListener('change', function (e) {
        var select = e.target.closest('[data-action-status-select]');
        if (select) select.form.requestSubmit();
    });
})();

// Shared "staff source + search" member picker, used by the meeting "Add
// Member" dialog and the Panel Group "Add Member" form. Several instances
// can exist on one page (one per panel group), so everything is scoped via
// closest()/querySelector() on the picker's own root rather than global ids.
function initMemberPicker(rootEl) {
    var sourceSelect = rootEl.querySelector('[data-member-source-select]');
    var searchInput = rootEl.querySelector('[data-member-search]');
    var staffInput = rootEl.querySelector('[data-member-staff-input]');
    var externalInput = rootEl.querySelector('[data-member-external-input]');
    var resultList = rootEl.querySelector('[data-member-result-list]');
    var options = Array.prototype.slice.call(rootEl.querySelectorAll('.member-result-option'));
    var searchPanel = rootEl.querySelector('[data-member-search-panel]');
    var selectedSection = rootEl.querySelector('[data-member-selected]');
    var selectedName = rootEl.querySelector('[data-member-selected-name]');
    var changeBtn = rootEl.querySelector('[data-member-change]');
    var addExternalRow = rootEl.querySelector('[data-member-add-external]');
    var addExternalToggle = rootEl.querySelector('[data-member-add-external-toggle]');
    var addExternalFields = rootEl.querySelector('[data-member-add-external-fields]');
    var addExternalNameInput = rootEl.querySelector('[data-member-add-external-name]');
    var addExternalTitleInput = rootEl.querySelector('[data-member-add-external-title]');
    var schoolId = rootEl.dataset.schoolId || '';
    if (!sourceSelect || !searchInput) return;

    function csrfToken() {
        var form = rootEl.closest('form');
        var input = form ? form.querySelector('input[name="csrfmiddlewaretoken"]') : null;
        return input ? input.value : '';
    }

    function dispatchChange(type, id, name) {
        rootEl.dispatchEvent(new CustomEvent('member-picker:change', { bubbles: true, detail: { type: type, id: id, name: name } }));
    }

    function applySearch() {
        var term = searchInput.value.trim().toLowerCase();
        var mode = sourceSelect.value;
        options.forEach(function (btn) {
            var source = btn.dataset.source;
            var matchesSearch = !term || btn.dataset.name.toLowerCase().indexOf(term) !== -1;
            var matchesMode;
            if (mode === 'external') {
                matchesMode = source === 'external';
            } else if (mode === 'school') {
                matchesMode = source === 'staff' && btn.dataset.schoolId === schoolId;
            } else {
                // "All MAT Staff" — every staff record, regardless of school or is_mat_staff.
                matchesMode = source === 'staff';
            }
            btn.hidden = !(matchesSearch && matchesMode);
        });
        // Adding a new External contact is always on offer once External mode
        // is selected (not just as a "no match" fallback).
        if (addExternalRow) addExternalRow.hidden = mode !== 'external';
    }

    function showPicker() {
        staffInput.value = '';
        externalInput.value = '';
        dispatchChange('', '', '');
        searchPanel.hidden = false;
        selectedSection.hidden = true;
        searchInput.value = '';
        applySearch();
    }

    function showSelected(name) {
        selectedName.textContent = name;
        searchPanel.hidden = true;
        selectedSection.hidden = false;
    }

    function setMode(mode) {
        sourceSelect.value = mode;
        showPicker();
    }

    function reset() {
        var hasSchoolOption = !!rootEl.querySelector('[data-member-source-select] option[value="school"]');
        setMode(hasSchoolOption ? 'school' : 'mat');
    }

    sourceSelect.addEventListener('change', function () { setMode(sourceSelect.value); });
    searchInput.addEventListener('input', applySearch);
    if (changeBtn) changeBtn.addEventListener('click', showPicker);

    rootEl.addEventListener('click', function (e) {
        if (addExternalToggle && e.target.closest('[data-member-add-external-toggle]')) {
            addExternalFields.hidden = !addExternalFields.hidden;
            if (!addExternalFields.hidden) {
                if (!addExternalNameInput.value) addExternalNameInput.value = searchInput.value.trim();
                addExternalNameInput.focus();
            }
            return;
        }
        var optBtn = e.target.closest('.member-result-option');
        if (optBtn) {
            if (optBtn.dataset.alreadyMember === '1') return;
            if (optBtn.dataset.source === 'staff') {
                staffInput.value = optBtn.dataset.id;
                externalInput.value = '';
                dispatchChange('staff', optBtn.dataset.id, optBtn.dataset.name);
            } else {
                externalInput.value = optBtn.dataset.id;
                staffInput.value = '';
                dispatchChange('external', optBtn.dataset.id, optBtn.dataset.name);
            }
            showSelected(optBtn.dataset.name);
            return;
        }
        if (e.target.closest('[data-member-add-external-save]')) {
            var name = (addExternalNameInput.value || '').trim();
            if (!name) return;
            var jobTitle = addExternalTitleInput ? addExternalTitleInput.value.trim() : '';
            var fd = new FormData();
            fd.append('name', name);
            fd.append('job_title', jobTitle);
            fd.append('csrfmiddlewaretoken', csrfToken());
            fetch('/inclusion/panel/external-contacts/quick-add/', {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                body: fd,
            }).then(function (res) { return res.json(); })
                .then(function (data) {
                    if (!data.success) return;
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'member-result-option';
                    btn.dataset.source = 'external';
                    btn.dataset.id = data.contact.id;
                    btn.dataset.name = data.contact.name;
                    var stack = document.createElement('span');
                    stack.className = 'member-result-label-stack';
                    var nameSpan = document.createElement('span');
                    nameSpan.className = 'result-name';
                    nameSpan.textContent = data.contact.name;
                    stack.appendChild(nameSpan);
                    if (data.contact.job_title) {
                        var roleSpan = document.createElement('span');
                        roleSpan.className = 'result-role';
                        roleSpan.textContent = data.contact.job_title;
                        stack.appendChild(roleSpan);
                    }
                    btn.appendChild(stack);
                    resultList.appendChild(btn);
                    options.push(btn);
                    addExternalFields.hidden = true;
                    addExternalNameInput.value = '';
                    addExternalTitleInput.value = '';
                    externalInput.value = data.contact.id;
                    staffInput.value = '';
                    dispatchChange('external', data.contact.id, data.contact.name);
                    showSelected(data.contact.name);
                });
        }
    });

    applySearch();
    rootEl._memberPicker = { reset: reset };
}

window.resetMemberPicker = function (rootEl) {
    if (rootEl && rootEl._memberPicker) rootEl._memberPicker.reset();
};

// Shared drag-and-drop for moving referrals onto/off/around a panel's agenda
// (Panel Setup's Referral Selection <-> Panel Agenda columns, and the live
// Meeting Agenda's Follow-ups Due card <-> Students Pending list). One "sink"
// zone holds the actual agenda and supports live reordering; any number of
// "pool" zones (New Referrals, Due Follow-up, Follow-ups Due) are add
// sources and double as remove targets when something is dragged back out
// of the sink. Dropped rows are never mutated directly - every drop either
// persists a new order (no reload, the drag already left the DOM in the
// right shape) or calls the same form_action the existing Add/Remove buttons
// already use, then reloads so counts/tabs/empty-states stay in sync.
//
// Defined at top level (not inside a DOMContentLoaded callback) so it's
// available the moment panel.js parses — layout.html renders
// {% block content %} (where pages call this) before {% block extra_scripts %}
// (where panel.js itself loads), so a page's own DOMContentLoaded listener
// always registers, and fires, before one nested inside this file would.
window.initAgendaDragDrop = function (zoneConfig, options) {
    options = options || {};
    var removeAction = options.removeAction || 'remove_referral_from_agenda';
    var zones = {};
    var dragged = null;

    // A single shared "drop here" bar, moved to wherever the pointer is
    // hovering in a sink list - shown instead of live-reordering the actual
    // rows during drag, so the list doesn't visibly swap/shuffle around
    // until the drop actually happens.
    var dropIndicator = document.createElement('div');
    dropIndicator.className = 'agenda-drop-indicator';

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

    // Brief colour-coded flash (green/added, yellow/moved, red/removed) so an
    // action reads as feedback rather than a silent DOM change. The flash
    // colour itself snaps on instantly (no transition on the class add), then
    // fades back out over 1s via a transition set inline just for that
    // moment - keeping .entity-row/.agenda-preview-item free of any
    // permanent transition that would otherwise also catch (and fade) the
    // .selectable hover fill.
    function flash(el, kind) {
        if (!el) return;
        el.classList.add('agenda-flash-' + kind);
        setTimeout(function () {
            el.style.transition = 'background-color 1s ease';
            el.classList.remove('agenda-flash-' + kind);
            el.addEventListener('transitionend', function clearTransition() {
                el.style.transition = '';
            }, { once: true });
        }, 1200);
    }

    // Both row animations below use the Web Animations API (Element.animate)
    // rather than toggling a CSS transition class - explicit from/to
    // keyframes over a fixed duration are scheduled directly by the browser's
    // animation engine, so there's no dependency on catching an intermediate
    // painted frame the way a manually reflow-forced CSS transition has (that
    // approach - even with a double rAF - still intermittently snapped
    // straight to the end state instead of animating, especially on
    // freshly-inserted rows or under load from the concurrent fetch).
    var ROW_ANIM_DURATION = 900;
    var ROW_ANIM_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

    // Removing collapses the row in place (rather than just flashing red
    // somewhere it reappears once zones refresh, which doesn't read as "this
    // went away"). Animates max-height/opacity/padding/margin together from
    // the row's current rendered size down to 0.
    // If this element still has an animation in flight from a previous
    // shrinkAndFadeOut/growIn call (e.g. the same row reordered twice in
    // quick succession before the first grow-in finished), cancel it first.
    // Two Element.animate() effects racing on the same properties otherwise
    // fight each other - the browser has to arbitrate between them, which is
    // exactly what made some reorders/adds look like they'd snapped
    // instantly instead of animating. Cancelling also reverts the element to
    // its underlying (un-animated) style, so the height measured right after
    // is always the row's true natural height, not a mid-animation value.
    function cancelRowAnim(el) {
        if (el._rowAnim) {
            el._rowAnim.cancel();
            el._rowAnim = null;
        }
    }

    function shrinkAndFadeOut(el, done) {
        if (!el) { done(); return; }
        cancelRowAnim(el);
        var height = el.getBoundingClientRect().height;
        var cs = getComputedStyle(el);
        el.classList.add('agenda-row-removing');
        var anim = el.animate([
            { maxHeight: height + 'px', opacity: 1, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom },
            { maxHeight: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' },
        ], { duration: ROW_ANIM_DURATION, easing: ROW_ANIM_EASING, fill: 'forwards' });
        el._rowAnim = anim;
        var finished = false;
        function finish() {
            if (finished) return;
            finished = true;
            if (el._rowAnim === anim) el._rowAnim = null;
            anim.cancel();
            done();
        }
        anim.onfinish = finish;
        anim.oncancel = finish;
        setTimeout(finish, ROW_ANIM_DURATION + 150);
    }

    // Mirror of shrinkAndFadeOut for a freshly-added or just-moved row:
    // animates from collapsed/transparent up to its natural height/padding/
    // margin and full opacity, instead of just appearing at full size.
    function growIn(el) {
        if (!el) return;
        cancelRowAnim(el);
        var targetHeight = el.getBoundingClientRect().height;
        var cs = getComputedStyle(el);
        el.classList.add('agenda-row-adding');
        var anim = el.animate([
            { maxHeight: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' },
            { maxHeight: targetHeight + 'px', opacity: 1, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom },
        ], { duration: ROW_ANIM_DURATION, easing: ROW_ANIM_EASING, fill: 'forwards' });
        el._rowAnim = anim;
        var finished = false;
        function finish() {
            if (finished) return;
            finished = true;
            if (el._rowAnim === anim) el._rowAnim = null;
            el.classList.remove('agenda-row-adding');
            anim.cancel();
        }
        anim.onfinish = finish;
        anim.oncancel = finish;
        setTimeout(finish, ROW_ANIM_DURATION + 150);
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
        if (!info) return;
        (names || zoneNames).forEach(function (name) {
            rowsIn(zones[name]).forEach(function (row) {
                var referralId = row.dataset.referralId || row.dataset.dropId;
                if (referralId !== info.id) return;
                flash(row, info.kind);
                if (info.grow) growIn(row);
            });
        });
    }

    // Fetches this same page fresh (does not touch the DOM yet).
    function fetchFreshDoc() {
        return fetch(window.location.pathname, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (resp) { return resp.text(); })
            .then(function (html) { return new DOMParser().parseFromString(html, 'text/html'); });
    }

    // Swaps in just the given zone names' columns from a freshly-fetched
    // document, instead of a full window.location.reload() - keeps
    // counts/tabs/order in sync with the server without the jarring
    // full-page flash. Zone elements, their rows, and the tab-switcher all
    // get rebound against the new DOM. names defaults to every zone.
    function applyFreshDoc(doc, flashInfo, names) {
        names = names || zoneNames;
        var swappedCols = [];
        names.forEach(function (name) {
            var freshZoneEl = doc.querySelector('[data-drop-zone="' + name + '"]');
            var oldZoneEl = zones[name].el;
            if (!freshZoneEl || !oldZoneEl) return;
            var freshCol = freshZoneEl.closest('.setup-col') || freshZoneEl;
            var oldCol = oldZoneEl.closest('.setup-col') || oldZoneEl;
            if (swappedCols.indexOf(oldCol) !== -1) return;
            swappedCols.push(oldCol);
            oldCol.replaceWith(freshCol);
        });
        names.forEach(function (name) {
            var freshZoneEl = document.querySelector('[data-drop-zone="' + name + '"]');
            if (freshZoneEl) zones[name].el = freshZoneEl;
        });
        names.forEach(bindZone);
        if (window.initReferralTabs) window.initReferralTabs();
        flashAcrossZones(flashInfo, names);
    }

    // For actions with no local row animation to protect (reorder fallback,
    // drag-add's source side) - fetch and swap in as soon as the fetch itself
    // resolves.
    function refreshZones(flashInfo) {
        return fetchFreshDoc().then(function (doc) { applyFreshDoc(doc, flashInfo); });
    }

    // For actions that also shrink a row locally (Add/Remove buttons,
    // drag-remove/drag-add) - fetches concurrently with that animation, and
    // swaps in every zone *except* the animating row's own straight away,
    // rather than waiting for the shrink to finish too. Waiting for
    // everything used to make the row reappearing elsewhere (e.g. back in
    // Referral Selection after Remove) visibly pause until the old row had
    // fully disappeared. The animating row's own zone is left alone - so the
    // row keeps shrinking undisturbed, in its normal layout position, right
    // where it already is - until animDone resolves, at which point that one
    // zone is swapped in too (harmlessly, since the row is already collapsed
    // to nothing by then). This avoids pulling the row out into a separate
    // overlay to fake the overlap, which read as two disconnected layers
    // moving independently.
    function refreshZonesAfter(animatingEl, animDone, flashInfo) {
        return fetchFreshDoc().then(function (doc) {
            var animatingZoneEl = animatingEl && animatingEl.closest('[data-drop-zone]');
            var deferredCol = animatingZoneEl && (animatingZoneEl.closest('.setup-col') || animatingZoneEl);
            // Group by column, not just zone name - two zone names (e.g.
            // "new-referrals"/"followups") can share one physical column (the
            // tabbed Referral Selection panel), so deferring only the
            // animating row's own zone name would still let the other name's
            // swap tear out that whole shared column from under it.
            var deferredNames = deferredCol ? zoneNames.filter(function (name) {
                var zoneEl = zones[name].el;
                return zoneEl && (zoneEl.closest('.setup-col') || zoneEl) === deferredCol;
            }) : [];
            var immediateNames = zoneNames.filter(function (name) { return deferredNames.indexOf(name) === -1; });
            applyFreshDoc(doc, flashInfo, immediateNames);
            if (!deferredNames.length) return;
            return animDone.then(function () {
                applyFreshDoc(doc, null, deferredNames);
            });
        });
    }

    // The Add/Remove/Priority-up-down buttons are plain <form> submits - this
    // intercepts them so they go through the same fetch + refreshZones path
    // as drag-and-drop, instead of a full browser navigation.
    var FORM_ACTION_KIND = {
        add_referral: 'added',
        add_followup_to_agenda: 'added',
    };
    var REMOVE_ACTIONS = ['remove_referral_from_agenda', 'unassign_referral'];

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
            if (REMOVE_ACTIONS.indexOf(actionValue) !== -1) {
                e.preventDefault();
                flash(row, 'removed');
                // Row's shrink-out runs alongside the submit rather than
                // blocking it, and the DOM swap (once the submit resolves)
                // doesn't wait for the shrink to finish either - see
                // refreshZonesAfter, which keeps this row alive as a ghost so
                // the swap can happen immediately without cutting it short.
                var removeAnimDone = new Promise(function (resolve) { shrinkAndFadeOut(row, resolve); });
                submitFormAsync(form).then(function () {
                    // The referral reappears in its pool list (Referral
                    // Selection) once zones refresh - grow it in there too,
                    // not just a silent reappearance, flashing red (not
                    // green) since this is still fundamentally a removal.
                    return refreshZonesAfter(row, removeAnimDone, { id: referralId, kind: 'removed', grow: true });
                });
                return;
            }
            if (FORM_ACTION_KIND[actionValue] === 'added') {
                // Same shrink-and-fade treatment as Remove, so the row leaving
                // the pool list reads as a deliberate action instead of just
                // vanishing the instant the page refreshes.
                e.preventDefault();
                flash(row, 'added');
                var addAnimDone = new Promise(function (resolve) { shrinkAndFadeOut(row, resolve); });
                submitFormAsync(form).then(function () {
                    return refreshZonesAfter(row, addAnimDone, { id: referralId, kind: 'added', grow: true });
                });
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
            var numberEl = row.querySelector('.agenda-order-number');
            if (numberEl) numberEl.textContent = index + 1;
            // The up/down arrows' disabled state (see
            // _agenda_order_controls.html - up button first, down second)
            // is only ever set server-side, at initial render, based on
            // forloop.first/forloop.last. Any reorder that happens purely
            // client-side (arrows, drag) needs to refresh it too, or a row
            // that's no longer first/last is stuck with a disabled arrow
            // that should now be enabled (and vice versa) until the next
            // full page load - e.g. moving the first item down used to leave
            // its up arrow disabled forever.
            var arrowBtns = row.querySelectorAll('.agenda-order-arrow-btn');
            if (arrowBtns[0]) arrowBtns[0].disabled = index === 0;
            if (arrowBtns[1]) arrowBtns[1].disabled = index === rows.length - 1;
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
            var animDone = new Promise(function (resolve) { shrinkAndFadeOut(rowEl, resolve); });
            // The new PanelReferral always lands at the bottom of the agenda
            // server-side (see _next_agenda_order) - follow up the add with
            // a reorder_agenda call that puts it where the drop indicator
            // actually was, using the id the add response hands back.
            var body = new URLSearchParams();
            // Referral Selection's "All" tab mixes New Referral and Due
            // Follow-up rows in one zone - the row's own data-add-action
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
                return refreshZonesAfter(rowEl, animDone, { id: referralId, kind: 'added', grow: true });
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
        var animDone = new Promise(function (resolve) { shrinkAndFadeOut(rowEl, resolve); });
        postForm(removeBody).then(function () {
            // Reappears back in Referral Selection - flash red (a removal),
            // not green, since nothing was actually added.
            return refreshZonesAfter(rowEl, animDone, { id: referralId, kind: 'removed', grow: true });
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
            }
        });
        row.addEventListener('dragend', function () {
            if (dragged) dragged.el.classList.remove('dragging');
            dragged = null;
            removeIndicator();
            zoneNames.forEach(function (n) {
                clearDragOver(zones[n].el);
                dragOverTarget(zones[n].el).classList.remove('drag-remove-armed');
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
};

document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-member-picker-root]').forEach(initMemberPicker);

    document.querySelectorAll('[data-expertise-add-toggle]').forEach(function (toggleBtn) {
        var row = toggleBtn.closest('.expertise-field-row');
        if (!row) return;
        var addPanel = row.querySelector('[data-expertise-add-panel]');
        var select = row.querySelector('[data-expertise-select]');
        var input = row.querySelector('[data-expertise-add-input]');
        var saveBtn = row.querySelector('[data-expertise-add-save]');
        if (!addPanel || !select || !input || !saveBtn) return;

        toggleBtn.addEventListener('click', function () {
            addPanel.hidden = !addPanel.hidden;
            if (!addPanel.hidden) input.focus();
        });

        saveBtn.addEventListener('click', function () {
            var name = input.value.trim();
            if (!name) return;
            var form = row.closest('form');
            var csrfInput = form ? form.querySelector('input[name="csrfmiddlewaretoken"]') : null;
            var fd = new FormData();
            fd.append('name', name);
            fd.append('school_id', select.dataset.expertiseSchoolId || '');
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
                    select.appendChild(opt);
                    select.value = data.expertise.id;
                    input.value = '';
                    addPanel.hidden = true;
                });
        });
    });

(function () {
    var dialog = document.getElementById('panel-search-dialog');
    if (!dialog) return;

    var input = document.getElementById('panel-search-input');
    var results = document.getElementById('panel-search-results');
    var kindLabels = { student: 'Students', staff: 'Staff' };
    var debounceTimer = null;

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getModalDuration() {
        return parseFloat(getComputedStyle(dialog).getPropertyValue('--modal-duration')) || 250;
    }

    function getTransitionSlowMs() {
        return parseFloat(getComputedStyle(dialog).getPropertyValue('--transition-slow')) || 400;
    }

    function openModal() {
        results.innerHTML = '';
        dialog.showModal();
        requestAnimationFrame(function () {
            dialog.classList.add('is-open');
            input.focus();
        });
    }

    function closeModal() {
        dialog.classList.remove('is-open');
        setTimeout(function () { dialog.close(); }, getModalDuration());
    }

    function renderResults(items) {
        if (!items.length) {
            results.innerHTML = '<p class="empty-note">No matches found.</p>';
            return;
        }
        var groups = {};
        items.forEach(function (item) {
            (groups[item.kind] = groups[item.kind] || []).push(item);
        });
        var html = '';
        ['student', 'staff'].forEach(function (kind) {
            if (!groups[kind]) return;
            html += '<div class="search-result-group">';
            html += '<h3 class="search-result-group-label">' + kindLabels[kind] + '</h3>';
            groups[kind].forEach(function (item) {
                html += '<div class="search-result-row">';
                html += '<div class="search-result-text">';
                html += '<span class="search-result-title">' + escapeHtml(item.title) + '</span>';
                html += '<span class="search-result-subtitle">' + escapeHtml(item.subtitle) + '</span>';
                html += '</div>';
                html += '<div class="btn-row">';
                item.links.forEach(function (link) {
                    if (link.disabled) {
                        html += '<span class="btn btn-sm btn-disabled" aria-disabled="true">' + escapeHtml(link.label) + '</span>';
                    } else {
                        html += '<a class="btn btn-sm" href="' + escapeHtml(link.url) + '">' + escapeHtml(link.label) + '</a>';
                    }
                });
                html += '</div>';
                html += '</div>';
            });
            html += '</div>';
        });
        results.innerHTML = html;
    }

    function runSearch(q) {
        fetch('/inclusion/panel/search/?q=' + encodeURIComponent(q), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.json(); })
            .then(function (data) { renderResults(data.results); });
    }

    input.addEventListener('input', function () {
        var q = input.value.trim();
        clearTimeout(debounceTimer);
        if (q.length === 0) {
            results.innerHTML = '';
            return;
        }
        if (q.length === 1) {
            debounceTimer = setTimeout(function () {
                results.innerHTML = '<p class="empty-note search-hint">Keep typing… (2+ characters)</p>';
            }, getTransitionSlowMs());
            return;
        }
        debounceTimer = setTimeout(function () { runSearch(q); }, 250);
    });

    document.addEventListener('click', function (e) {
        if (e.target.closest('[data-panel-search-trigger]')) {
            openModal();
            return;
        }
        if (e.target.closest('[data-modal-close]') && e.target.closest('#panel-search-dialog')) {
            closeModal();
        }
    });

    dialog.addEventListener('click', function (e) {
        if (e.target === dialog) closeModal();
    });
})();
});
