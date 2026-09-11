/* (INT-U3) Why a disabled button is disabled. A disabled control swallows
   its own pointer events - a real [disabled] button gets no hover/mouse
   events at all in Chrome, and .btn-disabled sets pointer-events: none
   (buttons.css) - so a `title` sitting ON the button never surfaces: the
   attribute is there, the hover that would show it never arrives. Several
   pages had shipped exactly that and looked correct in the markup while
   showing nothing live.

   The reason therefore has to live on a wrapping element that still
   receives hover, which is what _disabled_btn.html builds by hand for the
   buttons it renders. This does the same automatically for every other
   disabled control: put the reason on the button as
   data-disabled-reason="...", and the wrapper is created, filled, and
   emptied again in step with the button's own disabled state - static
   markup, a JS toggle, and an AJAX-swapped fragment all covered by the
   observer main.js's own DOMContentLoaded sweep wires up, so there is
   nothing per-page to remember to call.

   Promoted out of main.js (no more code than imports needs) - only caller
   left is main.js's own MutationObserver setup, so this stays a plain
   export rather than a window.* global. */

function syncDisabledTooltip(el) {
    var reason = el.getAttribute('data-disabled-reason');
    var disabled = el.disabled === true
        || el.classList.contains('btn-disabled')
        || el.getAttribute('aria-disabled') === 'true';
    var parent = el.parentNode;
    if (!parent) return;
    var wrap = parent.classList && parent.classList.contains('disabled-btn-tooltip-wrap') ? parent : null;
    if (!disabled || !reason) {
        // The wrapper stays in place once built (display: contents, so it
        // costs nothing in the layout tree) - only the tooltip goes, so an
        // enabled button doesn't explain why it isn't disabled.
        if (wrap) wrap.removeAttribute('title');
        return;
    }
    if (!wrap) {
        wrap = document.createElement('span');
        wrap.className = 'disabled-btn-tooltip-wrap';
        parent.insertBefore(wrap, el);
        wrap.appendChild(el);
    }
    if (wrap.getAttribute('title') !== reason) wrap.setAttribute('title', reason);
}
// One caveat when adding a reason to a button that sits in a flex row
// styled with a `> *` child selector: the wrapper is display: contents, so
// the .btn stays the real flex item while `>` matches the wrapper instead -
// such a rule needs a `> .disabled-btn-tooltip-wrap > .btn` companion. See
// .meeting-card-actions (panel.css) for the reference pair.
export function wireDisabledTooltips(root) {
    (root || document).querySelectorAll('[data-disabled-reason]').forEach(syncDisabledTooltip);
}
