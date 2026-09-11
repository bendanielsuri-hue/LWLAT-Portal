/* The facts strip: measuring the labelled data columns a filterable list row
   carries, and every scroll affordance over them (drag, edge fades, per-row
   prev/next arrows).

   ⚠️ IN PROGRESS - #210, slice C/D. This file is assembled and parameterised
   but NOT yet imported by anything, and panel.js still holds the original
   copy that actually runs. Nothing here is live yet. stack-mode.js and
   button-row-overflow.js now exist alongside this file; list-page.js (the
   orchestrator that assembles all three plus filter wiring and infinite
   scroll) does not yet - panel.js keeps its copy until that lands.

   Merges three inventory regions (14 drag-to-scroll, 15 measurement, 18 edge
   wiring) on purpose - #204 §3. They are one mechanism reached through one
   interface, and splitting them by region would publish the measurement
   cache's generation counter as an interface between files, which is exactly
   the internal detail this module exists to hide.

   938 total lines against a ~600 review trigger that counts CODE lines
   (~325 here), so the trigger is not tripped - but the question it asks is
   worth answering anyway: one module, for the reason above.

   The generation counter itself is NOT owned here. It arrives as a parameter,
   because the orchestrator (list-page.js) is what knows when a list's content
   changed - a MutationObserver it already owns - and a counter passed down is
   one number rather than shared mutable state two other modules reach into.

   The document-level delegates (drag, scroll, arrow clicks) are installed
   once per page, not once per list: they cover rows that do not exist yet,
   which is the whole reason they are delegated.
*/

var delegatesInstalled = false;

/* One list's strip. Returns the two verbs the orchestrator needs, and keeps
   everything else - the caches, the read-pass/write-pass splits, which scope
   a width is shared across - inside.

   measure(generation) settles every column's shared width and then the
   facts-LINE layout that depends on those widths; markEdges() refreshes the
   cut-off fades. They are separate because stack-mode calibration needs the
   first without the second: it measures inside a temporarily-unstacked list,
   where any edge class it wrote would be wrong for the state the list ends
   up in. */
export function initFactsStrip(root) {
    if (!delegatesInstalled) {
        delegatesInstalled = true;
        installDragToScroll();
        installEdgeSync();
        installArrows();
    }
    return {
        measure: function (generation) {
            syncFactsColumnWidths(root, generation);
            updateFactsLineLayout(root);
        },
        markEdges: function () {
            markAllFactsStripEdges(root);
        },
    };
}

// Actions/Referrals/Students facts strip (#154) - .row-facts-cols is a
// permanently-scrollable region now (facts-strip.css), not a wrap-to-a-second-
// line one. Delegated at the document level rather than wired per-row:
// these pages render rows via server-side pagination AND client-side
// infinite-scroll/AJAX swaps, so a fresh .row-facts-cols can appear at any
// time - one delegated listener covers every row that ever exists, present
// or future, with nothing to re-wire.
//
// Drag-to-scroll (mouse only - touch already gets native momentum-scroll
// from overflow-x: auto). Same pointerdown/move/up + DRAG_THRESHOLD
// technique as wireScrollCarousel's own click-drag (main.js) - see that
// function's comment for the full reasoning (defers "is this a drag" until
// real movement happens, so a plain click still reaches whatever's under
// the pointer - here, the row's own select-on-click behaviour).
function installDragToScroll() {
    var DRAG_THRESHOLD = 6;
    var drag = null;
    document.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        var track = e.target.closest('.row-facts-cols');
        if (!track || track.scrollWidth <= track.clientWidth) return;
        drag = { track: track, startX: e.clientX, startScroll: track.scrollLeft, moved: false, id: e.pointerId };
    });
    document.addEventListener('pointermove', function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        var dx = e.clientX - drag.startX;
        if (!drag.moved) {
            if (Math.abs(dx) < DRAG_THRESHOLD) return;
            drag.moved = true;
            drag.track.setPointerCapture(drag.id);
            drag.track.classList.add('is-dragging');
        }
        drag.track.scrollLeft = drag.startScroll - dx;
    });
    function endDrag(e) {
        if (!drag || e.pointerId !== drag.id) return;
        if (drag.moved) {
            drag.track.classList.remove('is-dragging');
            var suppressClick = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
            drag.track.addEventListener('click', suppressClick, { capture: true, once: true });
        }
        drag = null;
    }
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
}

// Actions/Referrals/Students facts strip (#154) - every row scrolls fully
// independently now (a page-wide synced scroll was tried and reverted once
// per-row prev/next arrows, below, made keeping rows aligned pointless).
// .is-cut-left/.is-cut-right (CSS: facts-strip.css) - toggled from the track's
// own real scroll position, same convention as the filter bar's own
// wireFilterSectionScroll (components/filter-bar/sections.js): drives both
// the edge fade AND which arrow (below) is visible, so the fade only ever
// shows - and an arrow only ever offers to scroll - when there's genuinely
// more of the strip hidden in that direction.

