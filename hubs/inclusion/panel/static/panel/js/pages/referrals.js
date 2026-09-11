/* Referrals list page entry (#210's list-page tier, ADR 0021).

   Everything initListPage now owns - facts strip, stack mode, button-row
   overflow, filter-bar active-state, infinite scroll - is dropped from
   here; panel.js's own copies have been told to stop reaching into
   #referrals-filtered-content (see LIST_ROOT_SELECTOR's comment there).
   What's left is genuinely Referrals-specific: the Year -> Reg and
   Academic Year -> Term cascading selects, and the Overdue Actions
   toggle-pill. */

import { initListPage } from '../../../js/list-page/list-page.js';

document.addEventListener('DOMContentLoaded', function () {
    var filterBar = document.querySelector('form.filter-bar');
    var yearFilter = document.getElementById('year-filter');
    var regFilter = document.getElementById('reg-filter');
    var container = document.getElementById('referrals-filtered-content');

    initListPage(container, {
        filterBar: filterBar,
        buttonRowSelector: '.row-btn-row',
    });

    // Year -> Reg cascading (same pattern as inclusion_panel_students,
    // students.html) - picking a Year Group narrows Reg down to that
    // year's own forms only.
    var allForms = Array.prototype.slice.call(regFilter.options).slice(1).map(function (o) { return o.value; });
    var formsByYearEl = document.getElementById('referrals-forms-by-year');
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
        // Reg is enhanced into a custom popover control by
        // enhanceFormControls() on page load - mutating the underlying
        // native <select>'s options above doesn't by itself refresh that
        // popover's cached option list; _uiSelect.refresh() (static/js/main.js)
        // is the same hook the date/time custom controls use for this.
        if (regFilter._uiSelect) regFilter._uiSelect.refresh();
    }

    function setupToggle(toggle, input) {
        if (!toggle || !input) return;
        toggle.addEventListener('click', function () {
            var isOn = toggle.classList.toggle('on');
            toggle.setAttribute('aria-pressed', String(isOn));
            input.checked = isOn;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }
    setupToggle(document.getElementById('overdue-actions-toggle'), document.getElementById('overdue-actions-input'));

    if (yearFilter) yearFilter.addEventListener('change', refreshRegOptions);
    // "More filters" toggle - handled globally, see setupFilterBarMoreFilters() (main.js).

    // Academic Year -> Term cascading (same pattern as
    // inclusion_panel_meetings, meetings.html) - named academicYearFilter/
    // termFilter here, not yearFilter, since that name's already taken by
    // the Year Group -> Reg cascade above.
    var academicYearFilter = document.getElementById('academic-year-filter');
    var termFilter = document.getElementById('term-filter');
    if (academicYearFilter && termFilter) {
        var allTerms = Array.prototype.slice.call(termFilter.options).slice(1)
            .map(function (o) { return [o.value, o.textContent]; });
        var termsByYearEl = document.getElementById('referrals-terms-by-academic-year');
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

    // Facts-strip overflow guard is a pure-CSS crop (panel.css:
    // #referrals-filtered-content .row-facts max-height + overflow: hidden)
    // - .row-facts already wraps overflowing columns onto a second line on
    // its own (flex-wrap: wrap), so capping its height to one line and
    // clipping crops that wrapped line away with nothing left to measure.
});
