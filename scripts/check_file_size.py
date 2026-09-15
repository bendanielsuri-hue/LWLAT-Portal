"""Report files past the ~600-line review trigger.

Advisory, not a gate. This is the enforcement half of the size trigger in
ADR 0020 and of (ENG-S3) - those state the rule, this script is what makes it
checkable. It scans the static assets ADR 0020 is about and the app's own
Python, since the question the trigger asks is about how much code a reader
has to hold, not about the language it is written in:

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

AN ANSWER COVERS THE FILE IT WAS GIVEN ABOUT, NOT EVERY LATER VERSION OF IT

Record the answer as a marker line in that same header comment, carrying the
size it was given at:

    SIZE-ANSWERED: <code lines at the time> - <issue or one-line why>

The marker silences this script while the file is still the file that was
answered about. Two things end that, and the finding then carries both numbers:

  - it got LONGER. Any growth at all, one line included - the person adding to
    a file that is already over the trigger is exactly the person who should be
    asked whether it is still one module.
  - it changed SUBSTANTIALLY without growing: the count moved by more than
    SUBSTANTIAL (10%) in either direction, which is a rewrite rather than a
    tweak, and the judgement was about the old shape.

A small shrink is neither, and stays quiet - tidying a long file should not
cost you a re-answer. Re-answering costs one edit: update the number, and the
reason if it has changed. The old value is in git history, so the marker never
becomes a changelog.

So a clean run means nothing was worth asking about, and a finding means someone
owes an answer - not that a file is wrong.
"""

import argparse
import ast
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from check_stale_comments import comment_spans  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

TRIGGER = 600
# The marker a file carries once someone has answered "this is one thing" - see
# the module docstring. The digits are the code-line count the answer was given
# at; a marker with no number does not count as an answer, which is why the
# docstring above writes its example with <angle brackets> and this script does
# not silence itself.
# How far the count may move without growing before the answer is treated as
# being about a different file. Proportional rather than a flat line count so it
# scales: 10% of a 700-line module is 70 lines, a region rather than a tweak.
SUBSTANTIAL = 0.10
ANSWER_RE = re.compile(r"SIZE-ANSWERED:\s*(\d+)")
EXTENSIONS = (".css", ".js")
# Python is scanned too, from its own roots rather than the static ones. ADR
# 0020's trigger was written about static assets, but the question it asks -
# one module or two? - is not a property of the language, and the file that
# made the case was Python: hubs/inclusion/panel/views.py reached 4,390 lines,
# 2,915 of them code, with no checker that would ever have mentioned it (#220).
PY_EXTENSIONS = (".py",)
# Migrations are generated, never read end to end, and a long one is not a
# question anyone owes an answer to. scripts/ checks itself.
PY_SKIP_DIRS = {"migrations", "tests"}
SKIP_DIRS = {".venv", ".git", "node_modules", "staticfiles", "__pycache__"}


def python_files():
    """Every app's own Python, excluding what a size question doesn't apply to."""
    roots = [ROOT / "core", ROOT / "portal", ROOT / "mysite", ROOT / "scripts"]
    roots += sorted(ROOT.glob("hubs/*"))
    for base in roots:
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if path.suffix not in PY_EXTENSIONS or not path.is_file():
                continue
            if any(part in SKIP_DIRS or part in PY_SKIP_DIRS for part in path.parts):
                continue
            yield path


def docstring_spans(path, text):
    """Character spans of every docstring in a Python file.

    check_stale_comments.comment_spans owns "what counts as a comment", and for
    Python that is `#` comments - correct for what that scanner does, since a
    docstring is a real runtime value and not a comment. It is the wrong answer
    for counting *code* lines, though: this repo's modules open with a prose
    docstring of the same kind the header comment of a .js file carries, and
    charging those lines against the trigger would make deleting the
    explanation the cheapest way to comply - the exact failure the code-lines
    count exists to avoid.
    """
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return []
    spans = []
    offsets, total = [], 0
    for line in text.split("\n"):
        offsets.append(total)
        total += len(line) + 1
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        body = getattr(node, "body", None)
        if not body:
            continue
        first = body[0]
        if not (isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant)
                and isinstance(first.value.value, str)):
            continue
        start = offsets[first.lineno - 1] + first.col_offset
        end = offsets[first.end_lineno - 1] + first.end_col_offset
        spans.append((first.lineno, "", start, end))
    return spans


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


def answered_at(path, text):
    """The code-line count a SIZE-ANSWERED marker in this file records, if any.

    Read from the comment spans only, so the marker has to be in a comment the
    way the answer it stands for is - a string literal that happens to contain
    the word cannot silence a file.
    """
    spans = list(comment_spans(path, text))
    if path.suffix == ".py":
        spans += docstring_spans(path, text)
    for _lineno, _body, start, end in spans:
        match = ANSWER_RE.search(text[start:end])
        if match:
            return int(match.group(1))
    return None


def code_lines(path):
    """Non-blank lines with the comment spans blanked out first."""
    text = path.read_text(encoding="utf-8", errors="replace")
    redacted = list(text)
    spans = list(comment_spans(path, text))
    if path.suffix == ".py":
        spans += docstring_spans(path, text)
    for _lineno, _body, start, end in spans:
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
        help="list every file with its counts, not only those over the trigger",
    )
    args = parser.parse_args()

    rows = []
    for path in list(static_files()) + list(python_files()):
        text = path.read_text(encoding="utf-8", errors="replace")
        rows.append((
            code_lines(path),
            text.count("\n") + 1,
            path.relative_to(ROOT),
            answered_at(path, text),
        ))
    rows.sort(reverse=True)

    # A file is asking a question if it is over the trigger AND its answer does
    # not describe the file in front of you: nobody has answered, it has grown
    # since, or it has changed substantially without growing.
    def answer_is_stale(code, answered):
        if answered is None:
            return True
        return code > answered or code < answered * (1 - SUBSTANTIAL)

    asking = [r for r in rows if r[0] > TRIGGER and answer_is_stale(r[0], r[3])]
    shown = rows if args.all else asking

    for code, total, rel, answered in shown:
        pct = 100 - round(100 * code / total) if total else 0
        if answered is None:
            note = ""
        elif answer_is_stale(code, answered):
            note = f"  (answered at {answered}, now {code} - re-answer)"
        else:
            note = f"  (answered at {answered})"
        print(f"{code:>6} code  {total:>6} total  {pct:>3}% comment  {rel.as_posix()}{note}")

    outgrown = sum(1 for r in asking if r[3] is not None)
    print(
        f"\n{len(asking)} of {len(rows)} file(s) owe an answer to "
        f"\"one module or two?\" ({outgrown} of them outgrew the answer they had). "
        "A question, not a failure - record the answer in the file's own header "
        "as: SIZE-ANSWERED: <code lines> - <why>."
    )
    return 1 if asking else 0


if __name__ == "__main__":
    sys.exit(main())
