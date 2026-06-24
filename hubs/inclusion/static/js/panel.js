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
