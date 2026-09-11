/* Filter bars that talk to the server: the AJAX partial-reload path, and the
   scroll-position restore for the plain-GET ones.

   Both live here because they are the same concern - a filter bar whose stats
   are computed server-side, so changing a field is a round trip rather than an
   in-page filter. A bar opts into AJAX with data-ajax-target="<selector>" on
   the <form class="filter-bar">; without it the form submits normally and the
   restore below is what stops the browser throwing away the scroll position. */

import { closest } from '../dom.js';

// Server-side dashboard filter bars (e.g. SEND & Provision) can opt into
// AJAX partial-reload instead of a full navigation via
// data-ajax-target="<selector>" on the <form class="filter-bar">. On
// change (or a click on .filter-bar-clear inside it), fetches the same
// URL+querystring with X-Requested-With: XMLHttpRequest — the existing
// AJAX convention this codebase already uses for modal content (see
// hubs/inclusion/panel/static/panel/js/panel.js's loadModal(), and the
// is_ajax checks in hubs/inclusion/panel/views.py) — and the view (see
// hubs/inclusion/views.py::inclusion_hub) returns just the target's
// inner HTML fragment instead of the full page. The <form> itself is
// never touched, only the target, so no re-enhancement of its own
// selects/dialogs is needed and nothing about it can be left detached.
// Falls back to a real navigation if the fetch fails — the scroll-restore
// listener above already covers that path's scroll jump, same as before
// this existed.
export function initAjaxFilterBars() {
    document.querySelectorAll('form.filter-bar[data-ajax-target]').forEach(function (form) {
        var target = document.querySelector(form.dataset.ajaxTarget);
        if (!target) return;
        var pendingController = null;

        function load(url) {
            if (pendingController) pendingController.abort();
            var controller = new AbortController();
            pendingController = controller;
            target.classList.add('is-loading');
            // Students' own dimmed tray backdrop (.filter-bar-overlay,
            // panel.css) lives inside this same target so it visually
            // anchors (position: absolute; inset: 0) against its box -
            // but that means the plain target.innerHTML swap below wipes
            // it out along with the old list every time, and the
            // server's AJAX partial response never re-renders it (that
            // markup isn't part of the swapped fragment) - live
            // feedback: "when I apply a filter, the overlay disappears.
            // It should stay till filter tray is closed". Detached here
            // and reinserted after the swap (below) instead of
            // recreating it from a string - keeps the exact same node,
            // including any inline style state main.js's own filter-bar
            // click handler may have set on it (e.g. transitionDuration,
            // above) rather than starting fresh every filter change.
            // null on any other page using this same AJAX mechanism
            // with no such overlay in its markup - harmless no-op below.
            var overlayEl = target.querySelector('.filter-bar-overlay');
            fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, signal: controller.signal })
                .then(function (res) {
                    if (!res.ok) throw new Error('Request failed: ' + res.status);
                    return res.text();
                })
                .then(function (html) {
                    target.innerHTML = html;
                    if (overlayEl) target.insertBefore(overlayEl, target.firstChild);
                    window.enhanceFormControls(target);
                    target.classList.remove('is-loading');
                    history.replaceState(null, '', url);
                    // Header stat strip (.page-subtitle-stats, e.g.
                    // Students' "240 Students · 59 Referrals · 82
                    // Actions") lives outside the ajax-target, so the
                    // innerHTML swap above never touches it - it'd stay
                    // showing the unfiltered totals after a filter
                    // change (live feedback: "adding filters should
                    // update the stats"). Synced here instead of
                    // duplicating the numbers into the response some
                    // other way: every page using this pattern already
                    // repeats the identical .stats-strip .stat-value
                    // markup inside the swapped fragment (its own
                    // footer stats-strip), in the same order - copy
                    // those freshly-rendered values across by position.
                    // No-op wherever the counts don't match 1:1 (a page
                    // with this filter-bar pattern but no header stat
                    // strip, or a mismatched one).
                    var freshStats = target.querySelectorAll('.stats-strip .stat-value');
                    var headerStats = document.querySelectorAll('.page-subtitle-stats .stat-value');
                    if (freshStats.length && freshStats.length === headerStats.length) {
                        headerStats.forEach(function (el, i) { el.textContent = freshStats[i].textContent; });
                    }
                })
                .catch(function (err) {
                    if (err.name === 'AbortError') return;
                    window.location.href = url;
                });
        }

        function loadCurrent() {
            // form.action (no action="" attribute set) resolves to the
            // *current* document URL, query string included — strip it
            // before appending the freshly-built one, or every change
            // after the first would double up the querystring.
            var baseUrl = form.action.split('?')[0];
            load(baseUrl + '?' + new URLSearchParams(new FormData(form)).toString());
        }

        form.addEventListener('change', function (e) {
            // Text/search fields fire live on 'input' below instead —
            // still reacting to their own 'change' here would just
            // re-run the same query a second time on blur.
            if (e.target.matches('input[type=text], input[type=search]')) return;
            loadCurrent();
        });

        // Live-as-typed search (INT-P4's debounced-search precedent,
        // applied to this page-level filter rather than a picker):
        // 250ms after the last keystroke, not on blur/Enter like a
        // plain 'change' would give a text input. 2-char minimum before
        // querying, same as the picker precedent (panel.js) - a single
        // keystroke doesn't narrow a MAT-wide table meaningfully, it
        // just fires a full server round-trip for no benefit. Clearing
        // back to empty still fires immediately below, to reset the list.
        var searchDebounce = null;
        form.querySelectorAll('input[type=text], input[type=search]').forEach(function (input) {
            input.addEventListener('input', function () {
                // A row-click link (Students/Referrals -> Actions, or a
                // search result) may have pinned this form's hidden
                // `student` id field to one exact student (views.py's
                // `_student_id_filter`) - the moment the user edits this
                // box by hand, drop that pin so typing a new search
                // isn't silently ignored in favour of the stale exact
                // match.
                var studentIdField = form.querySelector('input[name=student]');
                if (studentIdField) studentIdField.value = '';
                clearTimeout(searchDebounce);
                if (input.value.trim().length === 1) return;
                searchDebounce = setTimeout(function () {
                    loadCurrent();
                    // A page-level 'change' listener (e.g. Students'
                    // own refreshFilterBarState, wireFilterBarActiveState
                    // in panel.js) is what recomputes the active-filter
                    // count badge - typing alone never fires a real
                    // 'change' event (only blur/Enter do), so without
                    // this the AJAX result already reflected the typed
                    // search while the badge stayed stuck at whatever it
                    // showed before typing started (live feedback: "it
                    // auto filters but does not count in the badge till
                    // I press enter"). Dispatched on the input itself,
                    // not the form (Clear's own synthetic dispatch,
                    // below, targets the form since nothing there needs
                    // to distinguish it) - bubbling still reaches
                    // Students' own filterBar 'change' listener, but
                    // this file's own AJAX 'change' listener (above)
                    // explicitly skips text/search e.target so it
                    // doesn't also re-run loadCurrent() a second,
                    // redundant time right after the one two lines up.
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }, 250);
            });
        });
        form.addEventListener('click', function (e) {
            var clear = closest(e.target, '.filter-bar-clear');
            if (!clear) return;
            e.preventDefault();
            // Unlike a normal filter change - where the control the user
            // just touched already shows its new value - the AJAX swap
            // only ever replaces the target, never the filter bar itself
            // (see the filter-bar branch of DES-L1), so
            // nothing resets the bar's own controls back to "no filter"
            // on Clear Filters. form.reset() looked like the obvious
            // fix but is wrong here: it restores each control's value at
            // *page load*, and the page was server-rendered with these
            // same filters already applied/selected - so on a page
            // that's showing filtered results, reset() is a no-op.
            // Blank every named control explicitly instead, then refresh
            // anything that mirrors a control's value outside the
            // control itself (an enhanced select's trigger button, a
            // toggle-pill's .on class) since setting .value/.checked
            // directly doesn't touch either of those. Skips
            // [data-not-a-filter] fields (see wireFilterBarActiveState in
            // panel.js) - those aren't a filter to clear, just a value
            // that happens to live in the same bar.
            Array.prototype.forEach.call(form.querySelectorAll('select'), function (s) {
                if (closest(s, '[data-not-a-filter]')) return;
                s.value = '';
                if (s._uiSelect) s._uiSelect.refresh();
            });
            Array.prototype.forEach.call(form.querySelectorAll('input[type=checkbox], input[type=radio]'), function (c) {
                c.checked = false;
            });
            Array.prototype.forEach.call(form.querySelectorAll('input[type=text], input[type=search]'), function (t) {
                t.value = '';
            });
            Array.prototype.forEach.call(form.querySelectorAll('.toggle-pill'), function (btn) {
                var input = btn.parentElement && btn.parentElement.querySelector('input[type=checkbox]');
                if (!input) return;
                btn.classList.toggle('on', input.checked);
                btn.setAttribute('aria-pressed', String(input.checked));
            });
            // Lets any page-level `filterBar.addEventListener('change', ...)`
            // (e.g. wireFilterBarActiveState's refresh(), see panel.js)
            // re-derive the active-field highlighting and count badge
            // from the now-blanked controls, the same way it would after
            // a real user-driven change.
            form.dispatchEvent(new Event('change'));
            load(clear.href);
        });
    });
}

