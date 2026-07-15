// Resolves which school's Panel Groups should be shown, without a page-local
// School dropdown: the sidebar's School switcher (localStorage 'pref-school',
// a school name — set by main.js) is the source of truth once it has run.
// "All Schools"/"All Primary"/"All Secondary" explicitly mean "no filter" —
// only a genuinely-unset pref-school (shouldn't normally happen) falls back
// to the current identity's own school.
window.resolvePanelSchoolFilter = function (groupOptions, currentStaffSchoolId) {
    var prefSchool;
    try { prefSchool = localStorage.getItem('pref-school'); } catch (e) { }
    if (!prefSchool) return currentStaffSchoolId || '';
    if (prefSchool.indexOf('All ') === 0) return '';
    var match = groupOptions.filter(function (opt) { return opt.dataset.schoolName === prefSchool; })[0];
    return match ? match.dataset.school : (currentStaffSchoolId || '');
};

// Client-side filter bars (Students/Referrals/Actions) don't submit/reload —
// they filter .entity-rows in place — but should still get the same
// .filter-bar-label/.filter-bar-count active-count badge and
// .filter-field--active highlight as the server-side dashboard flavour (see
// DesignLanguage.md "Filter bar"). Rather than duplicate that bookkeeping in
// each page's own inline <script>, wire it once here: pass the .filter-bar
// element, get back a refresh() to call from the page's own
// applyFilters()/clearFilters() whenever a control changes.
//
// A field counts as "active" when its control differs from its default
// (non-empty select, non-empty text input, or an "on" toggle-pill) — unless
// the field is marked [data-not-a-filter], for fields that merely feed
// another filter rather than constrain the list themselves (e.g. Actions'
// "Staff Assigned" identity picker, which only matters once "Assigned to Me"
// is toggled on).
window.wireFilterBarActiveState = function (filterBar) {
    if (!filterBar) return function () { };
    var badge = filterBar.querySelector('.filter-bar-count');
    var fields = Array.prototype.slice.call(filterBar.querySelectorAll('.filter-field')).filter(function (field) {
        return !field.hasAttribute('data-not-a-filter') && !field.querySelector('.filter-bar-clear');
    });

    function isActive(field) {
        var select = field.querySelector('select');
        if (select) return select.value !== '';
        var input = field.querySelector('input[type=text], input[type=search]');
        if (input) return input.value.trim() !== '';
        var toggle = field.querySelector('.toggle-pill');
        if (toggle) return toggle.classList.contains('on');
        return false;
    }

    function refresh() {
        var count = 0;
        fields.forEach(function (field) {
            var active = isActive(field);
            field.classList.toggle('filter-field--active', active);
            if (active) count++;
        });
        if (badge) {
            badge.textContent = count;
            badge.classList.toggle('filter-bar-count--empty', count === 0);
        }
    }

    refresh();
    return refresh;
};

// Closes a dialog.modal-dialog instantly (dialog.close() fires synchronously
// - see closeModal() below for why: a showModal() dialog blocks every click
// on the rest of the page for as long as it's still open, regardless of its
// own opacity, so waiting out a fade before closing left a real dead-click
// window) while still visually fading it out - via a detached, non-modal
// clone ("ghost") that plays the closing transition instead of the real
// dialog. The ghost is never shown with .show()/.showModal(), so it never
// enters the top layer and is never "open" in the modal sense - it cannot
// block or receive input no matter how long it lingers, which is what makes
// this safe where simply delaying the real close() wasn't. Belt-and-braces
// on top of that: `inert`, `aria-hidden`, and `pointer-events: none` all
// independently guarantee it's inert, so no single one of them being
// insufficient on its own (e.g. an older browser not supporting `inert`)
// leaves a gap.
window.closeModalWithFadeOut = function (dialog) {
    if (!dialog || !dialog.open) return;
    var rect = dialog.getBoundingClientRect();
    var duration = parseFloat(getComputedStyle(dialog).getPropertyValue('--modal-duration')) || 450;

    var ghost = dialog.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');
    ghost.style.position = 'fixed';
    ghost.style.inset = 'auto';
    ghost.style.margin = '0';
    ghost.style.top = rect.top + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '2147483647';
    document.body.appendChild(ghost);
    // Force a layout flush so the class removal just below is read as a
    // genuine style change to transition from, not folded into the same
    // frame as the append (which would skip the transition entirely).
    void ghost.offsetHeight;
    ghost.classList.remove('is-open');
    setTimeout(function () { ghost.remove(); }, duration + 50);

    dialog.classList.remove('is-open');
    dialog.close();
};

// Animates a dialog.modal-dialog's height across a content swap (e.g.
// showing/hiding sections in place) via the `height` transition it already
// declares in CSS (components/panel.css) but otherwise never uses, since
// `height: auto` can't itself be transitioned — snapshot the current
// rendered height, run `mutate` (the actual DOM change), measure the
// mutated content's true natural height, then transition to that explicit
// pixel value, clearing back to `height: auto` once the transition's had
// time to finish so later content changes aren't pinned to a stale pixel
// height. A no-op dialog (not open, e.g. content swapped before first
// showModal()) just runs `mutate` immediately - nothing to animate from.
//
// Two things that look like they'd work here don't, both confirmed live
// via Playwright (a plausible-looking fix landed twice before this one and
// visibly still snapped instead of easing):
//
// 1. Measuring the target height with `dialog.scrollHeight` right after
//    `mutate` is wrong whenever the new content is *shorter* than the
//    still-pinned start height — scrollHeight can't report anything
//    smaller than the element's own current rendered box, so it just
//    echoes the pinned startHeight back, forever, no matter how much
//    smaller the actual content is. The only way to measure the mutated
//    content's true natural size is to briefly release the pinned height
//    (`height: auto`), read the now-accurate rendered height, and
//    immediately re-pin back to startHeight — all synchronously, so
//    nothing ever paints the transient unpinned state.
// 2. A *single* requestAnimationFrame isn't enough to get a real "before"
//    frame for the transition to ease from: a rAF callback requested from
//    ordinary script runs in the very next "update the rendering" step,
//    before that step's own paint - so writing the target height there
//    lands in the same rendering opportunity as the mutation, and the
//    browser only ever paints once, straight at the final height. Nesting
//    a second rAF defers the target-height write to the *following*
//    rendering opportunity, guaranteeing a real paint at the start height
//    happens first.
//
// Calls on the same dialog can also overlap (e.g. openInlinePanelGroupCreate's
// "show loading" swap immediately followed by "loading -> loaded content"
// once the fetch resolves — near-instant on a local dev server, easily
// landing before the first swap's own nested rAFs have even fired). A
// per-dialog generation counter is bumped on every call; the nested rAF
// and the clear-timer both bail out if a newer call has since started, so
// a stale write from an overlapped-and-superseded call never clobbers the
// one that actually matters.
window.animateModalHeightChange = function (dialog, mutate) {
    if (!dialog || !dialog.open) {
        if (mutate) mutate();
        return;
    }
    if (dialog._heightClearTimer) clearTimeout(dialog._heightClearTimer);
    var generation = (dialog._heightChangeGeneration = (dialog._heightChangeGeneration || 0) + 1);
    var duration = parseFloat(getComputedStyle(dialog).getPropertyValue('--modal-duration')) || 450;
    var startHeight = dialog.getBoundingClientRect().height;
    dialog.style.height = startHeight + 'px';
    // Force a synchronous layout flush so this first height write is
    // committed as a real, distinct value (not coalesced with whatever
    // came before it) before `mutate` runs — same fix closeModalWithFadeOut
    // already documents needing (`void ghost.offsetHeight`) for the
    // identical reason.
    void dialog.offsetHeight;
    mutate();
    // Whichever element actually scrolls (`.modal-body` in most dialogs,
    // `.panel-group-modal-scroll` nested a level deeper in Panel Group Edit,
    // since that one's own .modal-body is unscrollable by design) pops its
    // scrollbar the instant its content outgrows the dialog's
    // still-animating pinned height - e.g. switching to a tab with more
    // rows than fit at the *previous* tab's height, for the split second
    // before the dialog eases up to the new target height. Queried fresh
    // *after* mutate (not hardcoded to `.modal-body`, and not captured
    // before mutate runs) because a full innerHTML replace - as opposed to
    // a plain hidden-attribute toggle - swaps in an entirely new element
    // instance, so anything captured beforehand would be suppressing a
    // detached node while the real, connected one goes unsuppressed.
    // Restored by the same generation-guarded timer that clears the pinned
    // height below, once there's no more mid-transition mismatch to hide.
    var scrollEls = Array.prototype.filter.call(dialog.querySelectorAll('*'), function (el) {
        var overflowY = getComputedStyle(el).overflowY;
        return overflowY === 'auto' || overflowY === 'scroll';
    });
    scrollEls.forEach(function (el) { el.style.overflowY = 'hidden'; });
    // Briefly release the pinned height to measure the mutated content's
    // true natural size (see point 1 above), then re-pin to startHeight
    // immediately - all in the same synchronous pass, so this never paints.
    // Must be `''` (remove the inline override entirely), not an explicit
    // `'auto'` string - confirmed live via Playwright that those two are
    // NOT equivalent here: dialog.modal-dialog is `position: fixed;
    // inset: 0; margin: auto` (the fixed-centering trick), and explicitly
    // writing the inline value 'auto' resolves through that positioning
    // math to the element's max-height (86vh) instead of its content size,
    // while genuinely having no inline height at all correctly falls back
    // to content-based sizing. Same two keyword-looking values, different
    // resolved height entirely.
    dialog.style.height = '';
    var targetHeight = dialog.getBoundingClientRect().height;
    dialog.style.height = startHeight + 'px';
    void dialog.offsetHeight;
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            if (dialog._heightChangeGeneration !== generation) return;
            dialog.style.height = targetHeight + 'px';
        });
    });
    dialog._heightClearTimer = setTimeout(function () {
        if (dialog._heightChangeGeneration === generation) {
            dialog.style.height = '';
            scrollEls.forEach(function (el) { el.style.overflowY = ''; });
        }
        dialog._heightClearTimer = null;
    }, duration);
};

// Fades an element in/out instead of flipping its `hidden` attribute
// abruptly - for small, same-size elements (a button, a footer row) that
// pop in/out of an already-open dialog without changing its height, e.g.
// the Panel Group modal footer swapping "+ Add Member" for "Back"/"New
// External Contact". Genuine height-affecting swaps still go through
// window.animateModalHeightChange above - this is for the plain "this one
// thing appears/disappears in place" case that rule doesn't cover, per
// InteractionLanguage.md's "Fade toggle" entry.
//
// [hidden] is UA-styled `display: none`, which can't be transitioned - so
// hiding needs the *opposite* order from showing: drop opacity first (via
// removing .is-visible), only set `hidden` once that transition has had
// time to finish. `el._fadeHiddenTarget` (not just reading `el.hidden`,
// which lags behind the true intent while a hide is still mid-transition)
// tracks which state a call actually asked for, so a show that arrives
// before a prior hide's timer fires cancels it instead of the two racing.
window.setFadeHidden = function (el, hide) {
    if (!el) return;
    var targetHidden = !!hide;
    if (el._fadeHiddenTarget === targetHidden) return;
    el._fadeHiddenTarget = targetHidden;
    if (el._fadeHiddenTimer) window.clearTimeout(el._fadeHiddenTimer);
    el.classList.add('fade-toggle');
    if (targetHidden) {
        el.classList.remove('is-visible');
        el._fadeHiddenTimer = window.setTimeout(function () {
            if (el._fadeHiddenTarget) el.hidden = true;
        }, 160);
    } else {
        el.hidden = false;
        // Force a style flush so the browser commits the pre-transition
        // opacity: 0 (the .fade-toggle base rule, now that [hidden] no
        // longer overrides it) as a real starting frame before the next
        // line asks it to transition away from that - without this the two
        // writes coalesce and the fade-in never plays.
        void el.offsetHeight;
        el.classList.add('is-visible');
    }
};

