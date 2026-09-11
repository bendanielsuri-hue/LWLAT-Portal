/* Escalations list page entry (#210's list-page tier, ADR 0021).

   Facts strip/stack mode move to initListPage; button-row overflow is
   left unset (Escalations never had that mechanism - no BUTTON_ROW_
   SELECTORS entry existed for it in panel.js). Escalations has no Year
   Group -> Reg cascade at all (live feedback: "MAT level are not going
   to care about house and reg"), so what's left here is Academic Year ->
   Term and its own shared button-column width sync (stays hub-side per
   button-row-overflow.js's own header - reacts to the panel:stackmodechange
   event stack-mode.js dispatches). */

import { initListPage } from '../../../js/list-page/list-page.js';
import { debounceTrailing } from '../../../js/components/debounce.js';

document.addEventListener('DOMContentLoaded', function () {
    var filterBar = document.querySelector('form.filter-bar');
    var container = document.getElementById('escalations-filtered-content');

    initListPage(container, { filterBar: filterBar });

    // Academic Year -> Term cascading (same pattern as
    // inclusion_panel_referrals/inclusion_panel_meetings).
    var academicYearFilter = document.getElementById('academic-year-filter');
    var termFilter = document.getElementById('term-filter');
    if (academicYearFilter && termFilter) {
        var allTerms = Array.prototype.slice.call(termFilter.options).slice(1)
            .map(function (o) { return [o.value, o.textContent]; });
        var termsByYearEl = document.getElementById('escalations-terms-by-academic-year');
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

    // Button column width, synced across every row - live feedback: "I
    // want all rows button section to be same size" then, once a guessed
    // fixed px looked padded rather than sized: "still look wide, should
    // be the width of the largest button". Reset every row's own inline
    // min-width to '' first so a rerun (after infinite scroll appends more
    // rows) measures each row's true natural content width, not whatever a
    // previous run already forced it to; the .rows-stacked guard mirrors
    // stack-mode.js's own per-row-when-stacked/per-list-otherwise
    // convention - this column's own grid-area only exists while the list
    // is unstacked, and an inline min-width in the stacked format
    // (row-btn-row goes flex: 1 1 100% there, panel.css) would just force
    // unwanted overflow instead of doing anything useful. Which format the
    // list is in is measured, not a width band (stack-mode.js), so this
    // reads the class rather than a media query - and re-runs on
    // panel:stackmodechange below, since a flip changes no container width
    // for the resize path to notice.
    function syncEscalationButtonWidths() {
        var rows = container.querySelectorAll('.row-btn-row');
        if (!rows.length) return;
        rows.forEach(function (row) { row.style.minWidth = ''; });
        if (container.classList.contains('rows-stacked')) return;
        var max = 0;
        rows.forEach(function (row) { max = Math.max(max, row.scrollWidth); });
        if (max > 0) rows.forEach(function (row) { row.style.minWidth = max + 'px'; });
    }
    syncEscalationButtonWidths();
    if (typeof MutationObserver !== 'undefined') {
        new MutationObserver(syncEscalationButtonWidths).observe(container, { childList: true, subtree: true });
    }
    // Debounced rather than rAF-throttled, same reasoning as the other
    // list pages' own per-row resize measurements: a shared button width
    // is a correct-at-rest concern, and re-running this every frame of a
    // drag was part of what made these list pages stutter on resize while
    // the side-nav's own width transition was running (measured
    // 2026-09-07). The MutationObserver above stays immediate - appended
    // rows have no synced width until it runs.
    window.addEventListener('resize', debounceTrailing(syncEscalationButtonWidths, 120));
    container.addEventListener('panel:stackmodechange', syncEscalationButtonWidths);
});
