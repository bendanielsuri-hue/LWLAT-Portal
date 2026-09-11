/* Panel Agenda's own page behavior (#212 - moved out of meeting_agenda.html's
   six inline <script> blocks, ADR 0021). One page, one entry module.

   The two discussion-timer blocks the inline version had (one for
   #panel-timer, one generic .discussion-timer[data-started-at] sweep) merge
   into initDiscussionTimers (components/discussion-timer.js) - meeting_agenda.html
   now renders #panel-timer's own data-started-at attribute (only present once
   the panel has actually started, matching the old block's own
   {% if panel.started_at %} guard) instead of a second copy of the same
   ticking logic keyed off an id. */

import { closeModalWithFadeOut } from '../../../js/components/modal.js';
import { initDragReorder } from '../../../js/components/drag-reorder.js';
import { initDiscussionTimers } from '../components/discussion-timer.js';

document.addEventListener('DOMContentLoaded', function () {
    // The Panel Members Register mirrors the Panel Group's live roster (see
    // _panel_member_roster in views.py) - "Manage Members" opens the same
    // shared group modal used elsewhere, which dispatches panel-group:updated
    // on every change. Refetch this page and swap the register in, same
    // pattern used on Panel Agenda Setup for its own Members section.
    document.addEventListener('panel-group:updated', function (e) {
        var detail = e.detail;
        // The group id lives on the "Edit Group" trigger's own data-group-id
        // (already rendered for that button's disabled-state logic) rather
        // than a second copy of {{ panel.panel_group_id }} here.
        var trigger = document.querySelector('[data-open-group-edit-trigger]');
        var panelGroupId = trigger ? trigger.getAttribute('data-group-id') : '';
        if (!detail || String(detail.id) !== panelGroupId) return;
        fetch(window.location.pathname, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.text(); })
            .then(function (html) {
                var doc = new DOMParser().parseFromString(html, 'text/html');
                // Two independent lists now (the attendance-dialog's full roster and
                // the sidebar's compact/readonly one) - refresh whichever are present
                // by matching their data-panel-members-list value, not just the first.
                document.querySelectorAll('[data-panel-members-list]').forEach(function (oldList) {
                    var key = oldList.getAttribute('data-panel-members-list');
                    var freshList = doc.querySelector('[data-panel-members-list="' + key + '"]');
                    if (freshList) oldList.replaceWith(freshList);
                });
            });
    });

    initDiscussionTimers();

    // The attendance-dialog only exists in the DOM at all when can_start_meeting
    // is true (see meeting_agenda.html), which already implies the panel is
    // pre-start - everyone else sees no trigger and no way to open it, and
    // there's nothing to auto-open for. Auto-opens on every load, same as
    // the old schedule-warning-dialog it replaced; "View Agenda" or the
    // backdrop dismisses it, and the toolbar/sidebar triggers reopen it.
    var attendanceDialog = document.getElementById('attendance-dialog');
    if (attendanceDialog) {
        function openAttendanceDialog() {
            attendanceDialog.showModal();
            requestAnimationFrame(function () { attendanceDialog.classList.add('is-open'); });
        }
        openAttendanceDialog();
        document.querySelectorAll('[data-open-attendance-trigger]').forEach(function (trigger) {
            trigger.addEventListener('click', openAttendanceDialog);
        });
        attendanceDialog.addEventListener('click', function (e) {
            if (e.target.closest('[data-modal-close]') || e.target === attendanceDialog) {
                closeModalWithFadeOut(attendanceDialog);
            }
        });
    }

    // Live counterpart to the backstop sweep (_sync_stale_running_panels) -
    // see #inactivity-poll-root's own comment in meeting_agenda.html for the
    // full picture. Only present at all when can_manage_running (this viewer
    // could act on a warning), so an absent root is the normal case on most
    // loads, not an error.
    var pollRoot = document.getElementById('inactivity-poll-root');
    if (pollRoot) {
        var pollUrl = pollRoot.dataset.pollUrl;
        var warningLeadSeconds = parseInt(pollRoot.dataset.warningLeadSeconds, 10);
        var inactivityDialog = document.getElementById('inactivity-warning-dialog');
        var countdownEl = document.getElementById('inactivity-countdown');
        var pingForm = document.getElementById('inactivity-ping-form');
        var secondsRemaining = null;
        var countdownTick = null;

        function pad(n) { return String(n).padStart(2, '0'); }
        function formatMMSS(totalSeconds) {
            var s = Math.max(0, totalSeconds);
            return Math.floor(s / 60) + ':' + pad(s % 60);
        }

        function stopCountdownTick() {
            if (countdownTick) {
                clearInterval(countdownTick);
                countdownTick = null;
            }
        }

        function showWarning() {
            countdownEl.textContent = formatMMSS(secondsRemaining);
            if (!inactivityDialog.open) {
                inactivityDialog.showModal();
                requestAnimationFrame(function () { inactivityDialog.classList.add('is-open'); });
            }
            stopCountdownTick();
            // Ticks the displayed countdown once a second between polls -
            // purely cosmetic, the poll response (every ~60s) is what actually
            // decides when the panel closes, this just keeps the dialog's own
            // number from sitting frozen for up to a minute at a time.
            countdownTick = setInterval(function () {
                secondsRemaining = Math.max(0, secondsRemaining - 1);
                countdownEl.textContent = formatMMSS(secondsRemaining);
            }, 1000);
        }

        function hideWarning() {
            stopCountdownTick();
            if (inactivityDialog.open) closeModalWithFadeOut(inactivityDialog);
        }

        function handlePollResult(data) {
            if (data.closed) {
                stopCountdownTick();
                // The panel this page is showing no longer reflects reality
                // (it's complete/void now) - a full reload is the simplest way
                // to land back on the same URL's now-read-only render, same
                // destination End Panel Meeting already sends a chair to.
                window.location.reload();
                return;
            }
            secondsRemaining = data.seconds_remaining;
            if (secondsRemaining <= warningLeadSeconds) {
                showWarning();
            } else {
                hideWarning();
            }
        }

        function poll() {
            fetch(pollUrl, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
                .then(function (res) { return res.json(); })
                .then(handlePollResult);
        }

        pingForm.addEventListener('submit', function (e) {
            e.preventDefault();
            fetch(pollUrl, {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                body: new FormData(pingForm),
            })
                .then(function (res) { return res.json(); })
                .then(handlePollResult);
        });

        poll();
        setInterval(poll, 60000);
    }

    initDragReorder({
        'pending': { role: 'sink' },
    }, { removeAction: 'unassign_referral' });

    // Students Discussed's Review due date - Change (still-open follow-up) and
    // Schedule Review (Complete row, reopening one) both open this one dialog
    // instead of an inline raw date input (#111), same "Review in..." preset
    // shape (1 Week/2 Weeks/1 Month/Next Half Term/Next Term/Other) as End
    // Discussion's own follow-up date picker (discussion.html). Populated
    // per-row from the triggering button's data-* attributes since one shared
    // dialog serves every Discussed row rather than one dialog instance each;
    // title/Save text switch on data-review-date-mode so "Schedule Review"
    // doesn't open a dialog that still says "Change Review Date" (see
    // update_review_date - saving here always (re)activates the follow-up, so
    // Schedule Review needs no separate action).
    var reviewDateDialog = document.getElementById('review-date-dialog');
    if (reviewDateDialog) {
        var titleEl = document.getElementById('review-date-dialog-title');
        var saveBtn = document.getElementById('review-date-save-btn');
        var prIdInput = document.getElementById('review-date-panel-referral-id');
        var intervalSelect = document.getElementById('review-date-interval');
        var halfTermOption = document.getElementById('review-date-half-term-option');
        var termOption = document.getElementById('review-date-term-option');
        var customGroup = document.getElementById('review-date-custom-group');
        var customInput = document.getElementById('review-date-custom');
        var finalInput = document.getElementById('review-date-final');
        var MODE_TEXT = {
            change: { title: 'Change Review Date', save: 'Save' },
            schedule: { title: 'Schedule Review', save: 'Schedule' },
        };

        var applyInterval = function (value) {
            if (value === 'other') {
                customGroup.hidden = false;
                finalInput.value = customInput.value;
                return;
            }
            customGroup.hidden = true;
            if (/^\d+$/.test(value)) {
                var d = new Date();
                d.setDate(d.getDate() + parseInt(value, 10));
                finalInput.value = d.toISOString().slice(0, 10);
            } else {
                finalInput.value = value; // ISO date (Next Half/Full Term)
            }
        };

        document.querySelectorAll('[data-review-date-trigger]').forEach(function (trigger) {
            trigger.addEventListener('click', function () {
                var mode = MODE_TEXT[trigger.getAttribute('data-review-date-mode')] || MODE_TEXT.change;
                titleEl.textContent = mode.title;
                saveBtn.textContent = mode.save;

                prIdInput.value = trigger.getAttribute('data-panel-referral-id');

                var halfTermDate = trigger.getAttribute('data-next-half-term');
                halfTermOption.hidden = !halfTermDate;
                halfTermOption.value = halfTermDate || '';
                halfTermOption.textContent = trigger.getAttribute('data-next-half-term-label') || '';

                var termDate = trigger.getAttribute('data-next-term');
                termOption.hidden = !termDate;
                termOption.value = termDate || '';
                termOption.textContent = trigger.getAttribute('data-next-term-label') || '';

                // Opens on the current date as a custom value rather than
                // guessing which preset it came from - a date set weeks ago
                // won't line up with "1 Week from today" any more anyway.
                customInput.value = trigger.getAttribute('data-current-date') || '';
                intervalSelect.value = 'other';
                applyInterval('other');
                // The native <select>/<input type=date> were already enhanced
                // into custom controls on page load (main.js) - refresh rather
                // than re-enhance, since the popover cached its option list (and
                // the date input its day/month/year selects) at that first
                // enhance (see enhanceSelect in static/js/components/select.js, enhanceDateInput in date-input.js).
                if (intervalSelect._uiSelect) intervalSelect._uiSelect.refresh();
                if (customInput._uiDate) customInput._uiDate.refresh();

                reviewDateDialog.showModal();
                requestAnimationFrame(function () { reviewDateDialog.classList.add('is-open'); });
            });
        });

        intervalSelect.addEventListener('change', function () { applyInterval(intervalSelect.value); });
        customInput.addEventListener('change', function () { finalInput.value = customInput.value; });

        reviewDateDialog.addEventListener('click', function (e) {
            if (e.target === reviewDateDialog || e.target.closest('[data-modal-close]')) {
                closeModalWithFadeOut(reviewDateDialog);
            }
        });
    }
});