(function () {
    var dialog = document.getElementById('new-referral-dialog');
    if (!dialog) return;

    function openModal(studentId, nextUrl) {
        var url = '/inclusion/panel/referrals/new/?';
        if (studentId) url += 'student=' + encodeURIComponent(studentId) + '&';
        if (nextUrl) url += 'next=' + encodeURIComponent(nextUrl);
        loadModal(url);
    }

    function openEditModal(referralId, nextUrl) {
        var url = '/inclusion/panel/referrals/' + encodeURIComponent(referralId) + '/edit/?';
        if (nextUrl) url += 'next=' + encodeURIComponent(nextUrl);
        loadModal(url);
    }

    // "Referral Details" is always read-only, even for the referral's own
    // creator - view=1 forces that server-side regardless of the ownership
    // check inclusion_panel_referral_edit otherwise uses to gate editing.
    function openViewModal(referralId, nextUrl) {
        var url = '/inclusion/panel/referrals/' + encodeURIComponent(referralId) + '/edit/?view=1&';
        if (nextUrl) url += 'next=' + encodeURIComponent(nextUrl);
        loadModal(url);
    }

    function loadModal(url) {
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.text(); })
            .then(function (html) {
                dialog.innerHTML = html;
                window.enhanceFormControls(dialog);
                wireStudentPicker();
                dialog.showModal();
                // Autofocus the student search the moment the dialog opens,
                // but only when it's actually the visible step (a pre-selected
                // student, e.g. opened from a student's own page, hides the
                // search panel entirely - see _referral_form_fields.html).
                // Must run after showModal(): focusing a still-closed <dialog>
                // is silently ignored by the browser.
                var initialSearch = dialog.querySelector('[data-referral-student-search]');
                var initialSearchPanel = dialog.querySelector('[data-referral-student-search-panel]');
                if (initialSearch && initialSearchPanel && !initialSearchPanel.hidden) initialSearch.focus();
                requestAnimationFrame(function () { dialog.classList.add('is-open'); });
            });
    }

    function closeModal() {
        window.closeModalWithFadeOut(dialog);
    }

    function animateHeightChange(mutate) {
        window.animateModalHeightChange(dialog, mutate);
    }

    function wireStudentPicker() {
        var picker = dialog.querySelector('[data-referral-student-picker]');
        if (!picker) return;

        var form = dialog.querySelector('[data-referral-modal-form]');
        var input = picker.querySelector('[data-referral-student-input]');
        var search = picker.querySelector('[data-referral-student-search]');
        var searchPanel = picker.querySelector('[data-referral-student-search-panel]');
        var resultsEl = picker.querySelector('[data-referral-student-results]');
        var selectedRow = picker.querySelector('[data-referral-student-selected]');
        var selectedName = picker.querySelector('[data-referral-student-selected-name]');
        var changeBtn = picker.querySelector('[data-referral-student-change]');
        var questionFields = dialog.querySelector('[data-referral-question-fields]');
        var btnRow = dialog.querySelector('.btn-row');
        var saveBtn = dialog.querySelector('[data-referral-save]');
        var debounceTimer = null;

        function updateSaveState() {
            if (saveBtn && form) saveBtn.disabled = !form.checkValidity();
        }

        function showForm() {
            animateHeightChange(function () {
                searchPanel.hidden = true;
                selectedRow.hidden = false;
                if (questionFields) questionFields.hidden = false;
                if (btnRow) btnRow.hidden = false;
                if (form) form.classList.remove('is-picking-student');
                updateSaveState();
            });
        }

        function renderResults(students) {
            animateHeightChange(function () {
                if (!students.length) {
                    resultsEl.innerHTML = '<p class="empty-note search-hint">No matching students.</p>';
                    return;
                }
                resultsEl.innerHTML = students.map(function (s) {
                    var display = s.name + (s.subtitle ? ' — ' + s.subtitle : '');
                    return '<button type="button" class="referral-student-option" data-id="' + s.id + '" data-name="' + s.name + '" data-display="' + display + '">' +
                        '<span class="referral-student-option-name">' + s.name + '</span>' +
                        '<span class="referral-student-option-meta">' + (s.subtitle || '') + '</span>' +
                        '</button>';
                }).join('');
            });
        }

        function runSearch(term) {
            fetch('/inclusion/panel/search/?kind=student&q=' + encodeURIComponent(term), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
                .then(function (res) { return res.json(); })
                .then(function (data) { renderResults(data.results); });
        }

        function showPicker() {
            animateHeightChange(function () {
                input.value = '';
                searchPanel.hidden = false;
                selectedRow.hidden = true;
                if (questionFields) questionFields.hidden = true;
                if (btnRow) btnRow.hidden = true;
                if (form) form.classList.add('is-picking-student');
                search.value = '';
                resultsEl.innerHTML = '<p class="empty-note search-hint">Start typing to search students…</p>';
                search.focus();
                updateSaveState();
            });
        }

        // Hidden until typed, server-fetched, debounced 250ms with a 2-char
        // minimum - the shared Search precedent (InteractionLanguage.md
        // "Search"), same numbers as Panel search and Add Member.
        search.addEventListener('input', function () {
            var term = search.value.trim();
            clearTimeout(debounceTimer);
            if (!term) {
                animateHeightChange(function () {
                    resultsEl.innerHTML = '<p class="empty-note search-hint">Start typing to search students…</p>';
                });
                return;
            }
            if (term.length === 1) {
                debounceTimer = setTimeout(function () {
                    animateHeightChange(function () {
                        resultsEl.innerHTML = '<p class="empty-note search-hint">Keep typing… (2+ characters)</p>';
                    });
                }, 400);
                return;
            }
            debounceTimer = setTimeout(function () { runSearch(term); }, 250);
        });

        resultsEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.referral-student-option');
            if (!btn) return;
            input.value = btn.getAttribute('data-id');
            selectedName.textContent = btn.getAttribute('data-display') || btn.getAttribute('data-name');
            showForm();
        });

        if (changeBtn) changeBtn.addEventListener('click', showPicker);

        if (form) {
            form.addEventListener('input', updateSaveState);
            form.addEventListener('change', updateSaveState);
        }

        if (input.value) {
            showForm();
        } else {
            showPicker();
        }
    }

    document.addEventListener('click', function (e) {
        var trigger = e.target.closest('[data-new-referral-trigger]');
        if (trigger) {
            openModal(trigger.getAttribute('data-student-id'), trigger.getAttribute('data-next'));
            return;
        }
        var editTrigger = e.target.closest('[data-edit-referral-trigger]');
        if (editTrigger) {
            openEditModal(editTrigger.getAttribute('data-referral-id'), editTrigger.getAttribute('data-next'));
            return;
        }
        var viewTrigger = e.target.closest('[data-view-referral-trigger]');
        if (viewTrigger) {
            openViewModal(viewTrigger.getAttribute('data-referral-id'), viewTrigger.getAttribute('data-next'));
            return;
        }
        if (e.target.closest('[data-modal-close]')) {
            closeModal();
        }
    });

    dialog.addEventListener('click', function (e) {
        if (e.target === dialog) closeModal();
    });

    dialog.addEventListener('submit', function (e) {
        var form = e.target.closest('[data-referral-modal-form]');
        if (!form) return;
        e.preventDefault();

        fetch(form.action, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: new FormData(form),
        }).then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.success) {
                    closeModal();
                    window.location.reload();
                    return;
                }
                // Server-side rejected it (e.g. a required question like Main
                // Concern Category was left blank) - the client-side
                // `required` check should already have caught this, but that
                // can be bypassed (a disabled/hidden field is barred from
                // constraint validation), so this is the real backstop.
                var errorEl = form.querySelector('[data-referral-form-error]');
                if (errorEl && data.errors && data.errors.length) {
                    errorEl.textContent = 'Please answer: ' + data.errors.join(', ') + '.';
                    errorEl.hidden = false;
                }
            });
    });

    // Action status dropdown, in Referral Details' own Actions section - this
    // one's response is HTML (the whole Referral Details fragment, re-rendered
    // with the new status), not JSON, and never closes the dialog - the point
    // is to stay open while checking off several actions in a row.
    //
    // data-action-toggle-form is a plain <div>, not a real <form> - it lives
    // inside the referral modal's own outer <form data-referral-modal-form>,
    // and nested <form> elements are illegal HTML (the browser silently drops
    // one of the two), so the request is built by hand from its hidden inputs
    // instead of relying on form submission/FormData(form).
    dialog.addEventListener('change', function (e) {
        var select = e.target.closest('[data-action-status-select]');
        if (!select) return;
        var container = select.closest('[data-action-toggle-form]');
        if (!container) return;

        var body = new FormData();
        container.querySelectorAll('input').forEach(function (input) {
            body.append(input.name, input.value);
        });
        body.append(select.name, select.value);

        fetch(container.dataset.actionUrl, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: body,
        }).then(function (res) { return res.text(); })
            .then(function (html) {
                dialog.innerHTML = html;
                window.enhanceFormControls(dialog);
                wireStudentPicker();
            });
    });
})();

// Panel Group modal — one dialog/controller for both creating a new group
// and managing an existing one (rename, default chair, members, per-member
// expertise). Creating a group doesn't close the modal: it swaps the same
// dialog's content over to the members view for the group just created, so
// setup happens in one continuous session. Once a group exists, every field
// (name, chair, expertise) autosaves on blur/change - there's no Save
// button anywhere past that point. Every mutating submission re-fetches the
// GET fragment and swaps it back in so the modal's own member list/chair
// options refresh in place — no page reload. A `panel-group:updated` event
// (name, chair, active member count) is dispatched after each change so
// pages showing this group elsewhere (Panel Groups settings) can patch just
// their own row live.
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
        window.closeModalWithFadeOut(dialog);
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
    // its own trailing button inline - see hubs/inclusion/panel/DesignLanguage.md's
    // "Edit Panel Group modal" section for why. The whole sticky header
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
            // than snap (window.setFadeHidden, panel.js; InteractionLanguage.md
            // "Fade toggle"), unlike listView/addView/header just above,
            // which are real content swaps already covered by this whole
            // callback being wrapped in animateModalHeightChange.
            if (enterBtn) window.setFadeHidden(enterBtn, mode !== 'list');
            if (backBtn) window.setFadeHidden(backBtn, mode !== 'add');
            // Only force-hide on the way OUT of add mode - initMemberPicker
            // (its own External segmented option) owns showing it back on
            // the way in, since this footer (unlike the picker's own markup)
            // stays visible in list mode too and would otherwise keep
            // showing a stale "New External Contact" from the last time
            // External was selected.
            if (addExternalBtn && mode !== 'add') window.setFadeHidden(addExternalBtn, true);
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
            window.animateModalHeightChange(dialog, function () { applyMode(mode); });
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
                    window.animateModalHeightChange(dialog, function () { setActiveTab(btn.dataset.membersTab); });
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

        // Snapshot for the Active/Inactive count-delta pulse below (see
        // InteractionLanguage.md's "Count-delta pulse") - taken before this
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
        // CSS animation (which just triggers off the element existing,
        // with no JS gating) replays every time and reads as a flash/
        // flicker. Only let it play on the render that actually opens the
        // modal.
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
                window.pulseCount(countEl, newCount > oldCount ? 'up' : 'down');
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
        if (hostSchoolSelect && hostSchoolSelect.value) return hostSchoolSelect.value;

        if (select && select.value) {
            var current = select.options[select.selectedIndex];
            if (current && current.dataset.school) return current.dataset.school;
        }

        if (select) {
            var options = Array.prototype.slice.call(select.options).filter(function (opt) { return opt.value; });
            return window.resolvePanelSchoolFilter(options, select.dataset.currentStaffSchool);
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
    // restoring the original content - runs through
    // window.animateModalHeightChange so the dialog eases to its new
    // height instead of snapping. On success, dispatches the same
    // `panel-group:created` event the full #panel-group-dialog flow
    // already dispatches — every host page listens for that itself (see
    // meeting_setup.html / _panel_meeting_form_modal.html's own
    // panel-group:created handlers) to add the new option and select it,
    // so this function doesn't need to know anything about the host's own
    // select-refresh logic.
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
            window.animateModalHeightChange(hostDialog, function () {
                host.hidden = true;
                host.innerHTML = '';
                original.hidden = false;
                if (titleEl) titleEl.textContent = originalTitle;
            });
        }

        window.animateModalHeightChange(hostDialog, function () {
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

                window.animateModalHeightChange(hostDialog, function () {
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
                // this file (see InteractionLanguage.md's "Count-delta pulse"
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
                    window.pulseCount(el, delta > 0 ? 'up' : 'down');
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
                    window.animateModalHeightChange(dialog, function () { render(html); });
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
                    window.animateModalHeightChange(dialog, function () { render(html); });
                });
            }

            if (!currentGroupId) return;
            return loadGroupFragment(currentGroupId).then(function (html) {
                if (!isCurrentFetchSeq(dialog, seq)) return;
                window.animateModalHeightChange(dialog, function () { render(html); });
                var summary = readGroupSummary();
                if (summary) document.dispatchEvent(new CustomEvent('panel-group:updated', { detail: summary }));
            });
        });
    });
})();

(function () {
    var dialog = document.getElementById('panel-meeting-dialog');
    if (!dialog) return;

    // Options for the Panel Group select, captured whole (including ones
    // hidden by the current School filter) so switching School back and
    // forth never permanently loses an option the way removing them from
    // the DOM would.
    var allGroupOptions = [];

    function closeModal() {
        window.closeModalWithFadeOut(dialog);
    }

    function applyGroupFilter() {
        var groupSelect = dialog.querySelector('#new-panel-group');
        var schoolSelect = dialog.querySelector('[data-panel-school-select]');
        if (!groupSelect) return;
        var schoolId = schoolSelect ? schoolSelect.value : '';
        var placeholder = groupSelect.querySelector('option[value=""]');
        var previousValue = groupSelect.value;
        groupSelect.innerHTML = '';
        if (placeholder) groupSelect.appendChild(placeholder);
        var visible = allGroupOptions.filter(function (opt) {
            return !schoolId || opt.dataset.school === schoolId;
        });
        visible.forEach(function (opt) { groupSelect.appendChild(opt); });
        if (visible.some(function (opt) { return opt.value === previousValue; })) {
            groupSelect.value = previousValue;
        } else if (visible.length === 1) {
            groupSelect.value = visible[0].value;
        } else {
            groupSelect.value = '';
        }
        if (groupSelect._uiSelect) groupSelect._uiSelect.refresh();
    }

    function wireSchoolFilter() {
        var groupSelect = dialog.querySelector('#new-panel-group');
        if (!groupSelect) return;
        allGroupOptions = Array.prototype.slice.call(groupSelect.options).filter(function (opt) { return opt.value; });
        var schoolSelect = dialog.querySelector('[data-panel-school-select]');
        if (schoolSelect) schoolSelect.addEventListener('change', applyGroupFilter);
        applyGroupFilter();
    }

    function wireRequiredFields() {
        var form = dialog.querySelector('[data-panel-meeting-modal-form]');
        var saveBtn = dialog.querySelector('[data-create-panel-save]');
        if (!form || !saveBtn) return;
        function updateSaveState() { saveBtn.disabled = !form.checkValidity(); }
        form.addEventListener('input', updateSaveState);
        form.addEventListener('change', updateSaveState);
        updateSaveState();
    }

    // One dialog, one fetch/render path for both modes - `panelId` present
    // means "Edit Panel Settings" for that Panel, omitted means "Create
    // Panel Meeting" (see inclusion_panel_meeting_new in views.py, which
    // renders the same _panel_meeting_form_modal.html fragment either way).
    window.openPanelMeetingModal = function (panelId) {
        var url = panelId
            ? '/inclusion/panel/meetings/' + encodeURIComponent(panelId) + '/edit-details/'
            : '/inclusion/panel/meetings/new/';
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.text(); })
            .then(function (html) {
                dialog.innerHTML = html;
                wireSchoolFilter();
                wireRequiredFields();
                window.enhanceFormControls(dialog);
                dialog.showModal();
                requestAnimationFrame(function () { dialog.classList.add('is-open'); });
            });
    };

    document.addEventListener('click', function (e) {
        if (e.target.closest('[data-create-panel-trigger]')) {
            window.openPanelMeetingModal();
            return;
        }
        var editTrigger = e.target.closest('[data-edit-settings-trigger]');
        if (editTrigger) {
            window.openPanelMeetingModal(editTrigger.dataset.panelId);
            return;
        }
        if (e.target.closest('[data-modal-close]') && e.target.closest('#panel-meeting-dialog')) {
            closeModal();
        }
    });

    document.addEventListener('panel-group:created', function (e) {
        var groupSelect = dialog.querySelector('#new-panel-group');
        if (!groupSelect || !dialog.open) return;
        var group = e.detail;
        var option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name + (group.school_id ? '' : ' (No school)');
        option.dataset.school = group.school_id || '';
        groupSelect.appendChild(option);
        allGroupOptions.push(option);
        groupSelect.value = group.id;
        groupSelect.dispatchEvent(new Event('change'));
        if (groupSelect._uiSelect) groupSelect._uiSelect.refresh();
    });

    dialog.addEventListener('click', function (e) {
        if (e.target === dialog) closeModal();
    });

    dialog.addEventListener('submit', function (e) {
        var form = e.target.closest('[data-panel-meeting-modal-form]');
        if (!form) return;
        e.preventDefault();

        fetch(form.action, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: new FormData(form),
        }).then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.success) {
                    window.location = data.redirect;
                }
            });
    });
})();

