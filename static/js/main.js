function closest(el, selector) {
    while (el) {
        if (el.matches && el.matches(selector)) return el;
        el = el.parentElement;
    }
    return null;
}

// Coalesces a resize/visualViewport-resize handler to at most once per
// animation frame - live feedback: "animations are now very stuttery...
// may be due to the amount of calculations". A live window-resize drag
// dispatches 'resize' repeatedly, and Students' filter-bar work
// (positionFilterTray, setupListEndCapHeight, the actions-right-width
// remeasure) added several handlers that each force a synchronous layout
// read (getBoundingClientRect/offsetWidth) on every single one of those
// events - competing with the side-nav's own CSS width transition
// (layout.css, crosses the 900px breakpoint on the same resize) for main-
// thread budget mid-drag. Rate-limiting each handler to one run per frame
// doesn't remove any individual layout read, but stops them from piling
// up faster than the browser can paint.
function rafThrottle(fn) {
    var scheduled = false;
    return function () {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(function () {
            scheduled = false;
            fn();
        });
    };
}
window.rafThrottle = rafThrottle;

// Selectable cards/rows: clicking (or Enter/Space on) a card toggles a "chosen"
// state, without triggering when the click lands on an inner link/button.
// Pulled out of the DOMContentLoaded sweep and exposed on window so a page
// that swaps in a fresh `[data-selectable]` list via AJAX (e.g. a refreshed
// card fragment) can re-wire just that root instead of duplicating this.
function initSelectable(root) {
    (root || document).querySelectorAll('[data-selectable]').forEach(function (container) {
        var single = container.dataset.selectable === 'single';

        function toggle(item) {
            var isChosen = item.classList.contains('chosen');
            if (single && !isChosen) {
                container.querySelectorAll('.selectable.chosen').forEach(function (other) {
                    other.classList.remove('chosen');
                    other.setAttribute('aria-pressed', 'false');
                });
            }
            item.classList.toggle('chosen', !isChosen);
            item.setAttribute('aria-pressed', String(!isChosen));
        }

        container.addEventListener('click', function (e) {
            if (closest(e.target, 'a, button')) return;
            var item = closest(e.target, '.selectable');
            if (!item || !container.contains(item)) return;
            toggle(item);
        });
        container.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            if (closest(e.target, 'a, button')) return;
            var item = closest(e.target, '.selectable');
            if (!item || !container.contains(item)) return;
            e.preventDefault();
            toggle(item);
        });
    });
}
window.initSelectable = initSelectable;

// Generic overflow tabs: any row of <button>/<a> tabs opting in via
// [data-overflow-tabs] (or the two cases already relying on it — Inclusion
// Panel's per-card .tab-row and any .card-switcher) scrolls horizontally
// once it overflows, rather than hiding whichever tabs don't fit behind a
// "More ▾" dropdown (#131 — that dropdown duplicated every hidden tab's
// label in a floating menu, disliked, and needed a design pass). Drag/swipe
// to scroll, with a fade at whichever edge has more content, and selecting
// a tab scrolls it to the centre of the row so it's never left half-hidden.
// Pulled out of the DOMContentLoaded sweep and exposed on window for the
// same reason as initSelectable above — a tab row swapped in fresh via AJAX
// (e.g. Inclusion Panel Home's My Actions card refresh) needs this re-run on
// the new element, not just the page's original rows.
function setupOverflowTabs(row) {
    if (!row) return;
    var tabs = Array.prototype.slice.call(row.children).filter(function (el) {
        return el.tagName === 'BUTTON' || el.tagName === 'A';
    });
    if (tabs.length < 2) return;

    row.classList.add('overflow-scroll-row');
    var wrap = document.createElement('div');
    wrap.className = 'overflow-scroll-wrap';
    row.parentNode.insertBefore(wrap, row);
    wrap.appendChild(row);

    var fadeLeft = buildOverflowFade('left');
    var fadeRight = buildOverflowFade('right');
    wrap.appendChild(fadeLeft);
    wrap.appendChild(fadeRight);

    // Samples the actual background-colour of whatever tab is under each
    // edge, rather than assuming a fixed pair of colours — .card-switcher's
    // tabs alternate bg-page/bg-surface by active state, but .tab-row sits
    // on a single uniform background throughout, so hardcoding either
    // scheme would be wrong for the other call site.
    function sampleBackground(edgeX) {
        var el = document.elementFromPoint(edgeX, row.getBoundingClientRect().top + row.clientHeight / 2);
        var tab = el && el.closest('button, a');
        return getComputedStyle(tab || row).backgroundColor;
    }

    function measure() {
        // Epsilon wider than a plain rounding guard (was 2px) — on a
        // fractionally-scaled display (e.g. Windows 125%/150% scaling)
        // scrollWidth/clientWidth carry sub-pixel remainders, so even a
        // fully-scrolled row can sit >2px short of scrollWidth and never
        // clear has-more-right, leaving the edge fade permanently drawn
        // over the last tab (reads as a soft clip on its label).
        wrap.classList.toggle('has-more-left', row.scrollLeft > 4);
        wrap.classList.toggle('has-more-right', row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
        var rowRect = row.getBoundingClientRect();
        fadeLeft.style.backgroundColor = sampleBackground(rowRect.left + 8);
        fadeRight.style.backgroundColor = sampleBackground(rowRect.right - 8);
    }
    row.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(measure).observe(row);
    }
    measure();

    setupOverflowDragScroll(row);

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            // Only when the row itself actually overflows - otherwise
            // there's nothing for scrollIntoView to do *within* row, so it
            // walks up to the next scrollable ancestor instead (the page
            // itself) and scrolls that to satisfy inline:'center',
            // shifting the whole layout sideways on desktop widths where
            // every tab already fits (live feedback: "changing tab in My
            // Actions shifts the whole page, cuts off the global menu").
            if (row.scrollWidth <= row.clientWidth + 1) return;
            tab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        });
    });
}
window.setupOverflowTabs = setupOverflowTabs;

function buildOverflowFade(side) {
    var fade = document.createElement('div');
    fade.className = 'overflow-scroll-fade overflow-scroll-fade--' + side;
    return fade;
}

// Pointer-based drag-to-scroll (mouse and touch alike — devtools mobile
// emulation and non-touch trackpads don't get native touch-scroll for
// free). Suppresses the click that would otherwise fire on the tab under
// the pointer once the drag has moved past a small threshold, so dragging
// doesn't also switch tabs.
function setupOverflowDragScroll(el) {
    var dragging = false;
    var moved = false;
    var startX = 0;
    var startScroll = 0;

    el.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragging = true;
        moved = false;
        startX = e.clientX;
        startScroll = el.scrollLeft;
        el.classList.add('overflow-scroll-dragging');
    });
    el.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - startX;
        if (Math.abs(dx) > 4) moved = true;
        el.scrollLeft = startScroll - dx;
    });
    function endDrag() {
        dragging = false;
        el.classList.remove('overflow-scroll-dragging');
    }
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('pointerleave', function () { if (dragging) endDrag(); });
    el.addEventListener('click', function (e) {
        if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
    }, true);
}

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
function setupFilterBarMoreFilters(bar) {
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
    if (window.matchMedia('(max-width: 480px)').matches || (isTrayBar && window.isFilterBarMobile && window.isFilterBarMobile())) {
        var retryMqls = isTrayBar
            ? [window.matchMedia('(max-width: 480px)'), window.studentsNarrowMql || window.matchMedia('(max-width: 768px)'), window.studentsPortraitMql || window.matchMedia('(orientation: portrait)'), window.studentsPortraitWideMql || window.matchMedia('(min-width: 900px)')]
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
    // secondary-group logic further down (`fields`, below, stays
    // .filter-field-only) - a header is never itself too wide to fit, and
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
    // horizontally as one line rather than wrapping - secondaryRow itself
    // stays the non-scrolling panel (position/background/border, forms.css,
    // back in normal page flow rather than floating), and this inner track
    // is the actual overflow-x: auto box the categories scroll inside,
    // same wrap/track split .stats-carousel-wrap already uses
    // (home.html) so wireScrollCarousel (below) can be reused unmodified.
    // display: contents by default (forms.css) at every other width, same
    // no-op convention as .filter-group.
    var secondaryTrack = document.createElement('div');
    secondaryTrack.className = 'filter-secondary-fields-track';
    secondaryRow.appendChild(secondaryTrack);
    // Left/right nudge buttons (live feedback: "add left and right arrows
    // like we do with carousels as well") - reuses wireScrollCarousel
    // (below) rather than reimplementing the same nudge/hide logic; hidden
    // by default (forms.css) everywhere except narrow tablet, and further
    // auto-hidden there by wireScrollCarousel itself whenever the strip
    // doesn't actually overflow.
    var secondaryPrevBtn = document.createElement('button');
    secondaryPrevBtn.type = 'button';
    secondaryPrevBtn.className = 'filter-secondary-fields-arrow filter-secondary-fields-arrow--prev';
    secondaryPrevBtn.setAttribute('aria-label', 'Scroll filter categories left');
    secondaryPrevBtn.textContent = '‹';
    secondaryRow.appendChild(secondaryPrevBtn);
    var secondaryNextBtn = document.createElement('button');
    secondaryNextBtn.type = 'button';
    secondaryNextBtn.className = 'filter-secondary-fields-arrow filter-secondary-fields-arrow--next';
    secondaryNextBtn.setAttribute('aria-label', 'Scroll filter categories right');
    secondaryNextBtn.textContent = '›';
    secondaryRow.appendChild(secondaryNextBtn);
    var updateSecondaryArrows = wireScrollCarousel(secondaryRow, '.filter-secondary-fields-track', '.filter-group', '.filter-secondary-fields-arrow--prev', '.filter-secondary-fields-arrow--next');
    // fieldsHost, not always fieldsWrap - has to be the same element
    // fields themselves live in (above), since measure() below uses
    // secondaryRow as an insertBefore reference point among them; a
    // reference node has to actually be a child of whichever element
    // insertBefore is called on, or it throws.
    fieldsHost.appendChild(secondaryRow);

    // .filter-bar-no-search (Meetings AND the SEND & Provision hub, now
    // sharing this treatment) - live feedback: "Filters and Clear Filters
    // should hide the filters that scroll underneath it. I think there
    // should be a line or border where the cut off is... should not be
    // visible if there is nothing underneath". "Filters"/Clear Filters sit
    // above this bar's now-full-bar-width scrollable track (z-index,
    // forms.css) rather than beside it, so scrolled fields genuinely pass
    // underneath them - these two classes (CSS: forms.css) toggle a thin
    // border in exactly that seam, but only once there's actually
    // something scrolled under it to mark, not just because the corner is
    // reserved.
    if (isTrayBar && !hasSearchField) {
        wireFilterCutoffEdges(bar, secondaryTrack);
    }

    var actionsRight = document.createElement('div');
    actionsRight.className = 'filter-actions-right';
    moreFiltersBtn = document.createElement('button');
    moreFiltersBtn.type = 'button';
    moreFiltersBtn.className = 'btn btn-sm btn-secondary more-filters-toggle';
    moreFiltersBtn.setAttribute('data-more-filters', '');
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
        allFields.forEach(function (f) { fieldsHost.insertBefore(f, secondaryRow); });
        // Reclaiming a field above pulls it out of whatever .filter-group
        // wrapper (below) held it on a previous pass, leaving that wrapper
        // behind as an empty shell still parented under secondaryRow -
        // insertBefore reparents the field itself but has no reason to also
        // clean up the div it just vacated. Without this they'd pile up, one
        // extra empty node per remeasure.
        Array.prototype.forEach.call(secondaryRow.querySelectorAll('.filter-group'), function (g) { g.remove(); });
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
        if (!window.matchMedia('(max-width: 480px)').matches && !(isTrayBar && window.isFilterBarMobile && window.isFilterBarMobile())) {
            // #135 follow-up (2026-08-20, live feedback: "can we make this
            // the setup for all modes except mobile") - every width above
            // mobile now goes straight to "everything lives behind View
            // Filters," the same model narrow tablet already settled on
            // (categories as a horizontally-scrolling strip inside the
            // panel, live feedback "all the filters in one line...
            // horizontally scrolled") - desktop/wide-tablet's own older
            // measure-the-overflow-and-split-at-the-boundary approach (an
            // atomic per-category version of it, previously here) is gone;
            // it was already left with primary holding nothing but Search
            // in practice, for the same reason narrow tablet dropped it
            // first.
            if (groups.length) {
                groups.forEach(function (g) {
                    // #135 follow-up: "if a filter category can fit on the
                    // same row as another it does" - wrapping each group in
                    // its own box lets narrow tablet's CSS (panel.css) treat
                    // it as one flex item that only wraps to a new line when
                    // it doesn't fit, instead of every header forcing a full-
                    // width break regardless of how little content (e.g.
                    // Inclusion Panel's 2 toggles) actually sits under it.
                    // display: contents at every other width (base rule,
                    // forms.css) makes this wrapper a no-op there, so desktop/
                    // wide-tablet's existing always-full-row header layout is
                    // unaffected.
                    var groupEl = document.createElement('div');
                    groupEl.className = 'filter-group';
                    if (g.header) groupEl.appendChild(g.header);
                    // Fields live inside their own inner wrap now, not as
                    // groupEl's own direct flex-wrap children (live feedback:
                    // "now it is too narrow. The line should stop at the edge
                    // of Reg dropdown etc" - the header's own flex: 1 1 100%
                    // used to force it onto its own row inside a flex-wrap
                    // .filter-group, but with .filter-group itself auto-
                    // sized (flex: 0 0 auto) inside an effectively
                    // unconstrained scrollable track, a percentage flex-basis
                    // has no definite size to resolve against while the
                    // browser is still figuring out how wide .filter-group
                    // even is - it was falling back to the header's own,
                    // often narrower, natural content width instead of
                    // genuinely spanning the group. Nesting fields in their
                    // own column sibling sidesteps that circularity
                    // entirely: .filter-group is display: flex; flex-
                    // direction: column now (panel.css), so the header just
                    // stretches to match this fields box's own resolved
                    // width via ordinary cross-axis stretch (a non-circular,
                    // two-pass computation) instead of a percentage basis.
                    var groupFields = document.createElement('div');
                    groupFields.className = 'filter-group-fields';
                    g.fields.forEach(function (f) { groupFields.appendChild(f); });
                    groupEl.appendChild(groupFields);
                    secondaryTrack.appendChild(groupEl);
                });
                moreFiltersBtn.hidden = false;
            }
            // Groups just got rebuilt into secondaryTrack above - re-checks
            // whether the strip still overflows (a filter clearing down to
            // fewer/shorter categories can un-overflow it) without re-
            // registering the arrow buttons' click handlers a second time,
            // which a fresh wireScrollCarousel call here would do.
            if (updateSecondaryArrows) updateSecondaryArrows();
        }
        // No pinned Search field (Meetings/the SEND & Provision hub) - live
        // feedback: "no search on filter bar, without one there is space
        // for the filters to not be underneath the bar... we can lose the
        // show/hide filters". Reuses the exact same secondaryRow/groups the
        // toggle-gated bars build just above (current chip/card styling,
        // not the dead pre-tray .filter-field default) rather than leaving
        // fields to fall back to their bare, unstyled display - just forces
        // the panel permanently open and the toggle permanently hidden
        // instead of gating it behind a click. flex-basis override
        // (forms.css, .filter-bar-no-search) is what actually keeps this
        // panel inline beside "Filters" instead of dropping to its own
        // full-width row below, same as the toggle-gated version does once
        // expanded.
        // Same mobile/narrow-desktop/portrait-tablet exclusion as the
        // groups-building block above (that gate's own comment) - live
        // feedback: "I see a second filter bar reduce in height [on load],
        // stays as a thin 1px line". Without it, this ran unconditionally
        // at every width including mobile, forcing secondaryRow open (and
        // so the mobile tray's own .filter-bar-collapsible box open to its
        // real content height) for the brief window before the page's
        // mobile-mode classification lands - once html.filter-bar-mobile-
        // mode is added a moment later, the tray's own close animation
        // (panel.css, its own height/border-bottom-color transition) plays
        // to snap it back to genuinely collapsed, visible as an unwanted
        // open-then-close flash on every load at these widths. Skipping
        // this block in mobile mode instead leaves secondaryRow in its
        // already-closed default (set at the top of this function) - the
        // exact same resting state every other tray bar starts in, opened
        // only by the shared "Filters" label tap handler (below,
        // document-level click listener), matching a no-search bar's own
        // "every width above mobile" design already documented on the
        // sibling gate.
        if (isTrayBar && !hasSearchField && groups.length && !window.matchMedia('(max-width: 480px)').matches && !(isTrayBar && window.isFilterBarMobile && window.isFilterBarMobile())) {
            secondaryRow.hidden = false;
            moreFiltersBtn.hidden = true;
            moreFiltersBtn.setAttribute('aria-expanded', 'false');
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
        // .filter-bar-no-search (Meetings AND the SEND & Provision hub,
        // now sharing this treatment) - live feedback: "a bulky generic
        // scrollbar but the full width" - the field panel's own negative
        // margin-left
        // (forms.css) pulls its scrollable box out from under "Filters" to
        // the bar's true left edge, so its native scrollbar can span the
        // bar's full width; this measures "Filters"'s own real rendered
        // width live (its text/count badge can change it) so that margin -
        // and the track's own matching padding-left, panel.css, which
        // keeps the fields themselves starting where they always visually
        // did - stay correct rather than a guessed fixed number drifting
        // out of sync, same convention --filter-actions-right-width above
        // already uses on the opposite corner.
        if (isTrayBar && !hasSearchField && label) {
            bar.style.setProperty('--filter-bar-label-width', label.offsetWidth + 'px');
        }
        // "Filters"/Clear Filters's own opaque fill (forms.css - masks a
        // scrolled field from showing through, live feedback: "I do not
        // want to see the dropdown if its been scrolled behind Filters and
        // badge") used to stretch to the full flex-line height, which
        // included the panel's own native horizontal scrollbar strip at
        // the bottom - covering that scrollbar too ("it is covering
        // scrollbar"). clientHeight excludes that strip, so the fill can
        // be sized to stop exactly where the scrollbar starts, leaving it
        // visible/usable underneath both corners. secondaryTrack, not
        // secondaryRow - overflow-x: auto (so the actual scrollbar) lives
        // on .filter-secondary-fields-track (panel.css), not the outer
        // .filter-secondary-fields wrapper; measuring the wrapper instead
        // read offsetHeight === clientHeight always regardless of any real
        // scrollbar, silently sizing this fill to the full row height
        // every time ("Overlap over the scrollbar still persists").
        if (isTrayBar && !hasSearchField) {
            // -2px safety margin - live feedback: "The borderline should
            // not reach the scroll bar". clientHeight/offsetHeight are
            // whole-pixel-rounded and can differ by a pixel or two from
            // the browser's own real (sub-pixel, OS-themed) scrollbar
            // metrics, close enough that the fill/cut-off line landed
            // flush against - and in a real browser, sometimes fractionally
            // into - the scrollbar itself rather than stopping cleanly
            // above it.
            bar.style.setProperty('--filter-bar-fields-content-height', Math.max(0, secondaryTrack.clientHeight - 2) + 'px');
        }
        // Re-sync the carousel arrows' own hidden state now that the vars
        // above have settled - live feedback: "I do not see left and right
        // arrows". wireScrollCarousel's updateSecondaryArrows already ran
        // once, synchronously, back when secondaryRow/secondaryTrack were
        // first built (above) - before this measure() had set --filter-
        // bar-label-width/--filter-actions-right-width even once, so the
        // track's own padding (panel.css, both vars) was still sized off
        // their fallback defaults (0px/180px) rather than "Filters"/Clear
        // Filters's real widths, made worse on a fresh full-page load (the
        // dev breakpoint preview's iframe reload, not a resize of an
        // already-settled page) where that first check has the least
        // chance of reflecting final layout. updateSecondaryArrows is
        // idempotent (just re-reads track.scrollWidth/clientWidth), so
        // calling it again here costs nothing on a page where the first
        // check already happened to be right.
        if (typeof updateSecondaryArrows === 'function') {
            updateSecondaryArrows();
        }
    }

    measure();
    // Open by default on desktop for a search-bearing bar (Students/
    // Referrals/Actions) - live feedback: "can Filters with search be open
    // by default on desktop mode unless its narrow". Reverses part of the
    // 2026-08-20 "no auto-open at any width above mobile any more" change
    // (wireMoreFiltersToggle's own comment, below) but only for this class
    // of bar - a .filter-bar-no-search bar (Meetings/the SEND & Provision
    // hub) has no toggle to open in the first place (main.js, above: the
    // hide-behind-toggle grouping is skipped for it entirely), so this
    // never applies there regardless. isFilterBarMobile() (not a bare
    // width check) is the same "narrow" boundary every other decision in
    // this file already uses - true phone, a narrowed desktop window, or
    // touch+portrait all count. Sets the button/panel straight to their
    // final "open" state rather than calling moreFiltersBtn.click() - a
    // page load should render already-open, not visibly play the reveal
    // animation the instant the page appears. secondaryRow.hidden = false
    // here, not animateSecondaryFieldsToggle - matches wireMoreFiltersToggle's
    // own <=480px branch (that animation is desktop/tablet-only there too).
    // The very next remeasure (a real resize, or the touch/orientation
    // retrigger below) reads this back via measure()'s own wasExpanded
    // check and keeps it open, so this only needs to run once at setup -
    // it isn't reapplied on every resize, so a user who closes it manually
    // stays closed rather than being forced back open.
    if (isTrayBar && hasSearchField && !(window.isFilterBarMobile && window.isFilterBarMobile())) {
        secondaryRow.hidden = false;
        moreFiltersBtn.setAttribute('aria-expanded', 'true');
        setMoreFiltersLabel(moreFiltersBtn);
    }
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
    window.addEventListener('resize', handleResize);
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(handleResize).observe(bar);
    }

    wireMoreFiltersToggle(moreFiltersBtn, secondaryRow, bar);
}
window.setupFilterBarMoreFilters = setupFilterBarMoreFilters;

