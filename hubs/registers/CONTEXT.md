# Registers

Django app (`hubs.registers`, mounted at `/registers/`) for recording attendance at anything that is not the statutory register: clubs, interventions, isolation and reset rooms. The hub is a **generic register system** — the category pages are entry points into it, not five separate features. Cross-hub vocabulary (Staff, Student, School, Term) lives in `core`, not here.

Nothing below is built yet; this glossary was written alongside the design (see [#64](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/64)) so the models arrive with settled names. ADRs [0025](../../docs/adr/0025-registers-own-spine-not-statutory-attendance.md)–[0029](../../docs/adr/0029-scannable-student-identifiers-are-a-table.md) hold the rationale.

## Language

**Register**:
A named thing attendance is taken for — "Badminton Club", "Year 9 Reading Intervention", "Isolation Room". Belongs to one `RegisterCategory`, owned by a `core.StaffGroup` (a role, not a person, so it survives staff turnover), scoped to a `School` or MAT-wide when the FK is null. A Register is the standing thing; it does not itself carry a date.
_Avoid_: Club (one category of register), Group (that's `StaffGroup`), Session (a Register is not one sitting)

**RegisterCategory**:
The grouping a Register belongs to — Clubs, Isolation Room, Reset Room, Interventions — as **data, not a choices list**, so a category can be added without a deploy and without a new view. The hub's category pages are filtered views over `category.slug`. Owns the optional per-category outcome vocabulary (see *Outcome*).
_Avoid_: Type (nothing branches on category in code; it groups and it labels)

**RegisterSession**:
One sitting of a Register — a date plus an optional period. Carries who took it and when, and an explicit `cancelled` flag. **The session row exists before anyone marks anything**, which is what makes "not taken yet" a representable state and distinguishable from "cancelled" and from "nobody has opened it". Materialised lazily on first view of a date rather than by a scheduled job.
_Avoid_: Meeting, Sitting (fine in UI copy; RegisterSession is the model name), Day (a register may sit five times a day)

**RegisterEvent**:
The unit of record. Append-only: a student's state in a session is **derived by reducing their events**, never stored as a mark row. Carries `status`, optional `outcome`, `kind`, `occurred_at`, `recorded_at`, `recorded_by`, `source`, `recorded_via`, and a nullable `retracts` FK. Leaving and rejoining, corrections, sign-outs and removals are all just more rows. See [ADR 0026](../../docs/adr/0026-register-attendance-is-an-append-only-event-log.md).
_Avoid_: Mark, Attendance record (there is deliberately no mark row — saying "mark" invites someone to add one)

**Status** (on an event):
The core, cross-register vocabulary — present / absent / late / left. Deliberately shared by every register so "how many sessions did Amir miss?" is answerable across all of them. Anything register-specific goes in *Outcome*, not here.

**Outcome** (on an event):
The optional, per-category detail alongside status — Isolation Room's "sent home early", say. Status answers *did they attend*; outcome answers *what happened*. Keeping them apart is what stops "refused" and "absent" becoming uncountable together.

**Kind** (on an event):
`observation` | `correction` | `expectation` | `retraction`. Without it, "present at 15:30, absent at 16:05" is ambiguous between *she left* and *someone is fixing a wrong mark* — identical rows, opposite meanings.

**`occurred_at` vs `recorded_at`**:
When it happened, versus when someone typed it. A sign-out at 16:05 recorded at 16:05 and one recorded at 17:40 are different facts, and after an incident the gap between them is the story. Never collapse them into one timestamp.

**Source** (on an event):
*Why* the student was there — `expected` / `walk_in` / `referred` / `sent_by_staff`. Distinct from *Recorded via*.

**Recorded via** (on an event):
*How* the event was captured — `manual` / `scan`. Deliberately separate from Source; conflating them costs the scan-reliability figure the data-quality percentage needs.

**Retraction**:
Removing a mistakenly added student — an appended event with `kind=retraction` and a `retracts` FK to the event it cancels. The entry disappears from take screens and from the student's register history (they genuinely were not there) and survives in the log, so "who has been removing entries?" stays answerable. Never a row mutation or a delete. Distinct from a **correction**, which changes a status that was wrong; a retraction says the student was never in this session at all.

**Expectation strategy**:
How a Register works out who is expected, named in code and chosen per register: `none` (add them as they arrive), `history` (derived from recent attendance — "the regulars"), `rule` (derived from other data, e.g. Isolation Room from open behaviour sanctions). **No register holds a hand-maintained membership list.** The strategy runs once when a session first opens and its result is frozen as `expectation` events — so changing the rule next term cannot rewrite last term's absences. See [ADR 0027](../../docs/adr/0027-register-expectation-is-computed-then-snapshotted.md).
_Avoid_: Roster, Membership (both imply a list someone maintains, which is the thing this exists to avoid)

**RegisterSchedule**:
A recurrence slot on a Register — one row per weekday/period the register runs, each with a nullable `week` for schools on a two-week timetable (null means every week). A club has one slot; an all-day isolation room has one per period. Moving a club from Tuesdays to Thursdays adds and retires slots without rewriting history.

**RegisterRun**:
A date range during which a Register runs at all. Zero or more per register: a six-week intervention is one row, a club that runs autumn and summer but not spring is two, an isolation room is one open-ended row. Sessions only materialise inside a run — which is what stops a register quietly generating sittings over Christmas.
_Avoid_: Term (a run is often term-shaped but is not `core.Term`; a club may run September to October half-term, which no Term row names)

**Confirmed vs estimated minutes**:
Engagement time is reported as two numbers, never blended. *Confirmed* = both ends observed. *Estimated* = arrival observed, departure assumed to the session's scheduled end. Reported alongside a data-quality figure ("72% of sessions had a clean sign-out"). A register that does not track departure reports confirmed minutes only rather than inventing a number.

**Unresolved departure**:
A `present` with no later `left` when a session closes. Surfaced, never auto-closed — backfilling a departure at the scheduled end would write an observation nobody made, which is exactly the record read back after an incident.

**`tracks_departure`**:
Per-register flag deciding whether sign-out is asked for at all. An intervention inside the school day has no custody question, and a sign-out column there is noise that trains people to ignore it.

**StudentIdentifier** (lives in `core`):
A scannable code resolving to a student — `(student, kind, value, is_active, issued_at)`, `kind` being `library_barcode` or `qr_token`. A table rather than columns because a code is a credential and credentials need reissue. **A QR token is never a UPN.** See [ADR 0029](../../docs/adr/0029-scannable-student-identifiers-are-a-table.md).
