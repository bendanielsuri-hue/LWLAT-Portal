# Register attendance is an append-only event log, not a mark row

A student's state in a register session is not stored. There is no "mark" row holding `status='present'`. Instead `RegisterEvent` is append-only — `(session, student, status, outcome, kind, occurred_at, recorded_at, recorded_by, source, recorded_via, retracts)` — and the student's current state is derived by reducing their events for that session. A club register with twenty attendees and no incidents holds twenty-odd rows; the reduce is per session, over tens of rows, not over the table.

This falls out of one requirement that a single mutable row cannot express: **a student can leave and rejoin**. In at 15:30, out at 15:50, back at 16:05 is not a status and not an arrival/departure pair — it is a sequence. Once attendance is a sequence, several other things stop needing their own machinery: a correction is another event, a sign-out is another event, an amendment audit trail is inherent rather than a `RegisterMarkRevision` table, and a future status (`refused`, `sent home`) is a value rather than a schema change.

Three details carry most of the weight:

**`occurred_at` vs `recorded_at`.** When something happened, and when someone typed it. A sign-out at 16:05 recorded at 16:05 and a sign-out at 16:05 recorded at 17:40 are materially different facts, and after a safeguarding incident the gap between them is the story. Neither can be reconstructed from the other.

**`kind`** — `observation` / `correction` / `expectation` / `retraction`. Without it, a teacher marking Priya present at 15:30 and an `absent` event appearing at 16:05 is ambiguous: did she leave, or is someone fixing a mark that was wrong all along? Identical rows, opposite meanings. Timestamps alone don't settle it either, because a correction can be entered promptly ("no, she was never here", typed at 15:31).

**`retracts`** — a nullable FK to the event this one cancels. Removing a mistakenly added student appends a retraction pointing at the event that added them; it never mutates or deletes the original. The retracted entry disappears from take screens and from the student's register history (they genuinely were not there, and a fire-register read must not have to know to skip them) while remaining in the log, so "who has been removing entries?" is answerable. Mutating a row instead would erase exactly the evidence an append-only log exists to keep.

Two consequences worth stating because they are easy to get wrong later:

- **Unresolved departures are never auto-closed.** A `present` with no `left` when a session ends is surfaced as unresolved, not backfilled with a departure at the scheduled end time — that would write an observation nobody made, and it is precisely the record that gets read back after an incident.
- **Analysis may estimate; the record may not.** Engagement time is reported as `confirmed_minutes` (both ends observed) and `estimated_minutes` (assumed to the session's scheduled end) as two numbers, never blended into one, alongside a data-quality figure ("72% of sessions had a clean sign-out"). This is [ADR 0007](0007-student-history-tables-not-summary-fields.md)'s rule extended one step: derive at query time, and let the derivation carry its own confidence.

## Considered options

- **A mutable `RegisterMark` row plus a `RegisterMarkRevision` audit table**: this was the design before re-entry came up. It needs a separate spans table to express leaving and rejoining, and then the revision table and the spans table are two different histories of the same student in the same sitting.
- **A log plus a `RegisterMark` projection holding current state**: rejected. A cache that can drift from its source, silently — the same failure mode ADR 0007 deleted `Student.attendance_pct` to avoid. The read cost it buys back is negligible at this grain.
- **A log for state changes plus a mark row for the stable facts (expected, source)**: rejected. It splits one student's story across two tables, so every question needs both, and "was she expected" becomes a different kind of fact from "did she arrive" for no reason other than storage.
- **Reducing over the whole table on every page**: the objection that killed pure event sourcing in the first discussion, and it was wrong at this scale. Reduction happens per session. It would stand if a page reduced a year of MAT-wide events, which is what the `register_history(student)` helper exists to keep in one place and optimise if it ever matters.