function markFactsStripEdges(track) {
    var scrollable = track.scrollWidth - track.clientWidth;
    track.classList.toggle('is-cut-left', track.scrollLeft > 1);
    track.classList.toggle('is-cut-right', scrollable > 1 && track.scrollLeft < scrollable - 1);
}
function markAllFactsStripEdges(root) {
    /* Read every track first, THEN write every class - never interleaved
       per-track the way a plain forEach(markFactsStripEdges) does. Each
       is-cut-left/right toggle dirties layout, so an interleaved loop makes
       the NEXT track's scrollWidth read force a fresh synchronous layout:
       one forced layout per row instead of one for the whole list. Same
       read-pass/write-pass split as fillFactsColumns and
       updateButtonRowOverflow below, and the reason this whole refresh
       stopped being O(rows) forced layouts - see the perf note on
       factsMeasureGeneration above. */
    var tracks = (root || document).querySelectorAll('.row-facts-cols');
    var states = [];
    tracks.forEach(function (track) {
        var scrollable = track.scrollWidth - track.clientWidth;
        states.push({
            track: track,
            cutLeft: track.scrollLeft > 1,
            cutRight: scrollable > 1 && track.scrollLeft < scrollable - 1,
        });
    });
    states.forEach(function (state) {
        state.track.classList.toggle('is-cut-left', state.cutLeft);
        state.track.classList.toggle('is-cut-right', state.cutRight);
    });
}

// Facts strip fill algorithm (#155, then #156 follow-up: "extend this to
// tablet modes"/"extend to mobile if there is space", then "globally,
// data cols move to a new row [and fill it] rather than scrolling", then
// #157: "data cols must always be one row... scrollable if it does not
// fit" reverted row-facts-cols itself back to a non-wrapping scroll strip,
// own comment there) - sets each [data-col] column's flex-basis to a
// shared "natural" width instead of leaving it at its own row's content
// size. Deliberately does NOT compute a manual leftover/bonus for the
// columns - ordinary flex-grow (base rule, facts-strip.css) already redistributes
// a line's own leftover space among its own items automatically, for free,
// per browser spec, once every column shares one grow factor - reinventing
// that in JS was solving a problem (equal-not-proportional bonus, live
// feedback: "the bonus space should be added evenly", "Dob vs Behaviour?")
// that flex-grow already solves on its own; JS's real, remaining job is
// just making sure every row starts from the SAME shared basis (below) so
// the browser's own per-line/per-row math lands on the same numbers
// everywhere. Status never reaches this function at all any more (#157
// follow-up - it moved out of row-facts-cols entirely, _actions_rows.html,
// and syncFactsColumnWidths' own scopedColumns, below, filters it out
// before calling this) - its show/hide is now a plain CSS @container
// query (panel.css, .row-fact-col-status/@container action-row), and its
// own width is fixed content-size (flex: 0 0 auto, panel.css), neither of
// which this width-syncing system needs to know about.
// .row-fact-col-clamp's own max-width: 26ch (base rule, facts-strip.css) still
// caps what counts as "natural" width for Ethnicity/Behaviour/Referral's
// concern category before this - it constrains the measurement itself
// (getBoundingClientRect respects max-width regardless of flex-basis), so
// one unusually long value still can't blow its whole column out on its
// own.
/* The expensive half of fillFactsColumns, split out so it can be skipped
   whenever the content behind it hasn't changed (see
   factsMeasureGeneration above for why a resize can't change any of these
   numbers). Cached on the scope element the widths are shared across -
   the list root while the list is unstacked (one shared column width down
   the whole list), the row itself once it stacks (syncFactsColumnWidths
   passes whichever applies), so the two modes can't read each other's
   numbers. */