// Filter bars (e.g. the SEND & Provision dashboard) submit a plain GET
// form on every change, since their stats are computed server-side —
// that's a full navigation, so the browser resets scroll to the top even
// though the user is just re-filtering in place. Stash the scroll offset
// in sessionStorage right before the change-triggered unload, then
// restore (and clear) it once the new page has settled. Keyed by
// pathname + sessionStorage (not localStorage) since this is a
// same-tab, single-navigation concern, not a durable preference.
//
// Listens for 'change' (capture phase, so it runs before the field's own
// onchange="this.form.submit()") rather than the form's 'submit' event:
// HTMLFormElement.submit() deliberately does NOT fire a submit event
// (only requestSubmit()/a real button click does), so a submit listener
// here would never run.
export function initFilterBarScrollRestore() {
    var SCROLL_KEY = 'filter-scroll:' + location.pathname;
    document.addEventListener('change', function (e) {
        if (!closest(e.target, 'form.filter-bar')) return;
        try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY)); } catch (err) { }
    }, true);
    var stored = null;
    try { stored = sessionStorage.getItem(SCROLL_KEY); } catch (e) { }
    if (stored === null) return;
    try { sessionStorage.removeItem(SCROLL_KEY); } catch (e) { }
    window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () { window.scrollTo(0, parseInt(stored, 10) || 0); });
    });
}
