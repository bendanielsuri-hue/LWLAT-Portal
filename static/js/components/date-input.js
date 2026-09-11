/* Progressive enhancement over a native <input type="date">, same shape as
   select.js: the native input stays the real field, a custom trigger +
   calendar popover read/write its value and fire a real `change` event. */

import { closeAllUiPopovers, forwardClickThrough, positionPopover } from './popover.js';
import { enhanceSelect } from './select.js';
import { pad2 } from './format.js';

var CALENDAR_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
    + '<rect x="4" y="5.5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" />'
    + '<path d="M4 9.5h16M8 3.5v3M16 3.5v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />'
    + '</svg>';
var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }

export const enhanceDateInput = function (inputEl, opts) {
    if (!inputEl || inputEl._uiDate) return;
    opts = opts || {};

    var wrap = document.createElement('span');
    wrap.className = 'ui-date';
    var fields = document.createElement('span');
    fields.className = 'ui-date-fields';
    var daySelect = document.createElement('select');
    var monthSelect = document.createElement('select');
    var yearSelect = document.createElement('select');
    var calBtn = document.createElement('button');
    calBtn.type = 'button';
    calBtn.className = 'ui-date-calendar-btn btn btn-secondary btn-sm';
    calBtn.innerHTML = CALENDAR_ICON_SVG;
    // A <dialog>, not a popover-attribute div — see the matching comment
    // in enhanceSelect() for why (nested modal dialogs are the
    // reliably-interactive way to stay on top of an open dialog).
    var calPanel = document.createElement('dialog');
    calPanel.className = 'ui-calendar-popover ui-popover';

    inputEl.classList.add('ui-select-native');
    inputEl.parentNode.insertBefore(wrap, inputEl);
    wrap.appendChild(inputEl);
    fields.appendChild(daySelect);
    fields.appendChild(monthSelect);
    fields.appendChild(yearSelect);
    wrap.appendChild(fields);
    wrap.appendChild(calBtn);
    document.body.appendChild(calPanel);
    calPanel.addEventListener('click', function (e) {
        if (e.target !== calPanel) return;
        var x = e.clientX, y = e.clientY;
        calPanel.close();
        forwardClickThrough(x, y, calBtn);
    });

    var today = new Date();
    var nowYear = today.getFullYear();
    var nowMonth = today.getMonth() + 1;

    for (var y = (opts.noPast ? nowYear : nowYear - 1); y <= nowYear + (opts.noPast ? 2 : 1); y++) {
        var yOpt = document.createElement('option');
        yOpt.value = y;
        yOpt.textContent = y;
        yearSelect.appendChild(yOpt);
    }

    // Only relevant when opts.noPast: the current year's month/day lists
    // start at the current month/day instead of January/1st, so a Panel
    // meeting can never be scheduled in the past. Any other (future)
    // year/month is unrestricted.
    function rebuildMonthOptions(selectedMonth) {
        var year = parseInt(yearSelect.value, 10) || nowYear;
        var minMonth = (opts.noPast && year === nowYear) ? nowMonth : 1;
        monthSelect.innerHTML = '';
        for (var m = minMonth; m <= 12; m++) {
            var opt = document.createElement('option');
            opt.value = m;
            opt.textContent = MONTH_NAMES[m - 1];
            monthSelect.appendChild(opt);
        }
        monthSelect.value = Math.max(minMonth, Math.min(selectedMonth || minMonth, 12));
    }

    function rebuildDayOptions(selectedDay) {
        var year = parseInt(yearSelect.value, 10) || nowYear;
        var month = parseInt(monthSelect.value, 10) || 1;
        var max = daysInMonth(year, month);
        var min = (opts.noPast && year === nowYear && month === nowMonth) ? today.getDate() : 1;
        daySelect.innerHTML = '';
        for (var d = min; d <= max; d++) {
            var opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            daySelect.appendChild(opt);
        }
        daySelect.value = Math.max(min, Math.min(selectedDay || min, max));
    }

    function syncFromValue() {
        var parts = (inputEl.value || '').split('-');
        var year = parts.length === 3 ? parseInt(parts[0], 10) : nowYear;
        var month = parts.length === 3 ? parseInt(parts[1], 10) : nowMonth;
        var day = parts.length === 3 ? parseInt(parts[2], 10) : today.getDate();
        if (opts.noPast && year < nowYear) year = nowYear;
        if (!yearSelect.querySelector('option[value="' + year + '"]')) {
            var extra = document.createElement('option');
            extra.value = year; extra.textContent = year;
            yearSelect.insertBefore(extra, yearSelect.firstChild);
        }
        yearSelect.value = year;
        rebuildMonthOptions(month);
        rebuildDayOptions(day);
        [daySelect, monthSelect, yearSelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
    }

    function commit() {
        var year = parseInt(yearSelect.value, 10);
        var month = parseInt(monthSelect.value, 10);
        var day = parseInt(daySelect.value, 10);
        inputEl.value = year + '-' + pad2(month) + '-' + pad2(day);
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    [daySelect, monthSelect, yearSelect].forEach(function (select) {
        select.addEventListener('change', function () {
            if (select === yearSelect) {
                rebuildMonthOptions(parseInt(monthSelect.value, 10));
                if (monthSelect._uiSelect) monthSelect._uiSelect.refresh();
            }
            if (select !== daySelect) {
                rebuildDayOptions(parseInt(daySelect.value, 10));
                if (daySelect._uiSelect) daySelect._uiSelect.refresh();
            }
            commit();
            renderCalendar();
        });
        enhanceSelect(select);
        select.parentNode.classList.add('ui-select--sm');
    });

    function renderCalendar() {
        var year = parseInt(yearSelect.value, 10) || nowYear;
        var month = (parseInt(monthSelect.value, 10) || 1) - 1;
        calPanel.innerHTML = '';
        var header = document.createElement('div');
        header.className = 'ui-calendar-header';
        var prev = document.createElement('button');
        prev.type = 'button'; prev.className = 'btn btn-sm'; prev.textContent = '‹';
        prev.disabled = !!(opts.noPast && year === nowYear && (month + 1) === nowMonth);
        var label = document.createElement('span');
        label.textContent = MONTH_NAMES[month] + ' ' + year;
        var next = document.createElement('button');
        next.type = 'button'; next.className = 'btn btn-sm'; next.textContent = '›';
        prev.addEventListener('click', function (e) {
            e.stopPropagation();
            var d = new Date(year, month - 1, 1);
            if (!yearSelect.querySelector('option[value="' + d.getFullYear() + '"]')) syncYearOption(d.getFullYear());
            yearSelect.value = d.getFullYear();
            rebuildMonthOptions(d.getMonth() + 1);
            rebuildDayOptions(parseInt(daySelect.value, 10));
            [monthSelect, yearSelect, daySelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
            renderCalendar();
        });
        next.addEventListener('click', function (e) {
            e.stopPropagation();
            var d = new Date(year, month + 1, 1);
            if (!yearSelect.querySelector('option[value="' + d.getFullYear() + '"]')) syncYearOption(d.getFullYear());
            yearSelect.value = d.getFullYear();
            rebuildMonthOptions(d.getMonth() + 1);
            rebuildDayOptions(parseInt(daySelect.value, 10));
            [monthSelect, yearSelect, daySelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
            renderCalendar();
        });
        header.appendChild(prev); header.appendChild(label); header.appendChild(next);
        calPanel.appendChild(header);

        var grid = document.createElement('div');
        grid.className = 'ui-calendar-grid';
        ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(function (d) {
            var h = document.createElement('div');
            h.className = 'ui-calendar-dow';
            h.textContent = d;
            grid.appendChild(h);
        });

        var startOffset = new Date(year, month, 1).getDay();
        var max = daysInMonth(year, month + 1);
        var selected = inputEl.value;
        var todayStr = nowYear + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate());

        for (var i = 0; i < startOffset; i++) grid.appendChild(document.createElement('div'));
        for (var day = 1; day <= max; day++) {
            var cellDate = year + '-' + pad2(month + 1) + '-' + pad2(day);
            var cell = document.createElement('div');
            cell.className = 'ui-calendar-day';
            if (cellDate === todayStr) cell.classList.add('is-today');
            if (cellDate === selected) cell.classList.add('is-selected');
            cell.textContent = day;
            if (opts.noPast && cellDate < todayStr) {
                cell.classList.add('is-past');
            } else {
                cell.addEventListener('click', function (d) {
                    return function (e) {
                        e.stopPropagation();
                        daySelect.value = d;
                        if (daySelect._uiSelect) daySelect._uiSelect.refresh();
                        commit();
                        renderCalendar();
                        closeAllUiPopovers();
                    };
                }(day));
            }
            grid.appendChild(cell);
        }
        calPanel.appendChild(grid);

        var footer = document.createElement('div');
        footer.className = 'ui-popover-footer';
        var todayBtn = document.createElement('button');
        todayBtn.type = 'button';
        todayBtn.className = 'ui-popover-footer-link';
        todayBtn.textContent = 'Today';
        todayBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!yearSelect.querySelector('option[value="' + nowYear + '"]')) syncYearOption(nowYear);
            yearSelect.value = nowYear;
            rebuildMonthOptions(nowMonth);
            rebuildDayOptions(today.getDate());
            [monthSelect, yearSelect, daySelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
            commit();
            renderCalendar();
        });
        footer.appendChild(todayBtn);
        calPanel.appendChild(footer);
    }

    function syncYearOption(year) {
        var extra = document.createElement('option');
        extra.value = year; extra.textContent = year;
        yearSelect.insertBefore(extra, yearSelect.firstChild);
    }

    function toggleCalendar() {
        var isOpen = calPanel.open;
        closeAllUiPopovers(calPanel);
        if (isOpen) {
            calPanel.close();
        } else {
            renderCalendar();
            calPanel.showModal();
            positionPopover(calPanel, calBtn, { alignRight: true });
        }
    }
    calBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleCalendar(); });

    inputEl._uiDate = { refresh: syncFromValue };
    syncFromValue();
};

