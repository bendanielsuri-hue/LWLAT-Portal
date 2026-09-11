/* #discussion-summary-dialog (#211) - one of panel.js's nine independent
   dialog IIFEs, mechanical to extract since none of them share state
   (taxonomy.md §6). No window.* export needed here unlike its sibling
   dialogs: nothing outside this file calls openDiscussionSummaryModal by
   name - the only trigger is the delegated [data-open-discussion-summary-
   trigger] click below, in the same module. */

import { closeModalWithFadeOut } from '../../../js/components/modal.js';

(function () {
    var dialog = document.getElementById('discussion-summary-dialog');
    if (!dialog) return;

    function closeModal() {
        closeModalWithFadeOut(dialog);
    }

    function openDiscussionSummaryModal(panelReferralId) {
        var url = '/inclusion/panel/panel-referral/' + encodeURIComponent(panelReferralId) + '/discussion-summary/';
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.text(); })
            .then(function (html) {
                dialog.innerHTML = html;
                dialog.showModal();
                requestAnimationFrame(function () { dialog.classList.add('is-open'); });
            });
    }

    document.addEventListener('click', function (e) {
        if (e.target.closest('[data-open-discussion-summary-trigger]')) {
            var trigger = e.target.closest('[data-open-discussion-summary-trigger]');
            openDiscussionSummaryModal(trigger.dataset.panelReferralId);
            return;
        }
        if (e.target.closest('[data-modal-close]') && e.target.closest('#discussion-summary-dialog')) {
            closeModal();
        }
    });
    dialog.addEventListener('click', function (e) {
        if (e.target === dialog) closeModal();
    });
})();
