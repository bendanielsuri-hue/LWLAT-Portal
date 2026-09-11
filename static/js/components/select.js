/* Progressive enhancement over a native <select>: the native element stays in
   the DOM (visually hidden) as the real form field and the single source of
   truth, so required/value/form.checkValidity()/normal POST submission all
   keep working untouched. A custom trigger button + anchored popover
   (styled like .tab-row-more-menu/.side-nav option rows, see style.css) reads
   and writes that native element's value and fires a real `change` event on
   it whenever the user picks something, which is what any existing listener
   on the form reacts to.

   The width-measurement half (ghost element, ~430 lines) stays with
   enhanceSelect rather than becoming its own file: it is one measurement
   cache with one consumer, the same argument ADR 0020 makes for
   list-page/facts-strip.js keeping its three regions together, at a fifth of
   the size. */

import { closeAllUiPopovers, forwardClickThrough, positionPopover } from './popover.js';

var SELECT_TRIGGER_PADDING = 48;
var SELECT_TRIGGER_MAX_WIDTH = 240;
// .filter-field has its own, smaller, fixed cap (components/forms.css
// .filter-field { max-width: 200px }) - 200 minus the field's own
// horizontal padding (--space-sm, 12px each side), since that padding
// eats into the budget actually available to .ui-select-trigger inside
// it. Using the generic 240px cap here would still overflow the field
// by up to 16px - a smaller version of the exact bug this constant
// exists to avoid (see grilling session 2026-07-12).
var FILTER_FIELD_TRIGGER_MAX_WIDTH = 176;
/* The shortest value a filter trigger is allowed to size itself to - see
   resolveTriggerMinWidth's floor. A string, not a number, so it is
   measured in the trigger's own live font. */
var FILTER_FIELD_TRIGGER_MIN_TEXT = 'Yes';
var selectWidthGhost = null;
function textWidth(text, font) {
    if (!selectWidthGhost) {
        selectWidthGhost = document.createElement('span');
        selectWidthGhost.style.position = 'absolute';
        selectWidthGhost.style.visibility = 'hidden';
        selectWidthGhost.style.left = '-9999px';
        selectWidthGhost.style.whiteSpace = 'nowrap';
        document.body.appendChild(selectWidthGhost);
    }
    selectWidthGhost.style.font = font;
    selectWidthGhost.textContent = text;
    return selectWidthGhost.offsetWidth;
}
function maxOptionTextWidth(selectEl, font) {
    var max = 0;
    Array.prototype.forEach.call(selectEl.options, function (opt) {
        max = Math.max(max, textWidth(opt.textContent, font));
    });
    return max;
}

/* A filter label's own natural width - the widest LINE of its text, not
   the width of the box it happens to be rendered in.

   balanceFilterGroupLabels (components/filter-bar/more-filters.js) has
   already broken any multi-word
   label onto two lines with a <br> by the time this runs, so the widest
   line is what the label actually needs; the whole string would
   over-measure a two-line label by roughly double. Its own horizontal
   padding is added back from the computed style rather than assumed,
   since a panel strips it to 0 and the phone-portrait chip does not. */
function labelTextWidth(label) {
    if (!label) return 0;
    var style = window.getComputedStyle(label);
    var span = label.querySelector('.filter-field-label-text') || label;
    var widest = 0;
    (span.innerHTML || '').split(/<br\s*\/?>/i).forEach(function (line) {
        var text = line.replace(/<[^>]*>/g, '').trim();
        if (text) widest = Math.max(widest, textWidth(text, style.font));
    });
    return widest ? widest + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) : 0;
}

/* Everything in the trigger that is not the value's own text: its side
   padding (the right side is the chevron's reserved room) and its own
   borders, plus a pixel of slack for sub-pixel rounding. Measured, not
   assumed, wherever the result is used as a hard ceiling. */
function triggerChromeWidth(trigger) {
    var style = window.getComputedStyle(trigger);
    return parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) +
        parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth) + 1;
}

