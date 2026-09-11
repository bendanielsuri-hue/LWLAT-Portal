/* Filter bars that talk to the server: the AJAX partial-reload path, and the
   scroll-position restore for the plain-GET ones.

   Both live here because they are the same concern - a filter bar whose stats
   are computed server-side, so changing a field is a round trip rather than an
   in-page filter. A bar opts into AJAX with data-ajax-target="<selector>" on
   the <form class="filter-bar">; without it the form submits normally and the
   restore below is what stops the browser throwing away the scroll position. */

import { closest } from '../dom.js';
import { enhanceFormControls } from '../form-controls.js';

// A bar opts in with data-ajax-target="<selector>" on the <form
// class="filter-bar">. On change (or a click on .filter-bar-clear inside
// it), fetches the same URL+querystring with X-Requested-With:
// XMLHttpRequest — the AJAX convention this codebase already uses for modal
// content — and the view returns just the target's inner HTML fragment
// instead of the full page. The <form> itself is never touched, only the
// target, so its own selects and dialogs need no re-enhancement and nothing
// about it can be left detached. Falls back to a real navigation if the
// fetch fails; initFilterBarScrollRestore (below) covers that path's scroll
// jump.
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
            // The dimmed tray backdrop (.filter-bar-overlay) lives inside this
            // same target so it can anchor (position: absolute; inset: 0)
            // against its box - which means the innerHTML swap below wipes it
            // out with the old list, and the server's partial never re-renders
            // it. Detached here and reinserted after the swap rather than
            // recreated from a string, so it keeps the exact same node and any
            // inline style state the tray's click handler set on it. null on a
            // page with no such overlay - a harmless no-op below.
            var overlayEl = target.querySelector('.filter-bar-overlay');
            fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, signal: controller.signal })
                .then(function (res) {
                    if (!res.ok) throw new Error('Request failed: ' + res.status);
                    return res.text();
                })
                .then(function (html) {
                    target.innerHTML = html;
                    if (overlayEl) target.insertBefore(overlayEl, target.firstChild);
                    enhanceFormControls(target);
                    target.classList.remove('is-loading');
                    history.replaceState(null, '', url);
                    // The header stat strip (.page-subtitle-stats) lives
                    // outside the ajax-target, so the swap above never
                    // touches it and it would keep showing unfiltered
                    // totals. Synced by position rather than by duplicating
                    // the numbers into the response: every page using this
                    // pattern already repeats the identical .stats-strip
                    // .stat-value markup inside the swapped fragment, in the
                    // same order. No-op wherever the counts don't match 1:1.
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
                    // A page-level 'change' listener (wireFilterBarActiveState's
                    // refresh) is what recomputes the active-filter count
                    // badge, and typing alone never fires a real 'change' -
                    // only blur and Enter do - so without this the results
                    // reflect the typed search while the badge stays stuck.
                    // Dispatched on the input, not the form: bubbling still
                    // reaches the page's filterBar listener, while this file's
                    // own AJAX 'change' listener above skips text/search
                    // targets and so doesn't re-run loadCurrent() redundantly.
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }, 250);
            });
        });
        form.addEventListener('click', function (e) {
            var clear = closest(e.target, '.filter-bar-clear');
            if (!clear) return;
            e.preventDefault();
            // The AJAX swap only ever replaces the target, never the filter
            // bar itself (DES-L1, filter bar branch), so nothing resets the
            // bar's controls on Clear Filters. form.reset() is the obvious
            // fix and is wrong: it restores each control's value at PAGE
            // LOAD, and the page was server-rendered with these filters
            // already selected - so on a page showing filtered results it is
            // a no-op. Blank every named control explicitly instead, then
            // refresh anything mirroring a control's value outside the
            // control (an enhanced select's trigger, a toggle-pill's .on
            // class), since setting .value/.checked touches neither. Skips
            // [data-not-a-filter]: not a filter to clear, just a value that
            // happens to live in the same bar.
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
            // re-derive the active-field highlighting and count badge from
            // the now-blanked controls, as after a real user-driven change.
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
