/* Custom select / date / time controls all anchor a popover panel off their
   trigger button, and this is the shared machinery: closing every open one
   except the one currently opening, forwarding a click through to whatever's
   underneath a just-closed popover, and positioning a panel within the
   viewport.

   Top-level module functions, not page-lifecycle-bound - these are called by
   enhanceSelect/enhanceDateInput/enhanceTimeInput, which run as soon as this
   script (or panel.js, on AJAX-injected content) calls them, not only after
   DOMContentLoaded. */

export function closeAllUiPopovers(except) {
    document.querySelectorAll('.ui-popover[open]').forEach(function (el) {
        if (el !== except) el.close();
    });
}
document.addEventListener('click', function (e) {
    if (e.target.closest('.ui-select, .ui-date, .ui-time')) return;
    closeAllUiPopovers();
});
document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    closeAllUiPopovers();
});
// A .ui-popover (calendar grid, time spinner, select dropdown) is
// appended to document.body, a sibling of whatever modal it was opened
// from — not a descendant — so closing that parent modal doesn't
// automatically close it too. Without this, closing e.g. "Edit Panel
// Settings" while the time picker is still open left the picker
// orphaned on screen, still fully open and interactive, with no parent
// dialog left to close it. 'close' doesn't bubble, so this has to be a
// capture-phase listener on document rather than one bound per dialog.
document.addEventListener('close', function (e) {
    if (!e.target.matches || !e.target.matches('dialog') || e.target.classList.contains('ui-popover')) return;
    closeAllUiPopovers();
}, true);

// Each popover is a modal <dialog>, which makes every OTHER trigger on
// the page inert while it's open — so a click meant for a different
// trigger never reaches it; it lands on the open popover's own
// (transparent) backdrop instead, which just closes it. Once closed, the
// rest of the page is no longer inert, so re-resolving the same screen
// coordinates a tick later correctly finds the trigger the user actually
// meant to click and clicks it for them — turning what would otherwise
// be a "click to close, click again to open the other one" into one
// click. Restricted to known trigger classes so an incidental click on
// empty modal padding just closes the popover, without also forwarding
// into (and accidentally triggering) the outer dialog's own
// backdrop-click-to-close handler.
export function forwardClickThrough(x, y, ownTrigger) {
    requestAnimationFrame(function () {
        var el = document.elementFromPoint(x, y);
        var target = el && el.closest('.ui-select-trigger, .ui-date-calendar-btn, .ui-add-group-btn');
        // Don't re-click the trigger that just closed this very popover —
        // otherwise clicking anywhere over the trigger a second time
        // (which lands on the modal dialog's own transparent backdrop,
        // since the trigger is inert while its popover is open) would
        // immediately reopen what the user just closed.
        if (target && target !== ownTrigger) target.click();
    });
}

// Positions a popover with explicit position:fixed coordinates anchored to
// the trigger's getBoundingClientRect(), flipping above when there isn't
// room below and clamping horizontally to the viewport. position:fixed
// (rather than position:absolute relative to an in-flow ancestor) is
// deliberate: these popovers live inside a scrollable <dialog>
// (hubs/inclusion/panel/static/panel/css/panel.css's max-height/overflow-y on
// dialog.modal-dialog), and an absolutely-positioned descendant of a
// scroll-clipping ancestor can render outside the modal's visible box
// once flipped — fixed positioning anchors purely to the viewport and
// sidesteps that clipping ambiguity entirely. Must run after the
// popover's content is rendered and made visible (display:none elements
// report 0 for offsetHeight/offsetWidth), otherwise there's nothing to
// measure.
/* The gap a popover keeps between itself and every viewport edge. Was
   already the horizontal clamp's own literal 8 below; named here since
   the vertical cap (#183) needs the same number to mean the same thing
   on both axes. */
var POPOVER_VIEWPORT_MARGIN = 8;
/* Floor for the height cap - roughly three options plus the panel's own
   chrome, i.e. still recognisably a scrollable list rather than a
   letterbox. */
