"""Merge the Testing-tab keys into .vscode/settings.json.

Called by scripts/setup-vscode-testing.sh. It lives in its own file rather than
a heredoc inside the wizard so that the wizard's library section stays the
untouched template, and so this merge can be read and reviewed on its own.

Any keys the file already carries are preserved: only the keys listed below are
overwritten, because those are the ones the Testing tab actually depends on.
"""

import json
import pathlib
import re
import sys

SETTINGS = {
    "python.defaultInterpreterPath": "${workspaceFolder}/.venv/Scripts/python.exe",
    "python.envFile": "${workspaceFolder}/.env",
    "python.testing.unittestEnabled": True,
    "python.testing.unittestArgs": [],
    "python.testing.pytestEnabled": False,
    "python.testing.cwd": "${workspaceFolder}",
}


def main(target: pathlib.Path) -> int:
    existing = {}
    if target.exists() and target.read_text(encoding="utf-8-sig").strip():
        raw = target.read_text(encoding="utf-8-sig")
        # VS Code accepts // comments in settings.json; json.loads does not.
        raw = re.sub(r"^\s*//.*$", "", raw, flags=re.MULTILINE)
        try:
            existing = json.loads(raw)
        except json.JSONDecodeError as exc:
            print(f"  could not parse {target}: {exc}")
            print("  leaving it alone - add the keys by hand:")
            print(json.dumps(SETTINGS, indent=2))
            return 1

    existing.update(SETTINGS)
    target.write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")
    print(f"  wrote {target}")
    for key in SETTINGS:
        print(f"    {key}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(pathlib.Path(sys.argv[1])))
