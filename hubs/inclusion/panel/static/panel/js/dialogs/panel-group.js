/* #panel-group-dialog (#211) - one of panel.js's nine independent dialog
   IIFEs, mechanical to extract since none of them share state
   (taxonomy.md §6). One dialog/controller for both creating a new group
   and managing an existing one (rename, default chair, members, per-member
   expertise). Creating a group doesn't close the modal: it swaps the same
   dialog's content over to the members view for the group just created, so
   setup happens in one continuous session. Once a group exists, every field
   (name, chair, expertise) autosaves on blur/change - there's no Save
   button anywhere past that point. Every mutating submission re-fetches the
   GET fragment and swaps it back in so the modal's own member list/chair
   options refresh in place — no page reload. A `panel-group:updated` event
   (name, chair, active member count) is dispatched after each change so
   pages showing this group elsewhere (Panel Groups settings) can patch just
   their own row live.

   enhanceFormControls/initMemberPicker/initExpertiseFields stay window.* -
   none of the three has moved yet (main.js is unsplit, #213; the person-
   picker/expertise-field components are still panel.js's own top-level
   functions, not modules). Everything else generic imports from its real
   home now that it has one. window.openPanelGroupModal/
   openPanelGroupEditModal/uiSelectRowAdders stay window.* deliberately -
   other panel pages (meeting_setup.html, _panel_meeting_form_modal.html,
   the generic .ui-select-row "+" button in main.js) call them by name. */

import { closeModalWithFadeOut, animateModalHeightChange, setFadeHidden } from '../../../js/components/modal.js';
import { pulseCount } from '../../../js/components/tabs.js';
import { shrinkAndFadeOut } from '../../../js/components/row-animate.js';
import { diffPatchRowList } from '../../../js/components/row-list-patch.js';
import { beginFetchSeq, isCurrentFetchSeq } from '../../../js/components/fetch-seq.js';
import { resolvePanelSchoolFilter } from '../components/school-filter.js';

