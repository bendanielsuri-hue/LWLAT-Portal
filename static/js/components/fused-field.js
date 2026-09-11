/* A .ui-fused-field-group (label + select + "+" button fused into one
   control, forms.css) decides at measurement time whether it has room to sit
   on one line or has to stack - re-evaluated on a ResizeObserver so a
   narrowing column re-stacks live rather than only on page load. */

var FUSED_FIELD_HYSTERESIS = 10;

export function evaluateFusedFieldGroup(groupEl) {
    // Some groups (e.g. Panel Setup's Panel Settings card) want every row
    // stacked label-above unconditionally, for visual consistency across
    // the group, rather than each row independently deciding based on its
    // own measured overflow - skip the measurement entirely for those.
    if (groupEl.classList.contains('ui-fused-field-group--force-stacked')) {
        groupEl.querySelectorAll('.ui-fused-field').forEach(function (row) {
            row.classList.add('ui-fused-field--stacked');
        });
        return;
    }
    // Stacking a row taller changes this group's own height, which would
    // otherwise re-fire the ResizeObserver below on itself even though
    // nothing about its *width* (the only dimension that matters here)
    // changed — without this guard that becomes a self-triggering loop,
    // visibly flickering as rows keep re-toggling.
    var width = groupEl.getBoundingClientRect().width;
    if (groupEl._labeledSelectWidth !== undefined && Math.abs(groupEl._labeledSelectWidth - width) < 1) return;
    groupEl._labeledSelectWidth = width;

    groupEl.querySelectorAll('.ui-fused-field').forEach(function (row) {
        var wasStacked = row.classList.contains('ui-fused-field--stacked');
        // Measure real overflow rather than approximating with a fixed
        // width guess — a row's actual required width varies (a single
        // select's own widest-option floor, vs. Date/Time's several
        // mini-dropdowns plus a calendar button), and only true overflow
        // (content wider than the row's own box) is what would actually
        // clip the chevron or squeeze the label. Un-stack first so the
        // measurement reflects the row's natural beside-label content
        // width, not whatever it measured last time.
        if (wasStacked) row.classList.remove('ui-fused-field--stacked');
        var overflow = row.scrollWidth - row.clientWidth;
        // A select's trigger (or the label) truncates its own text with
        // an ellipsis rather than growing past its grid cell, so the row
        // itself never registers scrollWidth > clientWidth even once the
        // selected option's been squeezed down to unreadable — check
        // those truncatable pieces directly too. Excludes Date/Time's
        // mini Day/Month/Year-style dropdowns (.ui-select--sm), which
        // fall back to a compact display of their own instead.
        row.querySelectorAll('.ui-fused-field-label, .ui-select:not(.ui-select--sm) > .ui-select-trigger').forEach(function (el) {
            overflow = Math.max(overflow, el.scrollWidth - el.clientWidth);
        });
        // Once stacked, require a bit of comfortable slack before
        // switching back, so a row doesn't flip-flop right at the
        // boundary while a container is being resized.
        var needsStacking = wasStacked ? overflow > -FUSED_FIELD_HYSTERESIS : overflow > 0;
        if (needsStacking) row.classList.add('ui-fused-field--stacked');
    });
}

export const initFusedFieldStacking = function (root) {
    (root || document).querySelectorAll('.ui-fused-field-group').forEach(function (groupEl) {
        evaluateFusedFieldGroup(groupEl);
        if (typeof ResizeObserver === 'undefined' || groupEl._labeledSelectObserved) return;
        groupEl._labeledSelectObserved = true;
        new ResizeObserver(function () { evaluateFusedFieldGroup(groupEl); }).observe(groupEl);
    });
};