// The closed trigger's stable width, one rule for all three contexts a
// select can be enhanced in:
// - .ui-fused-field: no fixed pixel makes sense - the control is always
//   meant to exactly fill a variable-width cell (an auto-aligned column,
//   or the full row once stacked), so this is skipped entirely and the
//   trigger just fills its cell via width: 100%, truncating with an
//   ellipsis if a value doesn't fit.
// - .filter-field: sized to its own *label*, not the widest option - a
//   filter bar wants as many fields visible on screen as possible, so a
//   field only grows past its label when the value actually picked needs
//   more room (live feedback 2026-08-23: "filters should be the width of
//   the label unless a wide selection has actually been selected"). Still
//   capped at FILTER_FIELD_TRIGGER_MAX_WIDTH so one very long option
//   value doesn't blow the field out past the field's own budget - it
//   just clips with the trigger's existing ellipsis instead.
//   In a filter PANEL (isWrappingFilterField, below) it still grows to
//   the selection, but only as far as one line's worth; past the cap it
//   asks for a two-LINE width instead of being truncated, because the
//   trigger there wraps (panel.css). One line first, always - halving
//   every value would wrap "All" as readily as a real phrase. Only a
//   value that cannot fit one line inside the cap gets the two-line
//   budget, which is roughly half the width for the same text.
//   Why it matters: panel fields are content-sized flex items packed onto
//   shared lines, so every pixel a field grows can push a whole section
//   onto a new row. Sizing every field to its WIDEST option instead was
//   tried and reverted - live feedback: "this takes too much space when
//   mostly they are set to all". Whatever growth is left is animated
//   rather than designed out (animateFilterTrayReflow, above).
//   0.55, not a flat half: wrapping breaks at words, so two lines never
//   pack perfectly full - the extra 10% is the same allowance the tray's
//   own column-fit maths used before it. It applies to the TEXT only,
//   with the chrome added back whole: side padding and the chevron's
//   reserved room are spent once, not per line.
//   That chrome is measured off the trigger rather than taken from
//   SELECT_TRIGGER_PADDING here. The constant is a fair estimate when it
//   only sets a floor, but applyTriggerWidth turns this number into a
//   hard ceiling in a panel, and being a few px under then costs real
//   text: every short value came back as "A" instead of "All" (live
//   feedback: "it is all getting truncated").
// - everywhere else: sized to the widest *option* (so picking a short
//   option doesn't narrow the control down enough to clip a longer one
//   next time it's opened), capped at the generic SELECT_TRIGGER_MAX_WIDTH.
// An inline min-width always wins over max-width/width: 100% when they
// conflict, which is exactly why .ui-fused-field and .filter-field each
// need their own handling rather than the generic one (see grilling
// session 2026-07-12).
/* True for a filter field that sits in a filter PANEL - somewhere a long
   value is allowed to wrap onto a second line instead of demanding the
   width to sit on one (panel.css).

   Two of them: the tray (phone portrait, landscape phone, portrait tablet
   and a narrowed desktop window - every tier that renders fields in the
   tray at all), and the "View filters" panel every width above mobile
   drops down. Live feedback: "can desktop also have a wrap on long
   selected filters, are they less tall?" - they are, and a panel has
   vertical room to spend where it has no horizontal room to spare.

   Not the always-visible primary row: that is one line of controls beside
   the search box, where a field growing a second line would set the whole
   bar's height. Phone portrait used to be excluded too, because its chip
   grid pinned every trigger to min-width: 0 and sized it by its column,
   leaving no inline width to act on - that grid is gone (#185) and its
   fields are content-sized like every other tier's now.

   Read live rather than cached: the dev breakpoint preview and a real
   rotation both cross this boundary without a reload. */
