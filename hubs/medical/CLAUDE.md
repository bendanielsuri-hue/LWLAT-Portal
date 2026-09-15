# Medical Hub — `hubs.medical`

Mounted at `/medical/`. A landing page plus seven leaves, every one a placeholder:
Medical Profiles, Medical Log, Accident Book, Care Plans, Medical Consent,
Immunisations and Emergency Equipment. No models, no ORM use. Vocabulary is settled in
[CONTEXT.md](CONTEXT.md).

The page split is not arbitrary — it is ADR 0031's line drawn as navigation. Profiles,
Care Plans, Consent and Immunisations hold **standing statements** (what is true about
a person now, superseded rather than mutated); Medical Log and the Accident Book hold
**historical events** (what happened at a moment, append-only). A page that would hold
both has picked the wrong one.

Four things that look like omissions and are not:

- **Staff and students share one Profiles page** while keeping separate tables. Two
  pages would have deduplicated a template and left the two different visibility gates
  exactly as hard.
- **There is no Medication page.** A dose given is an event and belongs in the log. What
  that leaves open is the *worklist* of doses still due, which is on the map.
- **The Accident Book is not the Medical Log.** Clinical content versus circumstance —
  different readers, different retention, and the accident book covers visitors, who
  are not a subject this portal has a table for.
- **The first aider directory is on the landing page**, not a leaf. See `hub.html`; the
  reasoning is in the template's own comment because that is where someone would
  otherwise "fix" it.

Scaffolded ahead of the work so the hub exists to hang pages off; the design is
charted in [docs/wayfinder/medical-logging/map.md](../../docs/wayfinder/medical-logging/map.md)
(tracker home [#275](https://github.com/bendanielsuri-hue/LWLAT-Portal/issues/275)).
Two things settled there that constrain anything built here:

- **The models belong in `core`, not this app.** A medical record is about a
  `Staff` or a `Student` and is read by at least three hubs. `core.SafeguardingNote`
  was born inside `hubs.inclusion.panel` and had to be relocated to `core` the
  moment a second consumer appeared (#77-#81); starting here would repeat that.
  This app owns pages and templates only.
- **`medical_hub` is seeded `hidden`.** It stays hidden until there is both
  something to show and an access-control story — medical data is GDPR Article 9
  special category, and this portal still enforces no auth at all.
