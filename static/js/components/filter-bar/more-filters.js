/* The "View filters" control and the tray it opens.

   ONE MODULE FOR THREE NON-ADJACENT REGIONS OF main.js, because they are
   mutually recursive: setupFilterBarMoreFilters builds the trigger and calls
   wireMoreFiltersToggle, and the toggle re-enters setupFilterBarMoreFilters's
   measure() after a reflow. Splitting them by where they happened to sit in
   the old file would publish that recursion as an interface between two files
   and buy nothing. Over the ~600-line review trigger on total lines, under it
   on code (ADR 0020) - which is the trigger working as designed.

   The tray is the only rendering path now. #187 collapsed the old
   two-path split (tray below a width, an auto-built "View filters" panel
   above it); several bugs on that branch existed only at one width because
   the two paths each needed their own copy of the section-scroll wiring.
   docs/adr/0018 records what the panel was. */

import { rafThrottle } from '../raf-throttle.js';
import { resyncFilterTriggerWidths } from '../select.js';
import { phoneMql, narrowMql, portraitMql, portraitWideMql } from '../../layout/breakpoints.js';
import { groupFilterSections } from './sections.js';
import { wireFilterSectionScroll } from './section-scroll.js';

// Shared progressive-disclosure filter bar (#114 grilling, then the
// standard portal-wide - originated on Students/Referrals/Safeguarding
// Notes, issues #7/#9/#11): secondary filters sit behind a "More filters"/
// "Hide filters" toggle and reveal inline (pushing the rest of the page
// down), same .btn.btn-sm height as Clear Filters
// (components/forms.css: .filter-fields-wrap/.filter-actions-right/
// .filter-secondary-fields/.more-filters-toggle).
//
// Two ways a bar ends up with a secondary group:
//   - Curated: the template already wraps the deliberately-chosen fields in
//     `.filter-secondary-fields` next to its own `[data-more-filters]`
//     trigger (a product decision, e.g. Students/Referrals - #7/#9/#11).
//   - Dynamic: no such wrapper - every .filter-field is measured by
//     offsetTop and whichever don't fit the bar's first row are moved into
//     an auto-built secondary group/trigger instead (SEND & Provision,
//     Panel Actions/Meetings - "filter bar stays one row, overflow goes to
//     More"). Phone width (<=480px) already gets its own full collapse via
//     .is-expanded (see responsive.css) - dynamic mode is a no-op there.
//
// Both paths share the same toggle/label-swap/auto-open-if-active wiring.
export function setupFilterBarMoreFilters(bar) {
    if (!bar) return;
    var moreFiltersBtn = bar.querySelector('[data-more-filters]');
    var secondaryRow = bar.querySelector('.filter-secondary-fields');

    if (moreFiltersBtn && secondaryRow) {
        wireMoreFiltersToggle(moreFiltersBtn, secondaryRow);
        return;
    }

    // Dynamic mode is a no-op below 480px (see the comment above this
    // function - phone width already gets its own full collapse via
    // .is-expanded/responsive.css), but bailing out only inside measure()
    // wasn't enough: everything from here down still ran regardless,
    // reparenting the bar's own real fields - Students' .filter-bar-
    // sticky-row (the "Filters / Search" row) included - into a freshly
    // built .filter-fields-wrap purely to set up a measurement system
    // whose result was always going to be thrown away at this width. That
    // reparenting is a real DOM mutation, and since this runs from a
    // deferred script (main.js) it can land visibly after first paint on
    // a heavy page - live feedback: "I see the Filter row as being taller
    // then snapping shorter". Bailing out up front means a phone-width
    // load never touches these fields at all.
    //
    // A bare return here used to leave "View filters" missing for the rest
    // of the page's life the moment a mobile-width load never got a chance
    // to build it (live feedback + DOM inspection: "the disappearing More
    // filters bug... switched to Mobile mode then to Portrait Tablet mode"
    // - this function only ever runs once, at DOMContentLoaded, and the dev
    // breakpoint preview's own switch between two already-loaded presets,
    // main.js #135, resizes the same live iframe rather than reloading it,
    // so nothing ever called this again to retry). Registers a one-time
    // retry instead - the moment a real resize (or the same dev preview)
    // actually crosses back above mobile width, this whole function runs
    // again from scratch and, this time, gets past this line to build the
    // button for real.
    // The responsive slide-over tray now also treats a narrowed, hover-
    // capable desktop window as "mobile" (window.isFilterBarMobile, below -
    // live feedback: "I basically want everything to be the same as mobile
    // except we keep the side nav and do not have the bottom mobile nav").
    // Scoped to any opted-in tray bar (.filter-bar-tray class, added per-
    // page alongside .filter-bar - Students originally, now also Referrals/
    // Actions/Meetings) rather than every `.filter-bar` on the page - a
    // plain `.filter-bar` with no tray keeps the exact 480px threshold
    // unchanged.
    var isTrayBar = bar.matches('.filter-bar-tray');
    // No pinned Search field (Meetings today) - live feedback: "no search on
    // filter bar, without one there is space for the filters to not be
    // underneath the bar" - a bar with a pinned Search (Students/Referrals/
    // Actions) always needs the toggle at every width above mobile so
    // Search itself has somewhere to sit alone; a bar with nothing pinned
    // has no such reason to hide its (usually few, short) fields behind a
    // click at wide desktop just because that's what search-bearing bars
    // do. Read once here, reused inside measure() below.
    var hasSearchField = !!bar.querySelector('[data-filter-pinned]');
    // A tray bar with no pinned Search (Meetings, the SEND & Provision hub)
    // no longer bails out of setup in the tray tiers - live feedback: "at
    // the moment it hides on breakpoint. But this can change for no search
    // bars as there is more space to play with", following "it does look
    // empty, and there is space" about the lone "Filters" label those bars
    // were left with. Bailing here is what left them with nothing to show:
    // .filter-actions-right is only ever BUILT by this function, so a page
    // loaded straight into a tray tier had no View filters/Clear Filters in
    // the DOM at all, whatever the CSS said about hiding it.
    // Still bails at true mobile (<=480px): the buttons' own top-right
    // pinning lives in forms.css's min-width: 481px block, so below that
    // they would render as a bordered column stacked in the bar's flow, and
    // that width has its own dedicated equivalents anyway (the FILTERS
    // label's tap-to-expand chevron, the sticky footer's Clear/Close pair).
    var isNoSearchTray = isTrayBar && !hasSearchField;
    /* (#187) Phone width alone decides this now.
       The dropped clause was `isTrayBar && !isNoSearchTray &&
       isFilterBarMobile()` - "a search-bearing bar in tray mode", which
       meant phone/portrait-tablet/narrowed-desktop and bailed because the
       tray renders the template's own markup and needed none of what this
       function builds. Once every width became tray mode (#187) that clause
       matched everywhere, so at 1440px the bar was left completely unwired:
       no .filter-actions-right in the DOM at all, whatever the CSS said
       about showing it (measured live - the reported "view filter button is
       not showing" was this, not the display rules I had just changed).
       The remaining <=480px bail is unchanged and still load-bearing: the
       buttons' own top-right pinning lives in forms.css's min-width: 481px
       block, so below that they would stack into the bar's flow as a
       bordered column, and that width has its own equivalents anyway (the
       FILTERS label's tap-to-expand chevron, the sticky Clear/Close). */
    if (phoneMql.matches) {
        var retryMqls = isTrayBar
            /* No `|| window.matchMedia(...)` fallbacks here any more - they
               were unreachable and one of them silently disagreed with the
               real value it stood in for (768px vs the narrow tier's 900px).
               A stale fallback that can never fire is worse than none: it
               reads as a second, wrong source of truth for a tier that has
               exactly one.

               These were window.studentsNarrowMql/studentsPortraitMql/
               studentsPortraitWideMql, assigned inside the DOMContentLoaded
               handler because this function sits outside that closure and
               could not see the locals. They are imports now, so the init
               ordering that made the fallbacks tempting is not a question any
               more - a module binding cannot be undefined at a call site that
               runs after the module body. */
            ? [phoneMql, narrowMql, portraitMql, portraitWideMql]
            : [window.matchMedia('(min-width: 481px)')];
        function retrySetupAboveMobile() {
            retryMqls.forEach(function (mql) { mql.removeEventListener('change', retrySetupAboveMobile); });
            setupFilterBarMoreFilters(bar);
        }
        retryMqls.forEach(function (mql) { mql.addEventListener('change', retrySetupAboveMobile); });
        return;
    }

    // :not(.filter-bar-clear--sticky) - Students' own mobile sticky header
    // (#133 follow-up) carries a second Clear Filters instance of its own
    // (same class, so the AJAX Clear handling elsewhere in this file picks
    // either up identically), sitting earlier in the DOM than the original
    // bottom-of-list one below. A bare querySelector would grab that sticky
    // instance instead and rip it out of its own header wrapper into the
    // desktop-only actionsRight group built further down - excluded here so
    // this logic always keeps operating on the original, wherever a second
    // instance like this exists.
    var clearEl = bar.querySelector('.filter-bar-clear:not(.filter-bar-clear--sticky)');
    var clearWrapper = clearEl && clearEl.closest('.filter-field');
    // .filter-bar-sticky-row (students.html, #133 follow-up) bundles the
    // label with a close button/second Clear Filters instance into one
    // sticky-able unit with one shared background - falls back to the bare
    // label on every other page, which has no such wrapper.
    var label = bar.querySelector('.filter-bar-sticky-row') || bar.querySelector('.filter-bar-label');
    // [data-filter-pinned] opts a field out of overflow measurement entirely
    // (e.g. Students' own Search - #117/#133 follow-up, live feedback: "the
    // name search could always be visible") - it's never moved into the
    // auto-built secondary group regardless of width. allFields (below) still
    // reparents it into fieldsWrap alongside label/fields, just in its
    // original relative position, so it keeps its own place in the visual
    // order (e.g. "Filters, Search, Year, House, ...") rather than always
    // landing before or after the whole group - only `fields` (excluding
    // pinned) feeds the overflow-measurement/secondary-group logic below.
    // !(label && label.contains(f)) - Students' own Search lives nested
    // inside .filter-bar-sticky-row itself (#133 follow-up, live feedback:
    // "search going back to a constant filter that always lives on the
    // filters label and badge row"), which is styled to work as its own
    // small flex row at every width (not just this dynamic-overflow
    // system's own fieldsWrap) - so it's carried along automatically once
    // that whole wrapper is appended into fieldsWrap below, and matching
    // it again here would instead re-append (move) it individually,
    // ripping it back out. Everything else - including fields nested
    // inside Students' own .filter-bar-collapsible (#133 follow-up, "can
    // the filter slide down like a shelf") - still needs to match here
    // despite the extra nesting: that wrapper only has real layout styling
    // at phone width (panel.css), so at every other width its fields still
    // need to be found and reparented into fieldsWrap same as always, or
    // tablet/desktop's own dynamic-overflow behaviour has nothing to
    // measure and never runs at all.
    // .filter-section-label (Students' own mobile-only section headers,
    // e.g. "Group Info"/"Inclusion Panel" - #135 follow-up, live feedback:
    // "Year House and Reg needs to move to Group Info") - included here so
    // the appendChild pass below (allFields.forEach) carries each header
    // along interspersed with its neighbouring fields, in original
    // template order, instead of leaving it behind: this function only
    // used to know about .filter-field, so every field got physically
    // moved to the end of fieldsHost while headers (not .filter-field, so
    // never touched) stayed put - visually bunching every header at the
    // top and every field below them regardless of which section they
    // belonged to. Never a candidate for the overflow measurement/
    // secondary-group logic further down (`fields`, below, holds
    // .filter-field elements and nothing else) - a header is never itself
    // too wide to fit, and
    // hiding it behind "More filters" would strand its own group's fields
    // without the label explaining them.
    var allFields = Array.prototype.slice.call(bar.querySelectorAll('.filter-field, .filter-section-label')).filter(function (f) {
        return f !== clearWrapper && !(label && label.contains(f));
    });
    var fields = allFields.filter(function (f) {
        return f.classList.contains('filter-field') && !f.hasAttribute('data-filter-pinned');
    });
    if (fields.length < 2) return;

    // Atomic overflow groups (#135 - bringing Students' category grouping
    // to tablet/desktop): a .filter-section-label plus every field up to
    // the next one moves to "More filters" as one unit in measure() below,
    // rather than splitting a category across the primary/secondary
    // boundary field-by-field. Pages with no section labels (Referrals/
    // Actions/Meetings today) never hit the `classList.contains` branch,
    // so every field falls into its own singleton group - identical to the
    // old per-field behaviour there.
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
    // Students' own collapsible slide-down wrapper (#133 follow-up, "can
    // the filter slide down like a shelf") - when present, fields land
    // inside its own inner element (which keeps its separate grid-rows
    // slide animation, panel.css) instead of becoming fieldsWrap's own
    // direct children; the outer wrapper itself still becomes part of
    // fieldsWrap (appendChild here, right where fields would otherwise
    // have landed) so it sits in the correct place relative to the
    // secondary group/actions built below on every other page, this is
    // simply absent and fieldsHost falls back to fieldsWrap itself,
    // unchanged from before.
    var collapsible = bar.querySelector('.filter-bar-collapsible');
    var collapsibleInner = collapsible && collapsible.querySelector('.filter-bar-collapsible-inner');
    if (collapsible) fieldsWrap.appendChild(collapsible);
    var fieldsHost = collapsibleInner || fieldsWrap;
    // collapsibleInner's own footer (students.html - Clear/Close, already
    // its last child in the template) needs re-appending to the true end
    // any time fields get individually appended/inserted into fieldsHost
    // elsewhere (immediately below, and again inside measure() every time
    // it runs) - appendChild/insertBefore always move relative to
    // wherever their target *currently* sits, and the footer is never
    // itself part of allFields/fields (it's not a .filter-field) for any
    // of that repositioning to naturally carry it along - left to itself,
    // each field lands wherever the footer already happens to be instead
    // of the other way round, stranding the footer at the top of the
    // field grid instead of the bottom.
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
    // #135 follow-up: the category strip (measure(), below) scrolls
    // secondaryRow itself stays the panel (position/background/border,
    // forms.css, in normal page flow rather than floating); this inner track
    // is the flex box the categories pack and wrap inside (panel.css).
    // display: contents by default (forms.css) at every other width, same
    // no-op convention as .filter-group.
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
    // Always seeded closed (live feedback: "the search filters are all
    // loading open" - a stale willAutoOpen flag used to seed this 'true' for
    // any search-bearing tray bar at desktop width, a leftover from before
    // auto-open-if-already-active was removed entirely (see measure()'s own
    // "No auto-open-if-already-active any more" comment) that never got
    // cleaned up alongside it. measure()'s own "preserve the user's own
    // explicit state across a remeasure" logic reads this same attribute as
    // its wasExpanded baseline - seeding it 'true' here meant the very
    // FIRST measure() call "preserved" a state the user never actually
    // chose, reopening the panel it had just closed a line earlier.
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
        // Move every field (and section-label header, #135 follow-up -
        // allFields, not just fields) back into the primary row, in
        // original order, before remeasuring - appendChild reparents in
        // place, so this recovers fields that ended up in the secondary
        // group on a previous, narrower pass. fieldsHost, matching
        // secondaryRow's own parent above. insertBefore(f, secondaryRow)
        // here would otherwise also march every field past
        // collapsibleInner's own footer (it sits between the fields and
        // secondaryRow after the reanchor above) right back to the top
        // again, same failure mode as appendChild - reanchorCollapsible
        // Footer() undoes that each time measure() runs, not just once at
        // setup. allFields, not fields, here specifically - fields alone
        // (·filter-field only) would pull every field into one contiguous
        // block right before secondaryRow, stranding each section-label
        // header behind wherever it happened to already be (live feedback:
        // "Year House and Reg needs to move to Group Info" - every header
        // bunched at the top, every field below them, headers no longer
        // interspersed with their own group). allFields carries the
        // headers along in their own original relative position instead.
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
        // The tray's own inner needs the same clean-up, for the same reason:
        // groupFilterSections builds .filter-group wrappers in there too
        // (every tier that renders fields in the tray), and the reclaim above
        // pulls every field straight back out of them. Missing this shipped as a
        // breakpoint-change bug - the emptied wrappers stayed, the sections
        // CSS applied to a flat field list, and every caption rendered inline
        // beside its own fields instead of under them (#182). Grouping is
        // rebuilt at the end of this function once the fields have settled.
        if (collapsibleInner) {
            Array.prototype.forEach.call(collapsibleInner.querySelectorAll('.filter-group'), function (g) { g.remove(); });
        }
        // Cleared alongside those wrappers, re-added below only if this pass
        // actually rebuilds groups in the track - the reclaim above has just
        // emptied it, and a host still claiming to render sections while
        // holding nothing is what leaves the caption rules pointed at a flat
        // field list (the #182 breakpoint-change bug, one level up).
        secondaryTrack.classList.remove('filter-bar-sections');
        reanchorCollapsibleFooter();
        secondaryRow.hidden = true;
        moreFiltersBtn.hidden = true;
        moreFiltersBtn.setAttribute('aria-expanded', 'false');

        // isTrayBar && isFilterBarMobile() - a tray bar's own wider mobile
        // range (narrow desktop/portrait tablet up to 768px, not just this
        // literal <=480px) also shows every field directly rather than
        // behind "More filters" (its .filter-actions-right is unconditionally
        // display: none there, panel.css). Without this, a bar that first
        // measured at a normal desktop width and then narrowed into that
        // range buried every field in the hidden .filter-secondary-fields
        // group with no way left to reveal it - the reported bug (fields
        // missing, only the sticky Clear/Close footer visible).
        /* (#187) The panel-building branch that stood here is gone with the
           panel. It ran when a bar was NOT in tray mode, wrapped each
           category into .filter-group boxes inside the "View filters"
           panel's own track, and revealed the button. Every bar renders the
           tray now (isFilterBarMobile, above), so its guard could never be
           true again; the block below shows the button for tray bars, and
           groupFilterSections builds the same wrappers in the tray's own
           inner. See #187 and docs/adr/0018 for what the panel was. */
        // The same pair, kept on the bar in the tray tiers for a no-search
        // bar - the counterpart to not bailing out of setup for these bars
        // at all (comment at the top of this function). The block above
        // only reaches its moreFiltersBtn.hidden = false through the
        // above-mobile branch, so without this the button would exist and
        // still never show here.
        //
        // "These should stay visible unless it does not fit" (live
        // feedback) is a real measurement, not a tier list: the label and
        // the buttons are laid out on the same row, so whether they fit
        // depends on the label's own width (a count badge that grows) and
        // the buttons' own ("View filters" vs "Hide filters"), neither of
        // which a breakpoint knows. Measured with the class off, so the
        // buttons have a real offsetWidth to measure rather than the 0 a
        // display: none box reports - which would otherwise read as
        // "always fits" and never let the class back on once it was set.
        // (#187) Every tray bar, not just the no-search ones. When the tray
        // was mobile-only, a search-bearing bar hid this pair outright: the
        // one row it had at those widths belonged to Search, and the tray's
        // own label-plus-chevron and sticky Clear/Close covered both jobs.
        // Now that every width renders the tray, that reasoning only holds
        // where the row really is that tight - live feedback: "view filter
        // button is not showing" at desktop, where the row is 1400px wide
        // and hiding it is pure loss.
        //
        // Still measured, never tiered: whether the pair fits depends on the
        // label's own count badge, the button's own text ("View filters" vs
        // "Hide filters") and, on a search bar, how much room Search itself
        // needs - none of which a width knows. Measured with the class off,
        // so the buttons report a real offsetWidth rather than the 0 a
        // display: none box gives, which would read as "always fits" and
        // never let the class back on once set.
        if (isTrayBar && window.isFilterBarMobile && window.isFilterBarMobile()) {
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
                    // + --space-md: the two must not merely touch, they need
                    // the same breathing room between them that the search-
                    // bearing bars reserve for this corner (.filter-bar-
                    // sticky-row's own padding-right, forms.css).
                    16;
                if (needed > barInner) {
                    bar.classList.add('filter-bar-actions-cramped');
                }
            }
        }
        // Preserve the user's own explicit open/closed state across a
        // remeasure instead of resetting it back to closed - live
        // feedback: "still reopening. Also it loads open" - the
        // unconditional secondaryRow.hidden = true/aria-expanded = 'false'
        // at the top of this function runs on every remeasure regardless of
        // the panel's actual current state, so a resize firing mid-close-
        // animation (which the close animation's own page-height shrink can
        // itself trigger, via a vertical scrollbar disappearing and
        // changing bar.clientWidth) would otherwise look indistinguishable
        // from "reopening" once the reset ran again a moment later. No
        // auto-open-if-already-active case any more, at any width above
        // mobile (live feedback: "can we make this setup for all modes
        // except mobile") - this panel behaves like mobile's own overlay
        // tray everywhere else now too (dims the results behind it, purely
        // click-driven), which never auto-opened on load either.
        if (wasExpanded && !moreFiltersBtn.hidden) {
            secondaryRow.hidden = false;
            moreFiltersBtn.setAttribute('aria-expanded', 'true');
        }
        // Width-dependent wording ("View filters" vs "More filters", #135)
        // needs recomputing on every resize-driven remeasure, not just at
        // the click handler that otherwise owns this - a resize can cross
        // the mobile/non-mobile threshold without the button ever being
        // clicked.
        setMoreFiltersLabel(moreFiltersBtn);
        // Narrow tablet positions actionsRight absolutely (forms.css) so it
        // no longer reserves its own column, and reserves that same real
        // width back on the sticky row's own padding instead so Search
        // doesn't render underneath it - measured live off the actual
        // button box (its label text/count badge can change its width)
        // rather than a guessed fixed number that would silently drift out
        // of sync.
        bar.style.setProperty('--filter-actions-right-width', actionsRight.offsetWidth + 'px');
        // Last, after every field has landed in its final row for this width:
        // resize the triggers for the tier we just measured for, then rebuild
        // (or unwind) the tray's section wrappers to match it. Both run in
        // either direction, so crossing the boundary settles correctly even
        // with the tray already open.
        resyncFilterTriggerWidths(bar);
        groupFilterSections(bar);
        // After grouping, never before: the tracks this measures are the
        // wrappers groupFilterSections has just built or unwound (#186).
        wireFilterSectionScroll(bar);
    }

    measure();
    // Search-bearing bars (Students/Referrals/Actions/Escalations) used to
    // force themselves open by default on desktop here (live feedback back
    // then: "can Filters with search be open by default on desktop mode
    // unless its narrow") - reversed again (live feedback now: "should
    // default closed", "still loads page open" after the willAutoOpen fix
    // above turned out not to be the only thing forcing this open). Every
    // filter bar, search or not, now defaults closed behind its toggle at
    // every width, matching wireMoreFiltersToggle's own "always loads
    // closed... purely click-driven" default for the curated-mode bars that
    // never had this override in the first place.
    // Exposed so a touch/orientation-only transition into or out of
    // Students' filter-bar-mobile-mode (syncFilterBarMobileClass, above -
    // e.g. the dev breakpoint preview's touch toggle, or a hybrid device
    // resolving hover:none after load) can force a remeasure too, not just
    // a genuine bar.clientWidth change (handleResize, below). Without this,
    // switching into mobile-mode after an initial non-mobile measure() had
    // already buried every field behind the hidden "More filters" group
    // left them stuck there - filter-bar-mobile-mode's own CSS hides
    // .filter-actions-right (the only control that would reveal it)
    // unconditionally, and nothing else was listening for a width-less
    // mobile-mode transition to run measure() again.
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
   Clear pair beside it is the thing that gives way instead (#187, measure()
   in setupFilterBarMoreFilters). Roughly a name and a half - enough that
   what you typed stays readable while you type it. */
