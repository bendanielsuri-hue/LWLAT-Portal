/* Progressive enhancement over a native <input type="time">, same shape as
   select.js and date-input.js: the native input stays the real field, a
   custom trigger + spinner popover read/write its value and fire a real
   `change` event. */

import { closeAllUiPopovers, forwardClickThrough, positionPopover } from './popover.js';
import { enhanceSelect } from './select.js';

/* Used only here - it was declared alongside date-input's calendar icon in
   the original file's shared preamble (both fields were one IIFE), which is
   how a clock icon ended up sitting in the date module despite date-input.js
   never drawing one. */
var CLOCK_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
    + '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6" />'
    + '<path d="M12 7.5v5l3.5 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />'
    + '</svg>';
import { pad2 } from './format.js';

export const enhanceTimeInput = function (inputEl) {
    if (!inputEl || inputEl._uiTime) return;

    var wrap = document.createElement('span');
    wrap.className = 'ui-time';
    var fields = document.createElement('span');
    fields.className = 'ui-time-fields';
    var hourSelect = document.createElement('select');
    var minuteSelect = document.createElement('select');
    var ampmSelect = document.createElement('select');
    ['AM', 'PM'].forEach(function (label) {
        var opt = document.createElement('option');
        opt.value = label; opt.textContent = label;
        ampmSelect.appendChild(opt);
    });
    for (var m = 0; m < 60; m++) {
        var mOpt = document.createElement('option');
        mOpt.value = pad2(m); mOpt.textContent = pad2(m);
        minuteSelect.appendChild(mOpt);
    }
    // Clock button opening a picker popover — a quick way to set a time,
    // alongside (not instead of) the inline Hour/Minute/AM-PM selects,
    // same relationship the calendar-grid popover has to Date's own
    // inline Day/Month/Year selects. The popover is a fresh,
    // independently-rendered picker (see renderTimePopover below), not
    // a relocation of the inline selects — two surfaces, one underlying
    // value.
    var timeBtn = document.createElement('button');
    timeBtn.type = 'button';
    timeBtn.className = 'ui-time-picker-btn btn btn-secondary btn-sm';
    timeBtn.innerHTML = CLOCK_ICON_SVG;
    var timePanel = document.createElement('dialog');
    timePanel.className = 'ui-time-popover ui-popover';

    inputEl.classList.add('ui-select-native');
    inputEl.parentNode.insertBefore(wrap, inputEl);
    wrap.appendChild(inputEl);
    fields.appendChild(hourSelect);
    fields.appendChild(minuteSelect);
    fields.appendChild(ampmSelect);
    wrap.appendChild(fields);
    wrap.appendChild(timeBtn);
    document.body.appendChild(timePanel);
    timePanel.addEventListener('click', function (e) {
        if (e.target !== timePanel) return;
        var x = e.clientX, y = e.clientY;
        timePanel.close();
        forwardClickThrough(x, y, timeBtn);
    });

    // Time format (12h/24h) is a global Settings preference (data-time-format
    // on <html>, see templates/layout.html), not a per-field choice.
    var is12h = document.documentElement.getAttribute('data-time-format') === '12';

    // Hours outside the typical 08:00-17:00 school day are visually
    // muted (see isHourMuted) since they're rarely the right choice for
    // a panel meeting. A 12h hour maps to two different 24h hours
    // depending on AM/PM, so both are stashed on the inline <option>
    // for applyHourMuting to resolve against the current ampmSelect
    // value; the popover's own hour rows resolve the same 24h hour
    // directly from the row's own precomputed value (see
    // renderTimePopover) since they don't have an <option> to stash it on.
    function isHourMuted(hour24) { return hour24 < 8 || hour24 > 17; }

    function rebuildHourOptions() {
        hourSelect.innerHTML = '';
        var max = is12h ? 12 : 23;
        var start = is12h ? 1 : 0;
        for (var h = start; h <= max; h++) {
            var opt = document.createElement('option');
            opt.value = pad2(h); opt.textContent = pad2(h);
            if (is12h) {
                opt.dataset.hour24Am = h === 12 ? 0 : h;
                opt.dataset.hour24Pm = h === 12 ? 12 : h + 12;
            } else {
                opt.dataset.hour24 = h;
            }
            hourSelect.appendChild(opt);
        }
        applyHourMuting();
    }

    function applyHourMuting() {
        Array.prototype.forEach.call(hourSelect.options, function (opt) {
            var hour24 = is12h
                ? parseInt(ampmSelect.value === 'PM' ? opt.dataset.hour24Pm : opt.dataset.hour24Am, 10)
                : parseInt(opt.dataset.hour24, 10);
            if (isHourMuted(hour24)) {
                opt.dataset.muted = '1';
            } else {
                delete opt.dataset.muted;
            }
        });
    }

    function currentParts() {
        var parts = (inputEl.value || '00:00').split(':');
        return { hour24: parseInt(parts[0], 10) || 0, minute: parts[1] || '00' };
    }

    function syncFromValue() {
        var parts = currentParts();
        rebuildHourOptions();
        if (is12h) {
            var isPM = parts.hour24 >= 12;
            var hour12 = parts.hour24 % 12;
            if (hour12 === 0) hour12 = 12;
            hourSelect.value = pad2(hour12);
            ampmSelect.value = isPM ? 'PM' : 'AM';
        } else {
            hourSelect.value = pad2(parts.hour24);
        }
        minuteSelect.value = parts.minute;
        [hourSelect, minuteSelect, ampmSelect].forEach(function (s) { if (s._uiSelect) s._uiSelect.refresh(); });
        if (timePanel.open) renderTimePopover();
    }

    function commit() {
        var minute = minuteSelect.value;
        var hour24;
        if (is12h) {
            var hour12 = parseInt(hourSelect.value, 10);
            var isPM = ampmSelect.value === 'PM';
            hour24 = isPM ? (hour12 === 12 ? 12 : hour12 + 12) : (hour12 === 12 ? 0 : hour12);
        } else {
            hour24 = parseInt(hourSelect.value, 10);
        }
        inputEl.value = pad2(hour24) + ':' + minute;
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    [hourSelect, minuteSelect, ampmSelect].forEach(function (select) {
        select.addEventListener('change', commit);
        enhanceSelect(select);
        select.parentNode.classList.add('ui-select--sm');
    });
    // AM/PM alone (without a 12h/24h toggle) changes which 24h hour each
    // option represents, so re-resolve muting and refresh the hour
    // dropdown's rendered rows whenever it changes.
    ampmSelect.addEventListener('change', function () {
        applyHourMuting();
        if (hourSelect._uiSelect) hourSelect._uiSelect.refresh();
    });
    ampmSelect.parentNode.classList.toggle('ui-hidden', !is12h);

    // Writes a 24h hour back onto hourSelect/ampmSelect (wrapping
    // 0-23) — the one place that translates a raw hour24 into the
    // 12h-vs-24h split those two selects actually store, so the spinner
    // arrows/typed input and the Now button all funnel through it
    // instead of re-deriving the split themselves.
    function applyHour24(hour24) {
        hour24 = ((hour24 % 24) + 24) % 24;
        if (is12h) {
            var isPM = hour24 >= 12;
            var hour12 = hour24 % 12; if (hour12 === 0) hour12 = 12;
            hourSelect.value = pad2(hour12);
            ampmSelect.value = isPM ? 'PM' : 'AM';
        } else {
            hourSelect.value = pad2(hour24);
        }
        applyHourMuting();
        if (hourSelect._uiSelect) hourSelect._uiSelect.refresh();
    }

    function applyMinute(minute) {
        minuteSelect.value = pad2(((minute % 60) + 60) % 60);
    }

    // Attached spinner picker ("Enter time"): big Hour:Minute digit
    // boxes stepped by up/down arrows (or typed directly), an AM/PM
    // toggle beside them in 12h mode, and Now/Clear footer actions —
    // mirrors common OS/Material time pickers. Deliberately a different
    // shape from .ui-popover's option-list style (Panel Group/Chair
    // selects, the calendar grid): there's no discrete list of times to
    // browse, so a spinner reads more honestly than a scrollable column
    // of every minute (DES-L1: layout follows what the content forces).
    function renderTimePopover() {
        var parts = currentParts();
        var isPM = parts.hour24 >= 12;
        var hour12 = parts.hour24 % 12; if (hour12 === 0) hour12 = 12;
        timePanel.innerHTML = '';

        var header = document.createElement('div');
        header.className = 'ui-time-spinner-header';
        var headerLabel = document.createElement('span');
        headerLabel.textContent = 'Enter time';
        header.appendChild(headerLabel);
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'ui-time-spinner-close';
        closeBtn.setAttribute('aria-label', 'Close time picker');
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', function (e) { e.stopPropagation(); timePanel.close(); });
        header.appendChild(closeBtn);
        timePanel.appendChild(header);

        var body = document.createElement('div');
        body.className = 'ui-time-spinner-body';

        function buildUnit(label, value, muted, onStep, onType) {
            var unit = document.createElement('div');
            unit.className = 'ui-time-spinner-unit';
            var up = document.createElement('button');
            up.type = 'button';
            up.className = 'ui-time-spinner-arrow ui-time-spinner-arrow--up';
            up.setAttribute('aria-label', 'Increase ' + label);
            up.innerHTML = '&#9650;';
            up.addEventListener('click', function (e) { e.stopPropagation(); onStep(1); });
            var input = document.createElement('input');
            input.type = 'text';
            input.inputMode = 'numeric';
            input.maxLength = 2;
            input.className = 'ui-time-spinner-value' + (muted ? ' muted' : '');
            input.value = value;
            input.addEventListener('click', function (e) { e.stopPropagation(); input.select(); });
            input.addEventListener('change', function () {
                var n = parseInt(input.value, 10);
                onType(isNaN(n) ? 0 : n);
            });
            var down = document.createElement('button');
            down.type = 'button';
            down.className = 'ui-time-spinner-arrow ui-time-spinner-arrow--down';
            down.setAttribute('aria-label', 'Decrease ' + label);
            down.innerHTML = '&#9660;';
            down.addEventListener('click', function (e) { e.stopPropagation(); onStep(-1); });
            unit.appendChild(up);
            unit.appendChild(input);
            unit.appendChild(down);
            return unit;
        }

        body.appendChild(buildUnit('hour', pad2(is12h ? hour12 : parts.hour24), isHourMuted(parts.hour24),
            function (delta) {
                applyHour24(parts.hour24 + delta);
                commit();
                renderTimePopover();
            },
            function (n) {
                var hour24 = is12h ? (n % 12) + (isPM ? 12 : 0) : n;
                applyHour24(hour24);
                commit();
                renderTimePopover();
            }));

        var sep = document.createElement('div');
        sep.className = 'ui-time-spinner-sep';
        sep.textContent = ':';
        body.appendChild(sep);

        body.appendChild(buildUnit('minute', parts.minute, false,
            function (delta) {
                applyMinute(parseInt(parts.minute, 10) + delta);
                commit();
                renderTimePopover();
            },
            function (n) {
                applyMinute(n);
                commit();
                renderTimePopover();
            }));

        if (is12h) {
            var ampmWrap = document.createElement('div');
            ampmWrap.className = 'ui-time-spinner-ampm';
            ['AM', 'PM'].forEach(function (label) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ui-time-spinner-ampm-btn' + ((label === 'PM') === isPM ? ' selected' : '');
                btn.textContent = label;
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    ampmSelect.value = label;
                    applyHourMuting();
                    if (hourSelect._uiSelect) hourSelect._uiSelect.refresh();
                    commit();
                    renderTimePopover();
                });
                ampmWrap.appendChild(btn);
            });
            body.appendChild(ampmWrap);
        }
        timePanel.appendChild(body);

        var footer = document.createElement('div');
        footer.className = 'ui-popover-footer';
        var nowBtn = document.createElement('button');
        nowBtn.type = 'button';
        nowBtn.className = 'ui-popover-footer-link';
        nowBtn.textContent = 'Now';
        nowBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var now = new Date();
            inputEl.value = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
            syncFromValue();
            renderTimePopover();
        });
        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'ui-popover-footer-link';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            // "Clear" resets to midnight rather than emptying the native
            // input outright — hourSelect/minuteSelect are plain
            // <select>s with no real "no value" option of their own, so
            // an empty inputEl.value just meant the next syncFromValue()
            // fell back to '00:00' anyway (see currentParts()) while the
            // visible spinner still showed whatever it last rendered,
            // reading as "Clear did nothing."
            inputEl.value = '00:00';
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
            syncFromValue();
            renderTimePopover();
        });
        footer.appendChild(nowBtn);
        footer.appendChild(clearBtn);
        timePanel.appendChild(footer);
    }

    function toggleTimePopover() {
        var isOpen = timePanel.open;
        closeAllUiPopovers(timePanel);
        if (isOpen) {
            timePanel.close();
        } else {
            renderTimePopover();
            timePanel.showModal();
            positionPopover(timePanel, timeBtn, { alignRight: true });
        }
    }
    timeBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleTimePopover(); });

    inputEl._uiTime = { refresh: syncFromValue };
    syncFromValue();
    if (!inputEl.value) commit();
};

// .ui-fused-field-group aligns its fused fields' labels to one shared,
// auto-computed column (CSS subgrid — see components/forms.css) when
// there's room. A single CSS breakpoint can't decide this per-field
// though (querying an element's own size to decide the very grid span
// that determines that size is circular, and a shared container query
// can't let e.g. a long Panel Group value stack while a short Chair
// value stays aligned in the same narrow column) — so each row's actual
// available width is measured here instead, and only the rows that don't
// fit fall back to label-above-field layout independently of their
// siblings.
