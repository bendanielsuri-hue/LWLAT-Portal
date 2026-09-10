/* App search: client-side typeahead over every hub/page link.

   Layout tier - it is part of layout.html's chrome and there is one per
   surface, not one per element. The data comes from {{ search_items|json_script }}
   embedded sitewide in layout.html, so no request is made per keystroke. */

import { closest } from '../components/dom.js';

// Small inline icons for the search results' hub label — kept here rather than
// round-tripped through the server, since the result rows are built in JS from
// the {{ search_items|json_script }} data, not server-rendered templates. Mirrors
// the corresponding templates/icons/*_svg.html partials, just at a smaller size.
var HUB_RESULT_ICONS = {
    'Staff': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 20a7 7 0 0 1 14 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    'Operations': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M12 2.5v2.6M12 18.9v2.6M4.2 6.2l1.9 1.5M17.9 16.3l1.9 1.5M2.5 12h2.6M18.9 12h2.6M4.2 17.8l1.9-1.5M17.9 7.7l1.9-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    'Resources': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7L12 3.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4.5 7.7L12 12l7.5-4.3M12 12v8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    'Student': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.3c-1.9-1.4-4.4-1.9-6.8-1.4v12.8c2.4-.5 4.9 0 6.8 1.4 1.9-1.4 4.4-1.9 6.8-1.4V4.9c-2.4-.5-4.9 0-6.8 1.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 6.3v12.8" stroke="currentColor" stroke-width="1.6"/></svg>',
    'SEND & Provision': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20.5s-8-4.6-8-10.8A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8 3.1c0 6.2-8 10.8-8 10.8z" fill="currentColor"/></svg>',
    'Registers': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="3.5" width="14" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="9" y="2" width="6" height="3" rx="1" fill="currentColor"/><path d="M8.5 11.2l1.6 1.6L13 9.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 16.5h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    'Careers': '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="8" width="18" height="12" rx="2" fill="currentColor"/><path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
};

// App search: client-side typeahead over every hub/page link, built from the JSON
// embedded sitewide via {{ search_items|json_script }} in layout.html. Used both by
// the home screen's own search box and the one inside the "Switch Hub" overlay.
function setupAppSearch(inputId, resultsId, dataId) {
    var input = document.getElementById(inputId);
    var results = document.getElementById(resultsId);
    var dataEl = document.getElementById(dataId);
    if (!input || !results || !dataEl) return;

    var items = [];
    try { items = JSON.parse(dataEl.textContent) || []; } catch (e) { }

    function closeResults() {
        results.classList.add('hidden');
        results.innerHTML = '';
    }

    function render(matches) {
        results.innerHTML = '';
        if (!matches.length) {
            var empty = document.createElement('div');
            empty.className = 'app-search-empty';
            empty.textContent = 'No matching apps';
            results.appendChild(empty);
        } else {
            matches.forEach(function (item, index) {
                var row = document.createElement('div');
                row.className = 'app-search-result' + (index === 0 ? ' active' : '');
                row.setAttribute('role', 'option');
                row.dataset.url = item.url;

                var name = document.createElement('span');
                name.className = 'app-search-result-name';
                name.textContent = item.name;
                row.appendChild(name);

                var hub = document.createElement('span');
                hub.className = 'app-search-result-hub';
                hub.innerHTML = (HUB_RESULT_ICONS[item.hub] || '') + '<span></span>';
                hub.querySelector('span').textContent = item.hub;
                row.appendChild(hub);

                row.addEventListener('click', function () { window.location.href = item.url; });
                row.addEventListener('mouseenter', function () {
                    var active = results.querySelector('.app-search-result.active');
                    if (active) active.classList.remove('active');
                    row.classList.add('active');
                });
                results.appendChild(row);
            });
        }
        results.classList.remove('hidden');
    }

    function search(query) {
        query = query.trim().toLowerCase();
        if (!query) { closeResults(); return; }
        var matches = items.filter(function (item) {
            return item.name.toLowerCase().indexOf(query) !== -1 || item.hub.toLowerCase().indexOf(query) !== -1;
        }).slice(0, 8);
        render(matches);
    }

    input.addEventListener('input', function () { search(input.value); });

    // Each row's own mouseenter (above) moves .active onto itself as the
    // mouse crosses rows, but nothing ever removed it again once the
    // cursor left the list entirely - the primary-fill highlight stuck
    // on whichever row was last hovered even after moving away, reading
    // as though it were still selected. Bound once here (not inside
    // render(), which tears down and rebuilds `results`' children, but
    // never `results` itself) rather than re-attached on every render.
    results.addEventListener('mouseleave', function () {
        var active = results.querySelector('.app-search-result.active');
        if (active) active.classList.remove('active');
    });

    input.addEventListener('keydown', function (e) {
        var rows = Array.prototype.slice.call(results.querySelectorAll('.app-search-result'));
        if (!rows.length) {
            if (e.key === 'Escape') closeResults();
            return;
        }
        var activeIndex = rows.findIndex(function (r) { return r.classList.contains('active'); });

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (activeIndex >= 0) rows[activeIndex].classList.remove('active');
            activeIndex = (activeIndex + 1) % rows.length;
            rows[activeIndex].classList.add('active');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (activeIndex >= 0) rows[activeIndex].classList.remove('active');
            activeIndex = (activeIndex - 1 + rows.length) % rows.length;
            rows[activeIndex].classList.add('active');
        } else if (e.key === 'Enter') {
            e.preventDefault();
            var target = activeIndex >= 0 ? rows[activeIndex] : rows[0];
            if (target && target.dataset.url) window.location.href = target.dataset.url;
        } else if (e.key === 'Escape') {
            closeResults();
        }
    });

    document.addEventListener('click', function (e) {
        if (!results.classList.contains('hidden') && !closest(e.target, '.app-search')) closeResults();
    });
}

/* Two instances: the home screen's own box, and the one inside the "Switch
   Hub" overlay. Both read the same embedded data. */
export function initAppSearch() {
    setupAppSearch('app-search-input', 'app-search-results', 'app-search-data');
    setupAppSearch('rail-app-search-input', 'rail-app-search-results', 'app-search-data');
}
