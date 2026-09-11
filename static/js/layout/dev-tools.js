/* Developer-only chrome (#212 - moved out of layout.html's inline <script>,
   ADR 0021): the breakpoint preview iframe (Mobile/Tablet/Desktop buttons in
   .app-footer's dev cluster) and the JS error console. Both only ever exist
   in the DOM when current_staff.is_developer - the template still wraps this
   module's own <script> tag in that same {% if %} (see layout.html), so this
   isn't the "template control flow decides whether JS exists" case ADR 0021
   rules out; the markup itself is exactly as conditional as the script. */
export function initDevTools() {
    // The iframe loads the *whole* current page, own footer/switcher
    // included - kept live (not blocked/hidden) so it stays visible and
    // interactive rather than showing dead chrome (#128). Clicking a
    // breakpoint button from *inside* the iframe forwards to the real
    // switcher in window.top instead of nesting another iframe inside
    // this one - one preview frame ever exists, however many levels
    // deep you click from.
    var insideFrame = window.self !== window.top;
    // Clicking a link *inside* the preview iframe navigates only the
    // iframe (own location, own history) - window.top's address bar
    // never moves on its own, browsers don't propagate a child frame's
    // navigation up to the parent. Left alone, that's a trap: a real
    // refresh re-runs this same script on window.top, which reads
    // window.top's own location.href to set frame.src (below) - still
    // whatever page the preview was first opened from - silently
    // discarding every click made inside the preview since. Mirroring
    // this copy's own location onto window.top via replaceState (same-
    // origin, no reload) on every one of its loads keeps the two in
    // sync, so a refresh reopens the preview exactly where it was left.
    if (insideFrame) {
        window.top.history.replaceState(null, '', location.href);
    }
    // The real top-level page is the breakpoint tool's own control
    // surface (Mobile/Tablet/Desktop buttons live in .app-footer's dev
    // cluster) - it must stay visible even once the *real* browser
    // window is narrow too, or there's no way to switch away from a
    // narrow preset. Only the iframe's own copy (previewing what an
    // actual narrow visitor would see) should hide its footer behind
    // the mobile bottom nav - see the <=1180px override in
    // responsive.css keyed off this class.
    if (!insideFrame) {
        document.documentElement.classList.add('dev-bp-host');
    }
    var mainEl = document.querySelector('.content-column > main');
    // The iframe loads the *whole* current page, own global-nav/hub
    // sidebar included - so that real chrome has to be hidden too while
    // previewing, or you get two side-by-side copies of it (#128).
    var globalNav = document.querySelector('.page-shell > .global-nav');
    var overlay = document.getElementById('dev-bp-overlay');
    var wrap = document.getElementById('dev-bp-frame-wrap');
    var frame = document.getElementById('dev-bp-frame');
    // button[...], not bare [data-bp-tier] - the .dev-bp-tier wrappers
    // carry the same attribute, so an unqualified selector would match
    // each tier twice (wrapper + its button).
    var tierBtns = document.querySelectorAll('#dev-bp-group button[data-bp-tier]');
    var sizeBtns = document.querySelectorAll('#dev-bp-group .dev-bp-size');
    var rotateBtn = document.getElementById('dev-bp-rotate');
    var currentWidth = 0;
    var currentHeight = 0;
    // Snapshot of the URL window.top actually rendered. Navigating
    // *inside* the preview iframe only moves window.top's address bar
    // via replaceState (see the comment above) - window.top's own
    // mainEl/globalNav DOM is never touched. Switching back to Desktop
    // just unhides that stale DOM, so without this check it'd show
    // whatever page was loaded before the preview was ever opened,
    // even though the address bar (and a refresh) already point at
    // wherever the preview navigated to.
    var loadedHref = insideFrame ? null : location.href;
    // Read synchronously by the iframe's own copy of this same page (see
    // the head script above) the instant it starts parsing - same-origin
    // window.top access needs no postMessage round trip, so it's already
    // correct before that copy's first paint, unlike the postMessage
    // version below (which still exists, for the different case of
    // switching between two already-open touch presets without a reload -
    // see applyBreakpoint's own comment). Closes the gap postMessage
    // alone left open: clicking a link *inside* the preview iframe reloads
    // it via the iframe's own navigation, not applyBreakpoint, so nothing
    // would otherwise send devBpTouch again for that load.
    window.__devBpTouch = false;

    // Shrinks (never grows - min(1, ...)) the device box to fit
    // whatever room the overlay actually has, so a preset taller than
    // the browser window (portrait iPad, 1180px) reads as a smaller but
    // still fully-visible, correctly-proportioned mockup instead of
    // needing a scrollbar - matching how a preset that already fits
    // (landscape) reads at a glance, rather than one looking "cut off
    // tall" next to the other looking "comfortably wide".
    function computeScale(width, height) {
        var cs = getComputedStyle(overlay);
        var availW = overlay.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        var availH = overlay.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        return Math.min(1, availW / width, availH / height);
    }
    function rescale() {
        if (!currentWidth) return;
        var scale = computeScale(currentWidth, currentHeight);
        wrap.style.width = (currentWidth * scale) + 'px';
        wrap.style.height = (currentHeight * scale) + 'px';
        frame.style.transform = 'scale(' + scale + ')';
    }
    window.addEventListener('resize', rescale);

    function applyBreakpoint(width, height, touch) {
        if (!width) {
            // A click inside the preview since this Desktop DOM was
            // last rendered moved window.top's address bar (replaceState,
            // no reload) without ever touching this stale mainEl/
            // globalNav - a real navigation is the only way to make
            // Desktop show what the address bar already claims.
            if (loadedHref !== null && location.href !== loadedHref) {
                window.location.reload();
                return;
            }
            overlay.hidden = true;
            mainEl.hidden = false;
            globalNav.hidden = false;
            frame.src = 'about:blank';
            currentWidth = 0;
            return;
        }
        currentWidth = width;
        currentHeight = height;
        window.__devBpTouch = !!touch;
        frame.style.width = width + 'px';
        frame.style.height = height + 'px';
        // Unhide before rescale() - it measures overlay.clientWidth/
        // Height to size the fit, both 0 while [hidden] still applies
        // display:none, which would scale the frame to nothing on a
        // first open (switching between two already-open presets is
        // unaffected either way).
        mainEl.hidden = true;
        globalNav.hidden = true;
        overlay.hidden = false;
        rescale();
        // postMessage (not window.innerWidth inside the iframe - that's
        // shrunk by its own scrollbar and never exactly matches any
        // data-bp-w) tells the iframe's own switcher copy which
        // breakpoint it's actually showing, so its active highlight
        // stays in sync with the real one (#128). devBpTouch rides the
        // same message - a real mouse over this resized frame can never
        // make hover:none media queries true on its own, so the tablet
        // sizes need this explicit signal to exercise the touch-only nav
        // drawer (main.js's window.__setDevBpTouch, responsive.css's
        // .nav-touch-mode). onload fires on every navigation, including
        // when frame.src is already correct and doesn't need reassigning
        // below.
        //
        // The tier/sizeId/landscape triple rides along too, rather than
        // width alone: the iframe copy has to highlight a tier button,
        // tick one row in that tier's menu and set its own rotate state,
        // and width can't tell it any of those three now that one width
        // belongs to one size in two orientations.
        function syncFrame() {
            frame.contentWindow.postMessage({
                devBpWidth: width,
                devBpTouch: !!touch,
                devBpTier: bpTier,
                devBpSizeId: bpSize[bpTier] || null,
                devBpLandscape: bpLandscape
            }, location.origin);
        }
        frame.onload = syncFrame;
        if (frame.src !== location.href) {
            frame.src = location.href;
        } else {
            syncFrame();
        }
    }

    // Four keys, not the single 'dev-bp-preset' width this replaced.
    // Size is remembered PER TIER (bouncing Tablet<->Mobile while chasing
    // one bug shouldn't make you re-pick iPad Pro every time you come
    // back), while orientation is deliberately ONE global flag rather
    // than a fifth per-tier key - so the rotate button's appearance can
    // never disagree with what you're looking at. Same read/write pattern
    // as the pref-theme-mode/pref-theme reads in the <head> script.
    var BP_KEY_TIER = 'dev-bp-tier';
    var BP_KEY_LANDSCAPE = 'dev-bp-landscape';
    var BP_KEY_SIZE = { laptop: 'dev-bp-size-laptop', tablet: 'dev-bp-size-tablet', mobile: 'dev-bp-size-mobile' };
    // What a tier IS, in one table, so adding the next one is an entry here
    // rather than a hunt for every `tier === ...` in this script. Absent
    // from the table (Desktop) means "no preview frame at all".
    //
    // rotates:false tiers store their markup dimensions the way the device
    // is actually held, and applyState skips the portrait->landscape swap
    // for them - see the laptop tier's own comment in the markup above.
    // touch was previously inferred as "tier !== desktop", which held only
    // while every sized tier happened to be a touch device.
    var TIER_TRAITS = {
        laptop: { touch: false, rotates: false },
        tablet: { touch: true, rotates: true },
        mobile: { touch: true, rotates: true }
    };
    // First-run seeds only: the commonest real device in each tier, and
    // mid-tier rather than at an edge, so what you see before touching
    // anything is representative instead of a boundary case.
    var bpSize = { laptop: 'hp-1536', tablet: 'ipad', mobile: 'iphone' };
    var bpTier = 'desktop';
    var bpLandscape = false;

    function store(key, value) {
        try {
            if (value) { localStorage.setItem(key, value); }
            else { localStorage.removeItem(key); }
        } catch (e) { }
    }
    function read(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    function sizeBtnFor(tier) {
        if (!TIER_TRAITS[tier]) return null;
        return document.querySelector(
            '#dev-bp-group .dev-bp-tier[data-bp-tier="' + tier + '"] .dev-bp-size[data-bp-id="' + bpSize[tier] + '"]'
        );
    }

    function closeMenus(exceptTier) {
        tierBtns.forEach(function (btn) {
            if (btn.dataset.bpTier === exceptTier) return;
            btn.setAttribute('aria-expanded', 'false');
            var menu = btn.parentNode.querySelector('.dev-bp-menu');
            if (menu) menu.classList.add('hidden');
        });
    }

    // Paints every control from (bpTier, bpSize, bpLandscape) in one
    // place, so no click handler has to remember which of the four
    // buttons its own change also affects.
    function syncChrome() {
        tierBtns.forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.bpTier === bpTier);
        });
        sizeBtns.forEach(function (btn) {
            var tier = btn.closest('.dev-bp-tier').dataset.bpTier;
            btn.classList.toggle('active', bpSize[tier] === btn.dataset.bpId);
        });
        var traits = TIER_TRAITS[bpTier];
        var canRotate = !!(traits && traits.rotates);
        // disabled AND hidden: visibility:hidden already takes it out of
        // the tab order, but the attribute is what keeps a forwarded click
        // from the preview iframe copy (forwardToTop) from firing a rotate
        // on a tier that doesn't have one.
        rotateBtn.disabled = !canRotate;
        rotateBtn.classList.toggle('is-hidden', !canRotate);
        // Active whenever a device tier is up, in EITHER orientation - not
        // only in landscape. The fill here means "this control is live and
        // applying to the preview", matching the active tier button beside
        // it; which way round you are is the label's job now that it reads
        // out Portrait/Landscape. Tying the fill to landscape instead made
        // portrait look like the button was switched off, when portrait is
        // just as much an applied orientation as landscape is.
        rotateBtn.classList.toggle('active', canRotate);
        // Label states the orientation you're IN, tooltip states what the
        // click would DO. The class is what the width transition keys on -
        // the text swap alone can't drive a CSS transition, since width
        // stays declared as the same value either way (see layout.css).
        // Both stay accurate on Desktop, where the button is disabled but
        // still shows the remembered orientation it will apply once you
        // enter a tier.
        // A non-rotating SIZED tier (laptop) still reads out an
        // orientation, and it reads Landscape - that is genuinely what the
        // preview is showing, and blanking it or leaving the remembered
        // Portrait there would both misdescribe what's on screen. Only
        // Desktop, which has no frame, falls back to the remembered flag.
        var shownLandscape = traits ? (canRotate ? bpLandscape : true) : bpLandscape;
        var orientLabel = rotateBtn.querySelector('.dev-bp-orient-label');
        orientLabel.textContent = shownLandscape ? 'Landscape' : 'Portrait';
        orientLabel.classList.toggle('is-landscape', shownLandscape);
        rotateBtn.dataset.tooltip = !traits
            ? 'Orientation · pick a device first'
            : (!canRotate
                ? 'Landscape · a laptop has no portrait form'
                : (bpLandscape ? 'Landscape · click for portrait' : 'Portrait · click for landscape'));
    }

    // Resolves state to real pixels and hands them to applyBreakpoint.
    // The landscape swap lives ONLY here - every data-bp-w/h in the markup
    // is portrait, so this is the single place a width and a height can
    // trade places.
    function applyState() {
        syncChrome();
        if (!TIER_TRAITS[bpTier]) {
            // Only tear a preview down if one is actually up: on a plain
            // page load this function runs purely to paint the chrome, and
            // an unconditional applyBreakpoint(0, 0) would kick off a
            // needless about:blank iframe load on every single page view.
            if (currentWidth) applyBreakpoint(0, 0, false);
            return;
        }
        var btn = sizeBtnFor(bpTier);
        if (!btn) return;
        var w = parseInt(btn.dataset.bpW, 10);
        var h = parseInt(btn.dataset.bpH, 10);
        var traits = TIER_TRAITS[bpTier];
        var swap = traits.rotates && bpLandscape;
        applyBreakpoint(swap ? h : w, swap ? w : h, traits.touch);
    }

    // Inside the preview iframe every control just forwards to the
    // identical control in window.top (same-origin, so this is safe) and
    // lets the parent's own handler do the real work - including its
    // active-class bookkeeping and the postMessage back to here.
    function forwardToTop(selector) {
        var topBtn = window.top.document.querySelector(selector);
        if (topBtn) topBtn.click();
    }

    tierBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var tier = btn.dataset.bpTier;
            if (insideFrame) {
                forwardToTop('#dev-bp-group button[data-bp-tier="' + tier + '"]');
                return;
            }
            // Apply first, open second: one click has to change the
            // preview as well as reveal the menu, or clicking a tier you
            // are already on would do nothing visible at all.
            bpTier = tier;
            store(BP_KEY_TIER, tier === 'desktop' ? null : tier);
            applyState();
            if (tier === 'desktop') {
                closeMenus(null);
                return;
            }
            var menu = btn.parentNode.querySelector('.dev-bp-menu');
            var open = btn.getAttribute('aria-expanded') === 'true';
            closeMenus(tier);
            btn.setAttribute('aria-expanded', open ? 'false' : 'true');
            menu.classList.toggle('hidden', open);
        });
    });

    sizeBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            if (insideFrame) {
                forwardToTop('#dev-bp-group .dev-bp-size[data-bp-id="' + btn.dataset.bpId + '"]');
                return;
            }
            var tier = btn.closest('.dev-bp-tier').dataset.bpTier;
            bpSize[tier] = btn.dataset.bpId;
            bpTier = tier;
            store(BP_KEY_SIZE[tier], btn.dataset.bpId);
            store(BP_KEY_TIER, tier);
            applyState();
        });
    });

    rotateBtn.addEventListener('click', function () {
        if (insideFrame) {
            forwardToTop('#dev-bp-rotate');
            return;
        }
        bpLandscape = !bpLandscape;
        store(BP_KEY_LANDSCAPE, bpLandscape ? '1' : null);
        applyState();
    });

    // Close an open menu on an outside click / Escape. Scoped to the
    // group so clicking the rotate button (a sibling, not a descendant of
    // either tier) leaves the menu you opened alone - you can rotate and
    // watch the result without the menu shutting under you.
    document.addEventListener('click', function (e) {
        if (!e.target.closest('#dev-bp-group')) closeMenus(null);
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMenus(null);
    });

    // Restore on a real load of the top-level page (never inside the
    // preview iframe, which instead syncs to whatever the parent loaded it
    // at - see the postMessage listener below). Orientation and both
    // per-tier sizes are restored even when the stored tier is Desktop, so
    // re-entering a tier later lands on what you last had rather than the
    // seed.
    if (!insideFrame) {
        bpLandscape = read(BP_KEY_LANDSCAPE) === '1';
        Object.keys(BP_KEY_SIZE).forEach(function (tier) {
            var storedId = read(BP_KEY_SIZE[tier]);
            // Guarded against a stale id left by an earlier device list -
            // an unrecognised one would otherwise make sizeBtnFor() return
            // null and applyState() silently do nothing.
            if (storedId && document.querySelector('#dev-bp-group .dev-bp-tier[data-bp-tier="' + tier + '"] .dev-bp-size[data-bp-id="' + storedId + '"]')) {
                bpSize[tier] = storedId;
            }
        });
        var storedTier = read(BP_KEY_TIER);
        // Validated against TIER_TRAITS rather than a second hardcoded tier
        // list, so a tier added there can never be one this forgets to
        // restore - and a stale tier from an older build still falls back
        // to Desktop instead of leaving bpTier pointing at nothing.
        if (storedTier && TIER_TRAITS[storedTier]) {
            bpTier = storedTier;
        }
        // Unconditional: even on Desktop this is what paints the rotate
        // button's disabled state and ticks the remembered menu rows.
        applyState();
    }

    // Inside the iframe, sync this copy's own controls to whatever the
    // parent actually loaded it at (see syncFrame in applyBreakpoint
    // above), so it doesn't show "Desktop" highlighted while sitting
    // inside a Mobile-sized frame - and force the touch-nav override so
    // this copy's own sidebar renders the same way a real touch device
    // previewing itself would.
    //
    // Copies the parent's state into this copy's own vars and reuses
    // syncChrome() rather than painting buttons here: one tier highlight,
    // one ticked menu row and one rotate state is exactly what that
    // function already does. syncChrome, not applyState - this copy must
    // never resize anything, it IS the thing being resized.
    if (insideFrame) {
        window.addEventListener('message', function (event) {
            if (event.origin !== location.origin || !event.data) return;
            if (typeof event.data.devBpWidth !== 'number') return;
            if (event.data.devBpTier) bpTier = event.data.devBpTier;
            if (event.data.devBpSizeId && bpTier !== 'desktop') {
                bpSize[bpTier] = event.data.devBpSizeId;
            }
            bpLandscape = !!event.data.devBpLandscape;
            syncChrome();
            if (window.__setDevBpTouch) window.__setDevBpTouch(!!event.data.devBpTouch);
        });
    }

    // Dev-only JS error console (#128) - resets per page load (no
    // persistence across navigation, per the grilling call). Captures
    // both runtime errors and unhandled promise rejections. Exposed as
    // window.__footerErrors so the always-rendered "Report Issue" wiring
    // (layout/report-problem.js) can silently attach these to a submitted
    // report without a separate dev-only reporting path.
    var errors = window.__footerErrors = [];
    var badge = document.getElementById('dev-error-badge');
    var panel = document.getElementById('dev-error-panel');
    var list = document.getElementById('dev-error-list');
    var errorBtn = document.getElementById('dev-error-btn');

    function recordError(message) {
        errors.push(message);
        badge.textContent = String(errors.length);
        badge.hidden = false;
        errorBtn.hidden = false;
        var item = document.createElement('li');
        item.textContent = message;
        list.appendChild(item);
    }

    window.addEventListener('error', function (event) {
        // Chrome/Safari fire this whenever a ResizeObserver callback's own
        // layout changes trigger another resize within the same frame -
        // harmless and unactionable (not a real app bug), just noisy
        // since it fires from browser internals rather than app code.
        if (event.message && event.message.indexOf('ResizeObserver loop') !== -1) return;
        recordError(event.message + ' (' + event.filename + ':' + event.lineno + ')');
    });
    window.addEventListener('unhandledrejection', function (event) {
        recordError('Unhandled promise rejection: ' + event.reason);
    });

    errorBtn.addEventListener('click', function () {
        var willShow = panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !willShow);
        errorBtn.setAttribute('aria-expanded', String(willShow));
    });
    document.getElementById('dev-error-clear-btn').addEventListener('click', function () {
        errors = window.__footerErrors = [];
        list.innerHTML = '';
        badge.hidden = true;
        errorBtn.hidden = true;
        panel.classList.add('hidden');
        errorBtn.setAttribute('aria-expanded', 'false');
    });
}

// Not called from main.js's layout-chrome list (initSidebarCollapse() and
// neighbours) - this module is only ever loaded at all behind the template's
// own {% if current_staff.is_developer %}, so gating the call a second time
// through main.js would just be the same condition asked twice.
initDevTools();
