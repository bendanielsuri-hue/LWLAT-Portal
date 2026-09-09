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
       .filter-section-label. Built once per section and left in the DOM
       when variants change; the CSS decides whether they render. */
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
            btn.addEventListener('click', function () {
                /* 80% of a row, not one field: fields here are content-sized
                   and wildly unequal (a toggle against "Concern Category"),
                   so paging by element would move a different distance every
                   press. A near-full row keeps one field of context. */
                row.scrollBy({ left: (dir === 'prev' ? -1 : 1) * row.clientWidth * 0.8, behavior: 'smooth' });
            });
            if (dir === 'prev') label.insertBefore(btn, label.firstChild);
            else label.appendChild(btn);
        });
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
            if (!row.dataset.protoBound) {
                row.dataset.protoBound = '1';
                row.addEventListener('scroll', function () { update(row); }, { passive: true });
            }
            update(row);
        });
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
