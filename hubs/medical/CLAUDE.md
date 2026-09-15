# Medical Hub — `hubs.medical`

Mounted at `/medical/`. A landing page plus five leaves, every one a placeholder:
Profiles, Medical Log, Accident Book, Immunisations and Stock. No models, no ORM use.
Vocabulary is settled in [CONTEXT.md](CONTEXT.md).

Every page is one of **three kinds**. ADR 0031 names two — **standing statements**
(Profiles: what is true about a person now, superseded rather than mutated) and
**historical events** (Medical Log, Accident Book: what happened at a moment,
append-only). The third is this hub's own, **what needs to happen next** (Immunisations,
Stock, plus the worklist still unbuilt). Reach for the third kind before reaching for a
fourth page: the doses-due list drifted homeless for three rounds of design because it
was missing a category, not a page.

Six things that look like omissions and are not:

- **Staff and students share one Profiles page** while keeping separate tables. Two
  pages would have deduplicated a template and left the two different visibility gates
  exactly as hard.
- **There is no Medication page.** A dose given is an event and belongs in the log. The
  *worklist* of doses still due is the third kind, and is on the map.
- **Care plans are a section of Profiles**, not a page. A plan in force is a standing
  statement about a person. Its review cycle is what made it look separate, and
  "overdue for review" is a worklist.
- **Consent is not here at all** — it is in `hubs.student`, because a parent consents to
  medicines, photographs, trips and biometrics in one breath, and because consent is
  parental and so says nothing about the staff half of this hub. The medical-kind
  consents surface read-only on a profile.
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
