/* Promoted out of panel.js (#211, ADR 0020) - generic per-container fetch
   sequence guard, no SEND vocabulary in it.

   Still also set on `window`, same reason as components/modal.js: panel.js's
   own dialogs are classic-script code and call these by that name from
   inside event handlers, so the window assignment keeps them working until
   those dialogs are migrated to import this directly. */

// Bump before firing a request that will eventually mutate `container`,
// capture the returned number, and check it's still current once the
// response lands - drops a response that's no longer the latest instead of
// applying it. Guards against an older, slower request resolving *after* a
// newer one and overwriting state the newer response already applied
// (nothing here reorders or cancels the network requests themselves, just
// whether a given response is still allowed to act).
export function beginFetchSeq(container) {
    container._fetchSeq = (container._fetchSeq || 0) + 1;
    return container._fetchSeq;
}

export function isCurrentFetchSeq(container, seq) {
    return container._fetchSeq === seq;
}

window.beginFetchSeq = beginFetchSeq;
window.isCurrentFetchSeq = isCurrentFetchSeq;
