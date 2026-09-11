/* Stack mode: does this list's facts strip have room to sit beside its row,
   or does the row need to stack (facts strip full-width, buttons dropped to
   their own line)?

   ⚠️ IN PROGRESS - #210, slice D. Assembled and parameterised but NOT yet
   imported by anything; panel.js still holds the original copy (region 16)
   that actually runs. button-row-overflow.js and list-page.js do not exist
   yet - panel.js keeps its copy until list-page.js assembles all three.

   JS region 16 (panel.js, docs/wayfinder/portal-static-assets/inventory.md
   §2). LIST_ROOT_SELECTOR is gone outright rather than becoming a parameter
   here: the original swept every list-page id in one document-wide query
   because one script bundle served all of them at once. #210's per-page
   entry point already scopes the call to a single root
   (initListPage(document.querySelector('#students-filtered-content'), …)),
   so the multi-root batching this file's original calibrateStackMode did
   (remove every list's stacked class, THEN measure all of them, THEN
   restore) collapses to the same three steps for the one root it's handed -
   still in that order, for the same reason: measuring while a stale
   'rows-stacked' class is still applied would read the wrong layout.

   The generation counter and the facts-strip measurement pass are both
   parameters (measure, below) rather than an import of syncFactsColumnWidths
   - same reasoning as facts-strip.js's own header: the orchestrator
   (list-page.js) is what knows when content changed and owns the counter,
   and this module has no business calling into another module's internals
   to re-measure. */

var STACK_ROW_SELECTOR = '.entity-row, .meeting-card';
// Subpixel guard: rowWidth - overhead and need are fractional measurements
// of the same boxes, so an exact-fit row can land a hair either side of the
// comparison on different ticks and flip the whole list's format for a
// fraction of a pixel.
var STACK_EPSILON_PX = 1;

function factsStripLine(row) {
    // .row-facts, not .row-facts-cols - on pages where those are one and
    // the same element this returns the strip (see facts-strip.js).
    return row.querySelector('.row-facts');
}
function factsStripNeed(listRoot) {
    // The strip's own natural width, stashed by facts-strip.js's
    // syncFactsColumnWidths - read here rather than re-measured, since
    // calibration always runs right after that pass (below).
    return listRoot._factsStripNatural || 0;
}

/* One list's stack-mode decision. `measure(generation)` is facts-strip.js's
   own verb (the object initFactsStrip(root) returns) - calibration needs the
   unstacked layout it produces, not a copy of it. */
export function initStackMode(root, options) {
    var rowSelector = (options && options.rowSelector) || STACK_ROW_SELECTOR;
    return {
        calibrate: function (generation, measure) {
            calibrateStackMode(root, generation, measure, rowSelector);
        },
        update: function () {
            updateListStackMode(root, rowSelector);
        },
    };
}

/* Two numbers, both CONTENT-driven and so cached against `generation`
   (a resize cannot change either one):
     need     - the strip's natural width: what it needs in order not to
                scroll.
     overhead - everything else on the row's line in the UNSTACKED layout:
                padding, thumb group, gaps, buttons column. Measured as
                rowWidth - lineWidth rather than summed from parts, so it
                needs no knowledge of any page's own box model.
   Then on every resize tick the decision is just:
        stack when need > rowWidth - overhead
   Monotonic in rowWidth, and always measured against the UNSTACKED
   geometry, which is what keeps it from oscillating: a naive "does it
   scroll right now" test would stack (freeing the buttons column), find
   that it now fits, unstack, and flip back and forth forever at the
   boundary. */
function calibrateStackMode(root, generation, measure, rowSelector) {
    var cached = root._stackCache;
    if (cached && cached.generation === generation) return;
    var wasStacked = root.classList.contains('rows-stacked');
    root.classList.remove('rows-stacked');
    // The natural column widths this measurement reads are written by this
    // pass, in the per-list scope the unstacked layout uses - without
    // running it here the strip would be measured against whatever the
    // stacked (per-row) pass last left on it.
    measure(generation);
    var overhead = 0;
    var need = factsStripNeed(root);
    var measured = false;
    root.querySelectorAll(rowSelector).forEach(function (row) {
        var line = factsStripLine(row);
        if (!line) return;
        var lineWidth = line.getBoundingClientRect().width;
        var rowWidth = row.getBoundingClientRect().width;
        // A row skipped by content-visibility: auto (Students' own rule)
        // reports zeroes rather than real geometry - a max over the rows
        // that DO report is enough, since every row shares the same column
        // widths in this band anyway.
        if (!rowWidth || !lineWidth) return;
        measured = true;
        overhead = Math.max(overhead, rowWidth - lineWidth);
    });
    if (measured && need) {
        root._stackCache = { generation: generation, overhead: overhead, need: need };
    }
    // Put the list back the way it was found - the real decision runs
    // immediately after this and may well change it again, but this
    // function must never be the thing that chose.
    if (wasStacked) root.classList.add('rows-stacked');
}

/* The width-dependent half: one rect read and no measurement of its own
   beyond that, so it is safe to re-run on every resize tick. */
function updateListStackMode(root, rowSelector) {
    var cached = root._stackCache;
    if (!cached || !cached.need) return;
    var row = root.querySelector(rowSelector);
    if (!row) return;
    // Every row in a list is the same width (they are block-level children
    // of one container), and stacking changes what happens INSIDE a row,
    // never the row's own width - which is what lets one read answer for
    // the whole list, in either state.
    var rowWidth = row.getBoundingClientRect().width;
    if (!rowWidth) return;
    var stacked = cached.need > (rowWidth - cached.overhead) + STACK_EPSILON_PX;
    if (stacked === root.classList.contains('rows-stacked')) return;
    root.classList.toggle('rows-stacked', stacked);
    // Per-page code (a hub-side button-column-width sync, e.g. Meetings)
    // has to re-run when the format flips - a flip changes no container
    // width, so that code's own resize wiring cannot see it. Deliberately
    // an event rather than a direct call: this module has no business
    // knowing which pages happen to have such a script.
    root.dispatchEvent(new CustomEvent('panel:stackmodechange', { bubbles: true }));
}
