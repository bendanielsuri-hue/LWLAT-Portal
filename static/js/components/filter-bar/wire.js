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
    // balanceFilterGroupLabels runs here at setup, for every bar, rather than
    // inside a tray-open handler: it splits by word count, not pixel width
    // (see its own comment), so it depends on neither the field's current
    // width nor which bar it is in, and one pass covers every page with no
    // per-width or per-bar special-casing.
    document.querySelectorAll('.filter-bar').forEach(function (bar) {
        setupFilterBarMoreFilters(bar);
        balanceFilterGroupLabels(bar);
    });
    initTrayPosition();
    initFilterBarExpandCollapse();
    initAjaxFilterBars();
    initFilterBarScrollRestore();
}
