/* Mobile chrome bound to _hub_sidebar.html's own markup (#212 - moved out of
   its inline <script>, ADR 0021): the bottom-sheet dialogs (hub menu, +
   proxy-clicks), the multi-action FAB "wheel" (#143), and the search/
   FAB-as-hub-menu triggers. One file, not several - the FAB wheel's
   setOpen() calls closeEverythingMobile(), defined for the sheets, and
   splitting them would either duplicate that function or publish it as a
   cross-file interface for one caller; kept together the same way
   facts-strip.js's three regions are (see that file's own header). Over the
   600-code-line trigger and stays one file for the same reason.

   Layout tier: this markup and behaviour exist once, rendered by
   _hub_sidebar.html into the page frame - not a component instantiated per
   element. */

export function initMobileSheet() {
    var SHEET_CLOSE_DELAY = 380; // matches --transition-slide (360ms) + buffer

    /* showModal() alone doesn't stop the page behind it from scrolling (no
       wheel/scroll-gesture lock, unlike focus/click, which the top layer's own
       inertness already blocks) - a swipe/scroll over the dimmed backdrop
       scrolled <main> underneath, visible through/around the sheet as it slid
       back into view on close.

       Two things that look like they'd lock scroll both turned out to cause
       the exact "lurches to the top and back" bug instead:
       - body.style.overflow='hidden' resets scrollTop to 0 on a scrolled iOS
         Safari page the instant it's set, then jumps back on release.
       - body.style.position='fixed' (the usual iOS-safe fix for the above)
         pulls body out of <html>'s normal flow entirely - <html>'s own
         scrollbar can disappear/reappear as a result, reflowing the viewport
         width and reading as the same lurch, confirmed on desktop Chrome.

       overflow:hidden on <html> (not body, no position tricks) avoids both -
       it doesn't reset scroll position, and compensating the vanishing
       scrollbar's width with padding-right keeps the viewport from reflowing
       when it disappears. */
    function lockBodyScroll() {
        var scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.documentElement.style.overflow = 'hidden';
        if (scrollbarWidth > 0) document.body.style.paddingRight = scrollbarWidth + 'px';
    }
    function unlockBodyScroll() {
        document.documentElement.style.overflow = '';
        document.body.style.paddingRight = '';
    }
    function openSheet(sheet) {
        var scrollY = window.scrollY;
        lockBodyScroll();
        sheet.showModal();
        /* showModal()'s own autofocus (no child has an explicit autofocus
           attribute, so the dialog itself gets focused) tries to scroll that
           focus target into view - at this exact instant the sheet is still
           translateY(100%), off-screen below the fold, so the browser scrolled
           the page down to reveal it. Re-focusing explicitly with preventScroll
           (below) stops that call from adding another scroll, but the browser's
           own auto-focus scroll already fired synchronously inside showModal()
           itself, before this line ever runs - and it's an animated scroll, not
           an instant jump, so it spent the next ~300ms easing back up in
           parallel with the sheet's own slide-up transition. Two competing
           eases at once read as the sheet "bouncing" as it opened - closing
           never re-triggers focus, so only opening showed it (#130). Snapping
           scroll straight back to where it was, synchronously and without
           animation, cancels that in-flight ease before it can render a frame. */
        sheet.focus({ preventScroll: true });
        window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
        requestAnimationFrame(function () { sheet.classList.add('is-open'); });
    }
    function closeSheet(sheet, immediate) {
        if (!sheet.open) return;
        sheet.classList.remove('is-open');
        var finish = function () {
            if (sheet.open) sheet.close();
            if (!document.querySelector('.mobile-more-sheet[open]')) unlockBodyScroll();
        };
        /* immediate skips the graceful close delay below - needed whenever this
           sheet is being closed to make way for a plain .overlay-nav div (School/
           Appearance/Switch Hub), not another <dialog>. A still-`open` <dialog>
           stays in the browser's top layer for the whole SHEET_CLOSE_DELAY
           window regardless of this class change, and top-layer content always
           paints above regular DOM stacking no matter its z-index - so the
           overlay panel opening underneath was invisible, covered by this
           sheet's own close animation, for ~380ms (reported as "the overlay
           covers"). Closing the dialog outright the instant we know an overlay
           is taking over sidesteps the graceful CSS transition entirely, but
           that's fine here - the incoming overlay covers the screen at the same
           moment anyway, so there was never anything to see it ease out. */
        if (immediate) finish();
        else setTimeout(finish, SHEET_CLOSE_DELAY);
    }
    /* Tapping the dimmed area is the primary way to dismiss the sheet on a
       phone (large, thumb-natural, works from wherever the thumb already is -
       see #129 grilling on the × corner being a long reach). `e.target ===
       sheet` doesn't reliably catch this: .mobile-more-sheet is sized to just
       its visible card (not the full viewport), so a tap in the dimmed area
       around it lands on the dialog's own ::backdrop, not the dialog element -
       comparing the actual click coordinates against the sheet's own rendered
       box works regardless of that sizing. */
    function wireBackdropClose(sheet) {
        sheet.addEventListener('click', function (e) {
            var rect = sheet.getBoundingClientRect();
            var inside = e.clientX >= rect.left && e.clientX <= rect.right
                && e.clientY >= rect.top && e.clientY <= rect.bottom;
            if (!inside) closeSheet(sheet);
        });
    }

    var menuTrigger = document.querySelector('[data-mobile-menu-trigger]');
    var menuSheet = document.querySelector('[data-mobile-menu-sheet]');
    var menuClose = document.querySelector('[data-mobile-menu-close]');

    /* Nothing closed whatever else was open before opening its own thing -
       e.g. tapping Settings straight from the bar while Search was still open
       left Search technically open underneath (native dialogs stack rather
       than replace each other), showing through behind the newest sheet
       rather than being replaced by it. Every trigger below now closes
       everything else first. */
    function closeEverythingMobile() {
        closeSheet(menuSheet);
        document.querySelectorAll('dialog.modal-dialog[open]').forEach(function (d) {
            var closeBtn = d.querySelector('.modal-close');
            if (closeBtn) closeBtn.click(); else d.close();
        });
        document.querySelectorAll('.side-nav.overlay-nav.open').forEach(function (nav) {
            var closeBtn = nav.querySelector('.nav-close-btn');
            if (closeBtn) closeBtn.click();
        });
    }

    if (menuTrigger && menuSheet) {
        menuTrigger.addEventListener('click', function () {
            closeEverythingMobile();
            openSheet(menuSheet);
        });
        menuClose.addEventListener('click', function () { closeSheet(menuSheet); });
        wireBackdropClose(menuSheet);
        // Change Hub opens the global overlay panel, which would otherwise
        // render behind this native <dialog>'s own top-layer stacking -
        // immediate close (see closeSheet) so it actually clears in time.
        var hubsBtn = menuSheet.querySelector('[data-overlay-target]');
        if (hubsBtn) hubsBtn.addEventListener('click', function () { closeSheet(menuSheet, true); });
    }
    // +Referral proxy-clicks whichever real header button matches - reuses
    // the page's own already-wired modal instead of re-implementing it here
    // (see hubs/inclusion/panel/CLAUDE.md "Key helpers").
    document.querySelectorAll('[data-mobile-proxy-click]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            closeEverythingMobile();
            var real = document.querySelector(btn.dataset.mobileProxyClick);
            if (real) real.click();
        });
    });

    // Mobile FAB "wheel" (#143) — see the matching CSS for the full
    // context/rationale. Only activates once there's more than one
    // create-action on the page; otherwise the plain proxy-click binder
    // just above already covers the FAB. Deferred to DOMContentLoaded (not
    // run inline like the rest of this function) because the page's own
    // create-action triggers (data-create-panel-trigger,
    // data-new-referral-trigger) live inside <main>, which renders AFTER
    // the sidebar partial — checking for them immediately here always
    // found zero, since <main> hadn't been parsed yet.
    document.addEventListener('DOMContentLoaded', function () {
        var fab = document.querySelector('.mobile-tab-fab:not(.mobile-tab-fab-nav)');
        if (!fab) return;
        // The tabbar (and this FAB) is always in the DOM but only visible
        // below 479px (CSS) - the rest of this function gets away without
        // checking that because it only attaches listeners to elements
        // already inside that hidden subtree. This one is different: it
        // creates brand-new elements appended straight to <body>, outside
        // that subtree, so without this guard they showed up as plain
        // unstyled rows at the bottom of the page on desktop.
        /* html.phone-chrome, not a raw width query: the FAB now also exists in
           the `short` tier (landscape phone - see layout.html's boot block),
           where the width is 667-932px and a max-width: 480px check would
           bail out, leaving the FAB present but its wheel dead. */
        if (!document.documentElement.classList.contains('phone-chrome')) return;

        function iconHTML(templateId) {
            var t = document.getElementById(templateId);
            return t ? t.innerHTML : '';
        }
        var ACTION_DEFS = [
            { proxy: '[data-create-panel-trigger]', label: 'Meeting', iconTemplate: 'mobile-fab-icon-meeting' },
            { proxy: '[data-new-referral-trigger]', label: 'Referral', iconTemplate: 'mobile-fab-icon-referral' }
        ];
        var ACTIONS = ACTION_DEFS.filter(function (a) { return !!document.querySelector(a.proxy); });

        if (ACTIONS.length <= 1) {
            // Nothing to choose between - the default data-mobile-proxy-click
            // already on the FAB handles the one-action case, but keep its
            // label in sync in case that one action isn't Referral one day.
            if (ACTIONS.length === 1) {
                fab.setAttribute('data-mobile-proxy-click', ACTIONS[0].proxy);
                fab.setAttribute('aria-label', 'New ' + ACTIONS[0].label);
            }
            return;
        }
        fab.removeAttribute('data-mobile-proxy-click');
        fab.setAttribute('aria-label', 'Create');

        var ITEM_W = 54, GAP = 32, STEP = ITEM_W + GAP;
        var RADIUS = 100;
        var FADE_START_DEG = 55, FADE_END_DEG = 100;
        var STRIP_HEIGHT = 320;
        // Whether every action can already be seen fully opaque at once,
        // with nothing scrolled off - the real test for "is a scrollbar
        // even needed", not raw native scroll capability (which is nonzero
        // even for 2 items, since the strip's padding deliberately lets
        // either one be individually centered under the FAB).
        var totalSpanDeg = (ACTIONS.length - 1) * STEP / RADIUS * 180 / Math.PI;
        var ALL_ITEMS_FIT = totalSpanDeg <= FADE_START_DEG * 2;

        // Progress-ring geometry: concentric with the FAB, radius solved so
        // the whole visible arc - sides included, which sag lower than the
        // apex - keeps the same minimum clearance above the icon row.
        var ICON_OUTER_RADIUS = RADIUS + 27; // wheel items' own radius + half their circle
        var CLEARANCE = 7;
        var MIN_CLEAR_RADIUS = ICON_OUTER_RADIUS + CLEARANCE;
        var STROKE_W = 3;
        var RING_W = 0, RING_H = 0, BIG_R = 0;

        var scrim = document.createElement('div');
        scrim.className = 'mobile-fab-wheel-scrim';
        document.body.appendChild(scrim);

        var svgNS = 'http://www.w3.org/2000/svg';
        var ring = document.createElementNS(svgNS, 'svg');
        ring.setAttribute('class', 'mobile-fab-wheel-ring');
        var track = document.createElementNS(svgNS, 'path');
        track.setAttribute('class', 'mobile-fab-wheel-ring-track');
        track.setAttribute('stroke-width', STROKE_W);
        var thumb = document.createElementNS(svgNS, 'path');
        thumb.setAttribute('class', 'mobile-fab-wheel-ring-thumb');
        thumb.setAttribute('stroke-width', STROKE_W);
        ring.appendChild(track);
        ring.appendChild(thumb);
        document.body.appendChild(ring);

        // y on the arc at local x (0..RING_W) - the circle's center-x is
        // always RING_W/2 by construction, center-y is BIG_R (so the apex,
        // at x=RING_W/2, lands at local y=0).
        function arcY(x) {
            var dx = x - RING_W / 2;
            return BIG_R - Math.sqrt(Math.max(0, BIG_R * BIG_R - dx * dx));
        }
        // sweep-flag 1 (clockwise on screen) traces the arc from a left
        // point, up through the apex, back down to a right point.
        function arcPath(x1, x2) {
            return 'M' + x1 + ',' + arcY(x1) + ' A' + BIG_R + ',' + BIG_R + ' 0 0 1 ' + x2 + ',' + arcY(x2);
        }

        var strip = document.createElement('div');
        strip.className = 'mobile-fab-wheel-strip';
        document.body.appendChild(strip);

        // Sized along the scroll axis, so the same ITEM_W/GAP rhythm the angle
        // maths assumes holds in both orientations. Re-applied on every layout
        // rather than once at build time, since the device can rotate.
        function sizeHits() {
            var side = isSide();
            hits.forEach(function (hit, i) {
                hit.style.width = side ? '' : ITEM_W + 'px';
                hit.style.height = side ? ITEM_W + 'px' : '';
                hit.style.marginRight = '';
                hit.style.marginBottom = '';
                // No trailing margin on the very last hit - the padding-based
                // scroll cap assumes exactly (n-1) gaps between items.
                if (i < ACTIONS.length - 1) {
                    if (side) { hit.style.marginBottom = GAP + 'px'; }
                    else { hit.style.marginRight = GAP + 'px'; }
                }
            });
        }
        var hits = ACTIONS.map(function () {
            var hit = document.createElement('div');
            hit.className = 'mobile-fab-wheel-hit';
            strip.appendChild(hit);
            return hit;
        });
        sizeHits();

        var visuals = ACTIONS.map(function (a) {
            var el = document.createElement('button');
            el.type = 'button';
            el.className = 'mobile-fab-wheel-item';
            el.setAttribute('aria-label', 'New ' + a.label);
            el.innerHTML = '<span class="mobile-fab-wheel-circle">' + iconHTML(a.iconTemplate) + '</span>' +
                '<span class="mobile-fab-wheel-chip"><span class="mobile-fab-wheel-chip-new">New</span>' +
                '<span class="mobile-fab-wheel-chip-name">' + a.label + '</span></span>';
            document.body.appendChild(el);
            el.addEventListener('click', function (e) {
                e.stopPropagation();
                setOpen(false);
                var real = document.querySelector(a.proxy);
                if (real) real.click();
            });
            return el;
        });

        var didDrag = false;
        hits.forEach(function (hit, i) {
            hit.addEventListener('click', function (e) {
                e.stopPropagation();
                if (didDrag) return;
                visuals[i].click();
            });
        });
        // Tapping the strip anywhere that isn't a hit (the gaps between
        // icons, or the padding either side) closes the wheel.
        strip.addEventListener('click', function (e) {
            if (didDrag) return;
            if (e.target === strip) setOpen(false);
        });

        // Mouse click-and-drag to scroll - touch gets this for free from
        // the browser, but a mouse doesn't scroll on drag by default.
        // Drag tracks whichever axis the carousel scrolls on - pageY in the
        // side tier, pageX in portrait.
        var dragActive = false, dragStartX = 0, dragStartScroll = 0;
        strip.addEventListener('mousedown', function (e) {
            dragActive = true;
            didDrag = false;
            dragStartX = isSide() ? e.pageY : e.pageX;
            dragStartScroll = stripScroll();
            strip.classList.add('dragging');
        });
        window.addEventListener('mousemove', function (e) {
            if (!dragActive) return;
            var dx = (isSide() ? e.pageY : e.pageX) - dragStartX;
            if (Math.abs(dx) > 4) didDrag = true;
            setStripScroll(dragStartScroll - dx);
        });
        window.addEventListener('mouseup', function () {
            if (!dragActive) return;
            dragActive = false;
            strip.classList.remove('dragging');
            setTimeout(function () { didDrag = false; }, 0);
        });
        // Vertical mouse-wheel over a horizontally-scrolling element isn't
        // remapped to horizontal scroll by every browser - do it explicitly.
        // (In the side tier the carousel is already vertical, so this is just
        // the browser's own behaviour, routed through the same helper.)
        strip.addEventListener('wheel', function (e) {
            if (!open) return;
            e.preventDefault();
            setStripScroll(stripScroll() + (e.deltaY !== 0 ? e.deltaY : e.deltaX));
        }, { passive: false });

        var open = false;
        var raf = null;

        function fabCenter() {
            var rect = fab.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }

        /* The whole wheel has two orientations, sharing one set of geometry.

           Portrait: the FAB sits bottom-centre, the carousel scrolls
           HORIZONTALLY, and the arc opens upward - the only shape with room
           along the bottom edge of a phone.

           The `short` tier (landscape, ADR 0016) puts the FAB mid-RIGHT in the
           vertical nav strip, so all of that turns ninety degrees: the carousel
           scrolls vertically and the arc opens leftward, into the content.

           Rather than fork the maths, every axis-dependent step goes through the
           helpers below - main() is the scroll/arc axis, cross() the other one.
           Read live from the class, never cached: rotating the device flips this
           while the page is open, and layoutStrip()/render() both re-run on the
           resize that follows. */
        function isSide() {
            return document.documentElement.classList.contains('phone-chrome-side');
        }
        // Scroll offset along whichever axis the carousel actually runs on.
        function stripScroll() {
            return isSide() ? strip.scrollTop : strip.scrollLeft;
        }
        function setStripScroll(v) {
            if (isSide()) { strip.scrollTop = v; } else { strip.scrollLeft = v; }
        }
        // The FAB centre's coordinate along the scroll axis, and the viewport's
        // length along it - the two inputs every padding/offset sum needs.
        function mainOf(center) { return isSide() ? center.y : center.x; }
        function mainViewport() { return isSide() ? window.innerHeight : window.innerWidth; }

        function layoutStrip() {
            var center = fabCenter();
            var side = isSide();
            sizeHits();
            /* STRIP_HEIGHT is the strip's CROSS-axis thickness - the band the
               drag/scroll gesture is catchable in. It stays the same number in
               both orientations; only which CSS property it lands on changes.
               The strip is stretched along its main axis by the CSS
               (left/right: 0 in portrait, top/bottom: 0 in the side tier) and
               only ever positioned on its cross axis here. */
            if (side) {
                strip.style.height = '';
                strip.style.top = '';
                strip.style.width = STRIP_HEIGHT + 'px';
                strip.style.left = (center.x - STRIP_HEIGHT / 2) + 'px';
            } else {
                strip.style.width = '';
                strip.style.left = '';
                strip.style.height = STRIP_HEIGHT + 'px';
                strip.style.top = (center.y - STRIP_HEIGHT / 2) + 'px';
            }
            // Front is only ever allowed to be index 1..(N-2) - never the
            // true first/last item, which only have one neighbour and drop
            // the visible count to 2.
            var n = ACTIONS.length;
            var minFrontIndex = n > 2 ? 1 : 0;
            var maxFrontIndex = n > 2 ? n - 2 : n - 1;
            /* Padding either end of the carousel is what lets any single item be
               scrolled to sit exactly under the FAB. Measured along the scroll
               axis from the FAB's own position, so in the side tier that's
               top/bottom against innerHeight rather than left/right against
               innerWidth. Getting this wrong is what broke landscape first time
               round: innerWidth - center.x is barely 28px once the FAB is in the
               right-hand strip, so the trailing padding clamped to 0 and the
               carousel could never bring an item to the FAB's angle at all. */
            var mainCenter = mainOf(center);
            var naturalPaddingStart = mainCenter - ITEM_W / 2;
            var naturalPaddingEnd = mainViewport() - mainCenter - ITEM_W / 2;
            var padStart = Math.max(0, naturalPaddingStart - minFrontIndex * STEP) + 'px';
            var stepsClampedEnd = (n - 1) - maxFrontIndex;
            var padEnd = Math.max(0, naturalPaddingEnd - stepsClampedEnd * STEP) + 'px';
            if (side) {
                strip.style.paddingLeft = '';
                strip.style.paddingRight = '';
                strip.style.paddingTop = padStart;
                strip.style.paddingBottom = padEnd;
            } else {
                strip.style.paddingTop = '';
                strip.style.paddingBottom = '';
                strip.style.paddingLeft = padStart;
                strip.style.paddingRight = padEnd;
            }

            // Darkest right at the FAB, fading out toward the edges of the
            // screen - draws the eye to where the action actually is. Sized
            // off the larger viewport dimension so the falloff still reaches
            // the far edge in either orientation.
            var scrimR = Math.round(Math.max(window.innerWidth, window.innerHeight) * 0.5);
            scrim.style.background = 'radial-gradient(circle ' + scrimR + 'px at ' +
                center.x + 'px ' + center.y + 'px, ' +
                'rgba(0,0,0,.88) 0%, rgba(0,0,0,.6) 60%, rgba(0,0,0,.4) 100%)';

            sizeRing();
            /* The ring's local geometry is identical in both orientations - an
               arc whose apex is at local (RING_W/2, 0) and whose circle centre is
               at local (RING_W/2, BIG_R). Placing that centre on the FAB is
               therefore the same sum either way; the side tier just spins the
               whole SVG a quarter turn ABOUT that centre, which carries the apex
               from pointing up to pointing left. Rotating rather than re-deriving
               the arc path keeps one set of trig, and the ring is a bare stroke
               with no text to end up sideways. */
            ring.style.left = (center.x - RING_W / 2 - STROKE_W) + 'px';
            ring.style.top = (center.y - BIG_R - STROKE_W) + 'px';
            ring.style.transformOrigin = (RING_W / 2 + STROKE_W) + 'px ' + (BIG_R + STROKE_W) + 'px';
            ring.style.transform = side ? 'rotate(-90deg)' : '';
        }

        function sizeRing() {
            // 70% of the screen's length along the SCROLL axis - the ring
            // tracks the carousel, so it spans the same direction the carousel
            // runs in (height in the side tier, width in portrait).
            RING_W = mainViewport() * 0.7;
            var halfW = RING_W / 2;
            // At the window's edge, the circle's own y-radius (measured
            // from its center) must be at least MIN_CLEAR_RADIUS - solving
            // that for BIG_R guarantees the edges (the lowest, tightest
            // points of the arc) hold the same clearance the apex does.
            BIG_R = Math.sqrt(halfW * halfW + MIN_CLEAR_RADIUS * MIN_CLEAR_RADIUS);
            RING_H = BIG_R - MIN_CLEAR_RADIUS;
            var pad = STROKE_W; // room for the stroke/round caps to not clip against the SVG's own edge
            ring.setAttribute('width', RING_W + pad * 2);
            ring.setAttribute('height', RING_H + pad * 2);
            ring.setAttribute('viewBox', -pad + ' ' + -pad + ' ' + (RING_W + pad * 2) + ' ' + (RING_H + pad * 2));
            ring.style.width = (RING_W + pad * 2) + 'px';
            ring.style.height = (RING_H + pad * 2) + 'px';
            track.setAttribute('d', arcPath(0, RING_W));
        }

        // "Rotate in/out as a wheel": an extra angle, shared by every item,
        // that eases between 0 and REVEAL_SWING_DEG - the whole arc swings
        // into (or out of) its resting position as one rigid group, rather
        // than each button animating individually. ANIM_OPENING plays
        // REVEAL_SWING_DEG -> 0 on the way in; ANIM_CLOSING plays the exact
        // reverse (0 -> REVEAL_SWING_DEG) on the way out.
        var OPEN_ANIM_MS = 280;
        var REVEAL_SWING_DEG = 55;
        var ANIM_NONE = 0, ANIM_OPENING = 1, ANIM_CLOSING = 2;
        var animPhase = ANIM_NONE;
        var animStart = 0;
        function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
        // Eased 0->1 progress through the current open/close animation (1
        // once idle/settled). Shared by both the swing angle and an
        // explicit opacity fade below - the angle-based fade alone isn't
        // enough on its own, since a front-and-centre item's angle barely
        // changes across the swing (it starts/ends near 0deg either way),
        // so without this it stayed fully opaque for the whole animation
        // and then hard-cut to invisible the instant it finished.
        function animProgress() {
            if (animPhase === ANIM_NONE) return 1;
            var elapsed = performance.now() - animStart;
            return easeOutCubic(Math.min(1, elapsed / OPEN_ANIM_MS));
        }

        function render() {
            var center = fabCenter();
            var side = isSide();
            var scrollLeft = stripScroll();
            var stripRect = strip.getBoundingClientRect();
            var progress = animProgress();
            var swingDeg = animPhase === ANIM_OPENING ? REVEAL_SWING_DEG * (1 - progress)
                : animPhase === ANIM_CLOSING ? REVEAL_SWING_DEG * progress : 0;
            var swing = swingDeg * Math.PI / 180;
            // 1 while opening/idle-open, ramping down to 0 as closing
            // finishes - the actual cross-fade, independent of the
            // angle-based fade below.
            var animFade = animPhase === ANIM_CLOSING ? (1 - progress) : 1;
            var stripStart = side ? stripRect.top : stripRect.left;
            var padStart = parseFloat(side ? strip.style.paddingTop : strip.style.paddingLeft) || 0;
            visuals.forEach(function (item, i) {
                // Where this item sits along the scroll axis if the carousel
                // were laid flat, then how far that is from the FAB - the
                // angle is purely a function of that distance.
                var natural = stripStart + padStart + i * STEP + ITEM_W / 2 - scrollLeft;
                var offset = natural - mainOf(center);
                var angleRad = offset / RADIUS + swing;
                var angleDeg = Math.abs(angleRad * 180 / Math.PI);
                /* Same circle, quarter-turned. Portrait sweeps up from the FAB
                   (angle 0 = straight above); the side tier sweeps LEFT into the
                   content (angle 0 = straight left), with positive angles running
                   downward so an item further along the carousel still appears
                   further down the arc - matching the sign of `offset` above. */
                var x = side ? center.x - Math.cos(angleRad) * RADIUS
                             : center.x + Math.sin(angleRad) * RADIUS;
                var y = side ? center.y + Math.sin(angleRad) * RADIUS
                             : center.y - Math.cos(angleRad) * RADIUS;
                var fade = 1;
                if (angleDeg > FADE_END_DEG) fade = 0;
                else if (angleDeg > FADE_START_DEG) fade = 1 - (angleDeg - FADE_START_DEG) / (FADE_END_DEG - FADE_START_DEG);
                item.style.left = x + 'px';
                item.style.top = y + 'px';
                item.style.opacity = fade * animFade;
                item.style.pointerEvents = (open && fade > 0.4) ? 'auto' : 'none';
            });

            // Nothing meaningful to scroll (everything already fits at
            // once, e.g. only 2 actions) - no scrollbar needed at all, and
            // no point letting the strip intercept drags for a no-op
            // scroll either.
            var scrollable = !ALL_ITEMS_FIT;
            ring.style.display = scrollable ? '' : 'none';
            strip.style.pointerEvents = (open && scrollable) ? 'auto' : 'none';
            if (!scrollable) return;

            // A real scrollbar thumb - sized to the fraction of content
            // actually visible, sliding along the track.
            var maxScroll = side ? (strip.scrollHeight - strip.clientHeight)
                                 : (strip.scrollWidth - strip.clientWidth);
            // Snap to the true ends within a couple of px - scrollWidth/
            // clientWidth/scrollLeft can be fractional.
            var progress = 0;
            if (maxScroll > 0) {
                if (scrollLeft <= 2) progress = 0;
                else if (scrollLeft >= maxScroll - 2) progress = 1;
                else progress = scrollLeft / maxScroll;
            }
            var visibleFraction = Math.min(1, side ? (strip.clientHeight / strip.scrollHeight)
                                                   : (strip.clientWidth / strip.scrollWidth));
            var thumbW = Math.max(RING_H, RING_W * visibleFraction);
            var thumbLeft = progress * (RING_W - thumbW);
            thumb.setAttribute('d', arcPath(thumbLeft, thumbLeft + thumbW));
        }

        function scheduleRender() {
            if (raf) return;
            raf = requestAnimationFrame(function () { raf = null; render(); });
        }

        function setOpen(next) {
            if (next === open) return;
            open = next;
            scrim.classList.toggle('open', open);
            strip.classList.toggle('open', open);
            ring.classList.toggle('open', open);
            fab.classList.toggle('mobile-tab-fab-wheel-open', open);
            animPhase = open ? ANIM_OPENING : ANIM_CLOSING;
            animStart = performance.now();
            if (open) {
                closeEverythingMobile();
                layoutStrip();
                setStripScroll(0);
                runWheelAnim();
            } else {
                runWheelAnim(function () {
                    // Animation finished mid-swing-out - now actually hide
                    // them, rather than snapping to invisible the instant
                    // the FAB was tapped.
                    visuals.forEach(function (v) { v.style.opacity = 0; v.style.pointerEvents = 'none'; });
                });
            }
        }

        // Drives render() every frame for the "rotate in/out as a wheel"
        // duration, independent of scroll events (scheduleRender handles
        // those separately). onDone fires once when the animation window
        // ends (used by the closing side to fully hide the items after).
        function runWheelAnim(onDone) {
            render();
            if (performance.now() - animStart < OPEN_ANIM_MS) {
                requestAnimationFrame(function () { runWheelAnim(onDone); });
            } else {
                animPhase = ANIM_NONE;
                if (onDone) onDone();
            }
        }

        strip.addEventListener('scroll', scheduleRender, { passive: true });
        fab.addEventListener('click', function (e) {
            e.stopPropagation();
            setOpen(!open);
        });
        scrim.addEventListener('click', function () { setOpen(false); });
        window.addEventListener('resize', function () { if (open) { layoutStrip(); render(); } });
    });

    // Search: in-app content search wins over the global hub-switcher
    // search when both exist on the page - can't rely on a plain combined
    // querySelector for this since it just returns whichever sits first in
    // DOM order, which was the wrong one here (the sidebar's global search
    // button renders earlier in the page than Panel's own).
    var searchTrigger = document.querySelector('[data-mobile-search-trigger]');
    if (searchTrigger) {
        searchTrigger.addEventListener('click', function () {
            closeEverythingMobile();
            var real = document.querySelector('[data-panel-search-trigger]')
                || document.querySelector('[data-overlay-target="#search-nav-overlay"]');
            if (real) real.click();
        });
    }

    // FAB-as-Hub-Menu (hide_mobile_fab pages): closes any open sheet/dialog
    // first, same as every other tabbar trigger - main.js's own generic
    // data-overlay-target handler (registered separately) does the actual
    // opening.
    var fabNavTrigger = document.querySelector('.mobile-tab-fab-nav');
    if (fabNavTrigger) {
        fabNavTrigger.addEventListener('click', function () { closeEverythingMobile(); });
    }
}
