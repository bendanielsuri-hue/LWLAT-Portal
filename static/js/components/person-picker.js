/* Promoted out of panel.js (#211, ADR 0020) - "staff/external contact
   source + search" picker with no SEND vocabulary in the mechanism itself
   (taxonomy.md §3 renames it initPersonPicker/resetPersonPicker on the way
   out - "member" was Panel Group's own word for this, not the picker's).
   Used by the Panel Meeting "Add Member" dialog and the Panel Group
   "Add Member" form. Several instances can exist on one page (one per
   panel group), so everything is scoped via closest()/querySelector() on
   the picker's own root rather than global ids.

   Still also set on `window`, same reason as components/modal.js:
   dialogs/panel-group.js is classic-script-shaped (an IIFE, not yet
   importing this directly) and reads it by name. setFadeHidden/
   animateModalHeightChange import from their real homes now that they
   have one. */

import { setFadeHidden, animateModalHeightChange } from './modal.js';

export function initPersonPicker(rootEl) {
    var sourceOptions = Array.prototype.slice.call(rootEl.querySelectorAll('[data-member-source-segmented] .ui-segmented-option'));
    var searchInput = rootEl.querySelector('[data-member-search]');
    var staffInput = rootEl.querySelector('[data-member-staff-input]');
    var externalInput = rootEl.querySelector('[data-member-external-input]');
    var resultList = rootEl.querySelector('[data-member-result-list]');
    var searchPanel = rootEl.querySelector('[data-member-search-panel]');
    var selectedSection = rootEl.querySelector('[data-member-selected]');
    var selectedName = rootEl.querySelector('[data-member-selected-name]');
    var changeBtn = rootEl.querySelector('[data-member-change]');
    // Lives in the including page's own footer (e.g. .panel-group-modal-footer),
    // not inside rootEl - see _member_picker.html's doc comment - so this
    // looks it up scoped to the nearest <dialog> rather than rootEl itself.
    var addExternalRow = (rootEl.closest('dialog') || document).querySelector('[data-member-add-external]');
    var schoolId = rootEl.dataset.schoolId || '';
    var existingStaffIds = (rootEl.dataset.existingStaffIds || '').split(',').filter(Boolean);
    var existingExternalIds = (rootEl.dataset.existingExternalIds || '').split(',').filter(Boolean);
    var alreadyMemberLabel = rootEl.dataset.alreadyMemberLabel || 'Already a Member';
    var debounceTimer = null;
    if (!sourceOptions.length || !searchInput) return;

    // Source is a segmented control, not a <select> (see the segmented-control
    // comment in components/forms.css) - mode lives in this closure var instead of a
    // form element's .value, kept in sync with the .active class below.
    var initialActiveBtn = sourceOptions.filter(function (btn) { return btn.classList.contains('active'); })[0] || sourceOptions[0];
    var mode = initialActiveBtn.dataset.value;
    searchInput.placeholder = 'Search ' + initialActiveBtn.textContent + '…';

    function dispatchChange(type, id, name) {
        rootEl.dispatchEvent(new CustomEvent('member-picker:change', { bubbles: true, detail: { type: type, id: id, name: name } }));
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Mirrors templates/icons/avatar_placeholder_svg.html - inlined here
    // since search results are built in JS from fetched JSON, not rendered
    // via {% include %} (same reasoning as HUB_RESULT_ICONS above).
    var AVATAR_PLACEHOLDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<circle cx="12" cy="8.5" r="4" fill="currentColor" /><path d="M3 21c0-4.7 4-8.5 9-8.5s9 3.8 9 8.5" fill="currentColor" /></svg>';

    function renderResults(items) {
        if (!items.length) {
            resultList.innerHTML = '<p class="empty-note search-hint">No matches found.</p>';
            return;
        }
        resultList.innerHTML = items.map(function (item) {
            var metaBits = [];
            if (item.school_name) metaBits.push('<span class="result-school">' + escapeHtml(item.school_name) + '</span>');
            if (item.subtitle) metaBits.push('<span class="result-role">' + escapeHtml(item.subtitle) + '</span>');
            var meta = metaBits.length ? '<span class="picker-result-meta">' + metaBits.join('') + '</span>' : '';
            var pill = item.already_member ? '<span class="status-pill type-already">' + escapeHtml(alreadyMemberLabel) + '</span>' : '';
            var icon = item.photo_url ? '<img src="' + escapeHtml(item.photo_url) + '" alt="">' : AVATAR_PLACEHOLDER_SVG;
            return '<button type="button" class="picker-result-option" data-source="' + item.source + '" data-id="' + item.id + '" data-name="' + escapeHtml(item.name) + '"' +
                (item.already_member ? ' data-already-member="1"' : '') + '>' +
                '<span class="picker-result-icon">' + icon + '</span>' +
                '<span class="picker-result-label-stack">' +
                '<span class="picker-result-name-row"><span class="result-name">' + escapeHtml(item.name) + '</span>' + pill + '</span>' +
                meta +
                '</span>' +
                '</button>';
        }).join('');
    }

    function runSearch(term) {
        var params = 'q=' + encodeURIComponent(term);
        if (mode === 'external') {
            params += '&kind=external&exclude=' + existingExternalIds.join(',');
        } else {
            params += '&kind=staff&mode=' + mode + '&school_id=' + encodeURIComponent(schoolId) + '&exclude=' + existingStaffIds.join(',');
        }
        fetch('/inclusion/panel/search/?' + params, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.json(); })
            .then(function (data) { renderResults(data.results); });
    }

    // Hidden until typed, server-fetched, debounced 250ms with a 2-char
    // minimum - the shared Search precedent (INT-P4), same numbers as
    // Panel search and the referral student
    // picker.
    function applySearch() {
        var term = searchInput.value.trim();
        clearTimeout(debounceTimer);
        if (!term) {
            var activeBtn = sourceOptions.filter(function (btn) { return btn.classList.contains('active'); })[0] || initialActiveBtn;
            resultList.innerHTML = '<p class="empty-note search-hint">Start typing to search ' + activeBtn.textContent + '…</p>';
        } else if (term.length === 1) {
            debounceTimer = setTimeout(function () {
                resultList.innerHTML = '<p class="empty-note search-hint">Keep typing… (2+ characters)</p>';
            }, 400);
        } else {
            debounceTimer = setTimeout(function () { runSearch(term); }, 250);
        }
        // Adding a new External contact is always on offer once External mode
        // is selected (not just as a "no match" fallback).
        if (addExternalRow) setFadeHidden(addExternalRow, mode !== 'external');
    }

    // Switching between the search panel and the compact "selected member"
    // row is a real height change (the full search UI is much taller than
    // one summary row) - same animateModalHeightChange treatment as every
    // other in-place content swap in these dialogs. rootEl may not sit
    // inside a <dialog> at all (a future non-modal use of this picker), so
    // this falls back to running the mutation unanimated rather than
    // requiring one.
    var ownerDialog = rootEl.closest('dialog');
    function animateHeightChange(mutate) {
        if (ownerDialog) {
            animateModalHeightChange(ownerDialog, mutate);
        } else {
            mutate();
        }
    }

    // keepSearchText: setMode() (switching Staff/MAT/External) wants to
    // re-run whatever's already typed against the new source rather than
    // discarding it - clearing it on every source switch meant a half-typed
    // search vanished just for touching the segmented control, forcing a
    // retype. The "Change" button (a genuinely fresh pick) still wants the
    // full reset.
    function showPicker(keepSearchText) {
        animateHeightChange(function () {
            staffInput.value = '';
            externalInput.value = '';
            dispatchChange('', '', '');
            searchPanel.hidden = false;
            selectedSection.hidden = true;
            if (!keepSearchText) searchInput.value = '';
            applySearch();
            // Every caller of showPicker() - clicking "Change", and picking a
            // different source via setMode() below - lands the user back in
            // a state where typing a search term is the obvious next thing
            // to do, same as New Referral's own showPicker(). Without this,
            // clicking a segmented source button (itself a <button>, which
            // takes focus on click) silently strands focus on that button
            // instead of returning it to Search.
            searchInput.focus();
        });
    }

    function showSelected(name) {
        animateHeightChange(function () {
            selectedName.textContent = name;
            searchPanel.hidden = true;
            selectedSection.hidden = false;
        });
    }

    function setMode(newMode) {
        mode = newMode;
        var activeBtn;
        sourceOptions.forEach(function (btn) {
            var isActive = btn.dataset.value === mode;
            btn.classList.toggle('active', isActive);
            if (isActive) activeBtn = btn;
        });
        // Search's own placeholder names whichever source is currently
        // selected ("Search School Staff…") rather than a fixed
        // generic "Search…" - the segmented row right above it already shows
        // this, but repeating it here means the field still makes sense on
        // its own once you've scrolled/focused past the row.
        if (activeBtn) searchInput.placeholder = 'Search ' + activeBtn.textContent + '…';
        showPicker(true);
    }

    function reset() {
        var hasSchoolOption = sourceOptions.some(function (btn) { return btn.dataset.value === 'school'; });
        setMode(hasSchoolOption ? 'school' : 'mat');
    }

    sourceOptions.forEach(function (btn) {
        btn.addEventListener('click', function () { setMode(btn.dataset.value); });
    });
    searchInput.addEventListener('input', applySearch);
    if (changeBtn) changeBtn.addEventListener('click', function () { showPicker(false); });

    rootEl.addEventListener('click', function (e) {
        var optBtn = e.target.closest('.picker-result-option');
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
    });

    applySearch();
    rootEl._personPicker = {
        reset: reset,
        // Called by the shared #external-contact-quick-add-dialog (see
        // dialogs/external-contact-quick-add.js) once a new contact is
        // created for this specific picker instance - appends it as a
        // result option and selects it, same as clicking an existing one.
        addExternalContact: function (contact) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'picker-result-option';
            btn.dataset.source = 'external';
            btn.dataset.id = contact.id;
            btn.dataset.name = contact.name;
            var stack = document.createElement('span');
            stack.className = 'picker-result-label-stack';
            var nameRow = document.createElement('span');
            nameRow.className = 'picker-result-name-row';
            var nameSpan = document.createElement('span');
            nameSpan.className = 'result-name';
            nameSpan.textContent = contact.name;
            nameRow.appendChild(nameSpan);
            stack.appendChild(nameRow);
            if (contact.job_title) {
                var meta = document.createElement('span');
                meta.className = 'picker-result-meta';
                var roleSpan = document.createElement('span');
                roleSpan.className = 'result-role';
                roleSpan.textContent = contact.job_title;
                meta.appendChild(roleSpan);
                stack.appendChild(meta);
            }
            btn.appendChild(stack);
            resultList.appendChild(btn);
            externalInput.value = contact.id;
            staffInput.value = '';
            dispatchChange('external', contact.id, contact.name);
            showSelected(contact.name);
        },
    };
}

export function resetPersonPicker(rootEl) {
    if (rootEl && rootEl._personPicker) rootEl._personPicker.reset();
}

window.initPersonPicker = initPersonPicker;
window.resetPersonPicker = resetPersonPicker;

document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-member-picker-root]').forEach(initPersonPicker);
});