// Shared "staff source + search" member picker, used by the meeting "Add
// Member" dialog and the Panel Group "Add Member" form. Several instances
// can exist on one page (one per panel group), so everything is scoped via
// closest()/querySelector() on the picker's own root rather than global ids.
function initMemberPicker(rootEl) {
    var sourceOptions = Array.prototype.slice.call(rootEl.querySelectorAll('[data-member-source-segmented] .ui-segmented-option'));
    var searchInput = rootEl.querySelector('[data-member-search]');
    var staffInput = rootEl.querySelector('[data-member-staff-input]');
    var externalInput = rootEl.querySelector('[data-member-external-input]');
    var resultList = rootEl.querySelector('[data-member-result-list]');
    var searchPanel = rootEl.querySelector('[data-member-search-panel]');
    var selectedSection = rootEl.querySelector('[data-member-selected]');
    var selectedName = rootEl.querySelector('[data-member-selected-name]');
    var changeBtn = rootEl.querySelector('[data-member-change]');
    // Lives in the including page's own footer (e.g. .panel-group-modal-footer),
    // not inside rootEl - see _member_picker.html's doc comment - so this
    // looks it up scoped to the nearest <dialog> rather than rootEl itself.
    var addExternalRow = (rootEl.closest('dialog') || document).querySelector('[data-member-add-external]');
    var schoolId = rootEl.dataset.schoolId || '';
    var existingStaffIds = (rootEl.dataset.existingStaffIds || '').split(',').filter(Boolean);
    var existingExternalIds = (rootEl.dataset.existingExternalIds || '').split(',').filter(Boolean);
    var alreadyMemberLabel = rootEl.dataset.alreadyMemberLabel || 'Already a Member';
    var debounceTimer = null;
    if (!sourceOptions.length || !searchInput) return;

    // Source is a segmented control, not a <select> (see DesignLanguage.md
    // "Segmented control") - mode lives in this closure var instead of a
    // form element's .value, kept in sync with the .active class below.
    var initialActiveBtn = sourceOptions.filter(function (btn) { return btn.classList.contains('active'); })[0] || sourceOptions[0];
    var mode = initialActiveBtn.dataset.value;
    searchInput.placeholder = 'Search ' + initialActiveBtn.textContent + '…';

    function dispatchChange(type, id, name) {
        rootEl.dispatchEvent(new CustomEvent('member-picker:change', { bubbles: true, detail: { type: type, id: id, name: name } }));
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Mirrors templates/icons/avatar_placeholder_svg.html - inlined here
    // since search results are built in JS from fetched JSON, not rendered
    // via {% include %} (same reasoning as HUB_RESULT_ICONS above).
    var AVATAR_PLACEHOLDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<circle cx="12" cy="8.5" r="4" fill="currentColor" /><path d="M3 21c0-4.7 4-8.5 9-8.5s9 3.8 9 8.5" fill="currentColor" /></svg>';

    function renderResults(items) {
        if (!items.length) {
            resultList.innerHTML = '<p class="empty-note search-hint">No matches found.</p>';
            return;
        }
        resultList.innerHTML = items.map(function (item) {
            var metaBits = [];
            if (item.school_name) metaBits.push('<span class="result-school">' + escapeHtml(item.school_name) + '</span>');
            if (item.subtitle) metaBits.push('<span class="result-role">' + escapeHtml(item.subtitle) + '</span>');
            var meta = metaBits.length ? '<span class="member-result-meta">' + metaBits.join('') + '</span>' : '';
            var pill = item.already_member ? '<span class="status-pill type-already">' + escapeHtml(alreadyMemberLabel) + '</span>' : '';
            var icon = item.photo_url ? '<img src="' + escapeHtml(item.photo_url) + '" alt="">' : AVATAR_PLACEHOLDER_SVG;
            return '<button type="button" class="member-result-option" data-source="' + item.source + '" data-id="' + item.id + '" data-name="' + escapeHtml(item.name) + '"' +
                (item.already_member ? ' data-already-member="1"' : '') + '>' +
                '<span class="member-result-icon">' + icon + '</span>' +
                '<span class="member-result-label-stack">' +
                '<span class="member-result-name-row"><span class="result-name">' + escapeHtml(item.name) + '</span>' + pill + '</span>' +
                meta +
                '</span>' +
                '</button>';
        }).join('');
    }

    function runSearch(term) {
        var params = 'q=' + encodeURIComponent(term);
        if (mode === 'external') {
            params += '&kind=external&exclude=' + existingExternalIds.join(',');
        } else {
            params += '&kind=staff&mode=' + mode + '&school_id=' + encodeURIComponent(schoolId) + '&exclude=' + existingStaffIds.join(',');
        }
        fetch('/inclusion/panel/search/?' + params, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (res) { return res.json(); })
            .then(function (data) { renderResults(data.results); });
    }

    // Hidden until typed, server-fetched, debounced 250ms with a 2-char
    // minimum - the shared Search precedent (InteractionLanguage.md
    // "Search"), same numbers as Panel search and the referral student
    // picker.
    function applySearch() {
        var term = searchInput.value.trim();
        clearTimeout(debounceTimer);
        if (!term) {
            var activeBtn = sourceOptions.filter(function (btn) { return btn.classList.contains('active'); })[0] || initialActiveBtn;
            resultList.innerHTML = '<p class="empty-note search-hint">Start typing to search ' + activeBtn.textContent + '…</p>';
        } else if (term.length === 1) {
            debounceTimer = setTimeout(function () {
                resultList.innerHTML = '<p class="empty-note search-hint">Keep typing… (2+ characters)</p>';
            }, 400);
        } else {
            debounceTimer = setTimeout(function () { runSearch(term); }, 250);
        }
        // Adding a new External contact is always on offer once External mode
        // is selected (not just as a "no match" fallback).
        if (addExternalRow) window.setFadeHidden(addExternalRow, mode !== 'external');
    }

    // Switching between the search panel and the compact "selected member"
    // row is a real height change (the full search UI is much taller than
    // one summary row) - same animateModalHeightChange treatment as every
    // other in-place content swap in these dialogs. rootEl may not sit
    // inside a <dialog> at all (a future non-modal use of this picker), so
    // this falls back to running the mutation unanimated rather than
    // requiring one.
    var ownerDialog = rootEl.closest('dialog');
    function animateHeightChange(mutate) {
        if (ownerDialog) {
            window.animateModalHeightChange(ownerDialog, mutate);
        } else {
            mutate();
        }
    }

    // keepSearchText: setMode() (switching Staff/MAT/External) wants to
    // re-run whatever's already typed against the new source rather than
    // discarding it - clearing it on every source switch meant a half-typed
    // search vanished just for touching the segmented control, forcing a
    // retype. The "Change" button (a genuinely fresh pick) still wants the
    // full reset.
    function showPicker(keepSearchText) {
        animateHeightChange(function () {
            staffInput.value = '';
            externalInput.value = '';
            dispatchChange('', '', '');
            searchPanel.hidden = false;
            selectedSection.hidden = true;
            if (!keepSearchText) searchInput.value = '';
            applySearch();
            // Every caller of showPicker() - clicking "Change", and picking a
            // different source via setMode() below - lands the user back in
            // a state where typing a search term is the obvious next thing
            // to do, same as New Referral's own showPicker(). Without this,
            // clicking a segmented source button (itself a <button>, which
            // takes focus on click) silently strands focus on that button
            // instead of returning it to Search.
            searchInput.focus();
        });
    }

    function showSelected(name) {
        animateHeightChange(function () {
            selectedName.textContent = name;
            searchPanel.hidden = true;
            selectedSection.hidden = false;
        });
    }

    function setMode(newMode) {
        mode = newMode;
        var activeBtn;
        sourceOptions.forEach(function (btn) {
            var isActive = btn.dataset.value === mode;
            btn.classList.toggle('active', isActive);
            if (isActive) activeBtn = btn;
        });
        // Search's own placeholder names whichever source is currently
        // selected ("Search School Staff…") rather than a fixed
        // generic "Search…" - the segmented row right above it already shows
        // this, but repeating it here means the field still makes sense on
        // its own once you've scrolled/focused past the row.
        if (activeBtn) searchInput.placeholder = 'Search ' + activeBtn.textContent + '…';
        showPicker(true);
    }

    function reset() {
        var hasSchoolOption = sourceOptions.some(function (btn) { return btn.dataset.value === 'school'; });
        setMode(hasSchoolOption ? 'school' : 'mat');
    }

    sourceOptions.forEach(function (btn) {
        btn.addEventListener('click', function () { setMode(btn.dataset.value); });
    });
    searchInput.addEventListener('input', applySearch);
    if (changeBtn) changeBtn.addEventListener('click', function () { showPicker(false); });

    rootEl.addEventListener('click', function (e) {
        var optBtn = e.target.closest('.member-result-option');
        if (optBtn) {
            if (optBtn.dataset.alreadyMember === '1') return;
            if (optBtn.dataset.source === 'staff') {
                staffInput.value = optBtn.dataset.id;
                externalInput.value = '';
                dispatchChange('staff', optBtn.dataset.id, optBtn.dataset.name);
            } else {
                externalInput.value = optBtn.dataset.id;
                staffInput.value = '';
                dispatchChange('external', optBtn.dataset.id, optBtn.dataset.name);
            }
            showSelected(optBtn.dataset.name);
            return;
        }
    });

    applySearch();
    rootEl._memberPicker = {
        reset: reset,
        // Called by the shared #external-contact-quick-add-dialog (see the
        // IIFE below window.initExpertiseField) once a new contact is
        // created for this specific picker instance - appends it as a
        // result option and selects it, same as clicking an existing one.
        addExternalContact: function (contact) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'member-result-option';
            btn.dataset.source = 'external';
            btn.dataset.id = contact.id;
            btn.dataset.name = contact.name;
            var stack = document.createElement('span');
            stack.className = 'member-result-label-stack';
            var nameRow = document.createElement('span');
            nameRow.className = 'member-result-name-row';
            var nameSpan = document.createElement('span');
            nameSpan.className = 'result-name';
            nameSpan.textContent = contact.name;
            nameRow.appendChild(nameSpan);
            stack.appendChild(nameRow);
            if (contact.job_title) {
                var meta = document.createElement('span');
                meta.className = 'member-result-meta';
                var roleSpan = document.createElement('span');
                roleSpan.className = 'result-role';
                roleSpan.textContent = contact.job_title;
                meta.appendChild(roleSpan);
                stack.appendChild(meta);
            }
            btn.appendChild(stack);
            resultList.appendChild(btn);
            externalInput.value = contact.id;
            staffInput.value = '';
            dispatchChange('external', contact.id, contact.name);
            showSelected(contact.name);
        },
    };
}

window.resetMemberPicker = function (rootEl) {
    if (rootEl && rootEl._memberPicker) rootEl._memberPicker.reset();
};

// Shared row enter/exit animation - originally built for the Panel Agenda
// drag-and-drop feature below, now used portal-wide (see InteractionLanguage.md)
// for adding/removing an item from any div/li list spaced by padding +
// border-bottom (.entity-row, .settings-row, etc). Defined at top level,
// alongside initAgendaDragDrop, for the same reason: available to every
// page's inline scripts and to the other IIFEs further down this file
// (e.g. the Panel Group modal) the moment panel.js parses.

// Brief colour-coded flash (green/added, yellow/moved, red/removed) so an
// action reads as feedback rather than a silent DOM change. The flash
// colour itself snaps on instantly (no transition on the class add), then
// fades back out over 1s via a transition set inline just for that
// moment - keeping .entity-row free of any permanent transition that
// would otherwise also catch (and fade) the .selectable hover fill.
function flash(el, kind) {
    if (!el) return;
    el.classList.add('agenda-flash-' + kind);
    setTimeout(function () {
        el.style.transition = 'background-color 1s ease';
        el.classList.remove('agenda-flash-' + kind);
        el.addEventListener('transitionend', function clearTransition() {
            el.style.transition = '';
        }, { once: true });
    }, 1200);
}

