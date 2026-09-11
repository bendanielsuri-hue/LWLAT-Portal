/* Students list page entry - the first page wired to #210's list-page
   tier (ADR 0021: one entry module per page template).

   Everything initListPage now owns - the facts strip, stack mode,
   button-row overflow, filter-bar active-state badge/highlight, infinite
   scroll - is dropped from here entirely; panel.js's own copies of all of
   that have been told to stop reaching into #students-filtered-content
   (see LIST_ROOT_SELECTOR's comment there), so this page is the only thing
   touching it now. What's left below is genuinely Students-specific: the
   Year -> Reg cascading select, the two toggle-pill filters, and the
   shared button-column width sync (stays hub-side on purpose -
   button-row-overflow.js's own header explains why - and reacts to the
   panel:stackmodechange event stack-mode.js dispatches). */

import { initListPage } from '../../../js/list-page/list-page.js';
import { debounceTrailing } from '../../../js/components/debounce.js';

document.addEventListener('DOMContentLoaded', function () {
    var filterBar = document.querySelector('form.filter-bar');
    var yearFilter = document.getElementById('year-filter');
    var regFilter = document.getElementById('reg-filter');
    var container = document.getElementById('students-filtered-content');

    var allForms = Array.prototype.slice.call(regFilter.options).slice(1).map(function (o) { return o.value; });
    var formsByYearEl = document.getElementById('students-forms-by-year');
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
    setupToggle(document.getElementById('has-referrals-toggle'), document.getElementById('has-referrals-input'));
    setupToggle(document.getElementById('overdue-actions-toggle'), document.getElementById('overdue-actions-input'));

    if (yearFilter) yearFilter.addEventListener('change', refreshRegOptions);
    // "More filters" toggle - handled globally, see setupFilterBarMoreFilters() (main.js).

    initListPage(container, {
        filterBar: filterBar,
        buttonRowSelector: '.btn-row',
    });

    // Equal buttons-column width across every row (DES-L2/L3's "own row"
    // version of reserve-space-for-the-max already applied within a row;
    // this is the same idea across every row in the list - live feedback:
    // "I do want actions block to match in all cards... users should expect
    // consistency"). Each .entity-row is its own separate CSS Grid instance
    // (panel.css, the >=701px grid band), so its "buttons" column's `auto`
    // track sizes independently per row - a row with a longer Referrals
    // badge naturally gets a wider buttons column than its neighbours,
    // which is exactly the row-to-row inconsistency the feedback flagged.
    // Measures every row's natural (unconstrained) .btn-row width, then
    // pins the shared --students-btn-col-w custom property (read by the
    // grid band's own grid-template-columns, panel.css) to the widest one
    // needed - every row's buttons column then shares that one fixed width
    // instead of sizing to its own content.
    (function wireStudentButtonColumnWidth() {
        function refresh() {
            // Cleared before measuring, not just overwritten after -
            // otherwise a previous pass's own fixed width would be what
            // gets measured back on a re-run (e.g. after a filter change
            // drops every badge to a shorter digit count), never letting
            // the shared width shrink back down again.
            container.style.removeProperty('--students-btn-col-w');
            // Nothing to size while the list is in its stacked format:
            // .btn-row is a full-width row of its own there (panel.css), so
            // measuring it would pin the grid's buttons track to the whole
            // row width, which is what the track would then come back to
            // the moment the list unstacked. The grid band it feeds only
            // exists while unstacked anyway. Whether it is stacked is
            // measured, not a width band (stack-mode.js) - hence the class
            // test, and the panel:stackmodechange listener below: a flip
            // changes no container width, so the resize path can't see it.
            if (container.classList.contains('rows-stacked')) return;
            var max = 0;
            container.querySelectorAll('.btn-row').forEach(function (el) {
                max = Math.max(max, el.getBoundingClientRect().width);
            });
            if (max > 0) container.style.setProperty('--students-btn-col-w', max + 'px');
        }
        var lastWidth = null;
        function refreshIfWidthChanged() {
            var width = container.clientWidth;
            if (width === lastWidth) return;
            lastWidth = width;
            refresh();
        }
        // Debounced on the resize path (measured 2026-09-07: this was the
        // single biggest remaining contributor to the list pages' resize
        // stutter after panel.js's own refresh loop was fixed - a shared
        // buttons-column width is correct-at-rest, so settling once the
        // drag stops is enough). Content changes (below) stay immediate: a
        // newly appended row has no measurement at all until this runs.
        var refreshOnResize = debounceTrailing(refreshIfWidthChanged, 120);
        refresh();
        lastWidth = container.clientWidth;
        window.addEventListener('resize', refreshOnResize);
        container.addEventListener('panel:stackmodechange', refresh);
        if (typeof MutationObserver !== 'undefined') {
            new MutationObserver(refresh).observe(container, { childList: true, subtree: true });
        }
        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(refreshOnResize).observe(container);
        }
    })();

    // Facts-strip overflow guard is a pure-CSS crop (panel.css:
    // #students-filtered-content .row-facts max-height + overflow: hidden)
    // - .row-facts already wraps overflowing columns onto a second line on
    // its own (flex-wrap: wrap), so capping its height to one line and
    // clipping crops that wrapped line away with nothing left to measure.
});
