# Three kinds of note, and one abstract base for the thread entry

This portal now has three things a user would call "a note", and calling them one thing is what makes them hard to build. They are separated by what kind of claim they make, not by which page they appear on:

- A **standing statement** is currently true and stays true until someone replaces it. `core.SafeguardingNote` is one: a DSL's one-line statement about a student. Editing it never mutates a row — a new row supersedes the old one — because the question it answers is "what is true now", and an audit trail of what used to be claimed is the point.
- A **historical event** was true at a moment and never stops being true. `ActionUpdate` and `PanelReferralNote` are these: "called the parent, no answer" on Tuesday does not become false on Wednesday. Entries accumulate, read oldest-first, and the newest one happens to describe the current state.
- A **record attribute** is a field of the thing itself. `Action.description` is one — it says what the action *is*, and it was called `note` until [#229](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/229) renamed it, which is the whole reason this taxonomy is written down: "note" had quietly come to mean two of these three at once, on one model.

`ActionUpdate` exists because `Action.status` has three values and none of them can hold what was tried. An action chased four times and an action nobody has touched are the same row until the narrative has somewhere to live. Status is deliberately unchanged: the fix is a thread, not a richer state vocabulary.

## The shared base is abstract

`core.ThreadEntry` is an abstract model — `body`, `author`, `created_at`, `edited_at`, `deleted_at`, plus `ThreadEntryQuerySet.visible()`. Each thread gets its own table and its own real foreign key.

The alternative was one concrete `ThreadEntry` table with a generic foreign key, and it was rejected for two reasons. Every per-thread read becomes a join through a content-type id, for no gain — there is no screen that wants "all thread entries everywhere". More decisively, it would put entries belonging to sensitive and non-sensitive parents in one table. An `ActionUpdate` has no sensitivity of its own: it is exactly as visible as the action it hangs off, which is a filter on the parent (`visible_actions_for`). Under a generic table, that gate could no longer be expressed as a join to a single parent model, and the app's one real visibility rule would need a second implementation.

The base lands now rather than when the second thread arrives because the behaviour a thread needs is several decisions deep — soft delete, an edited marker that is null until it means something, oldest-first ordering, an author that survives the staff member leaving — and the meeting-note thread is already slated to move onto it ([#236](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/236)). Two tables, one definition of what an entry is.

## Why this thread is editable when the other two note models are not

`PanelReferralNote` is add-only on purpose: several panel members type into the same discussion at once, and an edit is a silent overwrite of someone else's sentence. `SafeguardingNote` is append-only for a stronger reason — it is a safeguarding record, and what a DSL used to assert has to stay recoverable.

An `ActionUpdate` is neither. It is one person's account of what they did about their own action, written seconds after they did it, with typos. The cost of a wrong entry standing forever is a thread nobody trusts; the cost of an edit is that a line someone read earlier has changed, on a thread with a single author per entry and no concurrent writers. `edited_at` and `deleted_at` are on the base so an edit is visible as an edit and a deletion leaves the thread without leaving the table — the record survives, the mistake does not have to.

## Considered options

- **A `status` value per attempt (e.g. "chased")**: rejected. It answers "what was tried" with a vocabulary that has to grow every time reality does, and still cannot hold "no answer, will try after 3pm".
- **Structured fields (method / contacted / outcome / next attempt)**: rejected. The same model carries "ring mum" and "complete the EHCP paperwork". Fields that are blank most of the time produce counts nobody can trust, and a form nobody fills in.
- **One generic thread table with a content-type key**: rejected, as above — the sensitivity gate is the deciding half.
- **A second dialog for the thread**: rejected. The thread belongs to the action being looked at; it is a third step inside the action modal, reusing the step machinery and Back button already there.
- **The thread always visible under the action form**: rejected. It opens every *create* on a dead empty thread, and it pushes the save buttons below a list with no upper bound.
