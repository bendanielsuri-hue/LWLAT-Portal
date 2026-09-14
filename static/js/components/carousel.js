/* Horizontal carousel: THE one implementation (#214).

   A component: it is wired to an element and knows nothing about what the
   cards contain. ADR 0020's own example of the nature test - a carousel
   does not become domain-specific by being pointed at referrals.

   There were three (main-js-inventory.md section 6): `wireScrollCarousel`
   here, the KPI stats row's, and Panel Home's card-stack carousel. The
   generic one existed and the two richest carousels in the portal each
   bypassed it, so every shared concern - arrow auto-hide, the edge state,
   the wheel redirect, the fades, the drag - was written two or three times
   with three sets of prose explaining the same fixes. This is that code
   once. The drag half is `drag-scroll.js`, the single drag-to-scroll
   implementation the same issue folded six copies into.

   TWO MODES, because the two genuinely differ and neither reduces to the
   other:

   - `mode: 'step'` - a scrolling strip. An arrow press nudges scrollLeft by
     one card plus the gap (or by `scrollTo`, for a track whose items are
     NOT equal width - a filter row, where a toggle sits beside "Concern
     Category", can otherwise leave a dropdown half shown after a press that
     was meant to reveal it). Nothing here needs to know which card, if any,
     is "the" one: the arrows and fades read raw scroll position.
   - `mode: 'card'` - a card stack. An arrow press moves by one INDEX, and
     the carousel always knows which card is nearest the viewport's centre,
     because that card is styled as active (scaled up, front and centre,
     neighbours tucked behind it) and mirrored into dots, a "3 / 12" count
     readout and a live region. A release with real momentum settles on a
     card rather than wherever raw scroll stopped.

   Everything else is shared and the options switch it on: the wheel
   redirect, keyboard paging, the drag, per-end arrow disabling, the fades,
   and the KPI row's "flat" mode (below). A caller turns on what its markup
   has, rather than a fork carrying the parts it doesn't.

   Returns { update, goTo, rebuild }: `update` re-runs just the overflow/
   edge/indicator sync for a caller whose track content changed after setup
   (the filter bar's own remeasure) - re-calling initCarousel on every
   remeasure would stack a fresh duplicate click listener on the same
   prev/next buttons instead. `rebuild` re-derives the visible card set
   (card mode: a tab switch or a delete changes which cards exist). */

import { rafThrottle } from './raf-throttle.js';
import { wireDragToScroll } from './drag-scroll.js';

/* Selectors resolve inside `root` first and fall back to the document,
   because some of this chrome is deliberately NOT inside the carousel wrap
   - Panel Home's dots row, count readout and live region are siblings of
   it, so the wrap can carry the carousel's own overflow without clipping
   them. Passing an element directly works too. */
function resolve(root, ref) {
    if (!ref) return null;
    if (typeof ref !== 'string') return ref;
    return root.querySelector(ref) || document.querySelector(ref);
}

