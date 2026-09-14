/* Pointer drag-to-scroll: THE one implementation (#214).

   There were six (main-js-inventory.md section 6 counted them): the
   carousel's own, the facts strip's, the overflow tab row's, the KPI stats
   row's, and the two hand-rolled ones in Panel Home's referral/action
   carousels. Every one was the same pointerdown / threshold /
   setPointerCapture / suppress-the-trailing-click shape, and three of them
   had independently rediscovered the same two bugs - a drag over a
   role="button" row firing a click on release, and preventDefault on every
   pointerdown breaking focus on the controls inside. Three sites, three
   prose explanations, one bug. This is that code once, with the places the
   six genuinely disagreed turned into options rather than forks.

   What each caller actually differed on, and which option carries it:

   - touch or not. Everything sitting in an `overflow-x: auto` region gets
     native momentum panning from the browser for free, so adding pointer
     handling for touch would only fight it - the default excludes touch.
     The overflow tab row opts in (`touch: true`) because devtools mobile
     emulation and non-touch trackpads never get that native touch-scroll.
   - whether the threshold gates the scrolling too, or only the click
     suppression (`moveBeforeThreshold`). The tab row starts moving from the
     first pixel; every carousel waits for a real drag so a plain click on a
     card is never swallowed.
   - pointer capture (`pointerCapture`). Every carousel wants it, so a drag
     keeps tracking once the pointer leaves the track - but only once the
     drag has actually started: capturing on pointerdown retargets the
     eventual click to the track itself rather than whatever card was under
     the pointer, which silently broke "click a peeking card to activate it"
     (live feedback: "can selecting a non active card activate that card").
     The tab row deliberately ends its drag when the pointer leaves the row
     instead (`endOnPointerLeave`).
   - preventDefault on pointerdown (`preventDefaultOnDown`). A mousedown +
     move over an <a> card (the KPI stats row) or a role="button" row (Panel
     Home) otherwise kicks off the browser's own native link-drag or text
     selection and never delivers useful pointermove deltas. It is opt-in
     because it is also what broke focus/click on real controls until
     `ignoreSelector` was paired with it.
   - `ignoreSelector`. A real control inside the track (Edit/Delete, a
     row-remove form) must keep its own native mousedown/focus/click, so no
     drag starts on one at all.
   - click suppression (`suppressClick`): 'once' arms a single capture-phase
     swallow on the track at drag end (the carousel/facts-strip shape),
     false leaves it to the caller - Panel Home's carousel has its own
     capture-phase click handler that needs to know whether a drag happened
     AND do more besides, so it reads `hasDragged()` off the returned
     controller instead of having a second suppressor fight it.
   - `trackVelocity` / `onDragEnd`. Only Panel Home's card-stack carousel
     projects a fling and settles on a card; everything else stops dead
     where the pointer let go, as touch already does natively.
   - `enabled`. The KPI row switches to a plain grid when every card already
     fits, where there is nothing to drag-scroll to - a slightly jittery
     click there must never be misread as a drag and swallowed.

   Pen pointers now drag everywhere. The carousel and facts-strip copies
   were mouse-only (`pointerType !== 'mouse'`) while the stats/home ones
   excluded only touch, so a pen could drag three of the six. Unioned to the
   wider of the two: excluding touch is the behaviour with a reason behind
   it (the browser already pans), excluding pen was incidental.

   NOT merged in, assessed and left alone: the hub sidebar's own drag
   (_hub_sidebar.html) is mousedown-based and axis-switching - pageY in the
   side tier, pageX in portrait - and is not a copy of this at all
   (main-js-inventory.md section 6, variant 7). */

/* Returns a controller:
     hasDragged()  - did the pointer pass the threshold during the drag that
                     just ended? For a caller running its own click handler.
     clearDragged() - consume that flag, so the next click is let through. */
export function wireDragToScroll(root, options) {
    var opts = options || {};
    var resolveTrack = opts.resolveTrack || function () { return root; };
    var threshold = opts.threshold == null ? 6 : opts.threshold;
    var allowTouch = !!opts.touch;
    var moveBeforeThreshold = !!opts.moveBeforeThreshold;
    var usePointerCapture = opts.pointerCapture !== false;
    var endOnPointerLeave = !!opts.endOnPointerLeave;
    var preventDefaultOnDown = !!opts.preventDefaultOnDown;
    var requireOverflow = opts.requireOverflow !== false;
    var draggingClass = opts.draggingClass || 'is-dragging';
    var suppressClick = opts.suppressClick === undefined ? 'once' : opts.suppressClick;
    var trackVelocity = !!opts.trackVelocity;
    var ignoreSelector = opts.ignoreSelector || null;
    var isEnabled = opts.enabled || null;
    var onDragEnd = opts.onDragEnd || null;

    var drag = null;
    var dragged = false;

    root.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch' && !allowTouch) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (isEnabled && !isEnabled()) return;
        if (ignoreSelector && e.target.closest && e.target.closest(ignoreSelector)) return;
        var track = resolveTrack(e);
        if (!track) return;
        if (requireOverflow && track.scrollWidth <= track.clientWidth) return;
        if (preventDefaultOnDown) e.preventDefault();
        drag = {
            track: track,
            startX: e.clientX,
            startScroll: track.scrollLeft,
            moved: false,
            id: e.pointerId,
            sampleScroll: track.scrollLeft,
            sampleTime: trackVelocity ? performance.now() : 0,
            velocity: 0,
        };
        if (moveBeforeThreshold) track.classList.add(draggingClass);
    });

    root.addEventListener('pointermove', function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        var dx = e.clientX - drag.startX;
        if (!drag.moved && Math.abs(dx) >= threshold) {
            drag.moved = true;
            if (usePointerCapture) drag.track.setPointerCapture(drag.id);
            if (!moveBeforeThreshold) drag.track.classList.add(draggingClass);
        }
        if (!drag.moved && !moveBeforeThreshold) return;
        drag.track.scrollLeft = drag.startScroll - dx;
        if (!trackVelocity || !drag.moved) return;
        /* scrollLeft-per-ms, resampled at most once a frame, so a fast flick
           keeps travelling briefly after release instead of stopping dead
           where the pointer let go - the free feel touch gets natively. */
        var now = performance.now();
        var dt = now - drag.sampleTime;
        if (dt > 8) {
            drag.velocity = (drag.track.scrollLeft - drag.sampleScroll) / dt;
            drag.sampleScroll = drag.track.scrollLeft;
            drag.sampleTime = now;
        }
    });

    function endDrag(e) {
        if (!drag) return;
        if (e && e.pointerId !== undefined && e.pointerId !== drag.id) return;
        var ended = drag;
        drag = null;
        ended.track.classList.remove(draggingClass);
        dragged = ended.moved;
        if (!ended.moved) return;
        if (suppressClick === 'once') {
            /* One-shot, capture-phase, armed only by a drag that actually
               moved: the click a real drag fires on release would otherwise
               reach - and spuriously activate - whatever the drag happened
               to start on top of. Every other click falls straight through. */
            ended.track.addEventListener('click', function (ev) {
                ev.stopPropagation();
                ev.preventDefault();
            }, { capture: true, once: true });
        }
        if (onDragEnd) onDragEnd(ended.track, ended.velocity);
    }

    root.addEventListener('pointerup', endDrag);
    root.addEventListener('pointercancel', endDrag);
    if (endOnPointerLeave) root.addEventListener('pointerleave', function () { endDrag(null); });

    return {
        hasDragged: function () { return dragged; },
        clearDragged: function () { dragged = false; },
    };
}
