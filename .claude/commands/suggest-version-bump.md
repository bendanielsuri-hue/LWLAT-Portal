---
description: Suggest whether an app's next release should be a minor or major semver bump
argument-hint: <app, e.g. panel|inclusion|core|staff|...>
---

Suggest a minor/major version bump for app: $ARGUMENTS

See #149/#156 for why this exists: the pre-commit hook (`scripts/bump_versions.py`)
already patch-bumps `VERSION` in `<app>/apps.py` on every commit touching that
app's files. This command is the separate, on-demand piece for the two bigger
semver digits.

Do this:

1. Resolve `$ARGUMENTS` to its `apps.py` path (e.g. `panel` -> `hubs/inclusion/panel/apps.py`,
   `inclusion` -> `hubs/inclusion/apps.py`, `core` -> `core/apps.py`, otherwise `hubs/<app>/apps.py`).
2. Find the last commit where that file's `VERSION` line changed in its **minor or
   major** digit (i.e. skip commits that only changed the patch digit — the
   auto-bump hook does those on nearly every commit, so anchoring on any
   VERSION change would collapse the range to just the latest commit).
   Use `git log -p -- <apps.py path>` and inspect each VERSION diff hunk.
3. Review every commit touching that app's owned files since that anchor
   (same ownership rules as `scripts/bump_versions.py`'s `APP_APPS_PY_BY_PREFIX`/
   shared-file list).
4. Classify using standard semver: **major** = breaking change (removed/renamed
   field, changed URL/view contract, dropped a template block others reference),
   **minor** = backward-compatible new feature (new page, new field, new
   optional behaviour), **patch** = the hook already has this covered, don't
   suggest patch here.
5. Report your suggested level with concrete reasoning (cite the specific
   commits/changes that justify it). If nothing since the anchor rises above
   patch, say so plainly rather than manufacturing a minor bump.
6. Do not edit `apps.py` yourself — print the suggestion and let the user
   apply it by hand (the pre-commit hook then skips its own patch-bump for
   that app in the same commit, since VERSION is already touched).
