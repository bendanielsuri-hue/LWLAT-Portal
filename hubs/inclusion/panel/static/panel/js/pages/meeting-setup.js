/* Panel Agenda Setup's own page behavior (#212 - moved out of
   meeting_setup.html's three inline <script> blocks, ADR 0021). One page,
   one entry module. */

import { initDragReorder } from '../../../js/components/drag-reorder.js';
import { beginFetchSeq, isCurrentFetchSeq } from '../../../js/components/fetch-seq.js';
import { diffPatchRowList } from '../../../js/components/row-list-patch.js';

document.addEventListener('DOMContentLoaded', function () {
    var chairSelect = document.getElementById('panel-chair');
    // The group id lives on the "Edit Group" trigger's own data-group-id
    // (already rendered for that button's disabled-state logic) rather
    // than a second copy of {{ panel.panel_group_id }} here.
    var groupEditTrigger = document.querySelector('[data-open-group-edit-trigger]');
    var currentPanelGroupId = groupEditTrigger ? groupEditTrigger.getAttribute('data-group-id') : '';

    // Ready toggle updates in place - status only affects this pill/toggle
    // and the page subtitle's status pill, nothing else on the page, so a
    // full reload (like Panel Group's below) would just be a slower way
    // to change two spans.
    var readyToggleForm = document.getElementById('ready-toggle-form');
    if (readyToggleForm) {
        readyToggleForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var button = readyToggleForm.querySelector('.toggle-pill');
            fetch(window.location.href, {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                body: new FormData(readyToggleForm),
            })
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    var isReady = data.status === 'ready';
                    button.classList.toggle('on', isReady);
                    button.setAttribute('aria-pressed', String(isReady));
                    button.setAttribute('aria-label', isReady ? 'Ready — click to mark as draft' : 'Draft — click to mark as ready');
                    var statusPill = document.getElementById('panel-status-pill');
                    if (statusPill) {
                        statusPill.textContent = data.status_display;
                        statusPill.className = 'status-pill ' + data.status;
                        statusPill.id = 'panel-status-pill';
                    }
                });
        });
    }

    function updateChairPills() {
        if (!chairSelect) return;
        // "default" isn't a real staff id - it means "whoever the Panel
        // Group's default_chair currently is", read off the select's own
        // data attribute (server-rendered from panel.panel_group.default_chair_id).
        var chairId = chairSelect.value === 'default' ? chairSelect.dataset.defaultChairId : chairSelect.value;
        document.querySelectorAll('[data-chair-pill]').forEach(function (pill) {
            var row = pill.closest('.entity-row');
            var isMatch = !!(row && chairId && row.dataset.active === '1' && row.dataset.staffId === chairId);
            pill.hidden = !isMatch;
        });
    }

    // Chair stays directly editable from the summary itself, on its own
    // standalone autosave (deliberately not part of the shared Edit
    // Panel Settings dialog - it's changed often enough not to warrant
    // a dialog round-trip) - see the update_chair action in
    // inclusion_panel_meeting_setup (views.py).
    if (chairSelect) {
        chairSelect.addEventListener('change', function () {
            updateChairPills();
            // csrfmiddlewaretoken read off any csrf_token input already
            // on the page (here, the Ready toggle's own form carries
            // one) - Django's CSRF check only cares that the POST body
            // has a valid token, not which <form> it visually belongs
            // to. Same lookup postForm() (main.js) uses.
            var csrfInput = document.querySelector('input[name="csrfmiddlewaretoken"]');
            fetch(window.location.href, {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                body: new URLSearchParams({
                    form_action: 'update_chair',
                    chair: chairSelect.value,
                    csrfmiddlewaretoken: csrfInput ? csrfInput.value : '',
                }),
            });
        });
    }

    // The Members section (right below) is read-only here - it just
    // mirrors this panel's Panel Group roster, edited via the "Edit"
    // button's shared group modal (panel-group-dialog, also used by
    // the Panel Groups settings page). That modal dispatches
    // panel-group:updated on every member add/toggle/expertise change,
    // but nothing on this page was listening, so the Members list sat
    // stale until a full page reload. Only refresh when the group
    // that changed is actually the one this panel is using - fetch
    // this same page fresh (matches the fetchFreshDoc/applyFreshDoc
    // pattern used for the Referral Selection/Panel Agenda columns
    // below) and diff+animate just the Members list instead of yanking
    // the whole container in as a static snapshot, so add/remove reads
    // the same here as it does in the modal.
    //
    // The Chair select's <option> list is driven by this same roster
    // (only active members with a staff_id are chairable, see
    // chair_choices/active_members in views.py) and needs the same
    // refresh - a member added in the modal couldn't be picked as Chair,
    // and one deactivated/removed stayed pickable, until a full reload.
    // Its `selected` markup is also server-authoritative (chair_id gets
    // cleared server-side if the deactivated member was chair - see
    // toggle_group_member_active), so swapping in the fresh <option>s
    // wholesale is correct, not just for the roster but for what's
    // currently selected too. Replacing innerHTML (not the whole select
    // node) keeps this same element/its change listener intact.
    var membersListSeqEl = document.querySelector('[data-panel-members-list]');
    document.addEventListener('panel-group:updated', function (e) {
        var detail = e.detail;
        if (!detail || String(detail.id) !== currentPanelGroupId) return;
        var seq = membersListSeqEl ? beginFetchSeq(membersListSeqEl) : null;
        fetch(window.location.pathname, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.text(); })
            .then(function (html) {
                if (membersListSeqEl && !isCurrentFetchSeq(membersListSeqEl, seq)) return;
                var doc = new DOMParser().parseFromString(html, 'text/html');
                var freshList = doc.querySelector('[data-panel-members-list]');
                var oldList = document.querySelector('[data-panel-members-list]');
                if (freshList && oldList) diffPatchRowList(oldList, freshList, 'data-member-id');

                var freshChairSelect = doc.getElementById('panel-chair');
                if (freshChairSelect && chairSelect) {
                    chairSelect.innerHTML = freshChairSelect.innerHTML;
                    chairSelect.dataset.defaultChairId = freshChairSelect.dataset.defaultChairId || '';
                    // The visible control is enhanceSelect's mirrored
                    // trigger button/popover (main.js), not this <select>
                    // itself - it's hidden off-screen once enhanced. Its own
                    // refresh() re-reads these fresh options into both; a
                    // plain updateChairPills() alone would leave the visible
                    // trigger/popover showing the stale roster.
                    if (chairSelect._uiSelect) chairSelect._uiSelect.refresh();
                    updateChairPills();
                }
            });
    });

    // Named and hung off window (rather than a plain closure here) so
    // initDragReorder's refreshZones() can call it again after swapping in
    // a fresh Referral Selection column - that column's tab buttons/panels
    // are brand new nodes with no listeners of their own until this re-runs.
    window.initReferralTabs = function () {
        var STORAGE_KEY = 'panel-setup-referral-tab';
        var tabButtons = document.querySelectorAll('[data-referral-tab]');
        var panels = document.querySelectorAll('[data-referral-tab-panel]');
        if (!tabButtons.length) return;

        function applyTab(tab) {
            tabButtons.forEach(function (b) { b.classList.toggle('active', b.dataset.referralTab === tab); });
            panels.forEach(function (panel) { panel.hidden = panel.dataset.referralTabPanel !== tab; });
        }

        tabButtons.forEach(function (button) {
            button.addEventListener('click', function () {
                applyTab(button.dataset.referralTab);
                try { localStorage.setItem(STORAGE_KEY, button.dataset.referralTab); } catch (e) { }
            });
        });

        // Adding/removing/reordering referrals refreshes the Referral
        // Selection column's markup (see initDragReorder) - without
        // this, that refresh always fell back to whichever tab is hardcoded
        // "active" in the template, regardless of which tab the user was
        // actually on.
        var savedTab;
        try { savedTab = localStorage.getItem(STORAGE_KEY); } catch (e) { }
        if (savedTab) applyTab(savedTab);
    };
    window.initReferralTabs();

    initDragReorder({
        'new-referrals': { addAction: 'add_referral' },
        'followups': { addAction: 'add_followup_to_agenda' },
        // "All" mixes both origins in one zone - each row carries its own
        // data-add-action (see _referral_selection_row.html), which
        // handleDrop prefers over this zone-level default.
        'all': { addAction: 'add_referral' },
        'agenda': { role: 'sink' },
    }, { removeAction: 'remove_referral_from_agenda' });
});
