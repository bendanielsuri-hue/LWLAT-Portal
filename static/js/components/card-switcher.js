/* Card switcher: a row of .card-tab buttons that swaps which .switch-card is
   showing. A component - a page can have several, and it carries no vocabulary
   about what the cards contain. */

// Generic card switcher: pairs a .card-switcher (row of .card-tab buttons,
// each with data-card-target="<id>") with a group of full-size "cards"
// elsewhere on the page sharing class .switch-card. Below the breakpoint
// that hides a page's normal side-by-side card layout (see the
// .switch-card-group media query in style.css), clicking a tab shows the
// matching card and hides the others. Reusable sitewide — any page can
// adopt this by following the same markup convention, not just Inclusion
// Panel Home.
export function initCardSwitchers() {
    document.querySelectorAll('.card-switcher').forEach(function (switcher) {
        var buttons = switcher.querySelectorAll('.card-tab');
        buttons.forEach(function (button, newIdx) {
            button.addEventListener('click', function () {
                // Read before the class swap below — which way the card
                // should slide (see .switch-card-enter-left/right, style.css)
                // depends on where the newly-picked tab sits relative to
                // whichever one was active before this click.
                var oldIdx = Array.prototype.findIndex.call(buttons, function (b) {
                    return b.classList.contains('active');
                });

                buttons.forEach(function (b) { b.classList.remove('active'); });
                button.classList.add('active');
                // Scoped to this button's own .switch-card-group (found via its
                // target card), not every .switch-card on the page - a page can
                // have more than one switcher/group pair (#116, Panel Home's Row
                // 1 and Row 2), and a global query here would toggle every other
                // group's active-card off too on each click.
                var targetCard = document.getElementById(button.dataset.cardTarget);
                var group = targetCard ? targetCard.closest('.switch-card-group') : null;
                var scope = group || document;
                if (group && oldIdx >= 0 && oldIdx !== newIdx) {
                    group.setAttribute('data-switch-dir', newIdx > oldIdx ? 'right' : 'left');
                }
                scope.querySelectorAll('.switch-card').forEach(function (card) {
                    card.classList.toggle('active-card', card.id === button.dataset.cardTarget);
                });
                // The now-visible card's own tab row (if any) may have been
                // measured while display:none and reported zero width —
                // force a re-measure now that it's actually visible.
                window.dispatchEvent(new Event('resize'));
            });
        });
    });
}
