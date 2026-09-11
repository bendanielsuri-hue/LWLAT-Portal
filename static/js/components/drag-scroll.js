/* Mouse click-and-drag horizontal scroll (touch excluded on purpose:
   overflow-x: auto already gives it native momentum-scroll everywhere this
   is used, so adding pointer handling for it would just fight the browser's
   own panning). DRAG_THRESHOLD defers "is this a drag" until real movement
   happens, so a plain click still reaches whatever's under the pointer -
   only once threshold is crossed does this (a) start actually moving
   scrollLeft and (b) arm the one-shot capturing click-suppressor on drag
   end, so the click a real drag would otherwise fire on release never
   reaches - and spuriously activates - whatever the drag happened to start
   on top of.

   #214: wireScrollCarousel (carousel.js) and the facts strip's own drag
   (list-page/facts-strip.js) ran this exact logic as two copies until this
   extraction - same threshold, same setPointerCapture, same click-suppress.
   `resolveTrack(e)` is what lets both share it: carousel.js binds directly
   to its one track, the facts strip binds to `document` and resolves
   whichever `.row-facts-cols` the pointer landed on, since a list page has
   many independent strips mounting and unmounting as rows filter in and out.

   Left out of this consolidation, deliberately, because each genuinely
   differs in behaviour rather than just in code shape - forcing them into
   this shape would change feel no one asked to change:
   - main.js's setupOverflowDragScroll (My Referrals/My Actions tab row) -
     mouse AND touch (devtools emulation and non-touch trackpads don't get
     native touch-scroll for free), no pointer capture, and drag ends the
     moment the pointer leaves the element rather than tracking globally.
   - stats-carousel.js and home.js's own two carousels - fling-velocity
     tracking that projects where a release should settle, home.js's also
     picking an "active card" to land on. Each was tuned through its own
     live-feedback history (see their own comments); the physics is the
     point of difference, not incidental duplication. */

export function wireDragToScroll(root, resolveTrack) {
    var DRAG_THRESHOLD = 6;
    var drag = null;
    root.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        var track = resolveTrack(e);
        if (!track || track.scrollWidth <= track.clientWidth) return;
        drag = { track: track, startX: e.clientX, startScroll: track.scrollLeft, moved: false, id: e.pointerId };
    });
    root.addEventListener('pointermove', function (e) {
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
    root.addEventListener('pointerup', endDrag);
    root.addEventListener('pointercancel', endDrag);
}
