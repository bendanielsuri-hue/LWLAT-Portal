/* Reading the sidebar School switcher's selection, client-side.

   Layout tier: the switcher is part of layout.html's own chrome, and its
   selection is portal-wide - any hub's JS that needs to know which school is
   on screen reads it from here.

   ONE source of truth, and it is the server's (#196). The cookie
   layout/identity-switcher.js writes is the same cookie
   core.identity.current_school_key reads, in the same key space ('all',
   'primary', 'secondary', or a School.id), and it is already sent on every
   request. There used to be a second copy in localStorage holding the
   school's display *name* instead; the two could not be reconciled - a rename
   in the admin desynchronised them permanently, and any browser with the
   cookie set but no localStorage entry rendered server-scoped rows for one
   school beside a client-scoped picker for another, with no error and no
   visual cue. Deriving the answer from the cookie deletes that whole class of
   bug, so do not reintroduce a stored copy of it. */

export const COOKIE_NAME = 'current_school_key';

/* Mirrors core.school_scope.AGGREGATE_SCHOOL_KEYS - "not one concrete
   school". Note the server's other question ("is any filtering needed at
   all?", where 'primary' narrows) is deliberately NOT mirrored here: no
   client-side caller has it, and the two are constantly mistaken for each
   other - see core/school_scope.py's docstring. */
const AGGREGATE_KEYS = ['all', 'primary', 'secondary'];

export function isAggregateSchoolKey(key) {
    return !key || AGGREGATE_KEYS.indexOf(key) !== -1;
}

/* The selected key, or '' when the switcher has never been used in this
   browser - which the server reads as 'all' too. Parsed by splitting rather
   than by regex: the cookie name goes into the pattern, and a name is not a
   regex. */
export function currentSchoolKey() {
    const entries = document.cookie ? document.cookie.split(';') : [];
    for (const entry of entries) {
        const parts = entry.trim().split('=');
        if (parts.shift() !== COOKIE_NAME) continue;
        try {
            return decodeURIComponent(parts.join('='));
        } catch (e) {
            return '';
        }
    }
    return '';
}