function naturalFactsColumnWidths(groups, columns, cacheHost, generation) {
    var keys = Object.keys(groups);
    var cached = cacheHost && cacheHost._factsNaturalCache;
    if (cached && cached.generation === generation
        && cached.keys.length === keys.length
        && cached.keys.every(function (key, i) { return key === keys[i]; })) {
        return cached.natural;
    }
    // Reset all, then measure all, then apply all - never interleaved
    // key-by-key. An earlier version reset+measured one data-col group at
    // a time; while measuring group N, every other group still held its
    // PREVIOUS sync's computed pixel width (not yet reset), so that
    // group's reading came out contaminated by whatever leftover state
    // happened to still be sitting on its row-mates (confirmed live:
    // Behaviour reading narrower than DOB despite genuinely longer
    // content, #155 follow-up).
    // flexGrow: 0 too, not just flexBasis: 'auto' - the CSS rule
    // (facts-strip.css) sets flex-grow: 1 unconditionally, and grow keeps
    // claiming whatever's left regardless of an item's OWN flex-basis, so
    // measuring with grow still on would report "content width plus this
    // scope's current share of leftover space" instead of pure content
    // width.
    columns.forEach(function (col) {
        col.style.flexGrow = '0';
        col.style.flexBasis = 'auto';
        /* max-width deliberately ISN'T reset here for most columns (own
           comment above - a stale, smaller cap from an earlier measure is
           what stops one outlier value from blowing out a shared column
           width). A column holding a pills line (Actions' Referral) is
           the one exception: the pills line was explicitly exempted from
           that same outlier-suppression already (live feedback: "the
           referral pills on action page are truncated too much... this
           must always show", facts-strip.css) precisely because chips aren't
           free text that SHOULD get clipped - so a stale cap left over
           from a narrower measurement (a shorter concern-category value,
           fewer/shorter pills on a different row, a pre-scroll layout
           pass) must not be allowed to silently starve it on a later
           measurement the way it's allowed to for genuine free text
           (Ethnicity/Behaviour) - live feedback with a screenshot: "when
           I scroll to the right, I am still getting Referral pill cut
           off". */
        if (col.querySelector('.row-fact-pills-line')) col.style.maxWidth = '';
    });
    var natural = {};
    keys.forEach(function (key) {
        var max = 0;
        groups[key].forEach(function (col) { max = Math.max(max, col.getBoundingClientRect().width); });
        natural[key] = max;
    });
    if (cacheHost) {
        cacheHost._factsNaturalCache = {
            generation: generation,
            keys: keys.slice(),
            natural: natural,
        };
    }
    return natural;
}
/* Shared with updateFactsLineLayout below - both halves of Actions'/
   Escalations' facts-line layout have to agree on these two numbers or
   they contradict each other: this file's own "how much bonus does one
   column get" cap, and Description's fixed natural width (which must
   match .row-fact-col-description's own flex-basis, panel.css).
   Description is never measured off the DOM the way every other column
   is (syncFactsColumnWidths filters it out entirely, own comment there):
   it holds free-form wrapping text, and an intrinsic measurement of that
   sizes toward "the whole paragraph on one line", not "how much room
   does this genuinely need" - a fixed baseline is the only stable answer
   there is. */
