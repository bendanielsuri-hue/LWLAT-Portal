/* Opening and closing the filter tray, and the click targets that do it.

   One delegated click handler, not a listener per bar: the label, the
   "View filters" button and [data-filter-bar-close] are all the same gesture,
   and the close button is the same gesture one-directional.

   CLOSING DELIBERATELY KEEPS .is-expanded ON for the whole height animation
   rather than stripping it up front - several tray styles are scoped to
   .filter-bar.is-expanded, so removing it first makes the box visibly fall
   back to non-mobile styling for the entire shrink. The class is cleared on
   transitionend, with a fallback read from the box's own computed
   transition-duration rather than a hardcoded guess, because that guess had
   already gone stale once when the duration grew. */

import { closest } from '../dom.js';
import { positionFilterTray, scrollStickyBarToTop } from './tray-position.js';
import { balanceFilterGroupLabels, setMoreFiltersLabel } from './more-filters.js';
import { groupFilterSections } from './sections.js';
import { wireFilterSectionScroll } from './section-scroll.js';

export function initFilterBarExpandCollapse() {
    // Mobile filter bar collapse (see responsive.css's ≤480px block, #114):
    // tapping the "Filters · count" label toggles `.is-expanded`, which is
    // what actually reveals the fields below that width. No-op above 480px
    // since the CSS there ignores the class and shows fields unconditionally.
    // [data-filter-bar-close] (#133 follow-up, live feedback: "an obvious
    // close") is the same idea but one-directional - always collapses,
    // never toggles open, since a close button's only job is closing.
    document.addEventListener('click', function (e) {
        /* .more-filters-toggle counts as the same trigger as the label now:
           a no-search tray bar keeps View filters on the bar in the tray
           tiers (setupFilterBarMoreFilters), where the tray - not
           secondaryRow - is what opens. Safe to accept unconditionally
           because this handler already returns immediately for any bar that
           isn't in a tray tier (barIsMobile, below), which is exactly where
           the button's own click handler stays in charge. */
        var label = closest(e.target, '.filter-bar-label') || closest(e.target, '.more-filters-toggle');
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
        /* Keep the on-bar View filters/Hide filters button describing the
           tray's real state (a no-search bar shows that pair in the tray
           tiers now - setupFilterBarMoreFilters). Driven from here rather
           than from the button's own click handler because the tray closes
           by routes the button never sees: the Close button and the dimmed
           backdrop both land in this same handler as closeBtn. */
        var trayToggleBtn = bar.querySelector('.more-filters-toggle');
        if (trayToggleBtn) {
            trayToggleBtn.setAttribute('aria-expanded', String(willExpand));
            setMoreFiltersLabel(trayToggleBtn);
        }
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
                // After the labels are split (a label that just gained a
                // second line changes its group's height) and before
                // positionFilterTray, whose max-height cap depends on the
                // row count grouping decides.
                if (window.resyncFilterTriggerWidths) window.resyncFilterTriggerWidths(bar);
                groupFilterSections(bar);
                // Re-measured here too: opening the tray is the first moment
                // these rows have a real width to overflow (#186).
                wireFilterSectionScroll(bar);
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
                // Take the header out of the way before measuring. In this
                // tier the page header scrolls away and the filter bar is
                // sticky to the top of <main>, so the height the tray gets is
                // whatever sits below the bar's CURRENT position - and
                // opening the tray while the page is scrolled to the top
                // spends the header's ~50px on a title you already know
                // instead of on filters (live feedback: "perhaps page can
                // also auto scroll/animate to hide header"). Scrolling <main>
                // by exactly the bar's offset from its top pins the bar at
                // the top and hands that height to the tray. positionFilter-
                // Tray runs immediately on the pre-scroll rect; the smooth
                // scroll then re-anchors and re-caps the tray frame by frame
                // through repositionStickyTrays (the capture scroll listener
                // above), so the tray grows into the space as the header
                // leaves rather than jumping after it.
                scrollStickyBarToTop(bar);
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
                // mode") - several mobile-tray styles (the touch
                // scrollbar-hide pair among them) are scoped to
                // `.filter-bar.is-expanded` in panel.css.
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
}