// .filter-bar-cut-left/.filter-bar-cut-right (CSS: forms.css) - live
// feedback: "Filters and Clear Filters should hide the filters that scroll
// underneath it... there should be a line or border where the cut off is...
// should not be visible if there is nothing underneath". Toggled from
// `track`'s own real scroll position, not just "is this bar wide enough to
// ever overflow" (the arrows/scrollbar already answer that) - cut-left only
// once scrolled away from the true start (something is now hidden under
// "Filters"), cut-right only before the true end (something is still
// hidden under Clear Filters), so at rest - nothing scrolled, nothing
// actually cut off - neither line shows.
function wireFilterCutoffEdges(bar, track) {
    function update() {
        var scrollable = track.scrollWidth - track.clientWidth;
        bar.classList.toggle('filter-bar-cut-left', track.scrollLeft > 1);
        bar.classList.toggle('filter-bar-cut-right', scrollable > 1 && track.scrollLeft < scrollable - 1);
    }
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', rafThrottle(update));
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(update).observe(track);
    }
    update();
}

// Horizontal scroll-snap carousel: a .*-carousel-wrap holding a scrolling
// track plus prev/next arrow buttons that nudge scrollLeft by one card
// width, auto-hiding themselves when the track doesn't actually overflow.
// Top-level (not nested in the DOMContentLoaded sweep, unlike its own
// original call sites below) so setupFilterBarMoreFilters (above) can reuse
// it directly for the narrow-tablet filter panel's own category carousel
// (#135 follow-up, live feedback: "add left and right arrows like we do
// with carousels") instead of reimplementing the same nudge/hide logic a
// third time. Returns updateArrows so a caller whose track content changes
// after setup (measure()'s own remeasure/rebuild, unlike the senco/stats
// carousels' static card lists) can re-run just the overflow check without
// re-registering the click handlers each time - re-calling this whole
// function on every remeasure would stack a fresh, duplicate click listener
// on the same prev/next buttons instead.
function wireScrollCarousel(wrap, trackSelector, cardSelector, prevSelector, nextSelector) {
    var track = wrap.querySelector(trackSelector);
    var prevBtn = wrap.querySelector(prevSelector);
    var nextBtn = wrap.querySelector(nextSelector);
    if (!track || !prevBtn || !nextBtn) return;

    function step() {
        var card = track.querySelector(cardSelector);
        return card ? card.offsetWidth + 12 : track.clientWidth;
    }

    prevBtn.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); });
    nextBtn.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: 'smooth' }); });

    // A mouse wheel only ever reports deltaY, so without this a horizontal-
    // only track (nothing to scroll vertically) just ignores the user's wheel
    // entirely - the arrows/drag-scroll were the only way to move it. Redirects
    // vertical wheel input into horizontal scroll, same convention browsers
    // themselves use for a horizontal <select>/overflow-x region. Only when
    // deltaY actually dominates deltaX - a real trackpad two-finger horizontal
    // swipe already reports deltaX and should pass through untouched rather
    // than being doubled up. { passive: false } so preventDefault can actually
    // stop the page itself from scrolling vertically while this redirects it.
    track.addEventListener('wheel', function (e) {
        if (track.scrollWidth <= track.clientWidth) return;
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        track.scrollLeft += e.deltaY;
        e.preventDefault();
    }, { passive: false });

    // Click-and-drag scroll for a mouse (touch already gets native
    // momentum-scroll from overflow-x: auto, and a pen isn't a horizontal-
    // drag gesture users expect here) - a strip this narrow relative to its
    // content otherwise only moves via the arrows or the wheel redirect
    // above, neither of which is how a mouse user instinctively tries to pan
    // a horizontal strip first (grabbing and dragging it). DRAG_THRESHOLD
    // defers "is this actually a drag" until real movement happens, so a
    // plain click still reaches whatever's under the pointer (a filter's
    // <select> trigger, a toggle) untouched - only once threshold is crossed
    // does this (a) start actually moving scrollLeft and (b) arm the one-shot
    // capturing click-suppressor below, so the click a real drag would
    // otherwise fire on release never reaches - and spuriously activates -
    // whatever the drag happened to start on top of.
    var DRAG_THRESHOLD = 6;
    var drag = null;
    track.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        if (track.scrollWidth <= track.clientWidth) return;
        drag = { startX: e.clientX, startScroll: track.scrollLeft, moved: false, id: e.pointerId };
    });
    track.addEventListener('pointermove', function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        var dx = e.clientX - drag.startX;
        if (!drag.moved) {
            if (Math.abs(dx) < DRAG_THRESHOLD) return;
            drag.moved = true;
            track.setPointerCapture(drag.id);
            track.classList.add('is-dragging');
        }
        track.scrollLeft = drag.startScroll - dx;
    });
    function endDrag(e) {
        if (!drag || e.pointerId !== drag.id) return;
        if (drag.moved) {
            track.classList.remove('is-dragging');
            var suppressClick = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
            track.addEventListener('click', suppressClick, { capture: true, once: true });
        }
        drag = null;
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    function updateArrows() {
        var overflowing = track.scrollWidth > track.clientWidth + 1;
        prevBtn.hidden = !overflowing;
        nextBtn.hidden = !overflowing;
        // Grab cursor only advertises drag when there's actually something to
        // drag - an unaffordanced default cursor on a track that's already
        // fully visible would be a lie.
        track.classList.toggle('is-draggable', overflowing);
        // is-at-edge (live feedback, the filter category strip specifically:
        // "They also cover up the first and last dropdown if scrolled all
        // the way. Can the arrow fade to nothing if scrolled all the way?")
        // - a fully-scrolled-to-one-end track has nothing left for that end's
        // own arrow to do, so it just sits there obscuring the now-fully-
        // revealed first/last card underneath instead of affording anything.
        // No matching CSS exists for the other carousels this function is
        // shared with (senco/stats/referral/action) - the class is harmless
        // there, a plain no-op, but only .filter-secondary-fields-arrow
        // (panel.css) actually fades on it for now.
        if (overflowing) {
            var maxScroll = track.scrollWidth - track.clientWidth;
            prevBtn.classList.toggle('is-at-edge', track.scrollLeft <= 1);
            nextBtn.classList.toggle('is-at-edge', track.scrollLeft >= maxScroll - 1);
        }
    }
    updateArrows();
    track.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return updateArrows;
}

