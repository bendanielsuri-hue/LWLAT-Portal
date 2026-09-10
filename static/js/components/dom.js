/* Small DOM helpers with no state and no chrome of their own. */

/* Element.closest(), but tolerant of a null start and of nodes without the
   method (text nodes reached from an event target). Predates widespread
   Element.closest support in this codebase and stayed because callers pass
   e.target directly, which is often not an Element. */
export function closest(el, selector) {
    while (el) {
        if (el.matches && el.matches(selector)) return el;
        el = el.parentElement;
    }
    return null;
}
