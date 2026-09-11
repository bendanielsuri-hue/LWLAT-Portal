/* Promoted out of panel.js (#211) - two Action-assignment behaviours that
   share no state with each other (taxonomy.md §6 groups them in one file
   anyway: both are "Action" domain vocabulary, neither is generic enough
   to promote to static/js/). animateModalHeightChange/enhanceFormControls
   import/read from their own real homes; nothing here is set on `window` -
   initActionAssignFields has exactly one caller (dialogs/action-form.js),
   which imports it directly rather than going through a global. */

import { animateModalHeightChange } from '../../../js/components/modal.js';
import { enhanceFormControls } from '../../../js/components/form-controls.js';

// Panel Discussion's Actions column (see #51) - no Edit button, every field
// on an action row autosaves in place instead. One <form data-inline-action-
// form> per row; delegated 'change'/'focusout'/'submit' listeners on the
// card handle every row without re-wiring after each swap, since a fresh row
// fragment replaces the whole form on every save.
(function () {
    var actionsList = document.querySelector('[data-actions-list]');
    if (!actionsList) return;

    function submitInlineForm(form, submitter) {
        fetch(form.dataset.actionUrl, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: new FormData(form, submitter),
        }).then(function (res) { return res.text(); })
            .then(function (html) {
                var wrapper = document.createElement('div');
                wrapper.innerHTML = html.trim();
                var freshForm = wrapper.firstElementChild;
                if (freshForm) {
                    form.replaceWith(freshForm);
                    enhanceFormControls(freshForm);
                }
            });
    }

    actionsList.addEventListener('change', function (e) {
        var form = e.target.closest('[data-inline-action-form]');
        if (!form) return;

        // Due Date is a "1 Week/2 Weeks/1 Month/Next Half Term/Next Term/
        // Other" preset select (same shape as End Discussion's own
        // follow-up date), not a raw date field - "Other" reveals a real
        // date picker for a custom date instead. Both resolve down into one
        // hidden [data-due-date-final] input, the only one actually named
        // due_date, so the server side stays a plain "parse this ISO date
        // or clear it" - see inclusion_panel_action_inline_update.
        if (e.target.matches('[data-due-date-interval]')) {
            var customWrap = form.querySelector('[data-due-date-custom-wrap]');
            var customInput = form.querySelector('[data-due-date-custom]');
            var hidden = form.querySelector('[data-due-date-final]');
            var value = e.target.value;
            if (value === 'other') {
                customWrap.hidden = false;
                hidden.value = customInput.value;
            } else {
                customWrap.hidden = true;
                if (/^\d+$/.test(value)) {
                    var d = new Date();
                    d.setDate(d.getDate() + parseInt(value, 10));
                    hidden.value = d.toISOString().slice(0, 10);
                } else {
                    hidden.value = value; // '' (No due date) or an ISO date (Next Half/Full Term)
                }
            }
            submitInlineForm(form);
            return;
        }
        if (e.target.matches('[data-due-date-custom]')) {
            form.querySelector('[data-due-date-final]').value = e.target.value;
            submitInlineForm(form);
            return;
        }
        if (e.target.matches('select')) submitInlineForm(form);
    });
    // 'blur' doesn't bubble - 'focusout' is its bubbling equivalent, needed
    // here since this is one delegated listener on the whole card rather
    // than one per textarea. defaultValue reflects the textarea's initial
    // rendered content, so this only fires when the text actually changed,
    // not on every tab-through.
    actionsList.addEventListener('focusout', function (e) {
        var form = e.target.closest('[data-inline-action-form]');
        if (!form) return;
        if (e.target.matches('textarea') && e.target.value !== e.target.defaultValue) submitInlineForm(form);
    });
    // Status is a segmented control of real submit buttons (see
    // _discussion_action_item.html) - intercept the row's own 'submit' so
    // clicking one autosaves like every other field here instead of a real
    // page navigation.
    actionsList.addEventListener('submit', function (e) {
        var form = e.target.closest('[data-inline-action-form]');
        if (!form) return;
        e.preventDefault();
        submitInlineForm(form, e.submitter);
    });
})();

