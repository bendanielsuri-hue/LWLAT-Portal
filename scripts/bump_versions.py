"""Pre-commit hook body: patch-bumps VERSION in every app whose owned files
are staged in this commit (ADR 0011 per-app versioning). See #149/#150 for
the decision trail (grilled trigger/ownership/mechanics policy).

Ownership is by file path, not the URL-prefix table in
portal/context_processors.py (that table is footer-display routing only,
and doesn't cover core/). Longest-prefix-first so hubs/inclusion/panel/
matches before the shorter hubs/inclusion/ prefix.
"""
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(subprocess.check_output(
    ['git', 'rev-parse', '--show-toplevel'], text=True,
).strip())

APP_APPS_PY_BY_PREFIX = [
    ('hubs/inclusion/panel/', 'hubs/inclusion/panel/apps.py'),
    ('hubs/inclusion/', 'hubs/inclusion/apps.py'),
    ('hubs/careers/', 'hubs/careers/apps.py'),
    ('hubs/portaladmin/', 'hubs/portaladmin/apps.py'),
    ('hubs/registers/', 'hubs/registers/apps.py'),
    ('hubs/resources/', 'hubs/resources/apps.py'),
    ('hubs/services/', 'hubs/services/apps.py'),
    ('hubs/staff/', 'hubs/staff/apps.py'),
    ('hubs/student/', 'hubs/student/apps.py'),
    ('core/', 'core/apps.py'),
]

# Portal-wide files/dirs no single app owns - never trigger a bump.
SHARED_FILES = {
    'static/css/layout/layout.css',
    'static/css/style.css',
    'static/js/main.js',
    'templates/layout.html',
    'templates/hubs/_hub_sidebar.html',
}
SHARED_DIR_PREFIXES = (
    'templates/icons/',
    'mysite/',
    'portal/',
)

VERSION_RE = re.compile(r"^(\s*VERSION\s*=\s*['\"])(\d+)\.(\d+)\.(\d+)(['\"].*)$")


def staged_files():
    out = subprocess.check_output(
        ['git', 'diff', '--cached', '--name-only', '--diff-filter=ACMR'], text=True,
    )
    return [line for line in out.splitlines() if line]


def is_shared(path):
    if path in SHARED_FILES:
        return True
    return any(path.startswith(prefix) for prefix in SHARED_DIR_PREFIXES)


def owning_apps_py(path):
    for prefix, apps_py in APP_APPS_PY_BY_PREFIX:
        if path.startswith(prefix):
            return apps_py
    return None


def version_already_touched(apps_py):
    diff = subprocess.check_output(
        ['git', 'diff', '--cached', '--', apps_py], text=True,
    )
    return any(
        line.startswith(('+', '-')) and 'VERSION' in line
        for line in diff.splitlines()
        if not line.startswith(('+++', '---'))
    )


def bump_patch(apps_py):
    full_path = REPO_ROOT / apps_py
    lines = full_path.read_text(encoding='utf-8').splitlines(keepends=True)
    for i, line in enumerate(lines):
        m = VERSION_RE.match(line)
        if m:
            prefix, major, minor, patch, suffix = m.groups()
            lines[i] = f"{prefix}{major}.{minor}.{int(patch) + 1}{suffix}\n"
            full_path.write_text(''.join(lines), encoding='utf-8')
            return True
    return False


def main():
    touched_apps_py = set()
    for path in staged_files():
        if is_shared(path):
            continue
        apps_py = owning_apps_py(path)
        if apps_py:
            touched_apps_py.add(apps_py)

    bumped = []
    for apps_py in sorted(touched_apps_py):
        if version_already_touched(apps_py):
            continue
        if bump_patch(apps_py):
            subprocess.check_call(['git', 'add', apps_py])
            bumped.append(apps_py)

    if bumped:
        print(f"bump_versions: patch-bumped {', '.join(bumped)}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
