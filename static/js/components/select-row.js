/* Generic "select + add button" containers (.ui-select-row for a
   side-by-side pair, .ui-fused-field for a label+select+button fused into
   one control - both styled in components/forms.css). Any page can register
   a handler here, keyed by the button's data-add-trigger value, instead of
   writing its own dialog- or page-scoped click listener - this single
   delegated listener covers every such container on the page, including
   ones injected later into modals.

   window.uiSelectRowAdders stays a window object rather than becoming a
   module-level Map: pages register into it from inline <script> blocks
   (e.g. a modal's own "+" handler), which move to modules in #212. */

var CONTAINER_SELECTOR = '.ui-select-row, .ui-fused-field';
window.uiSelectRowAdders = window.uiSelectRowAdders || {};
document.addEventListener('click', function (e) {
    var trigger = e.target.closest(CONTAINER_SELECTOR + ' [data-add-trigger]');
    if (!trigger) return;
    var handler = window.uiSelectRowAdders[trigger.dataset.addTrigger];
    if (!handler) return;
    var row = trigger.closest(CONTAINER_SELECTOR);
    handler(row ? row.querySelector('select') : null, trigger);
});
