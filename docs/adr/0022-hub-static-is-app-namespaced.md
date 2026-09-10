# Hub static files live under an app-namespace directory

Every hub's static assets sit one directory deeper than looks necessary:

```
hubs/inclusion/panel/static/panel/css/panel.css   →  {% static 'panel/css/panel.css' %}
```

not `hubs/inclusion/panel/static/css/panel.css`. The repeated app name is doing real work.

## Why: Django collapses every app's static into one flat namespace

`AppDirectoriesFinder` gathers `<app>/static/` from every installed app into the same namespace as the project's `STATICFILES_DIRS`. A file's static name is its path *below* `static/`, with nothing identifying which app it came from. So two apps' files with the same relative path are two files with one name.

Measured with a probe file at `hubs/inclusion/panel/static/css/components/cards.css`:

```
finders.find('css/components/cards.css', all=True)
  → ['…/static/css/components/cards.css',
     '…/hubs/inclusion/panel/static/css/components/cards.css']
```

`{% static %}` and `finders.find()` return the **first**. `FileSystemFinder` runs before `AppDirectoriesFinder`, so the project's file wins and **the hub's file is silently shadowed** — no error, no warning, in dev or at render time. The page renders with the wrong stylesheet and nothing anywhere says so.

This has been invisible until now for a single reason: `panel.css` happens to be a filename unique in the whole project. ADR 0020 gives hubs the same folder vocabulary as the portal — `components/`, `pages/` — so the very next hub file to be created under those names would have collided, and the failure would have presented as "my CSS isn't loading" with nothing to grep for.

Namespacing is Django's own documented convention for exactly this. It has simply never been applied here, because with one hub file and a unique name there was nothing to notice.

## Considered options

- **Keep the flat layout and rely on unique filenames.** Rejected: it makes every hub file's correctness depend on a global uniqueness property that nothing checks and that ADR 0020's shared folder vocabulary actively works against. The failure is silent, which is the disqualifying part — a loud collision would be a much smaller problem.
- **Prefix filenames instead of nesting** (`panel-cards.css`). Rejected: it is the same uniqueness gamble with worse ergonomics, and it re-introduces the `panel-` prefix that ADR 0020 removes from promoted names, so a reader can no longer use the prefix as a signal.
- **Reorder the finders so apps win.** Rejected: it makes the shadowing quieter still by flipping which file disappears, and it would change the resolution of every static name in the project to fix one directory layout.