var FACTS_MAX_BONUS_PX = 100;
var FACTS_DESCRIPTION_NATURAL_PX = 320;
function fillFactsColumns(columns, strip, cacheHost, generation) {
    var groups = {};
    columns.forEach(function (col) {
        var key = col.getAttribute('data-col');
        (groups[key] || (groups[key] = [])).push(col);
    });
    var natural = naturalFactsColumnWidths(groups, columns, cacheHost, generation);
    // MAX_BONUS_PX caps how much flex-grow can add on top of each column's
    // own natural width (live feedback with a Referrals screenshot: "its
    // the extra white space that I want capped! Could we make this 100px
    // maximum?" - a very wide row with genuinely little content otherwise
    // let each column's own equal-flat-bonus share (own comment, further
    // below) grow arbitrarily large, e.g. Assignment stretching to fill
    // several hundred spare pixels of blank space). max-width, not a
    // smaller flex-grow factor - flex-grow alone still claims 100% of
    // whatever leftover it's handed, just more slowly; max-width is a hard
    // clamp the browser enforces after growing, and its own multi-pass
    // "freeze" algorithm automatically redistributes whatever a clamped
    // column couldn't take to the other still-growable columns on the same
    // line (same mechanism Description's own cap, below, already relies
    // on) - no extra JS math needed to reroute it manually.
    var MAX_BONUS_PX = FACTS_MAX_BONUS_PX;
    /* Ragged lists - rows that don't all carry the SAME set of columns -
       can't be aligned by flex-grow at all, and Meetings is the one list
       that is ragged: a complete meeting has an extra Discussion column
       that an upcoming one doesn't (_meetings_rows.html), while
       Assigned/Discussed already deliberately share one data-col so they
       line up. Live feedback: "I wanted the columns of completed and not
       completed rows to have same width. Assigned and discussed should
       be treated as same column, only difference is that completed have
       an extra discussion col".
       Why grow can't do it: every column here already gets the same
       shared flex-basis, but flex-grow divides each row's OWN leftover
       space among that row's OWN items - so a 3-column row splits the
       leftover three ways and a 4-column row splits it four ways, and
       every shared column ends up a different width depending only on
       how many columns happen to sit beside it (measured live: Staff
       230.5px wide at x=168 on a 3-column row against 225.7px at x=163
       on a 4-column one). No per-row grow factor can fix that; the
       columns have to stop growing per row and take one fixed width
       instead.
       So: compute the bonus ONCE for the whole list, from the fullest
       row's column set, and hand every column that same fixed width with
       grow off. The fullest row still fills the track exactly as before,
       and a shorter row now lays its columns out at identical widths and
       positions, simply stopping earlier and leaving its trailing space
       empty - which is exactly what "completed just have an extra
       column" means.
       Uniform lists (every other page) are untouched: with one column
       set, every row already had the same leftover split the same number
       of ways, so grow was already producing this same answer. */
    var stripsSeen = [];
    var stripKeySets = [];
    columns.forEach(function (col) {
        var ownStrip = col.closest('.row-facts-cols');
        if (!ownStrip) return;
        var i = stripsSeen.indexOf(ownStrip);
        if (i === -1) {
            stripsSeen.push(ownStrip);
            stripKeySets.push([col.getAttribute('data-col')]);
        } else {
            stripKeySets[i].push(col.getAttribute('data-col'));
        }
    });
    var firstSignature = stripKeySets.length ? stripKeySets[0].join(',') : '';
    var ragged = false;
    var fullestSet = stripKeySets.length ? stripKeySets[0] : [];
    stripKeySets.forEach(function (set) {
        if (set.join(',') !== firstSignature) ragged = true;
        if (set.length > fullestSet.length) fullestSet = set;
    });
    var sharedBonus = 0;
    if (ragged && strip && fullestSet.length) {
        var trackGap = parseFloat(getComputedStyle(strip).columnGap) || 0;
        var fullestNatural = 0;
        fullestSet.forEach(function (key) { fullestNatural += (natural[key] || 0); });
        var trackRoom = strip.clientWidth
            - fullestNatural
            - trackGap * Math.max(fullestSet.length - 1, 0);
        sharedBonus = Math.max(0, Math.min(trackRoom / fullestSet.length, MAX_BONUS_PX));
    }
    Object.keys(groups).forEach(function (key) {
        groups[key].forEach(function (col) {
            if (ragged) {
                // One fixed width for this column on every row (see the
                // ragged-list note above) - grow off, so a row's own
                // column count can no longer change how wide its columns
                // come out. max-width pinned to the same number keeps it
                // exact rather than merely capped.
                var fixed = (natural[key] + sharedBonus) + 'px';
                col.style.flexBasis = fixed;
                col.style.flexGrow = '0';
                col.style.maxWidth = fixed;
                return;
            }
            col.style.flexBasis = natural[key] + 'px';
            // Explicitly set to 1, not just cleared - clearing would fall
            // back to whatever CSS itself says, and Description
            // specifically has its OWN more-specific rule (.row-fact-col-
            // description, panel.css: flex: 0 0 320px) that beats the
            // general .row-fact-col rule's flex: 1 0 auto regardless of
            // source order, since two classes always outrank one - leaving
            // it un-set left Description stuck at grow: 0 forever
            // (confirmed live via Playwright: still exactly 320px wide at
            // 1800px viewport, no bonus, while Due/Created/Referral all
            // grew normally).
            col.style.flexGrow = '1';
            col.style.maxWidth = (natural[key] + MAX_BONUS_PX) + 'px';
        });
    });
    /* Actions/Escalations only (the two pages whose .row-facts holds a
       Description column, and on Actions a Status control, beside the
       strip rather than being the strip): row-facts-track needs BOTH its
       flex-basis and its flex-grow set, not just grow - Description
       competes for .row-facts' own leftover space against row-facts-track
       as a single peer (track is one level up from row-facts-cols, a
       sibling of the whole strip, not of each column individually), and
       track's own base rule (facts-strip.css: flex: 1 1 0) leaves its flex-basis
       at a flat 0, so its TRUE natural content size (Due/Created/Referral
       added together) was never part of the flex split at .row-facts' own
       level at all - only whatever grow-weight it was given was. Weighting
       grow alone (first attempt here) gave Description a hugely disproportionate
       share (541px of a 1220px row, confirmed live) for exactly that
       reason: with basis 0, ALL of track's natural content requirement had
       to come out of its grow allocation too, not just its fair share of
       the genuine leftover on top of what it already needs.
       Basis = the strip's own natural sum, grow = its column count: those
       two together make the browser's own flex math hand out ONE equal
       bonus per column across both levels at once, since Description's own
       base rule (flex: 1 0 320px, panel.css) enters the same split as one
       more column of the same group - bonus = leftover / (columnCount + 1)
       lands identically whether it's computed at the .row-facts level
       (Description vs track) or inside the strip (Due vs Created vs
       Referral). Live feedback: "Status and Description need to also share
       the extra space when all on one line" - Description takes its share
       as real width here (its own text stays capped, so the share reads as
       white space to its right), and Status takes an equal share as a
       trailing margin instead of width (updateFactsLineLayout, below - a
       stretched or squashed segmented control is unreadable). That same
       function owns every decision this one deliberately doesn't make:
       whether the strip fits beside Description at all, and whether the
       fused Status control fits.
       Applied to EVERY row's own track, not one representative row - each
       row lays out independently, so a track left at the CSS default
       (flex-basis: 0) would give ITS OWN Description an oversized share
       and wrap even at a width the row comfortably fits in (confirmed
       live: fixing only the first row's track left every row below it
       wrapping). */
    var stripKeys = Object.keys(groups);
    var stripNaturalSum = 0;
    stripKeys.forEach(function (key) { stripNaturalSum += natural[key]; });
    var stripGapPx = strip ? parseFloat(getComputedStyle(strip).columnGap) || 0 : 0;
    stripNaturalSum += stripGapPx * Math.max(stripKeys.length - 1, 0);
    var trackChrome = null;
    var seenRows = [];
    columns.forEach(function (col) {
        var row = col.closest('.entity-row');
        if (!row || seenRows.indexOf(row) !== -1) return;
        seenRows.push(row);
        // Description's presence is what identifies a row of this shape -
        // every other list's .row-facts IS its column strip (dual class),
        // with nothing beside it for the strip to compete against.
        if (!row.querySelector('.row-fact-col-description')) return;
        var track = row.querySelector('.row-facts-track');
        if (!track) return;
        if (trackChrome === null) {
            /* box-sizing: border-box globally (layout.css), so a flex-basis
               has to cover track's own padding/divider too, not just the
               columns inside it. Read once, not per row - every row's track
               carries the same rule, so one style read answers for all of
               them (and keeps this loop free of interleaved read/write
               forced layouts, same reasoning as the read/write passes
               elsewhere in this file). */
            var trackStyle = getComputedStyle(track);
            trackChrome = (parseFloat(trackStyle.paddingLeft) || 0)
                + (parseFloat(trackStyle.paddingRight) || 0)
                + (parseFloat(trackStyle.borderLeftWidth) || 0)
                + (parseFloat(trackStyle.borderRightWidth) || 0);
        }
        // Stashed on the element for updateFactsLineLayout below - it needs
        // the strip's NATURAL width to decide whether the strip fits beside
        // Description, and track's rendered width can't answer that (it's
        // whatever grow already stretched it to).
        track._factsNaturalWidth = stripNaturalSum + trackChrome;
        track._factsColumnCount = Math.max(stripKeys.length, 1);
        track.style.flexBasis = track._factsNaturalWidth + 'px';
        track.style.flexGrow = String(track._factsColumnCount);
        /* Caps track at exactly what its own children can ever actually
           use - each column already stops growing at natural+
           FACTS_MAX_BONUS_PX (own loop, above), so the combined ceiling
           for all of them is that same sum plus one MAX_BONUS_PX per
           column. Without this, track had no cap of its own (unlike every
           other participant on this line - Description caps at +100,
           the spacer caps at +100), so once Description AND the spacer
           both hit THEIR caps, the browser's own flex "freeze and
           redistribute" pass had nowhere left to send their unused grow
           potential except track - which doesn't feed it to Due/Created/
           Referral (a separate, nested flex context, row-facts-cols) at
           all, so it just sat as one large orphaned gap between Referral
           and the buttons column (live feedback with a screenshot: "Data
           cols are not getting same extra space as Status/Description" -
           they were, individually, up to their own cap; the REST of
           track's oversized share was simply unusable dead space, not
           extra room for them). Freezing track at its own real ceiling
           lets that genuinely-unused remainder show up once, honestly, as
           blank space after the whole facts area instead - the same
           "nothing left needs it" outcome any other maxed-out flex layout
           reaches on a sufficiently wide screen. */
        track.style.maxWidth = (track._factsNaturalWidth + track._factsColumnCount * FACTS_MAX_BONUS_PX) + 'px';
    });
    /* Handed back for updateListStackMode's own "would this strip have to
       scroll" test (below). It has to be THIS number - the columns' own
       content widths plus the gaps and the strip's own padding/border -
       and never the strip's rendered or scroll width: every column here is
       flex-grow: 1 up to its own +100 cap, so a strip that fits its line
       renders at the LINE's width, not at what it needs, and scrollWidth
       reports the same. Feeding that back in would make the test read
       "does this line fit inside itself", which is true at every width
       until the moment it isn't - i.e. exactly the scroll-first behaviour
       the measured format exists to avoid. Only the rows that hold a
       Description column stash a per-track copy above (updateFactsLineLayout
       needs it for a different decision); this covers every page. */
    var stripChrome = 0;
    if (strip) {
        var stripStyle = getComputedStyle(strip);
        stripChrome = (parseFloat(stripStyle.paddingLeft) || 0)
            + (parseFloat(stripStyle.paddingRight) || 0)
            + (parseFloat(stripStyle.borderLeftWidth) || 0)
            + (parseFloat(stripStyle.borderRightWidth) || 0);
    }
    return stripNaturalSum + stripChrome;
}