var POPOVER_MIN_HEIGHT = 120;
export function positionPopover(panel, anchorEl, opts) {
    opts = opts || {};
    panel.style.position = 'fixed';
    // matchWidth is a floor, not an exact match: opts.contentWidth (the
    // widest option's own text, .ui-select-panel callers only) can push
    // the open panel wider than the closed trigger - a .filter-field
    // trigger is now sized to its label, not its widest option (main.js
    // resolveTriggerMinWidth, live feedback 2026-08-23), so the popover
    // still needs to be wide enough to show a long option on one line
    // rather than wrapping it just because the closed control is narrow.
    if (opts.matchWidth) panel.style.width = Math.max(anchorEl.getBoundingClientRect().width, opts.contentWidth || 0) + 'px';
    var rect = anchorEl.getBoundingClientRect();
    /* #183: cap the panel to the room that actually exists before
       placing it. Live feedback: "dropdown selection on a long list can
       be cut off and not reachable by scrolling! This is mobile
       landscape!" - .ui-popover's own max-height: 260px (forms.css) is
       a fixed number chosen with no reference to the viewport, so on a
       375px-tall one a long list overflowed whichever way it was
       placed: below, it ran past the bottom edge; flipped above, its
       top went negative. Unreachable either way rather than merely
       awkward - the panel scrolls INTERNALLY, so its own scrollbar only
       moves content inside a box whose far edge is off-screen, and the
       page can't be scrolled to it because the panel is position:
       fixed.
       Cleared first: this cap is an inline style, so a tighter one left
       by a previous open would otherwise still be in force and be
       measured as if it were the panel's natural height. */
    panel.style.maxHeight = '';
    /* visualViewport.height, not innerHeight - the visible height with
       browser chrome/an on-screen keyboard accounted for, which is the
       height a fixed panel actually has to fit inside. Same source
       positionFilterTray already measures against. */
    var viewportHeight = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    var panelHeight = panel.offsetHeight;
    var spaceBelow = viewportHeight - rect.bottom - POPOVER_VIEWPORT_MARGIN;
    var spaceAbove = rect.top - POPOVER_VIEWPORT_MARGIN;
    // Unchanged flip rule - only the space either side of it is now
    // measured net of the margin the panel has to keep off each edge.
    var placeAbove = spaceBelow < panelHeight + 12 && spaceAbove > spaceBelow;
    /* The floor matters when the trigger itself sits near an edge: with
       no minimum, the "available" space on the chosen side can be a few
       px and the panel would collapse to an unusable sliver. Below the
       floor it deliberately overflows a little instead, and the clamp
       below is what keeps that overflow inside the viewport. */
    var available = Math.max(placeAbove ? spaceAbove : spaceBelow, POPOVER_MIN_HEIGHT);
    if (panelHeight > available) {
        panel.style.maxHeight = available + 'px';
        // Re-read AFTER the cap: the pre-cap height is what the top
        // arithmetic below would otherwise place against, which is
        // exactly how the flipped-above case ended up at a negative top.
        panelHeight = panel.offsetHeight;
    }
    var top = placeAbove
        ? rect.top - panelHeight - 4
        : rect.bottom + 4;
    /* Final guarantee, independent of everything above: neither edge
       leaves the viewport whatever the measurements said. Math.max on
       the upper bound keeps this from inverting into a negative top on
       a viewport too short to hold even the floored panel. */
    top = Math.min(
        Math.max(POPOVER_VIEWPORT_MARGIN, top),
        Math.max(POPOVER_VIEWPORT_MARGIN, viewportHeight - panelHeight - POPOVER_VIEWPORT_MARGIN)
    );
    var left = opts.alignRight ? rect.right - panel.offsetWidth : rect.left;
    var maxLeft = window.innerWidth - panel.offsetWidth - POPOVER_VIEWPORT_MARGIN;
    left = Math.min(Math.max(POPOVER_VIEWPORT_MARGIN, left), Math.max(POPOVER_VIEWPORT_MARGIN, maxLeft));
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
}