export function initCarousel(root, options) {
    var opts = options || {};
    var track = resolve(root, opts.track);
    if (!root || !track) return null;

    var cardMode = opts.mode === 'card';
    var prev = resolve(root, opts.prev);
    var next = resolve(root, opts.next);
    var fadeL = resolve(root, opts.fadeL);
    var fadeR = resolve(root, opts.fadeR);
    var dotsContainer = resolve(root, opts.dots);
    var countLabel = resolve(root, opts.countLabel);
    var liveRegion = resolve(root, opts.liveRegion);
    var itemLabel = opts.itemLabel || 'Item';
    var dotClass = opts.dotClass || 'carousel-dot';
    /* A dot per card stops being a usable indicator (or a realistic tap
       target) past this many - the "3 / 12" text label carries the signal
       instead once the count exceeds it. */
    var dotThreshold = opts.dotThreshold == null ? 8 : opts.dotThreshold;
    var lastAnnouncedIndex = -1;

    function gap() {
        var style = window.getComputedStyle(track);
        return parseFloat(style.columnGap || style.gap) || 0;
    }

    /* Which cards count. Card mode has to skip the rows a tab filter has
       hidden (style.display: none, not removed) and the layout spacers, or
       every index, dot and count is off. Step mode just measures the first
       card to size one arrow press. */
    function cards() {
        if (opts.visible) return opts.visible(track);
        if (!cardMode) {
            return opts.card
                ? Array.prototype.slice.call(track.querySelectorAll(opts.card))
                : Array.prototype.slice.call(track.children);
        }
        return Array.prototype.filter.call(track.children, function (el) {
            if (el.style.display === 'none') return false;
            if (opts.spacerClass && el.classList.contains(opts.spacerClass)) return false;
            return true;
        });
    }

    function step() {
        var card = cards()[0];
        if (!card) return track.clientWidth;
        return card.getBoundingClientRect().width + gap();
    }

    /* card.offsetLeft is relative to card.offsetParent, which for these
       carousels is the wrap (the nearest positioned ancestor), NOT the
       track - a different coordinate origin than the track's own
       scrollLeft/clientWidth. Mixing the two threw every distance below off
       by a constant (live feedback: the page loaded straight onto "2 / 4"
       with card 2 active, because offsetLeft read ~59px short of the
       track's own left edge). getBoundingClientRect diffed against the
       track's own rect, plus scrollLeft (rects are scroll-dependent where
       offsetLeft isn't), is the card's true position in the track's
       coordinate space regardless of offsetParent. */
    function cardLeft(card) {
        return card.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
    }

    function centreTarget(card) {
        return cardLeft(card) - (track.clientWidth - card.offsetWidth) / 2;
    }

    function nearestTo(centre, list) {
        var closest = 0;
        var closestDist = Infinity;
        list.forEach(function (card, i) {
            var dist = Math.abs((cardLeft(card) + card.offsetWidth / 2) - centre);
            if (dist < closestDist) { closestDist = dist; closest = i; }
        });
        return closest;
    }

    function activeIndex() {
        var list = cards();
        return { cards: list, index: nearestTo(track.scrollLeft + track.clientWidth / 2, list) };
    }

    /* Explicit scrollLeft, not card.scrollIntoView({inline: 'center'}) -
       scrollIntoView only scrolls the MINIMUM needed to satisfy its own "is
       this already visible" heuristic, which doesn't know two overlapping
       cards (the stack effect) are meant to trade places. It can decide the
       target is already visible enough mid-stack and never scroll at all
       (confirmed empirically: scrollLeft unchanged after the call). */
    function goTo(index, focusCard) {
        var list = cards();
        var card = list[index];
        if (!card) return;
        track.scrollTo({ left: centreTarget(card), behavior: 'smooth' });
        /* Focus is skipped for the initial/reset call: autofocus on page
           load, or on a tab switch the user didn't ask to navigate away
           from, is a worse surprise than not moving focus at all. */
        if (focusCard) card.focus({ preventScroll: true });
    }

    /* "Fits without scrolling", independent of the carousel's own edge
       inset - that inset forces scrollWidth to overflow on its own, which
       makes a plain scrollWidth/clientWidth comparison useless for deciding
       WHETHER TO CARRY THE INSET AT ALL. Sums each card's own offsetWidth
       plus the row's real gaps against clientWidth, which stays ~constant
       whichever mode's padding is currently applied (padding eats the
       content box, it doesn't change the track's outer width).

       `flat.notWhen` is a media query the caller owns (the KPI row passes
       the narrow tier): shrinking the cards below it makes all six
       technically fit unwrapped, which this correctly detects and would
       switch to grid mode over - but that's the wrong call at that width.
       Grid mode is for a couple of KPI cards on a wide desktop screen where
       scrolling would be silly, not for phone/tablet, where the carousel is
       the deliberately-built experience. */
    function fitsFlat() {
        if (!opts.flat) return false;
        if (opts.flat.notWhen && opts.flat.notWhen.matches) return false;
        var list = cards();
        if (list.length < 2) return true;
        var total = gap() * (list.length - 1);
        list.forEach(function (card) { total += card.offsetWidth; });
        return total <= track.clientWidth + 1;
    }

    function setFades(hideL, hideR) {
        if (fadeL) fadeL.style.opacity = hideL ? 0 : 1;
        if (fadeR) fadeR.style.opacity = hideR ? 0 : 1;
    }

    function update() {
        if (opts.flat) {
            var flat = fitsFlat();
            root.classList.toggle(opts.flat.className || 'is-flat', flat);
            if (flat) {
                /* Grid mode: every card is visible at once, so there is
                   nothing left for arrows or fades to drive. */
                if (prev) prev.hidden = true;
                if (next) next.hidden = true;
                setFades(true, true);
                return;
            }
        }

        var overflowing = track.scrollWidth > track.clientWidth + 1;
        var atStart;
        var atEnd;
        var list;
        var index = 0;

        if (cardMode) {
            var active = activeIndex();
            list = active.cards;
            index = active.index;
            atStart = index === 0;
            atEnd = index === list.length - 1;
        } else {
            var maxScroll = track.scrollWidth - track.clientWidth;
            atStart = track.scrollLeft <= 1;
            atEnd = track.scrollLeft >= maxScroll - 1;
        }

        if (prev) prev.hidden = !overflowing;
        if (next) next.hidden = !overflowing;
        if (opts.disableArrowsAtEdges) {
            if (prev) prev.disabled = atStart;
            if (next) next.disabled = atEnd;
        }
        setFades(!overflowing || atStart, !overflowing || atEnd);

        /* Grab cursor only advertises drag when there is actually something
           to drag - an unaffordanced default cursor on a fully-visible
           track would be a lie. Opt-in rather than on wherever drag is,
           because only the step-mode strips ever styled it: turning it on
           for the KPI row and the card stack would newly paint a grab
           cursor over cards that have never had one, which is a visual
           change no one asked for and not this issue's business. */
        if (opts.grabCursor) track.classList.toggle('is-draggable', overflowing);

        /* is-at-edge (live feedback, the filter category strip: "They also
           cover up the first and last dropdown if scrolled all the way. Can
           the arrow fade to nothing if scrolled all the way?") - a track
           scrolled fully to one end has nothing left for that end's arrow
           to do, so it just sits there obscuring the now-fully-revealed
           first/last card. No CSS keys off this any more (the strip that
           asked for it wraps instead of scrolling now), but the state is
           real and correct, so a future arrow that wants to fade at the
           ends has the hook waiting. */
        if (overflowing && !opts.disableArrowsAtEdges) {
            if (prev) prev.classList.toggle('is-at-edge', atStart);
            if (next) next.classList.toggle('is-at-edge', atEnd);
        }

        if (!cardMode) return;

        /* Raises whichever card is nearest the viewport's centre above its
           neighbours - the stack effect: the active card scales up front
           and centre while its neighbours shrink, dim and tuck behind it.
           --dist (signed) drives left/right-specific transforms where a
           variant wants them; --absdist (unsigned) drives symmetric ones.
           z-index capped at 10 (was 100) - the fades, arrows and the
           carousel-filter dropdown sit at fixed z-indexes above this range
           on purpose, and a card near either edge used to outrank them
           outright, covering the arrow (reading as "disabled") or rendering
           over the dropdown. */
        list.forEach(function (card, i) {
            card.classList.toggle('is-active', i === index);
            var dist = i - index;
            card.style.setProperty('--dist', dist);
            card.style.setProperty('--absdist', Math.abs(dist));
            card.style.zIndex = String(Math.max(1, 10 - Math.abs(dist)));
        });

        if (dotsContainer) {
            dotsContainer.querySelectorAll('.' + dotClass).forEach(function (dot, i) {
                var isActive = i === index;
                dot.classList.toggle('active', isActive);
                dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
        }

        if (countLabel && list.length > 1) {
            countLabel.textContent = (index + 1) + ' / ' + list.length;
            countLabel.classList.add('has-cards');
            countLabel.classList.toggle('many-cards', list.length > dotThreshold);
        } else if (countLabel) {
            countLabel.classList.remove('has-cards', 'many-cards');
        }

        if (liveRegion && list.length > 1 && index !== lastAnnouncedIndex) {
            lastAnnouncedIndex = index;
            liveRegion.textContent = itemLabel + ' ' + (index + 1) + ' of ' + list.length;
        }
    }

    /* Rebuilds the dots to match whichever cards are CURRENTLY visible -
       one dot per card, none at all for 0-1 (nothing to page through).
       resetScroll re-centres on the first card, which a tab switch wants
       (the old scroll position belongs to a different card set) and a
       delete does not (the remaining cards' order is still valid). */
    function rebuild(resetScroll) {
        if (!cardMode) { update(); return; }
        var list = cards();
        if (opts.onRebuild) opts.onRebuild(list);

        if (resetScroll && list[0]) {
            /* Deferred one frame rather than read synchronously: rebuild
               runs straight out of the tab row's own initial apply, before
               the browser has necessarily finished a first real layout pass
               on these auto-width flex cards. Reading offsetLeft/offsetWidth
               that early can catch them mid-resolution (still 0, or a stale
               intrinsic value) and compute a centering target that is wrong
               - reachable by scrolling later, but not actually centred on
               load (live feedback: "first card is not centred but can be
               navigated to"). */
            requestAnimationFrame(function () {
                track.scrollTo({ left: centreTarget(list[0]) });
                update();
            });
        }

        if (dotsContainer) {
            dotsContainer.innerHTML = '';
            if (list.length > 1 && list.length <= dotThreshold) {
                list.forEach(function (card, i) {
                    var dot = document.createElement('button');
                    dot.type = 'button';
                    dot.setAttribute('role', 'tab');
                    dot.className = dotClass + (i === 0 ? ' active' : '');
                    dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
                    dot.setAttribute('aria-label', 'Go to ' + itemLabel.toLowerCase() + ' ' + (i + 1) + ' of ' + list.length);
                    dot.addEventListener('click', function () {
                        track.scrollTo({ left: centreTarget(card), behavior: 'smooth' });
                        card.focus({ preventScroll: true });
                    });
                    dotsContainer.appendChild(dot);
                });
            }
        }
        update();
    }

    function nudge(direction) {
        if (cardMode) { goTo(activeIndex().index + direction, true); return; }
        if (opts.scrollTo) { opts.scrollTo(track, direction); return; }
        track.scrollBy({ left: direction * step(), behavior: 'smooth' });
    }

    if (prev) prev.addEventListener('click', function () { nudge(-1); });
    if (next) next.addEventListener('click', function () { nudge(1); });
    track.addEventListener('scroll', update, { passive: true });

    if (cardMode) {
        /* Re-centred outright on resize, not just re-synced: a resize or
           orientation change can leave the active card off-centre at the
           new width, so re-running the indicators around a now-stale scroll
           position would describe a layout that isn't there. Instant, no
           smooth - this is a correction, not a navigation. */
        window.addEventListener('resize', function () {
            goTo(activeIndex().index, false);
            update();
        });
    } else {
        window.addEventListener('resize', rafThrottle(update));
    }

    if (opts.keyboard) {
        /* Left/Right pages whenever focus is anywhere inside the carousel
           (a card, an arrow). The arrows have their own click handlers, so
           this mostly matters for a focused card. */
        root.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowRight') { e.preventDefault(); nudge(1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1); }
        });
    }

    if (opts.wheel) {
        /* A mouse wheel only ever reports deltaY, so without this a
           horizontal-only track (nothing to scroll vertically) ignores the
           user's wheel entirely and the arrows/drag are the only way to
           move it. Redirects vertical wheel input into horizontal scroll,
           the same convention browsers use for a horizontal overflow-x
           region themselves. Only when deltaY actually dominates deltaX - a
           trackpad's real two-finger horizontal swipe already reports
           deltaX and should pass through untouched rather than be doubled.
           { passive: false } so preventDefault can stop the page itself
           from scrolling vertically while this redirects it. */
        track.addEventListener('wheel', function (e) {
            if (track.scrollWidth <= track.clientWidth) return;
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
            track.scrollLeft += e.deltaY;
            e.preventDefault();
        }, { passive: false });
    }

    var dragController = null;
    if (opts.drag !== false) {
        var dragOpts = Object.assign({}, opts.drag || {});
        if (opts.flat) {
            dragOpts.enabled = function () {
                return !root.classList.contains((opts.flat && opts.flat.className) || 'is-flat');
            };
        }
        if (opts.fling) {
            dragOpts.trackVelocity = true;
            dragOpts.onDragEnd = function (el, velocity) {
                /* Distance capped to 1.5 cards - a hard flick shouldn't be
                   able to rocket past several at once. Projects where the
                   fling would land and hands off to goTo for whichever card
                   ends up nearest that point. There is no CSS scroll-snap
                   here (deliberately: a snap point catching mid-flick felt
                   bad), but a release with real momentum still wants to
                   finish centred on a card rather than wherever the raw
                   scroll happened to stop (live feedback: "on release can
                   the active card transition to center position"). */
                var distance = 0;
                if (Math.abs(velocity) > 0.05) {
                    var cap = step() * 1.5;
                    distance = Math.max(-cap, Math.min(cap, velocity * 220));
                }
                goTo(nearestTo(track.scrollLeft + distance + track.clientWidth / 2, cards()), false);
            };
        }
        dragController = wireDragToScroll(track, dragOpts);
    }

    /* Tapping a card that is only PEEKING (not the centred one) advances to
       it instead of letting the tap through: you can see a sliver of it, so
       acting on it outright isn't what the tap meant - bringing it properly
       into view is. Gated on the caller's own media query, because the
       behaviour only makes sense in carousel mode; wired unconditionally
       once and checked per click, it silently swallowed every desktop click
       before the row's own selection handler could see it (live feedback:
       "the active row does not seem to change when a different row is
       selected"). Capture phase, on the same element the list's selection
       handler listens on, which is also where the post-drag click has to be
       swallowed - so this carousel runs drag-scroll with suppressClick off
       and does both here rather than have two suppressors fight. */
    if (cardMode && opts.tapNeighbour) {
        track.addEventListener('click', function (e) {
            if (opts.tapNeighbour.when && !opts.tapNeighbour.when()) return;
            if (dragController && dragController.hasDragged()) {
                e.preventDefault();
                e.stopPropagation();
                dragController.clearDragged();
                return;
            }
            /* A real control (Edit/Delete, the row-remove form) always gets
               its own click through untouched, active card or not - the
               hijack below is only ever meant for taps on a card's passive
               area (thumb, text, background). Missed originally when
               peeking cards showed a bare sliver with no controls to hit by
               accident; auto-width cards now show full cards side by side,
               so a tap meant for a neighbour's own Edit/Delete was being
               swallowed before it reached the button. */
            if (opts.tapNeighbour.ignoreSelector && e.target.closest(opts.tapNeighbour.ignoreSelector)) return;
            var item = e.target.closest(opts.tapNeighbour.itemSelector || 'li');
            if (!item || (opts.spacerClass && item.classList.contains(opts.spacerClass))) return;
            var list = cards();
            var idx = list.indexOf(item);
            if (idx === -1 || idx === activeIndex().index) return;
            e.preventDefault();
            e.stopPropagation();
            goTo(idx, true);
        }, true);
    }

    if (cardMode) rebuild(true);
    else update();

    return { update: update, goTo: goTo, rebuild: rebuild };
}