function wireMoreFiltersToggle(moreFiltersBtn, secondaryRow, bar) {
    // No auto-open-if-already-active at any width above mobile any more
    // (live feedback: "can we make this the setup for all modes except
    // mobile") - this panel always loads closed regardless of width now,
    // purely click-driven, matching mobile's own overlay tray.
    setMoreFiltersLabel(moreFiltersBtn);
    moreFiltersBtn.addEventListener('click', function () {
        var expanded = moreFiltersBtn.getAttribute('aria-expanded') === 'true';
        // #135: animates the reveal at every width above mobile now (live
        // feedback: "the filters [should] animate down like mobile mode",
        // then "can we make this the setup for all modes except mobile") -
        // everything behind this button IS the field list at these widths
        // (measure(), above), so instantly popping it in reads as a jump.
        // secondaryRow itself is in normal flow (forms.css, live feedback:
        // "the filter shelf pushes the content down as this can be kept
        // open") - this animation just grows/shrinks it in place.
        if (!window.matchMedia('(max-width: 480px)').matches) {
            animateSecondaryFieldsToggle(secondaryRow, !expanded);
        } else {
            secondaryRow.hidden = expanded;
        }
        moreFiltersBtn.setAttribute('aria-expanded', String(!expanded));
        setMoreFiltersLabel(moreFiltersBtn);
    });
}

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
// reaches Students' own mobile 3-up grid too (students.html), which
// otherwise only wrapped a multi-word label once it was already too wide
// for its ~110px column (naturally, via white-space: normal), not
// unconditionally the way the tablet strip already did.
// Original text cached on the span itself (data-label-text) rather than
// read back from its own textContent - a <br> contributes nothing to
// textContent, so a second call would otherwise see "HasReferrals" (no
// space) and misjudge the word count. Idempotent: rebuilds from that
// cached original every time rather than re-splitting whatever's already
// there, so a second call on an already-split label is a no-op, not a
// re-split of a re-split.
function balanceFilterGroupLabels(box) {
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

// Same FLIP technique (measure the real before/after height, pin it via an
// inline style, then hand off to a genuine CSS transition) the mobile tray's
// own .filter-bar-collapsible toggle handler already solved, below - a bare
// CSS transition on height/grid-template-rows alone was already found not
// to animate reliably there (see that handler's own comment), so this
// reuses the same battle-tested approach against `box` instead of
// rediscovering it. box.hidden has to come off *before* measuring `after`
// (opening) - scrollHeight only reflects real content once the element is
// actually rendered - and only go back on *after* the closing transition
// finishes, or the box would vanish (and its content un-render) before the
// shrink itself ever gets to play.
function animateSecondaryFieldsToggle(box, opening) {
    if (opening) {
        box.hidden = false;
        balanceFilterGroupLabels(box);
    }
    // Fields/labels fade with the same open/close toggle (live feedback:
    // "add a fade to the filters and label as the tray opens and closes...
    // the tray should not get this effect, only the contents") - opacity
    // goes on these leaf elements directly, not `box` itself, so the box's
    // own background/border (panel.css) stays fully opaque throughout and
    // only its contents fade. Queried up front, before anything else here
    // mutates the DOM - .filter-field/.filter-section-label are real
    // rendered elements even though several ancestors between them and
    // `box` are display: contents (setupFilterBarMoreFilters's wrappers),
    // so querySelectorAll still finds them regardless of that flattening.
    var contentEls = box.querySelectorAll('.filter-field, .filter-section-label');
    var before = opening ? 0 : box.getBoundingClientRect().height;
    var after = opening ? box.scrollHeight : 0;
    // box-sizing: border-box (global reset, layout.css) only means padding/
    // border get SUBTRACTED from a set height to find the content box - the
    // content box itself floors at 0, but padding/border are never
    // compressed below their own stylesheet size just because height is
    // set low. Animating height alone toward 0 therefore bottoms out at
    // padding-top + padding-bottom + border-top (this box's own
    // `padding: var(--space-sm) var(--space-lg); border-top: 1px solid...`,
    // forms.css) instead of a genuine 0 - the close transition really did
    // finish on schedule, it just wasn't animating toward zero to begin
    // with (live feedback: "I would guess there is some padding or margin
    // causing the filter shelf to not transition to 0px. And then it is
    // made invisible" - exactly right). Closing now pins padding/border to
    // their real current px values (not the CSS var - a var isn't a valid
    // transition end value on its own inline style start point the way a
    // resolved px is) and transitions them to 0 alongside height; opening
    // reverses it, animating in from 0 back up to their stylesheet values
    // (read via getComputedStyle before this box's own padding/border ever
    // get touched) so a reopen isn't left permanently flattened.
    var cs = getComputedStyle(box);
    var padTop = cs.paddingTop, padBottom = cs.paddingBottom, borderTop = cs.borderTopWidth;
    // marginBottom, alongside the padding/border already pinned above -
    // this box also carries a NEGATIVE bottom margin (forms.css: margin: 0
    // ... calc(-1 * var(--space-xs)), cancelling .filter-bar's own bottom
    // padding so the tray's scrollbar sits flush against the bar's real
    // edge) that this animation never touched at all - a box with height:
    // 0 still pulls its next sibling up by however much negative margin it
    // still carries, so the layout stayed shifted by that full amount for
    // the entire close transition regardless of how far height/padding/
    // border had already animated, only snapping back the instant `box.
    // hidden = true` (below) finally removed the margin's effect
    // outright - live feedback: "smooth animation of the filter tray
    // closing but it stops and then it has a snap close effect... maybe
    // 8px" (var(--space-xs) itself, confirmed by the fixed 8px size
    // regardless of how tall the field grid closing was). Animated
    // alongside the rest now, real px value <-> 0 same as padding/border.
    var marginBottom = cs.marginBottom;
    // rowGap - box.parentElement isn't necessarily the flex container
    // actually applying a gap around this row: Students' own tray nests
    // this box inside .filter-bar-collapsible-inner (setupFilterBarMoreFilters,
    // above), which is display: contents at this width (panel.css) -
    // display:contents flattens an element out of the render/layout tree
    // entirely, so the gap genuinely being applied is .filter-fields-wrap's
    // (one or two levels further up), not that flattened element's own.
    // Walking up past any display: contents ancestor finds the real one
    // generically - every other filter-bar page has no such wrapper at
    // all, so this is a no-op loop there, box.parentElement already being
    // the real flex container on the first try.
    // Animated on the PARENT itself (gapParent's own row-gap, 0 <-> its
    // real value), not by fighting it from this child's own margin - a
    // first attempt at this did exactly that (an animated margin-top,
    // 0 <-> -rowGap, meant to cancel the gap the same way marginBottom
    // already cancels .filter-bar's own padding) and it visibly failed
    // partway through: live colour test (.filter-bar one debug colour,
    // this box another) showed a growing gap-coloured band that still
    // snapped away at the very end. Root cause, confirmed by sampling
    // .filter-bar's own rect during the animation: browsers floor a flex
    // item's own contribution to its line's size at 0 - once this box's
    // combined margin-top + height + margin-bottom went net negative
    // (around 60% through the close), the flex algorithm simply stopped
    // shrinking .filter-bar any further even though margin-top kept
    // animating toward -rowGap, so the row-gap itself (applied
    // unconditionally between any two PRESENT flex items, regardless of
    // their own computed size) stayed fully in effect right up until
    // `box.hidden = true` (below) removed the row from the flex layout
    // altogether - the same snap, just moved to a different threshold.
    // Changing the gap value itself sidesteps that floor entirely: it's
    // not a margin fighting the layout algorithm's own space reservation,
    // it *is* the space reservation.
    var gapParent = box.parentElement;
    while (gapParent && getComputedStyle(gapParent).display === 'contents') {
        gapParent = gapParent.parentElement;
    }
    var rowGap = gapParent ? getComputedStyle(gapParent).rowGap : null;
    box.style.height = before + 'px';
    if (!opening) {
        box.style.paddingTop = padTop;
        box.style.paddingBottom = padBottom;
        box.style.borderTopWidth = borderTop;
        box.style.marginBottom = marginBottom;
        if (gapParent) gapParent.style.rowGap = rowGap;
    } else {
        box.style.paddingTop = '0px';
        box.style.paddingBottom = '0px';
        box.style.borderTopWidth = '0px';
        box.style.marginBottom = '0px';
        if (gapParent) gapParent.style.rowGap = '0px';
    }
    contentEls.forEach(function (el) {
        el.style.opacity = opening ? '0' : '1';
        el.style.transition = 'none';
    });
    box.style.transition = 'none';
    if (gapParent) gapParent.style.transition = 'none';
    void box.offsetHeight;
    box.style.transition = 'height 360ms cubic-bezier(.2, .8, .2, 1), padding-top 360ms cubic-bezier(.2, .8, .2, 1), padding-bottom 360ms cubic-bezier(.2, .8, .2, 1), border-top-width 360ms cubic-bezier(.2, .8, .2, 1), margin-bottom 360ms cubic-bezier(.2, .8, .2, 1)';
    if (gapParent) gapParent.style.transition = 'row-gap 360ms cubic-bezier(.2, .8, .2, 1)';
    contentEls.forEach(function (el) {
        el.style.transition = 'opacity 360ms cubic-bezier(.2, .8, .2, 1)';
    });
    requestAnimationFrame(function () {
        box.style.height = after + 'px';
        box.style.paddingTop = opening ? padTop : '0px';
        box.style.paddingBottom = opening ? padBottom : '0px';
        box.style.borderTopWidth = opening ? borderTop : '0px';
        box.style.marginBottom = opening ? marginBottom : '0px';
        if (gapParent) gapParent.style.rowGap = opening ? rowGap : '0px';
        contentEls.forEach(function (el) {
            el.style.opacity = opening ? '1' : '0';
        });
    });
    box.addEventListener('transitionend', function handler(e) {
        if (e.target !== box || e.propertyName !== 'height') return;
        box.style.transition = '';
        box.style.height = '';
        box.style.paddingTop = '';
        box.style.paddingBottom = '';
        box.style.borderTopWidth = '';
        box.style.marginBottom = '';
        if (gapParent) {
            gapParent.style.transition = '';
            gapParent.style.rowGap = '';
        }
        contentEls.forEach(function (el) {
            el.style.opacity = '';
            el.style.transition = '';
        });
        if (!opening) box.hidden = true;
        box.removeEventListener('transitionend', handler);
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
function setMoreFiltersLabel(moreFiltersBtn) {
    var labelSpan = moreFiltersBtn.querySelector('[data-more-filters-label]');
    if (!labelSpan) return;
    var expanded = moreFiltersBtn.getAttribute('aria-expanded') === 'true';
    if (!window.matchMedia('(max-width: 480px)').matches) {
        labelSpan.textContent = expanded ? 'Hide filters' : 'View filters';
    } else {
        labelSpan.textContent = expanded ? 'Hide filters' : 'More filters';
    }
}

document.addEventListener('DOMContentLoaded', function () {

    // Dev breakpoint preview (layout.html): the preview iframe is just a
    // resized window still driven by the real desktop mouse, so it can never
    // make hover:none media queries true on its own - previewing "Tablet
    // Portrait"/"Tablet Wide" would otherwise always exercise the
    // hover-capable narrow-window path below (locked rail), never the
    // touch-only drawer. layout.html's postMessage handler calls
    // window.__setDevBpTouch(true/false) when switching breakpoints, which
    // this class + the isTouchNav() checks below stand in for a real
    // hover:none/pointer:coarse device.
    var realHoverNoneMql = window.matchMedia('(hover: none)');
    var touchNavListeners = [];
    // Also checks window.top.__devBpTouch (dev breakpoint preview, same-origin
    // synchronous read - see layout.html's own head script) alongside
    // force-touch-nav - without this, this function's very first call here
    // (DOMContentLoaded, below) ran before the preview's postMessage handshake
    // had a chance to arrive (that only fires on frame.onload, later than
    // DOMContentLoaded) and force-touch-nav wasn't set yet, so it disagreed
    // with the correct state layout.html's synchronous scripts had already
    // rendered - flipping the sidebar open again for the brief window until
    // the postMessage handler finally set force-touch-nav and this got called
    // a second time to correct it. That "closed, then open, then closed"
    // cascade is what this line closes.
    function isTouchNav() {
        if (realHoverNoneMql.matches || document.documentElement.classList.contains('force-touch-nav')) return true;
        try { if (window.self !== window.top && window.top.__devBpTouch) return true; } catch (e) { }
        return false;
    }
    function syncTouchNavClass() {
        document.documentElement.classList.toggle('nav-touch-mode', isTouchNav());
        touchNavListeners.forEach(function (fn) { fn(); });
    }
    syncTouchNavClass();
    realHoverNoneMql.addEventListener('change', syncTouchNavClass);
    window.__setDevBpTouch = function (touch) {
        document.documentElement.classList.toggle('force-touch-nav', !!touch);
        syncTouchNavClass();
    };

    // Students filter bar: "mobile" treatment now also covers a narrowed
    // desktop browser window, not just a true phone (live feedback: "I
    // basically want everything to be the same as mobile except we keep
    // the side nav and do not have the bottom mobile nav" - after two
    // narrower bespoke-narrow-desktop attempts both still read as
    // unfinished). html.filter-bar-mobile-mode (panel.css, the Students-
    // scoped selectors it gates) is the single switch every affected CSS
    // rule keys off, rather than each rule re-deriving this same OR
    // condition from raw media features. Scoped to Students deliberately -
    // the shared filter-bar system every other page's own `.filter-bar`
    // also uses (setupFilterBarMoreFilters, below) is untouched by this
    // class entirely, so Referrals/Actions/Meetings keep their existing
    // View-filters behaviour unchanged at every width.
    var trueMobileMql = window.matchMedia('(max-width: 480px)');
    /* 768px, not 900px - live feedback: "narrow desktop mode activates a
       little early, is there a narrower breakpoint" - a tablet-portrait-
       width boundary, kept as this single source of truth (isFilterBarMobile/
       isFilterBarNarrowDesktop below and the retry fallback near the top of
       this file all read from this one query rather than each hardcoding
       their own number). Width-gated branch is now non-touch only (below) -
       a real portrait tablet is covered separately, by orientation. */
    var studentsNarrowMql = window.matchMedia('(max-width: 768px)');
    /* Real portrait tablets used to be deliberately excluded from all of
       this (live feedback, earlier in this same thread: "I did not want the
       filter change on narrow mobile to affect portrait tablet. It is only
       on very narrow desktop that had issues") - reversed on further live
       feedback once the tablet's own category-strip tray turned out to mean
       "a lot of scrolling" in practice ("I think I want this to apply to
       portrait tablet as it is narrow"). Width alone can't reliably catch
       "a portrait tablet" the way it can "a narrowed desktop window" - a
       portrait iPad (768-834px) or iPad Pro 12.9" (1024px) would need a much
       wider threshold than a genuinely narrow desktop should ever trigger at
       - so this checks orientation instead, only for touch devices (a
       narrowed *desktop* window is never orientation: portrait in the OS
       sense, so this can't misfire there). */
    var portraitMql = window.matchMedia('(orientation: portrait)');
    /* 900px - live feedback: "some bigger tablets in portrait may benefit
       from seeing the filters" - a portrait iPad Pro 12.9" (1024px) has
       exactly the room to show the inline bar like desktop does, so the
       touch+portrait branch above (which otherwise has no width floor at
       all) needs its own separate cap here, wider than studentsNarrowMql's
       768px - that number is tuned for narrowed *desktop* windows and would
       still catch a standard portrait iPad (768-834px) if reused here,
       which is exactly the tray behaviour this cap exists to keep. */
    var portraitWideMql = window.matchMedia('(min-width: 900px)');
    function isFilterBarMobile() {
        return trueMobileMql.matches || (studentsNarrowMql.matches && !isTouchNav()) || (isTouchNav() && portraitMql.matches && !portraitWideMql.matches);
    }
    // The narrow-desktop sub-case specifically (filter-bar-mobile-mode minus
    // true phone width) - live feedback: "all I can see is the overlay" -
    // the tray's own position: fixed; left: 0; right: 0 (panel.css) is a
    // viewport-anchored floating tray, correct on a real phone (no side nav,
    // full-bleed card flush with the viewport edge) but wrong once the side
    // nav stays put: the tray span no longer matches the (inset) filter bar
    // above it. Originally solved by pushing the list down instead of
    // floating over it in this state; reverted (live feedback: "I like the
    // slide over the top that mobile does... can we do this for portrait
    // tablet as well") once positionFilterTray started anchoring left/width
    // to the bar's own rect (INT-R2) instead of the raw viewport edge, which
    // fixes the misalignment without giving up the floating overlay. This
    // class is now purely a styling hook (square tray corners, sticky-
    // footer variant, category-strip panel at wider widths) - not a
    // positioning branch.
    function isFilterBarNarrowDesktop() {
        return !trueMobileMql.matches && ((studentsNarrowMql.matches && !isTouchNav()) || (isTouchNav() && portraitMql.matches && !portraitWideMql.matches));
    }
    function syncFilterBarMobileClass() {
        // filter-bar-mode-switching (panel.css: forces transition: none on
        // .filter-bar-collapsible) - live feedback: "I saw [the tray reduce
        // in height, leaving a thin line] when I switched to portrait
        // tablet mode" - resizing/rotating into or out of mobile mode while
        // a page is already open re-triggers the exact same height/border-
        // bottom-color transition the layout.html head script's own
        // synchronous classification (same bug, same fix, on first paint)
        // was written to prevent - that fix only covers the very first
        // paint, not a live reclassification like this one. Without this
        // guard, .filter-bar-collapsible flips between display: contents
        // (no box, live at its full open content height) and the mobile
        // box (height: 0, a real transition property) in the same
        // recalculation triggered by this class toggle, so the browser
        // interpolates from that full height down to 0 - visibly, and
        // (confirmed via Playwright) with a wildly wrong intermediate
        // `top` too, since position: fixed's own static-position fallback
        // recomputes every frame as the box's height/flow changes mid-
        // transition. Only guards an actual VALUE change (below), not
        // every call - this fires on every touch-nav toggle too (this
        // function's own comment elsewhere), most of which don't actually
        // flip either class.
        var wasMobile = document.documentElement.classList.contains('filter-bar-mobile-mode');
        var wasNarrow = document.documentElement.classList.contains('filter-bar-narrow-desktop');
        var nowMobile = isFilterBarMobile();
        var nowNarrow = isFilterBarNarrowDesktop();
        var modeChanged = wasMobile !== nowMobile || wasNarrow !== nowNarrow;
        if (modeChanged) document.documentElement.classList.add('filter-bar-mode-switching');
        document.documentElement.classList.toggle('filter-bar-mobile-mode', nowMobile);
        document.documentElement.classList.toggle('filter-bar-narrow-desktop', nowNarrow);
        // Re-run each tray bar's own dynamic-overflow measurement
        // (setupFilterBarMoreFilters's measure(), exposed as
        // bar._filterBarMeasure) on every call here, not just a genuine
        // bar.clientWidth change - this function also fires from a touch-
        // nav-only transition (touchNavListeners, below), which flips
        // filter-bar-mobile-mode without necessarily resizing anything.
        // Skipping this left fields that measure() had already buried
        // behind the hidden "More filters" group (built while still non-
        // mobile) stuck there once mobile-mode's own CSS hid the only
        // control that could reveal it again - live feedback: "lost the
        // close and clear button" (they render, just via the wrong,
        // desktop-only .filter-actions-right placement, because the field
        // grid itself never made it back into the tray). Only one tray bar
        // is ever on screen per page, but querySelectorAll here (not a
        // single querySelector) costs nothing and needs no per-page change
        // if that ever stops being true.
        document.querySelectorAll('.filter-bar-tray').forEach(function (trayBar) {
            if (trayBar._filterBarMeasure) trayBar._filterBarMeasure();
        });
        // Removes the guard one frame later (below), not synchronously -
        // the class toggle/measure() calls above still need to actually
        // commit and paint with transitions suppressed first; removing the
        // guard in the same tick would let the *next* recalculation (this
        // one) re-enable the transition before the browser ever renders a
        // frame with it off, defeating the whole guard.
        if (modeChanged) {
            requestAnimationFrame(function () {
                document.documentElement.classList.remove('filter-bar-mode-switching');
            });
        }
    }
    syncFilterBarMobileClass();
    trueMobileMql.addEventListener('change', syncFilterBarMobileClass);
    studentsNarrowMql.addEventListener('change', syncFilterBarMobileClass);
    portraitMql.addEventListener('change', syncFilterBarMobileClass);
    portraitWideMql.addEventListener('change', syncFilterBarMobileClass);
    touchNavListeners.push(syncFilterBarMobileClass);
    // Exposed globally - setupFilterBarMoreFilters/the Students tray click
    // handler (below) are both defined outside this DOMContentLoaded
    // closure, so they can't see these locals directly.
    window.isFilterBarMobile = isFilterBarMobile;
    window.isFilterBarNarrowDesktop = isFilterBarNarrowDesktop;
    window.studentsNarrowMql = studentsNarrowMql;
    window.studentsPortraitMql = portraitMql;
    window.studentsPortraitWideMql = portraitWideMql;

    // Icon-only rail behaviour for the hub sidebar. Desktop has no manual
    // control here at all - below the narrow-window breakpoint a
    // hover-capable pointer (a narrowed desktop browser window, not a touch
    // tablet) just gets the rail forced and locked, no toggle to reach it
    // with (hidden entirely at this width+pointer combo, see
    // responsive.css). Forcing the .collapsed class rather than just
    // leaving the width override to carry it visually also gets the forced
    // rail every other .side-nav.collapsed behavior for free -
    // tooltips-on-hover included, same as the always-icon-only .hub-rail.
    //
    // Touch/tablet (480-1180px, real hover:none or the dev breakpoint
    // preview's forced override - see isTouchNav() above) sits icon-only at
    // rest same as the locked desktop rail, but isn't locked: the corner
    // toggle temporarily widens the rail in place instead (adds
    // .touch-expanded, drops .collapsed - responsive.css positions it as an
    // absolute overlay so it doesn't reflow <main>), closing back down on a
    // second tap or a tap on the backdrop (#114/#129 follow-up - replaces
    // the original off-canvas drawer, which needed a second always-visible
    // burger button instead of reusing this one).
    (function setupSidebarCollapse() {
        var toggle = document.getElementById('sidebar-collapse-toggle');
        var nav = toggle && closest(toggle, '.side-nav');
        if (!toggle || !nav) return;
        // Two icon spans share this button (desktop chevron + touch burger,
        // CSS-swapped on .nav-touch-mode) - both get the tooltip kept in
        // sync since only one is ever visible at a time.
        var toggleIconEls = toggle.querySelectorAll('.icon-tooltip-host');
        var toggleLabelEl = document.getElementById('sidebar-collapse-toggle-label');
        // 1200px, not the shared 900px band other things in this file still
        // use (studentsNarrowMql etc.) - live feedback: "can the desktop
        // compact side menu happen as a wider breakpoint", then "the
        // change to an arrow needs to be at that breakpoint aswell... as
        // does the extra icons being added" - this mql (via locked(),
        // below) is what actually adds/removes .side-nav.collapsed, which
        // drives the exit-hub label hiding to an arrow-only icon, the
        // .hub-rail visibility, and everything else CSS keys off
        // .collapsed - moving responsive.css's own @media(max-width:1200px)
        // rail-width rule alone left this JS mql still flipping at 900px,
        // so between 900-1200px the rail was visually narrow (CSS) but
        // .collapsed hadn't actually been added yet (JS), leaving the
        // label/hub-rail in their expanded state crammed into the now-
        // narrow rail. Must match responsive.css's own threshold exactly -
        // the two aren't otherwise linked to each other in any way that
        // would catch a mismatch automatically.
        var narrowMql = window.matchMedia('(max-width: 1200px)');
        var hoverCapableMql = window.matchMedia('(hover: hover) and (pointer: fine)');
        var touchRailMql = window.matchMedia('(min-width: 480px) and (max-width: 1180px)');

        function locked() {
            // The dev breakpoint preview iframe (layout.html) can't make a
            // real mouse report hover:none/pointer:coarse, so it forces
            // isTouchNav() true via a class instead when previewing a touch
            // breakpoint - see isTouchNav() below.
            return narrowMql.matches && hoverCapableMql.matches && !isTouchNav();
        }
        function touchRailActive() {
            return touchRailMql.matches && isTouchNav();
        }

        function updateToggleLabel() {
            // Desktop never shows this button (CSS-hidden, see
            // responsive.css) so only the touch open/close label applies -
            // but hubTitlePrefix below still needs `collapsed` for desktop's
            // own locked-rail state too.
            var expanded = nav.classList.contains('touch-expanded');
            var collapsed = nav.classList.contains('collapsed');
            var label = expanded ? 'Close menu' : 'Open menu';
            toggle.setAttribute('aria-label', label);
            toggle.setAttribute('aria-expanded', String(expanded));
            toggleIconEls.forEach(function (el) { el.setAttribute('data-tooltip', label); });
            if (toggleLabelEl) toggleLabelEl.textContent = expanded ? 'Close' : 'Menu';
            // Hub landing pages render their H1 as "Dashboard" with a hidden
            // "<Hub Name> " prefix (see e.g. hubs/inclusion/templates/hubs/inclusion/hub.html)
            // — once the sidebar collapses to an icon-only rail, the hub name
            // disappears from the nav-title there too, so the H1 is the only
            // place left to show it.
            var hubTitlePrefix = document.getElementById('hub-title-prefix');
            if (hubTitlePrefix) hubTitlePrefix.hidden = !collapsed;
        }

        function closeTouchExpand() {
            nav.classList.remove('touch-expanded');
            nav.classList.add('collapsed');
            updateToggleLabel();
            removeBackdrop();
        }
        function openTouchExpand() {
            nav.classList.remove('collapsed');
            nav.classList.add('touch-expanded');
            updateToggleLabel();
            addBackdrop(closeTouchExpand);
        }

        function syncCollapsed() {
            if (touchRailActive()) {
                // Rest state only - an already-open touch-expand shouldn't
                // snap shut just because some other matchMedia fired (e.g.
                // hoverCapableMql), only on an actual resize out of range
                // (handled separately below).
                if (!nav.classList.contains('touch-expanded')) {
                    nav.classList.add('collapsed');
                }
                updateToggleLabel();
                return;
            }
            // Leaving touch range (resize, dev breakpoint preview switch)
            // shouldn't leave a stray .touch-expanded/backdrop behind.
            if (nav.classList.contains('touch-expanded')) closeTouchExpand();
            nav.classList.toggle('collapsed', locked());
            updateToggleLabel();
        }

        syncCollapsed();
        // Live-updates across an actual resize (not just page load) -
        // matters for the dev breakpoint preview iframe, which loads once
        // at a fixed size, but also for a real browser window being
        // resized/dev-tools-docked mid-session.
        narrowMql.addEventListener('change', syncCollapsed);
        hoverCapableMql.addEventListener('change', syncCollapsed);
        touchRailMql.addEventListener('change', syncCollapsed);
        touchNavListeners.push(syncCollapsed);

        toggle.addEventListener('click', function (e) {
            e.preventDefault();
            // Touch-only control - the toggle is CSS-hidden for any
            // hover-capable pointer (responsive.css), but guard anyway in
            // case it's reached some other way (e.g. keyboard focus
            // retained from a wider layout, or a pointer type change).
            if (!touchRailActive()) return;
            if (nav.classList.contains('touch-expanded')) closeTouchExpand(); else openTouchExpand();
        });
        // A link inside the temporarily-widened rail navigating to a new
        // page doesn't need an explicit close - the page reload takes care
        // of it - but clicking a trigger that opens another overlay from
        // inside (Hub Menu/Settings/School/Staff) still closes this rail,
        // same as before. What changed is *when* it visibly happens: the
        // overlay panel now slides fully over the rail first (opaque
        // background, matching width, higher z-index - see responsive.css),
        // so the rail's own collapse happens hidden behind it instead of
        // racing it in view - closing this rail immediately, in step with
        // the overlay opening, no longer reads as two competing animations.
        // It also means there's nothing left open underneath once the
        // overlay is later closed.
        nav.querySelectorAll('[data-overlay-target]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (nav.classList.contains('touch-expanded')) closeTouchExpand();
            });
        });
    })();

    // The sidebar's correct collapsed/touch state is fully applied by this
    // point (syncTouchNavClass/syncCollapsed above, both called
    // synchronously) - safe to lift the transition suppression layout.html
    // added before first paint. One rAF so it lifts after this state has
    // actually been painted, not mid-frame.
    requestAnimationFrame(function () {
        document.documentElement.classList.remove('js-preload');
    });

    // Tab-linking (#131): sizes .hub-rail-seam-top/-bottom/.hub-rail-active-fill
    // (layout.css) so the border/shadow separating the rail from the hub
    // sidebar has a real gap at the current hub's row, instead of a
    // fixed-width cover guessing how far the shadow's blur reaches. Measured
    // via getBoundingClientRect rather than hardcoded row math so it stays
    // correct regardless of which/how many hubs render (module visibility
    // cascade, core/modules.py) or if the row height ever changes. No active
    // item (e.g. the homepage) collapses back to a full, ungapped seam.
    function positionHubRailSeam() {
        var rail = document.querySelector('.hub-rail-inner');
        var seamTop = document.getElementById('hub-rail-seam-top');
        var seamBottom = document.getElementById('hub-rail-seam-bottom');
        var activeFill = document.getElementById('hub-rail-active-fill');
        if (!rail || !seamTop || !seamBottom || !activeFill) return;
        var active = rail.querySelector('.hub-rail-item.active');
        if (!active) {
            seamTop.style.height = '100%';
            seamBottom.style.top = '100%';
            activeFill.style.height = '0px';
            return;
        }
        var railRect = rail.getBoundingClientRect();
        var itemRect = active.getBoundingClientRect();
        var top = itemRect.top - railRect.top;
        seamTop.style.height = top + 'px';
        seamBottom.style.top = (top + itemRect.height) + 'px';
        activeFill.style.top = top + 'px';
        activeFill.style.height = itemRect.height + 'px';
    }
    positionHubRailSeam();
    window.addEventListener('resize', positionHubRailSeam);

    // Generic overlay nav handling: "Switch Hub", "Select School", "Select User" and
    // "Settings" are absolutely-positioned layers stacked inside one shared
    // `.overlay-slot`, which is the actual flex column that slides out beside the
    // primary sidebar/rail (CSS `order` places it after the rail, before <main>) —
    // opening a panel shows that layer and widens the slot from 0, pushing <main>
    // over, and dims <main> behind a backdrop scoped to it.
    function openOverlay(navEl) {
        if (!navEl) return;
        document.querySelectorAll('.overlay-nav.open').forEach(function (other) {
            if (other !== navEl) closeOverlay(other);
        });
        navEl.classList.add('open');
        var slot = closest(navEl, '.overlay-slot');
        if (slot) slot.classList.add('open');
        addBackdrop(function () { closeOverlay(navEl); });
        var input = navEl.querySelector('.nav-header input, .nav-scroll input');
        if (input) input.focus();
    }
    function closeOverlay(navEl) {
        if (!navEl) return;
        navEl.classList.remove('open');
        var slot = closest(navEl, '.overlay-slot');
        if (slot && !slot.querySelector('.overlay-nav.open')) slot.classList.remove('open');
        removeBackdrop();
    }

    document.querySelectorAll('[data-overlay-target]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            var navEl = document.querySelector(btn.dataset.overlayTarget);
            if (!navEl) return;
            if (navEl.classList.contains('open')) {
                closeOverlay(navEl);
            } else {
                openOverlay(navEl);
            }
        });
    });

    // Close button inside any overlay
    document.querySelectorAll('.overlay-nav .nav-close-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            closeOverlay(closest(e.target, '.overlay-nav'));
        });
    });

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var openNav = document.querySelector('.overlay-nav.open');
        if (openNav) closeOverlay(openNav);
    });

    // Switching directly from one open overlay to another (e.g. Settings -> Change
    // School) reuses the same backdrop element rather than removing/recreating it, so
    // its pending removal (scheduled by the close that's part of that switch) must be
    // cancelled — otherwise the backdrop a later overlay is relying on gets deleted out
    // from under it once that stale timer fires, and the dimming just vanishes.
    var backdropRemovalTimer = null;

    function addBackdrop(onClick) {
        // .content-column > main, not .page-shell > main - main hasn't been
        // a direct child of .page-shell since the #128 footer restructure
        // (it's nested one level deeper now), which left every overlay
        // (Settings/Search/School/Staff/Hubs, and now the touch-expanded rail) opening
        // with zero backdrop dimming - the querySelector silently matched
        // nothing instead of erroring.
        var main = document.querySelector('.content-column > main');
        if (!main) return;
        if (backdropRemovalTimer) {
            clearTimeout(backdropRemovalTimer);
            backdropRemovalTimer = null;
        }
        var existing = main.querySelector('.global-backdrop');
        if (existing) {
            existing.classList.add('active');
            existing.onclick = onClick;
            return;
        }
        var d = document.createElement('div');
        d.className = 'global-backdrop';
        d.onclick = onClick;
        main.appendChild(d);
        // allow CSS transition to animate in
        window.setTimeout(function () { d.classList.add('active'); }, 10);
    }

    function removeBackdrop() {
        var existing = document.querySelector('.content-column > main .global-backdrop');
        if (!existing) return;
        existing.classList.remove('active');
        if (backdropRemovalTimer) clearTimeout(backdropRemovalTimer);
        // remove after fade out transition
        backdropRemovalTimer = setTimeout(function () {
            if (existing.parentNode) existing.parentNode.removeChild(existing);
            backdropRemovalTimer = null;
        }, 380);
    }

    // Make the top section of each hub card clickable, without double-navigating when an inner link/button is clicked
    document.querySelectorAll('.hub-card-top').forEach(function (top) {
        var url = top.dataset.url;
        if (!url) return;
        top.addEventListener('click', function (e) {
            if (closest(e.target, 'a, button')) return;
            window.location.href = url;
        });
        top.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            if (closest(e.target, 'a, button')) return;
            e.preventDefault();
            window.location.href = url;
        });
    });

    initSelectable();

    // "+N more" toggles the hidden apps within a card instead of navigating to the hub
    document.querySelectorAll('.hub-more-toggle').forEach(function (btn) {
        var countEl = btn.querySelector('.hub-more-toggle-count');
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var container = closest(e.target, '.hub-card-items');
            if (!container) return;
            var expanded = container.classList.toggle('expanded');
            var moreCount = btn.dataset.moreCount || '0';
            countEl.textContent = expanded ? '−' : ('+' + moreCount);
        });
    });

    // Settings panel: primary colour, theme, theme mode (light/dark), text size — applied app-wide via
    // attributes on <html> (set early by the inline boot script in layout.html) and persisted.
    (function setupSettingsPanel() {
        var root = document.documentElement;

        // Per-theme swatch labels only — the hex itself is read from the
        // actual CSS via swatchProbe below rather than duplicated here, so
        // this can't drift out of sync with theme/themes.css the way a
        // hardcoded hex table did. "pastel" matches the hardcoded swatch
        // title/aria-label values already in the template, so it's omitted
        // here and falls back to those.
        var themeSwatchLabels = {
            vibrant: {
                purple: 'Vivid Violet', blue: 'Vivid Blue', teal: 'Vivid Teal',
                green: 'Vivid Green', yellow: 'Vivid Yellow', orange: 'Vivid Orange',
                red: 'Vivid Red', pink: 'Vivid Pink'
            },
            greytone: {
                purple: 'Slate', blue: 'Steel', teal: 'Graphite',
                green: 'Stone', yellow: 'Taupe', orange: 'Umber',
                red: 'Onyx', pink: 'Ash'
            },
            colourblind: {
                purple: 'Muted Plum', blue: 'Sky Blue', teal: 'Bluish Green',
                green: 'Sea Green', yellow: 'Safe Yellow', orange: 'Safe Orange',
                red: 'Muted Red', pink: 'Safe Magenta'
            },
            minimal: {
                purple: 'Iris', blue: 'Denim', teal: 'Sage',
                green: 'Moss', yellow: 'Sand', orange: 'Rust',
                red: 'Clay', pink: 'Mauve'
            },
            neon: {
                purple: 'Plasma', blue: 'Electric', teal: 'Cyber',
                green: 'Toxic', yellow: 'Solar', orange: 'Inferno',
                red: 'Laser', pink: 'Magenta'
            },
            cool: {
                purple: 'Twilight', blue: 'Arctic', teal: 'Glacial',
                green: 'Alpine', yellow: 'Polar', orange: 'Dusk',
                red: 'Aurora', pink: 'Blush'
            }
        };
        var pastelSwatches = {};
        // Excludes [data-value="school"] ("Corporate") - it has no inline
        // --swatch of its own (styled by class instead, layout.css) since
        // it doesn't resolve to one fixed hex, only whichever school's
        // currently selected.
        document.querySelectorAll('#pref-color .colour-swatch:not(.colour-swatch--corporate)').forEach(function (btn) {
            pastelSwatches[btn.dataset.value] = [btn.style.getPropertyValue('--swatch'), btn.title];
        });

        var colourNames = {};
        Object.keys(pastelSwatches).forEach(function (key) { colourNames[key] = pastelSwatches[key][1]; });
        colourNames.school = 'Corporate';

        // Off-screen probe element: reading --primary-base off it with the
        // target [data-theme]/[data-color] attributes gets the real,
        // currently-live swatch colour straight from the CSS cascade instead
        // of a second hand-maintained hex table.
        var swatchProbe = document.createElement('div');
        swatchProbe.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none;';
        document.body.appendChild(swatchProbe);

        function getThemeAccentHex(theme, colour) {
            swatchProbe.setAttribute('data-theme', theme);
            swatchProbe.setAttribute('data-color', colour);
            return getComputedStyle(swatchProbe).getPropertyValue('--primary-base').trim() || null;
        }

        // Shared wiring for the swatch/option button-groups (colour, text size)
        function setupButtonGroup(containerId, attr, storageKey, fallback, onSelect) {
            var container = document.getElementById(containerId);
            if (!container) return;
            var buttons = container.querySelectorAll('[data-value]');

            function applySelection(value) {
                buttons.forEach(function (btn) {
                    btn.classList.toggle('selected', btn.dataset.value === value);
                });
                if (onSelect) onSelect(value);
            }

            applySelection(root.getAttribute(attr) || fallback);

            buttons.forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var value = btn.dataset.value;
                    root.setAttribute(attr, value);
                    try { localStorage.setItem(storageKey, value); } catch (e) { }
                    applySelection(value);
                    layoutAllHubCardBadges();
                });
            });
        }

        function applyThemeSwatches(theme) {
            var labels = themeSwatchLabels[theme];
            // Corporate excluded - see pastelSwatches' own identical exclusion
            // above for why; it has nothing here to refresh.
            document.querySelectorAll('#pref-color .colour-swatch:not(.colour-swatch--corporate), #themes-pref-color .colour-swatch:not(.colour-swatch--corporate)').forEach(function (btn) {
                var colour = btn.dataset.value;
                var pastelEntry = pastelSwatches[colour];
                var hex = labels ? getThemeAccentHex(theme, colour) : null;
                var label = (labels && labels[colour]) || (pastelEntry && pastelEntry[1]);
                if (!hex && !pastelEntry) return;
                btn.style.setProperty('--swatch', hex || pastelEntry[0]);
                if (label) {
                    btn.title = label;
                    btn.setAttribute('aria-label', label);
                    colourNames[colour] = label;
                }
            });
            updateColourLabel();
        }

        // "Corporate" (pref-color absent or 'school') resolves to whichever
        // school is currently selected (data-school-color, server-rendered
        // from core.portal_settings) rather than one fixed colour - live
        // feedback: "I do want to override the primary colour with my
        // preferred colour... reverts to the school colour" once real
        // per-school accent colours made data-school-color's existing
        // precedence (layout.html) actually visible for the first time.
        // Picking a real colour swatch instead is remembered the same way
        // pref-color already was, just no longer silently overridden.
        function colourMode() {
            var stored = localStorage.getItem('pref-color');
            return (stored && stored !== 'school') ? stored : 'school';
        }
        function updateColourLabel() {
            var label = document.getElementById('pref-color-current');
            if (!label) return;
            var mode = colourMode();
            if (mode === 'school') {
                var resolved = root.getAttribute('data-school-color') || 'purple';
                label.textContent = 'Corporate (' + (colourNames[resolved] || resolved) + ')';
            } else {
                label.textContent = colourNames[mode] || mode;
            }
        }
        (function () {
            var container = document.getElementById('pref-color');
            if (!container) return;
            var buttons = container.querySelectorAll('[data-value]');
            function applySelection(mode) {
                buttons.forEach(function (btn) { btn.classList.toggle('selected', btn.dataset.value === mode); });
                updateColourLabel();
            }
            applySelection(colourMode());
            buttons.forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var value = btn.dataset.value;
                    try { localStorage.setItem('pref-color', value); } catch (e) { }
                    root.setAttribute('data-color', value === 'school' ? (root.getAttribute('data-school-color') || 'purple') : value);
                    applySelection(value);
                    layoutAllHubCardBadges();
                });
            });
        })();

        var themeDescriptions = {
            pastel: 'Calm, low-contrast tones with warm borders and subtle depth.',
vibrant: 'Bold, high-visibility colours designed for dashboards and data.',
            cool: 'Crisp blue-grey tones for a focused, professional look.',
            minimal: 'Clean, understated styling that keeps attention on content.',
            neon: 'Vivid, energetic colours with striking electric accents.',
            colourblind: 'Accessible Okabe-Ito colours, clearly distinguishable across colour vision types.'
        };

        setupButtonGroup('pref-theme', 'data-theme', 'pref-theme', 'pastel', function (value) {
            applyThemeSwatches(value);
            var themeLabel = document.getElementById('pref-theme-current');
            if (themeLabel) themeLabel.textContent = themeDescriptions[value] || '';
        });
        applyThemeSwatches(root.getAttribute('data-theme') || 'pastel');

        setupButtonGroup('pref-text-size', 'data-text-size', 'pref-text-size', 'md');
        setupButtonGroup('pref-time-format', 'data-time-format', 'pref-time-format', '24');

        // Theme mode toggle: a single switch showing sun (light) / moon (dark)
        var themeModeToggle = document.getElementById('pref-theme-mode');
        if (themeModeToggle) {
            function applyThemeMode(value) {
                themeModeToggle.setAttribute('aria-checked', value === 'dark' ? 'true' : 'false');
            }
            applyThemeMode(root.getAttribute('data-theme-mode') || 'light');
            themeModeToggle.addEventListener('click', function () {
                var next = (root.getAttribute('data-theme-mode') || 'light') === 'dark' ? 'light' : 'dark';
                root.setAttribute('data-theme-mode', next);
                try { localStorage.setItem('pref-theme-mode', next); } catch (e) { }
                applyThemeMode(next);
                layoutAllHubCardBadges();
            });
        }
    })();

    // "Show all modules" toggle: unlike the theme mode toggle (pure CSS, no reload),
    // this needs a cookie write + reload since it changes server-rendered menus
    // (read server-side in core.modules.view_full_system).
    (function setupViewFullSystemToggle() {
        var toggle = document.getElementById('pref-view-full-system');
        if (!toggle) return;
        toggle.addEventListener('click', function () {
            var next = toggle.getAttribute('aria-checked') !== 'true';
            document.cookie = 'view_full_system=' + (next ? '1' : '0') + '; path=/; max-age=31536000; SameSite=Lax';
            location.reload();
        });
    })();

    // Shared by the "Select School" and "current user" switchers: both just
    // persist a chosen value to a cookie (read server-side in core.identity)
    // and reload, so the server re-renders everything (label, filtered staff
    // list, default identity) consistently rather than patching the DOM.
    function setupCookieSwitcher(options, cookieName, datasetKey, onClick) {
        options.forEach(function (opt) {
            opt.addEventListener('click', function () {
                var value = opt.dataset[datasetKey];
                document.cookie = cookieName + '=' + encodeURIComponent(value) + '; path=/; max-age=31536000; SameSite=Lax';
                if (onClick) onClick(opt);
                location.reload();
            });
        });
    }

    // School switcher: persists the selected school via a cookie so the server
    // can filter the identity dropdown and pick a sensible default identity.
    (function setupSchoolSwitcher() {
        var options = Array.prototype.slice.call(document.querySelectorAll('.school-nav-option[data-key]'));
        if (!options.length) return;
        setupCookieSwitcher(options, 'current_school_key', 'key', function (opt) {
            // Mirrors the selection for hubs/inclusion/templates/hubs/inclusion/panel/meeting_setup.html,
            // which still reads this localStorage key to default its own school filter.
            try { localStorage.setItem('pref-school', opt.dataset.school); } catch (e) { }
        });
    })();

    // Current-user identity switcher: a full overlay nav (like "Select School"),
    // opened via the sidebar's user row. No login system exists yet, so "who am I"
    // is just remembered per-browser via a cookie (server-side fallback/default
    // lives in core.identity).
    (function setupIdentitySwitcher() {
        var options = Array.prototype.slice.call(document.querySelectorAll('.staff-nav-option[data-staff-id]'));
        if (!options.length) return;
        setupCookieSwitcher(options, 'current_staff_id', 'staffId');
    })();

    // Identity search: filters the (already server-filtered-by-school) staff
    // list in the staff overlay by typed name, client-side only.
    (function setupIdentitySearch() {
        var overlay = document.getElementById('staff-nav-overlay');
        var input = overlay && overlay.querySelector('.identity-search-input');
        if (!input) return;
        var items = Array.prototype.slice.call(overlay.querySelectorAll('.nav-row-dropdown-list > li'));

        input.addEventListener('input', function () {
            var query = input.value.trim().toLowerCase();
            // Group dividers separate runs of options by school — a divider should
            // only stay visible when it has a visible option on both sides, otherwise
            // a fully-filtered-out group leaves a stray line with an empty gap.
            var groupHasVisible = false;
            var pendingDividers = [];
            items.forEach(function (li) {
                if (li.classList.contains('staff-nav-divider')) {
                    li.classList.add('hidden');
                    pendingDividers.push({ li: li, precededByVisible: groupHasVisible });
                    groupHasVisible = false;
                    return;
                }
                var option = li.querySelector('.staff-nav-option');
                if (!option) return;
                var name = (option.dataset.name || '').toLowerCase();
                var visible = !query || name.indexOf(query) !== -1;
                li.classList.toggle('hidden', !visible);
                if (visible) {
                    groupHasVisible = true;
                    pendingDividers.forEach(function (entry) {
                        if (entry.precededByVisible) entry.li.classList.remove('hidden');
                    });
                    pendingDividers = [];
                }
            });
        });
    })();

    // Small inline icons for the search results' hub label — kept here rather than
    // round-tripped through the server, since the result rows are built in JS from
    // the {{ search_items|json_script }} data, not server-rendered templates. Mirrors
    // the corresponding templates/icons/*_svg.html partials, just at a smaller size.
    var HUB_RESULT_ICONS = {
        'Staff': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 20a7 7 0 0 1 14 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
        'Operations': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M12 2.5v2.6M12 18.9v2.6M4.2 6.2l1.9 1.5M17.9 16.3l1.9 1.5M2.5 12h2.6M18.9 12h2.6M4.2 17.8l1.9-1.5M17.9 7.7l1.9-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
        'Resources': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7L12 3.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4.5 7.7L12 12l7.5-4.3M12 12v8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
        'Student': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.3c-1.9-1.4-4.4-1.9-6.8-1.4v12.8c2.4-.5 4.9 0 6.8 1.4 1.9-1.4 4.4-1.9 6.8-1.4V4.9c-2.4-.5-4.9 0-6.8 1.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 6.3v12.8" stroke="currentColor" stroke-width="1.6"/></svg>',
        'SEND & Provision': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20.5s-8-4.6-8-10.8A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8 3.1c0 6.2-8 10.8-8 10.8z" fill="currentColor"/></svg>',
        'Registers': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="3.5" width="14" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="9" y="2" width="6" height="3" rx="1" fill="currentColor"/><path d="M8.5 11.2l1.6 1.6L13 9.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 16.5h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
        'Careers': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="8" width="18" height="12" rx="2" fill="currentColor"/><path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
    };

    // App search: client-side typeahead over every hub/page link, built from the JSON
    // embedded sitewide via {{ search_items|json_script }} in layout.html. Used both by
    // the home screen's own search box and the one inside the "Switch Hub" overlay.
    function setupAppSearch(inputId, resultsId, dataId) {
        var input = document.getElementById(inputId);
        var results = document.getElementById(resultsId);
        var dataEl = document.getElementById(dataId);
        if (!input || !results || !dataEl) return;

        var items = [];
        try { items = JSON.parse(dataEl.textContent) || []; } catch (e) { }

        function closeResults() {
            results.classList.add('hidden');
            results.innerHTML = '';
        }

        function render(matches) {
            results.innerHTML = '';
            if (!matches.length) {
                var empty = document.createElement('div');
                empty.className = 'app-search-empty';
                empty.textContent = 'No matching apps';
                results.appendChild(empty);
            } else {
                matches.forEach(function (item, index) {
                    var row = document.createElement('div');
                    row.className = 'app-search-result' + (index === 0 ? ' active' : '');
                    row.setAttribute('role', 'option');
                    row.dataset.url = item.url;

                    var name = document.createElement('span');
                    name.className = 'app-search-result-name';
                    name.textContent = item.name;
                    row.appendChild(name);

                    var hub = document.createElement('span');
                    hub.className = 'app-search-result-hub';
                    hub.innerHTML = (HUB_RESULT_ICONS[item.hub] || '') + '<span></span>';
                    hub.querySelector('span').textContent = item.hub;
                    row.appendChild(hub);

                    row.addEventListener('click', function () { window.location.href = item.url; });
                    row.addEventListener('mouseenter', function () {
                        var active = results.querySelector('.app-search-result.active');
                        if (active) active.classList.remove('active');
                        row.classList.add('active');
                    });
                    results.appendChild(row);
                });
            }
            results.classList.remove('hidden');
        }

        function search(query) {
            query = query.trim().toLowerCase();
            if (!query) { closeResults(); return; }
            var matches = items.filter(function (item) {
                return item.name.toLowerCase().indexOf(query) !== -1 || item.hub.toLowerCase().indexOf(query) !== -1;
            }).slice(0, 8);
            render(matches);
        }

        input.addEventListener('input', function () { search(input.value); });

        // Each row's own mouseenter (above) moves .active onto itself as the
        // mouse crosses rows, but nothing ever removed it again once the
        // cursor left the list entirely - the primary-fill highlight stuck
        // on whichever row was last hovered even after moving away, reading
        // as though it were still selected. Bound once here (not inside
        // render(), which tears down and rebuilds `results`' children, but
        // never `results` itself) rather than re-attached on every render.
        results.addEventListener('mouseleave', function () {
            var active = results.querySelector('.app-search-result.active');
            if (active) active.classList.remove('active');
        });

        input.addEventListener('keydown', function (e) {
            var rows = Array.prototype.slice.call(results.querySelectorAll('.app-search-result'));
            if (!rows.length) {
                if (e.key === 'Escape') closeResults();
                return;
            }
            var activeIndex = rows.findIndex(function (r) { return r.classList.contains('active'); });

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (activeIndex >= 0) rows[activeIndex].classList.remove('active');
                activeIndex = (activeIndex + 1) % rows.length;
                rows[activeIndex].classList.add('active');
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (activeIndex >= 0) rows[activeIndex].classList.remove('active');
                activeIndex = (activeIndex - 1 + rows.length) % rows.length;
                rows[activeIndex].classList.add('active');
            } else if (e.key === 'Enter') {
                e.preventDefault();
                var target = activeIndex >= 0 ? rows[activeIndex] : rows[0];
                if (target && target.dataset.url) window.location.href = target.dataset.url;
            } else if (e.key === 'Escape') {
                closeResults();
            }
        });

        document.addEventListener('click', function (e) {
            if (!results.classList.contains('hidden') && !closest(e.target, '.app-search')) closeResults();
        });
    }

    setupAppSearch('app-search-input', 'app-search-results', 'app-search-data');
    setupAppSearch('rail-app-search-input', 'rail-app-search-results', 'app-search-data');

    // List page shells (Students/Referrals/Actions): sized to exactly fill the
    // space between the sticky page header and the bottom of the viewport, so
    // the shell/page never scrolls — only the entity-list inside the list-card
    // does. Measured off .sticky-header-zone rather than .page-header itself —
    // the zone's own bottom padding sits below the header and before the shell,
    // so measuring just the header undercounts that gap and leaves the shell a
    // few pixels too tall (a permanent, near-invisible overflow scrollbar on
    // main even though nothing looks cut off). The trailing subtraction must
    // match .main-inner's own bottom padding exactly — that padding is
    // rendered unconditionally after the shell regardless of the shell's own
    // height, so subtracting anything less leaves main's content that much
    // taller than the viewport, forcing a scrollbar even though every card
    // looks perfectly laid out above it (confirmed: shrinking a hardcoded
    // 16-then-32 constant here removed a reproducible bottom-of-page scroll
    // on Inclusion Panel Home). Read live off .main-inner's own computed
    // padding-bottom now, not a hardcoded 32px (git history) - that constant
    // only ever matched the desktop --space-2xl value; Students zeroes
    // .main-inner's own bottom padding at phone width entirely (panel.css,
    // body:has(.students-page-shell) .main-inner, moving the FAB/tabbar
    // clearance onto .entity-list's own padding instead), so hardcoding 32
    // there left the shell ~32px short of main's real usable bottom edge -
    // a visible gap of page background between the list-card and the mobile
    // tab bar (live feedback: "I can see a white line or white shadow on
    // the top edge of the Mobile bottom nav... only shows on student page").
    // Reading the actual padding avoids this class of page-specific
    // override silently drifting out of sync with a constant duplicated
    // here.
    (function setupListPageShellHeight() {
        var header = document.querySelector('.sticky-header-zone') || document.querySelector('.page-header');
        var shells = document.querySelectorAll('.list-page-shell');
        if (!header || !shells.length) return;

        // The card should use all the space main actually has to give,
        // short of what's genuinely needed for real trailing content.
        // Panel Home's KPI toggle/carousel (home.html) render as the
        // shell's own trailing siblings, not inside it - above 480px the
        // carousel is always visible (no toggle to collapse it there, see
        // responsive.css), so it genuinely needs its share reserved or it
        // overflows main outright. At phone width the collapsed carousel
        // itself measures 0, so this sums to just the small toggle - the
        // card still gets everything else.
        // Every list-page-shell gets its height pinned in JS, trailing
        // content or not - a shell with nothing trailing it does NOT
        // already get the same result for free from its own flex: 1
        // (layout.css): that only bounds a flex item to its container's
        // definite size, and .main-inner (this shell's flex parent) is
        // deliberately min-height: 100%, not height: 100% (see that rule's
        // own comment - other pages' sticky headers need main-inner able to
        // grow past one screen), so main-inner has no definite height of
        // its own to distribute in the first place whenever a shell's real
        // content (e.g. Students' full unfiltered row count) is taller than
        // the viewport - flex: 1 alone just lets the shell grow to fit that
        // content instead of capping it, and .entity-list's own internal
        // overflow-y: auto never gets a bounded box to scroll within either
        // (confirmed: Students' 240 seeded rows produced a ~29000px-tall
        // main scrolling the whole page - filter bar included - instead of
        // the entity list alone).
        function applyHeight() {
            var headerBottom = header.getBoundingClientRect().bottom;
            shells.forEach(function (shell) {
                var trailing = 0;
                var sib = shell.nextElementSibling;
                while (sib) {
                    var sibCs = getComputedStyle(sib);
                    trailing += sib.getBoundingClientRect().height
                        + parseFloat(sibCs.marginTop || 0)
                        + parseFloat(sibCs.marginBottom || 0);
                    sib = sib.nextElementSibling;
                }
                // Budget against main's own rendered bottom edge, not
                // window.innerHeight - anything below main in the layout
                // (e.g. the mobile bottom nav bar) eats into innerHeight
                // without main actually having that space to give. Clamped
                // to the mobile tabbar's own top (when it's genuinely
                // visible - getClientRects().length, not offsetParent,
                // which is always null for a position: fixed element like
                // this one regardless of visibility) rather than trusting
                // main's own edge to already exclude it - true for most
                // pages (the app-wide .main-inner padding-bottom reserves
                // it, _hub_sidebar.html), but Students zeroes that padding
                // specifically (this file, below, "moves the app-wide
                // bottom-nav scroll clearance... onto .entity-list itself")
                // and nothing then re-reserved it here, so the shell (and
                // the entity-list scrolling inside it) silently grew to
                // reach past the tabbar's own top, behind its opaque,
                // higher-stacked bar - live feedback: "meant to have a
                // bottom of list diagonal stripes" (.entity-list::after,
                // below) - the end-cap was genuinely rendering, just
                // entirely hidden behind the tabbar instead of sitting
                // visibly above it the way its own "FAB covers roughly
                // half of this box" design assumes. A plain Math.min is a
                // no-op wherever main's edge is already above the tabbar
                // (every other page, via that padding), so this only ever
                // changes something for a shell that actually needs it.
                var tabbar = document.querySelector('.mobile-tabbar');
                var tabbarTop = (tabbar && tabbar.getClientRects().length !== 0) ? tabbar.getBoundingClientRect().top : Infinity;
                var mainBottom = Math.min(shell.closest('main').getBoundingClientRect().bottom, tabbarTop);
                var mainInner = shell.closest('.main-inner');
                var mainInnerPaddingBottom = mainInner ? parseFloat(getComputedStyle(mainInner).paddingBottom || 0) : 0;
                var next = mainBottom - headerBottom - mainInnerPaddingBottom - trailing;
                // Skip a no-op (sub-px difference) re-apply - the actual
                // fix for the on-load snap a previous version of this code
                // hit and dodged by routing Students around this whole
                // function instead (git history): the ResizeObserver below
                // is guaranteed to fire once immediately on ro.observe(),
                // redoing the same computation the explicit applyHeight()
                // call a few lines below this function just made by hand -
                // and any later re-fire at a genuinely unchanged
                // headerBottom hits the same no-op. Only a real, >=1px
                // difference (an actual header reflow) should ever touch
                // shell.style.height again.
                if (Math.abs(next - (parseFloat(shell.style.height) || 0)) < 1) return;
                // flex: none (not just flexGrow/flexShrink: 0) - the base
                // CSS's flex: 1 shorthand also sets flex-basis: 0%, which
                // wins over an explicit height for a flex item's main size
                // even with grow/shrink zeroed out, so leaving flex-basis
                // alone would still ignore the pixel height set below.
                shell.style.flex = 'none';
                shell.style.height = next + 'px';
            });
        }

        applyHeight();
        window.addEventListener('resize', applyHeight);
        if (typeof ResizeObserver !== 'undefined') {
            var ro = new ResizeObserver(applyHeight);
            ro.observe(header);
            // Also watches the trailing siblings themselves, so a trailing
            // element resizing (e.g. the KPI carousel re-measuring on
            // window resize) shrinks the shell to make room, rather than
            // only reacting to header resizes.
            shells.forEach(function (shell) {
                var sib = shell.nextElementSibling;
                while (sib) { ro.observe(sib); sib = sib.nextElementSibling; }
            });
        }
    })();

    document.querySelectorAll('.panel-card .tab-row, .card-switcher, [data-overflow-tabs]').forEach(setupOverflowTabs);
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

    // Page-header actions (the {% block page_extras %} buttons/links beside
    // the page title, e.g. "Add Referral") crowd the title on narrow
    // screens. Below the existing 900px sidebar-collapse breakpoint, fold
    // them into an "Actions ▾" dropdown reusing the same .tab-row-more*
    // look as setupOverflowTabs() above. The real nodes are moved (not
    // cloned) so any click handlers/data attributes on them keep working.
    (function setupPageExtrasOverflow() {
        var mq = window.matchMedia('(max-width: 900px)');

        function collectActionItems(extras) {
            var items = [];
            Array.prototype.forEach.call(extras.children, function (el) {
                if (el.tagName === 'A' || el.tagName === 'BUTTON') {
                    items.push(el);
                } else if (el.classList.contains('key-actions')) {
                    Array.prototype.forEach.call(el.children, function (child) {
                        if (child.tagName === 'A' || child.tagName === 'BUTTON') items.push(child);
                    });
                }
            });
            return items;
        }

        document.querySelectorAll('.page-header-extras').forEach(function (extras) {
            var items = collectActionItems(extras);
            if (!items.length) return;

            items.forEach(function (item) {
                item._homeParent = item.parentElement;
                item._homeNext = item.nextSibling;
            });

            var moreWrap = document.createElement('div');
            moreWrap.className = 'tab-row-more hidden';
            var moreBtn = document.createElement('button');
            moreBtn.type = 'button';
            moreBtn.className = 'tab-row-more-btn';
            moreBtn.textContent = 'Actions ▾';
            var menu = document.createElement('div');
            menu.className = 'tab-row-more-menu hidden';
            moreWrap.appendChild(moreBtn);
            moreWrap.appendChild(menu);
            extras.appendChild(moreWrap);

            moreBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                menu.classList.toggle('hidden');
            });
            document.addEventListener('click', function () { menu.classList.add('hidden'); });

            function collapse() {
                items.forEach(function (item) { menu.appendChild(item); });
                moreWrap.classList.remove('hidden');
            }
            function expand() {
                items.slice().reverse().forEach(function (item) {
                    item._homeParent.insertBefore(item, item._homeNext);
                });
                moreWrap.classList.add('hidden');
                menu.classList.add('hidden');
            }

            function sync() {
                if (mq.matches) collapse(); else expand();
            }
            sync();
            mq.addEventListener('change', sync);
        });
    })();

    // Generic card switcher: pairs a .card-switcher (row of .card-tab buttons,
    // each with data-card-target="<id>") with a group of full-size "cards"
    // elsewhere on the page sharing class .switch-card. Below the breakpoint
    // that hides a page's normal side-by-side card layout (see the
    // .switch-card-group media query in style.css), clicking a tab shows the
    // matching card and hides the others. Reusable sitewide — any page can
    // adopt this by following the same markup convention, not just Inclusion
    // Panel Home.
    document.querySelectorAll('.card-switcher').forEach(function (switcher) {
        var buttons = switcher.querySelectorAll('.card-tab');
        buttons.forEach(function (button, newIdx) {
            button.addEventListener('click', function () {
                // Read before the class swap below — which way the card
                // should slide (see .switch-card-enter-left/right, style.css)
                // depends on where the newly-picked tab sits relative to
                // whichever one was active before this click.
                var oldIdx = Array.prototype.findIndex.call(buttons, function (b) {
                    return b.classList.contains('active');
                });

                buttons.forEach(function (b) { b.classList.remove('active'); });
                button.classList.add('active');
                // Scoped to this button's own .switch-card-group (found via its
                // target card), not every .switch-card on the page - a page can
                // have more than one switcher/group pair (#116, Panel Home's Row
                // 1 and Row 2), and a global query here would toggle every other
                // group's active-card off too on each click.
                var targetCard = document.getElementById(button.dataset.cardTarget);
                var group = targetCard ? targetCard.closest('.switch-card-group') : null;
                var scope = group || document;
                if (group && oldIdx >= 0 && oldIdx !== newIdx) {
                    group.setAttribute('data-switch-dir', newIdx > oldIdx ? 'right' : 'left');
                }
                scope.querySelectorAll('.switch-card').forEach(function (card) {
                    card.classList.toggle('active-card', card.id === button.dataset.cardTarget);
                });
                // The now-visible card's own tab row (if any) may have been
                // measured while display:none and reported zero width —
                // force a re-measure now that it's actually visible.
                window.dispatchEvent(new Event('resize'));
            });
        });
    });

    // Breadcrumbs: trail is always rooted at "LWLAT Portal" + the hub name
    // (see layout.html), which makes deep pages verbose. Default behaviour:
    // pages more than 3 crumbs deep always start collapsed to "… › <recent
    // crumbs>" — hiding the root + hub behind the toggle even if the full
    // trail would fit — and trim further from the front if even that
    // overflows. Shallow pages (root + hub + current page) just show the
    // full trail, no toggle. One "…"/"‹" button (never a separate close
    // control) flips between the default tail view and the full, wrapped
    // trail. Crumb/sep nodes are cloned once up front so any view can be
    // rebuilt from scratch without losing markup (icons, hrefs, etc).
    document.querySelectorAll('nav.breadcrumbs').forEach(function (nav) {
        var nodes = Array.prototype.slice.call(nav.childNodes).filter(function (n) {
            return !(n.nodeType === 3 && !n.textContent.trim());
        }).map(function (n) { return n.cloneNode(true); });

        function isSep(node) {
            return node.nodeType === 1 && node.classList.contains('sep');
        }

        var crumbs = nodes.filter(function (n) { return !isSep(n); });
        var seps = nodes.filter(isSep);

        function makeToggle(expanded, onClick) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'crumb-toggle';
            btn.setAttribute('aria-label', expanded ? 'Show fewer breadcrumbs' : 'Show earlier breadcrumbs');
            btn.textContent = expanded ? '−' : '…';
            btn.addEventListener('click', onClick);
            return btn;
        }

        function renderInline() {
            nav.innerHTML = '';
            nav.classList.remove('breadcrumbs-expanded');
            crumbs.forEach(function (c, i) {
                if (i > 0) nav.appendChild(seps[i - 1].cloneNode(true));
                nav.appendChild(c.cloneNode(true));
            });
        }

        function renderExpanded() {
            nav.innerHTML = '';
            nav.classList.add('breadcrumbs-expanded');
            nav.appendChild(makeToggle(true, renderDefault));
            crumbs.forEach(function (c, i) {
                if (i > 0) nav.appendChild(seps[i - 1].cloneNode(true));
                nav.appendChild(c.cloneNode(true));
            });
        }

        function renderTail(startIndex) {
            nav.innerHTML = '';
            nav.classList.remove('breadcrumbs-expanded');
            nav.appendChild(makeToggle(false, renderExpanded));
            nav.appendChild(seps[0].cloneNode(true));
            for (var i = startIndex; i < crumbs.length; i++) {
                if (i > startIndex) nav.appendChild(seps[i - 1].cloneNode(true));
                nav.appendChild(crumbs[i].cloneNode(true));
            }
        }

        function fitsOneLine() {
            return nav.scrollWidth <= nav.clientWidth;
        }

        function renderDefault() {
            if (crumbs.length <= 3) {
                renderInline();
                return;
            }
            var startIndex = 2;
            renderTail(startIndex);
            requestAnimationFrame(function () {
                while (!fitsOneLine() && startIndex < crumbs.length - 1) {
                    startIndex++;
                    renderTail(startIndex);
                }
            });
        }

        renderDefault();

        var resizeTimer = null;
        window.addEventListener('resize', function () {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(renderDefault, 150);
        });
    });

    document.querySelectorAll('.senco-carousel-wrap').forEach(function (wrap) {
        wireScrollCarousel(wrap, '.senco-carousel', '.senco-card', '.senco-carousel-arrow--prev', '.senco-carousel-arrow--next');
    });

    // Home's KPI row carousel (#116, rebuilt #132 for the "stack" effect,
    // simplified again - PROTOTYPE, live feedback: "we do not have an
    // active state for cards, it just scrolls. No dots, just a left and
    // right arrow to indicate there is more off screen"). No active card
    // any more - every card is always full size and fully clickable, so
    // there's nothing to centre, no per-card state to track, and no
    // "peeking card" to disambiguate a tap against. Arrows/fade just read
    // raw scroll position (start/end/overflowing); nothing here needs to
    // know which card, if any, is "the" one. Generic per-.stats-carousel-
    // wrap (forEach, not a singleton) - unlike My Referrals/My Actions
    // (home.html, page-specific), this was always meant to be reusable by
    // another KPI row.
    document.querySelectorAll('.stats-carousel-wrap').forEach(function (wrap) {
        var track = wrap.querySelector('.stats-carousel-track');
        var prev = wrap.querySelector('.stats-carousel-arrow--prev');
        var next = wrap.querySelector('.stats-carousel-arrow--next');
        var fadeL = wrap.querySelector('.stats-carousel-fade-l');
        var fadeR = wrap.querySelector('.stats-carousel-fade-r');
        if (!track || !prev || !next) return;

        function slots() {
            return Array.prototype.slice.call(track.children);
        }

        function step() {
            var slot = slots()[0];
            if (!slot) return track.clientWidth;
            var style = window.getComputedStyle(track);
            return slot.getBoundingClientRect().width + (parseFloat(style.columnGap || style.gap) || 0);
        }

        // "Fits without scrolling" check, independent of the carousel's own
        // edge inset (which would otherwise force scrollWidth to overflow
        // on its own, making a plain scrollWidth/clientWidth comparison
        // useless for deciding *whether to carry that inset at all*). Sums
        // each card's own offsetWidth + the row's real gaps against
        // track.clientWidth, which stays ~constant regardless of which
        // mode's padding is currently applied (that padding eats into the
        // content box, it doesn't change the track's own outer width).
        //
        // PROTOTYPE: never true at <=900px (matches panel.css's own
        // ≤900px auto-width block) - live feedback, screenshot: shrinking
        // the cards there (auto width + smaller everything) made all 6
        // technically fit unwrapped, which this function correctly
        // detected and switched to grid/wrap mode over - but that's the
        // wrong call at this width. Grid mode was meant for a couple of
        // KPI cards on a wide desktop screen where scrolling would be
        // silly, not for phone/tablet, where the carousel (arrows, fade,
        // drag) is the deliberately-built experience regardless of
        // whether the shrunk cards happen to squeeze in unwrapped.
        function fitsFlat() {
            if (window.matchMedia('(max-width: 900px)').matches) return false;
            var cards = slots();
            if (cards.length < 2) return true;
            var style = window.getComputedStyle(track);
            var gap = parseFloat(style.columnGap || style.gap) || 0;
            var total = gap * (cards.length - 1);
            cards.forEach(function (card) { total += card.offsetWidth; });
            return total <= track.clientWidth + 1;
        }

        function updateState() {
            var flat = fitsFlat();
            wrap.classList.toggle('is-flat', flat);

            if (flat) {
                // Grid mode: every card is already visible at once, so
                // there's nothing left for arrows/fade to drive.
                prev.hidden = true;
                next.hidden = true;
                if (fadeL) fadeL.style.opacity = 0;
                if (fadeR) fadeR.style.opacity = 0;
                return;
            }

            var overflowing = track.scrollWidth > track.clientWidth + 1;
            var atStart = track.scrollLeft <= 1;
            var atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 1;

            prev.hidden = !overflowing;
            next.hidden = !overflowing;
            prev.disabled = atStart;
            next.disabled = atEnd;
            if (fadeL) fadeL.style.opacity = (!overflowing || atStart) ? 0 : 1;
            if (fadeR) fadeR.style.opacity = (!overflowing || atEnd) ? 0 : 1;
        }

        prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); });
        next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: 'smooth' }); });
        track.addEventListener('scroll', updateState);
        window.addEventListener('resize', updateState);
        wrap.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowRight') { e.preventDefault(); track.scrollBy({ left: step(), behavior: 'smooth' }); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); track.scrollBy({ left: -step(), behavior: 'smooth' }); }
        });

        // Click-and-drag (mouse/pen only - touch already gets native
        // panning/flick from overflow-x: auto). No fling-to-settle any
        // more (that projected a release's momentum onto the nearest
        // card's centre - meaningless now that no card is "the" one to
        // settle on) - a mouse drag just stops wherever it's released,
        // same as touch already does.
        var isPointerDown = false;
        var dragMoved = false;
        var startX = 0;
        var startScrollLeft = 0;
        track.addEventListener('pointerdown', function (e) {
            if (e.pointerType === 'touch') return;
            // Grid mode: everything already fits, there's nothing to drag-
            // scroll to - skip starting a drag at all so a slightly-jittery
            // click can never get misread as one and swallowed below.
            if (wrap.classList.contains('is-flat')) return;
            // Without this preventDefault, a mousedown+move over a
            // .stat-card (a real <a>) kicks off the browser's own native
            // link drag-and-drop instead of ever reaching pointermove below
            // with useful deltas. A real click still reaches the link
            // normally; only an actual drag (dragMoved) gets swallowed by
            // the click-capture guard below.
            e.preventDefault();
            isPointerDown = true;
            dragMoved = false;
            startX = e.clientX;
            startScrollLeft = track.scrollLeft;
        });
        track.addEventListener('pointermove', function (e) {
            if (!isPointerDown) return;
            var dx = e.clientX - startX;
            if (!dragMoved && Math.abs(dx) > 5) {
                dragMoved = true;
                track.classList.add('is-grabbing');
                track.setPointerCapture(e.pointerId);
            }
            if (dragMoved) track.scrollLeft = startScrollLeft - dx;
        });
        function endPointerDrag() {
            isPointerDown = false;
            track.classList.remove('is-grabbing');
        }
        track.addEventListener('pointerup', endPointerDrag);
        track.addEventListener('pointercancel', endPointerDrag);
        // Swallows the click that follows a drag (dragMoved) so releasing
        // a drag over a card doesn't also fire its link navigation - every
        // other click (no drag happened) falls straight through to the
        // card's own <a>, no exceptions, since there's no "peeking card"
        // needing a tap-to-advance any more.
        track.addEventListener('click', function (e) {
            if (dragMoved) { e.preventDefault(); e.stopPropagation(); dragMoved = false; }
        }, true);

        updateState();
    });

    // Toggle .is-stuck on whatever sits right after a .sticky-zone-sentinel
    // once that (zero-height) marker scrolls out of the viewport — CSS has no
    // way to detect "currently pinned" for a position:sticky element on its
    // own, so pages that want a stronger stuck-state style (e.g. the SEND &
    // Provision dashboard's filter bar) add the marker as the sticky
    // element's immediately preceding sibling.
    (function setupStickyZoneSentinels() {
        var sentinels = document.querySelectorAll('.sticky-zone-sentinel');
        if (!sentinels.length || !window.IntersectionObserver) return;
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                var stuckEl = entry.target.nextElementSibling;
                if (stuckEl) stuckEl.classList.toggle('is-stuck', !entry.isIntersecting);
            });
        }, { threshold: 0 });
        sentinels.forEach(function (sentinel) { observer.observe(sentinel); });
    })();

    // Filter bars (e.g. the SEND & Provision dashboard) submit a plain GET
    // form on every change, since their stats are computed server-side —
    // that's a full navigation, so the browser resets scroll to the top even
    // though the user is just re-filtering in place. Stash the scroll offset
    // in sessionStorage right before the change-triggered unload, then
    // restore (and clear) it once the new page has settled. Keyed by
    // pathname + sessionStorage (not localStorage) since this is a
    // same-tab, single-navigation concern, not a durable preference.
    //
    // Listens for 'change' (capture phase, so it runs before the field's own
    // onchange="this.form.submit()") rather than the form's 'submit' event:
    // HTMLFormElement.submit() deliberately does NOT fire a submit event
    // (only requestSubmit()/a real button click does), so a submit listener
    // here would never run.
    (function setupFilterBarScrollRestore() {
        var SCROLL_KEY = 'filter-scroll:' + location.pathname;
        document.addEventListener('change', function (e) {
            if (!closest(e.target, 'form.filter-bar')) return;
            try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY)); } catch (err) { }
        }, true);
        var stored = null;
        try { stored = sessionStorage.getItem(SCROLL_KEY); } catch (e) { }
        if (stored === null) return;
        try { sessionStorage.removeItem(SCROLL_KEY); } catch (e) { }
        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () { window.scrollTo(0, parseInt(stored, 10) || 0); });
        });
    })();

    // #134: positions the floating tray (panel.css: .filter-bar-collapsible,
    // position: fixed) against its own .filter-bar's current bottom edge,
    // capped to clear the mobile tabbar. Factored out of the click handler
    // below so the visualViewport listener further down can re-run the
    // exact same calculation live, not just once at open time - a real
    // mobile browser's address-bar/toolbar chrome can show/hide *after* the
    // tray's already open (e.g. scrolling inside it), changing how much
    // screen is actually visible without firing any DOM resize of its own;
    // a one-time-at-open measurement goes stale the moment that happens.
    //
    // Caps against .mobile-tabbar's own top edge, not the true bottom of
    // the screen - live feedback: an earlier version of this reached the
    // full screen and painted over the tabbar (a deliberate main:has() +
    // z-index escalation, git history), but that meant the tabbar's own
    // icon row could end up covering the tray's sticky Clear/Close footer
    // depending on how much of the tabbar the tray's bottom edge actually
    // overlapped ("the mobile nav is covering the bottom button on the
    // filter tray when its full screen"). Landing the cap just above the
    // tabbar instead means the footer is never behind it, full stop - the
    // FAB (.mobile-tab-fab, a separate circular button that already floats
    // above the tabbar's own top edge by design) can still visually poke
    // over the tray's edge without covering interactive content the same
    // way ("I like the FAB overlaying it but not the whole bar").
    // How far .mobile-tab-fab's own top edge actually pokes above
    // .mobile-tabbar's top edge, measured live rather than assumed off its
    // CSS (margin-top: -28px, _hub_sidebar.html) - the tabbar's own
    // padding eats into that margin, so the real on-screen protrusion is
    // smaller than the margin alone suggests. Shared by positionFilterTray
    // and setupListEndCapHeight (below) so both "how much should the FAB
    // overlap X" calculations stay in step with each other and with any
    // future FAB/tabbar sizing change, instead of two separately-tuned
    // numbers that happen to agree today.
    function fabProtrusionAboveTabbar() {
        var fab = document.querySelector('.mobile-tab-fab');
        var tabbar = document.querySelector('.mobile-tabbar');
        // getClientRects().length, not offsetParent - same display: none-
        // stays-in-the-DOM gap as positionFilterTray's own tabbar check,
        // below: both elements are always present, only hidden by width via
        // CSS, so an existence-only check would read two display: none
        // boxes as "both visible at (0,0)" and return 0 instead of falling
        // back. offsetParent (an earlier version of this check) breaks for
        // a genuinely-visible .mobile-tabbar specifically because it's
        // position: fixed - offsetParent is defined to be null for any
        // fixed-position element regardless of visibility (confirmed live:
        // tabbarRect had real, on-screen coordinates while offsetParent
        // still read null), so that check silently treated the tabbar as
        // always hidden, ballooning the tray's own available height and
        // the list's own end-cap height calculations past the tabbar
        // entirely - live feedback: "the tray is meant to have a gap to
        // the bottom nav so that nothing is clipped... also meant to have
        // a bottom of list diagonal stripes" (the same broken tabbarVisible
        // read feeding both). getClientRects().length is 0 for display:
        // none (or detached) regardless of position, and non-zero for
        // anything actually rendered, fixed positioning included.
        var visible = fab && tabbar && fab.getClientRects().length !== 0 && tabbar.getClientRects().length !== 0;
        return visible ? (tabbar.getBoundingClientRect().top - fab.getBoundingClientRect().top) : 19;
    }
    // Extra clearance trimmed off however much the FAB would otherwise
    // overlap - live feedback: "adjust the math so there is slightly less
    // overlap. This is for both!", then "a bit more... fab should be about
    // halfway into padding of last entity" (0.2 left the FAB nearly flush
    // against the last entity row's own buttons). Expressed as a fraction of
    // the FAB's own protrusion (not a flat px number) so it scales the same
    // way the protrusion-based math it's trimming does, rather than
    // drifting out of proportion if the FAB's size/offset ever changes.
    function fabOverlapClearance() {
        return fabProtrusionAboveTabbar() * 0.35;
    }
    function positionFilterTray(bar, box) {
        var barRect = bar.getBoundingClientRect();
        var barBottom = barRect.bottom;
        // .getClientRects().length check, not just querySelector -
        // .mobile-tabbar stays in the DOM at every width (CSS alone hides
        // it below <=480px via display: none, layout.css), so a bare
        // existence check found it "present" for narrow-desktop/portrait-
        // tablet too once this function started running there - a display:
        // none element's own getBoundingClientRect() resolves to all
        // zeros, not where it would render if visible, which silently
        // capped maxHeight at 0 (top: 0, bar already well below that).
        // offsetParent (an earlier version of this check) isn't the right
        // tool here - it's null for a display: none ancestor chain, but
        // ALSO null for any position: fixed element regardless of
        // visibility, which .mobile-tabbar always is (layout.css) - so
        // that check was reading a genuinely visible tabbar as hidden at
        // every true-mobile width, live feedback: "the tray is meant to
        // have a gap to the bottom nav so that nothing is clipped" (this
        // fell back to the full viewport height instead of stopping above
        // the tabbar). getClientRects().length is 0 for display: none (or
        // detached) regardless of position, non-zero for anything actually
        // rendered - the correct general-purpose "is this really on
        // screen" check fabProtrusionAboveTabbar (above) now also uses.
        var tabbar = document.querySelector('.mobile-tabbar');
        var tabbarVisible = tabbar && tabbar.getClientRects().length !== 0;
        var bottomLimit = tabbarVisible ? tabbar.getBoundingClientRect().top : (window.visualViewport ? window.visualViewport.height : window.innerHeight);
        box.style.top = barBottom + 'px';
        // (INT-R2) left/width anchored to the bar's own rect, not the base CSS rule's
        // left: 0; right: 0 (panel.css) - true phone width has no side nav,
        // so the bar already spans edge to edge and this is a no-op there,
        // but narrow-desktop/portrait-tablet still show the icon rail beside
        // an inset card (live feedback: "I like the slide over the top that
        // mobile does... can we do this for portrait tablet as well") - an
        // edge-to-edge tray there would float under/over the nav rail
        // instead of over the actual filter bar, the exact misalignment that
        // originally kept this mode on a push-down layout instead. Setting
        // width explicitly (not just left) makes the CSS right: 0 irrelevant
        // for a position: fixed box - left + width alone fully determine its
        // horizontal extent.
        // Widened by .list-card's own left/right border width (live
        // feedback: "I am noticing a border around the filter tray... it is
        // likely within an element that probably already has border" -
        // exactly right: bar's own rect already sits inset from .list-card's
        // true edge by that border's width (.list-card .filter-bar, layout.
        // css, has no border of its own - the card's outer 1px border is
        // what bar's rect is inset from), so anchoring box to bar's rect
        // verbatim left it floating flush against, not over, that border -
        // confirmed via computed styles: .list-card's own border rendered
        // exactly along the tray's left/right edges, reading as if the tray
        // had a border of its own when it never did. Reading the border
        // width off .list-card directly (not a hardcoded px guess) so this
        // keeps working if that token's value ever changes.
        var listCard = bar.closest('.list-card');
        var cardBorderLeft = listCard ? parseFloat(getComputedStyle(listCard).borderLeftWidth) || 0 : 0;
        var cardBorderRight = listCard ? parseFloat(getComputedStyle(listCard).borderRightWidth) || 0 : 0;
        box.style.left = (barRect.left - cardBorderLeft) + 'px';
        box.style.width = (barRect.width + cardBorderLeft + cardBorderRight) + 'px';
        // Half the FAB's own protrusion above the tabbar, not a fixed number
        // - live feedback: "it should be based on math... the amount of Fab
        // that sticks out, the bottom padding of tray so this can be dynamic
        // if we change any of these settings." So this stays correct if the
        // FAB's size or offset ever changes. Landed on half - a small sliver
        // of tray bottom padding stays clear of the FAB rather than the
        // FAB's whole reach overlapping it. Plus fabOverlapClearance() on
        // top (live feedback: "slightly less overlap") - a bigger reserve
        // here means the FAB's own top edge sits that much further below
        // the tray's own bottom edge, i.e. less of the FAB overlaps it.
        box.style.maxHeight = Math.max(0, bottomLimit - barBottom - (fabProtrusionAboveTabbar() / 2) - fabOverlapClearance()) + 'px';
        // #134 follow-up (live feedback: "if filter tray is max size, can it
        // lose the bottom radius corners") - a rounded corner sitting right
        // at the tray's own hard-capped edge (where the field grid is
        // genuinely being clipped/scrolled, not just ending on its own)
        // reads as a deliberate stopping point rather than a soft, natural
        // end. .filter-bar-collapsible-inner's own scrollHeight vs
        // clientHeight is the standard "does this actually need to scroll"
        // check - inner (not box) because box's own scrollHeight always
        // just matches whatever flex: 1 handed inner (box's only child), it
        // never reflects inner's own internal overflow. Re-checked on every
        // call (open and the visualViewport listener, above), so a tray
        // that WAS maxed out un-squares itself again if the screen grows
        // back (e.g. the browser's own chrome collapsing) enough to fit
        // everything without scrolling.
        var inner = box.querySelector('.filter-bar-collapsible-inner');
        box.classList.toggle('is-maxed', !!inner && inner.scrollHeight > inner.clientHeight + 1);
        // Overlay's own bottom edge pinned to stop right above the stats
        // footer (Students/Referrals/Actions counts, last child of
        // #students-filtered-content, sibling of the overlay) instead of
        // its base inset: 0 (panel.css) reaching all the way down behind
        // it - the footer already stays undimmed/clickable through the
        // overlay via its own z-index (panel.css, live feedback: "overlay
        // should not overlay the stats footer"), but the overlay was still
        // painting behind it, and the entity-list content directly above
        // the footer's own border was still getting dimmed right up
        // against it - live feedback, on a tray short enough to leave that
        // gap exposed: "the border gets slightly darker" (confirmed via
        // pixel sampling: the border's own colour never actually changes -
        // this reads as darker purely from contrast against the newly-dark
        // strip sitting directly above it) - then "really the overlay
        // should not affect the stats bar at all. Are we not able to size
        // the overlay so it stops short?" Recomputed on every call here
        // (open, and the visualViewport listener, above) alongside the
        // tray's own maxHeight, for the same "screen size can change while
        // open" reasoning that recheck already exists for.
        // Scoped to the tray's own .list-card (already read above for its
        // border width), not a hardcoded #students-filtered-content - keeps
        // this reusable for any page built on the same .list-card >
        // .filter-bar / .filter-bar-overlay / .stats-strip structure, not
        // just Students.
        var statsStrip = listCard ? listCard.querySelector('.stats-strip') : null;
        var overlayEl = listCard ? listCard.querySelector('.filter-bar-overlay') : null;
        if (overlayEl) overlayEl.style.bottom = statsStrip ? statsStrip.getBoundingClientRect().height + 'px' : '';
    }
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', function () {
            document.querySelectorAll('.filter-bar.is-expanded').forEach(function (bar) {
                var box = bar.querySelector('.filter-bar-collapsible');
                if (box) positionFilterTray(bar, box);
            });
        });
    }

    // .entity-list::after's own "end of content" stripe (panel.css) - live
    // feedback: "same for the last entity of filtered content... should be
    // based on math", the same complaint as positionFilterTray's own gap
    // above. Twice fabProtrusionAboveTabbar(), not half - the FAB should
    // cover roughly half of this box, so the box itself is twice however
    // far the FAB actually reaches. Exposed as a CSS custom property (not
    // set inline on the element, unlike the tray) because this is a
    // ::after - there's no real element for JS to style directly.
    (function setupListEndCapHeight() {
        function apply() {
            document.documentElement.style.setProperty('--list-endcap-height', (fabProtrusionAboveTabbar() * 2) + 'px');
            // Pushes the cap's own bottom edge up off the tabbar by the same
            // fabOverlapClearance() positionFilterTray now reserves (live
            // feedback: "slightly less overlap. This is for both!") - the
            // cap is otherwise flush with the scroll container's bottom, so
            // margin-bottom is what actually trims the FAB's overlap into it
            // rather than just changing its own height (which only changes
            // how much unobscured stripe shows above the overlap, not the
            // overlap itself).
            document.documentElement.style.setProperty('--list-endcap-clearance', fabOverlapClearance() + 'px');
        }
        apply();
        if (window.visualViewport) window.visualViewport.addEventListener('resize', apply);
        window.addEventListener('resize', apply);
    })();

    // Mobile filter bar collapse (see responsive.css's ≤480px block, #114):
    // tapping the "Filters · count" label toggles `.is-expanded`, which is
    // what actually reveals the fields below that width. No-op above 480px
    // since the CSS there ignores the class and shows fields unconditionally.
    // [data-filter-bar-close] (#133 follow-up, live feedback: "an obvious
    // close") is the same idea but one-directional - always collapses,
    // never toggles open, since a close button's only job is closing.
    document.addEventListener('click', function (e) {
        var label = closest(e.target, '.filter-bar-label');
        var closeBtn = closest(e.target, '[data-filter-bar-close]');
        if (!label && !closeBtn) return;
        // closeBtn's own closest('.filter-bar') covers a close control
        // nested inside the bar itself (the Close button); the
        // document.querySelector fallback covers one that deliberately
        // isn't - Students' own backdrop overlay (#133 follow-up) lives
        // beside #students-filtered-content instead, not inside .filter-bar,
        // specifically so a semi-transparent layer never has to render
        // inside the bar's own box (where its padding/gaps would otherwise
        // let it visibly dim the bar's own background too - live feedback:
        // "the overlay is affecting the expanded filter bg"). Only one bar
        // is ever realistically .is-expanded at a time, so this is safe
        // without the overlay needing to name which bar it belongs to.
        var bar = closest(label || closeBtn, '.filter-bar') || (closeBtn && document.querySelector('.filter-bar.is-expanded'));
        if (!bar) return;
        // #135: at every width above mobile (widened 2026-08-20 - "can we
        // make this the setup for all modes except mobile") this bar's own
        // trigger is "View filters"/"Hide filters" (moreFiltersBtn), not
        // this label - the label is just descriptive text there now, so a
        // click on it should do nothing rather than silently toggling
        // .is-expanded without also updating aria-expanded/secondaryRow.
        // hidden (the state wireMoreFiltersToggle's own click handler
        // actually owns). No closeBtn case to handle here any more - the
        // dimmed click-to-close overlay this used to redirect through only
        // ever existed briefly (panel.css), and the filter panel itself is
        // in normal flow now (live feedback: "the filter shelf pushes the
        // content down... this can be kept open"), so there's no overlay
        // left to close.
        // Any opted-in tray bar (.filter-bar-tray) now also opens this way
        // at a narrowed, hover-capable desktop width (window.isFilterBarMobile,
        // above) - a plain `.filter-bar` with no tray keeps the exact 480px
        // threshold unchanged.
        var isTrayBar = bar.matches('.filter-bar-tray');
        var barIsMobile = window.matchMedia('(max-width: 480px)').matches || (isTrayBar && window.isFilterBarMobile && window.isFilterBarMobile());
        if (!barIsMobile) {
            return;
        }
        // Students' own slide-down tray (.filter-bar-collapsible) -
        // grid-template-rows: 0fr <-> minmax(0, 1fr) is what actually
        // establishes the correct final height instantly (bounded to
        // whatever's available, scrolling internally if the field grid is
        // taller - see that rule's own comment, panel.css) - a plain
        // height/max-height value alone can't express that up front (no
        // fixed height to target - Has Houses, long option text wrapping,
        // etc. all affect it per-render). No CSS transition on that grid
        // property, though (tried, along with a max-height variant - live
        // feedback "I do not see it", then "I am still seeing no
        // animation" - checked via getAnimations()/computed-style probing,
        // the browser was resolving the target height in a single frame
        // regardless of declared duration; a Web Animations API keyframe
        // was tried next and still only visibly animated the CLOSE
        // direction, not open, live feedback "it jumps open" - by the time
        // that animate() call ran, the class was already toggled and the
        // grid had already resolved its real height, so open had nothing
        // committed to visually animate FROM). A FLIP-pattern plain height
        // transition was tried next (pin *before* as an inline style, force
        // the browser to commit it via an offsetHeight read, then hand
        // *after* to a genuine CSS transition on the next frame) and still
        // only opened instantly (live feedback: "it jumps open" again) -
        // root cause, found by checking box.style.height mid-transition
        // against its actual rendered height: this element also carries
        // flex: 1 1 0% (needed for the "grow to fill .list-card's
        // available space" bounding, panel.css) - flex-basis: 0% makes the
        // flex algorithm ignore an explicit height entirely and recompute
        // purely from flex-grow every frame, so the inline height this code
        // sets was always being silently overridden back to full size.
        // flexOverride below opts the box out of flex sizing for the
        // animation's duration (flex-grow/shrink: 0, flex-basis: auto, so
        // its own height property actually governs it), then restores the
        // real flex: 1 1 0% once the transition ends so the resting,
        // scroll-bounded state (below) still works exactly as before.
        var box = bar.querySelector('.filter-bar-collapsible');
        var wasExpanded = bar.classList.contains('is-expanded');
        var willExpand = closeBtn ? false : !wasExpanded;
        // The dimmed backdrop (.filter-bar-overlay, panel.css) has its own
        // opacity transition keyed off this class (live feedback: "can
        // overlay transition in and out through opacity" - tying it to
        // .is-expanded technically had a transition property, but with
        // .is-expanded persisting for the whole close, below, the overlay
        // stayed fully opaque that whole time and only ever visibly
        // snapped, never actually faded). Toggled immediately, same tick,
        // in both directions - both this and the tray's own height
        // transition (below) now start on the literal same synchronous
        // frame (no more measure-then-animate gap, this rewrite's own
        // comment below), so a flat 360ms on both (panel.css) keeps them
        // finishing together too, live feedback: "check it is timed to
        // start and end same as the tray height animation". bar.parentElement,
        // not a #students-filtered-content-specific query, since every
        // other filter-bar page using this same click handler has no such
        // overlay to find (null there, harmless).
        var overlayEl = bar.parentElement && bar.parentElement.querySelector('.filter-bar-overlay');
        bar.classList.toggle('overlay-visible', willExpand);
        // Height itself now animates via plain CSS (panel.css:
        // .filter-bar-collapsible's own height: 0/auto + transition,
        // gated by .tray-open, plus the site-wide interpolate-size:
        // allow-keywords opt-in, layout.css) instead of the JS FLIP
        // dance this replaced - live feedback: "I do not like this delay
        // [before the tray visibly starts opening]. Is there another
        // way of doing this?" That delay was main.js measuring the
        // tray's true natural height itself (a ResizeObserver + debounce
        // wait, box hidden the whole time, git history) - genuinely
        // needed under the OLD technique, where a browser can't animate
        // a plain height transition to/from "auto" at all (it resolves
        // the target in a single frame regardless of declared duration,
        // this whole block's now-deleted git history covers three earlier
        // attempts at working around exactly that), so main.js had to
        // read the real pixel height itself first and hand CSS a fixed
        // number to animate to instead - and that read was ALSO
        // unreliable for a frame or two on a genuinely auto-sized tray
        // (the "bounce" bug, same git history), which is what the
        // ResizeObserver settle-wait was for in the first place.
        // interpolate-size: allow-keywords (Chromium, confirmed supported
        // in this dev environment) removes the whole problem at its root
        // (INT-M5)
        // instead of working around it - the browser computes the tray's
        // real height itself, every frame, the same way it always could
        // for any other animatable property, so there's nothing left for
        // main.js to measure, wait for, or get transiently wrong. Kept:
        // .is-expanded (styling only, removed on close only once the
        // shrink has genuinely finished, transitionend below - unrelated
        // to what drives the height value now) and positionFilterTray's
        // own top/left/width/max-height (still genuinely un-knowable to
        // CSS alone - that function's own comment).
        var inner = box && box.querySelector('.filter-bar-collapsible-inner');
        // Commits the PRE-toggle frame as a real, rendered "before" state
        // ahead of any class change below - live feedback: "Can the buttons
        // fade in and out rather than vanish or appear", confirmed via
        // computed-style sampling as a genuine bug, not a request for a
        // feature that didn't exist yet: .filter-bar-collapsible-inner/
        // .filter-bar-sticky-footer's own opacity fade (panel.css, gated on
        // .tray-open) was snapping straight to its end value on close with
        // no transition at all - opacity read 0 from the very first sampled
        // frame, never fading through any intermediate value. Root cause:
        // the OTHER forced reflow below (`void box.offsetHeight`, its own
        // comment) runs immediately AFTER the class change, in the same
        // synchronous tick, with no rendering opportunity in between - fine
        // for box's own height (calc-size() explicitly needs exactly that
        // forced-reflow-after-the-change pattern to register a transition
        // at all, that rule's own comment), but for a normal property like
        // opacity it means the browser never gets to paint/commit a
        // genuine "before" frame first, so it collapses the whole before-
        // after cycle into one synchronous batch and skips the transition
        // outright. Forcing a reflow HERE too, before anything changes,
        // gives opacity a real committed starting frame regardless of what
        // the later, class-change-triggering reflow does to calc-size.
        if (box) void box.offsetHeight;
        if (willExpand) {
            bar.classList.add('is-expanded');
            bar.classList.add('tray-open');
            if (box) {
                // Same forced 2-line break the narrow-tablet category strip
                // already gets (live feedback: "labels that have at least
                // two words [should be] on two lines... we do this in other
                // modes") - run before positionFilterTray, below, so its own
                // max-height reservation already accounts for any label
                // that just gained a second line, not the pre-wrap shorter
                // one.
                balanceFilterGroupLabels(box);
                // #134: the floating tray (panel.css: position: fixed,
                // viewport-anchored) has nothing left bounding its top/
                // height once it's out of .filter-bar's own flex flow - CSS
                // alone can't target either up front (top depends on the
                // sticky row's own rendered height; the max-height cap on
                // the tray's own resulting top and the tabbar's own
                // rendered position, itself only known after that). Persists
                // past the animation (nothing here resets it) so the
                // resting expanded state stays positioned/capped too,
                // letting .filter-bar-collapsible-inner's own overflow-y:
                // auto do the actual scrolling for a field grid taller than
                // the cap - and stays live afterwards too, via the
                // visualViewport listener above, if the browser's own
                // chrome changes size while the tray's still open.
                positionFilterTray(bar, box);
            }
        } else {
            bar.classList.remove('tray-open');
        }
        // Forces the browser to actually commit/resolve the height this
        // class toggle just implied before anything else runs - without
        // this, a transition triggered by toggling .tray-open sometimes
        // never starts at all (confirmed via getAnimations(): 0 running
        // animations, and a stale, pre-toggle computed height still being
        // reported straight after) - a genuine engine quirk specific to
        // interpolate-size: allow-keywords' calc-size()-based auto-height
        // resolution, not anything wrong with the transition/class logic
        // itself. positionFilterTray's own getBoundingClientRect() reads
        // (above) already force this incidentally for an open, but close
        // has no other reason to touch layout at all, so needs it
        // explicitly here too.
        if (box) void box.offsetHeight;
        if (box) {
            // inner's own overflow-y: auto (panel.css) is what makes it
            // scroll once genuinely too tall for the resting, settled state
            // - but for most of the transition (either direction) box's own
            // height is smaller than that settled height, so inner's
            // content overflows its own shrunk bounds the whole way
            // through, however briefly, regardless of whether the resting
            // tray needs to scroll at all (live feedback: "scrollbar
            // briefly shows... tray is not long enough to require
            // scrolling"). Pinned to hidden for the animation's duration
            // only, restored below - box's own max-height (positionFilterTray)
            // still caps the resting state exactly as before, so a tray
            // that genuinely does need to scroll still gets overflow-y:
            // auto back the moment the animation ends.
            if (inner) inner.style.overflowY = 'hidden';
            var cleanupDone = false;
            function cleanup() {
                if (cleanupDone) return;
                cleanupDone = true;
                if (inner) inner.style.overflowY = '';
                // Closing keeps .is-expanded on through the whole animation
                // instead of stripping it up front (live feedback: "reverts
                // back to an old format which is no longer used in any
                // mode") - virtually every mobile-tray style (the 3-up
                // field grid, label backgrounds, the touch scrollbar-hide
                // pair) is scoped to `.filter-bar.is-expanded` in panel.css.
                // Removing the class before the height animation even
                // starts would mean the whole shrink plays out with none of
                // those rules applied - the box visibly falling back to
                // whatever bare, non-mobile styling `.filter-field` etc.
                // have outside that class the entire time it's shrinking,
                // not just a one-frame flash.
                if (!willExpand) {
                    bar.classList.remove('is-expanded');
                    // Clears positionFilterTray's own inline top/left/width/
                    // max-height (above) - live feedback: "I see a line up
                    // and to the left of Filters", only in portrait/narrow-
                    // desktop mode. Those are set once, live, purely to pin
                    // this position: fixed box over the bar's own on-screen
                    // rect WHILE genuinely open - "persists past the
                    // animation (nothing here resets it)" was fine as long
                    // as the box then stayed truly invisible forever after
                    // (height: 0, transparent border), but position: fixed
                    // means that inline top is a frozen VIEWPORT coordinate,
                    // not a position in the page's flow - scrolling the page
                    // afterward moves the real "Filters" row (in normal
                    // flow) out from under where this stale top still
                    // points, so the collapsed box's own (otherwise
                    // harmless) 1px border-bottom ends up floating at
                    // whatever screen position it was last opened at,
                    // wherever that now falls relative to the scrolled
                    // page - exactly reading as a stray misplaced line.
                    // Clearing all four back to the plain CSS rule (left:
                    // 0; right: 0, static-position top) on every close
                    // means a collapsed tray only ever has a genuine,
                    // JS-computed fixed position while a fresh open is
                    // actually reopening it (positionFilterTray runs again
                    // at that point, above).
                    box.style.top = '';
                    box.style.left = '';
                    box.style.width = '';
                    box.style.maxHeight = '';
                }
                box.removeEventListener('transitionend', onTransitionEnd);
            }
            function onTransitionEnd(e) {
                if (e.target !== box || e.propertyName !== 'height') return;
                cleanup();
            }
            box.addEventListener('transitionend', onTransitionEnd);
            // Fallback in case transitionend never fires (box's height
            // genuinely doesn't change - e.g. an empty field grid - so no
            // transition ever actually starts to end) - without this,
            // that edge case would leave .is-expanded stuck on forever
            // once willExpand is false. Read off box's own actual computed
            // transition-duration rather than a hardcoded guess (used to be
            // a flat 400ms, "comfortably" clearing what was then a flat
            // 360ms) - that guess silently went stale the moment box's own
            // transition duration grew to var(--transition-slide-lg)
            // (720ms, doubled again from panel.css/tokens/effects.css) and
            // was never updated alongside it, so this fallback had been
            // firing a full transition-length early on every close for a
            // while: live feedback "The open is perfect, only close is
            // seeing issues" (a border flash, a height snap/stall, section
            // labels vanishing mid-shrink, fields shifting horizontally),
            // confirmed via Playwright sampling - .is-expanded flipped
            // false at t=440ms while the close transition (slowed to 4000ms
            // for the same debugging session) was still running, stripping
            // every is-expanded-gated style (field/label display, the
            // border-bottom-width fade, above) and restoring inner's
            // overflow-y mid-animation, which fed back into corrupting
            // calc-size()'s own live "auto" height recomputation for the
            // rest of the close. Longest of box's own declared durations
            // (height/border-bottom-width share one value today, but this
            // stays correct if that ever changes) plus a small buffer for
            // a slow frame or two, not the duration alone.
            var closeDurations = getComputedStyle(box).transitionDuration.split(',').map(function (s) {
                s = s.trim();
                var n = parseFloat(s) || 0;
                return s.indexOf('ms') !== -1 ? n : n * 1000;
            });
            setTimeout(cleanup, Math.max.apply(null, closeDurations.concat([0])) + 100);
        } else if (!willExpand) {
            bar.classList.remove('is-expanded');
        }
    });

    // Students' mobile filter tray: the sticky header row/footer (above)
    // only get their own divider border while they're actually covering
    // scrolled-past content (live feedback: "the button border should only
    // be visible if there is overflow" - and, for the header row
    // specifically, "when closed I can see the sticky border... the filter
    // bar has a border anyway" - collapsed, the row is the bar's only
    // visible content, sitting flush against .list-card .filter-bar's own
    // existing bottom border (layout.css), so an unconditional border here
    // just doubled it up for no reason, nothing is ever scrolled under a
    // collapsed row). Plain scroll listener on .filter-bar-collapsible-inner
    // (the actual scrolling box), not the .sticky-zone-sentinel/
    // IntersectionObserver convention (setupStickyZoneSentinels, above) -
    // that pattern answers "has this sticky element passed one fixed
    // point," where this needs both ends of a single scrollable box (row:
    // has anything scrolled past the top; footer: is there still anything
    // left below) off the same element's scrollTop/scrollHeight/
    // clientHeight, gated on .is-expanded too since a collapsed tray's
    // scrollTop can be a stale non-zero leftover from before it was closed.
    (function setupFilterBarStickyDividers() {
        document.querySelectorAll('.filter-bar-collapsible-inner').forEach(function (inner) {
            var bar = closest(inner, '.filter-bar');
            if (!bar) return;
            var footer = bar.querySelector('.filter-bar-sticky-footer');
            function update() {
                var expanded = bar.classList.contains('is-expanded');
                // .filter-bar-sticky-row itself no longer gets an is-covering
                // toggle (panel.css) - .list-card .filter-bar's own permanent
                // border-bottom already sits at that exact boundary
                // unconditionally, so a second, JS-driven fade-in border
                // there was just redundant (live feedback: "The filter bar
                // has a permanent bottom border, so the border that fades in
                // when there is overflow is redundant"). Only the footer
                // still needs one - nothing permanent sits at its own
                // boundary the same way.
                if (footer) footer.classList.toggle('is-covering', expanded && inner.scrollTop + inner.clientHeight < inner.scrollHeight - 1);
            }
            inner.addEventListener('scroll', update);
            // Re-check whenever the tray opens/closes - a fresh expand can
            // start at a different scroll position (e.g. after Clear reset
            // it), and content height (so scrollHeight itself, and whether
            // a scrollbar even exists at all) can change between opens too.
            // Deferred to the next frame (not called directly) - a
            // MutationObserver callback fires as a microtask, before the
            // browser has painted anything for the style change that
            // triggered it; update()'s own layout reads (scrollTop/
            // clientHeight/scrollHeight) forced a synchronous layout flush
            // at exactly that moment, which silently killed .filter-bar-
            // collapsible's own slide-open transition (live feedback: "it
            // used to work but has broken from further developing the
            // filters" - this was the regression, not the transition CSS
            // itself) - the browser never got a chance to commit the
            // pre-toggle frame as the transition's starting point.
            new MutationObserver(function () {
                requestAnimationFrame(update);
            }).observe(bar, { attributes: true, attributeFilter: ['class'] });
            update();
        });
    })();

    // Clicking a filter field's own label activates its control the same
    // as clicking the control itself (live feedback: "can clicking on
    // dropdown label also open dropdown or select the toggle - this will
    // help mobile usage") - a plain <label for="..."> already focuses its
    // target natively, but the actual interactive control for an
    // enhanceSelect()'d field is the separate .ui-select-trigger button
    // beside it, not the real <select> the label points at (that one's
    // hidden/inert - see enhanceSelect's own selectEl.tabIndex = -1
    // above), so native label-click behaviour alone never opened anything.
    // Forwarding the click to whichever control the field actually holds
    // (a select's trigger, or a toggle's pill) covers both with one
    // handler, and reads as a much bigger tap target on a touch screen
    // than the control alone.
    document.addEventListener('click', function (e) {
        var label = closest(e.target, '.filter-field label');
        if (!label) return;
        var field = closest(label, '.filter-field');
        var control = field && field.querySelector('.ui-select-trigger, .toggle-pill');
        if (control) control.click();
    });


    // Server-side dashboard filter bars (e.g. SEND & Provision) can opt into
    // AJAX partial-reload instead of a full navigation via
    // data-ajax-target="<selector>" on the <form class="filter-bar">. On
    // change (or a click on .filter-bar-clear inside it), fetches the same
    // URL+querystring with X-Requested-With: XMLHttpRequest — the existing
    // AJAX convention this codebase already uses for modal content (see
    // hubs/inclusion/panel/static/js/panel.js's loadModal(), and the
    // is_ajax checks in hubs/inclusion/panel/views.py) — and the view (see
    // hubs/inclusion/views.py::inclusion_hub) returns just the target's
    // inner HTML fragment instead of the full page. The <form> itself is
    // never touched, only the target, so no re-enhancement of its own
    // selects/dialogs is needed and nothing about it can be left detached.
    // Falls back to a real navigation if the fetch fails — the scroll-restore
    // listener above already covers that path's scroll jump, same as before
    // this existed.
    (function setupAjaxFilterBars() {
        document.querySelectorAll('form.filter-bar[data-ajax-target]').forEach(function (form) {
            var target = document.querySelector(form.dataset.ajaxTarget);
            if (!target) return;
            var pendingController = null;

            function load(url) {
                if (pendingController) pendingController.abort();
                var controller = new AbortController();
                pendingController = controller;
                target.classList.add('is-loading');
                // Students' own dimmed tray backdrop (.filter-bar-overlay,
                // panel.css) lives inside this same target so it visually
                // anchors (position: absolute; inset: 0) against its box -
                // but that means the plain target.innerHTML swap below wipes
                // it out along with the old list every time, and the
                // server's AJAX partial response never re-renders it (that
                // markup isn't part of the swapped fragment) - live
                // feedback: "when I apply a filter, the overlay disappears.
                // It should stay till filter tray is closed". Detached here
                // and reinserted after the swap (below) instead of
                // recreating it from a string - keeps the exact same node,
                // including any inline style state main.js's own filter-bar
                // click handler may have set on it (e.g. transitionDuration,
                // above) rather than starting fresh every filter change.
                // null on any other page using this same AJAX mechanism
                // with no such overlay in its markup - harmless no-op below.
                var overlayEl = target.querySelector('.filter-bar-overlay');
                fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, signal: controller.signal })
                    .then(function (res) {
                        if (!res.ok) throw new Error('Request failed: ' + res.status);
                        return res.text();
                    })
                    .then(function (html) {
                        target.innerHTML = html;
                        if (overlayEl) target.insertBefore(overlayEl, target.firstChild);
                        window.enhanceFormControls(target);
                        target.classList.remove('is-loading');
                        history.replaceState(null, '', url);
                        // Header stat strip (.page-subtitle-stats, e.g.
                        // Students' "240 Students · 59 Referrals · 82
                        // Actions") lives outside the ajax-target, so the
                        // innerHTML swap above never touches it - it'd stay
                        // showing the unfiltered totals after a filter
                        // change (live feedback: "adding filters should
                        // update the stats"). Synced here instead of
                        // duplicating the numbers into the response some
                        // other way: every page using this pattern already
                        // repeats the identical .stats-strip .stat-value
                        // markup inside the swapped fragment (its own
                        // footer stats-strip), in the same order - copy
                        // those freshly-rendered values across by position.
                        // No-op wherever the counts don't match 1:1 (a page
                        // with this filter-bar pattern but no header stat
                        // strip, or a mismatched one).
                        var freshStats = target.querySelectorAll('.stats-strip .stat-value');
                        var headerStats = document.querySelectorAll('.page-subtitle-stats .stat-value');
                        if (freshStats.length && freshStats.length === headerStats.length) {
                            headerStats.forEach(function (el, i) { el.textContent = freshStats[i].textContent; });
                        }
                    })
                    .catch(function (err) {
                        if (err.name === 'AbortError') return;
                        window.location.href = url;
                    });
            }

            function loadCurrent() {
                // form.action (no action="" attribute set) resolves to the
                // *current* document URL, query string included — strip it
                // before appending the freshly-built one, or every change
                // after the first would double up the querystring.
                var baseUrl = form.action.split('?')[0];
                load(baseUrl + '?' + new URLSearchParams(new FormData(form)).toString());
            }

            form.addEventListener('change', function (e) {
                // Text/search fields fire live on 'input' below instead —
                // still reacting to their own 'change' here would just
                // re-run the same query a second time on blur.
                if (e.target.matches('input[type=text], input[type=search]')) return;
                loadCurrent();
            });

            // Live-as-typed search (INT-P4's debounced-search precedent,
            // applied to this page-level filter rather than a picker):
            // 250ms after the last keystroke, not on blur/Enter like a
            // plain 'change' would give a text input. 2-char minimum before
            // querying, same as the picker precedent (panel.js) - a single
            // keystroke doesn't narrow a MAT-wide table meaningfully, it
            // just fires a full server round-trip for no benefit. Clearing
            // back to empty still fires immediately below, to reset the list.
            var searchDebounce = null;
            form.querySelectorAll('input[type=text], input[type=search]').forEach(function (input) {
                input.addEventListener('input', function () {
                    clearTimeout(searchDebounce);
                    if (input.value.trim().length === 1) return;
                    searchDebounce = setTimeout(function () {
                        loadCurrent();
                        // A page-level 'change' listener (e.g. Students'
                        // own refreshFilterBarState, wireFilterBarActiveState
                        // in panel.js) is what recomputes the active-filter
                        // count badge - typing alone never fires a real
                        // 'change' event (only blur/Enter do), so without
                        // this the AJAX result already reflected the typed
                        // search while the badge stayed stuck at whatever it
                        // showed before typing started (live feedback: "it
                        // auto filters but does not count in the badge till
                        // I press enter"). Dispatched on the input itself,
                        // not the form (Clear's own synthetic dispatch,
                        // below, targets the form since nothing there needs
                        // to distinguish it) - bubbling still reaches
                        // Students' own filterBar 'change' listener, but
                        // this file's own AJAX 'change' listener (above)
                        // explicitly skips text/search e.target so it
                        // doesn't also re-run loadCurrent() a second,
                        // redundant time right after the one two lines up.
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }, 250);
                });
            });
            form.addEventListener('click', function (e) {
                var clear = closest(e.target, '.filter-bar-clear');
                if (!clear) return;
                e.preventDefault();
                // Unlike a normal filter change - where the control the user
                // just touched already shows its new value - the AJAX swap
                // only ever replaces the target, never the filter bar itself
                // (see the filter-bar branch of DES-L1), so
                // nothing resets the bar's own controls back to "no filter"
                // on Clear Filters. form.reset() looked like the obvious
                // fix but is wrong here: it restores each control's value at
                // *page load*, and the page was server-rendered with these
                // same filters already applied/selected - so on a page
                // that's showing filtered results, reset() is a no-op.
                // Blank every named control explicitly instead, then refresh
                // anything that mirrors a control's value outside the
                // control itself (an enhanced select's trigger button, a
                // toggle-pill's .on class) since setting .value/.checked
                // directly doesn't touch either of those. Skips
                // [data-not-a-filter] fields (see wireFilterBarActiveState in
                // panel.js) - those aren't a filter to clear, just a value
                // that happens to live in the same bar.
                Array.prototype.forEach.call(form.querySelectorAll('select'), function (s) {
                    if (closest(s, '[data-not-a-filter]')) return;
                    s.value = '';
                    if (s._uiSelect) s._uiSelect.refresh();
                });
                Array.prototype.forEach.call(form.querySelectorAll('input[type=checkbox], input[type=radio]'), function (c) {
                    c.checked = false;
                });
                Array.prototype.forEach.call(form.querySelectorAll('input[type=text], input[type=search]'), function (t) {
                    t.value = '';
                });
                Array.prototype.forEach.call(form.querySelectorAll('.toggle-pill'), function (btn) {
                    var input = btn.parentElement && btn.parentElement.querySelector('input[type=checkbox]');
                    if (!input) return;
                    btn.classList.toggle('on', input.checked);
                    btn.setAttribute('aria-pressed', String(input.checked));
                });
                // Lets any page-level `filterBar.addEventListener('change', ...)`
                // (e.g. wireFilterBarActiveState's refresh(), see panel.js)
                // re-derive the active-field highlighting and count badge
                // from the now-blanked controls, the same way it would after
                // a real user-driven change.
                form.dispatchEvent(new Event('change'));
                load(clear.href);
            });
        });
    })();

    // Auto-enhance every plain select/date/time field already in the page on
    // load (server-rendered pages). AJAX-injected modal content (e.g.
    // hubs/inclusion/static/js/panel.js) isn't in the DOM yet at this point,
    // so it calls window.enhanceFormControls(dialog) itself after injecting.
    window.enhanceFormControls(document);
});

