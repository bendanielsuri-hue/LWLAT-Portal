/* Tiny formatting helpers with no DOM/state of their own. */

/* Zero-pads a number to two digits. Shared by date-input.js and
   time-input.js, both of which build "HH:MM" / "YYYY-MM-DD" strings for a
   native <input>'s value - the one thing both fields actually write. */
export function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
}