function isWrappingFilterField(filterField) {
    if (filterField.closest('.filter-secondary-fields')) return true;
    var root = document.documentElement;
    if (!(root.classList.contains('phone-chrome-side') ||
        root.classList.contains('filter-bar-mobile-mode'))) return false;
    return !!filterField.closest('.filter-bar-collapsible-inner');
}
function resolveTriggerMinWidth(selectEl, trigger) {
    if (selectEl.closest('.ui-fused-field')) return '';
    var font = window.getComputedStyle(trigger).font;
    var filterField = selectEl.closest('.filter-field');
    if (filterField) {
        var label = filterField.querySelector(':scope > label');
        var wraps = isWrappingFilterField(filterField);
        // In a panel the label is measured from its own TEXT, not from
        // its rendered box: it stretches to whatever width the field
        // currently is, so reading offsetWidth after a wide option had
        // widened the field fed that width straight back in as the floor
        // and the control could never shrink again - live feedback: "when
        // I drop back to all it does not revert back to narrow!".
        var labelWidth = wraps ? labelTextWidth(label) : (label ? label.offsetWidth : 0);
        var selectedOpt = selectEl.options[selectEl.selectedIndex];
        var selectedText = selectedOpt ? textWidth(selectedOpt.textContent, font) : 0;
        var valueWidth = selectedText ? selectedText + SELECT_TRIGGER_PADDING : 0;
        if (selectedText && wraps) {
            var chrome = triggerChromeWidth(trigger);
            var oneLine = selectedText + chrome;
            valueWidth = oneLine <= FILTER_FIELD_TRIGGER_MAX_WIDTH
                ? oneLine
                : (selectedText * 0.55) + chrome;
        }
        /* A floor, so a short value can't shrink the control below what
           a normal short value needs - live feedback: "can we change so
           that minimum width of dropdown is same as if Yes is selected.
           If I change it to Y it reduces in width!". The label is
           already a floor, but a field whose label is short too (EAL,
           More Able) had nothing else holding it, so picking a
           one-character value visibly narrowed the control and pushed
           its whole row around.
           Measured from the reference string through the same
           textWidth/chrome path as the value itself rather than set as
           a pixel number, so it tracks the font the trigger actually
           renders in instead of drifting from it. */
        var floorWidth = textWidth(FILTER_FIELD_TRIGGER_MIN_TEXT, font)
            + (wraps ? triggerChromeWidth(trigger) : SELECT_TRIGGER_PADDING);
        return Math.min(Math.max(labelWidth, valueWidth, floorWidth), FILTER_FIELD_TRIGGER_MAX_WIDTH) + 'px';
    }
    var widest = maxOptionTextWidth(selectEl, font);
    return Math.min(widest + SELECT_TRIGGER_PADDING, SELECT_TRIGGER_MAX_WIDTH) + 'px';
}

/* Sets the trigger's inline width from resolveTriggerMinWidth, as a floor
   everywhere and - in a filter panel - as a ceiling as well.

   The ceiling is what makes the two-line budget above mean anything. A
   panel field is a flex item with a basis of auto, so it sizes to its own
   max-content: without an upper bound the trigger simply grows until the
   whole value fits on one line, and the white-space: normal meant to wrap
   it (panel.css) never has a reason to. That shipped - live feedback, with
   a screenshot of a 240px-wide Ethnicity: "I do not see it wrapping onto
   two lines?".

   Same value for both bounds, so the control is exactly as wide as its own
   budget says and the text wraps inside it. Cleared elsewhere, where a
   trigger is free to size to its own content. */
function applyTriggerWidth(selectEl, trigger) {
    var width = resolveTriggerMinWidth(selectEl, trigger);
    trigger.style.minWidth = width;
    var filterField = selectEl.closest('.filter-field');
    trigger.style.maxWidth = (width && filterField && isWrappingFilterField(filterField)) ? width : '';
}

/* Recompute every filter trigger's inline width in `bar` against the tier
   that is live NOW. resolveTriggerMinWidth's tray branch (above) reads
   root classes that a rotation, a window resize or the dev breakpoint
   preview can all change without any select being re-rendered - without
   this, a field keeps whichever rule applied the last time it happened to
   render. Idempotent: it only re-reads and re-writes the same property. */
export const resyncFilterTriggerWidths = function (bar) {
    bar.querySelectorAll('.filter-field .ui-select').forEach(function (wrap) {
        var selectEl = wrap.querySelector('select');
        var trigger = wrap.querySelector('.ui-select-trigger');
        if (selectEl && trigger) applyTriggerWidth(selectEl, trigger);
    });
};

// The open popover's own width floor - always the generic
// SELECT_TRIGGER_MAX_WIDTH cap regardless of context, never the tighter
// FILTER_FIELD_TRIGGER_MAX_WIDTH: a .filter-field's closed trigger is
// deliberately capped to its own column budget, but the popover is an
// overlay positioned on top of the page, not confined to that column, so
// a wide option (a long Panel Group name, say) can still show in full
// instead of wrapping just because the closed control reads narrow.
function popoverContentWidth(selectEl, trigger) {
    return Math.min(maxOptionTextWidth(selectEl, window.getComputedStyle(trigger).font) + SELECT_TRIGGER_PADDING, SELECT_TRIGGER_MAX_WIDTH);
}

