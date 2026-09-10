"""Find templates still carrying executable inline JavaScript.

Advisory, not a gate. This is the enforcement half of the inline-JS rule in
ADR 0021 - that ADR states the rule, this script is what makes it checkable:

    .venv\\Scripts\\python.exe scripts\\check_inline_js.py
    .venv\\Scripts\\python.exe scripts\\check_inline_js.py --refs

Deliberately NOT wired into .githooks/pre-commit, matching
scripts/check_stale_comments.py and scripts/check_file_size.py.

WHAT COUNTS AS A VIOLATION

A <script> element with no src and no type="application/json". The rule is *no
inline script containing code*, not "no inline script tags" - Django's
json_script filter emits <script type="application/json">, which is how template
context is supposed to reach JavaScript, so flagging it would flag the fix.

STRIP THE COMMENTS BEFORE YOU LOOK FOR TAGS

This is the whole reason the script reuses check_stale_comments.py's scanner
rather than matching <script[^>]*> against raw template text, and it is a real
bug this repo has already paid for twice:

  templates/hubs/_hub_sidebar.html:230, inside a {% comment %} block, contains
  the prose "see the <script> below". A regex reads that as an opening tag and
  matches through to the real </script> 1,700 lines later, sweeping up 1,056
  lines of the template's *markup* and counting its {% include %}s and its
  {% for %} over local_menu as script content. That is where the "1,720 script
  lines, 139 template refs" figure in #198/#200 came from, and it was wrong in
  both columns - the sidebar's script is 663 lines and takes no context at all.

  #202 hit the same shape in Django's own manifest-hashing regex, where prose in
  a header comment matched forward into the import statement below it.

Both failures produced a confidently wrong answer rather than an error. This
codebase's comments discuss its code - see docs/agents/doc-conventions.md - so
any tool that scans it strips comments first.

THE ONE EXCEPTION

templates/layout.html's boot block, above </head>, sets the theme before first
paint. It stays inline *and* blocking: a module or a defer'd script runs after
parsing, which is a visible flash on every page load.

It is allowed by shape rather than by line number, so it cannot drift: a block
in layout.html, before </head>, carrying no template context. That last
condition is the ADR's, and enforcing it here is what stops the exception
becoming a hiding place for coupled code.
"""

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from check_stale_comments import comment_spans  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

SKIP_DIRS = {".venv", ".git", "node_modules", "staticfiles", "__pycache__"}

SCRIPT = re.compile(r"<script([^>]*)>(.*?)</script>", re.S)
DATA_TYPE = re.compile(r'type\s*=\s*["\']application/json["\']', re.I)
HAS_SRC = re.compile(r"\bsrc\s*=", re.I)
# A template reference that does something. Comment tags are already blanked out
# by the time this runs, so anything left is context reaching into the block.
REF = re.compile(r"\{\{.*?\}\}|\{%.*?%\}", re.S)


def templates():
    for path in ROOT.rglob("*.html"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.relative_to(ROOT).parts):
            continue
        yield path


def redacted(path):
    """The file with every comment span blanked, offsets and line numbers intact."""
    text = path.read_text(encoding="utf-8", errors="replace")
    chars = list(text)
    for _lineno, _body, start, end in comment_spans(path, text):
        for i in range(start, end):
            if chars[i] != "\n":
                chars[i] = " "
    return "".join(chars)


def is_boot_block(rel, text, start):
    """The pre-paint theme block: in layout.html, above </head>, context-free."""
    if rel != "templates/layout.html":
        return False
    head_end = text.lower().find("</head>")
    return head_end != -1 and start < head_end


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--refs",
        action="store_true",
        help="also print the template references each block carries",
    )
    args = parser.parse_args()

    findings, total_lines, exempt = [], 0, []
    for path in sorted(templates()):
        rel = path.relative_to(ROOT).as_posix()
        text = redacted(path)
        for match in SCRIPT.finditer(text):
            attrs, body = match.group(1), match.group(2)
            if HAS_SRC.search(attrs) or DATA_TYPE.search(attrs):
                continue
            line = text[: match.start()].count("\n") + 1
            lines = body.count("\n")
            refs = [r.group(0).strip() for r in REF.finditer(body)]
            if is_boot_block(rel, text, match.start()):
                # The exception carries a condition: no template context.
                if refs:
                    findings.append((rel, line, lines, refs, "boot block took context"))
                else:
                    exempt.append((rel, line, lines))
                continue
            total_lines += lines
            findings.append((rel, line, lines, refs, ""))

    for rel, line, lines, refs, note in findings:
        tail = f"  <- {note}" if note else ""
        print(f"{rel}:{line}  {lines:>5} lines  {len(refs):>2} refs{tail}")
        if args.refs:
            for ref in refs:
                print(f"      {ref[:100]}")

    for rel, line, lines in exempt:
        print(f"{rel}:{line}  {lines:>5} lines  exempt (pre-paint boot block)")

    print(
        f"\n{len(findings)} inline script block(s) containing code, "
        f"{total_lines} lines to move."
    )
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