var SEARCH_MIN_WIDTH = 220;

function wireMoreFiltersToggle(moreFiltersBtn, secondaryRow, bar) {
    // Not every call site passes the bar (a page whose template already
    // ships this button wires it straight from the DOMContentLoaded sweep
    // with two arguments) - resolved from the button itself when it isn't.
    bar = bar || (moreFiltersBtn.closest && moreFiltersBtn.closest('.filter-bar'));
    // No auto-open-if-already-active at any width above mobile any more
    // (live feedback: "can we make this the setup for all modes except
    // mobile") - this panel always loads closed regardless of width now,
    // purely click-driven, matching mobile's own overlay tray.
    setMoreFiltersLabel(moreFiltersBtn);
    moreFiltersBtn.addEventListener('click', function () {
        // In a tray tier this button is a second trigger for the tray, not
        // for secondaryRow - a no-search bar keeps View filters/Clear
        // Filters on the bar there now (setupFilterBarMoreFilters), and the
        // thing they have to open is the floating tray the FILTERS label
        // already opens, not the in-flow secondary panel this handler owns
        // at wider widths. secondaryRow is an empty hidden shell in that
        // mode (every field stays in .filter-bar-collapsible-inner), so
        // animating it open here would reveal a blank strip and leave
        // aria-expanded describing a panel nobody can see. The delegated
        // .filter-bar-label handler below picks this click up on the way
        // through the document instead, and syncs this button's own
        // aria-expanded/label from the tray's real state.
        if (bar && bar.matches('.filter-bar-tray') && window.isFilterBarMobile && window.isFilterBarMobile()) return;
        /* (#187) Nothing left for this handler to do beyond the class
           toggle above: every bar is a tray bar now, so the guard on the
           line above always returns, and the tray's own open/close handler
           owns the rest. What stood here revealed the "View filters" panel
           and animated its height open - see #187 and docs/adr/0018 for
           why that panel is gone. Kept as a guarded return rather than
           deleting the listener outright: the label sync above it is still
           live, and a bar that ever opts out of the tray would want this
           path back. */
    });
}

