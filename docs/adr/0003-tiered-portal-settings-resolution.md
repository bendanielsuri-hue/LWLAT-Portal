# Tiered portal settings resolve by selected school, not viewer's own school

`School`, `CategorySettings` (one per Primary/Secondary), and the singleton `MatSettings` share seven optional fields (terminology, branding, contact info); a blank field means "inherit from the next tier down." `resolve_portal_settings()` resolves School → Category → MAT → hardcoded, keyed entirely off `core.identity.current_school_key` — the same cookie driving the sidebar school-switcher and data filtering — deliberately not off the viewer's own identity/home school. Selecting `'all'` collapses straight to MAT → hardcoded (skipping Category, since there's no single category to resolve); `'primary'`/`'secondary'` resolve Category → MAT → hardcoded.

This means a MAT-wide staff member (no home school, e.g. Benjamin Suri) sees whichever school's branding they've currently selected in the switcher, not a fixed default — and a school-based staff member who switches the sidebar to view a different school's data also sees that school's branding, not their own. The portal reflects "what you're currently looking at," not "who you are."

## Considered options

- **Resolve by viewer's own school**: rejected — would mean a staff member browsing another school's data (e.g. a MAT-wide admin checking on a specific school) still sees their own school's terminology/branding, which reads as wrong when every other piece of context on the page (data, filters) is scoped to the selected school instead.
