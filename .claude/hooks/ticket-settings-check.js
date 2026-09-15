#!/usr/bin/env node
// UserPromptSubmit hook — advisory-only heads-up when the ticket the user is
// about to work on looks heavier/lighter than current model/effort. Never
// blocks; always exits 0. See docs/agents/claude-code-usage.md.
//
// Flow: a ticket reference anywhere in the prompt (trigger) -> fetch it via gh
// -> assess its weight (keywords, labels, and any skill named in its
// body/comments) -> if it looks mismatched against current model/effort,
// inject an advisory note for Claude to relay to the user.
//
// Deliberately not keyed to a fixed phrase ("open ticket", "do ticket", ...) —
// wording varies too much to pin down, and this hook is silent when nothing's
// mismatched, so a loose trigger costs nothing extra. It fires on either: the
// word "ticket"/"issue" near a number ("do ticket 214", "start on issue #214",
// "pick up 214" — any verb), or a bare "#214" on its own.
const NEAR_RE = /\b(?:ticket|issue)s?\b[^\d]{0,20}#?(\d+)\b|#?(\d+)\b[^\d]{0,20}\b(?:ticket|issue)s?\b/i;
const BARE_RE = /#(\d+)\b/;

function extractIssueNumber(prompt) {
  const m = NEAR_RE.exec(prompt);
  if (m) return m[1] || m[2];
  const b = BARE_RE.exec(prompt);
  if (b) return b[1];
  return null;
}

function fetchIssue(n) {
  const cmd = `gh issue view ${n} --json title,body,labels,comments`;
  const opts = { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "pipe"] };
  try {
    return JSON.parse(execSync(cmd, opts));
  } catch {
    // gh may not be on PATH yet in this shell — retry with the known install dir
    // (see docs/agents/issue-tracker.md).
    try {
      const env = Object.assign({}, process.env, {
        PATH: `${process.env.PATH};C:\\Program Files\\GitHub CLI`,
      });
      return JSON.parse(execSync(cmd, Object.assign({}, opts, { env })));
    } catch {
      return null;
    }
  }
}

function currentSettings() {
  let model = "sonnet";
  let effort = "high";
  try {
    const settingsPath = path.join(__dirname, "..", "settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    if (settings.model) model = String(settings.model).toLowerCase();
    if (settings.effortLevel) effort = String(settings.effortLevel).toLowerCase();
  } catch {
    // settings.json missing/unreadable — stick with defaults
  }
  return { model, effort };
}

function buildAdvisory(n, issue, verdict, model, effort) {
  const isHaiku = model.includes("haiku");
  const isOpusOrFable = model.includes("opus") || model.includes("fable");
  const isLowEffort = effort === "low" || effort === "medium";
  const isTopEffort = effort === "xhigh" || effort === "max";

  const needsHeavy = verdict.weight === "heavy" || verdict.weight === "hard-debug";
  if (needsHeavy && (isHaiku || isLowEffort)) {
    return (
      `Ticket #${n} ("${issue.title}") reads as ${verdict.weight}` +
      (verdict.why ? ` (${verdict.why})` : "") +
      `, but current settings are model=${model} effort=${effort}. ` +
      `Flag this to the user: recommend /model opus and /effort high (or higher) before starting, in one line — don't switch on your own.`
    );
  }
  if (verdict.weight === "light" && isOpusOrFable && isTopEffort) {
    return (
      `Ticket #${n} ("${issue.title}") reads as light` +
      (verdict.why ? ` (${verdict.why})` : "") +
      `, but current settings are model=${model} effort=${effort} — likely more than it needs. ` +
      `Flag this to the user: note that /model sonnet and /effort medium would likely suffice, without blocking or switching on your own.`
    );
  }
  return null;
}

function main() {
  let input = "";
  try {
    input = fs.readFileSync(0, "utf8");
  } catch {
    return;
  }

  let prompt;
  try {
    const payload = JSON.parse(input);
    prompt = payload?.prompt;
  } catch {
    return;
  }
  if (!prompt) return;

  const n = extractIssueNumber(prompt);
  if (!n) return;

  const issue = fetchIssue(n);
  if (!issue) return; // gh unavailable/not configured — stay silent, don't nag

  const verdict = classifyTicket(issue);
  const { model, effort } = currentSettings();
  const advisory = buildAdvisory(n, issue, verdict, model, effort);

  if (advisory) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: advisory,
        },
      }) + "\n"
    );
  }
}

try {
  main();
} catch {
  // never block the prompt over a hook bug
}
process.exit(0);
