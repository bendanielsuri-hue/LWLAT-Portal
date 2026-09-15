# Medical Hub — `hubs.medical`

Mounted at `/medical/`. Skeleton only — no feature pages yet. No models, no ORM use.

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
