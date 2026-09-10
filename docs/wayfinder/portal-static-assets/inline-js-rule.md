# The rule for inline template JavaScript

Decision record for [#203](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/203), under the
map [#198](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/198). Destinations come from
#204's [taxonomy.md](taxonomy.md); loading mechanics from #202's
[es-modules-findings.md](es-modules-findings.md).

---

## 0. The premise this ticket was filed on is wrong

#198 charted `templates/hubs/_hub_sidebar.html` as **~1,720 script lines with 139 template
references** — "genuinely coupled", the hardest case, the one expected to determine the rule. #200
carried the figure into [inventory.md](inventory.md) §3.

Measured directly, the sidebar's inline script is lines **1286–1949: 663 lines, 388 code lines, and
zero template references.** Not "few". Zero. The 22 template tags inside it are all
`{% comment %}`/`{% endcomment %}` markers.

**The cause is worth recording, because it is a trap anyone re-counting will fall into.**
`_hub_sidebar.html:230` contains, inside a `{% comment %}` block, the prose:

```
Icon source for the FAB "wheel" (#143, see the <script> below) — a page
```

A regex looking for `<script[^>]*>` reads that literal `<script>` as an opening tag and matches from
line 230 to the real `</script>` at 1949 — sweeping up 1,056 lines of the sidebar's **markup**, whose
`{% include %}`s, `{% for %}` over `local_menu` and `{{ item.name }}`s supply all 139 "references".
Markup is not moving; #198 explicitly scoped template markup out. Strip Django comments before
locating script tags and the number collapses.

This is the second time in this map that prose inside a comment has broken a regex over these files
— #202 §2b was Django's own `export … from` pattern doing it. Recorded as a hazard in its own right:
**this codebase's comments discuss code, so any tool that scans it must strip comments first.**

Corrected figures for #200 §3 (Django comments stripped, real `<script>` tags without `src`):

| Template | Blocks | Script lines | Code lines | Refs |
| --- | --- | --- | --- | --- |
| `panel/home.html` | 1 | 1,255 | 742 | **0** |
| `layout.html` | 6 | 699 | 384 | **1** |
| `_hub_sidebar.html` | 1 | **663** | 388 | **0** |
| `panel/meeting_agenda.html` | 7 | 263 | 201 | 2 |
| `panel/students.html` | 1 | 240 | 114 | 1 |
| `panel/safeguarding_notes.html` | 1 | 205 | 135 | 1 |
| `panel/meeting_setup.html` | 3 | 182 | 105 | 1 |
| `panel/discussion.html` | 3 | 180 | 146 | 3 |
| `panel/actions.html` | 1 | 149 | 82 | 2 |
| `panel/referrals.html` | 1 | 95 | 59 | 2 |
| `panel/escalations.html` | 1 | 80 | 45 | 1 |
| `panel/meetings.html` | 1 | 58 | 38 | 1 |
| `hubs/inclusion/hub.html` | 1 | 44 | 26 | 1 |
| `panel/panel_group_settings.html` | 1 | 36 | 35 | 0 |
| `panel/escalate_form.html` | 1 | 13 | 12 | 0 |
| **Total** | 24 | **4,162** | 2,512 | **16** |

Not 5,218 lines and not 139 references. **Sixteen**, portal-wide.

**Amended once `scripts/check_inline_js.py` existed (#205):** the table above was hand-listed from the templates #200 had inventoried, and it misses `hubs/portaladmin/{home,themes}.html` — two blocks, 97 lines, zero references. The checker's own count is the authority: **31 blocks, 4,135 lines to move**, plus the 124-line exempt boot block. Which is the argument for the checker in one line — the enumeration in §1 was right, and the corpus it was enumerated over was not.

---

## 1. The whole coupled surface, enumerated

Sixteen references, four shapes. This is the complete list — not a sample.

| Shape | Count | Sites |
| --- | --- | --- |
| **Structured data** — `JSON.parse('{{ x_json\|escapejs }}')` | 9 | `students`, `referrals` ×2, `actions` ×2, `escalations`, `meetings`, `safeguarding_notes`, `inclusion/hub` |
| **Scalar** — `'{{ panel.started_at\|date:"c" }}'`, `'{{ panel.panel_group_id\|default:"" }}'` | 4 | `meeting_agenda` ×2, `meeting_setup`, `discussion` |
| **Control flow** — `{% if %}` wrapping ~35 lines of JS | 2 tags, 1 site | `discussion.html:662–697` |
| **URL** — `fetch('{% url "report_problem" %}', …)` | 1 | `layout.html:875` |

The ticket predicted that some references would be `{% url %}`/`{% static %}` rather than data, which
`json_script` cannot help with. Correct, and the answer is smaller than expected: **one site**, and it
never needed `json_script`.

---

## 2. The rule

> **Template context enters JavaScript as data, never as code.**
> A template may hand values to JS. A template may never contain JS that the template engine writes.

Mechanism per shape, which is the whole of it:

| Shape | Becomes |
| --- | --- |
| Structured data | `{{ x\|json_script:"students-forms-by-year" }}`, read with `JSON.parse(document.getElementById(…).textContent)`. Also strictly safer than today's `JSON.parse('{{ …\|escapejs }}')` — `escapejs` escapes for a JS *string* context and is one stray quote from a syntax error; `json_script` escapes for HTML and is the documented path. |
| Scalar | A `data-` attribute **on the element the behaviour is wired to** — `data-started-at`, `data-panel-group-id`. Not a global, not a `window.*`. The module already has the element; the datum arrives with it. |
| URL | A `data-` attribute too. `{% url %}` inside an HTML attribute is markup, which is exactly where it belongs. `json_script` was never the answer here. |
| Control flow | A `data-` attribute the module branches on. **Template control flow must never decide whether JS exists** — `discussion.html`'s `{% if discussion_status == 'pending' and started_at %}` means a timer's code is present on some renders and absent on others, so the module is un-loadable, un-importable and un-testable by construction. It becomes `data-discussion-status` and an `if` in the module. |

### 2.1 Every template ends at zero inline JavaScript

The ticket's second question — whether "a small glue block plus an imported module" is an acceptable
steady state — answers itself once §1 is enumerated: **there is nothing left for a glue block to do.**
Under the rule above the hand-off is *markup* (an attribute, or a `json_script` data block), so the
module can read its own inputs and no template needs executable script at all.

Precisely, because `json_script` does emit a `<script>` tag: **no inline script containing code.**
`<script type="application/json">` is data and is fine. That distinction is what makes the rule
checkable — a `<script>` with no `src` and no `type="application/json"` is a violation.

"Small glue block" is rejected deliberately: it is a rule with no edge, so every future page gets to
decide for itself what "small" means, and the 4,162 lines this ticket exists to move are what that
looks like after a few years.

### 2.2 The one exception, named and bounded

**`layout.html:7–131`** — 124 lines of boot-time theme/class setup, sitting above `</head>` (line
141). It must stay inline **and** blocking: a module or a `defer`red script runs after parsing, and
this code exists to set the theme *before first paint*. Moving it is a visible flash on every page
load, which is a regression no taxonomy is worth.

The exception is one block, in one file, and it carries a condition: **it may contain no template
context.** It has none today (`layout.html`'s single reference is at :875, in a different block), so
the condition costs nothing now and stops the exception being used as a hiding place later.

Everything else in `layout.html` — the other five blocks, 575 lines — is in `<body>` and moves.

---

## 3. Destinations

Against #204's taxonomy. Nothing here needs a folder that doesn't already exist in it.

| From | Lines | To |
| --- | --- | --- |
| `_hub_sidebar.html` | 663 / 388 code | `static/js/components/sidebar.js` — portal chrome, zero refs, **moves verbatim** |
| `layout.html` blocks 2–6 | 575 | `static/js/components/`: hub-rail, nav, footer status slot, report-issue; the 465-line print/iframe block gets its own module |
| `layout.html` block 1 | 124 | **stays** (§2.2) |
| `panel/home.html` | 1,255 / 742 code | `panel/js/pages/home.js` — zero refs, moves as-is |
| `panel/{students,referrals,actions,escalations,meetings,safeguarding_notes}.html` | 827 | `panel/js/pages/*.js`, each an entry module calling `initListPage(root, options)` (#204 §4) — this is where the ×6 `refreshRegOptions` / ×3 `setupToggle` / ×4 button-width duplication (#200 §4.3) actually dies |
| `panel/{meeting_setup,meeting_agenda,discussion,panel_group_settings,escalate_form}.html` | 674 | `panel/js/pages/*.js` |

**`panel/js/pages/home.js` lands at 742 code lines, over #204's ~600 review trigger.** It splits on
arrival, and the seams are already visible in #200: two hand-rolled carousels (~700 lines, near-1:1
with each other), tabs, and the action-form wiring. Which makes it the trigger working as intended —
it fired on the one file that genuinely is two or three things, and did not fire on `sidebar.js` (388)
or the six list pages.

---

## 4. What this changes upstream

- **[inventory.md](inventory.md) §3 is corrected** with the table in §0. The sidebar row was the
  headline of that section and it was wrong in both columns.
- **#198's "genuinely coupled" grounding fact is retired.** There is no hard case. The rule was
  expected to be shaped by `_hub_sidebar.html`; it is shaped by nine `JSON.parse` calls, four
  timestamps, one `{% url %}` and one `{% if %}`.
- **#205 gains a checker and loses a caveat**: `scripts/check_inline_js.py` (advisory, per #199's
  precedent) flagging any `<script>` without `src` and without `type="application/json"`, with the
  single `layout.html` boot block allowlisted by line range and reason.
