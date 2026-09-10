/* Horizontal scrolling within one filter section's row of fields.

   A section's fields never wrap - they sit on one line that scrolls, with a
   fade at whichever end still has travel, and arrows built once per track.
   Deliberately not wireScrollCarousel's arrows: this scrolls a half-visible
   FIELD into view rather than nudging by a fixed card width. */

import { wireScrollCarousel } from '../carousel.js';

/* #186: a filter section's fields never wrap - they sit on one line that
   scrolls horizontally - and this is the measuring half of that.

   Two kinds of track, one mechanism. In the TRAY each section owns its own
   fields row and that row scrolls; at wide desktop the "View filters" panel
   is a single line of categories and the strip itself scrolls. Both get the
   same edge fade, the same prev/next pair, the same drag/wheel handling and
   the same hover-to-reveal - only what counts as an "item" differs, which is
   why sectionScrollItems() exists rather than two near-copies of all this.

   Nothing here is tiered by width. A track that fits shows no fade, no
   arrows and does not scroll, at any width - which is what a bar with three
   filters (Meetings, the SEND & Provision hub) gets for free. What decides
   the layout is which host rendered the sections (.filter-bar-sections,
   #185) and whether that particular track measures as overflowing.

   Why scroll at all: a wrapped section leaves dead space beside a ragged
   last line (at 390px, Referral wrapped 4 + 1 and left "Overdue Actions"
   alone with two thirds of a row empty), and a trigger that grew to fit a
   long value reflowed every field after it onto new lines. One line that
   scrolls has neither failure mode. See #186 for the alternatives tried
   against the real page and rejected. */
/* (#187) One kind of track now: a section's own fields row, in the tray.
   There were two - the "View filters" panel's single line of categories
   scrolled as a strip - and this module carried an item-type parameter so
   one mechanism could serve both. Every width uses the tray since #187, so
   the panel, its strip and that parameter are gone. See docs/adr/0018. */
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
   under it, and a track with nothing cut never moves at all. (An earlier
   proximity version - pointer near the end of a track pans it, faster the
   closer in - was rejected on the page for exactly that: it moved content
   under a stationary mouse, so a dropdown near the edge ran away from the
   pointer aiming at it. See #186.)

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
export function wireFilterSectionScroll(bar) {
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