// Status-filter tab entering/leaving the tab row, and any live count
// pulsing when it changes (InteractionLanguage.md's "Status-filter tab
// entering/leaving the tab row" / "Tab count-delta pulse") - a tab's own
// (N), or a card/section heading's count. Defined at top level for the same
// reason as flash() above - any page's inline script can call these after
// an AJAX refresh (or a DOM-only recount - see recountFromRows below) changes
// a count.

// A tab at count 0 stays in the DOM (collapsed to zero width via panel.css's
// .tab-collapsed), rather than being added/removed outright, so this can
// transition it instead of it snapping in/out. `collapsed` is the target
// state; a no-op if the button's already there.
function setTabCollapsed(btn, collapsed) {
    if (!btn) return;
    var isCollapsed = btn.classList.contains('tab-collapsed');
    if (isCollapsed === collapsed) return;
    btn.classList.add('tab-visibility-animating');
    if (collapsed) {
        btn.classList.add('tab-collapsed');
        btn.setAttribute('tabindex', '-1');
    } else {
        btn.classList.remove('tab-collapsed');
        btn.removeAttribute('tabindex');
    }
    setTimeout(function () {
        btn.classList.remove('tab-visibility-animating');
    }, 280);
}
window.setTabCollapsed = setTabCollapsed;

// `direction` is 'up' or 'down'. Restarts the animation even if it's already
// mid-flight (e.g. two quick status changes) by removing both classes and
// forcing a reflow before re-adding one. `el` can be a tab's own .count span
// or a card/section heading's count element - the animation itself doesn't
// care which.
function pulseCount(el, direction) {
    if (!el) return;
    el.classList.remove('count-pulse-up', 'count-pulse-down');
    void el.offsetWidth;
    el.classList.add(direction === 'up' ? 'count-pulse-up' : 'count-pulse-down');
}
window.pulseCount = pulseCount;

// Recomputes a set of tab-row button counts (and, optionally, a card
// heading's total) purely from currently-rendered DOM rows - no server
// round-trip. Right for a plain client-side change like a row being deleted
// (the remaining rows' own data attributes are already correct, nothing
// server-derived needs recomputing) - contrast with a status change whose
// derived fields (e.g. an action's is_overdue) genuinely need the server's
// answer, which goes through a fragment refresh instead (see home.html's
// refreshMyActionsCard for that shape).
//
// `matchers` is a { tabKey: function(row) { return bool; } } map, same shape
// as each page's own actionMatchers/referralMatchers. `keyAttr` is the
// dataset property holding each button's tab key (e.g. 'referralTab').
function recountTabsFromRows(tabRowEl, rows, matchers, keyAttr, headingCountEl) {
    var rowList = Array.prototype.slice.call(rows);
    if (tabRowEl) {
        tabRowEl.querySelectorAll('[data-count]').forEach(function (btn) {
            var key = btn.dataset[keyAttr];
            var matcher = matchers[key];
            if (!matcher) return;
            var newCount = rowList.filter(matcher).length;
            var oldCount = parseInt(btn.dataset.count, 10) || 0;
            if (newCount === oldCount) return;
            btn.dataset.count = String(newCount);
            var countEl = btn.querySelector('.count');
            if (countEl) {
                countEl.textContent = '(' + newCount + ')';
                if (!btn.classList.contains('tab-collapsed')) pulseCount(countEl, newCount > oldCount ? 'up' : 'down');
            }
            setTabCollapsed(btn, newCount === 0);
        });
    }
    if (headingCountEl) {
        var total = rowList.length;
        var oldTotal = parseInt(headingCountEl.dataset.count, 10) || total;
        if (total !== oldTotal) {
            headingCountEl.dataset.count = String(total);
            headingCountEl.textContent = '(' + total + ')';
            pulseCount(headingCountEl, total > oldTotal ? 'up' : 'down');
        }
    }
}
window.recountTabsFromRows = recountTabsFromRows;

// Both row animations below use the Web Animations API (Element.animate)
// rather than toggling a CSS transition class - explicit from/to
// keyframes over a fixed duration are scheduled directly by the browser's
// animation engine, so there's no dependency on catching an intermediate
// painted frame the way a manually reflow-forced CSS transition has (that
// approach - even with a double rAF - still intermittently snapped
// straight to the end state instead of animating, especially on
// freshly-inserted rows or under load from the concurrent fetch).
var ROW_ANIM_DURATION = 900;
var ROW_ANIM_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

// If this element still has an animation in flight from a previous
// shrinkAndFadeOut/growIn call (e.g. the same row reordered twice in
// quick succession before the first grow-in finished), cancel it first.
// Two Element.animate() effects racing on the same properties otherwise
// fight each other - the browser has to arbitrate between them, which is
// exactly what made some reorders/adds look like they'd snapped
// instantly instead of animating. Cancelling also reverts the element to
// its underlying (un-animated) style, so the height measured right after
// is always the row's true natural height, not a mid-animation value.
function cancelRowAnim(el) {
    if (el._rowAnim) {
        el._rowAnim.cancel();
        el._rowAnim = null;
    }
}

// Removing collapses the row in place (rather than just flashing red
// somewhere it reappears once zones refresh, which doesn't read as "this
// went away"). Animates max-height/opacity/padding/margin together from
// the row's current rendered size down to 0.
function shrinkAndFadeOut(el, done) {
    if (!el) { done(); return; }
    cancelRowAnim(el);
    var height = el.getBoundingClientRect().height;
    var cs = getComputedStyle(el);
    el.classList.add('agenda-row-removing');
    var anim = el.animate([
        { maxHeight: height + 'px', opacity: 1, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom },
        { maxHeight: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' },
    ], { duration: ROW_ANIM_DURATION, easing: ROW_ANIM_EASING, fill: 'forwards' });
    el._rowAnim = anim;
    var finished = false;
    function finish() {
        if (finished) return;
        finished = true;
        if (el._rowAnim === anim) el._rowAnim = null;
        // Lock in the collapsed end-state via inline styles *before*
        // cancelling - cancel() reverts a fill:'forwards' animation to
        // the element's underlying (non-animated, full-size) style. That
        // used to be invisible because the deferred column swap that
        // finally removes this row happened synchronously right after
        // this callback. Now that swap can wait on a fresh fetch (see
        // refreshZonesAfter), so without a locked-in inline style the row
        // snaps back to full size/opacity for that gap - reads as the
        // row fading away and then flicking back on.
        el.style.maxHeight = '0px';
        el.style.opacity = '0';
        el.style.paddingTop = '0px';
        el.style.paddingBottom = '0px';
        el.style.marginTop = '0px';
        el.style.marginBottom = '0px';
        anim.cancel();
        done();
    }
    anim.onfinish = finish;
    anim.oncancel = finish;
    setTimeout(finish, ROW_ANIM_DURATION + 150);
}

// Mirror of shrinkAndFadeOut for a freshly-added or just-moved row:
// animates from collapsed/transparent up to its natural height/padding/
// margin and full opacity, instead of just appearing at full size.
// Returns a promise that resolves once the grow-in has actually finished
// (not just started).
function growIn(el) {
    if (!el) return Promise.resolve();
    cancelRowAnim(el);
    var targetHeight = el.getBoundingClientRect().height;
    var cs = getComputedStyle(el);
    el.classList.add('agenda-row-adding');
    var anim = el.animate([
        { maxHeight: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' },
        { maxHeight: targetHeight + 'px', opacity: 1, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom },
    ], { duration: ROW_ANIM_DURATION, easing: ROW_ANIM_EASING, fill: 'forwards' });
    el._rowAnim = anim;
    var finished = false;
    return new Promise(function (resolve) {
        function finish() {
            if (finished) return;
            finished = true;
            if (el._rowAnim === anim) el._rowAnim = null;
            el.classList.remove('agenda-row-adding');
            anim.cancel();
            resolve();
        }
        anim.onfinish = finish;
        anim.oncancel = finish;
        setTimeout(finish, ROW_ANIM_DURATION + 150);
    });
}

// Diffs two row-list containers by a caller-given key attribute (e.g.
// 'data-member-id', 'data-drop-id') and animates only the delta (grow-in
// newly added rows, shrink-fade-out removed ones, in-place swap for changed
// content) instead of a wholesale innerHTML/replaceWith of the whole list.
// Generic version of what started as a one-off for Panel Agenda Setup's
// read-only Members card mirror - pulled out so Edit Panel Group's own
// member list and Panel Agenda Setup's drag zones can reuse it too, instead
// of each doing a full-container swap that tears out whatever unrelated row
// happens to still be mid-animation from a *different*, concurrent click.
// That full-swap-on-every-update pattern was the actual root cause of rows
// "vanishing"/animations cutting short under rapid clicking - not a flaw in
// the animations themselves (see grilling session 2026-07-12).
//
// onRowChanged(row), if given, fires for every row that's newly inserted or
// had its content replaced (not for rows left untouched) - callers with
// per-row listeners that don't survive a fresh DOMParser parse (e.g. Agenda
// Setup's drag handlers, bound directly to each row) use it to rebind just
// those rows instead of every row in the list. Returns the grow-in promises
// for newly-inserted rows so a caller that needs to know when the patch has
// fully settled (not just started) can wait on them.
function diffPatchRowList(oldList, freshList, keyAttr, onRowChanged) {
    function rowMap(list) {
        var map = {};
        list.querySelectorAll(':scope > [' + keyAttr + ']').forEach(function (row) {
            map[row.getAttribute(keyAttr)] = row;
        });
        return map;
    }
    var oldRows = rowMap(oldList);
    var freshOrder = Array.prototype.slice.call(freshList.querySelectorAll(':scope > [' + keyAttr + ']'));
    var freshIds = {};
    freshOrder.forEach(function (row) { freshIds[row.getAttribute(keyAttr)] = true; });

    Object.keys(oldRows).forEach(function (id) {
        if (!freshIds[id]) {
            shrinkAndFadeOut(oldRows[id], function () { oldRows[id].remove(); });
        }
    });

    // Unchanged rows whose content differs swap in place with no animation -
    // only presence/absence is animated here.
    freshOrder.forEach(function (freshRow) {
        var id = freshRow.getAttribute(keyAttr);
        var oldRow = oldRows[id];
        if (oldRow && oldRow.outerHTML !== freshRow.outerHTML) {
            oldRow.replaceWith(freshRow);
            oldRows[id] = freshRow;
            if (onRowChanged) onRowChanged(freshRow);
        }
    });

    var emptyNote = oldList.querySelector(':scope > .empty-note');
    if (emptyNote && freshOrder.length) emptyNote.remove();

    // Added rows: insert before whichever later fresh row already has a
    // place in oldList, so a newly-added row lands in the same sorted
    // position it has in the fresh render instead of always at the end.
    var growPromises = [];
    freshOrder.forEach(function (freshRow, index) {
        var id = freshRow.getAttribute(keyAttr);
        if (oldRows[id]) return;
        var beforeEl = null;
        for (var i = index + 1; i < freshOrder.length; i++) {
            var nextRow = oldRows[freshOrder[i].getAttribute(keyAttr)];
            if (nextRow) { beforeEl = nextRow; break; }
        }
        if (beforeEl) oldList.insertBefore(freshRow, beforeEl);
        else oldList.appendChild(freshRow);
        growPromises.push(growIn(freshRow));
        oldRows[id] = freshRow;
        if (onRowChanged) onRowChanged(freshRow);
    });

    if (!freshOrder.length && !oldList.querySelector(':scope > .empty-note')) {
        var freshEmpty = freshList.querySelector(':scope > .empty-note');
        if (freshEmpty) oldList.appendChild(freshEmpty);
    }
    return growPromises;
}
window.diffPatchRowList = diffPatchRowList;

// Per-container fetch sequence guard: bump before firing a request that will
// eventually mutate `container`, capture the returned number, and check it's
// still current once the response lands - drops a response that's no longer
// the latest instead of applying it. Guards against an older, slower request
// resolving *after* a newer one and overwriting state the newer response
// already applied (nothing here reorders or cancels the network requests
// themselves, just whether a given response is still allowed to act).
function beginFetchSeq(container) {
    container._fetchSeq = (container._fetchSeq || 0) + 1;
    return container._fetchSeq;
}
function isCurrentFetchSeq(container, seq) {
    return container._fetchSeq === seq;
}
window.beginFetchSeq = beginFetchSeq;
window.isCurrentFetchSeq = isCurrentFetchSeq;

// Generic wiring for "delete/remove-this-row" forms: submits over fetch
// instead of letting the browser navigate, and on success shrink-fades the
// row out of the DOM instead of a full page reload. Falls back to a normal
// (unanimated) form submit on network failure or a non-2xx/non-success
// response, so the row's own delete button still works even if AJAX wiring
// breaks for some reason - never silently does nothing.
//
// Confirmation (data-confirm-message) is handled *inside* this same
// listener rather than via a separate onsubmit="return confirm(...)"
// attribute - two independent submit listeners racing on the same event
// is exactly how a Cancel click ended up not actually stopping this
// listener's own fetch/animate (a plain `return false` from an onsubmit
// attribute only preventDefault()s the browser's native submission; it
// doesn't stop *other* listeners on the same event from still running).
// Keeping one listener as the single source of truth avoids that class of
// bug entirely.
function wireRowRemoveForm(form) {
    var row = form.closest('.entity-row, .settings-row, .meeting-card, li');
    // If the row lives inside a tab-row/heading-count container (e.g. My
    // Referrals' <ul>), fire a plain DOM event once it's actually gone so
    // that page's own inline script can recount its own tabs/heading - see
    // recountTabsFromRows above. Kept as a generic event rather than calling
    // that function directly from here, since the matchers/keyAttr needed
    // are page-specific and this helper is reused well beyond referrals.
    var recountContainer = form.closest('[data-recount-container]');
    form.addEventListener('submit', function (e) {
        if (form.dataset.submitting) { e.preventDefault(); return; }
        var confirmMessage = form.dataset.confirmMessage;
        if (confirmMessage && !confirm(confirmMessage)) {
            e.preventDefault();
            return;
        }
        e.preventDefault();
        form.dataset.submitting = '1';
        var submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        fetch(form.action, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: new FormData(form),
        }).then(function (res) {
            if (!res.ok) throw new Error('bad status');
            return res.json();
        }).then(function (data) {
            if (!data.success) throw new Error('not successful');
            if (row) {
                shrinkAndFadeOut(row, function () {
                    if (row.parentNode) row.parentNode.removeChild(row);
                    if (recountContainer) {
                        recountContainer.dispatchEvent(new CustomEvent('panel:row-removed', { bubbles: true }));
                    }
                });
            }
        }).catch(function () {
            delete form.dataset.submitting;
            if (submitBtn) submitBtn.disabled = false;
            form.submit();
        });
    });
}

document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-row-remove-form]').forEach(wireRowRemoveForm);
});

