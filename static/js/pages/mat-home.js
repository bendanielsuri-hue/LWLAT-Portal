/* The MAT home screen's hub cards.

   pages/ rather than components/ or layout/: hub cards exist on exactly one
   page. Everything its neighbours in layout/ do happens on every page. */

import { closest } from '../components/dom.js';
import { initSelectable } from '../components/selectable.js';

// Make the top section of each hub card clickable, without double-navigating when an inner link/button is clicked
export function initMatHome() {
    document.querySelectorAll('.hub-card-top').forEach(function (top) {
        var url = top.dataset.url;
        if (!url) return;
        top.addEventListener('click', function (e) {
            if (closest(e.target, 'a, button')) return;
            window.location.href = url;
        });
        top.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            if (closest(e.target, 'a, button')) return;
            e.preventDefault();
            window.location.href = url;
        });
    });

    initSelectable();

    // "+N more" toggles the hidden apps within a card instead of navigating to the hub
    document.querySelectorAll('.hub-more-toggle').forEach(function (btn) {
        var countEl = btn.querySelector('.hub-more-toggle-count');
        // Sits below .hub-card-items (not inside it - live feedback, see
        // cards.css) so the container it toggles is a previous sibling, not
        // an ancestor.
        var container = btn.previousElementSibling;
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!container) return;
            var expanded = container.classList.toggle('expanded');
            var moreCount = btn.dataset.moreCount || '0';
            countEl.textContent = expanded ? 'Show less' : ('+' + moreCount + ' more');
        });
    });
}