// Assign Staff Mode (#98 third revision) of the Add Action modal - a
// segmented Staff/Group source and the search box are two separate,
// independently-bordered components (not fused into one shared box), and
// there's no "current assignment" display here at all - the details step's
// own "Staff Assigned" row already shows it. The search box always reads
// "Search…" and is never prefilled with the current name. No separate
// Unassign action either: Action.assigned_to_staff/assigned_to_group stay
// either/or, so picking a different name already replaces the old one.
// Every mutation that changes this step's height (results appearing/
// clearing, switching source) is wrapped in animateModalHeightChange, same
// as every other in-place content change in these dialogs.
export function initActionAssignFields(rootEl) {
    var schoolId = rootEl.dataset.schoolId || '';
    var yearGroup = rootEl.dataset.yearGroup || '';
    var sourceOptions = Array.prototype.slice.call(rootEl.querySelectorAll('[data-assign-source-segmented] .ui-segmented-option'));
    var searchInput = rootEl.querySelector('[data-assign-search]');
    var staffInput = rootEl.querySelector('[data-assign-staff-input]');
    var groupInput = rootEl.querySelector('[data-assign-group-input]');
    var resultList = rootEl.querySelector('[data-assign-result-list]');
    var debounceTimer = null;
    if (!sourceOptions.length || !searchInput) return;

    var initialActiveBtn = sourceOptions.filter(function (btn) { return btn.classList.contains('active'); })[0] || sourceOptions[0];
    var mode = initialActiveBtn.dataset.value;
    searchInput.placeholder = 'Search ' + initialActiveBtn.textContent + '…';

    var ownerDialog = rootEl.closest('dialog');
    function animateHeightChange(mutate) {
        if (ownerDialog) {
            animateModalHeightChange(ownerDialog, mutate);
        } else {
            mutate();
        }
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function renderResults(items) {
        animateHeightChange(function () {
            if (!items.length) {
                resultList.innerHTML = '<p class="empty-note search-hint">No matches found.</p>';
                resultList.hidden = false;
                return;
            }
            resultList.innerHTML = items.map(function (item) {
                var metaBits = [];
                if (item.school_name) metaBits.push('<span class="result-school">' + escapeHtml(item.school_name) + '</span>');
                if (item.subtitle) metaBits.push('<span class="result-role">' + escapeHtml(item.subtitle) + '</span>');
                var meta = metaBits.length ? '<span class="picker-result-meta">' + metaBits.join('') + '</span>' : '';
                return '<button type="button" class="picker-result-option" data-id="' + item.id + '" data-name="' + escapeHtml(item.name) + '">' +
                    '<span class="picker-result-label-stack">' +
                    '<span class="picker-result-name-row"><span class="result-name">' + escapeHtml(item.name) + '</span></span>' +
                    meta +
                    '</span>' +
                    '</button>';
            }).join('');
            resultList.hidden = false;
        });
    }

    function runSearch(term) {
        var params = 'q=' + encodeURIComponent(term);
        if (mode === 'group') {
            params += '&kind=group&school_id=' + encodeURIComponent(schoolId) + '&year_group=' + encodeURIComponent(yearGroup);
        } else {
            params += '&kind=staff&mode=mat';
        }
        fetch('/inclusion/panel/search/?' + params, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.json(); })
            .then(function (data) { renderResults(data.results); });
    }

    function hideResults() {
        if (resultList.hidden) return;
        animateHeightChange(function () { resultList.hidden = true; });
    }

    // Staff stays hidden until 2+ characters typed, server-fetched,
    // debounced 250ms - the shared Search precedent (INT-P4), same numbers
    // as every other picker on this page. Group skips that minimum
    // entirely and lists in full the moment it's picked (see the search
    // view's own kind == 'group' branch) - a school's StaffGroup roster is
    // small enough that browsing beats typing first.
    function applySearch() {
        var term = searchInput.value.trim();
        clearTimeout(debounceTimer);
        if (mode !== 'group' && term.length < 2) {
            hideResults();
            return;
        }
        debounceTimer = setTimeout(function () { runSearch(term); }, 250);
    }

    function select(id, name) {
        if (mode === 'staff') {
            staffInput.value = id;
            groupInput.value = '';
        } else {
            groupInput.value = id;
            staffInput.value = '';
        }
        searchInput.value = '';
        hideResults();
        rootEl.dispatchEvent(new CustomEvent('action-assign:change', { bubbles: true, detail: { type: mode, id: id, name: name } }));
    }

    sourceOptions.forEach(function (btn) {
        btn.addEventListener('click', function () {
            mode = btn.dataset.value;
            sourceOptions.forEach(function (b) { b.classList.toggle('active', b === btn); });
            searchInput.placeholder = 'Search ' + btn.textContent + '…';
            searchInput.value = '';
            searchInput.focus();
            // Group lists in full immediately (see applySearch above);
            // Staff still waits for the user to type.
            if (mode === 'group') {
                runSearch('');
            } else {
                hideResults();
            }
        });
    });
    searchInput.addEventListener('input', applySearch);
    resultList.addEventListener('click', function (e) {
        var optBtn = e.target.closest('.picker-result-option');
        if (optBtn) select(optBtn.dataset.id, optBtn.dataset.name);
    });

    rootEl._actionAssignFields = {
        select: function (type, id, name) {
            mode = type;
            sourceOptions.forEach(function (b) { b.classList.toggle('active', b.dataset.value === type); });
            select(id, name);
        },
    };
}