// Shared drag-and-drop for moving referrals onto/off/around a panel's agenda
// (Panel Agenda Setup's Referral Selection <-> Panel Agenda columns, and the live
// Meeting Agenda's Reviews Due card <-> Students Pending list). One "sink"
// zone holds the actual agenda and supports live reordering; any number of
// "pool" zones (New Referrals, Reviews Due) are add
// sources and double as remove targets when something is dragged back out
// of the sink. Dropped rows are never mutated directly - every drop either
// persists a new order (no reload, the drag already left the DOM in the
// right shape) or calls the same form_action the existing Add/Remove buttons
// already use, then reloads so counts/tabs/empty-states stay in sync.
//
// Defined at top level (not inside a DOMContentLoaded callback) so it's
// available the moment panel.js parses — layout.html renders
// {% block content %} (where pages call this) before {% block extra_scripts %}
// (where panel.js itself loads), so a page's own DOMContentLoaded listener
// always registers, and fires, before one nested inside this file would.
window.initAgendaDragDrop = function (zoneConfig, options) {
    options = options || {};
    var removeAction = options.removeAction || 'remove_referral_from_agenda';
    var zones = {};
    var dragged = null;

    // A single shared "drop here" bar, moved to wherever the pointer is
    // hovering in a sink list - shown instead of live-reordering the actual
    // rows during drag, so the list doesn't visibly swap/shuffle around
    // until the drop actually happens.
    var dropIndicator = document.createElement('div');
    dropIndicator.className = 'agenda-drop-indicator';

    function removeIndicator() {
        if (dropIndicator.parentNode) dropIndicator.parentNode.removeChild(dropIndicator);
    }

    Object.keys(zoneConfig).forEach(function (name) {
        var el = document.querySelector('[data-drop-zone="' + name + '"]');
        if (!el) return;
        zones[name] = {
            el: el,
            role: zoneConfig[name].role === 'sink' ? 'sink' : 'pool',
            addAction: zoneConfig[name].addAction,
        };
    });
    var zoneNames = Object.keys(zones);
    if (!zoneNames.length) return;

    function csrfToken() {
        var input = document.querySelector('input[name="csrfmiddlewaretoken"]');
        return input ? input.value : '';
    }

    function postForm(body) {
        body.append('csrfmiddlewaretoken', csrfToken());
        return fetch(window.location.pathname, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: body,
        });
    }

    // Fires a plain <form> submit (Add/Remove buttons) over fetch instead of
    // letting the browser navigate, so it can run *alongside* the row's
    // shrink/fade animation (via Promise.all below) rather than only
    // starting once that animation has already finished.
    function submitFormAsync(form) {
        return fetch(form.action || window.location.pathname, {
            method: (form.method || 'POST').toUpperCase(),
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: new FormData(form),
        });
    }

    // flash/shrinkAndFadeOut/growIn/cancelRowAnim/ROW_ANIM_DURATION/
    // ROW_ANIM_EASING are now shared top-level helpers defined above (see
    // InteractionLanguage.md) - reused here as-is.

    // growIn runs *after* a column has already been swapped (flashAcrossZones
    // calls it at the tail end of applyFreshDoc, on the freshly-inserted
    // row), so it needs to register with this closure's column swap gate
    // (see beginColumnAnim) for the duration of the grow-in - without this a
    // second, unrelated action landing on this same column while this row is
    // still mid-grow would see no pending animation to wait for and swap the
    // column again immediately, tearing this row back out before it ever
    // finished appearing. The shared top-level growIn() has no knowledge of
    // this closure's column-gate machinery, so this thin wrapper is the one
    // agenda-specific call site that still needs it.
    function growInWithColumnGate(el) {
        var release = beginColumnAnim(el.closest('.setup-col'));
        return growIn(el).then(function () {
            release();
        });
    }

    // FLIP-style slide: el has already been moved to its new DOM position by
    // the time this is called - oldRect is where it used to sit on screen.
    // Animates a translateY from that old offset back down to 0, i.e. the
    // row visibly travels from where it was to where it now is. Used for the
    // up/down arrow swap, where two adjacent rows trade places - sliding both
    // of them past each other reads as an obvious "swap" the way the
    // shrink/grow-in-place treatment (built for rows entering/leaving a list
    // entirely) doesn't, since here neither row's height/opacity/position in
    // the list is really changing except by one slot.
    //
    // Every animating row gets an explicit solid background for the
    // duration of the slide - .entity-row has none of its own (it relies on
    // the shared .entity-list background showing through), so any row
    // without an opaque fill would let whatever's stacked behind it bleed
    // through as it crosses paths with another sliding row. This isn't only
    // the primary row vs. its neighbour: a multi-row drag reorder can shift
    // several rows at once, and any two of *those* can cross each other too.
    // onTop, if passed, additionally lifts this one row above every other
    // (via z-index) - only the actively-dragged/clicked row needs that, so
    // it stays visually on top of whichever rows it happens to pass over.
    function slideRow(el, oldRect, onTop) {
        if (!el) return;
        cancelRowAnim(el);
        var newRect = el.getBoundingClientRect();
        var deltaY = oldRect.top - newRect.top;
        el.style.background = 'var(--bg-surface)';
        if (onTop) {
            el.style.position = 'relative';
            el.style.zIndex = '1';
        }
        function clearStyles() {
            el.style.background = '';
            if (onTop) { el.style.position = ''; el.style.zIndex = ''; }
        }
        if (!deltaY) {
            clearStyles();
            return;
        }
        var anim = el.animate([
            { transform: 'translateY(' + deltaY + 'px)' },
            { transform: 'translateY(0)' },
        ], { duration: ROW_ANIM_DURATION, easing: ROW_ANIM_EASING, fill: 'forwards' });
        el._rowAnim = anim;
        var finished = false;
        function finish() {
            if (finished) return;
            finished = true;
            // Only clear these styles if this is still the row's current
            // animation. If a second move landed on this same row (e.g.
            // dragged again, or swapped a second time) before this one
            // finished, cancelRowAnim() above would have already cancelled
            // this animation from *that* newer call - its own cancel event
            // still fires here, asynchronously, but by then el._rowAnim
            // points at the newer animation and its own styles are the ones
            // that should stay in place. Without this guard, this stale
            // finish() would wipe out the newer animation's solid background
            // out from under it mid-flight - exactly the "transparency shows
            // up sometimes" symptom, only when two moves overlapped in time.
            var isCurrent = el._rowAnim === anim;
            if (isCurrent) el._rowAnim = null;
            anim.cancel();
            if (isCurrent) clearStyles();
        }
        anim.onfinish = finish;
        anim.oncancel = finish;
        setTimeout(finish, ROW_ANIM_DURATION + 150);
    }

    // Re-finds a row by referral id across the given zones (post-refresh, so
    // it's whatever fresh element now represents that referral) and flashes
    // it - the in-page replacement for the old sessionStorage-based
    // flash-after-reload handoff, now that nothing actually reloads. Scoped
    // to just the zones that were actually just swapped (not all of them) -
    // otherwise, while a deferred zone still holds the old, mid-shrink
    // version of the same referral (see refreshZonesAfter), this would find
    // it too and wrongly grow it back in, cancelling its own shrink.
    //
    // info.kind picks the flash colour (green 'added'/red 'removed') and is
    // purely about how the action reads, independent of info.grow (whether
    // this reappearing row should also grow-in) - e.g. Remove reappears the
    // referral back in Referral Selection, which still needs to grow in, but
    // that's a removal from the agenda, so it should flash red, not green.
    function flashAcrossZones(info, names) {
        var growPromises = [];
        if (!info) return growPromises;
        (names || zoneNames).forEach(function (name) {
            rowsIn(zones[name]).forEach(function (row) {
                var referralId = row.dataset.referralId || row.dataset.dropId;
                if (referralId !== info.id) return;
                flash(row, info.kind);
                if (info.grow) growPromises.push(growInWithColumnGate(row));
            });
        });
        return growPromises;
    }

    // Fetches this same page fresh (does not touch the DOM yet).
    function fetchFreshDoc() {
        return fetch(window.location.pathname, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (resp) { return resp.text(); })
            .then(function (html) { return new DOMParser().parseFromString(html, 'text/html'); });
    }

    // Applies a freshly-fetched document's state for the given zone names,
    // instead of a full window.location.reload() - keeps counts/tabs/order
    // in sync with the server without the jarring full-page flash. Used to
    // replace the whole owning .setup-col wholesale (oldCol.replaceWith),
    // which meant tearing out and recreating every row in that column - tab
    // buttons, drag zones, everything - on every single Add/Remove/reorder,
    // even the rows nothing about this action touched. Now diff-patches just
    // each zone's own row list (window.diffPatchRowList, keyed on
    // data-drop-id) in place instead: a row this action didn't touch keeps
    // its exact DOM node - and any shrink/grow animation still playing on it
    // from a *different*, concurrent action - rather than being destroyed
    // and rebuilt from the fresh HTML (see grilling session 2026-07-12).
    // Since the column itself is never replaced anymore, the tab/active-card
    // carry-over hacks below used to need (freshCol always rendering with
    // the template's hardcoded defaults) simply don't apply - the live
    // column's own state was never disturbed to begin with. Same reasoning
    // for zone.el and each row's drag listeners: they're bound once (init /
    // first insertion) and stay valid for as long as the node they're bound
    // to stays in the document, which - for anything this diff-patch left
    // untouched - is indefinitely.
    function applyFreshDoc(doc, flashInfo, names) {
        names = names || zoneNames;
        var growPromises = [];
        var patchedCols = [];
        names.forEach(function (name) {
            var freshZoneEl = doc.querySelector('[data-drop-zone="' + name + '"]');
            var oldZoneEl = zones[name].el;
            if (!freshZoneEl || !oldZoneEl) return;
            growPromises = growPromises.concat(
                window.diffPatchRowList(oldZoneEl, freshZoneEl, 'data-drop-id', function (row) { bindRow(row, name); })
            );
            // freshZoneEl's <select>s (Priority, etc.) are plain DOMParser
            // output, never run through enhanceSelect - enhanceSelect is
            // idempotent (its own _uiSelect guard), so it's safe to call
            // broadly here rather than tracking exactly which rows the diff
            // just touched.
            if (window.enhanceSelect) {
                oldZoneEl.querySelectorAll('select').forEach(window.enhanceSelect);
            }

            var oldCol = oldZoneEl.closest('.setup-col') || oldZoneEl;
            if (patchedCols.indexOf(oldCol) !== -1) return;
            patchedCols.push(oldCol);
            var freshCol = freshZoneEl.closest('.setup-col') || freshZoneEl;
            // Tab/heading counts (see InteractionLanguage.md's "Tab
            // count-delta pulse") live in the column's header/tab-row, not
            // inside the zone element itself - sync them directly from the
            // fresh doc now that a whole-column swap doesn't bring them
            // along for free.
            oldCol.querySelectorAll('[data-count-key]').forEach(function (el) {
                var key = el.dataset.countKey;
                var freshEl = freshCol.querySelector('[data-count-key="' + key + '"]');
                if (!freshEl) return;
                var oldCount = parseInt(el.dataset.count, 10) || 0;
                var newCount = parseInt(freshEl.dataset.count, 10) || 0;
                if (oldCount === newCount) return;
                el.dataset.count = String(newCount);
                var countEl = el.classList.contains('count') ? el : el.querySelector('.count');
                if (countEl) {
                    countEl.textContent = '(' + newCount + ')';
                    window.pulseCount(countEl, newCount > oldCount ? 'up' : 'down');
                }
            });
        });
        return growPromises.concat(flashAcrossZones(flashInfo, names));
    }

    // --- Column swap serialization ---------------------------------------
    // A column's zones must never be re-fetched-and-diff-patched (see
    // applyFreshDoc above) while any row inside them is still mid
    // shrink/grow - whether that animation belongs to the same action that's
    // asking to apply this fetch, or a *different*, concurrent one (e.g.
    // Remove's immediate "referral reappears in the pool" swap racing an
    // unrelated Add whose pool row is still shrinking away in that very same
    // column). Applying early cuts the other animation short - the row
    // doesn't finish fading, it just vanishes. Every swap request, whether
    // it would previously have been "immediate" or "deferred", is funnelled
    // through requestSwap()/flushColumn() below, keyed by column, so a
    // fetch+apply only ever actually happens once nothing in that column is
    // animating. This still matters even though applyFreshDoc's own diff no
    // longer destroys untouched rows - fetchFreshDoc() re-reads the entire
    // page's server state, so two overlapping fetches for the same column
    // would still risk the older one's snapshot landing after, and
    // overwriting, whatever the newer one already applied.
    function columnState(col) {
        if (!col._swapState) col._swapState = { pendingAnims: 0, flushing: false, names: [], flashes: [], pendingFlush: null, resolvePendingFlush: null };
        return col._swapState;
    }

    // Call once right when a row's shrink/grow starts in this column, and
    // resolve the returned "done" function once that row's own animDone
    // fires. Any swap requested for this column while the count is above
    // zero is queued rather than applied immediately.
    function beginColumnAnim(col) {
        if (!col) return function () { };
        columnState(col).pendingAnims += 1;
        var released = false;
        return function () {
            if (released) return;
            released = true;
            var state = columnState(col);
            state.pendingAnims -= 1;
            if (state.pendingAnims <= 0) {
                state.pendingAnims = 0;
                maybeFlush(col);
            }
        };
    }

    // Every add/remove/drag action fires its own POST *immediately*, in
    // parallel with every other one in flight - nothing waits its turn to
    // even start. What still has to be serialized, per column, is the
    // fetchFreshDoc()-and-swap that follows: fetchFreshDoc() re-fetches the
    // *entire* page's current server state, so if two of those requests for
    // the same column were ever genuinely in flight at once, whichever
    // resolves last would win regardless of which action actually finished
    // last server-side - stomping the other's freshly-applied change with a
    // snapshot that might predate it. `flushing` extends the existing
    // pendingAnims gate to cover that fetch+apply window too, so a second
    // action landing on the same column while one is already being applied
    // coalesces into the next flush instead of racing it. This never blocks
    // a *click*, an action's own row animation, or its POST - only when a
    // same-column swap actually lands.
    function maybeFlush(col) {
        var state = columnState(col);
        if (state.pendingAnims <= 0 && !state.flushing && state.names.length) flushColumn(col);
    }

    function flushColumn(col) {
        var state = columnState(col);
        if (!state.names.length) return Promise.resolve();
        var names = state.names;
        var flashes = state.flashes;
        // Any requestSwap() call(s) that arrived while this column was still
        // busy (see below) are waiting on this same promise, not their own -
        // resolve it once this flush (fetch + swap + every grow-in it
        // triggers) genuinely finishes, not when it merely gets kicked off.
        var resolvePendingFlush = state.resolvePendingFlush;
        state.names = [];
        state.flashes = [];
        state.pendingFlush = null;
        state.resolvePendingFlush = null;
        state.flushing = true;
        return fetchFreshDoc().then(function (doc) {
            var growPromises = applyFreshDoc(doc, flashes[0] || null, names);
            for (var i = 1; i < flashes.length; i++) growPromises = growPromises.concat(flashAcrossZones(flashes[i], names));
            // Waiting on these here (rather than letting flushColumn's own
            // promise resolve the instant the swap lands) is what makes the
            // grow-in animation count as part of "this flush is still
            // settling", so a same-column action that arrived mid-flush
            // stays coalesced into the *next* flush rather than being able
            // to sneak its own fetch in during the grow-in.
            return Promise.all(growPromises);
        }).then(function () {
            state.flushing = false;
            if (resolvePendingFlush) resolvePendingFlush();
            // Anything that landed on this column while this flush was in
            // flight got queued (see requestSwap's `flushing` check below)
            // rather than starting its own racing fetch - drain it now,
            // exactly like beginColumnAnim's release() drains whatever
            // queued up while a row was animating.
            maybeFlush(col);
        });
    }

    // Queues these names (and optional flashInfo) to swap on their owning
    // column - swaps right away if nothing's currently animating or being
    // applied there, otherwise waits for whatever's in flight (a row
    // animation via beginColumnAnim, or another flush via flushColumn) to
    // finish, at which point flushColumn() fetches fresh (so it always
    // reflects every action that completed in the meantime, not just the
    // one that happened to trigger this particular call) and applies every
    // queued name/flash together in one swap.
    function requestSwap(col, names, flashInfo) {
        var state = columnState(col);
        names.forEach(function (n) { if (state.names.indexOf(n) === -1) state.names.push(n); });
        if (flashInfo) state.flashes.push(flashInfo);
        if (state.pendingAnims > 0 || state.flushing) {
            // Deferred - maybeFlush() will pick this up once the column is
            // actually free, at some later point this function has no
            // direct handle on. Returning early here (rather than waiting
            // for the swap this call just queued to actually happen) would
            // let whichever action triggered *this* call consider itself
            // fully settled while a third action's swap could still land in
            // the meantime. Returning the same pending promise every
            // deferred caller for this column shares means they all
            // correctly wait for that eventual flush instead.
            if (!state.pendingFlush) {
                state.pendingFlush = new Promise(function (resolve) { state.resolvePendingFlush = resolve; });
            }
            return state.pendingFlush;
        }
        return flushColumn(col);
    }

    // Groups zone names by their owning .setup-col (two zone names, e.g.
    // "new-referrals"/"followups", can share one physical column - the
    // tabbed Referral Selection panel) and requests a swap for each group.
    function requestSwapAll(names, flashInfo) {
        var cols = [];
        var colNames = [];
        names.forEach(function (name) {
            var zoneEl = zones[name].el;
            var col = zoneEl && (zoneEl.closest('.setup-col') || zoneEl);
            if (!col) return;
            var idx = cols.indexOf(col);
            if (idx === -1) { cols.push(col); colNames.push([name]); }
            else colNames[idx].push(name);
        });
        return Promise.all(cols.map(function (col, i) { return requestSwap(col, colNames[i], flashInfo); }));
    }

    // For actions with no local row animation to protect (reorder fallback,
    // drag-add's source side) - still goes through requestSwap so it queues
    // behind any *other*, unrelated action's row that happens to be
    // animating in the same column, instead of swapping straight away
    // regardless.
    function refreshZones(flashInfo) {
        return requestSwapAll(zoneNames, flashInfo);
    }

    // A pool row carries its own origin (see _referral_selection_row.html's
    // data-add-action) regardless of which zone/tab it's currently shown
    // under - lets a row leaving any of Referral Selection's three zones
    // (All, New, Reviews Due) resolve which specific count-key(s) it affects
    // without this file needing to know Referral Selection's own domain
    // vocabulary beyond this one lookup.
    var ADD_ACTION_TO_COUNT_KEY = { add_referral: 'new', add_followup_to_agenda: 'followup' };

    // The increase side of an Add/Remove already pulses immediately (the
    // *other* column's swap isn't gated - see refreshZonesAfter below). The
    // decrease side used to wait out the full ~900ms shrink-out before its
    // count changed at all, since that's genuinely how long the column swap
    // that carries the new number is held off (see beginColumnAnim below) -
    // correct for the DOM swap, but read as a laggy, asymmetric pulse next to
    // the instant increase. This settles the count(s) the instant the row
    // starts leaving, ahead of the real swap: by the time that swap lands,
    // the freshly-fetched number already matches what's showing, so nothing
    // re-pulses - it's a genuine early decrement, not a fake one that gets
    // corrected later.
    function optimisticallyDecrementCounts(row, col) {
        if (!col) return;
        var keyEls = col.querySelectorAll('[data-count-key]');
        if (!keyEls.length) return;
        var targetKeys;
        if (row.dataset.addAction) {
            var originKey = ADD_ACTION_TO_COUNT_KEY[row.dataset.addAction];
            targetKeys = originKey ? ['all', originKey] : ['all'];
        } else if (keyEls.length === 1) {
            // A column with a single count (Panel Agenda's heading, Meeting
            // Agenda's Students Pending heading) - unambiguous, no per-row
            // classification needed.
            targetKeys = [keyEls[0].dataset.countKey];
        } else {
            return;
        }
        keyEls.forEach(function (el) {
            if (targetKeys.indexOf(el.dataset.countKey) === -1) return;
            var oldCount = parseInt(el.dataset.count, 10) || 0;
            var newCount = Math.max(0, oldCount - 1);
            el.dataset.count = String(newCount);
            var countEl = el.classList.contains('count') ? el : el.querySelector('.count');
            if (countEl) {
                countEl.textContent = '(' + newCount + ')';
                window.pulseCount(countEl, 'down');
            }
        });
    }

    // Starts a row's local shrink-out animation *and* registers it with the
    // column swap gate in the same synchronous tick (see beginColumnAnim) -
    // both have to happen together, with nothing async in between. Doing the
    // registration later (refreshZonesAfter used to call beginColumnAnim
    // itself, once this action's own POST had resolved) left a gap between
    // "row visibly starts shrinking" and "column is marked busy" that a
    // second, faster click's swap could land in and still see the column as
    // idle - discarding this row mid-animation instead of waiting for it.
    // Returns the column (for refreshZonesAfter to skip flashing it) and the
    // animDone promise (already wired to release the column once it
    // settles).
    function startRowRemoval(row) {
        var col = row.closest('.setup-col');
        optimisticallyDecrementCounts(row, col);
        var release = beginColumnAnim(col);
        var animDone = new Promise(function (resolve) { shrinkAndFadeOut(row, resolve); });
        animDone.then(release);
        return { col: col, animDone: animDone };
    }

    // For actions that also shrink a row locally (Add/Remove buttons,
    // drag-remove/drag-add). The animating row's own column (registered via
    // startRowRemoval above, before this function is even called) is only
    // actually swapped once animDone fires and no other concurrent animation
    // in that column is still running - so the row keeps shrinking
    // undisturbed, in its normal layout position, right where it already is,
    // rather than being pulled into a separate overlay to fake the overlap.
    // Every other column swaps through the same requestSwap path, so it
    // still applies promptly (letting the row reappearing elsewhere, e.g.
    // back in Referral Selection after Remove, flash+grow immediately)
    // unless something else happens to be animating there too.
    function refreshZonesAfter(animatingCol, flashInfo) {
        return Promise.all(zoneNames.reduce(function (acc, name) {
            var zoneEl = zones[name].el;
            var col = zoneEl && (zoneEl.closest('.setup-col') || zoneEl);
            if (!col) return acc;
            var entry = acc.filter(function (e) { return e.col === col; })[0];
            if (!entry) { entry = { col: col, names: [] }; acc.push(entry); }
            entry.names.push(name);
            return acc;
        }, []).map(function (entry) {
            // The animating row's own column never gets flashInfo (nothing
            // there needs a flash/grow - it's the row that's leaving,
            // already handled by its own local shrink animation) and relies
            // purely on beginColumnAnim/release above to know when it's
            // safe to swap. Every other column swaps with flashInfo intact,
            // subject to whatever's already queued/animating on it.
            return requestSwap(entry.col, entry.names, entry.col === animatingCol ? null : flashInfo);
        }));
    }

    // The Add/Remove/Priority-up-down buttons are plain <form> submits - this
    // intercepts them so they go through the same fetch + refreshZones path
    // as drag-and-drop, instead of a full browser navigation.
    var FORM_ACTION_KIND = {
        add_referral: 'added',
        add_followup_to_agenda: 'added',
    };
    var REMOVE_ACTIONS = ['remove_referral_from_agenda', 'unassign_referral'];

    // Add/Remove (button or drag) starts a row shrinking immediately and
    // fires its POST immediately too - every action's own click and network
    // request go out in parallel with everyone else's, nothing waits its
    // turn. The only thing serialized is the eventual column swap, and only
    // per-column: see the `flushing` gate on requestSwap/flushColumn above,
    // which coalesces same-column swaps together instead of racing two
    // fetchFreshDoc() calls against each other.

    function wirePlainFormFlash() {
        document.addEventListener('submit', function (e) {
            // The Remove form's onsubmit="return confirm(...)" cancels the
            // submit (and thus this event) when the user backs out - skip
            // animating/queuing a flash for an action that didn't happen.
            if (e.defaultPrevented) return;
            var form = e.target;
            var actionInput = form.querySelector('input[name="form_action"]');
            var actionValue = actionInput && actionInput.value;
            var row = form.closest('[draggable="true"]');
            if (!row) return;
            var referralId = row.dataset.referralId || row.dataset.dropId;
            if (actionValue === 'update_priority') {
                // The trigger's own colour/label already updated the instant
                // the popover option was clicked (see enhanceSelect's
                // render() in main.js) - this just persists it in the
                // background, no page navigation or zone refresh needed.
                e.preventDefault();
                submitFormAsync(form);
                return;
            }
            if (REMOVE_ACTIONS.indexOf(actionValue) !== -1) {
                e.preventDefault();
                // A quick second click on this same row's Remove button,
                // before the row has actually left the DOM, used to restart
                // the shrink from scratch (cancelRowAnim inside
                // startRowRemoval/shrinkAndFadeOut cancels the first
                // in-flight animation and measures fresh) - visually that's a
                // snap back to full size for a frame before the second
                // animation takes over, which read as "the click didn't
                // register", and also fired a second, redundant remove
                // request for a row the server was already removing. Once a
                // row is being removed, further clicks on it are ignored
                // outright instead.
                if (row._rowBusy) return;
                row._rowBusy = true;
                flash(row, 'removed');
                // Row's shrink-out - and its column-gate registration - start
                // right here, synchronously, rather than waiting on the
                // submit (see startRowRemoval). The DOM swap (once the submit
                // resolves) doesn't wait for the shrink to finish either -
                // see refreshZonesAfter, which keeps this row alive as a
                // ghost so the swap can happen immediately without cutting it
                // short.
                var removal = startRowRemoval(row);
                submitFormAsync(form).then(function () {
                    // The referral reappears in its pool list (Referral
                    // Selection) once zones refresh - grow it in there too,
                    // not just a silent reappearance, flashing red (not
                    // green) since this is still fundamentally a removal.
                    return refreshZonesAfter(removal.col, { id: referralId, kind: 'removed', grow: true });
                }).then(function () { row._rowBusy = false; }, function () { row._rowBusy = false; });
                return;
            }
            if (FORM_ACTION_KIND[actionValue] === 'added') {
                // Same shrink-and-fade treatment as Remove, so the row leaving
                // the pool list reads as a deliberate action instead of just
                // vanishing the instant the page refreshes.
                e.preventDefault();
                // Same double-click guard as Remove above.
                if (row._rowBusy) return;
                row._rowBusy = true;
                flash(row, 'added');
                var addRemoval = startRowRemoval(row);
                submitFormAsync(form).then(function () {
                    return refreshZonesAfter(addRemoval.col, { id: referralId, kind: 'added', grow: true });
                }).then(function () { row._rowBusy = false; }, function () { row._rowBusy = false; });
                return;
            }
            if (actionValue === 'move_agenda_referral') {
                // Click-based up/down fallback for reordering - the swap is
                // always with the immediate sibling, so (unlike Add/Remove,
                // which need the server's response to know what changed) the
                // new position is already known client-side, and no full
                // zone refresh is needed since nothing but these two rows'
                // positions actually changed. Both rows slide past each
                // other (slideRow) rather than the moved row just
                // shrinking/growing back in roughly the same spot - a literal
                // swap reads as a much more obvious "these two traded places"
                // than a barely-there shrink/grow at an almost identical
                // position would.
                e.preventDefault();
                var zoneEl = row.closest('[data-drop-zone]');
                var direction = form.querySelector('input[name="direction"]');
                direction = direction && direction.value;
                var sibling = direction === 'up' ? row.previousElementSibling : row.nextElementSibling;
                if (zoneEl && sibling) {
                    var zone = zones[zoneEl.dataset.dropZone];
                    var rowOldRect = row.getBoundingClientRect();
                    var siblingOldRect = sibling.getBoundingClientRect();
                    zoneEl.insertBefore(row, direction === 'up' ? sibling : sibling.nextElementSibling);
                    renumber(zone);
                    slideRow(row, rowOldRect, true);
                    slideRow(sibling, siblingOldRect);
                }
                submitFormAsync(form);
            }
        });
    }

    function rowsIn(zone) {
        return Array.prototype.slice.call(zone.el.querySelectorAll(':scope > [draggable="true"]'));
    }

    function rowAfter(zone, y) {
        return rowsIn(zone).filter(function (row) { return row !== dragged.el; }).reduce(function (closest, row) {
            var box = row.getBoundingClientRect();
            var offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) return { offset: offset, element: row };
            return closest;
        }, { offset: -Infinity, element: null }).element;
    }

    function renumber(zone) {
        var rows = rowsIn(zone);
        rows.forEach(function (row, index) {
            var numberEl = row.querySelector('.agenda-order-rail-number');
            if (numberEl) numberEl.textContent = index + 1;
            // The up/down buttons' disabled state is only ever set
            // server-side, at initial render, based on forloop.first/
            // forloop.last. Any reorder that happens purely client-side
            // (arrows, drag) needs to refresh it too, or a row that's no
            // longer first/last is stuck with a disabled arrow that should
            // now be enabled (and vice versa) until the next full page load -
            // e.g. moving the first item down used to leave its up arrow
            // disabled forever. Selected by their hidden `direction` input
            // rather than position, since the rail's middle button (Setup's
            // agenda card) is Remove, not Down.
            var upBtn = row.querySelector('form:has(input[name="direction"][value="up"]) button');
            var downBtn = row.querySelector('form:has(input[name="direction"][value="down"]) button');
            if (upBtn) upBtn.disabled = index === 0;
            if (downBtn) downBtn.disabled = index === rows.length - 1;
        });
    }


    function persistReorder(zone) {
        var body = new URLSearchParams();
        body.append('form_action', 'reorder_agenda');
        rowsIn(zone).forEach(function (row) { body.append('panel_referral_id', row.dataset.dropId); });
        // The slide itself already played (see the drop handler, which runs
        // before this) - no flash here, since the green "added" tint is
        // reserved for a referral actually entering the agenda, not for one
        // that's simply been reordered within it.
        postForm(body);
    }

    function handleDrop(targetName, insertBeforeId) {
        var target = zones[targetName];
        var source = zones[dragged.sourceZone];
        var id = dragged.id;
        var referralId = dragged.referralId;
        if (target.role === 'sink' && source.role === 'sink') {
            persistReorder(target);
        } else if (target.role === 'sink' && source.role === 'pool') {
            var rowEl = dragged.el;
            // Same shrink-and-fade treatment as the Add button and the
            // sink->pool drag-remove case below, so the source row leaving
            // the pool list always animates the same way regardless of how
            // the add was triggered - started immediately, in parallel with
            // the request, rather than gated behind it.
            flash(rowEl, 'added');
            var removal = startRowRemoval(rowEl);
            // The new PanelReferral always lands at the bottom of the agenda
            // server-side (see _next_agenda_order) - follow up the add with
            // a reorder_agenda call that puts it where the drop indicator
            // actually was, using the id the add response hands back.
            var body = new URLSearchParams();
            // Referral Selection's "All" tab mixes New Referral and Review
            // Due rows in one zone - the row's own data-add-action
            // (set per-row in _referral_selection_row.html) tells them apart;
            // new-referrals/followups rows don't set it, so those zones fall
            // back to their single zone-level addAction as before.
            body.append('form_action', rowEl.dataset.addAction || source.addAction);
            body.append('referral_id', id);
            postForm(body).then(function (resp) { return resp.json(); }).then(function (data) {
                var newId = data && data.panel_referral_id;
                if (!newId) return Promise.resolve();
                var ids = rowsIn(target).map(function (row) { return row.dataset.dropId; });
                var insertIndex = insertBeforeId ? ids.indexOf(String(insertBeforeId)) : -1;
                // The add already landed it at the bottom server-side - if
                // that's also where the drop indicator was (insertIndex ===
                // -1, i.e. nothing to insert before), skip the extra
                // reorder_agenda round-trip entirely, so a bottom drop is
                // exactly as fast as Remove instead of paying for a request
                // that would just re-confirm the same order.
                if (insertIndex === -1) return Promise.resolve();
                ids.splice(insertIndex, 0, String(newId));
                var reorderBody = new URLSearchParams();
                reorderBody.append('form_action', 'reorder_agenda');
                ids.forEach(function (idVal) { reorderBody.append('panel_referral_id', idVal); });
                return postForm(reorderBody);
            }).then(function () {
                return refreshZonesAfter(removal.col, { id: referralId, kind: 'added', grow: true });
            });
        } else if (target.role === 'pool' && source.role === 'sink') {
            removeDraggedFromAgenda();
        }
    }

    // Pulled out of handleDrop's pool<-sink branch so the card-level
    // catch-all below (dropping anywhere on the Referral Selection card, not
    // just precisely on its row list) can reuse the exact same logic. Never
    // depends on which specific pool zone/tab received the drop - Referral
    // Selection's two zones (new-referrals/followups) share one card and
    // this same removal happens regardless of which tab is active.
    function removeDraggedFromAgenda() {
        var id = dragged.id;
        var referralId = dragged.referralId;
        var removeBody = new URLSearchParams();
        removeBody.append('form_action', removeAction);
        removeBody.append('panel_referral_id', id);
        var rowEl = dragged.el;
        flash(rowEl, 'removed');
        // Same overlap as the Remove button: the refresh fetch starts as
        // soon as the removal itself is persisted, in parallel with the
        // shrink animation, and the DOM swap doesn't wait for the shrink
        // either (refreshZonesAfter ghosts the row instead).
        var removal = startRowRemoval(rowEl);
        postForm(removeBody).then(function () {
            // Reappears back in Referral Selection - flash red (a removal),
            // not green, since nothing was actually added.
            return refreshZonesAfter(removal.col, { id: referralId, kind: 'removed', grow: true });
        });
    }

    function bindRow(row, name) {
        row.addEventListener('dragstart', function (e) {
            dragged = { el: row, sourceZone: name, id: row.dataset.dropId, referralId: row.dataset.referralId || row.dataset.dropId };
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', row.dataset.dropId || '');
            // A Panel Agenda row can only ever be dropped back onto Referral
            // Selection as a removal - arm every pool card with a subtle red
            // hint the moment it's picked up, rather than making the user
            // hover one first to discover it. bindZone's dragover/dragleave
            // layer the much louder .drag-over-remove on top of this once
            // the drag is actually over a given card.
            if (zones[name].role === 'sink') {
                zoneNames.forEach(function (n) {
                    if (zones[n].role !== 'pool') return;
                    dragOverTarget(zones[n].el).classList.add('drag-remove-armed');
                });
            } else {
                // Mirror image of the above: picking up a Referral Selection
                // row can only ever be dropped onto Panel Agenda as an add -
                // arm every sink card with the same dashed "drop here" outline
                // it would otherwise only get once actually hovered (see
                // bindZone's dragover handler, which also adds .drag-over).
                // No separate subtle/loud tiers needed here like the remove
                // case above - Add is the primary, non-destructive action, so
                // showing the full outline for the whole drag is fine.
                zoneNames.forEach(function (n) {
                    if (zones[n].role !== 'sink') return;
                    dragOverTarget(zones[n].el).classList.add('drag-add-armed');
                });
            }
        });
        row.addEventListener('dragend', function () {
            if (dragged) dragged.el.classList.remove('dragging');
            dragged = null;
            removeIndicator();
            zoneNames.forEach(function (n) {
                clearDragOver(zones[n].el);
                dragOverTarget(zones[n].el).classList.remove('drag-remove-armed', 'drag-add-armed');
            });
        });
    }

    // Highlighting the whole card (header included), not just the inner row
    // list, on pages built with that layout - so the highlight reads as
    // "drop into this container" with a shape that matches the card itself,
    // rather than one that shrinks/grows with however many rows happen to be
    // in the zone right now. Falls back to the zone element itself on pages
    // (e.g. meeting_agenda.html) that use this same drag-drop JS without
    // that column structure.
    function dragOverTarget(zoneEl) {
        return zoneEl.closest('.setup-col') || zoneEl;
    }

    // Only clears the hover-only "actually over this card right now" state -
    // .drag-remove-armed is set once for the whole drag (dragstart) and
    // cleared once for the whole drag (dragend), not on every hover in/out.
    function clearDragOver(zoneEl) {
        dragOverTarget(zoneEl).classList.remove('drag-over', 'drag-over-remove');
    }

    // Only zones panel.js actually does something with on drop should light
    // up as a target - dragging a Referral Selection row over another
    // Referral Selection tab (pool -> pool) isn't a handled case in
    // handleDrop, so it shouldn't invite a drop with a highlight either.
    function canDropInto(sourceRole, targetRole) {
        return !(sourceRole === 'pool' && targetRole === 'pool');
    }

    // Referral Selection's two zones (new-referrals/followups) share one
    // card, and dropping a Panel Agenda row anywhere on that card - not just
    // precisely on whichever row list is currently visible - should remove
    // it, matching the highlight now covering the full card. Bound once per
    // physical card element (tracked here) rather than once per zone name,
    // so a shared card doesn't end up with two listeners double-firing the
    // same removal.
    var removeDropCardsWired = new WeakSet();
    function wireCardRemoveDrop(card) {
        if (!card || removeDropCardsWired.has(card)) return;
        removeDropCardsWired.add(card);
        card.addEventListener('dragover', function (e) {
            if (!dragged || zones[dragged.sourceZone].role !== 'sink') return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            card.classList.add('drag-over', 'drag-over-remove');
        });
        card.addEventListener('dragleave', function (e) {
            if (!dragged || zones[dragged.sourceZone].role !== 'sink') return;
            // dragleave bubbles up from whichever child the pointer actually
            // left, so e.target is almost never the card itself - checking
            // relatedTarget (what's being entered) against contains() is the
            // reliable way to tell a real exit from the card apart from just
            // crossing between two of its children.
            if (card.contains(e.relatedTarget)) return;
            clearDragOver(card);
        });
        card.addEventListener('drop', function (e) {
            if (!dragged || zones[dragged.sourceZone].role !== 'sink') return;
            e.preventDefault();
            clearDragOver(card);
            removeDraggedFromAgenda();
        });
    }

    // Wires up a zone's dragover/dragleave/drop handling plus its rows -
    // called at init and again after refreshZones() swaps in fresh zone
    // elements, since listeners don't carry over to the new nodes.
    function bindZone(name) {
        var zone = zones[name];
        // Only wire the card-level catch-all when there's actually a
        // distinct .setup-col ancestor to bind it to (meeting_setup.html's
        // layout) - on pages without one (e.g. meeting_agenda.html),
        // dragOverTarget falls back to zone.el itself, and binding "the
        // card's" listener there would just be a second drop listener on
        // the same element that already has its own, double-firing the
        // removal.
        if (zone.role === 'pool') {
            var card = zone.el.closest('.setup-col');
            if (card) wireCardRemoveDrop(card);
        }

        zone.el.addEventListener('dragover', function (e) {
            if (!dragged) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            var source = zones[dragged.sourceZone];
            if (canDropInto(source.role, zone.role)) {
                var target = dragOverTarget(zone.el);
                target.classList.add('drag-over');
                // Dragging an agenda row back onto Referral Selection removes
                // it - a red "Remove" treatment rather than the usual green
                // "valid drop" one, so the action it actually performs is
                // obvious before you let go.
                target.classList.toggle('drag-over-remove', source.role === 'sink' && zone.role === 'pool');
            }
            if (zone.role === 'sink') {
                var after = rowAfter(zone, e.clientY);
                if (after == null) zone.el.appendChild(dropIndicator);
                else zone.el.insertBefore(dropIndicator, after);
            } else {
                removeIndicator();
            }
        });
        zone.el.addEventListener('dragleave', function (e) {
            // Same relatedTarget-containment check as wireCardRemoveDrop's
            // dragleave, and for the same reason - e.target here is almost
            // always whatever child row/element the pointer left, not
            // zone.el itself.
            if (zone.el.contains(e.relatedTarget)) return;
            clearDragOver(zone.el);
        });
        zone.el.addEventListener('drop', function (e) {
            e.preventDefault();
            // Stops this from also bubbling up into wireCardRemoveDrop's
            // card-level listener above, which would otherwise double-fire
            // the removal for a drop that landed precisely on the row list
            // itself (as opposed to elsewhere on the card).
            e.stopPropagation();
            clearDragOver(zone.el);
            if (!dragged) return;
            var source = zones[dragged.sourceZone];
            // Capture what row the indicator was sitting before, so an add
            // from a pool zone can tell the server where to insert the new
            // referral (see the reorder_agenda follow-up in handleDrop).
            var insertBeforeId = null;
            if (zone.role === 'sink' && dropIndicator.parentNode === zone.el) {
                var beforeRow = dropIndicator.nextElementSibling;
                insertBeforeId = beforeRow ? beforeRow.dataset.dropId : null;
            }
            // Reordering within the sink list: commit the real row to the
            // indicator's position now, so persistReorder (which reads the
            // list straight off the DOM) picks up the right order. Same
            // slide treatment as the up/down arrows: capture every row's
            // on-screen position before the move, then slide whichever ones
            // actually shifted a slot back from their old position - the
            // dragged row on top with a solid fill (it may cross several
            // rows, not just one neighbour), the displaced rows underneath -
            // instead of the dragged row just teleporting to its new spot
            // with only its own arrival animated.
            if (zone.role === 'sink' && source.role === 'sink' && dropIndicator.parentNode === zone.el) {
                var isNoOpMove = dropIndicator.previousElementSibling === dragged.el;
                if (!isNoOpMove) {
                    var oldRects = rowsIn(zone).map(function (row) { return { el: row, rect: row.getBoundingClientRect() }; });
                    zone.el.insertBefore(dragged.el, dropIndicator);
                    renumber(zone);
                    oldRects.forEach(function (entry) { slideRow(entry.el, entry.rect, entry.el === dragged.el); });
                } else {
                    zone.el.insertBefore(dragged.el, dropIndicator);
                    renumber(zone);
                }
            }
            removeIndicator();
            handleDrop(name, insertBeforeId);
        });

        rowsIn(zone).forEach(function (row) { bindRow(row, name); });
    }

    zoneNames.forEach(bindZone);

    wirePlainFormFlash();

    // Auto-scroll while dragging near a scrollable column's top/bottom edge.
    // Native browser drag auto-scroll only kicks in right at the true edge
    // and then jumps at a fixed fast speed - there's no way to tune that, so
    // it's replaced here with a custom rAF loop whose speed ramps smoothly
    // with proximity: barely moving at the outer boundary of the trigger
    // zone, fastest right at the container's true edge, rather than
    // "nothing, then suddenly fast". On top of that, the speed proximity
    // sets is only a *target* - actual scroll speed additionally ramps up
    // over AUTOSCROLL_RAMP_MS from a standstill each time the drag enters
    // the trigger zone (or reverses direction), rather than jumping straight
    // to that target the instant the pointer crosses the threshold.
    var AUTOSCROLL_EDGE = 90; // px from the scrollable container's edge that starts scrolling
    var AUTOSCROLL_MAX_SPEED = 9; // px per animation frame at the very edge
    var AUTOSCROLL_RAMP_MS = 700; // time to reach full (proximity-scaled) speed after entering the zone
    var autoScrollEl = null;
    var autoScrollTargetSpeed = 0;
    var autoScrollDir = 0; // -1 up, 1 down, 0 idle - direction changes restart the ramp
    var autoScrollRampStart = 0;
    var autoScrollRaf = null;

    function autoScrollStep() {
        if (!autoScrollEl || !autoScrollTargetSpeed) { autoScrollRaf = null; return; }
        var ramp = Math.min((performance.now() - autoScrollRampStart) / AUTOSCROLL_RAMP_MS, 1);
        ramp = 1 - Math.pow(1 - ramp, 2); // ease-out: quick to start moving, gentle at the top
        autoScrollEl.scrollTop += autoScrollTargetSpeed * ramp;
        autoScrollRaf = requestAnimationFrame(autoScrollStep);
    }

    function stopAutoScroll() {
        autoScrollEl = null;
        autoScrollTargetSpeed = 0;
        autoScrollDir = 0;
        if (autoScrollRaf) { cancelAnimationFrame(autoScrollRaf); autoScrollRaf = null; }
    }

    // Walks up from the element under the pointer rather than hardcoding
    // .setup-col-body, so this keeps working if this drag-drop JS is ever
    // reused on a page with a differently-named scrolling ancestor.
    function closestScrollable(el) {
        while (el instanceof Element && el !== document.body) {
            var style = getComputedStyle(el);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }

    document.addEventListener('dragover', function (e) {
        if (!dragged) return;
        var scrollEl = closestScrollable(e.target);
        if (!scrollEl) { stopAutoScroll(); return; }
        var rect = scrollEl.getBoundingClientRect();
        var distFromTop = e.clientY - rect.top;
        var distFromBottom = rect.bottom - e.clientY;
        var speed = 0;
        if (distFromTop >= 0 && distFromTop < AUTOSCROLL_EDGE && scrollEl.scrollTop > 0) {
            speed = -AUTOSCROLL_MAX_SPEED * (1 - distFromTop / AUTOSCROLL_EDGE);
        } else if (distFromBottom >= 0 && distFromBottom < AUTOSCROLL_EDGE
            && scrollEl.scrollTop + scrollEl.clientHeight < scrollEl.scrollHeight) {
            speed = AUTOSCROLL_MAX_SPEED * (1 - distFromBottom / AUTOSCROLL_EDGE);
        }
        if (!speed) { stopAutoScroll(); return; }
        var dir = speed < 0 ? -1 : 1;
        // Entering the trigger zone fresh, switching to a different
        // scrollable column, or reversing direction (up <-> down) all
        // restart the ramp from a standstill, rather than keeping whatever
        // speed a previous, unrelated scroll had already built up.
        if (autoScrollEl !== scrollEl || autoScrollDir !== dir) {
            autoScrollRampStart = performance.now();
            autoScrollDir = dir;
        }
        autoScrollEl = scrollEl;
        autoScrollTargetSpeed = speed;
        if (!autoScrollRaf) autoScrollRaf = requestAnimationFrame(autoScrollStep);
    }, true); // capture: zone-level dragover handlers above call stopPropagation()
    document.addEventListener('dragend', stopAutoScroll, true);
    document.addEventListener('drop', stopAutoScroll, true);
};

