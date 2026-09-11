/* One call a page makes to get a working filter bar.

   This is the seam the whole promotion was for: a page should not have to know
   that a filter bar is six behaviours. Everything below is imported and run in
   the order the old DOMContentLoaded handler ran it.

   It is not the list-page assembler #210 is building. That one wraps the
   list-page tier - facts strip, stack mode, button-row overflow - around a
   list root, and will call this. A page with a filter bar and no list (the
   SEND & Provision dashboard) needs exactly this and none of that, which is
   why the two stay separate calls rather than one. */

import { setupFilterBarMoreFilters, balanceFilterGroupLabels } from './more-filters.js';
import { initFilterBarExpandCollapse } from './expand-collapse.js';
import { initTrayPosition } from './tray-position.js';
import { initAjaxFilterBars, initFilterBarScrollRestore } from './ajax-form.js';

export function initFilterBars() {
    // balanceFilterGroupLabels alongside setupFilterBarMoreFilters, not just
    // inside the Students mobile tray/tablet-strip open handlers that used
    // to be its only callers (live feedback: "Can we do this on all
    // filters" - every filter bar's labels, at every width, not only
    // Students'). Word-count splitting (not pixel measurement, this
    // function's own comment) doesn't depend on the field's current width
    // or which bar it's in, so a single run here at setup covers every
    // page's filter bar in one pass - no per-width/per-bar special-casing
    // needed the way the old measured-max-width approach would have.
    document.querySelectorAll('.filter-bar').forEach(function (bar) {
        setupFilterBarMoreFilters(bar);
        balanceFilterGroupLabels(bar);
    });
    initTrayPosition();
    initFilterBarExpandCollapse();
    initAjaxFilterBars();
    initFilterBarScrollRestore();
}