// Decides, per list or per row depending on whether this is a narrow
// device, what shared "natural" width syncFactsColumnWidths' columns
// should grow from.
// Anywhere but phone chrome - including a stacked list on a desktop
// window (live feedback: "I want them to line up except on narrow
// devices"): decided once per LIST, not per row - live feedback:
// "columns in this mode should align all the way down", i.e. Behaviour on
// row 3 should be exactly as wide as Behaviour on row 1. Measuring across
// every row's columns at once (fillFactsColumns is handed the WHOLE list's
// matching columns, grouped by data-col) is what makes that alignment
// possible; CSS alone can't express "match a sibling row's column".
// Phone chrome (html.phone-chrome, main.js), while stacked: decided once
// per ROW instead (live feedback: "mobile should be per row") - rows read
// as individual cards on a phone, not a table's worth of aligned columns,
// and one shared width across the list would waste room a phone hasn't
// got; each row's own content
// may or may not need to wrap independently of its neighbours.
// Status ("row-fact-col-status") and .row-fact-col-description (Actions'
// Description, Escalations' Reason) are both filtered out unconditionally
// here (#157 follow-up) - neither lives inside row-facts-cols any more
// (_actions_rows.html: they sit beside the strip, not in it), so this
// function's shared-natural-width sync doesn't apply to either, even
// though the general .row-fact-col[data-col] selector still finds them
// wherever they sit in the DOM. Status has no natural width to share
// (fixed content-size, flex: 0 0 auto, panel.css) and Description's own
// natural width is a constant, not something measurable
// (FACTS_DESCRIPTION_NATURAL_PX, above). Their layout - one equal share
// of the line's spare room each, and where each goes when the line runs
// out - belongs to updateFactsLineLayout instead, which runs straight
// after this one and needs the numbers this one measures.
// Filtering them here also keeps an inline flex-basis/max-width off
// Description specifically (live feedback: "data cols do not flow on own
// line if it needs to scroll" - confirmed live: an inline width outranks
// any stylesheet rule regardless of specificity, so writing one here
// silently pinned Description at ~320px and defeated the CSS that was
// supposed to own its width).
export function syncFactsColumnWidths(listRoot, generation) {
    /* Per-row column widths are for NARROW DEVICES only, not for the
       stacked format generally (live feedback: "I want them to line up
       except on narrow devices"). The two used to be the same thing -
       stacking only ever happened below 700px - but a list now stacks
       whenever its columns stop fitting (updateListStackMode below),
       which routinely happens on a wide desktop window; letting that
       flip the scope too made a 900px-wide list's columns size row by
       row, and they visibly failed to line up down the list.
       html.phone-chrome (main.js) rather than a width query of this
       file's own: it is the portal's existing "this is a phone"
       signal, and it already covers the landscape-phone case a plain
       max-width test reads as a tablet (ADR 0016). Stacked is still
       required - the class only means "narrow" and an unstacked list
       has aligned columns by construction anyway. */
    var perRow = listRoot.classList.contains('rows-stacked')
        && document.documentElement.classList.contains('phone-chrome');
    function scopedColumns(root) {
        var cols = Array.prototype.slice.call(root.querySelectorAll('.row-fact-col[data-col]'));
        return cols.filter(function (col) {
            return col.getAttribute('data-col') !== 'status' && !col.classList.contains('row-fact-col-description');
        });
    }
    /* Third argument is the element the measured widths get cached on
       (naturalFactsColumnWidths) - the row in per-row mode, the list
       root in shared mode, matching whatever scope those widths are
       actually shared across. Flipping a list's format swaps which
       element that is, and each mode only ever reads the host that
       belongs to it, so neither can pick up numbers the other one
       measured. */
    if (perRow) {
        listRoot.querySelectorAll('.entity-row').forEach(function (row) {
            var columns = scopedColumns(row);
            if (!columns.length) return;
            row._factsStripNatural = fillFactsColumns(columns, row.querySelector('.row-facts-cols'), row, generation);
        });
        return;
    }
    var columns = scopedColumns(listRoot);
    if (!columns.length) return;
    /* Stashed on the same element the widths themselves are shared
       across, so it can't be read in the wrong scope: while the list is
       unstacked every row's columns share one width, so one number
       describes the whole list (and it's the list-wide one
       updateListStackMode wants); once stacked each row measures its
       own. */
    listRoot._factsStripNatural = fillFactsColumns(columns, listRoot.querySelector('.row-facts-cols'), listRoot, generation);
}