// Shared "Add Expertise Tag" dialog (#expertise-quick-add-dialog in
// _base.html) - one instance for the whole page, reused by every Expertise
// field's "+" button (there can be several, e.g. one per Panel Group member
// row) instead of each field expanding its own inline row.
(function () {
    var dialog = document.getElementById('expertise-quick-add-dialog');
    if (!dialog) return;
    var form = dialog.querySelector('[data-expertise-quick-add-form]');
    var input = dialog.querySelector('[data-expertise-quick-add-input]');
    var targetSelect = null;

    function closeDialog() {
        window.closeModalWithFadeOut(dialog);
        targetSelect = null;
    }
    dialog.querySelectorAll('[data-modal-close]').forEach(function (btn) {
        btn.addEventListener('click', closeDialog);
    });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDialog(); });

    // select is the specific Expertise <select> whose "+" was clicked - the
    // page can have several, so the dialog needs to know which one to apply
    // the new tag/selection back to on save.
    window.openExpertiseQuickAdd = function (select) {
        targetSelect = select;
        input.value = '';
        dialog.showModal();
        requestAnimationFrame(function () {
            dialog.classList.add('is-open');
            input.focus();
        });
    };

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = input.value.trim();
        if (!name || !targetSelect) return;
        var csrfInput = targetSelect.closest('form') && targetSelect.closest('form').querySelector('input[name="csrfmiddlewaretoken"]');
        var fd = new FormData();
        fd.append('name', name);
        fd.append('school_id', targetSelect.dataset.expertiseSchoolId || '');
        fd.append('csrfmiddlewaretoken', csrfInput ? csrfInput.value : '');
        fetch('/inclusion/panel/settings/expertise/quick-add/', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: fd,
        }).then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data.success) return;
                var opt = document.createElement('option');
                opt.value = data.expertise.id;
                opt.textContent = data.expertise.name;
                targetSelect.appendChild(opt);
                targetSelect.value = data.expertise.id;
                // The select may already be enhanced into a custom popover
                // (enhanceFormControls) - it caches its option list at
                // enhance time and won't otherwise notice the new <option>.
                if (targetSelect._uiSelect) targetSelect._uiSelect.refresh();
                // Programmatic .value assignment doesn't fire 'change' on
                // its own - forms that autosave on change (e.g. a Panel
                // Group member's expertise row) need this to save the
                // newly-created tag immediately, not just populate the list.
                targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
                closeDialog();
            });
    });
})();

