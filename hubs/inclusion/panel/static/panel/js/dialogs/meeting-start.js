/* #meeting-start-dialog (#211) - one of panel.js's nine independent dialog
   IIFEs, mechanical to extract since none of them share state
   (taxonomy.md §6). Only declared on Panel Meetings (meetings.html), so
   this module no-ops (early return) everywhere else - same guard every
   sibling dialog module uses. */

import { closeModalWithFadeOut, animateModalHeightChange } from '../../../js/components/modal.js';

(function () {
    var dialog = document.getElementById('meeting-start-dialog');
    if (!dialog) return;

    function closeDialog() {
        closeModalWithFadeOut(dialog);
    }

    function openDialog(panelId) {
        dialog.dataset.panelId = panelId;
        fetch('/inclusion/panel/meetings/' + encodeURIComponent(panelId) + '/attendance/', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
            .then(function (res) { return res.text(); })
            .then(function (html) {
                dialog.innerHTML = html;
                dialog.showModal();
                requestAnimationFrame(function () { dialog.classList.add('is-open'); });
            });
    }

    document.addEventListener('click', function (e) {
        var trigger = e.target.closest('[data-open-meeting-start-trigger]');
        if (trigger) {
            openDialog(trigger.dataset.panelId);
            return;
        }
        if (e.target.closest('[data-modal-close]') && e.target.closest('#meeting-start-dialog')) {
            closeDialog();
        }
    });

    dialog.addEventListener('click', function (e) {
        if (e.target === dialog) closeDialog();
    });

    dialog.addEventListener('submit', function (e) {
        var form = e.target.closest('[data-attendance-ajax-form]');
        if (!form) return;
        e.preventDefault();

        fetch(form.action, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: new FormData(form),
        }).then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.started) {
                    window.location = '/inclusion/panel/meetings/' + dialog.dataset.panelId + '/agenda/';
                    return;
                }
                animateModalHeightChange(dialog, function () { dialog.innerHTML = data.html; });
            });
    });
})();