// Custom select / date / time controls — progressive enhancement over a native
// <select>/<input type=date>/<input type=time>: the native element stays in the
// DOM (visually hidden) as the real form field and the single source of truth,
// so `required`/`value`/`form.checkValidity()`/normal POST submission all keep
// working untouched. A custom trigger button + anchored popover (styled like
// .tab-row-more-menu/.side-nav option rows, see style.css) reads/writes that
// native element's value and fires a real `change` event on it whenever the
// user picks something, which is what any existing listener on the form
// reacts to. Top-level (not wrapped in DOMContentLoaded) so these are callable
// as soon as this script has executed, including from content injected later
// by AJAX-loaded modals (e.g. hubs/inclusion/static/js/panel.js).
(function () {
    function closeAllUiPopovers(except) {
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
    function forwardClickThrough(x, y, ownTrigger) {
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

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    // Positions a popover with explicit position:fixed coordinates anchored to
    // the trigger's getBoundingClientRect(), flipping above when there isn't
    // room below and clamping horizontally to the viewport. position:fixed
    // (rather than position:absolute relative to an in-flow ancestor) is
    // deliberate: these popovers live inside a scrollable <dialog>
    // (hubs/inclusion/static/css/panel.css's max-height/overflow-y on
    // dialog.modal-dialog), and an absolutely-positioned descendant of a
    // scroll-clipping ancestor can render outside the modal's visible box
    // once flipped — fixed positioning anchors purely to the viewport and
    // sidesteps that clipping ambiguity entirely. Must run after the
    // popover's content is rendered and made visible (display:none elements
    // report 0 for offsetHeight/offsetWidth), otherwise there's nothing to
    // measure.
    function positionPopover(panel, anchorEl, opts) {
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
        var panelHeight = panel.offsetHeight;
        var spaceBelow = window.innerHeight - rect.bottom;
        var spaceAbove = rect.top;
        var top = (spaceBelow < panelHeight + 12 && spaceAbove > spaceBelow)
            ? rect.top - panelHeight - 4
            : rect.bottom + 4;
        var left = opts.alignRight ? rect.right - panel.offsetWidth : rect.left;
        var maxLeft = window.innerWidth - panel.offsetWidth - 8;
        left = Math.min(Math.max(8, left), Math.max(8, maxLeft));
        panel.style.top = top + 'px';
        panel.style.left = left + 'px';
    }

    // How much wider than the widest option's own text the trigger should
    // be (room for its left/right padding + chevron) and the hard cap beyond
    // which a long option label just gets clipped instead of stretching the
    // control further.
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
    // - everywhere else: sized to the widest *option* (so picking a short
    //   option doesn't narrow the control down enough to clip a longer one
    //   next time it's opened), capped at the generic SELECT_TRIGGER_MAX_WIDTH.
    // An inline min-width always wins over max-width/width: 100% when they
    // conflict, which is exactly why .ui-fused-field and .filter-field each
    // need their own handling rather than the generic one (see grilling
    // session 2026-07-12).
    function resolveTriggerMinWidth(selectEl, trigger) {
        if (selectEl.closest('.ui-fused-field')) return '';
        var font = window.getComputedStyle(trigger).font;
        var filterField = selectEl.closest('.filter-field');
        if (filterField) {
            var label = filterField.querySelector(':scope > label');
            var labelWidth = label ? label.offsetWidth : 0;
            var selectedOpt = selectEl.options[selectEl.selectedIndex];
            var selectedWidth = selectedOpt ? textWidth(selectedOpt.textContent, font) + SELECT_TRIGGER_PADDING : 0;
            return Math.min(Math.max(labelWidth, selectedWidth), FILTER_FIELD_TRIGGER_MAX_WIDTH) + 'px';
        }
        var widest = maxOptionTextWidth(selectEl, font);
        return Math.min(widest + SELECT_TRIGGER_PADDING, SELECT_TRIGGER_MAX_WIDTH) + 'px';
    }

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

    window.enhanceSelect = function (selectEl) {
        if (!selectEl || selectEl._uiSelect) return;

        var wrap = document.createElement('span');
        wrap.className = 'ui-select';
        var trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'ui-select-trigger';
        trigger.disabled = selectEl.disabled;
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
            trigger.textContent = currentLabel();
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
            trigger.style.minWidth = resolveTriggerMinWidth(selectEl, trigger);
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

    var CALENDAR_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '<rect x="4" y="5.5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" />'
        + '<path d="M4 9.5h16M8 3.5v3M16 3.5v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />'
        + '</svg>';
    var CLOCK_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6" />'
        + '<path d="M12 7.5v5l3.5 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />'
        + '</svg>';
    var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }

    window.enhanceDateInput = function (inputEl, opts) {
        if (!inputEl || inputEl._uiDate) return;
        opts = opts || {};

        var wrap = document.createElement('span');
        wrap.className = 'ui-date';
        var fields = document.createElement('span');
        fields.className = 'ui-date-fields';
        var daySelect = document.createElement('select');
        var monthSelect = document.createElement('select');
        var yearSelect = document.createElement('select');
        var calBtn = document.createElement('button');
        calBtn.type = 'button';
        calBtn.className = 'ui-date-calendar-btn btn btn-secondary btn-sm';
        calBtn.innerHTML = CALENDAR_ICON_SVG;
        // A <dialog>, not a popover-attribute div — see the matching comment
        // in enhanceSelect() for why (nested modal dialogs are the
        // reliably-interactive way to stay on top of an open dialog).
        var calPanel = document.createElement('dialog');
        calPanel.className = 'ui-calendar-popover ui-popover';

        inputEl.classList.add('ui-select-native');
        inputEl.parentNode.insertBefore(wrap, inputEl);
        wrap.appendChild(inputEl);
        fields.appendChild(daySelect);
        fields.appendChild(monthSelect);
        fields.appendChild(yearSelect);
        wrap.appendChild(fields);
        wrap.appendChild(calBtn);
        document.body.appendChild(calPanel);
        calPanel.addEventListener('click', function (e) {
            if (e.target !== calPanel) return;
            var x = e.clientX, y = e.clientY;
            calPanel.close();
            forwardClickThrough(x, y, calBtn);
        });

        var today = new Date();
        var nowYear = today.getFullYear();
        var nowMonth = today.getMonth() + 1;

        for (var y = (opts.noPast ? nowYear : nowYear - 1); y <= nowYear + (opts.noPast ? 2 : 1); y++) {
            var yOpt = document.createElement('option');
            yOpt.value = y;
            yOpt.textContent = y;
            yearSelect.appendChild(yOpt);
        }

        // Only relevant when opts.noPast: the current year's month/day lists
        // start at the current month/day instead of January/1st, so a Panel
        // meeting can never be scheduled in the past. Any other (future)
        // year/month is unrestricted.
        function rebuildMonthOptions(selectedMonth) {
            var year = parseInt(yearSelect.value, 10) || nowYear;
            var minMonth = (opts.noPast && year === nowYear) ? nowMonth : 1;
            monthSelect.innerHTML = '';
            for (var m = minMonth; m <= 12; m++) {
                var opt = document.createElement('option');
                opt.value = m;
                opt.textContent = MONTH_NAMES[m - 1];
                monthSelect.appendChild(opt);
            }
            monthSelect.value = Math.max(minMonth, Math.min(selectedMonth || minMonth, 12));
        }

        function rebuildDayOptions(selectedDay) {
            var year = parseInt(yearSelect.value, 10) || nowYear;
            var month = parseInt(monthSelect.value, 10) || 1;
            var max = daysInMonth(year, month);
            var min = (opts.noPast && year === nowYear && month === nowMonth) ? today.getDate() : 1;
            daySelect.innerHTML = '';
            for (var d = min; d <= max; d++) {
                var opt = document.createElement('option');
                opt.value = d;
                opt.textContent = d;
                daySelect.appendChild(opt);
            }
            daySelect.value = Math.max(min, Math.min(selectedDay || min, max));
        }

        function syncFromValue() {
            var parts = (inputEl.value || '').split('-');
            var year = parts.length === 3 ? parseInt(parts[0], 10) : nowYear;
            var month = parts.length === 3 ? parseInt(parts[1], 10) : nowMonth;
            var day = parts.length === 3 ? parseInt(parts[2], 10) : today.getDate();
            if (opts.noPast && year < nowYear) year = nowYear;
            if (!yearSelect.querySelector('option[value="' + year + '"]')) {
                var extra = document.createElement('option');
                extra.value = year; extra.textContent = year;
                yearSelect.insertBefore(extra, yearSelect.firstChild);
            }
            yearSelect.value = year;
            rebuildMonthOptions(month);
            rebuildDayOptions(day);
            [daySelect, monthSelect, yearSelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
        }

        function commit() {
            var year = parseInt(yearSelect.value, 10);
            var month = parseInt(monthSelect.value, 10);
            var day = parseInt(daySelect.value, 10);
            inputEl.value = year + '-' + pad2(month) + '-' + pad2(day);
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        [daySelect, monthSelect, yearSelect].forEach(function (select) {
            select.addEventListener('change', function () {
                if (select === yearSelect) {
                    rebuildMonthOptions(parseInt(monthSelect.value, 10));
                    if (monthSelect._uiSelect) monthSelect._uiSelect.refresh();
                }
                if (select !== daySelect) {
                    rebuildDayOptions(parseInt(daySelect.value, 10));
                    if (daySelect._uiSelect) daySelect._uiSelect.refresh();
                }
                commit();
                renderCalendar();
            });
            window.enhanceSelect(select);
            select.parentNode.classList.add('ui-select--sm');
        });

        function renderCalendar() {
            var year = parseInt(yearSelect.value, 10) || nowYear;
            var month = (parseInt(monthSelect.value, 10) || 1) - 1;
            calPanel.innerHTML = '';
            var header = document.createElement('div');
            header.className = 'ui-calendar-header';
            var prev = document.createElement('button');
            prev.type = 'button'; prev.className = 'btn btn-sm'; prev.textContent = '‹';
            prev.disabled = !!(opts.noPast && year === nowYear && (month + 1) === nowMonth);
            var label = document.createElement('span');
            label.textContent = MONTH_NAMES[month] + ' ' + year;
            var next = document.createElement('button');
            next.type = 'button'; next.className = 'btn btn-sm'; next.textContent = '›';
            prev.addEventListener('click', function (e) {
                e.stopPropagation();
                var d = new Date(year, month - 1, 1);
                if (!yearSelect.querySelector('option[value="' + d.getFullYear() + '"]')) syncYearOption(d.getFullYear());
                yearSelect.value = d.getFullYear();
                rebuildMonthOptions(d.getMonth() + 1);
                rebuildDayOptions(parseInt(daySelect.value, 10));
                [monthSelect, yearSelect, daySelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
                renderCalendar();
            });
            next.addEventListener('click', function (e) {
                e.stopPropagation();
                var d = new Date(year, month + 1, 1);
                if (!yearSelect.querySelector('option[value="' + d.getFullYear() + '"]')) syncYearOption(d.getFullYear());
                yearSelect.value = d.getFullYear();
                rebuildMonthOptions(d.getMonth() + 1);
                rebuildDayOptions(parseInt(daySelect.value, 10));
                [monthSelect, yearSelect, daySelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
                renderCalendar();
            });
            header.appendChild(prev); header.appendChild(label); header.appendChild(next);
            calPanel.appendChild(header);

            var grid = document.createElement('div');
            grid.className = 'ui-calendar-grid';
            ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(function (d) {
                var h = document.createElement('div');
                h.className = 'ui-calendar-dow';
                h.textContent = d;
                grid.appendChild(h);
            });

            var startOffset = new Date(year, month, 1).getDay();
            var max = daysInMonth(year, month + 1);
            var selected = inputEl.value;
            var todayStr = nowYear + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate());

            for (var i = 0; i < startOffset; i++) grid.appendChild(document.createElement('div'));
            for (var day = 1; day <= max; day++) {
                var cellDate = year + '-' + pad2(month + 1) + '-' + pad2(day);
                var cell = document.createElement('div');
                cell.className = 'ui-calendar-day';
                if (cellDate === todayStr) cell.classList.add('is-today');
                if (cellDate === selected) cell.classList.add('is-selected');
                cell.textContent = day;
                if (opts.noPast && cellDate < todayStr) {
                    cell.classList.add('is-past');
                } else {
                    cell.addEventListener('click', function (d) {
                        return function (e) {
                            e.stopPropagation();
                            daySelect.value = d;
                            if (daySelect._uiSelect) daySelect._uiSelect.refresh();
                            commit();
                            renderCalendar();
                            closeAllUiPopovers();
                        };
                    }(day));
                }
                grid.appendChild(cell);
            }
            calPanel.appendChild(grid);

            var footer = document.createElement('div');
            footer.className = 'ui-popover-footer';
            var todayBtn = document.createElement('button');
            todayBtn.type = 'button';
            todayBtn.className = 'ui-popover-footer-link';
            todayBtn.textContent = 'Today';
            todayBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (!yearSelect.querySelector('option[value="' + nowYear + '"]')) syncYearOption(nowYear);
                yearSelect.value = nowYear;
                rebuildMonthOptions(nowMonth);
                rebuildDayOptions(today.getDate());
                [monthSelect, yearSelect, daySelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
                commit();
                renderCalendar();
            });
            footer.appendChild(todayBtn);
            calPanel.appendChild(footer);
        }

        function syncYearOption(year) {
            var extra = document.createElement('option');
            extra.value = year; extra.textContent = year;
            yearSelect.insertBefore(extra, yearSelect.firstChild);
        }

        function toggleCalendar() {
            var isOpen = calPanel.open;
            closeAllUiPopovers(calPanel);
            if (isOpen) {
                calPanel.close();
            } else {
                renderCalendar();
                calPanel.showModal();
                positionPopover(calPanel, calBtn, { alignRight: true });
            }
        }
        calBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleCalendar(); });

        inputEl._uiDate = { refresh: syncFromValue };
        syncFromValue();
    };

    window.enhanceTimeInput = function (inputEl) {
        if (!inputEl || inputEl._uiTime) return;

        var wrap = document.createElement('span');
        wrap.className = 'ui-time';
        var fields = document.createElement('span');
        fields.className = 'ui-time-fields';
        var hourSelect = document.createElement('select');
        var minuteSelect = document.createElement('select');
        var ampmSelect = document.createElement('select');
        ['AM', 'PM'].forEach(function (label) {
            var opt = document.createElement('option');
            opt.value = label; opt.textContent = label;
            ampmSelect.appendChild(opt);
        });
        for (var m = 0; m < 60; m++) {
            var mOpt = document.createElement('option');
            mOpt.value = pad2(m); mOpt.textContent = pad2(m);
            minuteSelect.appendChild(mOpt);
        }
        // Clock button opening a picker popover — a quick way to set a time,
        // alongside (not instead of) the inline Hour/Minute/AM-PM selects,
        // same relationship the calendar-grid popover has to Date's own
        // inline Day/Month/Year selects. The popover is a fresh,
        // independently-rendered picker (see renderTimePopover below), not
        // a relocation of the inline selects — two surfaces, one underlying
        // value.
        var timeBtn = document.createElement('button');
        timeBtn.type = 'button';
        timeBtn.className = 'ui-time-picker-btn btn btn-secondary btn-sm';
        timeBtn.innerHTML = CLOCK_ICON_SVG;
        var timePanel = document.createElement('dialog');
        timePanel.className = 'ui-time-popover ui-popover';

        inputEl.classList.add('ui-select-native');
        inputEl.parentNode.insertBefore(wrap, inputEl);
        wrap.appendChild(inputEl);
        fields.appendChild(hourSelect);
        fields.appendChild(minuteSelect);
        fields.appendChild(ampmSelect);
        wrap.appendChild(fields);
        wrap.appendChild(timeBtn);
        document.body.appendChild(timePanel);
        timePanel.addEventListener('click', function (e) {
            if (e.target !== timePanel) return;
            var x = e.clientX, y = e.clientY;
            timePanel.close();
            forwardClickThrough(x, y, timeBtn);
        });

        // Time format (12h/24h) is a global Settings preference (data-time-format
        // on <html>, see templates/layout.html), not a per-field choice.
        var is12h = document.documentElement.getAttribute('data-time-format') === '12';

        // Hours outside the typical 08:00-17:00 school day are visually
        // muted (see isHourMuted) since they're rarely the right choice for
        // a panel meeting. A 12h hour maps to two different 24h hours
        // depending on AM/PM, so both are stashed on the inline <option>
        // for applyHourMuting to resolve against the current ampmSelect
        // value; the popover's own hour rows resolve the same 24h hour
        // directly from the row's own precomputed value (see
        // renderTimePopover) since they don't have an <option> to stash it on.
        function isHourMuted(hour24) { return hour24 < 8 || hour24 > 17; }

        function rebuildHourOptions() {
            hourSelect.innerHTML = '';
            var max = is12h ? 12 : 23;
            var start = is12h ? 1 : 0;
            for (var h = start; h <= max; h++) {
                var opt = document.createElement('option');
                opt.value = pad2(h); opt.textContent = pad2(h);
                if (is12h) {
                    opt.dataset.hour24Am = h === 12 ? 0 : h;
                    opt.dataset.hour24Pm = h === 12 ? 12 : h + 12;
                } else {
                    opt.dataset.hour24 = h;
                }
                hourSelect.appendChild(opt);
            }
            applyHourMuting();
        }

        function applyHourMuting() {
            Array.prototype.forEach.call(hourSelect.options, function (opt) {
                var hour24 = is12h
                    ? parseInt(ampmSelect.value === 'PM' ? opt.dataset.hour24Pm : opt.dataset.hour24Am, 10)
                    : parseInt(opt.dataset.hour24, 10);
                if (isHourMuted(hour24)) {
                    opt.dataset.muted = '1';
                } else {
                    delete opt.dataset.muted;
                }
            });
        }

        function currentParts() {
            var parts = (inputEl.value || '00:00').split(':');
            return { hour24: parseInt(parts[0], 10) || 0, minute: parts[1] || '00' };
        }

        function syncFromValue() {
            var parts = currentParts();
            rebuildHourOptions();
            if (is12h) {
                var isPM = parts.hour24 >= 12;
                var hour12 = parts.hour24 % 12;
                if (hour12 === 0) hour12 = 12;
                hourSelect.value = pad2(hour12);
                ampmSelect.value = isPM ? 'PM' : 'AM';
            } else {
                hourSelect.value = pad2(parts.hour24);
            }
            minuteSelect.value = parts.minute;
            [hourSelect, minuteSelect, ampmSelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
            if (timePanel.open) renderTimePopover();
        }

        function commit() {
            var minute = minuteSelect.value;
            var hour24;
            if (is12h) {
                var hour12 = parseInt(hourSelect.value, 10);
                var isPM = ampmSelect.value === 'PM';
                hour24 = isPM ? (hour12 === 12 ? 12 : hour12 + 12) : (hour12 === 12 ? 0 : hour12);
            } else {
                hour24 = parseInt(hourSelect.value, 10);
            }
            inputEl.value = pad2(hour24) + ':' + minute;
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        [hourSelect, minuteSelect, ampmSelect].forEach(function (select) {
            select.addEventListener('change', commit);
            window.enhanceSelect(select);
            select.parentNode.classList.add('ui-select--sm');
        });
        // AM/PM alone (without a 12h/24h toggle) changes which 24h hour each
        // option represents, so re-resolve muting and refresh the hour
        // dropdown's rendered rows whenever it changes.
        ampmSelect.addEventListener('change', function () {
            applyHourMuting();
            if (hourSelect._uiSelect) hourSelect._uiSelect.refresh();
        });
        ampmSelect.parentNode.classList.toggle('ui-hidden', !is12h);

        // Writes a 24h hour back onto hourSelect/ampmSelect (wrapping
        // 0-23) — the one place that translates a raw hour24 into the
        // 12h-vs-24h split those two selects actually store, so the spinner
        // arrows/typed input and the Now button all funnel through it
        // instead of re-deriving the split themselves.
        function applyHour24(hour24) {
            hour24 = ((hour24 % 24) + 24) % 24;
            if (is12h) {
                var isPM = hour24 >= 12;
                var hour12 = hour24 % 12; if (hour12 === 0) hour12 = 12;
                hourSelect.value = pad2(hour12);
                ampmSelect.value = isPM ? 'PM' : 'AM';
            } else {
                hourSelect.value = pad2(hour24);
            }
            applyHourMuting();
            if (hourSelect._uiSelect) hourSelect._uiSelect.refresh();
        }

        function applyMinute(minute) {
            minuteSelect.value = pad2(((minute % 60) + 60) % 60);
        }

        // Attached spinner picker ("Enter time"): big Hour:Minute digit
        // boxes stepped by up/down arrows (or typed directly), an AM/PM
        // toggle beside them in 12h mode, and Now/Clear footer actions —
        // mirrors common OS/Material time pickers. Deliberately a different
        // shape from .ui-popover's option-list style (Panel Group/Chair
        // selects, the calendar grid): there's no discrete list of times to
        // browse, so a spinner reads more honestly than a scrollable column
        // of every minute (DES-L1: layout follows what the content forces).
        function renderTimePopover() {
            var parts = currentParts();
            var isPM = parts.hour24 >= 12;
            var hour12 = parts.hour24 % 12; if (hour12 === 0) hour12 = 12;
            timePanel.innerHTML = '';

            var header = document.createElement('div');
            header.className = 'ui-time-spinner-header';
            var headerLabel = document.createElement('span');
            headerLabel.textContent = 'Enter time';
            header.appendChild(headerLabel);
            var closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'ui-time-spinner-close';
            closeBtn.setAttribute('aria-label', 'Close time picker');
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', function (e) { e.stopPropagation(); timePanel.close(); });
            header.appendChild(closeBtn);
            timePanel.appendChild(header);

            var body = document.createElement('div');
            body.className = 'ui-time-spinner-body';

            function buildUnit(label, value, muted, onStep, onType) {
                var unit = document.createElement('div');
                unit.className = 'ui-time-spinner-unit';
                var up = document.createElement('button');
                up.type = 'button';
                up.className = 'ui-time-spinner-arrow ui-time-spinner-arrow--up';
                up.setAttribute('aria-label', 'Increase ' + label);
                up.innerHTML = '&#9650;';
                up.addEventListener('click', function (e) { e.stopPropagation(); onStep(1); });
                var input = document.createElement('input');
                input.type = 'text';
                input.inputMode = 'numeric';
                input.maxLength = 2;
                input.className = 'ui-time-spinner-value' + (muted ? ' muted' : '');
                input.value = value;
                input.addEventListener('click', function (e) { e.stopPropagation(); input.select(); });
                input.addEventListener('change', function () {
                    var n = parseInt(input.value, 10);
                    onType(isNaN(n) ? 0 : n);
                });
                var down = document.createElement('button');
                down.type = 'button';
                down.className = 'ui-time-spinner-arrow ui-time-spinner-arrow--down';
                down.setAttribute('aria-label', 'Decrease ' + label);
                down.innerHTML = '&#9660;';
                down.addEventListener('click', function (e) { e.stopPropagation(); onStep(-1); });
                unit.appendChild(up);
                unit.appendChild(input);
                unit.appendChild(down);
                return unit;
            }

            body.appendChild(buildUnit('hour', pad2(is12h ? hour12 : parts.hour24), isHourMuted(parts.hour24),
                function (delta) {
                    applyHour24(parts.hour24 + delta);
                    commit();
                    renderTimePopover();
                },
                function (n) {
                    var hour24 = is12h ? (n % 12) + (isPM ? 12 : 0) : n;
                    applyHour24(hour24);
                    commit();
                    renderTimePopover();
                }));

            var sep = document.createElement('div');
            sep.className = 'ui-time-spinner-sep';
            sep.textContent = ':';
            body.appendChild(sep);

            body.appendChild(buildUnit('minute', parts.minute, false,
                function (delta) {
                    applyMinute(parseInt(parts.minute, 10) + delta);
                    commit();
                    renderTimePopover();
                },
                function (n) {
                    applyMinute(n);
                    commit();
                    renderTimePopover();
                }));

            if (is12h) {
                var ampmWrap = document.createElement('div');
                ampmWrap.className = 'ui-time-spinner-ampm';
                ['AM', 'PM'].forEach(function (label) {
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'ui-time-spinner-ampm-btn' + ((label === 'PM') === isPM ? ' selected' : '');
                    btn.textContent = label;
                    btn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        ampmSelect.value = label;
                        applyHourMuting();
                        if (hourSelect._uiSelect) hourSelect._uiSelect.refresh();
                        commit();
                        renderTimePopover();
                    });
                    ampmWrap.appendChild(btn);
                });
                body.appendChild(ampmWrap);
            }
            timePanel.appendChild(body);

            var footer = document.createElement('div');
            footer.className = 'ui-popover-footer';
            var nowBtn = document.createElement('button');
            nowBtn.type = 'button';
            nowBtn.className = 'ui-popover-footer-link';
            nowBtn.textContent = 'Now';
            nowBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                var now = new Date();
                inputEl.value = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                syncFromValue();
                renderTimePopover();
            });
            var clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'ui-popover-footer-link';
            clearBtn.textContent = 'Clear';
            clearBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                // "Clear" resets to midnight rather than emptying the native
                // input outright — hourSelect/minuteSelect are plain
                // <select>s with no real "no value" option of their own, so
                // an empty inputEl.value just meant the next syncFromValue()
                // fell back to '00:00' anyway (see currentParts()) while the
                // visible spinner still showed whatever it last rendered,
                // reading as "Clear did nothing."
                inputEl.value = '00:00';
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                syncFromValue();
                renderTimePopover();
            });
            footer.appendChild(nowBtn);
            footer.appendChild(clearBtn);
            timePanel.appendChild(footer);
        }

        function toggleTimePopover() {
            var isOpen = timePanel.open;
            closeAllUiPopovers(timePanel);
            if (isOpen) {
                timePanel.close();
            } else {
                renderTimePopover();
                timePanel.showModal();
                positionPopover(timePanel, timeBtn, { alignRight: true });
            }
        }
        timeBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleTimePopover(); });

        inputEl._uiTime = { refresh: syncFromValue };
        syncFromValue();
        if (!inputEl.value) commit();
    };

    // .ui-fused-field-group aligns its fused fields' labels to one shared,
    // auto-computed column (CSS subgrid — see components/forms.css) when
    // there's room. A single CSS breakpoint can't decide this per-field
    // though (querying an element's own size to decide the very grid span
    // that determines that size is circular, and a shared container query
    // can't let e.g. a long Panel Group value stack while a short Chair
    // value stays aligned in the same narrow column) — so each row's actual
    // available width is measured here instead, and only the rows that don't
    // fit fall back to label-above-field layout independently of their
    // siblings.
    var FUSED_FIELD_HYSTERESIS = 10;

    function evaluateFusedFieldGroup(groupEl) {
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

    window.initFusedFieldStacking = function (root) {
        (root || document).querySelectorAll('.ui-fused-field-group').forEach(function (groupEl) {
            evaluateFusedFieldGroup(groupEl);
            if (typeof ResizeObserver === 'undefined' || groupEl._labeledSelectObserved) return;
            groupEl._labeledSelectObserved = true;
            new ResizeObserver(function () { evaluateFusedFieldGroup(groupEl); }).observe(groupEl);
        });
    };

    // Single entry point for enhancing every select/date/time field under a
    // given root — called for the whole document on page load, and again by
    // AJAX-loaded modals (e.g. panel.js) on the subtree they just injected, so
    // every dropdown in the app gets the same custom-styled treatment without
    // each call site needing to know which fields exist. A date field opts
    // into "no past dates" via `data-no-past` on the <input> rather than a JS
    // option, since this helper has no per-field config of its own.
    window.enhanceFormControls = function (root) {
        (root || document).querySelectorAll('select').forEach(window.enhanceSelect);
        (root || document).querySelectorAll('input[type="date"]').forEach(function (el) {
            window.enhanceDateInput(el, { noPast: el.hasAttribute('data-no-past') });
        });
        (root || document).querySelectorAll('input[type="time"]').forEach(window.enhanceTimeInput);
        window.initFusedFieldStacking(root);
    };
})();

// Generic "select + add button" containers (`.ui-select-row` for a
// side-by-side pair, `.ui-fused-field` for a label+select+button fused
// into one control — both styled in components/forms.css). Any page can
// register a handler here, keyed by the button's `data-add-trigger` value,
// instead of writing its own dialog- or page-scoped click listener — this
// single delegated listener covers every such container on the page,
// including ones injected later into modals.
(function () {
    var CONTAINER_SELECTOR = '.ui-select-row, .ui-fused-field';
    window.uiSelectRowAdders = window.uiSelectRowAdders || {};
    document.addEventListener('click', function (e) {
        var trigger = e.target.closest(CONTAINER_SELECTOR + ' [data-add-trigger]');
        if (!trigger) return;
        var handler = window.uiSelectRowAdders[trigger.dataset.addTrigger];
        if (!handler) return;
        var row = trigger.closest(CONTAINER_SELECTOR);
        handler(row ? row.querySelector('select') : null, trigger);
    });
})();
