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

    // Member rows: a single row grows into a new empty one as soon as it's
    // filled in (staff picked, or a guest name typed for "Other"); rows can
    // also be deleted outright via the row's remove button (but never the
    // last one — to drop the final member, the user just clears its fields,
    // which the "skip if blank" POST handling already tolerates). The first
    // member to be filled in becomes the default chair automatically, unless
    // the user has already made an explicit chair choice (chairTouched).
    function wireMemberRows(updateSaveState) {
        var rowsContainer = dialog.querySelector('[data-member-rows]');
        var form = dialog.querySelector('[data-panel-group-modal-form]');
        var defaultChairInput = dialog.querySelector('[data-default-chair-input]');
        if (!rowsContainer || !form) return;

        var staffDataEl = document.getElementById('panel-group-staff-options');
        var staffOptions = staffDataEl ? JSON.parse(staffDataEl.textContent) : [];
        var chairTouched = false;

        // Captured before enhanceFormControls() runs, so this is always pristine
        // native markup — cloning an already-enhanced row would duplicate its
        // custom trigger/popover DOM instead of producing a fresh select.
        var rowTemplate = rowsContainer.querySelector('.panel-group-member-row').outerHTML;

        function allRows() {
            return Array.prototype.slice.call(rowsContainer.querySelectorAll('[data-member-row]'));
        }

        function currentSchoolId() {
            var schoolField = form.elements.school;
            return schoolField ? schoolField.value : '';
        }

        function chosenStaffIdsExcluding(excludeRow) {
            return allRows().filter(function (r) { return r !== excludeRow; })
                .map(function (r) { return r.querySelector('[data-member-staff-value]').value; })
                .filter(Boolean);
        }

        function refreshRowResults(row) {
            var mode = row.querySelector('[data-member-staff-group]').value;
            var schoolId = currentSchoolId();
            var term = row.querySelector('[data-member-staff-search]').value.trim().toLowerCase();
            var chosenElsewhere = chosenStaffIdsExcluding(row);
            row.querySelectorAll('.staff-option').forEach(function (btn) {
                var eligible = mode === 'mat' ? btn.dataset.mat === '1' : String(btn.dataset.school) === String(schoolId);
                var matchesTerm = !term || btn.dataset.name.toLowerCase().indexOf(term) !== -1;
                var isDuplicate = chosenElsewhere.indexOf(btn.dataset.id) !== -1;
                btn.hidden = !eligible || !matchesTerm;
                btn.disabled = isDuplicate;
                btn.textContent = btn.dataset.name + (isDuplicate ? ' (already added)' : '');
            });
        }

        function refreshAllRowResults() {
            allRows().forEach(refreshRowResults);
        }

        function buildStaffOptions(row) {
            var resultsEl = row.querySelector('[data-member-staff-results]');
            var searchEl = row.querySelector('[data-member-staff-search]');
            var valueEl = row.querySelector('[data-member-staff-value]');
            staffOptions.forEach(function (opt) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'staff-option';
                btn.dataset.id = opt.id;
                btn.dataset.name = opt.name;
                btn.dataset.school = opt.school_id == null ? '' : opt.school_id;
                btn.dataset.mat = opt.is_mat_staff ? '1' : '0';
                btn.textContent = opt.name;
                btn.addEventListener('click', function () {
                    if (btn.disabled) return;
                    searchEl.value = opt.name;
                    valueEl.value = opt.id;
                    resultsEl.hidden = true;
                    onRowChanged(row);
                });
                resultsEl.appendChild(btn);
            });
        }

        function isRowFilled(row) {
            var mode = row.querySelector('[data-member-staff-group]').value;
            if (mode === 'other') {
                return !!row.querySelector('[name="member_guest_name"]').value.trim();
            }
            return !!row.querySelector('[data-member-staff-value]').value;
        }

        function setChair(row) {
            allRows().forEach(function (r) { r.querySelector('[data-row-chair-btn]').classList.remove('is-chair'); });
            row.querySelector('[data-row-chair-btn]').classList.add('is-chair');
            defaultChairInput.value = row.querySelector('[data-member-staff-value]').value;
        }

        function clearChair() {
            allRows().forEach(function (r) { r.querySelector('[data-row-chair-btn]').classList.remove('is-chair'); });
            defaultChairInput.value = '';
        }

        function maybeAutoSetChair(row) {
            if (chairTouched || defaultChairInput.value) return;
            if (row.querySelector('[data-member-staff-group]').value === 'other') return;
            setChair(row);
        }

        function onRowChanged(row) {
            refreshAllRowResults();
            if (isRowFilled(row)) {
                maybeAutoSetChair(row);
                var rows = allRows();
                if (row === rows[rows.length - 1]) appendRow();
            }
            updateSaveState();
        }

        function wireRow(row) {
            var groupSelect = row.querySelector('[data-member-staff-group]');
            var searchEl = row.querySelector('[data-member-staff-search]');
            var valueEl = row.querySelector('[data-member-staff-value]');
            var resultsEl = row.querySelector('[data-member-staff-results]');
            var staffField = row.querySelector('[data-member-staff-field]');
            var guestField = row.querySelector('[name="member_guest_name"]');
            var chairBtn = row.querySelector('[data-row-chair-btn]');
            var removeBtn = row.querySelector('[data-remove-member-row]');

            buildStaffOptions(row);

            groupSelect.addEventListener('change', function () {
                var mode = groupSelect.value;
                var wasChair = chairBtn.classList.contains('is-chair');
                staffField.hidden = mode === 'other';
                guestField.hidden = mode !== 'other';
                searchEl.value = '';
                valueEl.value = '';
                guestField.value = '';
                resultsEl.hidden = true;
                chairBtn.disabled = mode === 'other';
                if (mode === 'other' && wasChair) clearChair();
                refreshRowResults(row);
                updateSaveState();
            });

            searchEl.addEventListener('focus', function () {
                resultsEl.hidden = false;
                refreshRowResults(row);
            });
            searchEl.addEventListener('input', function () {
                valueEl.value = '';
                resultsEl.hidden = false;
                refreshRowResults(row);
                updateSaveState();
            });

            guestField.addEventListener('input', function () { onRowChanged(row); });

            chairBtn.addEventListener('click', function () {
                chairTouched = true;
                if (chairBtn.classList.contains('is-chair')) {
                    clearChair();
                } else {
                    setChair(row);
                }
                updateSaveState();
            });

            removeBtn.addEventListener('click', function () {
                if (allRows().length <= 1) return;
                var wasChair = chairBtn.classList.contains('is-chair');
                row.remove();
                if (wasChair) clearChair();
                refreshAllRowResults();
                updateSaveState();
            });
        }

        function appendRow() {
            var temp = document.createElement('div');
            temp.innerHTML = rowTemplate;
            var newRow = temp.firstElementChild;
            rowsContainer.appendChild(newRow);
            window.enhanceFormControls(newRow);
            wireRow(newRow);
        }

        // Close any open staff-search results when clicking elsewhere in the
        // form. Bound to `form` (recreated every time the modal's innerHTML
        // is replaced) rather than the persistent `dialog` element, so this
        // listener doesn't pile up across repeated modal opens.
        form.addEventListener('click', function (e) {
            allRows().forEach(function (row) {
                if (!row.contains(e.target)) {
                    var resultsEl = row.querySelector('[data-member-staff-results]');
                    if (resultsEl) resultsEl.hidden = true;
                }
            });
        });

        // When the School field is a live <select> (no preselected school),
        // the row's default "School Staff" option/filter must track it.
        var topSchoolSelect = form.elements.school && form.elements.school.tagName === 'SELECT' ? form.elements.school : null;
        if (topSchoolSelect) {
            topSchoolSelect.addEventListener('change', function () {
                var selected = topSchoolSelect.options[topSchoolSelect.selectedIndex];
                var schoolName = selected ? selected.text : '';
                allRows().forEach(function (row) {
                    var opt = row.querySelector('[data-school-option]');
                    opt.textContent = schoolName ? schoolName + ' Staff' : 'School Staff';
                    var groupSelect = row.querySelector('[data-member-staff-group]');
                    if (groupSelect._uiSelect) groupSelect._uiSelect.refresh();
                    refreshRowResults(row);
                });
            });
        }

        wireRow(rowsContainer.querySelector('.panel-group-member-row'));
    }

    // Inline "+" next to a row's Expertise select: swaps to a small text
    // input + confirm, posts to the existing Expertise settings endpoint
    // (AJAX so it returns JSON instead of redirecting), then adds the new
    // tag to every expertise <select> in the open dialog.
    function wireAddExpertise(form) {
        // Bound to `form`, not the persistent `dialog`, so this listener is
        // discarded along with the old form markup on every modal re-open
        // instead of accumulating duplicates.
        form.addEventListener('click', function (e) {
            var trigger = e.target.closest('[data-add-expertise-trigger]');
            if (!trigger) return;
            var wrap = trigger.parentElement;
            if (wrap.querySelector('.member-expertise-add-input')) return;

            var addInput = document.createElement('span');
            addInput.className = 'member-expertise-add-input';
            addInput.innerHTML = '<input type="text" placeholder="New expertise…">' +
                '<button type="button" class="btn btn-add btn-sm">Add</button>';
            trigger.hidden = true;
            wrap.appendChild(addInput);
            var input = addInput.querySelector('input');
            var confirmBtn = addInput.querySelector('button');
            input.focus();

            function submit() {
                var name = input.value.trim();
                if (!name) return;
                var csrfField = form.querySelector('input[name="csrfmiddlewaretoken"]');
                fetch(form.dataset.expertiseUrl, {
                    method: 'POST',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: 'form_action=add_expertise&name=' + encodeURIComponent(name) +
                        '&csrfmiddlewaretoken=' + encodeURIComponent(csrfField ? csrfField.value : ''),
                }).then(function (res) { return res.json(); })
                    .then(function (data) {
                        if (!data.success) return;
                        form.querySelectorAll('select[name="member_expertise"]').forEach(function (select) {
                            var option = document.createElement('option');
                            option.value = data.expertise.id;
                            option.textContent = data.expertise.name;
                            select.appendChild(option);
                            if (select === wrap.querySelector('select')) select.value = data.expertise.id;
                            if (select._uiSelect) select._uiSelect.refresh();
                        });
                        addInput.remove();
                        trigger.hidden = false;
                    });
            }

            confirmBtn.addEventListener('click', submit);
            input.addEventListener('keydown', function (e2) {
                if (e2.key === 'Enter') { e2.preventDefault(); submit(); }
            });
        });
    }

    function wireRequiredFields() {
        var form = dialog.querySelector('[data-panel-group-modal-form]');
        var saveBtn = dialog.querySelector('[data-create-group-save]');
        if (!form || !saveBtn) return;
        var dataEl = document.getElementById('existing-panel-groups');
        var existingGroups = dataEl ? JSON.parse(dataEl.textContent) : [];

        function hasFilledMember() {
            return Array.prototype.some.call(form.querySelectorAll('[data-member-row]'), function (row) {
                var mode = row.querySelector('[data-member-staff-group]').value;
                if (mode === 'other') return !!row.querySelector('[name="member_guest_name"]').value.trim();
                return !!row.querySelector('[data-member-staff-value]').value;
            });
        }

        function updateSaveState() {
            var name = (form.elements.name.value || '').trim();
            var schoolVal = form.elements.school ? form.elements.school.value : '';
            var valid = form.checkValidity() && !!name && !!schoolVal && hasFilledMember();
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
        wireMemberRows(updateSaveState);
        wireAddExpertise(form);
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