// Owns Actions'/Escalations' whole facts-LINE layout - the one decision
// fillFactsColumns above deliberately leaves alone, needing numbers that
// only exist once every column's shared width is settled: does the data
// strip still fit beside Description (and, on Actions, the fused Status
// control)? If not it drops to its own line below them, full width, and
// Description grows into the room that frees up (live feedback: "if the
// data cols do not fit, they need to drop to own line leaving description
// and status on their own line"). Note what does NOT happen any more:
// Description used to be the item promoted to a full-width line of its own
// (an @container query on row-facts-shell, panel.css), which pushed Status
// DOWN onto line 2 alongside the strip - the wrong pairing, and on a fixed
// 600px threshold rather than the row's own real content widths.
// Whether the fused Status control itself still fits beside Description on
// that first line is NOT decided here any more, unlike the strip - a real
// min-width on Description (.facts-cols-wrapped .row-fact-col-description,
// panel.css) makes .row-facts' own flex-wrap: wrap push Status onto a line
// of its own natively, the instant it doesn't fit, in both directions on
// every resize frame (live feedback: "have Status have its own row if it
// does not fit on same line with description", then "if I then widen the
// window, status should go back to being on same row as Description" - a
// JS class toggled on the debounced resize tick, tried first, could only
// ever catch up after the fact in either direction). Replaces the earlier
// design where Status hid outright and a dropdown in the button column
// took over (live feedback: "lose the Status dropdown altogether in the
// button area") - one control, one place, at every width; the row just
// grows a third line when it needs to.
// The matching "share the line's spare room" bonus after Status (live
// feedback: "I want the white space between to be same as the data col
// extra so it looks consistent") is no longer computed here either - a
// real flex-item spacer (row-facts-status-spacer, _actions_rows.html/
// panel.css) claims it natively now, growing/shrinking in lockstep with
// Description's own CSS-driven bonus on every frame of a resize. The old
// version computed it here instead and wrote it as an inline margin-right,
// which only refreshed on the debounced resize tick (120ms after the drag
// stops, factsMeasureGeneration's own comment above has the stutter-fix
// history) - live feedback: "the extra space to the right of [status] does
// not reduce like the other data cols" was that lag becoming visible, not
// a wrong number. Handing the growth to real CSS removes the lag outright
// instead of shortening the debounce.
// Every threshold is measured against NATURAL widths (Description's fixed
// 320px baseline + Status' own content width + the strip's natural sum),
// never against what anything is currently rendered at. Rendered widths
// already include whatever bonus space this same pass handed out, so
// feeding them back in makes the decision depend on its own outcome: the
// previous version measured Description's live width for decision 2 and so
// hid Status once Description had merely GROWN wide, wrapping it onto an
// empty line of its own first (live feedback: "status disappears when
// there is still space to its right"), and would now read a promoted
// full-width Description as "no room for Status" on every wrapped row.
// Measured on .row-facts, not row-facts-shell: .row-facts bleeds ~58px
// wider than its own shell parent (panel.css bleed rule), and it is the
// flex container Description/Status/track actually lay out inside.
// Read pass then write pass, never interleaved per row - each write
// dirties layout, so an interleaved loop costs one forced layout per row
// instead of one for the whole list (same split as markAllFactsStripEdges
// above).
export function updateFactsLineLayout(listRoot) {
    var entries = [];
    listRoot.querySelectorAll('.entity-row').forEach(function (row) {
        var facts = row.querySelector('.row-facts');
        var track = row.querySelector('.row-facts-track');
        if (!facts || !track || !row.querySelector('.row-fact-col-description')) return;
        var statusCol = row.querySelector('.row-fact-col-status');
        entries.push({
            row: row,
            track: track,
            statusCol: statusCol,
            width: facts.getBoundingClientRect().width,
            gap: parseFloat(getComputedStyle(facts).columnGap) || 0,
            // Status is never display:none any more (own-row replaces
            // hiding it), so this is always a real measurement - no
            // stale-zero-width risk the old status-col-narrow toggle
            // had to guard against by un-hiding before every measure.
            statusWidth: statusCol ? statusCol.getBoundingClientRect().width : 0,
            // Falls back to the rendered width only before
            // fillFactsColumns has ever run on this row (first paint of
            // an infinite-scroll batch) - stale by at most one frame,
            // and the next refresh corrects it.
            stripNatural: track._factsNaturalWidth || track.getBoundingClientRect().width,
            columnCount: track._factsColumnCount || 1,
        });
    });
    if (!entries.length) return;
    // Switches off the CSS-only fallback (panel.css, the @container
    // blocks) for good on this list - from here on every one of these
    // decisions is measured, and a guessed threshold disagreeing with a
    // measured one can only make the layout wrong.
    listRoot.classList.add('facts-line-managed');
    entries.forEach(function (entry) {
        var desc = FACTS_DESCRIPTION_NATURAL_PX;
        var statusRoom = entry.statusCol ? entry.statusWidth + entry.gap : 0;
        var fits = desc + statusRoom + entry.gap + entry.stripNatural <= entry.width;
        entry.wrapped = !fits;
        // Whether Status itself still fits beside Description once the
        // strip has already moved away is no longer decided here - a
        // real min-width on Description (.facts-cols-wrapped .row-fact-
        // col-description, panel.css) makes .row-facts' own flex-wrap
        // push Status onto its own line natively the moment it doesn't,
        // continuously and in both directions on every resize frame -
        // no class/JS in the loop for that particular handoff any more.
    });
    entries.forEach(function (entry) {
        entry.row.classList.toggle('facts-cols-wrapped', entry.wrapped);
        /* Set inline both ways, not left to the class - fillFactsColumns
           always writes an inline flex-basis/grow on every track, and an
           inline value beats any stylesheet rule regardless of
           specificity, so a wrapped row has to be un-set from here too. */
        entry.track.style.flexBasis = entry.wrapped ? '100%' : (entry.stripNatural + 'px');
        entry.track.style.flexGrow = entry.wrapped ? '0' : String(entry.columnCount);
        /* max-width has to travel with basis/grow, not stay at
           whatever fillFactsColumns set it to - that cap (own comment
           there) assumes track is still competing for a SHARE of the
           line beside Description/the spacer; once wrapped, track is
           ALONE on its own full-width line and flex-basis: 100% needs
           to actually reach 100%, which a smaller leftover max-width
           would silently defeat. */
        entry.track.style.maxWidth = entry.wrapped ? 'none' : (entry.stripNatural + entry.columnCount * FACTS_MAX_BONUS_PX) + 'px';
    });
}


