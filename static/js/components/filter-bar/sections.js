/* A filter bar's sections: grouping fields under their captions, and the
   horizontal scrolling within each group's row of fields.

   ONE MODULE BECAUSE THE TWO ARE ONE OPERATION. Grouping builds the
   .filter-group / .filter-group-fields wrappers; the scroll wiring measures
   the tracks those wrappers create, so it can only ever run after grouping
   has settled - and every caller needs both, in that order, on the same bar.
   While they were two modules that rule was a comment repeated at each of
   three call sites. It is the body of resyncFilterSections() now, where no
   caller can get it wrong.

   Idempotent in both directions, which is what lets callers re-run it on
   every mode change, resize and tray open rather than tracking what has
   already been done. */

import { wireScrollCarousel } from '../carousel.js';

/* Bring a bar's sections back in step with whatever just changed - a resize
   across a tier boundary, a reclaim in measure(), a tray opening for the
   first time. Callers re-run this rather than deciding whether it is needed:
   both halves handle already-being-in-the-right-state as a no-op. */
export function resyncFilterSections(bar) {
    groupFilterSections(bar);
    wireFilterSectionScroll(bar);
}

/* Wraps each section's fields into the same .filter-group /
   .filter-group-fields pair measure() (more-filters.js) already builds, or
   unwraps them again.

   This is what makes a section behave as ONE unit: a group is a single
   flex item, so it packs onto a line beside its neighbours and wraps whole
   when it doesn't fit, instead of every caption forcing a full-width break
   regardless of how little sits under it.

   It also settles the caption's position for free. The wrappers let
   panel.css use flex-direction: column-reverse, desktop's own mechanism
   for "caption under its fields" - so the template keeps authoring the
   label first (which is the right reading order) and nothing has to move in
   the DOM, by hand or otherwise.

   Both directions are lossless: wrapping reads a label's fields as the
   siblings following it up to the next label, unwrapping puts label and
   fields back in that same flat order. So toggling repeatedly can't
   accumulate wrappers or drift the order.

   Top level, not inside the DOMContentLoaded sweep: setupFilterBarMoreFilters'
   own measure() has to re-run it after reclaiming every field, and that
   function is top level too. */
function groupFilterSections(bar) {
    var inner = bar.querySelector('.filter-bar-collapsible-inner');
    if (!inner) return;
    // Every tier whose fields live in the tray, with no width gate of its
    // own. panel.css's sections rules carry no @media either - a rule that
    // cannot match a 390px viewport is what singles out phone portrait and
    // leaves it unwrapped. Keep both halves ungated together.
    // Still runs in both directions: measure() can reclaim every field, and
    // a resize can cross that boundary either way with the tray open.
    var root = document.documentElement;
    var wantGroups = root.classList.contains('phone-chrome-side') ||
        root.classList.contains('filter-bar-mobile-mode');
    // The class panel.css keys the whole sections rule set on: "this box
    // renders the sections layout". Set on the HOST rather than per group,
    // and independently of whether any .filter-section-label exists - a bar
    // with no captions to group still needs the field/label/trigger half of
    // that rule set.
    inner.classList.toggle('filter-bar-sections', wantGroups);
    var existing = inner.querySelectorAll(':scope > .filter-group');
    if (!wantGroups) {
        Array.prototype.forEach.call(existing, function (group) {
            var label = group.querySelector(':scope > .filter-section-label');
            var fieldsBox = group.querySelector(':scope > .filter-group-fields');
            if (label) inner.insertBefore(label, group);
            if (fieldsBox) {
                while (fieldsBox.firstChild) inner.insertBefore(fieldsBox.firstChild, group);
            }
            group.remove();
        });
        return;
    }
    if (existing.length) return;
    Array.prototype.forEach.call(inner.querySelectorAll(':scope > .filter-section-label'), function (label) {
        var group = document.createElement('div');
        group.className = 'filter-group';
        var fieldsBox = document.createElement('div');
        fieldsBox.className = 'filter-group-fields';
        inner.insertBefore(group, label);
        group.appendChild(label);
        /* The FIELDS up to the next caption belong to this one - the run ends
           at anything that is NOT a .filter-field, not merely at the next
           caption. Ending it only on a caption lets the last category swallow
           whatever else follows the fields inside
           .filter-bar-collapsible-inner, and both the .filter-secondary-
           fields panel and the tray's sticky footer are siblings there.
           Nothing looks wrong until the next measure(), whose reclaim calls
           fieldsHost.insertBefore(field, secondaryRow): with secondaryRow now
           buried inside a .filter-group-fields box rather than being
           fieldsHost's own child, that throws NotFoundError and abandons
           measure() one line after it has hidden the "View filters" button
           and several before the line that shows it again.

           Read before any of it moves, since moving changes
           nextElementSibling. */
        var members = [];
        for (var el = group.nextElementSibling; el; el = el.nextElementSibling) {
            if (!el.classList.contains('filter-field')) break;
            members.push(el);
        }
        members.forEach(function (el) { fieldsBox.appendChild(el); });
        group.appendChild(fieldsBox);
    });
}


