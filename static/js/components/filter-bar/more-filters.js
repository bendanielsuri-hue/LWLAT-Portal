/* The "View filters" control and the tray it opens.

   ONE MODULE FOR THREE NON-ADJACENT REGIONS OF main.js, because they are
   mutually recursive: setupFilterBarMoreFilters builds the trigger and calls
   wireMoreFiltersToggle, and the toggle re-enters setupFilterBarMoreFilters's
   measure() after a reflow. Splitting them by where they happened to sit in
   the old file would publish that recursion as an interface between two files
   and buy nothing. Over the ~600-line review trigger on total lines, under it
   on code (ADR 0020) - which is the trigger working as designed.

   The tray is the only rendering path, at every width: docs/adr/0018. */

import { rafThrottle } from '../raf-throttle.js';
import { resyncFilterTriggerWidths } from '../select.js';
import { phoneMql, narrowMql, portraitMql, portraitWideMql } from '../../layout/breakpoints.js';
import { resyncFilterSections } from './sections.js';
import { isFilterBarMobile } from './mobile-mode.js';

// Progressive-disclosure filter bar: secondary filters sit behind a "More
// filters"/"Hide filters" toggle and reveal inline, at the same .btn.btn-sm
// height as Clear Filters (components/forms.css: .filter-fields-wrap/
// .filter-actions-right/.filter-secondary-fields/.more-filters-toggle).
//
// Two ways a bar ends up with a secondary group:
//   - Curated: the template already wraps the deliberately-chosen fields in
//     `.filter-secondary-fields` next to its own `[data-more-filters]`
//     trigger - a product decision per page.
//   - Dynamic: no such wrapper, so every .filter-field is measured by
//     offsetTop and whichever do not fit the bar's first row move into an
//     auto-built secondary group instead. Phone width already gets its own
//     full collapse via .is-expanded (responsive.css), so dynamic mode is a
//     no-op there.
//
// Both paths share the same toggle and label-swap wiring.
export function setupFilterBarMoreFilters(bar) {
    if (!bar) return;
    var moreFiltersBtn = bar.querySelector('[data-more-filters]');
    var secondaryRow = bar.querySelector('.filter-secondary-fields');

    if (moreFiltersBtn && secondaryRow) {
        wireMoreFiltersToggle(moreFiltersBtn, secondaryRow);
        return;
    }

    // An opted-in tray bar (.filter-bar-tray, added per page alongside
    // .filter-bar) also treats a narrowed, hover-capable desktop window as
    // "mobile" via isFilterBarMobile below; a plain `.filter-bar` with
    // no tray keeps the exact 480px threshold.
    var isTrayBar = bar.matches('.filter-bar-tray');
    // A bar with a pinned Search needs the toggle at every width above mobile
    // so Search has somewhere to sit alone; a bar with nothing pinned has no
    // reason to hide its usually few, short fields behind a click at wide
    // desktop. Read once here, reused inside measure().
    var hasSearchField = !!bar.querySelector('[data-filter-pinned]');
    var isNoSearchTray = isTrayBar && !hasSearchField;
    /* Bails at true mobile only. Everything below this line reparents the
       bar's real fields into a freshly built .filter-fields-wrap to set up a
       measurement system whose result phone width throws away - and because
       this runs from a deferred script, that reparenting can land visibly
       after first paint, as a filter row that renders tall then snaps short.

       Not a bare return, though: this function runs once at DOMContentLoaded,
       so a page that loads at phone width would otherwise have no "View
       filters" for the rest of its life - the dev breakpoint preview resizes
       one live iframe rather than reloading it, so nothing calls this again.
       The one-time retry below reruns the whole function the moment a resize
       crosses back above mobile.

       Why <=480px specifically: the buttons' top-right pinning lives in
       forms.css's min-width: 481px block, so below that they stack into the
       bar's flow as a bordered column - and that width has its own
       equivalents anyway (the FILTERS label's chevron, the sticky
       Clear/Close pair). */
    if (phoneMql.matches) {
        var retryMqls = isTrayBar
            /* Tier media queries come from layout/breakpoints.js and have no
               `|| window.matchMedia(...)` fallback. A fallback here is worse
               than none: unreachable, and a second source of truth for a tier
               that has exactly one - the last pair disagreed (768px against
               the narrow tier's real 900px). */
            ? [phoneMql, narrowMql, portraitMql, portraitWideMql]
            : [window.matchMedia('(min-width: 481px)')];
        function retrySetupAboveMobile() {
            retryMqls.forEach(function (mql) { mql.removeEventListener('change', retrySetupAboveMobile); });
            setupFilterBarMoreFilters(bar);
        }
        retryMqls.forEach(function (mql) { mql.addEventListener('change', retrySetupAboveMobile); });
        return;
    }

    // :not(.filter-bar-clear--sticky) - a mobile sticky header carries a
    // second Clear Filters of its own, same class, sitting earlier in the DOM
    // than the original. A bare querySelector grabs that one and rips it out
    // of its header wrapper into the actionsRight group built below, so this
    // stays pointed at the original wherever a second instance exists.
    var clearEl = bar.querySelector('.filter-bar-clear:not(.filter-bar-clear--sticky)');
    var clearWrapper = clearEl && clearEl.closest('.filter-field');
    // .filter-bar-sticky-row bundles the label with a close button and that
    // second Clear Filters into one sticky-able unit sharing a background -
    // falls back to the bare label on pages with no such wrapper.
    var label = bar.querySelector('.filter-bar-sticky-row') || bar.querySelector('.filter-bar-label');
    /* Three separate exclusions, each load-bearing:

       [data-filter-pinned] opts a field out of overflow measurement - it is
       never moved into the auto-built secondary group at any width. allFields
       still reparents it into fieldsWrap in its original relative position so
       it keeps its place in the visual order; only `fields` (pinned excluded)
       feeds the measurement below.

       !(label && label.contains(f)) - a pinned Search nested inside
       .filter-bar-sticky-row is carried along automatically once that whole
       wrapper is appended into fieldsWrap, so matching it again here would
       re-append it individually and rip it back out. Fields nested inside
       .filter-bar-collapsible still DO need to match despite their own extra
       nesting: that wrapper only has real layout styling at phone width, so
       everywhere else its fields must be found and reparented or the
       dynamic-overflow behaviour has nothing to measure.

       .filter-section-label is included so the appendChild pass below carries
       each header along interspersed with its own fields, in template order.
       Without it only .filter-field moves, and every header stays put while
       its fields march to the end of fieldsHost - headers bunched at the top,
       fields below, sections meaningless. Never a candidate for the overflow
       logic (`fields` holds .filter-field and nothing else): a header is
       never itself too wide, and hiding one behind "More filters" strands its
       group's fields with nothing explaining them. */
    var allFields = Array.prototype.slice.call(bar.querySelectorAll('.filter-field, .filter-section-label')).filter(function (f) {
        return f !== clearWrapper && !(label && label.contains(f));
    });
    var fields = allFields.filter(function (f) {
        return f.classList.contains('filter-field') && !f.hasAttribute('data-filter-pinned');
    });
    if (fields.length < 2) return;

    // Atomic overflow groups: a .filter-section-label plus every field up to
    // the next one moves to "More filters" as one unit in measure(), rather
    // than splitting a category across the primary/secondary boundary
    // field-by-field. A page with no section labels never hits the
    // classList.contains branch, so every field becomes its own singleton
    // group and the behaviour is per-field, as it would be anyway.
    var groups = [];
    var currentGroup = null;
    allFields.forEach(function (f) {
        if (f.classList.contains('filter-section-label')) {
            currentGroup = { header: f, fields: [] };
            groups.push(currentGroup);
        } else if (currentGroup) {
            currentGroup.fields.push(f);
        } else {
            groups.push({ header: null, fields: [f] });
        }
    });

    var fieldsWrap = document.createElement('div');
    fieldsWrap.className = 'filter-fields-wrap';
    bar.insertBefore(fieldsWrap, label || allFields[0]);
    if (label) fieldsWrap.appendChild(label);
    // When the collapsible slide-down wrapper is present, fields land inside
    // its inner element rather than becoming fieldsWrap's direct children.
    // The outer wrapper still joins fieldsWrap here, exactly where the fields
    // would otherwise have landed, so it sits correctly relative to the
    // secondary group and actions built below. Absent on other pages, where
    // fieldsHost falls back to fieldsWrap itself.
    var collapsible = bar.querySelector('.filter-bar-collapsible');
    var collapsibleInner = collapsible && collapsible.querySelector('.filter-bar-collapsible-inner');
    if (collapsible) fieldsWrap.appendChild(collapsible);
    var fieldsHost = collapsibleInner || fieldsWrap;
    // The tray's sticky Clear/Close footer has to be re-appended to the true
    // end any time fields are individually appended into fieldsHost (below,
    // and again on every measure()). appendChild/insertBefore move relative
    // to where their target currently sits, and the footer is not a
    // .filter-field so nothing in allFields carries it along - left alone,
    // each field lands wherever the footer happens to be and the footer ends
    // up stranded at the top of the field grid.
    function reanchorCollapsibleFooter() {
        if (!collapsibleInner) return;
        var footer = collapsibleInner.querySelector('.filter-bar-sticky-footer');
        if (footer) collapsibleInner.appendChild(footer);
    }
    allFields.forEach(function (f) { fieldsHost.appendChild(f); });
    reanchorCollapsibleFooter();

    secondaryRow = document.createElement('div');
    secondaryRow.className = 'filter-secondary-fields';
    var divider = document.createElement('span');
    divider.className = 'filter-divider';
    secondaryRow.appendChild(divider);
    // secondaryRow is the panel itself (position/background/border,
    // forms.css); this inner track is the flex box the categories pack and
    // wrap inside (panel.css). display: contents by default at every other
    // width, the same no-op convention .filter-group uses.
    var secondaryTrack = document.createElement('div');
    secondaryTrack.className = 'filter-secondary-fields-track';
    secondaryRow.appendChild(secondaryTrack);
    // fieldsHost, not always fieldsWrap - has to be the same element
    // fields themselves live in (above), since measure() below uses
    // secondaryRow as an insertBefore reference point among them; a
    // reference node has to actually be a child of whichever element
    // insertBefore is called on, or it throws.
    fieldsHost.appendChild(secondaryRow);

    var actionsRight = document.createElement('div');
    actionsRight.className = 'filter-actions-right';
    moreFiltersBtn = document.createElement('button');
    moreFiltersBtn.type = 'button';
    moreFiltersBtn.className = 'btn btn-sm btn-secondary more-filters-toggle';
    moreFiltersBtn.setAttribute('data-more-filters', '');
    // Always seeded closed, and it must stay that way: measure()'s
    // "preserve the user's explicit state across a remeasure" logic reads
    // this same attribute as its wasExpanded baseline, so seeding it 'true'
    // makes the first measure() "preserve" a state the user never chose and
    // reopen the panel it just closed.
    moreFiltersBtn.setAttribute('aria-expanded', 'false');
    moreFiltersBtn.hidden = true;
    var icon = document.createElement('span');
    icon.className = 'more-filters-toggle-icon';
    // Same path as templates/icons/arrow_down_svg.html - kept inline (not
    // an {% include %}) since this markup is JS-authored.
    icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var labelSpan = document.createElement('span');
    labelSpan.setAttribute('data-more-filters-label', '');
    labelSpan.textContent = 'More filters';
    moreFiltersBtn.appendChild(icon);
    moreFiltersBtn.appendChild(labelSpan);
    actionsRight.appendChild(moreFiltersBtn);
    if (clearWrapper) {
        bar.insertBefore(clearEl, clearWrapper);
        clearWrapper.remove();
    }
    if (clearEl) actionsRight.appendChild(clearEl);
    bar.appendChild(actionsRight);
    /* Marks that this bar HAS a View filters/Clear Filters pair at all -
       read by the rule that drops the tray's duplicate Clear/Close footer
       (panel.css). Needed because this function returns early at true
       mobile without ever building the pair, so "the bar has no pinned
       Search" alone was not enough to conclude the header carries those two
       controls: at <=480px it carries neither, and the footer was being
       hidden there with nothing left to close or clear the tray with. */
    bar.classList.add('filter-bar-has-actions');

    function measure() {
        // Move every field AND section-label header back into the primary
        // row, in original order, before remeasuring - this recovers fields
        // that ended up in the secondary group on a previous, narrower pass.
        // allFields rather than `fields`: fields alone pulls every
        // .filter-field into one contiguous block before secondaryRow and
        // strands each header wherever it already was, so headers bunch at
        // the top and no longer sit with their own group. The insertBefore
        // also marches fields past the tray's sticky footer, which is why
        // reanchorCollapsibleFooter() runs on every measure(), not just once.
        var wasExpanded = moreFiltersBtn.getAttribute('aria-expanded') === 'true';
        // insertBefore throws NotFoundError unless its reference node is
        // genuinely a child of the element it is called on, and everything
        // below this line - including the two lines that decide whether the
        // "View filters" button is visible - is skipped if it does. Putting
        // secondaryRow back first makes that unthrowable: the failure mode is
        // a filter bar stuck in whatever half-measured state it was in, which
        // is far harder to read back from than a panel that briefly sat in
        // the wrong place. (One real case is fixed at source in
        // groupFilterSections; this is the guard for the next one.)
        if (secondaryRow.parentNode !== fieldsHost) fieldsHost.appendChild(secondaryRow);
        allFields.forEach(function (f) { fieldsHost.insertBefore(f, secondaryRow); });
        // Reclaiming a field above pulls it out of whatever .filter-group
        // wrapper (below) held it on a previous pass, leaving that wrapper
        // behind as an empty shell still parented under secondaryRow -
        // insertBefore reparents the field itself but has no reason to also
        // clean up the div it just vacated. Without this they'd pile up, one
        // extra empty node per remeasure.
        Array.prototype.forEach.call(secondaryRow.querySelectorAll('.filter-group'), function (g) { g.remove(); });
        // The tray's own inner needs the same clean-up for the same reason:
        // groupFilterSections builds .filter-group wrappers in there too, and
        // the reclaim above pulls every field straight back out of them.
        // Missing this ships as a breakpoint-change bug - emptied wrappers
        // stay, the sections CSS applies to a flat field list, and every
        // caption renders inline beside its fields instead of under them.
        // Grouping is rebuilt at the end of this function once fields settle.
        if (collapsibleInner) {
            Array.prototype.forEach.call(collapsibleInner.querySelectorAll('.filter-group'), function (g) { g.remove(); });
        }
        // Cleared alongside those wrappers, re-added below only if this pass
        // rebuilds groups in the track: a host still claiming to render
        // sections while holding nothing is exactly what points the caption
        // rules at a flat field list (same bug as one level up).
        secondaryTrack.classList.remove('filter-bar-sections');
        reanchorCollapsibleFooter();
        secondaryRow.hidden = true;
        moreFiltersBtn.hidden = true;
        moreFiltersBtn.setAttribute('aria-expanded', 'false');

        /* Reveals the View filters/Clear Filters pair for every tray bar.
           The above-mobile branch is the only other route to
           moreFiltersBtn.hidden = false, so without this the button exists
           and never shows.

           Whether the pair FITS is measured, never tiered: the label and the
           buttons share a row, so it depends on the label's own count badge,
           the button's own text ("View filters" vs "Hide filters") and, on a
           search bar, how much room Search itself needs - none of which a
           breakpoint knows. Measured with .filter-bar-actions-cramped off, so
           the buttons report a real offsetWidth rather than the 0 a display:
           none box gives, which would read as "always fits" and never let the
           class back on once set. */
        if (isTrayBar && isFilterBarMobile()) {
            if (allFields.length) moreFiltersBtn.hidden = false;
            bar.classList.remove('filter-bar-actions-cramped');
            var barLabel = bar.querySelector('.filter-bar-label');
            if (barLabel && !moreFiltersBtn.hidden) {
                var barBox = window.getComputedStyle(bar);
                var barInner = bar.clientWidth - parseFloat(barBox.paddingLeft) - parseFloat(barBox.paddingRight);
                // A search field has to keep a usable width of its own, or
                // "it fits" becomes true at every width - Search flexes, so
                // it will surrender its last pixel to make room rather than
                // ever report a shortfall. SEARCH_MIN_WIDTH is what stops
                // that: below it, the buttons are the thing that gives way,
                // which is exactly the phone-width behaviour this replaces.
                var searchField = bar.querySelector('.filter-field--search');
                var needed = barLabel.offsetWidth + actionsRight.offsetWidth +
                    (searchField ? SEARCH_MIN_WIDTH : 0) +
                    // + --space-md: the two must not merely touch. Same
                    // breathing room search-bearing bars reserve for this
                    // corner (.filter-bar-sticky-row's padding-right).
                    16;
                if (needed > barInner) {
                    bar.classList.add('filter-bar-actions-cramped');
                }
            }
        }
        // Preserve the user's explicit open/closed state across a remeasure.
        // The unconditional reset at the top of this function runs on every
        // remeasure regardless of the panel's real state, and a close
        // animation can itself trigger a remeasure - its page-height shrink
        // drops the vertical scrollbar, which changes bar.clientWidth - so
        // without this the reset lands mid-close and reads as the panel
        // reopening on its own. Never auto-opens because filters are active:
        // the panel is purely click-driven at every width.
        if (wasExpanded && !moreFiltersBtn.hidden) {
            secondaryRow.hidden = false;
            moreFiltersBtn.setAttribute('aria-expanded', 'true');
        }
        // Width-dependent wording ("View filters" vs "More filters") has to
        // be recomputed on every resize-driven remeasure, not only in the
        // click handler that otherwise owns it: a resize can cross the
        // mobile/non-mobile threshold without the button ever being clicked.
        setMoreFiltersLabel(moreFiltersBtn);
        // Narrow tablet positions actionsRight absolutely (forms.css), so it
        // stops reserving its own column and the sticky row's padding has to
        // reserve that width instead or Search renders underneath it.
        // Measured off the real button box - its label text and count badge
        // both change its width, so a fixed number drifts out of sync.
        bar.style.setProperty('--filter-actions-right-width', actionsRight.offsetWidth + 'px');
        // Last, after every field has landed in its final row for this width:
        // resize the triggers for the tier we just measured for, then rebuild
        // (or unwind) the tray's section wrappers to match it. Both run in
        // either direction, so crossing the boundary settles correctly even
        // with the tray already open.
        resyncFilterTriggerWidths(bar);
        resyncFilterSections(bar);
    }

    measure();
    // Exposed so a touch- or orientation-only transition into or out of
    // filter-bar-mobile-mode can force a remeasure, not just a real
    // bar.clientWidth change (handleResize, below). Such a transition has no
    // width change to observe - a hybrid device resolving hover:none after
    // load, or the dev preview's touch toggle - and entering mobile-mode
    // after a non-mobile measure() has already buried every field behind the
    // hidden "More filters" group leaves them stuck: that mode's CSS hides
    // .filter-actions-right, the only control that would reveal them.
    bar._filterBarMeasure = measure;
    var lastWidth = bar.clientWidth;
    var handleResize = rafThrottle(function () {
        var width = bar.clientWidth;
        if (width === lastWidth) return;
        lastWidth = width;
        measure();
    });
    /* No window resize listener: handleResize early-returns unless
       bar.clientWidth actually changed, so the ResizeObserver on that same
       bar already fires on exactly - and only - the transitions it acts on.
       The window listener just added a second wake-up for the same event. */
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(handleResize).observe(bar);
    }

    wireMoreFiltersToggle(moreFiltersBtn, secondaryRow, bar);
}


