# Principles — Design

Visual design values that hold regardless of which project this is. Entries here are numbered plainly (`F1`, ...) — from *outside* this file (code comments, other docs, ADRs), cite one with the `DES-` prefix, e.g. `(DES-F1)`. The prefix tells you which file to open; the bare code is what you search for once you're in it. Categories are added as new principles surface — this list is not a fixed taxonomy.

## A — Alignment

- **A1.** Keep a label and its value close together — don't push the value away to the far edge just because that's the layout convention.
- **A2.** Text alignment: left by default for anything read as words. Centre only for short symbols/codes/badges. Right only when comparing sizes of numbers (currency, percentages).

## C — Controls

- **C1.** Default to a fused field (label and control sharing one boxed border) rather than a plain label-above field, whenever there's room for it.
- **C2.** A filter for a category/grouping (status, assigned-to, type) can be scoped down to only the values actually present in the data. A filter for a specific named entity (a particular student, a particular person) should always show everyone — hiding one because they currently have zero matches reads as "why can't I find them?", not as a helpful narrowing.
- **C3.** Don't hide an important action inside another control where people won't think to look for it — give it its own visible button instead.

## E — Empty & Edge States

- **E1.** Every list or data view needs a deliberate empty state, not just a populated one — design what it looks like when there's nothing to show, don't let it default to a blank, unexplained gap.
- **E2.** An error message should say what happened and how to fix it — not just "invalid" or a technical code.
- **E3.** When a page or feature isn't available to this user, explain why rather than showing a blank page or a generic denial.

## F — Fill & Surface Hierarchy

- **F1.** Never give a read-only/display surface the same fill as something a user can act on.

## G — Grouping

- **G1.** Things placed close together are read as related; things spaced apart are read as unrelated. Use spacing itself to show which things belong together.

## H — Hierarchy

- **H1.** How much visual weight something gets (size, boldness, contrast) should match how important that information actually is — not be picked by feel per component.
- **H2.** When several actions sit together, the one that matters most should look the most prominent — don't give equal visual weight to a rarely-used action and the common one.

## L — Layout

- **L1.** Choose a layout because the content forces it, not because it looks better — for example, reach for equal-width columns because the sections really are equally important, not because a grid looks neater.
- **L2.** In a list of rows, give a fixed width to any column whose content length varies row to row (a name, a title) — sizing it to content instead makes every row's later columns start at a different position, and the list looks ragged.
- **L3.** When a row can show a variable amount of something (e.g. 1-3 buttons depending on the record), reserve space for the maximum case and align within it — don't let the row's width/shape shift depending on how much happens to render.
- **L4.** Keep an app- or hub-wide action visually separate from an action specific to this screen — don't merge them into one row — and give the screen-specific action more visual weight.

## M — Meaning

- **M1.** If something is coloured red, amber, or green, it should mean something is wrong, needs attention, or is fine. Don't use those colours just to make a page look nicer — people learn to trust what a colour means, and decoration breaks that trust.
- **M2.** Never use colour as the only way to show something's meaning — pair it with text, an icon, or a shape too, so it still works for someone who can't distinguish the colours.

## N — Nesting

- **N1.** Don't nest identical containers — a bordered card sitting inside another bordered card reads as redundant double-boxing. When several sections already sit inside one outer container, drop the border/background on the inner ones instead of nesting.

## R — Redundancy

- **R1.** Don't redundantly label a value whose own presentation already makes its meaning clear — a coloured status pill doesn't need a "Status:" prefix; "3 Referrals" is clearer than "Referrals: 3".

## S — Sizing

- **S1.** All single-line controls (buttons, text inputs, dropdowns) should be the same height as each other.
- **S2.** Don't mix a taller, multi-line-shaped component into the same row as single-line controls — it will look misaligned.

## T — Typography

- **T1.** Don't use uppercase text for normal writing. It's fine for short labels like badges or tags, but never for anything meant to be read as a sentence.

## U — Usability

- **U1.** Don't show everything at once — reveal extra detail or complexity only when the user asks for it (e.g. an expandable section), so the main view stays simple.
- **U2.** Don't make someone remember something from one screen to use it on another — keep what they need visible, or easy to find again.