/* Nothing here is tiered by width. A track that fits shows no fade, no
   arrows and does not scroll, at any width - which is what a bar with three
   filters (Meetings, the SEND & Provision hub) gets for free. What decides
   the layout is which host rendered the sections (.filter-bar-sections) and
   whether that particular track measures as overflowing.

   Why sections scroll rather than wrap: docs/adr/0018. */
function filterSectionTracks(bar) {
    return bar.querySelectorAll('.filter-bar-collapsible-inner.filter-bar-sections .filter-group-fields');
}
function sectionScrollItems(track) {
    return Array.prototype.slice.call(track.querySelectorAll(':scope > .filter-field'));
}
/* What the arrows and the "can scroll" state hang off: the section. */
function filterSectionScrollHost(track) {
    return track.closest('.filter-group');
}
/* How wide the fade is, read back off the track's own custom property so the
   stylesheet stays the single source of truth: the mask gradients, this
   stepper and scroll-padding-inline all have to agree about where "clear of
   the fade" is, or an arrow press lands a field underneath the very gradient
   that advertised it. */
function filterSectionFade(track) {
    var v = parseFloat(window.getComputedStyle(track).getPropertyValue('--filter-scroll-fade'));
    return isFinite(v) ? v : 28;
}
/* One arrow press = "show me the item I can only half see".

   Not wireScrollCarousel's own default step of one card width: that is exact
   for a carousel of identical cards and lands mid-field here, where a toggle
   sits beside "Concern Category". The landing is inset by the fade at
   whichever end the item arrives, the same inset scroll-padding-inline hands
   the browser. */
function stepFilterSectionScroll(track, direction) {
    var trackRect = track.getBoundingClientRect();
    var pad = filterSectionFade(track);
    var left = trackRect.left + pad;
    var right = trackRect.right - pad;
    var found = null;
    var list = sectionScrollItems(track);
    if (direction > 0) {
        for (var i = 0; i < list.length; i++) {
            var r = list[i].getBoundingClientRect();
            if (r.right > right + 1) { found = r.left - left; break; }
        }
    } else {
        for (var j = list.length - 1; j >= 0; j--) {
            var pr = list[j].getBoundingClientRect();
            if (pr.left < left - 1) { found = pr.right - right; break; }
        }
    }
    if (found === null) found = direction * track.clientWidth;
    scrollFilterSectionBy(track, found);
}
function scrollFilterSectionBy(track, delta) {
    var max = track.scrollWidth - track.clientWidth;
    track.scrollTo({ left: Math.max(0, Math.min(max, track.scrollLeft + delta)), behavior: 'smooth' });
}
/* Hover a partly-hidden item and it brings itself fully into view, moving by
   the MINIMUM needed - so it slides toward the pointer rather than out from
   under it, and a track with nothing cut never moves at all. Minimum, not a
   proximity pan: anything that moves content under a stationary mouse makes
   a dropdown near the edge run away from the pointer aiming at it.

   The delay stops a sweep across the track triggering anything; the cooldown
   stops the smooth scroll chaining, since other cut items pass under the
   stationary pointer as the track moves and would each ask for their turn.
   Mouse only - touch already has the swipe. */
var FILTER_SECTION_HOVER_MS = 150;
var FILTER_SECTION_HOVER_COOLDOWN_MS = 320;
function revealFilterSectionItem(track, item) {
    var trackRect = track.getBoundingClientRect();
    var pad = filterSectionFade(track);
    var r = item.getBoundingClientRect();
    var delta = 0;
    if (r.right > trackRect.right - pad + 1) delta = r.right - (trackRect.right - pad);
    else if (r.left < trackRect.left + pad - 1) delta = r.left - (trackRect.left + pad);
    if (!delta) return false;
    scrollFilterSectionBy(track, delta);
    return true;
}
/* The fade goes on whichever end still has travel. A mask, not a gradient
   overlay: the track is transparent over the tray's own fill, so an overlay
   would have to know that colour and would draw a hard edge the moment a
   theme changed it - masking fades the content itself instead. */