/* The width a pinned Search field has to keep before the "View filters"/
   Clear pair beside it is the thing that gives way instead (measure(),
   above). Roughly a name and a half - enough that what you typed stays
   readable while you type it. */
var SEARCH_MIN_WIDTH = 220;

function wireMoreFiltersToggle(moreFiltersBtn, secondaryRow, bar) {
    // Not every call site passes the bar (a page whose template already
    // ships this button wires it straight from the DOMContentLoaded sweep
    // with two arguments) - resolved from the button itself when it isn't.
    bar = bar || (moreFiltersBtn.closest && moreFiltersBtn.closest('.filter-bar'));
    setMoreFiltersLabel(moreFiltersBtn);
    moreFiltersBtn.addEventListener('click', function () {
        /* On a tray bar this button is a second trigger for the TRAY, not for
           secondaryRow - which is an empty hidden shell in that mode, every
           field having stayed in .filter-bar-collapsible-inner. Animating it
           open here would reveal a blank strip and leave aria-expanded
           describing a panel nobody can see. expand-collapse.js's delegated
           handler picks this click up on its way through the document
           instead, and syncs this button's aria-expanded and label from the
           tray's real state.

           Since every bar renders the tray (docs/adr/0018), this guard always
           returns and the listener does nothing beyond the label sync above.
           Kept rather than deleted: a bar that ever opts out of the tray
           needs this path back. */
        if (bar && bar.matches('.filter-bar-tray') && isFilterBarMobile()) return;
    });
}