export const enhanceSelect = function (selectEl) {
    if (!selectEl || selectEl._uiSelect) return;

    var wrap = document.createElement('span');
    wrap.className = 'ui-select';
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ui-select-trigger';
    trigger.disabled = selectEl.disabled;
    // (INT-U3) Carry the underlying <select>'s own disabled reason onto
    // the trigger that stands in for it - the native control is hidden
    // once enhanced, so a reason left on it could never be hovered.
    if (selectEl.dataset.disabledReason) trigger.dataset.disabledReason = selectEl.dataset.disabledReason;
    // A <dialog> shown via showModal(), not a plain div with the
    // popover attribute: the popover API's coexistence with an
    // already-open modal <dialog> turned out to make this element inert
    // in practice (clicks/hover passed straight through to whatever was
    // behind it) — nested modal dialogs are a far more battle-tested
    // browser pattern for "must stay on top of, and interactive
    // alongside, an open dialog."
    var panel = document.createElement('dialog');
    // Mirrors the source <select>'s own classes onto the panel, same as
    // render() below does for the trigger button - the panel is a
    // sibling of the trigger in document.body, not a descendant, so a
    // class like ui-select--center placed on the <select> in a template
    // wouldn't otherwise reach its popover options via CSS.
    panel.className = 'ui-select-panel ui-popover ' + Array.prototype.filter.call(
        selectEl.classList, function (c) { return c !== 'ui-select-native'; }
    ).join(' ');
    // .ui-fused-field--stacked selects (e.g. Chair) center their value
    // under a centered label - see DES-A2.
    // That context lives on an ancestor, not the <select>'s own class
    // list, so it can't be picked up by the mirroring above.
    if (selectEl.closest('.ui-fused-field--stacked')) {
        panel.classList.add('ui-select-panel--stacked-context');
    }

    selectEl.classList.add('ui-select-native');
    // tabIndex = -1: visually hidden (opacity: 0, 1x1px, forms.css) is
    // not the same as out of the tab order - a plain <select> stays
    // natively focusable regardless of how it's styled, so without this
    // Tab would stop on it AND the visible trigger button separately,
    // one invisible stop per field (live feedback: "why do I need to
    // hit tab twice to get to next filter"). Doesn't affect anything
    // else this element still needs to do scripted (reading/setting
    // .value, dispatching change, participating in form submission) -
    // tabindex only ever affects keyboard Tab traversal.
    selectEl.tabIndex = -1;
    selectEl.parentNode.insertBefore(wrap, selectEl);
    wrap.appendChild(selectEl);
    wrap.appendChild(trigger);
    document.body.appendChild(panel);
    panel.addEventListener('click', function (e) {
        if (e.target !== panel) return;
        var x = e.clientX, y = e.clientY;
        panel.close();
        forwardClickThrough(x, y, trigger);
    });
    // Flips the trigger's chevron to point up while its popover is open,
    // regardless of which of the several ways (re-click, outside click,
    // Escape, picking an option) closed it — a single `close` listener on
    // the <dialog> covers all of them instead of repeating this at every
    // call site that can close the panel.
    panel.addEventListener('close', function () {
        trigger.classList.remove('open');
    });

    function currentLabel() {
        var opt = selectEl.options[selectEl.selectedIndex];
        return opt ? opt.textContent : '';
    }

    function render() {
        /* The label goes in a span rather than straight onto the button.
           A <button> can't be a line-clamp container: Chrome blockifies
           display: -webkit-box on one to flow-root (measured - the clamp
           was silently ignored and a long value clipped mid-line with no
           ellipsis), so the one layout that wants a two-line value - the
           fused label-beside-control filter field, panel.css - needs a
           real element inside the button to clamp instead. Everywhere
           else this is invisible: the span is inline and inherits, and
           trigger.textContent still reads back exactly the same string,
           so resolveTriggerMinWidth and every other reader is unaffected.
           Rebuilt each render rather than reused - render() already
           rewrites the whole label on every change. */
        trigger.textContent = '';
        var labelSpan = document.createElement('span');
        labelSpan.className = 'ui-select-trigger-text';
        labelSpan.textContent = currentLabel();
        trigger.appendChild(labelSpan);
        // Mirror the wrapped select's own classes (e.g. a value-driven
        // colour class set server-side) onto the visible trigger button,
        // since the native select itself is hidden.
        var isPriority = selectEl.classList.contains('priority-select');
        trigger.className = 'ui-select-trigger ' + Array.prototype.filter.call(
            selectEl.classList, function (c) { return c !== 'ui-select-native'; }
        ).join(' ') + (isPriority ? ' priority-' + selectEl.value : '');
        // Size the closed control to the widest option rather than
        // whichever one happens to be selected, so picking a short
        // option doesn't narrow the control (and its popover list,
        // which mirrors this width) down enough to clip longer options
        // next time it's opened - see resolveTriggerMinWidth above for
        // the per-context caps (.ui-fused-field/.filter-field/generic).
        applyTriggerWidth(selectEl, trigger);
        panel.innerHTML = '';
        function appendOption(opt) {
            var row = document.createElement('div');
            row.className = 'ui-option' + (opt.selected ? ' selected' : '') + (opt.dataset.muted === '1' ? ' muted' : '') + (isPriority ? ' priority-' + opt.value : '');
            row.textContent = opt.textContent;
            row.dataset.value = opt.value;
            row.addEventListener('click', function () {
                selectEl.value = opt.value;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                render();
                closeAllUiPopovers();
            });
            panel.appendChild(row);
        }
        // Walk the select's own direct children (not the flat .options
        // collection) so an <optgroup>'s label renders as a heading in
        // the popover instead of silently vanishing - the native select
        // always had this structure, the popover just never showed it.
        Array.prototype.forEach.call(selectEl.children, function (child) {
            if (child.tagName === 'OPTGROUP') {
                var heading = document.createElement('div');
                heading.className = 'ui-option-group-label';
                heading.textContent = child.label;
                panel.appendChild(heading);
                Array.prototype.forEach.call(child.children, appendOption);
            } else {
                appendOption(child);
            }
        });
    }

    trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        var isOpen = panel.open;
        closeAllUiPopovers(panel);
        if (isOpen) {
            panel.close();
        } else {
            panel.showModal();
            trigger.classList.add('open');
            positionPopover(panel, trigger, { matchWidth: true, contentWidth: popoverContentWidth(selectEl, trigger) });
        }
    });

    trigger.addEventListener('keydown', function (e) {
        // Delete/Backspace clears back to a blank/placeholder option —
        // only for selects that actually have one (optional fields like
        // Default Chair/member staff/expertise). Required fields
        // (Day/Month/Year/Hour/Minute/Panel Group) never have a blank
        // `value=""` first option, so this guard naturally excludes them
        // with no per-field configuration needed.
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectEl.options.length && selectEl.options[0].value === '' && selectEl.selectedIndex !== 0) {
                e.preventDefault();
                selectEl.selectedIndex = 0;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                render();
            }
            return;
        }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (!panel.open) {
            // Matches native <select> behavior: arrow keys on a closed,
            // focused select cycle the value directly rather than
            // opening the list; Enter/Space still open it.
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                var delta = e.key === 'ArrowDown' ? 1 : -1;
                var nextIdx = Math.min(selectEl.options.length - 1, Math.max(0, selectEl.selectedIndex + delta));
                if (nextIdx !== selectEl.selectedIndex) {
                    selectEl.selectedIndex = nextIdx;
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    render();
                }
                return;
            }
            closeAllUiPopovers(panel);
            panel.showModal();
            trigger.classList.add('open');
            positionPopover(panel, trigger, { matchWidth: true, contentWidth: popoverContentWidth(selectEl, trigger) });
            return;
        }
        var rows = Array.prototype.slice.call(panel.querySelectorAll('.ui-option'));
        var current = panel.querySelector('.ui-option.highlighted') || panel.querySelector('.ui-option.selected');
        var idx = rows.indexOf(current);
        if (e.key === 'ArrowDown') idx = Math.min(rows.length - 1, idx + 1);
        else if (e.key === 'ArrowUp') idx = Math.max(0, idx - 1);
        else if (current) { current.click(); return; }
        rows.forEach(function (r) { r.classList.remove('highlighted'); });
        if (rows[idx]) {
            rows[idx].classList.add('highlighted');
            rows[idx].scrollIntoView({ block: 'nearest' });
        }
    });

    selectEl._uiSelect = { refresh: render };
    render();
};

