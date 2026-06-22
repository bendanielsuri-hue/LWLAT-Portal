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
