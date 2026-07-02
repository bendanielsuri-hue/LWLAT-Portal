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

    function getModalDuration() {
        return parseFloat(getComputedStyle(dialog).getPropertyValue('--modal-duration')) || 250;
    }

    function closeModal() {
        dialog.classList.remove('is-open');
        setTimeout(function () { dialog.close(); }, getModalDuration());
    }

    function wireGroupFilter() {
        var groupSelect = dialog.querySelector('#new-panel-group');
        if (!groupSelect) return;
        var options = Array.prototype.slice.call(groupSelect.options).filter(function (opt) { return opt.value; });
        var schoolId = window.resolvePanelSchoolFilter(options, groupSelect.dataset.currentStaffSchool);
        if (schoolId) {
            options = options.filter(function (opt) {
                if (opt.dataset.school !== schoolId) { opt.remove(); return false; }
                return true;
            });
        }
        if (options.length === 1) groupSelect.value = options[0].value;
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
                wireGroupFilter();
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
        if (e.target.closest('[data-create-group-trigger]') && e.target.closest('#panel-meeting-dialog')) {
            var groupSelect = dialog.querySelector('#new-panel-group');
            var schoolId = '';
            if (groupSelect) {
                var options = Array.prototype.slice.call(groupSelect.options).filter(function (opt) { return opt.value; });
                schoolId = window.resolvePanelSchoolFilter(options, groupSelect.dataset.currentStaffSchool);
            }
            window.openPanelGroupModal(schoolId);
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
});
