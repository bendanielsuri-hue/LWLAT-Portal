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
- **H3.** A divider between same-type repeating items (list rows, table rows, thread entries) should read lighter than a divider marking an actual structural break (a header separating from its content, a card's own outer edge). Reusing one border weight for both jobs makes a real section boundary blend into the ordinary rhythm of a list instead of standing out from it.

## I — Icons

- **I1.** Every hub (the top-level rail/home-page entries — Staff, Student, SEND & Provision, etc.) and every app within a hub (the leaf items on a hub's card/sidebar — My Timetable, Inclusion Panel, Asset Register, etc.) needs its own icon and name, unique across the whole portal — no two hubs or apps should share either. This does not extend to the individual pages inside one app's own sidebar (e.g. Inclusion Panel's Home/Students/Referrals/Actions/...); those can reuse an icon or share a naming pattern freely, since they're never browsed side-by-side with another app's pages the way hubs and apps are on the home page and rail.

## L — Layout

- **L1.** Choose a layout because the content forces it, not because it looks better — for example, reach for equal-width columns because the sections really are equally important, not because a grid looks neater.
- **L2.** In a list of rows, give a fixed width to any column whose content length varies row to row (a name, a title) — sizing it to content instead makes every row's later columns start at a different position, and the list looks ragged.
- **L3.** When a row can show a variable amount of something (e.g. 1-3 buttons depending on the record), reserve space for the maximum case and align within it — don't let the row's width/shape shift depending on how much happens to render.
- **L4.** Keep an app- or hub-wide action visually separate from an action specific to this screen — don't merge them into one row — and give the screen-specific action more visual weight.
- **L5.** When a card's content can outgrow its available height, split it into a fixed header/footer and one scrolling body — never let the whole card grow past the viewport. The scrolling body's edges should run flush against whichever of the card's boundaries it's the last thing before (no dead padding trapping the scrollbar short of that edge). Give the outer card `overflow: hidden` so it clips the scrolling body's square corner to its own rounded shape — without it, the corner paints straight over the card border's inward curve and the border looks bitten off right where the scrollbar sits.
- **L6.** On mobile, a stacked card/section should bleed to the screen's full width — no left/right margin floating it inset within the page's own padding. Screen space is too scarce there for that inset to read as breathing room rather than waste; keep just enough padding *inside* the card for its own content to clear the edge.
- **L7.** A multi-word label sitting above a narrow control (a filter field's own label) should wrap onto two lines rather than force the control wider to fit it on one line — the vertical room is already there, so use it instead of spending horizontal space just to keep text on a single line.
- **L8.** In a flex-wrapped stack of lines, don't let a child's own margin-top (added to clear space for a divider above it) stack on top of the container's own row-gap between wrapped lines — the two add together into a visibly larger gap than either alone. Tighten the container's row-gap to its smallest step and let the divider's own margin do the rest of the spacing.
- **L9.** A column that repeats identically down every row of a list (e.g. an actions/buttons column) should be exactly the same width in every row, not sized locally to that particular row's own content — even when each row lays itself out independently (its own flex/grid instance) and would otherwise naturally reach a different width. Users read a list as one consistent shape; a column that visibly widens or narrows row to row looks broken rather than merely different.

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
- **S3.** On a real touch device, every single-line control needs a taller minimum height (~44px) than its desktop default, to stay a comfortable tap target — apply the same bump to all of them together so S1's "same height as each other" still holds at touch size, not just on desktop.
- **S4.** An icon-only control (no text to pad it out) should have its width match its own height, i.e. read as a square — text naturally pads a labelled control's width out, but an icon-only one won't clear a comfortable tap target on its own without an explicit minimum width alongside S3's height bump.

## T — Typography

- **T1.** Don't use uppercase text for normal writing. It's fine for short labels like badges or tags, or a small, letter-spaced, muted-colour ALL CAPS heading dividing a group of fields/content — but never for anything meant to be read as a sentence.
- **T2.** Two casing rules, by role: Chrome — nav labels, buttons, modal/dialog titles, table headers, section labels, status pills, and code-defined choice labels — uses Title Case: capitalize each major word, but keep short connecting words (a, an, the, and, or, of, to, in, on, for...) lowercase unless first or last. Prose — empty-state messages, help text, placeholder text, and any error/toast/notification copy — uses sentence case: capitalize only the first word.

## U — Usability

- **U1.** Don't show everything at once — reveal extra detail or complexity only when the user asks for it (e.g. an expandable section), so the main view stays simple.
- **U2.** Don't make someone remember something from one screen to use it on another — keep what they need visible, or easy to find again.
