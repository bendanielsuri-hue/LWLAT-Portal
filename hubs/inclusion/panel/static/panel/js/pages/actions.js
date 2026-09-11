/* Actions list page entry (#210's list-page tier, ADR 0021).

   Everything initListPage now owns - facts strip, stack mode, button-row
   overflow, filter-bar active-state, infinite scroll - is dropped from
   here; panel.js's own copies have been told to stop reaching into
   #actions-filtered-content (see LIST_ROOT_SELECTOR's comment there).
   What's left is genuinely Actions-specific: wireActionButtonLayout (a
   DIFFERENT, outer-level wrap detection from the button-row-overflow
   module - .row-btn-row wraps .action-row-buttons, and this toggles
   .row-buttons-wrapped on the outer box, not icons on the inner one),
   plus the Year -> Reg and Academic Year -> Term cascading selects. */

import { initListPage } from '../../../js/list-page/list-page.js';
import { debounceTrailing } from '../../../js/components/debounce.js';

document.addEventListener('DOMContentLoaded', function () {
    var filterBar = document.querySelector('form.filter-bar');
    var yearFilter = document.getElementById('year-filter');
    var regFilter = document.getElementById('reg-filter');
    var container = document.getElementById('actions-filtered-content');

    initListPage(container, {
        filterBar: filterBar,
        buttonRowSelector: '.action-row-buttons',
    });

    // Wrap-detection for the 481-1179px tablet band (panel.css) - lighter
    // version of the button-row-overflow module above: only the offsetTop
    // comparison that marks a row's buttons as having actually fallen to
    // their own line (row-buttons-wrapped), not that module's own per-
    // slot icon-hiding. Referral Details/Edit Action's text never varies
    // row to row (no count badge the way Referrals' "Actions (N)" has),
    // so every row's buttons are already the same width without measuring
    // anything - nothing to align, just whether to switch to the
    // full-width/stretched layout once beside-content genuinely stops
    // fitting.
    (function wireActionButtonLayout() {
        // Read every row first, then write every class - never interleaved
        // per row. row-buttons-wrapped changes the row's own layout, so
        // toggling it inside the loop forced the NEXT row's offsetTop read
        // to re-run layout from scratch: one synchronous layout per row
        // rather than one for the whole list.
        function refresh() {
            var states = [];
            container.querySelectorAll('.entity-row').forEach(function (row) {
                var thumb = row.querySelector('.entity-thumb');
                var btnRow = row.querySelector('.row-btn-row');
                if (!thumb || !btnRow) return;
                states.push({ row: row, wrapped: btnRow.offsetTop > thumb.offsetTop + 2 });
            });
            states.forEach(function (state) {
                state.row.classList.toggle('row-buttons-wrapped', state.wrapped);
            });
        }
        var lastWidth = null;
        function refreshIfWidthChanged() {
            var width = container.clientWidth;
            if (width === lastWidth) return;
            lastWidth = width;
            refresh();
        }
        // Debounced rather than rAF-throttled on the resize path, same
        // reasoning as students.js's own buttons-column measurement: the
        // lastWidth guard never fires mid-drag (the width genuinely is
        // changing every frame), so this re-measured every row on every
        // frame. Whether a row's buttons have wrapped is a correct-at-rest
        // question; the MutationObserver below stays immediate because a
        // newly swapped-in row has no wrap state at all until this runs.
        var refreshOnResize = debounceTrailing(refreshIfWidthChanged, 120);
        refresh();
        lastWidth = container.clientWidth;
        window.addEventListener('resize', refreshOnResize);
        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(refreshOnResize).observe(container);
        }
        if (typeof MutationObserver !== 'undefined') {
            new MutationObserver(refresh).observe(container, { childList: true, subtree: true });
        }
    })();

    // Year -> Reg cascading (same pattern as inclusion_panel_students/
    // inclusion_panel_referrals).
    var allForms = Array.prototype.slice.call(regFilter.options).slice(1).map(function (o) { return o.value; });
    var formsByYearEl = document.getElementById('actions-forms-by-year');
    var formsByYear = formsByYearEl ? JSON.parse(formsByYearEl.textContent) : {};

    function refreshRegOptions() {
        var year = yearFilter.value;
        var forms = year ? (formsByYear[year] || []) : allForms;
        var previous = regFilter.value;
        regFilter.innerHTML = '<option value="">All</option>';
        forms.forEach(function (form) {
            var opt = document.createElement('option');
            opt.value = form;
            opt.textContent = form;
            regFilter.appendChild(opt);
        });
        regFilter.value = forms.indexOf(previous) !== -1 ? previous : '';
        if (regFilter._uiSelect) regFilter._uiSelect.refresh();
    }

    if (yearFilter) yearFilter.addEventListener('change', refreshRegOptions);

    // Academic Year -> Term cascading (see Referrals' own identical block
    // for the full reasoning) - academicYearFilter/termFilter, not
    // yearFilter, since that name's already taken by Year Group -> Reg.
    var academicYearFilter = document.getElementById('academic-year-filter');
    var termFilter = document.getElementById('term-filter');
    if (academicYearFilter && termFilter) {
        var allTerms = Array.prototype.slice.call(termFilter.options).slice(1)
            .map(function (o) { return [o.value, o.textContent]; });
        var termsByYearEl = document.getElementById('actions-terms-by-academic-year');
        var termsByYear = termsByYearEl ? JSON.parse(termsByYearEl.textContent) : {};

        function refreshTermOptions() {
            var year = academicYearFilter.value;
            var terms = year ? (termsByYear[year] || []) : allTerms;
            var previous = termFilter.value;
            termFilter.innerHTML = '<option value="">All</option>';
            terms.forEach(function (pair) {
                var opt = document.createElement('option');
                opt.value = pair[0];
                opt.textContent = pair[1];
                termFilter.appendChild(opt);
            });
            termFilter.value = terms.some(function (pair) { return pair[0] === previous; }) ? previous : '';
            if (termFilter._uiSelect) termFilter._uiSelect.refresh();
        }
        academicYearFilter.addEventListener('change', refreshTermOptions);
    }

    // Status control fit-detection lives with the rest of the facts-line
    // layout in facts-strip.js's updateFactsLineLayout (status-col-narrow),
    // which decides it and the data strip's own wrap together, from the
    // same measurements - nothing left here for this page's own JS.

    // Facts-strip overflow guard (Created At/By, Assigned to/Due) is a
    // pure-CSS crop (panel.css: #actions-filtered-content .row-facts
    // max-height + overflow: hidden) - .row-facts already wraps
    // overflowing columns onto a second line on its own (flex-wrap: wrap),
    // so capping its height to one line and clipping crops that wrapped
    // line away with nothing left to measure or flash.
});
