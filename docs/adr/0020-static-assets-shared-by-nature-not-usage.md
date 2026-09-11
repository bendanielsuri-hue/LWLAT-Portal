# A static file is portal-wide by nature, not by usage

Whether a stylesheet or script belongs in `static/` or in `hubs/<name>/static/` is decided by what the code *is*, not by how many pages happen to load it. Anything carrying no domain vocabulary — a carousel, overflow tabs, a modal shell, popover positioning — is portal-wide by definition, **even at one consumer**. Usage is only the backstop, for the rare thing that is genuinely ambiguous.

The alternative test, "promote it once a second hub needs it", is what produced the situation this convention was written to end: `hubs/inclusion/panel/static/css/panel.css` reached 11,810 lines, of which roughly 4,000 were generic and another ~6,100 were a generic mechanism wearing domain-named selectors. Two other hubs already loaded it — Portal Admin's developer console pulled an 11,810-line SEND stylesheet to style about 30 lines of settings furniture — and `static/js/main.js` had begun selecting `.panel-card` by name. By the time usage proves a thing is shared, three hubs are coupled to a hub-owned file and the promotion is no longer a move but an untangling. The evidence is in [docs/wayfinder/portal-static-assets/inventory.md](../wayfinder/portal-static-assets/inventory.md).

**Domain vocabulary is read strictly.** `#my-referrals-list` is domain; `.row-facts-cols` is not; and a carousel does not become domain-specific by being wired to referrals. The composition rule for the shape this produces constantly: when a portal component is composed with a domain one — `.ui-select-trigger.status-pill`, a Referral status rendered as a dropdown — **both ingredients promote and the composition stays hub-owned**.

## The five tiers, and the folders they became

| Tier | Holds | Home |
| --- | --- | --- |
| component | anything a page outside the list pattern could use | `static/{css,js}/components/` |
| layout | the app frame — shell, sidebar, rail, breakpoint tiers. Singleton chrome bound to `layout.html`'s own DOM, not instantiated per element | `static/{css,js}/layout/` |
| list-page | the filterable-entity-list pattern's own machinery — facts-strip measurement, stack mode, button-row overflow | `static/{css,js}/list-page/` |
| page | one page's own layout, not a reusable pattern | `static/{css,js}/pages/` |
| hub-owned | domain vocabulary | `hubs/<hub>/static/<hub>/` |

`list-page` is deliberately small. The test is *could a page outside the list pattern use this sensibly?* — which sends `.entity-row`, `.empty-note`, `.tab-row` and the whole filter bar to `components/`, and leaves the tier holding only the measurement machinery that is meaningless outside a list row.

**The hub mirrors the portal's folders, minus `tokens/` and `theme/`.** That omission is the point and is statable as an invariant: *a hub never defines a design token or a theme.* Two rules make the path trustworthy enough to be the at-a-glance answer to "which am I looking at":

1. Nothing under `static/` carries domain vocabulary.
2. Nothing under `hubs/*/static/` defines a token, a theme, or anything another hub could want.

Promoted names drop the `panel-` prefix **at promotion**, never as a later pass — a standalone rename with no functional payoff is the first thing dropped when a migration runs long. So a surviving `panel-` prefix under `static/` is itself the signal that a move was left unfinished.

## Split axis, and the size trigger

Files split by **component/behaviour, not by page**. A component's media queries live in the component's own file; `layout/responsive.css` keeps the breakpoint registry — still the single source of tier numbers — and the layout tier's own rules.

There is no hard line cap. There is a soft **~600-line review trigger that counts code lines, not total lines**, checked by `scripts/check_file_size.py` (advisory). Counting code is not a detail: `panel.css` is 61% comments and this repo's comment policy asks for full prose and says to delete rather than shorten, so a total-line trigger would make deleting good comments the cheapest way to comply.

Crossing the trigger asks *is this one module or two?* — and a legitimate "one" is a normal answer, recorded in the file's header comment. `static/js/list-page/facts-strip.js` is the standing example: it merges three inventory regions because splitting them would publish its measurement cache's generation counter as an interface between files.

## Considered options

- **Promote on usage (the status quo).** Rejected on the evidence above: it promotes only after coupling exists, which converts a move into an untangling, and it never touches the mixed regions — a generic mechanism wearing domain-named selectors — which are the bulk of both files and the classes three hubs collide over.
- **Split by page rather than by component.** Rejected: the same filter bar, entity row and modal shell appear on every list page, so a page-wise split duplicates them per page or invents a shared file per pair of pages. It also cannot express the thing the map found hardest — that most regions are *mixed*, and the line runs inside them.
- **Defer the mixed regions to execution time.** Rejected while drawing up [the promotion list](../wayfinder/portal-static-assets/promotion-list.md): mixed is ~6,100 of `panel.css`'s lines and ~2,000 of `panel.js`'s, so deferring them ships a convention that never touches the majority of the files it exists for.
- **A hard line cap.** Rejected: caps are met by moving lines, not by drawing boundaries, and this one would have been met by deleting comments.