(function () {
    var dialog = document.getElementById('panel-group-dialog');
    if (!dialog) return;

    var currentGroupId = null;
    // Which of Active/Inactive Members is showing - survives across render()
    // (every autosave re-fetches the whole fragment and replaces the
    // dialog's innerHTML, which would otherwise reset the view to whatever
    // the server last rendered). Restored after every render by
    // wireMemberTabs() below; forced back to 'active' specifically right
    // after adding a member (see wireAddMemberForm).
    var currentMembersTab = 'active';
    // True once this dialog session has rendered at least once - render()
    // uses this to tell "the modal just opened" apart from "an autosave/
    // toggle refreshed already-visible content", so it only lets one-shot
    // entrance animations (e.g. .tab-row's fade-in) play on the former.
    var hasRenderedOnce = false;
    // Whether each tab had a button showing as of the last render (see
    // tabHasMembers below) - compared against the freshly-fetched fragment
    // in render() so a tab that just gained its first member (e.g. adding
    // someone to a group whose Inactive tab was previously hidden) can play
    // a one-shot fade-in on its button, same idea as hasRenderedOnce gating
    // .tab-row's own entrance animation but scoped to a single button
    // instead of the whole row.
    var tabMemberState = { active: true, inactive: true };

    // A tab with zero members hides its own button entirely rather than
    // showing an empty "No members"/"No inactive members" state - unlike the
    // list/picker views (wireMembersModeToggle above), there's nothing
    // actionable to show someone on an empty members tab, so it's just
    // dead-weight chrome. Shared by render()'s pre-connection correction and
    // wireMemberTabs()'s click handling so both agree on what counts as
    // "empty" (the presence of an actual .entity-row, not just the panel
    // existing - the empty-note <p> renders inside every panel regardless).
    function tabHasMembers(panels, tab) {
        var panel = Array.prototype.filter.call(panels, function (p) { return p.dataset.membersTabPanel === tab; })[0];
        return !!(panel && panel.querySelector('.entity-row'));
    }

    function closeModal() {
        currentGroupId = null;
        currentMembersTab = 'active';
        hasRenderedOnce = false;
        closeModalWithFadeOut(dialog);
    }

    // Shared by both the standalone #panel-group-dialog's own create form
    // (wireCreateForm, below) and openInlinePanelGroupCreate's swapped-in
    // one — same validity rule either way: non-empty name + school, and
    // not a case-insensitive name+school duplicate of an existing group,
    // since the server itself only rejects a duplicate on submit (see the
    // Create button's `disabled` starting state and the round-trip error
    // handling in openInlinePanelGroupCreate for what still needs it as a
    // backstop - two people racing to create the same name is a real,
    // if rare, gap this live check can't close on its own).
    function wireCreateGroupValidation(form, existingGroups) {
        var saveBtn = form.querySelector('[data-panel-group-save]');
        if (!saveBtn) return;

        function updateSaveState() {
            var name = (form.elements.name.value || '').trim();
            var schoolVal = form.elements.school ? form.elements.school.value : '';
            var valid = form.checkValidity() && !!name && !!schoolVal;
            if (valid) {
                var nameLower = name.toLowerCase();
                var schoolIdNum = parseInt(schoolVal, 10);
                var duplicate = existingGroups.some(function (g) {
                    return g.name.toLowerCase() === nameLower && g.school_id === schoolIdNum;
                });
                valid = !duplicate;
            }
            saveBtn.disabled = !valid;
        }
        form.addEventListener('input', updateSaveState);
        form.addEventListener('change', updateSaveState);
        updateSaveState();
    }

    function wireCreateForm() {
        var form = dialog.querySelector('[data-panel-group-form-action="create_group"]');
        if (!form) return;
        var dataEl = document.getElementById('existing-panel-groups');
        wireCreateGroupValidation(form, dataEl ? JSON.parse(dataEl.textContent) : []);
    }

    // Every field past group-creation autosaves via its own tiny <form
    // data-autosave="blur|change"> wrapping a single data-autosave-trigger
    // input/select - name, default chair, and each member's expertise all
    // use this same generic wiring instead of a shared Save button.
    function wireAutosaveForms() {
        dialog.querySelectorAll('[data-autosave]').forEach(function (form) {
            // render() now leaves unchanged member rows' DOM nodes (and
            // whatever this already wired onto them last render) untouched
            // instead of always handing back a fresh parse - same idempotency
            // guard as initExpertiseField's data-expertise-wired, needed for
            // the same reason: without it, a form that survives two renders
            // unwired would pick up a second listener and autosave-submit
            // twice.
            if (form.dataset.autosaveWired) return;
            form.dataset.autosaveWired = '1';
            // Per-member expertise forms wrap the shared _expertise_field.html
            // partial, which has no data-autosave-trigger of its own (it's
            // also used, un-autosaved, by the Add Member picker) - fall back
            // to its select directly.
            var trigger = form.querySelector('[data-autosave-trigger]') || form.querySelector('[data-expertise-select]');
            if (!trigger) return;
            var eventName = form.dataset.autosave;
            var isNameForm = form.dataset.panelGroupFormAction === 'update_group_name';
            var dataEl = isNameForm ? document.getElementById('existing-panel-groups') : null;
            var existingGroups = dataEl ? JSON.parse(dataEl.textContent) : [];
            var lastValue = trigger.value;

            trigger.addEventListener(eventName, function () {
                var value = trigger.value;
                if (eventName === 'blur' && value.trim() === lastValue.trim()) return;
                if (!form.checkValidity()) return;
                if (isNameForm) {
                    var nameLower = value.trim().toLowerCase();
                    var duplicate = existingGroups.some(function (g) { return g.name.toLowerCase() === nameLower; });
                    if (!nameLower || duplicate) return;
                }
                lastValue = value;
                form.requestSubmit();
            });
        });
    }

    // Selecting a member (staff, existing external contact, or a
    // freshly-created one - all three end up dispatching the same
    // member-picker:change event once a real id is set) immediately submits
    // the add - no separate "Add Member" button, no expertise step (that's
    // set afterward via the member's own row once it's in the list). Force
    // the view back to the Active tab now, ahead of the submit completing,
    // so render()'s tab restore (see wireMemberTabs) lands on Active
    // regardless of whatever tab was showing before.
    function wireAddMemberForm() {
        var form = dialog.querySelector('[data-add-member-form]');
        if (!form) return;
        var pickerRoot = form.querySelector('[data-member-picker-root]');
        if (!pickerRoot) return;
        pickerRoot.addEventListener('member-picker:change', function (e) {
            if (!e.detail.id) return;
            currentMembersTab = 'active';
            form.requestSubmit();
        });
    }

    // Two distinct buttons rather than one relabelled toggle: [data-members-mode-toggle]
    // ("+ Add Member" in the shared footer, data-panel-group-footer) enters
    // add mode; [data-members-back-btn] (same footer, hidden until add mode)
    // exits it without adding. Both live in the one persistent footer slot
    // below the scrolling member list/picker rather than each view rendering
    // its own trailing button inline, so the two modes never fight over one
    // button's label/meaning. The whole sticky header
    // (Name/Chair) hides while adding - Default Chair only makes sense
    // against members that already exist, and the add-member picker doesn't
    // need the group's own name repeated above it. Always resets to list
    // mode on every render, which is also what auto-returns here right after
    // a member is successfully added (render() re-runs post-submit).
    function wireMembersModeToggle() {
        var header = dialog.querySelector('[data-panel-group-header]');
        var listView = dialog.querySelector('[data-members-list-view]');
        var addView = dialog.querySelector('[data-members-add-view]');
        var enterBtn = dialog.querySelector('[data-members-mode-toggle]');
        var backBtn = dialog.querySelector('[data-members-back-btn]');
        var addExternalBtn = dialog.querySelector('[data-member-add-external]');
        var title = dialog.querySelector('[data-panel-group-modal-title]');
        if (!listView || !addView) return;

        function applyMode(mode) {
            listView.hidden = mode !== 'list';
            addView.hidden = mode !== 'add';
            if (header) header.hidden = mode !== 'list';
            // The footer's own buttons are small, same-height elements that
            // pop in/out without changing the dialog's height - fade rather
            // than snap (setFadeHidden, modal.js), unlike listView/addView/header just above,
            // which are real content swaps already covered by this whole
            // callback being wrapped in animateModalHeightChange.
            if (enterBtn) setFadeHidden(enterBtn, mode !== 'list');
            if (backBtn) setFadeHidden(backBtn, mode !== 'add');
            // Only force-hide on the way OUT of add mode - initMemberPicker
            // (its own External segmented option) owns showing it back on
            // the way in, since this footer (unlike the picker's own markup)
            // stays visible in list mode too and would otherwise keep
            // showing a stale "New External Contact" from the last time
            // External was selected.
            if (addExternalBtn && mode !== 'add') setFadeHidden(addExternalBtn, true);
            if (title) title.textContent = mode === 'add' ? 'Add Member' : 'Edit Panel Group';
            if (mode === 'add') {
                var searchInput = addView.querySelector('[data-member-search]');
                if (searchInput) searchInput.focus();
            }
        }

        // Wrapped in animateModalHeightChange, same as every other in-place
        // content swap in this dialog - the list/add views differ enough in
        // height (a short member list vs. the taller staff/contact picker)
        // that snapping reads as a jump rather than a transition.
        function setMode(mode) {
            animateModalHeightChange(dialog, function () { applyMode(mode); });
        }

        if (enterBtn) enterBtn.addEventListener('click', function () { setMode('add'); });
        if (backBtn) backBtn.addEventListener('click', function () { setMode('list'); });

        applyMode('list');
    }

    // Active/Inactive Members tabs. Restores currentMembersTab after every
    // render (see the module-level comment above it) rather than always
    // defaulting to Active, so e.g. deactivating someone while looking at
    // the Active tab keeps that tab selected as the row animates out. The
    // Inactive tab panel is always rendered alongside Active (with an empty
    // state) rather than only when inactive_members is non-empty - see
    // _panel_group_form_modal.html - specifically so reactivating the last
    // inactive member doesn't yank the panel out from under whoever's
    // looking at that tab. The `active` fallback below only matters for a
    // genuinely brand-new group with no members at all, where neither tab
    // panel is rendered yet.
    function wireMemberTabs() {
        var tabRow = dialog.querySelector('[data-members-tab-row]');
        var panels = dialog.querySelectorAll('[data-members-tab-panel]');
        if (!panels.length) return;

        function setActiveTab(tab) {
            var panelExists = Array.prototype.some.call(panels, function (p) { return p.dataset.membersTabPanel === tab; });
            if (!panelExists) tab = 'active';
            if (!tabHasMembers(panels, tab)) {
                var fallback = tab === 'active' ? 'inactive' : 'active';
                if (tabHasMembers(panels, fallback)) tab = fallback;
            }
            currentMembersTab = tab;
            panels.forEach(function (p) { p.hidden = p.dataset.membersTabPanel !== tab; });
            if (tabRow) {
                tabRow.querySelectorAll('[data-members-tab]').forEach(function (btn) {
                    btn.hidden = !tabHasMembers(panels, btn.dataset.membersTab);
                    btn.classList.toggle('active', btn.dataset.membersTab === tab);
                });
            }
        }

        // Clicking a tab only ever toggles which already-rendered panel is
        // hidden (see setActiveTab above) - no fetch, no innerHTML replace -
        // so without this wrapper the height snapped straight to the other
        // panel's size. Same animateModalHeightChange used for every other
        // in-place content swap in this dialog (see wireMembersModeToggle).
        if (tabRow) {
            tabRow.querySelectorAll('[data-members-tab]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    animateModalHeightChange(dialog, function () { setActiveTab(btn.dataset.membersTab); });
                });
            });
        }

        setActiveTab(currentMembersTab);
    }

    function readGroupSummary() {
        if (!currentGroupId) return null;
        var nameInput = dialog.querySelector('[data-panel-group-form-action="update_group_name"] input[name="name"]');
        if (!nameInput) return null;
        var chairSelect = dialog.querySelector('[data-panel-group-form-action="update_group_chair"] select[name="default_chair"]');
        var chairName = 'None set';
        if (chairSelect && chairSelect.value && chairSelect.selectedOptions.length) {
            chairName = chairSelect.selectedOptions[0].textContent.trim();
        }
        return {
            id: currentGroupId,
            name: nameInput.value,
            chair_name: chairName,
            active_member_count: dialog.querySelectorAll('[data-active-members-list] .entity-row').length,
        };
    }

    function render(html) {
        // dialog.innerHTML replaces the whole subtree, including the
        // scrollable members list - a fresh element always starts at
        // scrollTop 0, which reads as the modal "jumping to the top" on
        // every autosave/toggle. Carry the old scroll position over onto
        // the freshly-rendered one.
        var oldScrollEl = dialog.querySelector('[data-panel-group-scroll]');
        var scrollTop = oldScrollEl ? oldScrollEl.scrollTop : 0;

        // Snapshot for the Active/Inactive count-delta pulse below (INT-M2)
        // - taken before this
        // render tears the old buttons out, compared against the freshly-
        // rendered ones once they're in. Skipped entirely on the render that
        // first opens the modal (isFirstRender) - a pulse on open would be
        // "reacting" to a page-load-shaped render, not a live change.
        var isFirstRender = !hasRenderedOnce;
        var oldMemberCounts = {};
        dialog.querySelectorAll('[data-members-tab]').forEach(function (btn) {
            var countEl = btn.querySelector('.count');
            if (countEl) oldMemberCounts[btn.dataset.membersTab] = parseInt(countEl.dataset.count, 10) || 0;
        });

        // Parse into a detached <template> first - its content is never
        // connected to the document, so nothing in it is ever styled or
        // painted - and correct the Active/Inactive tab selection there,
        // *before* the fragment ever touches the live, visible dialog. The
        // server always renders the Active tab as the default. Reordering
        // wireMemberTabs() to run right after dialog.innerHTML wasn't
        // enough to stop the flicker: simply connecting a subtree whose
        // Active tab is already marked .active is itself enough for the
        // browser to treat that as a real, paintable style state on a
        // visible node, so the *correction* immediately after (removing
        // .active from Active, adding it to Inactive) still gets treated
        // as a genuine change and plays the tab-row underline's CSS
        // `transition` (see panel.css) instead of landing silently. Fixing
        // the classes/hidden attributes on the detached fragment means the
        // connected DOM only ever sees the final, correct state - there is
        // no "wrong" state for the browser to ever paint or transition
        // from. (Deactivating never showed this because it happens while
        // already on the Active tab, which matches the server's default -
        // no correction, no mutation, nothing to transition.)
        var template = document.createElement('template');
        template.innerHTML = html;
        var tabRow = template.content.querySelector('[data-members-tab-row]');
        if (tabRow) {
            var panels = template.content.querySelectorAll('[data-members-tab-panel]');
            var panelExists = Array.prototype.some.call(panels, function (p) { return p.dataset.membersTabPanel === currentMembersTab; });
            var targetTab = panelExists ? currentMembersTab : 'active';
            // Route away from a tab that's about to lose its button (see
            // tabHasMembers above) before the fragment is ever connected -
            // same reasoning as the .active correction below: fixing it here
            // means the live DOM never sees the "wrong" state to transition
            // away from.
            if (!tabHasMembers(panels, targetTab)) {
                var fallback = targetTab === 'active' ? 'inactive' : 'active';
                if (tabHasMembers(panels, fallback)) targetTab = fallback;
            }
            var nextMemberState = { active: tabHasMembers(panels, 'active'), inactive: tabHasMembers(panels, 'inactive') };
            tabRow.querySelectorAll('[data-members-tab]').forEach(function (btn) {
                var tab = btn.dataset.membersTab;
                btn.hidden = !nextMemberState[tab];
                btn.classList.toggle('active', tab === targetTab);
                // Fade in a tab button that just gained its first member -
                // see tabMemberState above. Setting the class on the
                // detached fragment (rather than after connecting) is
                // required, not just tidier: unlike the .active correction
                // above (a transition, which needs a real before/after delta
                // while connected), this is a CSS `animation`, which plays
                // off the element simply existing at first paint - it needs
                // the class already present the instant this button is
                // connected, same mechanism .tab-row's own fade-in relies on.
                if (hasRenderedOnce && nextMemberState[tab] && !tabMemberState[tab]) {
                    btn.classList.add('tab-fade-in');
                }
            });
            panels.forEach(function (p) { p.hidden = p.dataset.membersTabPanel !== targetTab; });
            currentMembersTab = targetTab;
            tabMemberState = nextMemberState;
        }

        // Diff-patch the two member-list containers in place, before the
        // rest of the fragment (name/chair forms, add-member picker, footer)
        // gets its usual full swap below. Untouched rows keep the exact DOM
        // node they had a moment ago - including any shrink/grow animation
        // still playing on them from a *different*, concurrent click -
        // instead of every render() destroying the whole list and recreating
        // it from the fresh HTML. That full-list destruction was what made
        // rapid Add/Remove clicks read as rows vanishing or animations
        // cutting off mid-flight (see grilling session 2026-07-12).
        // freshList.replaceWith(oldList) moves oldList (still connected to
        // the live dialog at this point) into template.content in freshList's
        // place - a plain DOM reparent, not a clone - so the node that ends
        // up back in the document a few lines down via replaceChildren is
        // the same one this just finished patching, animations and all.
        ['[data-active-members-list]', '[data-members-tab-panel="inactive"]'].forEach(function (sel) {
            var freshList = template.content.querySelector(sel);
            var oldList = dialog.querySelector(sel);
            if (!freshList || !oldList) return;
            var wasHidden = freshList.hidden;
            diffPatchRowList(oldList, freshList, 'data-member-id');
            oldList.hidden = wasHidden;
            freshList.replaceWith(oldList);
        });

        dialog.replaceChildren(template.content);

        // .tab-row's fade-in (see panel.css) is meant for the tab row's
        // first appearance, not for every refresh of already-visible
        // content - a full innerHTML replace recreates the element, so the
        // CSS animation (which just triggers off the element existing, with
        // no JS gating) replays every time and reads as a flash/flicker.
        // Only let it play on the render that actually opens the modal.
        if (hasRenderedOnce) {
            dialog.querySelectorAll('.tab-row').forEach(function (el) {
                el.style.animation = 'none';
            });
        }
        hasRenderedOnce = true;

        var newScrollEl = dialog.querySelector('[data-panel-group-scroll]');
        if (newScrollEl) newScrollEl.scrollTop = scrollTop;

        // Just wires click listeners at this point - the tab state itself
        // was already corrected above, before insertion.
        wireMemberTabs();

        // Count-delta pulse for Active/Inactive (see the snapshot above) -
        // skipped for a tab that just faded in via .tab-fade-in (gained its
        // first member this render): that entrance animation is already
        // its own "something changed here" signal, so pulsing its count too
        // would be doubling up on the same moment.
        if (!isFirstRender) {
            dialog.querySelectorAll('[data-members-tab]').forEach(function (btn) {
                if (btn.classList.contains('tab-fade-in')) return;
                var countEl = btn.querySelector('.count');
                if (!countEl) return;
                var newCount = parseInt(countEl.dataset.count, 10) || 0;
                var oldCount = oldMemberCounts[btn.dataset.membersTab];
                if (oldCount === undefined || oldCount === newCount) return;
                pulseCount(countEl, newCount > oldCount ? 'up' : 'down');
            });
        }

        window.enhanceFormControls(dialog);
        dialog.querySelectorAll('[data-member-picker-root]').forEach(window.initMemberPicker || function () {});
        if (window.initExpertiseFields) window.initExpertiseFields(dialog);
        wireCreateForm();
        wireAutosaveForms();
        wireAddMemberForm();
        wireMembersModeToggle();
    }

    function loadGroupFragment(groupId) {
        return fetch('/inclusion/panel/groups/' + encodeURIComponent(groupId) + '/edit/', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
        }).then(function (res) { return res.text(); });
    }

    window.openPanelGroupModal = function (schoolId) {
        currentGroupId = null;
        currentMembersTab = 'active';
        hasRenderedOnce = false;
        var url = '/inclusion/panel/groups/new/?';
        if (schoolId) url += 'school=' + encodeURIComponent(schoolId);
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.text(); })
            .then(function (html) {
                render(html);
                dialog.showModal();
                requestAnimationFrame(function () { dialog.classList.add('is-open'); });
            });
    };

    // Registered with the generic `.ui-select-row` "+" button handler in
    // main.js (see `window.uiSelectRowAdders`) — works for any Panel Group
    // select on any page, not just the ones panel.js itself renders.
    //
    // If the "+" was clicked from inside an already-open modal (Create
    // Panel Meeting, Edit Panel Settings — the only two call sites today),
    // stacking the full #panel-group-dialog on top reads as "a small modal
    // on top of a small modal." Swap that host dialog's own body to a bare
    // create-group form in place instead (openInlinePanelGroupCreate,
    // below) — deliberately narrower than the full dialog's post-create
    // member-management flow; the group is created bare (name + school)
    // and member/chair/expertise setup happens later via the normal Panel
    // Groups page, same as any group. Outside a modal (no current caller,
    // kept as a fallback for a future bare-page one) the full dialog still
    // opens as before.
    window.uiSelectRowAdders = window.uiSelectRowAdders || {};
    window.uiSelectRowAdders['panel-group'] = function (select, trigger) {
        var hostDialog = trigger && trigger.closest('dialog[open]');
        var schoolId = resolveCreateGroupSchoolId(select, hostDialog);
        if (hostDialog) {
            openInlinePanelGroupCreate(hostDialog, select, schoolId);
            return;
        }
        window.openPanelGroupModal(schoolId);
    };

    // Which school to preselect on the create-group form, most-specific
    // signal first:
    //  1. The host modal's own explicit School select (Create Panel
    //     Meeting's data-panel-school-select) - the most deliberate choice
    //     available, since the user picked it themselves in this same form.
    //  2. The Panel Group select's own currently-selected option's school,
    //     when a group is already chosen (Edit Panel Settings on a Panel
    //     that already has one) - Panel has no school field of its own,
    //     only via panel.panel_group.school, but the select's selected
    //     <option> already carries that as data-school.
    //  3. The sidebar School-switcher filter (resolvePanelSchoolFilter) -
    //     today's only signal, still the right fallback when neither of
    //     the above apply (e.g. no group chosen yet, or called from
    //     outside any dialog).
    function resolveCreateGroupSchoolId(select, hostDialog) {
        var hostSchoolSelect = hostDialog && hostDialog.querySelector('[data-panel-school-select]');
        // 'none' is the synthetic "MAT-wide" School option (#69) - it isn't
        // a real School row to preselect against, so fall through to the
        // next signal instead of forwarding it as a school id.
        if (hostSchoolSelect && hostSchoolSelect.value && hostSchoolSelect.value !== 'none') return hostSchoolSelect.value;

        if (select && select.value) {
            var current = select.options[select.selectedIndex];
            if (current && current.dataset.school) return current.dataset.school;
        }

        if (select) {
            var options = Array.prototype.slice.call(select.options).filter(function (opt) { return opt.value; });
            return resolvePanelSchoolFilter(options, select.dataset.currentStaffSchool);
        }
        return '';
    }

    // Swaps `hostDialog`'s .modal-body over to a bare "Create Panel Group"
    // form (fetched from the same groups/new/ endpoint openPanelGroupModal
    // uses), in place of whatever form fields the host modal normally
    // shows. The original content is wrapped and hidden (never removed),
    // so any in-progress edits elsewhere in that form (e.g. Date/Time
    // already picked) survive untouched. Every content swap - showing the
    // create form, replacing "Loading…" with the fetched fields, and
    // restoring the original content - runs through animateModalHeightChange
    // so the dialog eases to its new height instead of snapping. On
    // success, dispatches the same `panel-group:created` event the full
    // #panel-group-dialog flow already dispatches — every host page
    // listens for that itself (see meeting_setup.html /
    // _panel_meeting_form_modal.html's own panel-group:created handlers) to
    // add the new option and select it, so this function doesn't need to
    // know anything about the host's own select-refresh logic.
    function openInlinePanelGroupCreate(hostDialog, select, schoolId) {
        var body = hostDialog.querySelector('.modal-body');
        var titleEl = hostDialog.querySelector('.modal-header h2');
        if (!body) { window.openPanelGroupModal(schoolId); return; }

        var original = body.querySelector('[data-inline-create-original]');
        if (!original) {
            original = document.createElement('div');
            original.setAttribute('data-inline-create-original', '');
            while (body.firstChild) original.appendChild(body.firstChild);
            body.appendChild(original);
        }
        var host = body.querySelector('[data-inline-create-host]');
        if (!host) {
            host = document.createElement('div');
            host.setAttribute('data-inline-create-host', '');
            body.appendChild(host);
        }

        var originalTitle = titleEl ? titleEl.textContent : '';

        function restore() {
            animateModalHeightChange(hostDialog, function () {
                host.hidden = true;
                host.innerHTML = '';
                original.hidden = false;
                if (titleEl) titleEl.textContent = originalTitle;
            });
        }

        animateModalHeightChange(hostDialog, function () {
            original.hidden = true;
            host.hidden = false;
            host.innerHTML = '<p class="empty-note">Loading…</p>';
            if (titleEl) titleEl.textContent = 'Create Panel Group';
        });

        var url = '/inclusion/panel/groups/new/?';
        if (schoolId) url += 'school=' + encodeURIComponent(schoolId);
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.text(); })
            .then(function (html) {
                var doc = new DOMParser().parseFromString(html, 'text/html');
                var form = doc.querySelector('[data-panel-group-form-action="create_group"]');
                if (!form) { restore(); return; }

                var errorNote = document.createElement('p');
                errorNote.className = 'field-error';
                errorNote.hidden = true;
                // Covers both failure branches the endpoint can return
                // (views.py's inclusion_panel_group_edit): a duplicate
                // name for the chosen school, or a missing school — the
                // latter shouldn't normally fire given School's `required`
                // attribute below, but the message shouldn't lie if it does.
                errorNote.textContent = "Couldn't create this group — check the name and school.";

                // Name (and School, when it isn't already preselected into
                // a hidden input server-side - see preselect_school_id in
                // _panel_group_form_modal.html) get the same fused-label
                // treatment as every other field in this modal, instead of
                // the standalone dialog's plain label-above-input style —
                // consistent with the Date/Time/Panel Group fields this
                // form is standing in for. Each field group's own
                // label/control pair is moved as-is, not rebuilt, so
                // nothing about validation/ids/for-attributes changes.
                var fieldsWrap = document.createElement('div');
                fieldsWrap.className = 'ui-fused-field-group';
                Array.prototype.slice.call(form.querySelectorAll(':scope > .field-group')).forEach(function (fieldGroup) {
                    var label = fieldGroup.querySelector('label');
                    var control = fieldGroup.querySelector('input, select');
                    if (!label || !control) { fieldsWrap.appendChild(fieldGroup); return; }
                    var fused = document.createElement('span');
                    fused.className = 'ui-fused-field';
                    label.className = 'ui-fused-field-label';
                    fused.appendChild(label);
                    fused.appendChild(control);
                    fieldsWrap.appendChild(fused);
                    // label/control were moved out (appendChild moves, not
                    // clones), leaving this an empty husk still sitting in
                    // `form` at its original position - remove it, or it
                    // adds a stray extra .field-group's worth of margin
                    // and confuses the next `:scope > .field-group` query
                    // if this ever runs twice on the same form.
                    fieldGroup.remove();
                });
                form.insertBefore(fieldsWrap, form.firstChild);
                // The template's own sticky-row class put Name/School and
                // the Cancel/Create buttons in one shared flex row - now
                // split into its own fields row (above) and .btn-row
                // (already the template's own class, left as the form's
                // last child), so Cancel/Create get a row of their own.
                form.classList.remove('panel-group-modal-sticky-row');

                animateModalHeightChange(hostDialog, function () {
                    host.innerHTML = '';
                    host.appendChild(form);
                    host.appendChild(errorNote);
                });
                window.enhanceFormControls(host);

                // The template's Create Group button starts `disabled`,
                // only ever enabled by #panel-group-dialog's own
                // wireCreateForm() — which won't find this relocated form.
                // wireCreateGroupValidation is the same live name/school/
                // duplicate check that function uses, wired here against
                // this form instead; existingGroups comes from the same
                // json_script the fetched fragment already carries (see
                // _panel_group_form_modal.html), just read off the
                // detached parsed doc rather than the live document.
                var existingGroupsEl = doc.getElementById('existing-panel-groups');
                var existingGroups = existingGroupsEl ? JSON.parse(existingGroupsEl.textContent) : [];
                wireCreateGroupValidation(form, existingGroups);

                // The fetched form's Cancel button carries data-modal-close,
                // the sitewide convention for "close the dialog I'm in" —
                // here that would close the whole host modal instead of
                // just backing out of this inline step, so it needs its
                // own handler in place of that one.
                var cancelBtn = form.querySelector('[data-modal-close]');
                if (cancelBtn) {
                    cancelBtn.removeAttribute('data-modal-close');
                    cancelBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        restore();
                    });
                }

                // form.action (the resolved IDL property) is unreliable on a
                // node that started life in a detached DOMParser document —
                // its resolution depends on which document the node was
                // adopted into and when. The raw attribute is the literal
                // root-relative path from the template, safe to pass
                // straight to fetch() regardless of that history.
                var formAction = form.getAttribute('action');
                form.addEventListener('submit', function (e) {
                    e.preventDefault();
                    errorNote.hidden = true;
                    fetch(formAction, {
                        method: 'POST',
                        headers: { 'X-Requested-With': 'XMLHttpRequest' },
                        body: new FormData(form),
                    })
                        .then(function (res) { return res.json(); })
                        .then(function (data) {
                            if (!data.success) {
                                errorNote.hidden = false;
                                return;
                            }
                            restore();
                            document.dispatchEvent(new CustomEvent('panel-group:created', { detail: data.group }));
                        });
                });
            });
    }

    window.openPanelGroupEditModal = function (groupId) {
        if (!groupId) return;
        currentGroupId = groupId;
        currentMembersTab = 'active';
        hasRenderedOnce = false;
        loadGroupFragment(groupId).then(function (html) {
            render(html);
            dialog.showModal();
            requestAnimationFrame(function () { dialog.classList.add('is-open'); });
        });
    };

    document.addEventListener('click', function (e) {
        var trigger = e.target.closest('[data-open-group-edit-trigger]');
        if (trigger && !trigger.disabled) {
            window.openPanelGroupEditModal(trigger.getAttribute('data-group-id'));
            return;
        }
        if (e.target.closest('[data-modal-close]') && e.target.closest('#panel-group-dialog')) {
            closeModal();
        }
    });

    dialog.addEventListener('click', function (e) {
        if (e.target === dialog) closeModal();
    });

    dialog.addEventListener('submit', function (e) {
        var form = e.target.closest('[data-panel-group-form]');
        if (!form) return;
        e.preventDefault();

        // Rapid successive submits (e.g. clicking Remove on two different
        // rows before the first fetch has returned) have no guaranteed
        // resolution order - captures which submit this is so a response
        // that's no longer the latest can be dropped instead of overwriting
        // fresher state with a stale fragment (see beginFetchSeq above).
        var seq = beginFetchSeq(dialog);

        var fetchPromise = fetch(form.action, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: new FormData(form),
        }).then(function (res) { return res.json(); });

        // Deactivating/reactivating a member moves its row to the other tab.
        // render() below still does a full dialog.innerHTML replace (a real
        // diff/patch of the fragment isn't worth the risk for one row's
        // animation), so the best fit here is optimistic: shrink the row out
        // of its current tab *while* the request is in flight, and only
        // swap in the fresh fragment once both finish - by then the row has
        // already visually settled, so the replace doesn't snap. This only
        // animates the removal half; the row reappears in its new tab
        // already in its final state, no matching grow-in.
        if (form.dataset.panelGroupFormAction === 'toggle_group_member_active') {
            var row = form.closest('.entity-row');

            // Flip the toggle-pill's own knob (.toggle-knob already has a
            // transform transition, see components/pills.css) the instant
            // the click lands, instead of leaving it static while the row
            // fades out from under it - the row disappearing with no
            // feedback from the control the user actually clicked read as
            // broken. Purely visual/optimistic: the real state change is
            // still driven by the fetch below, and the fresh fragment
            // swapped in by render() re-renders this row (in its new tab)
            // with the server-confirmed state regardless.
            var toggleBtn = form.querySelector('.toggle-pill');
            if (toggleBtn) {
                var willBeActive = !toggleBtn.classList.contains('on');
                toggleBtn.classList.toggle('on', willBeActive);
                toggleBtn.setAttribute('aria-pressed', String(willBeActive));
                toggleBtn.setAttribute('aria-label', willBeActive
                    ? 'Active — click to deactivate'
                    : 'Inactive — click to reactivate');

                // Same reasoning as optimisticallyDecrementCounts elsewhere in
                // this file (INT-M2)
                // - every count pulse fires the instant its own action is
                // confirmed, never waiting on a row/column animation-gated
                // re-render): which tab gains a member and which loses one is
                // fully known right here, so both counts bump and pulse now
                // rather than waiting out the row's ~900ms shrink-out below
                // plus a round-trip. render()'s own before/after diff (used
                // for every *other* trigger of a re-render) will see these
                // already-bumped numbers match the freshly-fetched ones and
                // stay quiet, rather than pulsing a second time.
                var activeCountEl = dialog.querySelector('[data-members-tab="active"] .count');
                var inactiveCountEl = dialog.querySelector('[data-members-tab="inactive"] .count');
                var bump = willBeActive ? 1 : -1;
                [[activeCountEl, bump], [inactiveCountEl, -bump]].forEach(function (pair) {
                    var el = pair[0], delta = pair[1];
                    if (!el) return;
                    var newCount = Math.max(0, (parseInt(el.dataset.count, 10) || 0) + delta);
                    el.dataset.count = String(newCount);
                    el.textContent = '(' + newCount + ')';
                    pulseCount(el, delta > 0 ? 'up' : 'down');
                });
            }

            var shrinkPromise = new Promise(function (resolve) {
                shrinkAndFadeOut(row, resolve);
            });
            Promise.all([fetchPromise, shrinkPromise]).then(function (results) {
                var data = results[0];
                if (!data.success || !currentGroupId) return;
                return loadGroupFragment(currentGroupId).then(function (html) {
                    if (!isCurrentFetchSeq(dialog, seq)) return;
                    // Toggling active/inactive can hide/reveal a tab button
                    // (see tabHasMembers) on top of the row's own optimistic
                    // shrink-out above - animate the dialog easing to
                    // whatever height that leaves it at, same as every other
                    // in-place swap here.
                    animateModalHeightChange(dialog, function () { render(html); });
                    var summary = readGroupSummary();
                    if (summary) document.dispatchEvent(new CustomEvent('panel-group:updated', { detail: summary }));
                });
            });
            return;
        }

        fetchPromise.then(function (data) {
            if (!data.success) return;

            if (form.dataset.panelGroupFormAction === 'create_group') {
                currentGroupId = data.group.id;
                document.dispatchEvent(new CustomEvent('panel-group:created', { detail: data.group }));
                return loadGroupFragment(currentGroupId).then(function (html) {
                    if (!isCurrentFetchSeq(dialog, seq)) return;
                    animateModalHeightChange(dialog, function () { render(html); });
                });
            }

            if (!currentGroupId) return;
            return loadGroupFragment(currentGroupId).then(function (html) {
                if (!isCurrentFetchSeq(dialog, seq)) return;
                animateModalHeightChange(dialog, function () { render(html); });
                var summary = readGroupSummary();
                if (summary) document.dispatchEvent(new CustomEvent('panel-group:updated', { detail: summary }));
            });
        });
    });
})();