// Shared "Add External Contact" dialog (#external-contact-quick-add-dialog
// in _base.html) - same reasoning as the Expertise one above: one instance
// for the whole page, reused by every member picker's "Add New External
// Contact" button rather than each picker expanding its own inline fields.
(function () {
    var dialog = document.getElementById('external-contact-quick-add-dialog');
    if (!dialog) return;
    var form = dialog.querySelector('[data-external-contact-quick-add-form]');
    var nameInput = dialog.querySelector('[data-external-contact-quick-add-name]');
    var companyInput = dialog.querySelector('[data-external-contact-quick-add-company]');
    var targetPickerRoot = null;

    function closeDialog() {
        window.closeModalWithFadeOut(dialog);
        targetPickerRoot = null;
    }
    dialog.querySelectorAll('[data-modal-close]').forEach(function (btn) {
        btn.addEventListener('click', closeDialog);
    });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDialog(); });

    // pickerRoot is the specific [data-member-picker-root] whose "Add New
    // External Contact" button was clicked - the page can have several
    // picker instances, so the dialog needs to know which one to hand the
    // new contact back to on save.
    window.openExternalContactQuickAdd = function (pickerRoot) {
        targetPickerRoot = pickerRoot;
        nameInput.value = '';
        companyInput.value = '';
        dialog.showModal();
        requestAnimationFrame(function () {
            dialog.classList.add('is-open');
            nameInput.focus();
        });
    };

    // Delegated at the document level (rather than wired per-picker inside
    // initMemberPicker) so one listener covers every picker instance on the
    // page, present now or rendered in later. The toggle itself now lives in
    // the including page's own footer (e.g. .panel-group-modal-footer), not
    // inside the picker's own root (see _member_picker.html's doc comment),
    // so it can't be found via toggle.closest('[data-member-picker-root]')
    // any more - only one picker is ever visible per dialog at a time, so
    // scoping the lookup to the toggle's nearest <dialog> instead finds the
    // same, single, currently-active picker root.
    document.addEventListener('click', function (e) {
        var toggle = e.target.closest('[data-member-add-external-toggle]');
        if (!toggle) return;
        var scope = toggle.closest('dialog') || document;
        var pickerRoot = scope.querySelector('[data-member-picker-root]');
        if (pickerRoot) window.openExternalContactQuickAdd(pickerRoot);
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = nameInput.value.trim();
        if (!name || !targetPickerRoot) return;
        var company = companyInput.value.trim();
        var csrfForm = targetPickerRoot.closest('form');
        var csrfInput = csrfForm ? csrfForm.querySelector('input[name="csrfmiddlewaretoken"]') : null;
        var fd = new FormData();
        fd.append('name', name);
        fd.append('job_title', company);
        fd.append('csrfmiddlewaretoken', csrfInput ? csrfInput.value : '');
        fetch('/inclusion/panel/external-contacts/quick-add/', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: fd,
        }).then(function (res) { return res.json(); })
            .then(function (data) {
                if (!data.success) return;
                if (targetPickerRoot._memberPicker && targetPickerRoot._memberPicker.addExternalContact) {
                    targetPickerRoot._memberPicker.addExternalContact(data.contact);
                }
                closeDialog();
            });
    });
})();

