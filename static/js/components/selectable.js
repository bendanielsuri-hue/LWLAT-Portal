/* Selectable cards/rows: clicking (or Enter/Space on) a card toggles a
   "chosen" state, without firing when the click lands on an inner link or
   button.

   Takes a root so a page that swaps in a fresh [data-selectable] list via AJAX
   can re-wire just that subtree. main.js still assigns it onto window for
   exactly that reason - panel's home.html calls it after a fragment swap, from
   an inline <script> that becomes a module in #212. */

import { closest } from './dom.js';

export function initSelectable(root) {
(root || document).querySelectorAll('[data-selectable]').forEach(function (container) {
    var single = container.dataset.selectable === 'single';

    function toggle(item) {
        var isChosen = item.classList.contains('chosen');
        if (single && !isChosen) {
            container.querySelectorAll('.selectable.chosen').forEach(function (other) {
                other.classList.remove('chosen');
                other.setAttribute('aria-pressed', 'false');
            });
        }
        item.classList.toggle('chosen', !isChosen);
        item.setAttribute('aria-pressed', String(!isChosen));
    }

    container.addEventListener('click', function (e) {
        if (closest(e.target, 'a, button')) return;
        var item = closest(e.target, '.selectable');
        if (!item || !container.contains(item)) return;
        toggle(item);
    });
    container.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (closest(e.target, 'a, button')) return;
        var item = closest(e.target, '.selectable');
        if (!item || !container.contains(item)) return;
        e.preventDefault();
        toggle(item);
    });
});
}
