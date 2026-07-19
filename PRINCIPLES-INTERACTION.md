# Principles — Interaction

Motion, hover/focus, and behavioral values that hold regardless of which project this is. Entries here are numbered plainly (`U1`, ...) — from *outside* this file (code comments, other docs, ADRs), cite one with the `INT-` prefix, e.g. `(INT-U1)`. The prefix tells you which file to open; the bare code is what you search for once you're in it. Categories are added as new principles surface — this list is not a fixed taxonomy.

## U — Usability

- **U1.** Always show the user what's currently happening — if something is loading, saving, or processing in the background, say so, rather than leaving a silent gap.
- **U2.** Where possible, make a mistake impossible rather than just showing an error after it happens — e.g. disable a button until the form is actually valid.
- **U3.** Every action or flow should have an obvious way to back out or cancel without penalty — a modal always has a clear close, a multi-step flow can always be exited.
- **U4.** When an action can't currently succeed, disable it rather than leaving it clickable to silently fail — and say why (e.g. a tooltip), don't just grey it out with no explanation.
- **U5.** Any drag-and-drop interaction needs a non-drag way to do the same thing — drag-and-drop alone isn't accessible by keyboard or screen reader.
- **U6.** Warn before losing in-progress, unsaved work — navigating away or closing the tab while something's actively running (a timer, a draft, an unsaved form) should ask first.
- **U7.** Every AJAX-enhanced interaction needs a working fallback for when the request fails or JS doesn't run — never leave the feature dependent on the enhancement succeeding.
- **U8.** Preserve the user's current UI state (e.g. which tab is selected) across a live content refresh — don't silently reset it to a default just because the content underneath got swapped in fresh.
- **U9.** Match save behaviour to how often a field changes: a field that changes often and carries low risk can autosave instantly; a rarer, higher-consequence edit should go through an explicit save step instead.
- **U10.** Prefer a smooth transition over a sudden jump whenever something's size, position, or visibility changes — a jolt reads as broken, a transition reads as intentional.
- **U11.** Avoid replacing a whole chunk of the page just to update part of it — a targeted update to just the changed piece doesn't need to remember and restore scroll position, selection, or anything else.
- **U12.** Never suppress a focus-visible outline without providing an equivalent replacement.
- **U13.** A search box starts empty and only queries once the user has typed enough to narrow results meaningfully — never pre-load everything and filter client-side for real data.
- **U14.** Don't delay one thing's animation or update to wait for an unrelated animation to finish — let independent changes happen immediately, each on its own timing.
- **U15.** Be careful with hover transforms on a card that holds its own clickable controls — scale moves child elements unevenly and makes them harder to hit; a uniform translateY lift (or transforming only a decorative layer, not the real controls) avoids the problem.
- **U16.** Modal on modal on modal is a bad experience — prefer swapping the host modal's own content to show another step or mode instead of opening a new one on top of it. A small, single-field quick-add is a reasonable exception that can stay a second stacked dialog.
