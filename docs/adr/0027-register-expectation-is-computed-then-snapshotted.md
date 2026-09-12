# Who is expected at a register is computed, then snapshotted per session

A register never holds a hand-maintained membership list. Each `Register` names an **expectation strategy** — a named strategy in code, chosen per register, with a couple of config fields:

- **none** — nobody is expected; students are added as they arrive (a drop-in club, an isolation room being filled by arrivals).
- **history** — derived from recent attendance, e.g. attended 3 of the last 5 sittings. This is what "the regulars" means for a drop-in club that nonetheless has them.
- **rule** — derived from other data, e.g. Isolation Room's occupants computed from open behaviour sanctions.

When a session is first opened, the strategy runs once and its result is written as `expectation` events on that session. From then on the session's expected list is **frozen**. It is not recomputed on later views.

Both halves matter and they pull in opposite directions, which is why this is worth recording.

Computing rather than storing is what keeps the system usable: a maintained roster is a standing admin job, it goes stale the moment someone stops doing it, and a stale roster produces wrong absences — worse than no roster. Every register type here either has no expected list at all or has one derivable from data the portal already holds.

Snapshotting is what keeps history true. A derived rule gives a different answer next term: change the history window from 5 sittings to 10, or change which behaviour sanctions put a student in Isolation Room, and every past session silently re-answers "who was expected", which silently re-answers "who was absent". Freezing the result at session open means last term's absence record says what it said last term. It also settles, for free, whether a student was expected: a row that existed before anyone touched the screen was expected; one added during the sitting was not, and carries a `source` of `walk_in`, `referred` or `sent_by_staff`.

Membership is advisory in both directions. It seeds the screen the register-taker marks against and it makes an absence meaningful — but it never gates who may be marked. Anyone can be added to any session, because a club with regulars still takes walk-ins, and an isolation room populated by rule still receives a student a teacher sends down mid-lesson.

## Considered options

- **Explicit `RegisterMembership` rows someone maintains**: rejected as the default. It creates exactly the maintenance job this design exists to avoid, and it was the first thing ruled out — though note the fallback if derivation proves too fuzzy in practice is to add an `explicit` strategy alongside the others, not to redesign anything.
- **A `takes_roster` boolean splitting roster registers from drop-in ones**: rejected. Clubs are drop-in *and* have regulars simultaneously, so the two are not exclusive and the flag has no correct value.
- **Recomputing the expected list live on every view**: rejected — it makes the absence record a function of today's configuration rather than of what happened.
- **Storing criteria as an admin-built structured filter rather than named strategies in code**: rejected for now. A rule that reads behaviour logs is code that must be written and tested either way; the admin-facing version additionally requires building a query builder, and every rule anyone has actually asked for fits a named strategy. Add strategies as register types earn them.
