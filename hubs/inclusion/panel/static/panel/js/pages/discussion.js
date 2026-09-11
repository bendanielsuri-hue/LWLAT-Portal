/* Panel Discussion's own page behavior (#212 - moved out of discussion.html's
   three inline <script> blocks, ADR 0021). One page, one entry module.

   The leave-confirmation warning used to be ~35 lines wrapped in
   {% if panel_referral.discussion_status == 'pending' and
   panel_referral.discussion_started_at %} - template control flow deciding
   whether the JS existed at all, which ADR 0021 rules out. #leave-confirm-
   dialog is unconditionally rendered, so it now carries that same condition
   as data-discussion-active and the module branches on it instead. */

import { closeModalWithFadeOut } from '../../../js/components/modal.js';
import { initDiscussionTimers } from '../components/discussion-timer.js';

document.addEventListener('DOMContentLoaded', function () {
    initDiscussionTimers();

    // Only rendered at all when the view has already decided this load is
    // the actual start-of-discussion moment for today's specific meeting
    // (see inclusion_panel_discussion's show_safeguarding_modal) - same
    // auto-open convention as meeting_agenda.html's attendance-dialog.
    var safeguardingDialog = document.getElementById('safeguarding-briefing-dialog');
    if (safeguardingDialog) {
        safeguardingDialog.showModal();
        requestAnimationFrame(function () { safeguardingDialog.classList.add('is-open'); });

        safeguardingDialog.addEventListener('click', function (e) {
            if (e.target === safeguardingDialog || e.target.closest('[data-modal-close]')) {
                closeModalWithFadeOut(safeguardingDialog);
            }
        });

        // Strip ?discussion_started=1 from the address bar so a later refresh
        // of this same page (which resends whatever query string is in the
        // URL) doesn't re-pop the modal - only the original start_discussion
        // redirect should ever trigger it.
        if (window.history && window.history.replaceState) {
            var url = new URL(window.location.href);
            url.searchParams.delete('discussion_started');
            window.history.replaceState(null, '', url);
        }
    }

    var endDialog = document.getElementById('end-discussion-dialog');
    if (!endDialog) return;

    var leaveDialog = document.getElementById('leave-confirm-dialog');
    var discussionActive = leaveDialog && leaveDialog.dataset.discussionActive === 'true';

    var endForm = document.getElementById('end-discussion-form');
    var toggleBtns = endDialog.querySelectorAll('.followup-toggle-btn');
    var followupInput = document.getElementById('requires-followup-input');
    var dateGroup = document.getElementById('follow-up-date-group');
    var intervalSelect = document.getElementById('follow-up-interval');
    var customDateGroup = document.getElementById('follow-up-date-custom-group');
    var customDateInput = document.getElementById('follow-up-date-custom');
    var dateInput = document.getElementById('follow-up-date');
    var confirmBtn = document.getElementById('confirm-end-discussion-btn');
    var isSubmitting = false;
    var isNavigating = false;

    function todayPlusDays(days) {
        var d = new Date();
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
    }

    function closeDialog(dialog) {
        closeModalWithFadeOut(dialog);
    }
    function openDialog(dialog) {
        dialog.showModal();
        requestAnimationFrame(function () { dialog.classList.add('is-open'); });
    }
    function openEndDialog() {
        openDialog(endDialog);
        updateConfirmState();
    }
    function updateConfirmState() {
        var requiresFollowup = followupInput.value === 'yes';
        var hasChoice = followupInput.value === 'yes' || followupInput.value === 'no';
        dateGroup.hidden = !requiresFollowup;
        // (INT-U3) The reason moves with the state - the two ways this
        // button can be blocked have different fixes, so a single static
        // reason would be wrong half the time. wireDisabledTooltips
        // (main.js) mirrors whichever is current onto the hoverable
        // wrapper; the button itself can't show a tooltip while disabled.
        if (!hasChoice) {
            confirmBtn.disabled = true;
            confirmBtn.dataset.disabledReason = 'Choose whether a follow-up is needed first';
        } else if (requiresFollowup) {
            confirmBtn.disabled = !dateInput.value;
            confirmBtn.dataset.disabledReason = 'Pick a follow-up date first';
        } else {
            confirmBtn.disabled = false;
        }
    }

    toggleBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            toggleBtns.forEach(function (b) { b.classList.remove('btn-secondary'); });
            btn.classList.add('btn-secondary');
            followupInput.value = btn.dataset.value;
            updateConfirmState();
        });
    });
    intervalSelect.addEventListener('change', function () {
        var val = intervalSelect.value;
        var isOther = val === 'other';
        customDateGroup.hidden = !isOther;
        if (isOther) {
            dateInput.value = customDateInput.value;
        } else if (!val) {
            dateInput.value = '';
        } else if (/^\d+$/.test(val)) {
            dateInput.value = todayPlusDays(parseInt(val, 10));
        } else {
            // Next Half Term/Next Term options carry an already-computed
            // ISO date (server-side, from core.term_dates) as their value.
            dateInput.value = val;
        }
        updateConfirmState();
    });
    ['input', 'change'].forEach(function (evt) {
        customDateInput.addEventListener(evt, function () {
            dateInput.value = customDateInput.value;
            updateConfirmState();
        });
    });
    document.addEventListener('submit', function () { isSubmitting = true; }, true);

    document.addEventListener('click', function (e) {
        if (e.target.closest('[data-open-end-discussion]')) {
            openEndDialog();
            return;
        }
        if (e.target.closest('[data-modal-close]') && e.target.closest('#end-discussion-dialog')) {
            closeDialog(endDialog);
        }
    });
    endDialog.addEventListener('click', function (e) {
        if (e.target === endDialog) closeDialog(endDialog);
    });

    if (discussionActive) {
        // An active discussion timer is running - confirm before any in-app link navigates away.
        // Scoped to discussion_started_at (not just discussion_status=='pending', which is
        // also true for a referral that's on the agenda but was never opened/started) so the
        // warning only fires while a discussion is genuinely in progress.
        var pendingHref = null;

        document.addEventListener('click', function (e) {
            if (isSubmitting) return;
            var link = e.target.closest('a[href]');
            if (!link || endDialog.contains(link) || leaveDialog.contains(link)) return;
            e.preventDefault();
            pendingHref = link.href;
            openDialog(leaveDialog);
        }, true);

        document.getElementById('leave-confirm-yes').addEventListener('click', function () {
            closeDialog(leaveDialog);
            openEndDialog();
        });
        document.getElementById('leave-confirm-no').addEventListener('click', function () {
            closeDialog(leaveDialog);
            isNavigating = true;
            if (pendingHref) window.location.href = pendingHref;
        });
        leaveDialog.addEventListener('click', function (e) {
            if (e.target === leaveDialog || e.target.closest('[data-modal-close]')) closeDialog(leaveDialog);
        });

        window.addEventListener('beforeunload', function (e) {
            if (isSubmitting || isNavigating) return;
            e.preventDefault();
            e.returnValue = '';
        });
    }
});