function installEdgeSync() {
    document.addEventListener('scroll', function (e) {
        var track = e.target;
        if (!track.classList || !track.classList.contains('row-facts-cols')) return;
        markFactsStripEdges(track);
    }, true);
}

// Per-row prev/next arrows (shown on every device now - own comment,
// facts-strip.css, "if we include it on touch devices as well, its even more
// clear there is extra content"; native swipe still works underneath
// regardless) - live feedback: "can we have a next and back arrow for each
// row instead" (raised while discussing how to give desktop a real scroll
// affordance without going back to "a native scrollbar on every row", the
// thing that prompted hiding it in the first place). Delegated click on
// document, same "covers rows that don't exist yet" reasoning as the
// drag-to-scroll/scroll listeners above.
// Finds the actual next/prev CUT-OFF column (not just "the first column in
// the DOM", tried first - that measured whatever column happened to be
// first regardless of scroll position or direction, so it read as "moves a
// small, wrong-feeling increment" once the row had scrolled anywhere past
// its start) by comparing each column's current getBoundingClientRect
// against the track's own visible edges, then scrolls exactly enough to
// bring that column's far edge past the button - not just past the track's
// raw edge, or the newly-revealed column would end up sitting right back
// underneath the same button that just revealed it (live feedback: "I want
// the next cut off data col to be fully visible plus a little more so it
// is not beneath the next button"). BUTTON_CLEARANCE_PX is the button's own
// current width (28px, 36px on touch - facts-strip.css) plus a little breathing
// room past it. .is-cut-left/-right (above) already hide whichever arrow
// has nothing left to reveal, so there's no separate enabled/disabled
// state to manage here beyond that.
// Custom rAF-driven scroll, not track.scrollBy({behavior:'smooth'}) (tried
// first) - live feedback: "it jumps on all pages, not smooth scroll".
// Native smooth-scroll silently degrades to an instant jump on some
// browser/OS combinations once the OS's own "reduce motion"/"show
// animations" accessibility setting is off - Chrome in particular takes
// that as permission to skip the easing entirely rather than erroring or
// falling back, so there's no reliable way to detect "did it actually
// animate" from JS after the fact. Driving the scroll ourselves guarantees
// the same slide everywhere regardless of that OS setting, while still
// deliberately honouring prefers-reduced-motion (skip to an instant jump)
// for anyone who's actually asked for reduced motion, rather than
// overriding their real accessibility preference.
function animatedScrollBy(el, deltaX, duration) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.scrollLeft += deltaX;
        return;
    }
    var start = el.scrollLeft;
    var startTime = null;
    duration = duration || 320;
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function step(timestamp) {
        if (startTime === null) startTime = timestamp;
        var progress = Math.min((timestamp - startTime) / duration, 1);
        el.scrollLeft = start + deltaX * easeOutCubic(progress);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}
