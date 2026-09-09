/* PROTOTYPE - throwaway, never merge to main.
   Branch: prototype/tray-section-fill-variants. Floating switcher for the
   tray-section states in prototype-tray-variants.css, plus the measuring
   half of the scrolling variants: which rows can scroll, which way they
   still have travel, and the prev/next arrows on each caption row.

   ?tray=now|scr|snap in the URL, mirrored to localStorage so the choice
   survives the filter form's own GET submits (which rebuild the query
   string from the form's fields and would otherwise drop it). Left/right
   arrow keys cycle variants, except while typing in a field. */
(function () {
    var VARIANTS = [
        { key: 'now', name: 'today, untouched' },
        { key: 'scr', name: 'row per section, scrolls' },
        { key: 'snap', name: 'the same + scroll-snap' }
    ];
    var STORE = 'prototypeTrayVariant';
    /* 1px, not 0: scrollWidth/clientWidth are rounded to integers off
       fractional layout widths, so a row that fits exactly can report a
       1px overflow and would otherwise show arrows that do nothing. */
    var SLOP = 1;

    function scrollers() {
        return document.querySelectorAll('.filter-bar-sections .filter-group-fields');
    }

    /* Arrows live in the caption, which is .filter-group's OTHER child -
       .filter-section-label. Built once per section and left in the DOM when
       variants change; the CSS decides whether they render.

       Everything they then DO comes from wireScrollCarousel (main.js), the
       same helper the senco/stats/referral/action carousels use: drag-to-
       scroll for a mouse, the vertical-wheel-to-horizontal redirect, arrow
       auto-hide when the track does not overflow, and the edge state. Its
       own comment asks not to reimplement that logic again, and a first pass
       here had already done exactly that.

       The one thing it could not do unchanged is the step: it nudges by one
       card width, which is exact for a carousel of identical cards and lands
       mid-field here, where a toggle sits beside "Concern Category". So it
       now takes an optional scrollTo (added on this branch, backwards
       compatible), and this passes the fade-aware one below. */
    function ensureArrows(row) {
        var group = row.closest('.filter-group');
        var label = group && group.querySelector(':scope > .filter-section-label');
        if (!label || label.querySelector('.proto-arrow')) return;
        ['prev', 'next'].forEach(function (dir) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'proto-arrow';
            btn.dataset.protoArrow = dir;
            btn.setAttribute('aria-label', (dir === 'prev' ? 'Previous' : 'More') + ' filters in this section');
            btn.textContent = dir === 'prev' ? '‹' : '›';
            if (dir === 'prev') label.insertBefore(btn, label.firstChild);
            else label.appendChild(btn);
        });
        if (typeof window.wireScrollCarousel !== 'function') return;
        group.dataset.protoUpdate = '1';
        group._protoUpdateArrows = window.wireScrollCarousel(
            group,
            ':scope > .filter-group-fields',
            '.filter-field',
            '.proto-arrow[data-proto-arrow="prev"]',
            '.proto-arrow[data-proto-arrow="next"]',
            { scrollTo: function (track, direction) { step(track, direction > 0 ? 'next' : 'prev'); } }
        );
    }

    /* How wide the fade is, read back off the row's own custom property so
       CSS stays the single source of truth (--proto-fade). */
    function fade(row) {
        var v = parseFloat(window.getComputedStyle(row).getPropertyValue('--proto-fade'));
        return isFinite(v) ? v : 28;
    }

    /* One press = "show me the field I can only half see".

       Not a fixed 80%-of-a-row page, which was the first version: fields
       here are content-sized and wildly unequal (a toggle against "Concern
       Category"), so a fixed distance lands mid-field as often as not, and
       the whole point of the press is to stop looking at half a dropdown.

       The landing position is inset by the fade at whichever end the field
       arrives at, so the field the press just revealed is fully opaque
       rather than sitting under the gradient that advertised it. That inset
       is also what scroll-padding-inline hands to the browser's own
       snapping (prototype-tray-variants.css), so the snap variant settles
       on exactly the same position instead of pulling the field back under
       the fade.

       Falls back to a plain page if nothing is cut - only reachable at the
       very ends of the travel, where the arrow is disabled anyway. */
    function step(row, dir) {
        var rowRect = row.getBoundingClientRect();
        var pad = fade(row);
        var left = rowRect.left + pad;
        var right = rowRect.right - pad;
        var fields = Array.prototype.slice.call(row.querySelectorAll(':scope > .filter-field'));
        var delta = null;
        if (dir === 'next') {
            for (var i = 0; i < fields.length; i++) {
                var r = fields[i].getBoundingClientRect();
                // First field whose right edge is past the visible band:
                // bring its LEFT edge to the band's left.
                if (r.right > right + 1) { delta = r.left - left; break; }
            }
        } else {
            for (var j = fields.length - 1; j >= 0; j--) {
                var pr = fields[j].getBoundingClientRect();
                // Last field starting before the band: bring its RIGHT edge
                // to the band's right, so it lands whole and the row moves
                // by however much that field actually needed.
                if (pr.left < left - 1) { delta = pr.right - right; break; }
            }
        }
        if (delta === null) delta = (dir === 'next' ? 1 : -1) * row.clientWidth;
        var max = row.scrollWidth - row.clientWidth;
        var target = Math.max(0, Math.min(max, row.scrollLeft + delta));
        row.scrollTo({ left: target, behavior: 'smooth' });
    }

    function update(row) {
        var group = row.closest('.filter-group');
        var max = row.scrollWidth - row.clientWidth;
        var can = max > SLOP;
        var left = row.scrollLeft > SLOP;
        var right = row.scrollLeft < max - SLOP;
        if (group) group.classList.toggle('proto-can-scroll', can);
        row.classList.toggle('proto-scroll-more-left', can && left);
        row.classList.toggle('proto-scroll-more-right', can && right);
        if (!group) return;
        var prev = group.querySelector('.proto-arrow[data-proto-arrow="prev"]');
        var next = group.querySelector('.proto-arrow[data-proto-arrow="next"]');
        if (prev) prev.disabled = !left;
        if (next) next.disabled = !right;
    }

    function refresh() {
        var on = document.documentElement.dataset.trayVariant !== 'now';
        scrollers().forEach(function (row) {
            if (!on) {
                row.classList.remove('proto-scroll-more-left', 'proto-scroll-more-right');
                var g = row.closest('.filter-group');
                if (g) g.classList.remove('proto-can-scroll');
                return;
            }
            ensureArrows(row);
            var g = row.closest('.filter-group');
            if (g && g._protoUpdateArrows) g._protoUpdateArrows();
            if (!row.dataset.protoBound) {
                row.dataset.protoBound = '1';
                row.addEventListener('scroll', function () { update(row); }, { passive: true });
                enableHoverReveal(row);
            }
            update(row);
        });
    }

    /* Hover a partly-hidden field and it scrolls itself fully into view.

       This replaces a proximity-based edge autoscroll (pointer near the end
       of a row pans it, faster the closer in). That one was rejected on the
       page and the reason is worth keeping: it moved content under a
       stationary mouse continuously, so a dropdown near the edge slid away
       from the pointer aiming at it, and the row squirmed whenever you
       crossed it on the way somewhere else.

       This one is discrete instead. Hovering a field that is cut off states
       exactly what you want - that field - and it moves by the MINIMUM
       needed to show it whole, so the field slides toward the pointer rather
       than out from under it, and a row with nothing cut never moves at all.

       Same landing rule as the arrows: cleared of the fade at whichever end
       it arrives, so what surfaces is fully opaque rather than under the
       gradient that advertised it.

       HOVER_MS keeps a sweep across the row from triggering anything, and
       COOLDOWN_MS stops the smooth scroll that follows from chaining - as
       the row moves, other partly-hidden fields pass under the pointer and
       would each ask for their own turn. Mouse only; touch has the swipe. */
    var HOVER_MS = 150;
    var COOLDOWN_MS = 320;
    function enableHoverReveal(row) {
        var timer = null;
        var until = 0;
        row.addEventListener('pointerover', function (e) {
            if (e.pointerType !== 'mouse') return;
            if (!document.documentElement.dataset.trayScroll) return;
            if (row.scrollWidth - row.clientWidth <= SLOP) return;
            var field = e.target.closest && e.target.closest('.filter-field');
            if (!field || field.parentNode !== row) return;
            window.clearTimeout(timer);
            if (Date.now() < until) return;
            timer = window.setTimeout(function () {
                if (reveal(row, field)) until = Date.now() + COOLDOWN_MS;
            }, HOVER_MS);
        });
        row.addEventListener('pointerleave', function () { window.clearTimeout(timer); });
    }

    /* Scrolls `field` fully inside the visible band, by as little as
       possible. Returns whether it actually had to move. */
    function reveal(row, field) {
        var rowRect = row.getBoundingClientRect();
        var pad = fade(row);
        var left = rowRect.left + pad;
        var right = rowRect.right - pad;
        var r = field.getBoundingClientRect();
        var delta = 0;
        if (r.right > right + 1) delta = r.right - right;
        else if (r.left < left - 1) delta = r.left - left;
        if (!delta) return false;
        var max = row.scrollWidth - row.clientWidth;
        row.scrollTo({ left: Math.max(0, Math.min(max, row.scrollLeft + delta)), behavior: 'smooth' });
        return true;
    }

    function currentKey() {
        var fromUrl = new URLSearchParams(window.location.search).get('tray');
        var stored = null;
        try { stored = window.localStorage.getItem(STORE); } catch (e) { /* private mode */ }
        var key = fromUrl || stored || 'now';
        return VARIANTS.some(function (v) { return v.key === key; }) ? key : 'now';
    }

    function apply(key, pushUrl) {
        document.documentElement.dataset.trayVariant = key;
        /* One hook for "this variant scrolls its rows", so the CSS needs no
           selector per variant (prototype-tray-variants.css). */
        if (key === 'now') delete document.documentElement.dataset.trayScroll;
        else document.documentElement.dataset.trayScroll = '1';
        try { window.localStorage.setItem(STORE, key); } catch (e) { /* private mode */ }
        if (pushUrl) {
            var url = new URL(window.location.href);
            url.searchParams.set('tray', key);
            window.history.replaceState(null, '', url);
        }
        var label = document.querySelector('[data-prototype-label]');
        if (label) {
            var v = VARIANTS.filter(function (x) { return x.key === key; })[0];
            label.textContent = v.key.toUpperCase() + ' - ' + v.name;
        }
        refresh();
    }

    function cycle(step) {
        var keys = VARIANTS.map(function (v) { return v.key; });
        var i = keys.indexOf(document.documentElement.dataset.trayVariant || 'now');
        apply(keys[(i + step + keys.length) % keys.length], true);
    }

    function build() {
        var bar = document.createElement('div');
        bar.setAttribute('data-prototype-switcher', '');
        /* Deliberately nothing like the app: near-black pill, so it never
           gets mistaken for part of the design being judged. Sits above the
           mobile tabbar/FAB rather than over them. */
        bar.style.cssText = [
            'position:fixed', 'left:50%', 'transform:translateX(-50%)',
            'bottom:88px', 'z-index:9999', 'display:flex', 'align-items:center',
            'gap:12px', 'padding:8px 12px', 'border-radius:999px',
            'background:#11151c', 'color:#fff', 'font:600 12px/1 system-ui,sans-serif',
            'box-shadow:0 6px 20px rgba(0,0,0,0.35)'
        ].join(';');
        bar.innerHTML =
            '<button type="button" data-prototype-prev aria-label="Previous variant" ' +
            'style="all:unset;cursor:pointer;padding:2px 6px;font-size:14px">&#8592;</button>' +
            '<span data-prototype-label style="min-width:170px;text-align:center"></span>' +
            '<button type="button" data-prototype-next aria-label="Next variant" ' +
            'style="all:unset;cursor:pointer;padding:2px 6px;font-size:14px">&#8594;</button>';
        document.body.appendChild(bar);
        bar.querySelector('[data-prototype-prev]').addEventListener('click', function () { cycle(-1); });
        bar.querySelector('[data-prototype-next]').addEventListener('click', function () { cycle(1); });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        var el = document.activeElement;
        if (el && (el.matches('input, textarea, select') || el.isContentEditable)) return;
        /* Not while a section's own arrow has focus - there the arrow keys
           belong to that row, not to the variant switcher. */
        if (el && el.closest && el.closest('.proto-arrow')) return;
        cycle(e.key === 'ArrowRight' ? 1 : -1);
    });

    /* The tray is built and regrouped by main.js (setupFilterBarMoreFilters,
       groupFilterSections) and its rows have no measurable width until it is
       actually open, so a single pass at load would measure a collapsed box.
       Re-measure on anything that can change a row's overflow: opening the
       tray, resizing/rotating, and picking a value (a longer value widens
       its own trigger). Debounced, since a resize fires continuously. */
    var timer = null;
    function schedule() {
        window.clearTimeout(timer);
        timer = window.setTimeout(refresh, 120);
    }
    window.addEventListener('resize', schedule);
    document.addEventListener('click', function (e) {
        if (e.target.closest('.filter-bar-label, .more-filters-toggle, .ui-select')) schedule();
    });
    document.addEventListener('change', function (e) {
        if (e.target.closest('.filter-field')) schedule();
    });

    function init() { build(); apply(currentKey(), false); schedule(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
