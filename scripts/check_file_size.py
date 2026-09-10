"""Report static files past the ~600-line review trigger.

Advisory, not a gate. This is the enforcement half of the size trigger in
ADR 0020 - that ADR states the rule, this script is what makes it checkable:

    .venv\\Scripts\\python.exe scripts\\check_file_size.py
    .venv\\Scripts\\python.exe scripts\\check_file_size.py --all

Deliberately NOT wired into .githooks/pre-commit, for the same reason
scripts/check_stale_comments.py is not: a check that blocks a commit over a
judgement call gets --no-verify'd, and a check an agent learns to dismiss has
stopped working.

IT COUNTS CODE LINES, NOT TOTAL LINES

This is the whole reason the script exists rather than `wc -l`. panel.css is 61%
comment lines and several panel.js regions run 60-70% (#199, #200), so a
total-line trigger fires on prose alone - which makes deleting good comments the
cheapest way to comply, in a repo whose comment policy asks for full prose and
says to delete rather than shorten. Comments are free here. Code is what has to
fit in a reader's head.

Comment spans come from scripts/check_stale_comments.py rather than a second
scanner, so "what counts as a comment" has one definition. That scanner is a
character scanner rather than a regex on purpose; its docstring records the case
that made it necessary.

CROSSING THE TRIGGER IS A QUESTION, NOT A FAILURE

The question is: is this one module, or two? A legitimate "one" is a normal
answer - static/js/list-page/facts-strip.js is expected to sit over the line,
because its measurement cache would otherwise become an interface between files
(ADR 0021). When the answer is "one", the reason goes in the file's header
comment, which is exactly what docs/agents/doc-conventions.md says a comment has
to earn: a contested decision, recorded at the site.

So a clean run means nothing was worth asking about, and a finding means someone
owes an answer - not that a file is wrong.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from check_stale_comments import comment_spans  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

TRIGGER = 600
EXTENSIONS = (".css", ".js")
SKIP_DIRS = {".venv", ".git", "node_modules", "staticfiles", "__pycache__"}


def static_files():
    """Every portal-wide and hub-owned static asset the convention covers."""
    roots = [ROOT / "static"] + sorted(ROOT.glob("hubs/*/static")) + sorted(
        ROOT.glob("hubs/*/*/static")
    )
    for base in roots:
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if path.suffix not in EXTENSIONS or not path.is_file():
                continue
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            yield path


def code_lines(path):
    """Non-blank lines with the comment spans blanked out first."""
    text = path.read_text(encoding="utf-8", errors="replace")
    redacted = list(text)
    for _lineno, _body, start, end in comment_spans(path, text):
        for i in range(start, end):
            if redacted[i] != "\n":
                redacted[i] = " "
    stripped = "".join(redacted).split("\n")
    return sum(1 for line in stripped if line.strip())


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--all",
        action="store_true",
        help="list every static file with its counts, not only those over the trigger",
    )
    args = parser.parse_args()

    rows = []
    for path in static_files():
        text = path.read_text(encoding="utf-8", errors="replace")
        rows.append((code_lines(path), text.count("\n") + 1, path.relative_to(ROOT)))
    rows.sort(reverse=True)

    over = [r for r in rows if r[0] > TRIGGER]
    shown = rows if args.all else over

    for code, total, rel in shown:
        pct = 100 - round(100 * code / total) if total else 0
        print(f"{code:>6} code  {total:>6} total  {pct:>3}% comment  {rel.as_posix()}")

    print(
        f"\n{len(over)} of {len(rows)} static file(s) over {TRIGGER} code lines. "
        "Each one is a question - one module or two? - not a failure."
    )
    return 1 if over else 0


if __name__ == "__main__":
    sys.exit(main())
