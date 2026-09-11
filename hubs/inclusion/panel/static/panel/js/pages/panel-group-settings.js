/* Panel Group Settings' own page behavior (#212 - moved out of
   panel_group_settings.html's inline <script>, ADR 0021). Keeps the group
   list in sync with the shared panel-group dialog's create/update events. */

import { growIn } from '../../../js/components/row-animate.js';

document.addEventListener('panel-group:created', function (e) {
    var detail = e.detail;
    var list = document.querySelector('[data-groups-list]');
    var template = list && list.querySelector('[data-group-row]');
    if (!detail || !detail.id || !list || !template) {
        window.location.reload();
        return;
    }
    var emptyNote = list.querySelector('.empty-note');
    if (emptyNote) emptyNote.remove();
    var row = template.cloneNode(true);
    row.setAttribute('data-group-id', detail.id);
    row.querySelector('[data-group-name]').textContent = detail.name;
    row.querySelector('[data-group-school]').textContent = detail.school_name || 'No school set';
    row.querySelector('[data-group-chair]').textContent = 'None set';
    row.querySelector('[data-group-member-count]').textContent = '0';
    var editTrigger = row.querySelector('[data-open-group-edit-trigger]');
    if (editTrigger) editTrigger.setAttribute('data-group-id', detail.id);
    var groupIdInput = row.querySelector('input[name="group_id"]');
    if (groupIdInput) groupIdInput.value = detail.id;
    list.appendChild(row);
    growIn(row);
});
document.addEventListener('panel-group:updated', function (e) {
    var detail = e.detail;
    if (!detail || !detail.id) return;
    var row = document.querySelector('[data-group-row][data-group-id="' + detail.id + '"]');
    if (!row) return;
    var nameEl = row.querySelector('[data-group-name]');
    if (nameEl) nameEl.textContent = detail.name;
    var chairEl = row.querySelector('[data-group-chair]');
    if (chairEl) chairEl.textContent = detail.chair_name;
    var countEl = row.querySelector('[data-group-member-count]');
    if (countEl) countEl.textContent = detail.active_member_count;
});
