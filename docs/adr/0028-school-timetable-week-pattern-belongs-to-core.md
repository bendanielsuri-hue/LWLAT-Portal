# The school timetable week pattern belongs to `core`, not to the hub that first needs it

Babington runs a two-week timetable: a club can sit on a Week 2 Tuesday. The Registers hub needs to answer "is this week Week 1 or Week 2 at this school" in order to decide whether a scheduled slot produces a session on a given date. The model that answers it lives in `core`, alongside `School` and `Term` — not in `hubs/registers`.

"This school runs a two-week timetable, and Week 2 is the one that opens the spring term" is a fact about the school, not about registers. Timetabling, cover, rooming, and reporting are all plausible future readers of it, and per `(ENG-S1)` the shared fact goes in the shared table rather than being discovered a second time and copied. Registers is merely the first consumer.

Week parity is resolved by **counting teaching weeks over `core.Term`**, not by counting calendar weeks from a fixed anchor date. Holidays are the whole problem: a calendar count is correct in September and wrong by February, because a half-term break spanning an odd number of weeks flips the parity of everything after it. Terms already exist, already carry half-term dates ([ADR 0008](0008-academic-year-term-model-shape.md)), and are already how schools themselves reason about it. Each term declares which week it opens on.

The work splits at a real seam, and only the first half is being built now:

- **Week pattern** — how many weeks a school's timetable cycles over, and which week each term opens on. Small, self-contained, and has a consumer on day one.
- **Period definitions** — what P1..P5 are called and when they run at each school. A larger modelling job with no consumer until the Registers hub's Isolation Room page exists, which is also the first screen that would show whether the model is right. Until then a session's period is an optional label.

## Considered options

- **A nullable `week` on the register's schedule rows and nothing else**: rejected. It records that a slot wants Week 2 but gives nothing that can answer whether *this* week is Week 2, so the field is unreadable.
- **Hardcode two weeks**: rejected. It happens to fit Babington and silently mis-models any school on a one-week or three-week cycle, including the four schools nobody has checked.
- **A stub resolver in `hubs/registers` that always answers Week 1**: rejected — it is silently wrong for Babington specifically, which is worse than the feature being absent, because a missing feature is visible and a wrong answer is not.
- **A date-to-week-number table seeded per school per year**: rejected. Correct by construction, and an annual data-entry job — the maintenance burden this project's design has rejected everywhere else (see [ADR 0027](0027-register-expectation-is-computed-then-snapshotted.md)).
- **Build all of the timetable model up front, periods included**: rejected. It designs a fairly intricate calendar against no screen, which is how the wrong abstraction gets built carefully and then migrated.