/* Animates whatever reflow a filter value change causes inside an open tray.

   A tray field is sized to its own label until a wide option is picked, at
   which point the trigger grows and its neighbours have to move - sometimes
   a whole section drops onto a new row. The reflow itself is kept; only the
   jump is smoothed.

   FLIP, on the leaves only (.filter-field and .filter-section-label). Not the
   .filter-group wrappers as well: a group that moves carries its own fields
   and caption with it, so transforming both levels would compound and every
   moved field would travel twice as far as it should.

   Two motions, not one. An element that stays on its row slides sideways -
   that reads as being pushed, which is exactly what happened to it. An
   element that changed row would otherwise fly a long diagonal across the
   tray, which reads as a different element arriving; those settle into place
   instead, fading up from a few pixels above where they land. Same duration
   for both, so a reflow that does some of each still reads as one movement.

   Honours prefers-reduced-motion (INT-M): the layout still changes, it just
   changes instantly. */
var FILTER_REFLOW_MS = 220;
function animateFilterTrayReflow(bar) {
    if (!bar.classList.contains('is-expanded')) return;
    if (!document.documentElement.classList.contains('filter-bar-mobile-mode')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var inner = bar.querySelector('.filter-bar-collapsible-inner');
    if (!inner) return;
    var movers = Array.prototype.slice.call(inner.querySelectorAll('.filter-field, .filter-section-label'));
    if (!movers.length) return;
    // Read now, while the layout is still the old one: this runs off the
    // select's own change event, which enhanceSelect dispatches BEFORE it
    // re-renders the trigger at its new width.
    var before = movers.map(function (el) { return el.getBoundingClientRect(); });
    requestAnimationFrame(function () {
        movers.forEach(function (el, i) {
            var from = before[i];
            var to = el.getBoundingClientRect();
            var dx = from.left - to.left;
            var dy = from.top - to.top;
            // Sub-pixel rounding leaves a fractional delta on elements that
            // never actually moved; animating those costs frames for nothing.
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
            el.style.transition = 'none';
            if (Math.abs(dy) >= 1) {
                el.style.transform = 'translateY(-4px)';
                el.style.opacity = '0';
            } else {
                el.style.transform = 'translateX(' + dx + 'px)';
            }
            // Second frame: the inverted start has been committed, so the
            // release below plays as a real transition rather than being
            // batched into one no-op (the same reason the tray's own open
            // animation forces a frame before it changes anything).
            requestAnimationFrame(function () {
                el.style.transition = 'transform ' + FILTER_REFLOW_MS + 'ms cubic-bezier(0.2, 0, 0, 1), opacity ' + FILTER_REFLOW_MS + 'ms ease-out';
                el.style.transform = '';
                el.style.opacity = '';
            });
            // Clear the inline transition afterwards, so anything else that
            // later sets transform/opacity on these elements doesn't inherit
            // this one's timing. Generous margin over the duration - a
            // dropped frame must not strip the properties mid-flight.
            setTimeout(function () {
                el.style.transition = '';
                el.style.transform = '';
                el.style.opacity = '';
            }, FILTER_REFLOW_MS + 80);
        });
    });
}
document.addEventListener('change', function (e) {
    var field = e.target && e.target.closest && e.target.closest('.filter-field');
    if (!field) return;
    var bar = field.closest('.filter-bar');
    if (bar) animateFilterTrayReflow(bar);
});

/* (DES-L7) Wraps a genuinely multi-word field label onto two lines. A single
   word is left alone - no space means no valid break point.

   A real <br>, not a measured max-width left to the browser to wrap. A
   lopsided pair ("Has"/"Referrals", 3 characters against 9) makes a halved
   box narrower than the longer word needs, so it overflows its own centred
   box instead of centring; a forced break needs no measurement or fallback
   at all, and every line is exactly as wide as its own text.

   Split by WORD COUNT, not pixel width: for two-word labels that is just the
   one space, and a 3+-word label splits roughly in half rather than needing
   pixel measurement to "balance" it.

   The original text is cached on the span (data-label-text) rather than read
   back from textContent, because a <br> contributes nothing to textContent -
   a second call would see "HasReferrals" and misjudge the word count.
   Idempotent: rebuilds from that cached original every time, so a second call
   on an already-split label is a no-op rather than a re-split of a split. */
export function balanceFilterGroupLabels(box) {
    box.querySelectorAll('.filter-field label').forEach(function (label) {
        var span = label.querySelector('.filter-field-label-text');
        if (!span) {
            span = document.createElement('span');
            span.className = 'filter-field-label-text';
            while (label.firstChild) span.appendChild(label.firstChild);
            label.appendChild(span);
        }
        var original = span.dataset.labelText || span.textContent.trim();
        span.dataset.labelText = original;
        var words = original.split(/\s+/);
        span.textContent = '';
        if (words.length < 2) {
            span.textContent = original;
            return;
        }
        var mid = Math.ceil(words.length / 2);
        span.appendChild(document.createTextNode(words.slice(0, mid).join(' ')));
        span.appendChild(document.createElement('br'));
        span.appendChild(document.createTextNode(words.slice(mid).join(' ')));
    });
}


// Swaps the label span where the template provides one
// (data-more-filters-label; dynamic mode always does). A curated-mode
// template without the span keeps its static "More filters" text - the
// chevron rotation (components/forms.css) communicates state either way.
//
// "View"/"Hide", not "More", at every width above mobile: measure() empties
// the primary row entirely there, so the button is the only way to see any
// field rather than a way to see additional ones, and "More filters" would
// misdescribe what clicking it does.
export function setMoreFiltersLabel(moreFiltersBtn) {
    var labelSpan = moreFiltersBtn.querySelector('[data-more-filters-label]');
    if (!labelSpan) return;
    var expanded = moreFiltersBtn.getAttribute('aria-expanded') === 'true';
    if (!window.matchMedia('(max-width: 480px)').matches) {
        labelSpan.textContent = expanded ? 'Hide filters' : 'View filters';
    } else {
        labelSpan.textContent = expanded ? 'Hide filters' : 'More filters';
    }
}
