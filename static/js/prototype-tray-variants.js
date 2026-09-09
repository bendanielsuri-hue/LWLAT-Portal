/* PROTOTYPE - throwaway, never merge to main.
   Branch: prototype/tray-section-fill-variants. Floating switcher for the
   tray-section states in prototype-tray-variants.css, plus the measuring
   half of the "bal" state.

   ?tray=now|mid|bal|both in the URL, mirrored to localStorage so the choice
   survives the filter form's own GET submits (which rebuild the query
   string from the form's fields and would otherwise drop it). Left/right
   arrow keys cycle too, except while typing in a field. */
(function () {
    var VARIANTS = [
        { key: 'now', name: 'today, untouched' },
        { key: 'mid', name: 'centre the line' },
        { key: 'bal', name: 'balanced breaks' },
        { key: 'both', name: 'balanced + centred' }
    ];
    var STORE = 'prototypeTrayVariant';

    /* Balanced breaks.

       Read the natural wrap first (fields sharing an offsetTop are on a
       line), because the balanced split depends on how many actually fit,
       which depends on the viewport and on how wide each trigger has been
       sized to its own value - neither of which is knowable up front.

       n fields over L natural lines wants ceil(n / L) per line: 5 over 2
       lines is 3 + 2, 7 over 3 is 3 + 3 + 1. Then a break goes before every
       (per)th field.

       Verified after inserting, not assumed: if the forced split asks for
       more per line than genuinely fits, the browser wraps anyway and the
       group ends up with MORE lines than it started with, which is worse
       than the ragged edge being fixed. In that case the breaks come back
       out and the group keeps its natural wrap. */
    function balance(group) {
        clearBreaks(group);
        var fields = Array.prototype.slice.call(group.querySelectorAll(':scope > .filter-field'));
        if (fields.length < 3) return;
        var lines = countLines(fields);
        if (lines < 2) return;
        var per = Math.ceil(fields.length / lines);
        if (per >= fields.length) return;
        for (var i = per; i < fields.length; i += per) {
            var br = document.createElement('span');
            br.className = 'proto-line-break';
            group.insertBefore(br, fields[i]);
        }
        if (countLines(fields) > lines) clearBreaks(group);
    }

    function countLines(fields) {
        var tops = {};
        fields.forEach(function (f) { tops[Math.round(f.offsetTop)] = 1; });
        return Object.keys(tops).length;
    }

    function clearBreaks(group) {
        Array.prototype.forEach.call(group.querySelectorAll(':scope > .proto-line-break'), function (b) {
            b.remove();
        });
    }

    function rebalance() {
        var key = document.documentElement.dataset.trayVariant;
        document.querySelectorAll('.filter-bar-sections .filter-group-fields').forEach(function (group) {
            if (key === 'bal' || key === 'both') balance(group);
            else clearBreaks(group);
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
        rebalance();
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
            '<span data-prototype-label style="min-width:150px;text-align:center"></span>' +
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
        cycle(e.key === 'ArrowRight' ? 1 : -1);
    });

    /* The tray is built and regrouped by main.js (setupFilterBarMoreFilters,
       groupFilterSections) and its fields have no measurable width until it
       is actually open, so a single pass at load would measure a collapsed
       box. Re-run on anything that can change the wrap: opening the tray,
       resizing/rotating, and picking a value (a longer value can widen its
       own trigger). Debounced, since a resize fires continuously. */
    var timer = null;
    function schedule() {
        window.clearTimeout(timer);
        timer = window.setTimeout(rebalance, 120);
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