// Wires a single Expertise field's "+" to open the shared quick-add dialog
// above. Extracted from the DOMContentLoaded block below (which only ever
// runs once, against the page's initial HTML) into a reusable function so
// any code that injects a fresh copy of _expertise_field.html later - e.g.
// the Panel Group modal re-rendering per-member expertise pickers after
// every autosave - can wire it too, via initExpertiseFields(root).
window.initExpertiseField = function (row) {
    var toggleBtn = row.querySelector('[data-expertise-add-toggle]');
    var select = row.querySelector('[data-expertise-select]');
    if (!toggleBtn || !select || toggleBtn.dataset.expertiseWired) return;
    toggleBtn.dataset.expertiseWired = '1';
    toggleBtn.addEventListener('click', function () { window.openExpertiseQuickAdd(select); });
};
// .expertise-field-row is the wrapper in the plain (label-above) layout;
// the merged=True .ui-fused-field layout (Panel Group modal's member
// rows) has no such wrapper - .ui-fused-field's own subgrid placement
// requires it to be a direct child of its .ui-fused-field-group grid
// parent, so it can't be nested in an extra wrapper div - its nearest
// shared container is .expertise-field-form instead.
// initExpertiseField's own data-expertise-wired guard makes matching the
// same element via both selectors harmless.
window.initExpertiseFields = function (root) {
    (root || document).querySelectorAll('.expertise-field-row, .expertise-field-form').forEach(window.initExpertiseField);
};

document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-member-picker-root]').forEach(initMemberPicker);
    window.initExpertiseFields(document);

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
    // content changes shape at runtime (see InteractionLanguage.md) - the
    // dialog now grows/shrinks with the live result count instead of
    // staying pinned to a fixed height regardless of content.
    function setResults(html) {
        window.animateModalHeightChange(dialog, function () { results.innerHTML = html; });
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
        window.closeModalWithFadeOut(dialog);
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
});
