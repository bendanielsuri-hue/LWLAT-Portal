# Research: divider hierarchy conventions (item separator vs internal content divider)

Question: how do mainstream design systems visually distinguish a divider *between* repeating list items/cards from a divider *inside* one item that separates its own sub-sections? Done to inform a recurring readability problem on Inclusion Panel list pages (Students/Referrals/Actions) where the internal border-top divider reads as visually identical to the between-row border-bottom divider, in every viewport.

No prior `docs/research/` convention existed in this repo (checked `docs/` — only `adr/`, `agents/`, `wayfinder/` existed); this file establishes the folder.

## Material Design 3

Source: [material-web divider component doc](https://raw.githubusercontent.com/material-components/material-web/main/docs/components/divider.md) (official Material Design 3 web implementation repo), [m3.material.io/components/divider/guidelines](https://m3.material.io/components/divider/guidelines), [m3.material.io/components/divider/specs](https://m3.material.io/components/divider/specs), [m3.material.io/styles/color/roles](https://m3.material.io/styles/color/roles).

- **The primary differentiator MD3 documents is length/inset, not opacity.** Two variants: *full-width* ("Use full width dividers to separate larger sections of unrelated content" — extends edge-to-edge) and *inset* ("Use inset dividers to separate related content within a section" — indented, typically aligned to an anchoring element like an icon/avatar's leading edge). Guidance states directly: "To separate a different kind of content, use a full-width divider," reserving inset dividers for nested/related items within a section.
- **Whitespace alone is an explicitly sanctioned alternative to a second line**: "List items with repetitive formats may not require an inset divider, in which using only the margin between items is acceptable."
- Both variants use one single color token, `outline-variant` (mapped via `--md-divider-color: var(--md-sys-color-outline-variant)`, default thickness `--md-divider-thickness: 1px`) — MD3 does **not** use two different opacity tiers of divider color for the two jobs; it uses inset/length instead. Guidance also explicitly warns against reusing the stronger `outline` role for dividers: `outline` is reserved for functional boundaries (e.g. text-field borders) with a higher contrast requirement (4.5:1-adjacent), while `outline-variant` is "decorative elements, such as dividers" — deliberately low-emphasis so dividers never compete with content.
- Caution against overuse: "Use full-width dividers sparingly. Too many divider lines will make an interface look cluttered."

## Apple Human Interface Guidelines — Lists and Tables

Source: [developer.apple.com/design/human-interface-guidelines/lists-and-tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables).

- Apple's answer to "internal vs between-item" is structural grouping, not a second line weight. The **grouped** table style "uses headers, footers, and additional space to separate groups of data" — i.e. a section break is made of whitespace + a header/footer label, not a heavier rule between two adjacent rows. Row-to-row separators within a group stay uniform.
- For dense multi-column data, Apple's guidance is to reach for **alternating row background (zebra striping)** rather than a second divider weight: "consider using alternating row colors in a multicolumn table" for readability at width — background tint, not line contrast, does the differentiation.
- iOS/iPadOS additionally distinguish *plain* vs *grouped* vs *inset grouped* list styles (well-known from `UITableView.Style`/SwiftUI `List`), where "grouped" visually clusters sections in their own inset card with rounded corners and the trailing/leading separator inset is itself a documented, non-arbitrary measurement (rows indent their separator to align with row content, leaving the row's own leading icon/margin outside the line) — reinforcing that Apple's toolset for this problem is inset/indentation and container framing, not two divider colors.

## Carbon Design System — Data Table

Source: [carbondesignsystem.com/components/data-table/style](https://carbondesignsystem.com/components/data-table/style/).

- Row separators use `$border-subtle` (a low-emphasis border token) on `border-bottom` for enabled rows — same "keep it subtle" instinct as MD3's `outline-variant`.
- Carbon's primary tool for helping a dense table read without dividers blending together is **zebra striping** (`$layer-accent` alternating row background), not a second divider weight — consistent with the Apple finding above. Carbon's own docs do not publish a distinct token/spec for "section break inside a table vs row-to-row divider" — that distinction isn't a solved, named pattern there the way it is in MD3.

## Synthesis: does anyone actually use two line-weights for this?

Across all three primary sources, **none of them differentiate "internal content divider" from "item separator" with two tiers of the same divider's color/opacity alone.** The recurring, actually-documented techniques are, in order of how directly each system leans on it:

1. **Length/inset (Material Design 3's documented mechanism)** — full-bleed = stronger/structural break; inset, indented to align with an anchor element = softer/internal grouping.
2. **Whitespace + header label instead of a second line at all (Apple's primary mechanism)** — a structural section break gets a header/footer and extra margin, not a heavier rule.
3. **Background tint / zebra striping instead of a second divider weight (both Apple and Carbon, for dense/tabular data)** — contrast comes from a fill difference, which is far more perceptible than a 1–2 shade difference in a 1px line.

Color/opacity alone (two tokens of the same hue at different tints, as this project currently does with `--border-faint` vs `--border-color`) is not the pattern any of these three systems reach for as their primary signal — it shows up only as the *quiet, low-emphasis default* (MD3's `outline-variant`, Carbon's `border-subtle`) applied uniformly, with the actual tier separation carried by inset/whitespace/fill instead.

## Implications for this project

Given the existing three-tier border system (`--border-faint` < `--border-color` < `--border-strong`, `light.css` lines ~81–102) and the known constraint that `--border-color` already sits close to its own background in the Pastel theme, a pure "just pick a different token" fix is unlikely to hold up in every theme — that's effectively what's shipping now and it's the thing user feedback keeps flagging. Recommend combining, not swapping:

- **Keep `--border-faint` for the item-to-item separator** (correct per this project's own H3 principle) but stop treating a single 1px full-bleed line as the internal divider's entire signal.
- **Give the internal content divider an inset**, matching MD3's actual mechanism: indent it in from the row/card edge (e.g. align to the same left padding as the block's own label/icon) rather than running full-bleed edge-to-edge like the item separator does. A full-bleed line all the way to both edges should be reserved for the row/card's own outer edge and genuine structural breaks (tab rows, header separators) — never reused for an in-row content split.
- **Add spacing asymmetry**: more vertical gap above/below the internal divider than the routine row-to-row rhythm, borrowing Apple's whitespace-does-the-work instinct — cheap, theme-proof, and doesn't depend on a color contrast that Pastel already undermines.
- **Reserve `--border-strong` for the internal divider**, not `--border-color`, and combine it with the inset — this uses the tier the codebase already has for "actual structural break" (per H3's own wording: "a header separating from its content") instead of leaving that job on the currently-too-close-to-invisible middle token, while `--border-faint` stays uniquely the light one used only for pure item-to-item rhythm.
- Where a row/card is dense or the theme makes any line-based distinction risky, consider Carbon/Apple's fallback of a background-tint block (a subtle `--bg-surface-alt`-style fill behind one sub-section) instead of a second line entirely — a fill difference reads reliably even when Pastel's border tokens converge.
