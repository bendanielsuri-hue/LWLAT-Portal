"""Find comments that name code which no longer exists.

Advisory, not a gate. This is the enforcement half of the comment policy in
docs/agents/doc-conventions.md ("Does this comment still describe the code?") -
that section states the rule, this script is what makes it checkable. Run it on
demand, and during /code-review's Standards pass:

    .venv\\Scripts\\python.exe scripts\\check_stale_comments.py
    .venv\\Scripts\\python.exe scripts\\check_stale_comments.py --changed

Deliberately NOT wired into .githooks/pre-commit (unlike scripts/bump_versions.py).
A false positive here blocks a commit that has nothing to do with the comment it
tripped on, and a hook that does that gets --no-verify'd, at which point it is
worse than no check at all. Precision is the whole point: a checker an agent
learns to dismiss is a checker that has stopped working.

WHAT IT FLAGS

A name that a comment mentions and that appears nowhere in the repo's live
(non-comment) code. Three kinds:

  fn     a call-shaped camelCase reference   - `setupFilterBarMoreFilters()`
  class  a CSS class                         - `.filter-bar-tray`
  attr   a data attribute selector           - `[data-more-filters]`

A dead name is the machine-checkable half of the policy. A comment naming a
thing that no longer exists is, by definition, explaining the past rather than
the code in front of it - so this also catches the pure-archaeology shape the
policy rejects ("replacing the old X", where X is long gone).

The other half - whether a live comment records a *contested* decision or merely
restates what the code does - is a judgement call and is not checkable here.
Don't read a clean run as "the comments are fine".

WHY IT IS LENIENT

Two false-positive classes showed up while this was being built, and both are
legitimate ways to write a comment rather than mistakes:

  - Family references. A comment says `.referral-carousel` when the live class
    is `.referral-carousel-count`. It is pointing at a family, not a selector.
    So a name counts as live if it PREFIXES a live name, not only if it matches
    one exactly.
  - Hyphen-wrapped identifiers. A long class name broken across two comment
    lines (`.safeguarding-briefing-\n   card--scrollable`) is one name, so
    comment text is unwrapped at a trailing hyphen before names are extracted.
  - Pluralised references. "ordinary `.hub-rail-items`" is English about the
    live `.hub-rail-item`, so a trailing `s` is retried as a family reference.
    Note this is not covered by the prefix rule, which only works the other
    way round - the comment's name here is LONGER than the live one.
  - Metasyntactic placeholders. `wireXxx()` means "every wire* function above",
    not a function anyone expects to find.

The cost is recall: a class renamed *within* its own family still reads as
live. That is a comment pointing at a live sibling - wrong but navigable -
rather than a dead end, and it is the cheaper of the two errors.

Comments are found with a character scanner, not a regex. `//` and `/* */`
overlap in ways a regex gets wrong: a line comment mentioning a glob path
(`templates/icons/*_svg.html`) contains `/*`, which a naive regex reads as the
start of a block comment and then swallows the next 250 lines of real code as
"comment" - which is exactly what happened here, and it manufactured three
findings for functions that were defined inside the swallowed region.
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SKIP_DIRS = {".venv", ".git", "node_modules", "staticfiles", "__pycache__", "migrations"}
EXTENSIONS = (".js", ".css", ".py", ".html")


def source_files():
    for path in ROOT.rglob("*"):
        if path.suffix not in EXTENSIONS or not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.relative_to(ROOT).parts):
            continue
        yield path


def scan_c_like(text, line_comments):
    """Comment spans in a JS/CSS-family file, as (line, text, start, end).

    A character scanner rather than a regex, because string literals and the two
    comment forms can each contain the other's opening delimiter - see the module
    docstring for the case that made this necessary.
    """
    spans = []
    i, n, line = 0, len(text), 1
    while i < n:
        ch = text[i]
        if ch == "\n":
            line += 1
            i += 1
        elif ch in "\"'`":
            quote, start = ch, i
            i += 1
            while i < n:
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == "\n":
                    line += 1
                    # Unterminated single-quote strings don't span lines; bail
                    # out rather than swallowing the rest of the file.
                    if quote != "`":
                        break
                if text[i] == quote:
                    i += 1
                    break
                i += 1
            del start
        elif line_comments and text.startswith("//", i):
            start, startline = i, line
            while i < n and text[i] != "\n":
                i += 1
            spans.append((startline, text[start:i], start, i))
        elif text.startswith("/*", i):
            start, startline = i, line
            i += 2
            while i < n and not text.startswith("*/", i):
                if text[i] == "\n":
                    line += 1
                i += 1
            i = min(i + 2, n)
            spans.append((startline, text[start:i], start, i))
        else:
            i += 1
    return spans


def scan_hash(text):
    spans, offset = [], 0
    for lineno, raw in enumerate(text.split("\n"), 1):
        stripped = raw.lstrip()
        if stripped.startswith("#"):
            start = offset + (len(raw) - len(stripped))
            spans.append((lineno, stripped, start, offset + len(raw)))
        offset += len(raw) + 1
    return spans


HTML_COMMENT = re.compile(
    r"<!--.*?-->|\{%\s*comment\s*%\}.*?\{%\s*endcomment\s*%\}|\{#.*?#\}", re.S
)


def scan_html(text):
    return [
        (text[: m.start()].count("\n") + 1, m.group(0), m.start(), m.end())
        for m in HTML_COMMENT.finditer(text)
    ]


def comment_spans(path, text):
    if path.suffix == ".js":
        return scan_c_like(text, line_comments=True)
    if path.suffix == ".css":
        return scan_c_like(text, line_comments=False)
    if path.suffix == ".py":
        return scan_hash(text)
    return scan_html(text)


# A call-shaped camelCase reference. The {3,} floor keeps two-letter helpers and
# the [A-Z] requirement keeps bare lowercase words (`if (`, `for (`) out.
FN_REF = re.compile(r"\b([a-z][a-zA-Z0-9]{3,}[A-Z][a-zA-Z0-9]*)\s*\(")
# A kebab class, requiring at least one hyphen so prose like ".The" can't match.
# The lookbehind rejects `#fff`-style hex and `foo.bar` property access.
CLASS_REF = re.compile(r"(?<![\w.#-])\.([a-z][a-z0-9]+(?:-[a-z0-9]+){1,})")
ATTR_REF = re.compile(r"\[(data-[a-z0-9-]+)\]")

# Rejoin an identifier broken across comment lines at a trailing hyphen, stepping
# over whatever comment furniture (`*`, `//`, `#`) the next line starts with.
WRAPPED = re.compile(r"-[ \t]*\n[ \t]*(?:\*|//|#)?[ \t]*")

# Stand-in names, not references to anything that ever existed.
PLACEHOLDERS = ("Xxx", "XXX", "Foo", "Bar", "Baz", "Etc")


def names_in(comment):
    flat = WRAPPED.sub("-", comment)
    found = set()
    for match in FN_REF.finditer(flat):
        found.add((match.group(1), "fn"))
    for match in CLASS_REF.finditer(flat):
        found.add((match.group(1), "class"))
    for match in ATTR_REF.finditer(flat):
        found.add((match.group(1), "attr"))
    return found


def changed_files():
    """Paths in the working tree that differ from HEAD, plus untracked."""
    out = set()
    for args in (["git", "diff", "--name-only", "HEAD"],
                 ["git", "ls-files", "--others", "--exclude-standard"]):
        try:
            result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, check=True)
        except (subprocess.CalledProcessError, OSError):
            return None
        out.update(ROOT / line for line in result.stdout.split("\n") if line.strip())
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--changed",
        action="store_true",
        help="only report findings in files changed vs HEAD (the live-code index "
             "is still built from the whole repo, so a name is never called dead "
             "just because its definition sits in an unchanged file)",
    )
    args = parser.parse_args()

    # Two indexes over the same corpus: every comment, and all live code with the
    # comments blanked out. Blanking rather than deleting keeps offsets stable.
    comments, live = [], []
    for path in source_files():
        text = path.read_text(encoding="utf-8", errors="replace")
        spans = comment_spans(path, text)
        redacted = list(text)
        for lineno, body, start, end in spans:
            comments.append((path, lineno, body))
            for i in range(start, end):
                if redacted[i] != "\n":
                    redacted[i] = " "
        live.append("".join(redacted))
    livecode = "\n".join(live)

    # Prefix-tolerant: a name is live if it starts any word in the live code.
    resolved = {}

    def is_live(name):
        if name not in resolved:
            if name.endswith(PLACEHOLDERS):
                resolved[name] = True
            else:
                # The name itself as a prefix of a live name, or - for prose
                # that pluralises - the name minus its trailing "s".
                candidates = [name]
                if name.endswith("s") and len(name) > 2:
                    candidates.append(name[:-1])
                resolved[name] = any(
                    re.search(r"(?<![\w-])" + re.escape(c) + r"[\w-]*", livecode)
                    for c in candidates
                )
        return resolved[name]

    only = changed_files() if args.changed else None
    if args.changed and only is None:
        print("could not read git status; run without --changed", file=sys.stderr)
        return 2

    findings = []
    for path, lineno, body in comments:
        if only is not None and path not in only:
            continue
        for name, kind in names_in(body):
            if not is_live(name):
                findings.append((path.relative_to(ROOT).as_posix(), lineno, kind, name))

    for rel, lineno, kind, name in sorted(findings):
        print(f"{rel}:{lineno}  {kind:<5}  {name}")

    scope = "changed files" if args.changed else "repo"
    print(f"\n{len(findings)} comment(s) naming code that no longer exists ({scope}).")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