/* Animates whatever reflow a filter value change causes inside an open tray.

   A tray field is sized to its own label until a wide option is picked, at
   which point the trigger grows (resolveTriggerMinWidth, below) and its
   neighbours have to move - sometimes a whole section drops onto a new row.
   Live feedback: "it would be better for them just to jump to new row, but I
   wonder about a more elegant animation?" - so the reflow itself is kept and
   only the jump is smoothed.

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

// #135 follow-up (DES-L7): wraps a genuinely multi-word field label onto 2
// lines - live feedback corrected an earlier version of this (which force-split
// every label, even single words like "Year", down to individual
// characters): "a single word should be on one line. But if there are two
// short words, they should flow onto two lines... I am seeing one word
// flowing onto 3 lines". A single word (no space in it) is left alone
// entirely - no space means no valid break point. A real <br> forced
// between the word groups, not a measured max-width relying on the browser
// to wrap at the right spot (two rounds of that: first a plain halved
// max-width, live feedback "Referrals is not centered horizontally" - a
// lopsided pair like "Has"/"Referrals" (3 vs. 9 characters) made the boxed
// width narrower than "Referrals" needs on its own, so it overflowed its
// own centred box instead of centring; then a canvas-measured floor to fix
// that - "Surely we can use a line break and just centred!" was the right
// call, a forced break needs no width measurement or fallback logic at
// all, every line is exactly as wide as its own text and centres cleanly
// regardless). Split point is by WORD COUNT, not pixel width - for every
// label actually in use here (all 2 words) that's just "the one space",
// matching live feedback's own example ("A B" -> "A" / "B"); a 3+-word
// label (none currently exist) would split roughly in half by word count
// too rather than needing pixel measurement to "balance" it.
// No longer scoped to just the narrow-tablet category strip (live
// feedback: "labels that have at least two words [should be] on two
// lines... we do this in other modes") - plain `.filter-field label`
// reaches every host that renders sections, which since #185 is one rule
// set covering the panel and the tray at every width alike.
// Original text cached on the span itself (data-label-text) rather than
// read back from its own textContent - a <br> contributes nothing to
// textContent, so a second call would otherwise see "HasReferrals" (no
// space) and misjudge the word count. Idempotent: rebuilds from that
// cached original every time rather than re-splitting whatever's already
// there, so a second call on an already-split label is a no-op, not a
// re-split of a re-split.
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


// "More filters" <-> "Hide filters" (grilling) - swaps the label span if
// the template provides one (data-more-filters-label; dynamic mode always
// does, see above). Curated-mode templates that haven't added the span
// yet just keep their static "More filters" text - the chevron rotation
// (components/forms.css) still communicates the state either way.
// "View"/"Hide", not "More", at every width above mobile (#135, widened
// 2026-08-20: "can we make this the setup for all modes except mobile") -
// this button no longer discloses *additional* fields beyond what's already
// showing (measure(), above, always empties primary entirely there), it's
// the only way to see any of them, so "More filters" would misdescribe what
// clicking it actually does.
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
