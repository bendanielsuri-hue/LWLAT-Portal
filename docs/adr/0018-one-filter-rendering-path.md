# The filter bar has one rendering path: the tray, at every width

Every filter bar in the app renders as the slide-down tray, at every viewport width. There is no second layout to fall into, and `isFilterBarMobile()` (main.js) returns `true` unconditionally — kept as a function, with its old expression preserved verbatim in a comment, because it is the one line to restore if the panel ever comes back.

Inside the tray, a filter section's fields never wrap: they sit on one line that scrolls horizontally, with an edge fade, a prev/next arrow pair on the caption row, drag-to-scroll, a wheel redirect, and hover-over-a-cut-off-field-to-reveal-it. None of that chrome is tiered by width either — it appears only when a given track measures as overflowing, so a bar whose filters all fit (Meetings, the SEND & Provision hub) shows a plain row with no fade, no arrows and no scroll, on a phone and on a 1440px desktop alike.

## Why one path

There were two: the tray below ~768px, and a "View filters" panel above it, fed by a dynamic-overflow measurement that decided which fields lived in the primary row and which sat behind the button. One feature, two implementations — so anything new needed writing twice, and any bug could live in one path while the other looked fine. Both of those costs were paid during #185/#186: the section-scroll mechanism had to carry an item-type parameter so it could serve both a tray row and the panel's strip, and "View filters stopped opening" was a defect that existed only on the panel path, invisible at the widths where most of the work was being done.

The narrower decision underneath it — sections scroll rather than wrap — came from two failure modes that wrapping causes and scrolling cannot: a category whose fields wrap to a ragged last line leaves dead space beside the last field (at 390px, Referral wrapped 4 + 1 and stranded "Overdue Actions" alone with two thirds of a row empty), and a trigger that grows to fit a long value reflows every field after it onto new lines, so choosing a value rearranges the tray.

## What this costs

A cut-off filter is less visible than a wrapped one, and this project had already decided the other way once: `de5fa4f` replaced the desktop strip's scroll with a wrap on the grounds that "a filter you cannot see is a filter you do not use". That reasoning is still sound, and three overlapping affordances are what pay for it now — the fade, the arrows, and hover-to-reveal. What is hidden is also smaller than it was: one or two fields inside a named, captioned category, rather than a whole strip of them.

The panel also moved from normal flow to floating over the list, reversing a 2026-08-20 change made on the grounds that it "can be kept open" while working down the page. Overlaying gives that up: an open tray covers the top rows. It buys one behaviour at every width, and a tray that is a single scrolling line per section has far less to cover the list with than four wrapped rows did.

## Considered options

- **Keep both paths, share more code between them**: rejected. The shared-code version was tried in #186 (one scroll mechanism, parameterised by item type) and it worked, but it left every future change still having to reason about two hosts, two sets of rules and two sets of bugs. The parameter was a symptom, not a solution.
- **Tier the layout by width instead of by measurement**: rejected. Nothing here needs a breakpoint. Which host renders the fields is already a fact in the DOM (`.filter-bar-sections`, #185), and whether a track overflows is a measurement — both are exact where a width is a guess, and neither needs a new entry in the breakpoint registry (`static/css/layout/responsive.css`).
- **Keep the panel for wide desktop only**: rejected, and this is the option the work started from. It is the status quo that produced the two-implementations problem, and the wide-desktop panel had its own version of the same layout complaints (four wrapped rows of categories, pushing the list down).

## Consequences worth knowing

`html.filter-bar-mobile-mode` now means "the filter bar renders as a tray", which is always — it no longer means "narrow". One rule outside the filter bar had quietly been using it as the app's general "is this narrow" test (`responsive.css` hiding breadcrumbs) and was hiding them on a 1440px desktop until re-keyed to `html.filter-bar-narrow-desktop`. Any future rule tempted to reuse that class as a width proxy has the same trap waiting.

The tray's CSS was also gated a second time, by `@media (max-width: 900px), (max-height: 500px)`, even though every rule inside already carried the class. Those two gates disagreeing is what made the tray open as a 27px strip of captions at desktop, so the rules were hoisted out of the query (#187) and the class is now the only gate. Keep it that way: a rule that gates on both will silently stop applying at some width.
