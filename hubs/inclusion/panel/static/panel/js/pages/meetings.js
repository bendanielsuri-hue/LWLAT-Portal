/* Panel Meetings list page entry (#210's list-page tier, ADR 0021) - the
   last of the five facts-strip pages, so panel.js's LIST_ROOT_SELECTOR/
   BUTTON_ROW_SELECTORS/DOMContentLoaded sweep is now empty everywhere.

   syncMeetingsButtonColumnWidth moves here from panel.js (it was the one
   button-column-width sync living in the shared file rather than a page's
   own inline script - every other page's copy already lived hub-side).
   button-row-overflow.js's own header explains why it stays hub-side
   rather than folding into that module: it reacts to the
   panel:stackmodechange event stack-mode.js dispatches, same as Students'/
   Escalations' own syncs. What's left otherwise: the Academic Year -> Term
   cascade and the My Meetings toggle. */

import { initListPage } from '../../../js/list-page/list-page.js';
import { debounceTrailing } from '../../../js/components/debounce.js';

document.addEventListener('DOMContentLoaded', function () {
    var filterBar = document.querySelector('form.filter-bar');
    var myMeetingsToggle = document.getElementById('my-meetings-toggle');
    var myMeetingsInput = document.getElementById('my-meetings-input');
    var container = document.getElementById('meetings-filtered-content');

    initListPage(container, {
        filterBar: filterBar,
        buttonRowSelector: '.meeting-card-actions',
    });

    // Term cascades to whichever Academic Year is selected - same
    // {parent_value: [child_options]} JSON map + rebuild-on-change
    // convention as Students' own Year->Reg Group cascade - only
    // difference is each Term option is a [value, label] pair (a bare
    // term name repeats every year, so option.value != option.textContent
    // the way Reg Group's own value==label options are), so the
    // option-rebuild loop needs both.
    var yearFilter = document.getElementById('academic-year-filter');
    var termFilter = document.getElementById('term-filter');
    if (yearFilter && termFilter) {
        var allTerms = Array.prototype.slice.call(termFilter.options).slice(1)
            .map(function (o) { return [o.value, o.textContent]; });
        var termsByYearEl = document.getElementById('meetings-terms-by-academic-year');
        var termsByYear = termsByYearEl ? JSON.parse(termsByYearEl.textContent) : {};

        function refreshTermOptions() {
            var year = yearFilter.value;
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
            // Term is enhanced into a custom popover control by
            // enhanceFormControls() on page load, same as Students' own Reg
            // Group - mutating the underlying native <select>'s options
            // above doesn't by itself refresh that popover's cached option
            // list.
            if (termFilter._uiSelect) termFilter._uiSelect.refresh();
        }
        yearFilter.addEventListener('change', refreshTermOptions);
    }

    if (myMeetingsToggle && myMeetingsInput) {
        myMeetingsToggle.addEventListener('click', function () {
            var isOn = myMeetingsToggle.classList.toggle('on');
            myMeetingsToggle.setAttribute('aria-pressed', String(isOn));
            myMeetingsInput.checked = isOn;
            myMeetingsInput.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    // Meetings' button column, sized once for the whole list instead of
    // per card - live feedback: "Button collumn width should match all the
    // way down!". .meeting-card-actions is flex: 0 0 auto (panel.css), so
    // each card's column sized to its OWN buttons: a card offering Start
    // Meeting/Edit Agenda/Delete came out wider than one offering only
    // View Meeting, and the border-left down the left edge of that column
    // made every mismatch read as a ragged vertical line down the list.
    // Same shared-width convention Students'/Escalations' own syncs use
    // for the same complaint on their own lists, expressed as one custom
    // property on the list root rather than an inline width per row.
    // Only applied while the column really is a vertical side column: at
    // the narrow widths where it turns into a full-width horizontal row
    // (panel.css) every card's column is already the same width by
    // construction, and forcing a min-width there would just make it
    // overflow.
    function syncMeetingsButtonColumnWidth() {
        var columnsList = container.querySelectorAll('.meeting-card-actions');
        if (!columnsList.length) return;
        // Cleared before measuring, not just overwritten after - otherwise
        // a previous pass's own shared width is what gets measured back
        // and the column could only ever grow.
        container.style.removeProperty('--meetings-btn-col-w');
        var vertical = getComputedStyle(columnsList[0]).flexDirection.indexOf('column') === 0;
        if (!vertical) return;
        var max = 0;
        columnsList.forEach(function (col) { max = Math.max(max, col.getBoundingClientRect().width); });
        if (max > 0) container.style.setProperty('--meetings-btn-col-w', max + 'px');
    }
    syncMeetingsButtonColumnWidth();
    if (typeof MutationObserver !== 'undefined') {
        new MutationObserver(syncMeetingsButtonColumnWidth).observe(container, { childList: true, subtree: true });
    }
    window.addEventListener('resize', debounceTrailing(syncMeetingsButtonColumnWidth, 120));
    container.addEventListener('panel:stackmodechange', syncMeetingsButtonColumnWidth);
});