function updateFilterSectionScroll(track) {
    var host = filterSectionScrollHost(track);
    var max = track.scrollWidth - track.clientWidth;
    var can = max > 1;
    var more = { left: can && track.scrollLeft > 1, right: can && track.scrollLeft < max - 1 };
    if (host) host.classList.toggle('filter-scroll-active', can);
    track.classList.toggle('filter-scroll-more-left', more.left);
    track.classList.toggle('filter-scroll-more-right', more.right);
    if (!host) return;
    /* Each arrow disables at its own end of the travel. Disabled rather than
       hidden: a pair that disappears makes the caption row twitch its width
       every time you reach an end. wireScrollCarousel's own updateArrows
       handles the other axis of this - hiding BOTH when the track does not
       overflow at all - but it has no opinion on per-end state beyond an
       is-at-edge class nothing styles, so the disabling lives here. */
    var prev = host.querySelector('.filter-scroll-arrow[data-filter-scroll-arrow="prev"]');
    var next = host.querySelector('.filter-scroll-arrow[data-filter-scroll-arrow="next"]');
    if (prev) prev.disabled = !more.left;
    if (next) next.disabled = !more.right;
}
/* Arrows are built once per track and left in place; wireScrollCarousel's own
   updateArrows hides them again whenever the track stops overflowing.
   Everything they then do - drag-to-scroll, the vertical-wheel-to-horizontal
   redirect, the auto-hide, the edge state - comes from that shared helper
   rather than a fourth copy of the same logic, which its own comment asks
   for. */
function wireFilterSectionScroll(bar) {
    Array.prototype.forEach.call(filterSectionTracks(bar), function (track) {
        var host = filterSectionScrollHost(track);
        if (!host) return;
        if (!track.dataset.filterScrollBound) {
            track.dataset.filterScrollBound = '1';
            track.addEventListener('scroll', function () { updateFilterSectionScroll(track); }, { passive: true });
            var hoverTimer = null;
            var hoverUntil = 0;
            track.addEventListener('pointerover', function (e) {
                if (e.pointerType !== 'mouse') return;
                if (track.scrollWidth - track.clientWidth <= 1) return;
                var item = e.target.closest && e.target.closest('.filter-field');
                if (!item || item.parentNode !== track) return;
                window.clearTimeout(hoverTimer);
                if (Date.now() < hoverUntil) return;
                hoverTimer = window.setTimeout(function () {
                    if (revealFilterSectionItem(track, item)) {
                        hoverUntil = Date.now() + FILTER_SECTION_HOVER_COOLDOWN_MS;
                    }
                }, FILTER_SECTION_HOVER_MS);
            });
            track.addEventListener('pointerleave', function () { window.clearTimeout(hoverTimer); });
        }
        // The caption row (.filter-group's other child), where an arrow at
        // each end lands in chrome that already exists, costs the fields row
        // no width and never covers a control.
        var mount = host.querySelector(':scope > .filter-section-label');
        if (mount && !mount.querySelector('.filter-scroll-arrow')) {
            ['prev', 'next'].forEach(function (dir) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'filter-scroll-arrow';
                btn.dataset.filterScrollArrow = dir;
                btn.setAttribute('aria-label', (dir === 'prev' ? 'Previous' : 'More') + ' filters in this section');
                btn.textContent = dir === 'prev' ? '‹' : '›';
                if (dir === 'prev') mount.insertBefore(btn, mount.firstChild);
                else mount.appendChild(btn);
            });
            host._filterScrollUpdate = wireScrollCarousel(
                host,
                ':scope > .filter-group-fields',
                '.filter-field',
                '.filter-scroll-arrow[data-filter-scroll-arrow="prev"]',
                '.filter-scroll-arrow[data-filter-scroll-arrow="next"]',
                { scrollTo: stepFilterSectionScroll }
            );
        }
        if (host._filterScrollUpdate) host._filterScrollUpdate();
        updateFilterSectionScroll(track);
    });
}
