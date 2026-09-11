/* Any horizontally-stacked row of 2+ buttons doesn't always fit at narrow
   widths - live feedback on Meetings' own action row first: "buttons don't
   fit... could we lose either the text or icons before we get it to wrap",
   then, once dropping text first actually shipped: "I did not want this,
   lose the icons if it does not fit" - text stays, icon goes; then
   generalized further: "can we make all the buttons work this way when
   horizontally stacked" - the same class of list-page pattern Meetings'
   own case came from.

   ⚠️ IN PROGRESS - #210, slice D. Assembled and parameterised but NOT yet
   imported by anything; panel.js still holds the original copy (region 17)
   that actually runs. list-page.js does not exist yet.

   BUTTON_ROW_SELECTORS (panel.js, a hardcoded list of five page ids) becomes
   a plain `rowSelector` parameter, scoped to whatever root list-page.js's
   caller hands it - the multi-page selector list existed only because one
   script bundle served all five pages; #210's per-page entry point already
   scopes the call to a single root.

   `syncMeetingsButtonColumnWidth` stays OUT of this file on purpose (#210's
   own task text) - it is Meetings-specific (the shared button-COLUMN width
   down a whole list, not per-row overflow), so it stays hub-side and reacts
   to the `panel:stackmodechange` event this list-page module's sibling
   (stack-mode.js) dispatches, same as any other hub-side script would. */

/* Per-row (not per-list like the facts-strip/stack-mode measurements) since
   each row's own button set/labels can differ (Meetings: status; Actions:
   whether a referral exists to link to). scrollWidth, not
   getBoundingClientRect().width - a button already flex-shrunk below its
   own content's natural size (a row's flex: 1 1 0/list-card's flex-wrap)
   still reports its true, unclipped content width via scrollWidth even
   though the rendered box itself is narrower (the text visually overflows
   the shrunk box with nowrap set and no ellipsis) - getBoundingClientRect()
   would only ever report the shrunk box's own current size, never what it
   actually needs. */
export function initButtonRowOverflow(root, options) {
    var rowSelector = options && options.rowSelector;
    return {
        update: function (generation) {
            updateButtonRowOverflow(root, rowSelector, generation);
        },
    };
}

function updateButtonRowOverflow(root, rowSelector, generation) {
    if (!rowSelector) return;
    /* Restructured into strict write-pass / read-pass / write-pass phases
       across the whole list (doing all three per row forces one
       synchronous layout per row, since each row's hide-icons write would
       force the next row's measurement to re-layout from scratch). The
       natural width itself - the sum of the row's own buttons' scrollWidths
       - is content-driven and cannot change with viewport width, so it's
       cached per row against `generation` and only re-measured when the
       content actually changes. What still has to be re-decided on every
       resize is only the comparison against the row's own current box
       width. */
    var rows = [];
    root.querySelectorAll(rowSelector).forEach(function (actions) {
        // Every direct child is a real flex item/slot in this row (see the
        // note in the measure pass below).
        var items = Array.prototype.slice.call(actions.children);
        // A single button can't overflow against itself; a plain-text
        // branch that only ever renders one item never applies here either.
        if (items.length < 2) return;
        var cached = actions._btnRowNaturalCache;
        rows.push({
            actions: actions,
            items: items,
            natural: cached && cached.generation === generation ? cached.natural : null,
        });
    });
    if (!rows.length) return;
    // Remove before measuring, same "un-hide before measuring" reasoning as
    // the facts-strip's column fill pass - a stale class from a wider
    // previous measurement would otherwise report an already-hidden icon's
    // width as 0 and never ask for it back. Done for EVERY row up front
    // (not just the ones being re-measured) because a row's own box width,
    // read in the next pass, can itself depend on whether its icons are
    // currently hidden - reading that while a stale hide-icons was still
    // applied would latch the row into the hidden state.
    rows.forEach(function (entry) { entry.actions.classList.remove('hide-icons'); });
    rows.forEach(function (entry) {
        /* Only a genuinely HORIZONTAL row can overflow horizontally - live
           feedback: "Buttons have lost their icons in desktop mode, I only
           want these to disappear if buttons do not fit in mobile/very
           narrow mode when buttons are horizontally stacked". Above the
           narrow bands these containers are flex-direction: column (the
           buttons sit one above another in a column beside the row's
           content), so the sum of their widths on one line was being
           compared against that column and "overflowed" every time,
           dropping every icon at every desktop width. In a column layout
           that sum describes a line that does not exist: each button has
           the full column width to itself, and the only thing that could
           overflow is their combined HEIGHT, which this fallback has no
           answer for anyway. Tested against the live computed direction
           rather than a px breakpoint copied from the stylesheet - "are
           these buttons actually side by side" is exactly the question,
           and each page flips to column at its own width, so a hardcoded
           number here would be a second source of truth to keep in sync. A
           non-flex container is skipped for the same reason: the one-line
           sum below only describes a flex row. */
        var cs = getComputedStyle(entry.actions);
        entry.horizontal = cs.display.indexOf('flex') !== -1 && cs.flexDirection.indexOf('row') === 0;
        if (!entry.horizontal) return;
        entry.available = entry.actions.getBoundingClientRect().width;
        if (entry.natural === null) entry.natural = measureButtonRowNatural(entry.actions, entry.items, generation);
    });
    rows.forEach(function (entry) {
        if (entry.horizontal && entry.natural > entry.available) entry.actions.classList.add('hide-icons');
    });
}

/* The content-driven half, split out so its result can be cached per row -
   see the note above. Every item passed in is a real flex item/slot in this
   row - NOT necessarily a .btn itself: a disabled button with a tooltip
   wraps the actual .btn in an extra <span title="..."> for the tooltip,
   which is the direct child here instead. Filtering children down to just
   el.matches('.btn') (tried first) silently dropped a tooltip wrapper - and
   so its whole rendered width - out of the "does this fit" sum entirely,
   undercounting the row and never triggering the fallback even when a
   disabled button was visibly taking up just as much room as anything else
   in the row. Every direct child's own scrollWidth, whatever it actually
   is, is what the row genuinely has to fit. */
function measureButtonRowNatural(actions, items, generation) {
    // No "does every item have a label" guard needed here - the base
    // stylesheet's own .hide-icons .btn:has(.btn-label) .btn-icon selector
    // already only ever hides an icon that has a label to fall back on, so
    // a mixed row (some buttons with an icon+label, some plain text, some
    // icon-only) is always safe as-is.
    var gapPx = parseFloat(getComputedStyle(actions).columnGap || getComputedStyle(actions).rowGap || getComputedStyle(actions).gap) || 0;
    var natural = gapPx * (items.length - 1);
    items.forEach(function (slot) {
        // The slot itself (own comment above), not a nested .btn - its
        // scrollWidth is what the flex row actually has to fit, whether or
        // not it happens to be the .btn directly. Exception: a disabled-
        // button tooltip wrapper is display: contents precisely so it
        // generates no box of its own - scrollWidth on it is always 0, so
        // measure its .btn child (the thing that actually renders/sizes)
        // instead.
        var box = slot.matches('.disabled-btn-tooltip-wrap') ? slot.querySelector('.btn') : slot;
        natural += box ? box.scrollWidth : 0;
    });
    actions._btnRowNaturalCache = { generation: generation, natural: natural };
    return natural;
}
