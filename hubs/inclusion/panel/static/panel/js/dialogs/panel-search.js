/* #panel-search-dialog (#211) - the last of panel.js's nine independent
   dialog IIFEs. Untangled on the way out: this used to be nested *inside*
   the DOMContentLoaded callback that wired initMemberPicker/
   initExpertiseFields (which never actually closed before this IIFE
   opened) - taxonomy.md §6 flagged it as the one dialog needing care
   rather than a pure copy-paste. It shares no state with that callback
   (nothing in here reads anything the DOMContentLoaded body set up), so
   this is a real independent top-level IIFE now, same shape as every
   sibling dialog module. */

import { closeModalWithFadeOut, animateModalHeightChange } from '../../../js/components/modal.js';

(function () {
    var dialog = document.getElementById('panel-search-dialog');
    if (!dialog) return;

    var input = document.getElementById('panel-search-input');
    var results = document.getElementById('panel-search-results');
    var kindLabels = { student: 'Students', staff: 'Staff' };
    var debounceTimer = null;
    // Shown before typing anything (and again once the box is cleared)
    // rather than leaving `results` truly empty - the dialog no longer has a
    // fixed height (see dialog#panel-search-dialog[open], panel.css), so a
    // genuinely empty results area would collapse it down to just the
    // search field the instant it opens, then jump back to full size once
    // there's something to show. Reserving this one line of height up
    // front means it only ever settles once.
    var IDLE_HTML = '<p class="empty-note">Start typing to search students and staff…</p>';

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getTransitionSlowMs() {
        return parseFloat(getComputedStyle(dialog).getPropertyValue('--transition-slow')) || 400;
    }

    // Every results swap after the dialog is already open goes through
    // animateModalHeightChange, same as every other modal in the app whose
    // content changes shape at runtime - the
    // dialog now grows/shrinks with the live result count instead of
    // staying pinned to a fixed height regardless of content.
    function setResults(html) {
        animateModalHeightChange(dialog, function () { results.innerHTML = html; });
    }

    function openModal() {
        // Not wrapped in setResults: the dialog isn't open yet, so there's
        // nothing to animate from - animateModalHeightChange would just call
        // its mutate callback directly anyway (see its own !dialog.open
        // guard), this skips the pointless measure/pin work.
        results.innerHTML = IDLE_HTML;
        dialog.showModal();
        requestAnimationFrame(function () {
            dialog.classList.add('is-open');
            input.focus();
        });
    }

    function closeModal() {
        closeModalWithFadeOut(dialog);
    }

    function renderResults(items) {
        if (!items.length) {
            setResults('<p class="empty-note">No matches found.</p>');
            return;
        }
        var groups = {};
        items.forEach(function (item) {
            (groups[item.kind] = groups[item.kind] || []).push(item);
        });
        var html = '';
        ['student', 'staff'].forEach(function (kind) {
            if (!groups[kind]) return;
            html += '<div class="search-result-group">';
            html += '<h3 class="search-result-group-label">' + kindLabels[kind] + '</h3>';
            groups[kind].forEach(function (item) {
                html += '<div class="search-result-row">';
                html += '<div class="search-result-text">';
                html += '<span class="search-result-title">' + escapeHtml(item.title) + '</span>';
                html += '<span class="search-result-subtitle">' + escapeHtml(item.subtitle) + '</span>';
                html += '</div>';
                html += '<div class="btn-row">';
                item.links.forEach(function (link) {
                    if (link.disabled) {
                        html += '<span class="btn btn-sm btn-disabled" aria-disabled="true">' + escapeHtml(link.label) + '</span>';
                    } else {
                        html += '<a class="btn btn-sm" href="' + escapeHtml(link.url) + '">' + escapeHtml(link.label) + '</a>';
                    }
                });
                html += '</div>';
                html += '</div>';
            });
            html += '</div>';
        });
        setResults(html);
    }

    function runSearch(q) {
        fetch('/inclusion/panel/search/?q=' + encodeURIComponent(q), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.json(); })
            .then(function (data) { renderResults(data.results); });
    }

    input.addEventListener('input', function () {
        var q = input.value.trim();
        clearTimeout(debounceTimer);
        if (q.length === 0) {
            setResults(IDLE_HTML);
            return;
        }
        if (q.length === 1) {
            debounceTimer = setTimeout(function () {
                setResults('<p class="empty-note search-hint">Keep typing… (2+ characters)</p>');
            }, getTransitionSlowMs());
            return;
        }
        debounceTimer = setTimeout(function () { runSearch(q); }, 250);
    });

    document.addEventListener('click', function (e) {
        if (e.target.closest('[data-panel-search-trigger]')) {
            openModal();
            return;
        }
        if (e.target.closest('[data-modal-close]') && e.target.closest('#panel-search-dialog')) {
            closeModal();
        }
    });

    dialog.addEventListener('click', function (e) {
        if (e.target === dialog) closeModal();
    });
})();