function installArrows() {
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.row-facts-arrow');
        if (!btn) return;
        var track = btn.parentElement.querySelector('.row-facts-cols');
        if (!track) return;
        var isPrev = btn.classList.contains('row-facts-arrow--prev');
        var cols = Array.prototype.slice.call(track.querySelectorAll('.row-fact-col'));
        if (!cols.length) return;
        var trackRect = track.getBoundingClientRect();
        var clearance = btn.getBoundingClientRect().width + 8;
        var target = null;
        var i;
        if (isPrev) {
            // Last column whose left edge sits before the track's own visible
            // left edge - the column currently cut off on the left.
            for (i = cols.length - 1; i >= 0; i--) {
                if (cols[i].getBoundingClientRect().left < trackRect.left - 1) { target = cols[i]; break; }
            }
            if (!target) return;
            animatedScrollBy(track, target.getBoundingClientRect().left - trackRect.left - clearance);
        } else {
            // First column whose right edge sits past the track's own visible
            // right edge - the column currently cut off on the right.
            for (i = 0; i < cols.length; i++) {
                if (cols[i].getBoundingClientRect().right > trackRect.right + 1) { target = cols[i]; break; }
            }
            if (!target) return;
            animatedScrollBy(track, target.getBoundingClientRect().right - trackRect.right + clearance);
        }
    });
}
