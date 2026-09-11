/* SEND & Provision hub dashboard's own page behavior (#212 - moved out of
   hub.html's inline <script>, ADR 0021).

   reg_groups_by_year now reaches this module via json_script
   ({{ reg_groups_by_year|json_script:"reg-groups-by-year-data" }} in the
   template) instead of JSON.parse('{{ reg_groups_by_year_json|escapejs }}') -
   the view passes the raw dict rather than a pre-dumped JSON string, so
   json_script's own escaping/serialization is the only place it's encoded. */

import { wireFilterBarActiveState } from '../../../js/components/filter-bar/active-state.js';

document.addEventListener('DOMContentLoaded', function () {
    var filterBar = document.querySelector('.filter-bar[data-ajax-target]');
    var yearFilter = document.getElementById('year-filter');
    var regFilter = document.getElementById('reg-group-filter');
    if (!filterBar || !yearFilter || !regFilter) return;

    // Reg Group belongs to exactly one Year Group — since the filter bar
    // itself is never touched by the AJAX content swap (see hub.html's
    // comment above dashboard-filtered-content), this mirrors the same
    // narrowing the view already does server-side (reg_groups_by_year in
    // hubs/inclusion/views.py::inclusion_hub) so it also happens instantly,
    // client-side, the moment Year Group changes — same pattern as
    // refreshRegOptions() in students.html.
    var regGroupsByYearEl = document.getElementById('reg-groups-by-year-data');
    var regGroupsByYear = regGroupsByYearEl ? JSON.parse(regGroupsByYearEl.textContent) : {};

    function refreshRegOptions() {
        var year = yearFilter.value;
        var groups = year ? (regGroupsByYear[year] || []) : Object.keys(regGroupsByYear).reduce(function (acc, y) {
            return acc.concat(regGroupsByYear[y]);
        }, []);
        var previous = regFilter.value;
        regFilter.innerHTML = '<option value="">All</option>';
        groups.forEach(function (group) {
            var opt = document.createElement('option');
            opt.value = group;
            opt.textContent = group;
            regFilter.appendChild(opt);
        });
        regFilter.value = groups.indexOf(previous) !== -1 ? previous : '';
        // Reg Group is enhanced into a custom popover control by
        // enhanceFormControls() on page load (static/js/main.js); mutating
        // the underlying native <select>'s options above doesn't by itself
        // refresh that popover's cached option list — _uiSelect.refresh()
        // is the same hook the date/time custom controls use for exactly
        // this "options changed after a sibling field changed" case.
        if (regFilter._uiSelect) regFilter._uiSelect.refresh();
    }

    var refreshFilterBarState = wireFilterBarActiveState(filterBar);
    yearFilter.addEventListener('change', refreshRegOptions);
    filterBar.addEventListener('change', refreshFilterBarState);
    // "More filters" toggle - handled globally, see setupFilterBarMoreFilters() (main.js).
});
