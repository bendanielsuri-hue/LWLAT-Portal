"""Report what the AFK queue is actually doing, versus what it claims.

Advisory, not a gate, and not wired into anything - this is the check you run
when you want to know whether last night worked:

    .venv\\Scripts\\python.exe scripts\\afk_status.py

WHY THIS EXISTS AS A SCRIPT RATHER THAN A WORKFLOW

Every fault the AFK system produced on the evening of 2026-09-15 had the same
shape: it looked fine while doing nothing. The action refused a bot actor and
exited in 1.5 seconds, and the run went green. The outcome check matched a PR
that merely mentioned the issue number, so six tickets were marked
ready-for-review, had their labels stripped and left the queue having produced
nothing. The chain deadlocked and simply stopped. The schedule that exists to
recover from exactly that has never fired once, which produces no run at all -
not a red one, not a green one, nothing to look at.

That last case is why this is a script on your machine rather than another
workflow. A watchdog that runs on the schedule cannot report that the schedule
is dead, and a check that lives inside the system it audits goes quiet at the
same moment the system does. Something outside has to look. This is that thing,
and its only dependency is the `gh` CLI.

WHAT IT CHECKS

Three questions, in descending order of how badly you want to know:

  1. Do the labels agree with reality? A ticket marked ready-for-review with no
     branch of its own is the silent-success failure, and it is the one that
     costs you work rather than time - the grant was consumed and the ticket
     left the queue.
  2. Is the queue moving? Window open, eligible tickets waiting, nothing
     running and nothing finished recently means the chain is broken.
  3. Has the schedule ticked? Reported plainly because a dead scheduler is
     invisible everywhere else.

WHAT COUNTS AS THIS RUN'S OWN PR

A branch named `claude/issue-<n>`, which is what the workflow's prompt tells
each run to create, or a PR body saying it closes that issue. Deliberately the
same rule as afk-agent.yml's own outcome check - if the two ever disagree, one
of them is the bug, and having them written the same way twice is what makes
that visible. Matching a bare mention of the number is what shipped first and
is what marked six tickets done in one evening.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone

# Tickets are considered stalled if nothing has finished in this long while
# there is work to do. Generous on purpose: a real ticket can take twenty
# minutes, and a false alarm that cries stall during a long run teaches you to
# ignore it, which is the failure this whole script is about.
STALL_MINUTES = 30

# The labels afk-agent.yml and afk-queue.yml act on. Kept as constants so a
# rename shows up here as an obviously-wrong name rather than a quiet miss.
READY = "ready-for-agent"
APPROVED = "afk-approved"
BLOCKERS = ("needs-stronger-model", "needs-budget-approval")
REVIEW = "ready-for-review"
FAILED = "agent-failed"


def gh(*args: str) -> str:
    """Run a gh command and return stdout, or exit with its error.

    A failure here is almost always an unauthenticated or missing gh rather
    than anything about the queue, so it says so rather than producing a
    half-filled report that reads like a healthy system.
    """
    try:
        done = subprocess.run(
            ("gh",) + args, capture_output=True, text=True, check=True
        )
    except FileNotFoundError:
        sys.exit("gh CLI not found. This script is a thin wrapper around it.")
    except subprocess.CalledProcessError as exc:
        sys.exit(f"gh {' '.join(args)} failed:\n{exc.stderr.strip()}")
    return done.stdout


def gh_json(*args: str):
    return json.loads(gh(*args) or "[]")


def uk_now() -> datetime:
    """Local time in the window's terms.

    The window is defined in Europe/London and zoneinfo needs the tzdata
    package to know that on Windows, which this project does not depend on. The
    machine running this is the one the portal is developed on, so its local
    clock is already UK time; falling back to it keeps the script dependency
    free and is wrong only if you are reading this from another timezone, which
    the note in the output says.
    """
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo("Europe/London"))
    except Exception:
        return datetime.now().astimezone()


def window_is_open(now: datetime) -> bool:
    """The same predicate both workflows apply: overnight, 22:00 to 06:00,
    every day. Written out a third time here rather than imported because there
    is nothing to import from - it lives in shell inside two YAML files. If it
    moves, move all three."""
    return now.hour >= 22 or now.hour < 6


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def eligible(labels: set[str]) -> bool:
    """afk-queue.yml's selection predicate: ready, and either unblocked or
    explicitly approved."""
    if READY not in labels:
        return False
    return APPROVED in labels or not any(b in labels for b in BLOCKERS)


def main() -> int:
    repo = gh("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner").strip()
    now = uk_now()
    problems: list[str] = []

    # Every PR, open or closed, indexed by the branch it came from, plus the
    # set of issues each body claims to close. One fetch; both questions.
    prs = gh_json(
        "pr", "list", "--repo", repo, "--state", "all", "--limit", "100",
        "--json", "number,url,state,headRefName,body",
    )
    pr_by_branch = {pr["headRefName"]: pr for pr in prs}
    closes = re.compile(r"(?:clos\w*|fix\w*|resolv\w*)\s+#(\d+)", re.I)
    closed_by = {}
    for pr in prs:
        for num in closes.findall(pr.get("body") or ""):
            closed_by.setdefault(int(num), pr)

    def own_pr(issue: int):
        return pr_by_branch.get(f"claude/issue-{issue}") or closed_by.get(issue)

    # ---- 1. Do the labels agree with reality? -----------------------------
    issues = gh_json(
        "issue", "list", "--repo", repo, "--state", "open", "--limit", "200",
        "--json", "number,title,labels",
    )
    for issue in issues:
        labels = {lab["name"] for lab in issue["labels"]}
        num, title = issue["number"], issue["title"][:52]
        pr = own_pr(num)
        if REVIEW in labels and not pr:
            problems.append(
                f"#{num} is marked {REVIEW} but has no PR of its own - {title}"
            )
        if FAILED in labels and pr:
            problems.append(
                f"#{num} is marked {FAILED} but {pr['url']} exists - {title}"
            )

    queue = sorted(
        issue["number"]
        for issue in issues
        if eligible({lab["name"] for lab in issue["labels"]})
    )

    # ---- 2. Is the queue moving? ------------------------------------------
    runs = gh_json(
        "run", "list", "--repo", repo, "--workflow", "afk-agent.yml",
        "--limit", "30", "--json", "status,conclusion,updatedAt,event",
    )
    active = [r for r in runs if r["status"] not in ("completed",)]
    finished = [r for r in runs if r["status"] == "completed"]
    last_finished = parse_ts(finished[0]["updatedAt"]) if finished else None
    idle_for = (
        datetime.now(timezone.utc) - last_finished if last_finished else None
    )

    open_now = window_is_open(now)
    if open_now and queue and not active:
        if idle_for is None or idle_for > timedelta(minutes=STALL_MINUTES):
            mins = "never" if idle_for is None else f"{int(idle_for.total_seconds() // 60)}m ago"
            problems.append(
                f"Queue looks stalled: window open, {len(queue)} eligible, "
                f"nothing running, last run finished {mins}. "
                f"Restart with: gh workflow run afk-queue.yml --ref main"
            )

    # ---- 3. Is the clock still running? -----------------------------------
    #
    # GitHub's scheduler does not fire in this repository, so the clock is
    # afk-heartbeat.yml: a job that sleeps, pokes the queue, and relaunches
    # itself. Its weakness is that one missed hand-off ends it for good, and
    # a dead heartbeat looks exactly like a quiet night. This is the check
    # that tells the two apart.
    beats = gh_json(
        "run", "list", "--repo", repo, "--workflow", "afk-heartbeat.yml",
        "--limit", "5", "--json", "status,conclusion,createdAt",
    )
    alive = [b for b in beats if b["status"] != "completed"]
    if not alive:
        problems.append(
            "The heartbeat is not running, so no night will start by itself. "
            "Restart it with: gh workflow run afk-heartbeat.yml --ref main"
        )

    # GitHub's own scheduler has never fired here, and schedule-canary.yml
    # is an hourly attempt left running to notice if it ever starts. Finding
    # a tick is good news rather than a fault, but it still belongs in the
    # problem list: it is the signal to delete the heartbeat that replaced
    # it, and good news nobody notices is how the heartbeat ends up running
    # for years after it stopped being needed.
    all_runs = gh_json(
        "run", "list", "--repo", repo, "--limit", "100",
        "--json", "event,name,createdAt",
    )
    ticks = [r for r in all_runs if r["event"] == "schedule"]
    if ticks:
        problems.append(
            f"GitHub's scheduler has fired {len(ticks)} time(s), most recently "
            f"{ticks[0]['createdAt'][:16].replace('T', ' ')}Z. It appears to be "
            "working again — afk-heartbeat.yml can probably be deleted, and "
            "afk-queue.yml's own schedule takes over."
        )

    # ---- Report -----------------------------------------------------------
    print(f"AFK status for {repo} at {now:%Y-%m-%d %H:%M %Z}")
    print(f"  Window:    {'OPEN' if open_now else 'closed'}")
    print(f"  Running:   {len(active)}")
    if last_finished:
        print(f"  Last run:  {int(idle_for.total_seconds() // 60)}m ago "
              f"({finished[0]['conclusion']})")
    else:
        print("  Last run:  none in recent history")
    print(f"  Heartbeat: {'alive' if alive else 'NOT RUNNING'}")
    print(f"  Scheduled ticks seen: {len(ticks)} "
          f"(GitHub's own scheduler; 0 is expected here)")
    print(f"  Eligible queue ({len(queue)}): "
          + (", ".join(f"#{n}" for n in queue) if queue else "empty"))

    delivered = [
        (issue["number"], own_pr(issue["number"]))
        for issue in issues
        if own_pr(issue["number"])
    ]
    if delivered:
        print("  Delivered:")
        for num, pr in sorted(delivered):
            print(f"    #{num} -> {pr['url']} ({pr['state'].lower()})")

    if problems:
        print(f"\n{len(problems)} problem(s):")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("\nNothing wrong found.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
