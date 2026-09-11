/* Safeguarding Notes' own page behavior (#212 - moved out of
   safeguarding_notes.html's inline <script>, ADR 0021). One page, one entry
   module.

   reg_by_year now reaches this module via json_script ({{ reg_by_year|json_script:
   "reg-by-year-data" }} in the template) instead of
   JSON.parse('{{ reg_by_year_json|escapejs }}') - the view passes the raw
   dict (reg_by_year) rather than a pre-dumped JSON string, so json_script's
   own escaping/serialization is the only place the value is encoded. */

import { closest } from '../../../js/components/dom.js';
import { flash } from '../../../js/components/flash.js';
import { diffPatchRowList } from '../../../js/components/row-list-patch.js';

document.addEventListener('DOMContentLoaded', function () {
    var filterBar = document.querySelector('form.filter-bar');
    var yearFilter = document.getElementById('dsl-year-filter');
    var regFilter = document.getElementById('dsl-reg-filter');
    var refreshFilterBarState = window.wireFilterBarActiveState(filterBar);

    // Reg narrows to the selected Year Group, same dependent-filter
    // convention as students.html's forms_by_year/refreshRegOptions.
    var regByYearEl = document.getElementById('reg-by-year-data');
    var regByYear = regByYearEl ? JSON.parse(regByYearEl.textContent) : {};
    var allRegs = Array.prototype.slice.call(regFilter.options).slice(1).map(function (o) { return o.value; });
    function refreshRegOptions() {
        var year = yearFilter.value;
        var regs = year ? (regByYear[year] || []) : allRegs;
        var previous = regFilter.value;
        regFilter.innerHTML = '<option value="">All</option>';
        regs.forEach(function (reg) {
            var opt = document.createElement('option');
            opt.value = reg;
            opt.textContent = reg;
            regFilter.appendChild(opt);
        });
        regFilter.value = regs.indexOf(previous) !== -1 ? previous : '';
        // Reg is enhanced into a custom popover control by
        // enhanceFormControls() on page load — mutating the underlying
        // native <select>'s options above doesn't by itself refresh that
        // popover's cached option list; _uiSelect.refresh() (static/js/main.js)
        // is the same hook the date/time custom controls use for this.
        if (regFilter._uiSelect) regFilter._uiSelect.refresh();
    }
    if (yearFilter) yearFilter.addEventListener('change', refreshRegOptions);
    if (filterBar) filterBar.addEventListener('change', refreshFilterBarState);

    function setupToggle(toggle, input) {
        if (!toggle || !input) return;
        toggle.addEventListener('click', function () {
            var isOn = toggle.classList.toggle('on');
            toggle.setAttribute('aria-pressed', String(isOn));
            input.checked = isOn;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }
    setupToggle(document.getElementById('dsl-needs-toggle'), document.getElementById('dsl-needs-toggle-input'));

    // AJAX filtering / "More filters" toggle / tray open-close - handled
    // globally (setupAjaxFilterBars / setupFilterBarMoreFilters, main.js).

    // Add/Edit/Delete note (.safeguarding-note-form, see
    // _safeguarding_note_card.html) submit via fetch instead of a full-page
    // reload (#83) - the view returns the same card fragment re-rendered,
    // swapped in wholesale. Delegated on the detail container itself (not
    // the forms) since every submit replaces that container's contents,
    // including the forms that were just submitted.
    var detail = document.getElementById('dsl-briefing-detail');

    // Selecting a student: fetches just the detail-column fragment instead
    // of following the row's own ?panel_referral= href as a real navigation
    // (#137 - a full reload was resetting the mobile/narrow-desktop filter
    // tray's open/closed state and, separately, dropping every active
    // filter from the URL - both now fixed at the root by not reloading at
    // all, rather than papering over each symptom). history.replaceState,
    // not pushState - same convention as the filter bar's own AJAX
    // (setupAjaxFilterBars, main.js): Back should leave this page the way
    // it did before either of these AJAX flows existed, not stop on a
    // stale mid-session selection this handler never wired a popstate
    // listener for. Delegated on `document` (not the list container)
    // because the list container's own innerHTML gets replaced wholesale
    // by a filter change (setupAjaxFilterBars) - a listener bound directly
    // to it would be torn out along with the old rows the first time that
    // happens.
    document.addEventListener('click', function (e) {
        var link = closest(e.target, '#safeguarding-notes-filtered-content a.entity-row[data-panel-referral-id]');
        if (!link || !detail) return;
        e.preventDefault();
        var url = link.getAttribute('href');
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) {
                if (!res.ok) throw new Error('Request failed: ' + res.status);
                return res.text();
            })
            .then(function (html) {
                detail.innerHTML = html;
                history.replaceState(null, '', url);
                document.querySelectorAll('#safeguarding-notes-filtered-content .entity-row.chosen').forEach(function (row) {
                    row.classList.remove('chosen');
                });
                link.classList.add('chosen');
            })
            .catch(function () { window.location.href = url; });
    });

    if (detail) {
        detail.addEventListener('click', function (e) {
            var toggle = e.target.closest('[data-note-edit-toggle]');
            if (!toggle) return;
            var entry = toggle.closest('[data-note-entry]');
            if (!entry) return;
            var display = entry.querySelector('[data-note-display]');
            var form = entry.querySelector('[data-note-edit-form]');
            var editing = form.hidden;
            display.hidden = editing;
            form.hidden = !editing;
        });

        detail.addEventListener('submit', function (e) {
            var form = e.target.closest('.safeguarding-note-form');
            if (!form) return;
            if (e.defaultPrevented) return;
            e.preventDefault();
            var formAction = form.querySelector('[name=form_action]');
            var noteIdField = form.querySelector('[name=note_id]');
            // Flash red/green (INT-M1: transition rather than a sudden jump,
            // reusing flash()/agenda-flash-* convention) on the row about to
            // shrink out, right as the request fires - Delete reads as a
            // removal, Reactivate as a positive move rather than a removal
            // even though it's leaving History the same way.
            if (formAction && noteIdField) {
                var targetRow = detail.querySelector('[data-note-id="' + noteIdField.value + '"]');
                if (formAction.value === 'delete') flash(targetRow, 'removed');
                else if (formAction.value === 'reactivate') flash(targetRow, 'added');
            }
            fetch(form.action, {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                body: new FormData(form),
            })
                .then(function (res) {
                    if (!res.ok) throw new Error('Request failed: ' + res.status);
                    return res.text();
                })
                .then(function (html) {
                    // Diff-patch the two row-list containers in place (same
                    // technique diffPatchRowList's other callers use) before
                    // the rest of the card gets a wholesale swap below, so an
                    // add/delete/reactivate animates the row grow-in/
                    // shrink-fade-out instead of snapping, and the History
                    // <details>'s open/closed state survives the re-render
                    // instead of always coming back closed.
                    var template = document.createElement('template');
                    template.innerHTML = html;

                    // The fetched fragment always reflects this row's full
                    // current state regardless of which action triggered it
                    // (toggle_ready/add/edit/delete/reactivate all re-render
                    // from scratch server-side) - use it to bring the left-
                    // side row's pill and note-count line back in sync too,
                    // since that row otherwise never gets touched by this
                    // handler (it only ever patched the detail column).
                    var panelReferralMatch = form.action.match(/\/(\d+)\/notes\/$/);
                    var leftRow = panelReferralMatch
                        ? document.querySelector('[data-panel-referral-id="' + panelReferralMatch[1] + '"]')
                        : null;
                    if (leftRow) {
                        var freshBanner = template.content.querySelector('.safeguarding-ready-banner');
                        var pill = leftRow.querySelector('[data-ready-pill]');
                        if (freshBanner && pill) {
                            var isReady = freshBanner.classList.contains('is-ready');
                            pill.textContent = isReady ? 'Ready for Panel' : 'Not Ready';
                            pill.classList.toggle('complete', isReady);
                            pill.classList.toggle('open', !isReady);
                        }
                        var activeCount = template.content.querySelectorAll('[data-active-notes-list] [data-note-id]').length;
                        var historyCount = template.content.querySelectorAll('[data-history-list] [data-note-id]').length;
                        var countMeta = leftRow.querySelector('[data-note-count-meta]');
                        if (countMeta) {
                            countMeta.textContent = activeCount + ' active note' + (activeCount === 1 ? '' : 's')
                                + ' · ' + historyCount + ' inactive note' + (historyCount === 1 ? '' : 's');
                        }
                    }

                    ['[data-active-notes-list]', '[data-history-list]'].forEach(function (sel) {
                        var freshList = template.content.querySelector(sel);
                        var oldList = detail.querySelector(sel);
                        if (!freshList || !oldList) return;
                        // oldList is reused (not replaced) below, so its
                        // .open state (and any in-flight row animation)
                        // carries over for free - only .hidden needs an
                        // explicit copy from the fresh render.
                        diffPatchRowList(oldList, freshList, 'data-note-id');
                        oldList.hidden = freshList.hidden;
                        var freshSummary = freshList.querySelector('[data-history-summary]');
                        var oldSummary = oldList.querySelector('[data-history-summary]');
                        if (freshSummary && oldSummary) oldSummary.textContent = freshSummary.textContent;
                        freshList.replaceWith(oldList);
                    });
                    detail.replaceChildren(template.content);
                    // Flash the note on the list it just grew into too,
                    // once diffPatchRowList has placed it there - both
                    // ends of a move read the same way: Reactivate green
                    // (History shrinking out, Active growing in), Delete
                    // red (Active shrinking out, History growing in - a
                    // soft-retire moves the row into History rather than
                    // removing it outright, see SafeguardingNote.retire()).
                    if (formAction && noteIdField) {
                        if (formAction.value === 'reactivate') {
                            flash(detail.querySelector('[data-active-notes-list] [data-note-id="' + noteIdField.value + '"]'), 'added');
                        } else if (formAction.value === 'delete') {
                            flash(detail.querySelector('[data-history-list] [data-note-id="' + noteIdField.value + '"]'), 'removed');
                        }
                    }
                })
                .catch(function () { form.submit(); });
        });
    }
});
