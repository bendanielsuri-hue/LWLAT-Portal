#!/usr/bin/env node
// PreToolUse hook (matcher: "Skill") — advisory-only heads-up when a skill's
// weight looks badly mismatched against the current model/effort. Never blocks;
// always exits 0. See docs/agents/claude-code-usage.md.
const fs = require("fs");
const path = require("path");

const HEAVY = new Set([
  "code-review", "security-review", "tdd", "domain-modeling",
  "diagnosing-bugs", "codebase-design", "research",
]);
const LIGHT = new Set([
  "sync", "suggest-version-bump", "keybindings-help", "grilling",
  "prototype", "scaffold-exercises", "setup-pre-commit", "wizard",
  "writing-for-agents", "claude-api", "run", "init", "loop",
  "migrate-to-shoehorn", "resolving-merge-conflicts", "dataviz",
  "fewer-permission-prompts", "simplify",
]);

function main() {
  let input = "";
  try {
    input = fs.readFileSync(0, "utf8");
  } catch {
    return; // no stdin, nothing to check
  }

  let skill;
  try {
    const payload = JSON.parse(input);
    skill = payload?.tool_input?.skill;
  } catch {
    return;
  }
  if (!skill) return;

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

  const isHaiku = model.includes("haiku");
  const isOpusOrFable = model.includes("opus") || model.includes("fable");
  const isLowEffort = effort === "low";
  const isTopEffort = effort === "xhigh" || effort === "max";

  // Targets match docs/agents/claude-code-usage.md's decision table: opus/high
  // is the floor for architectural/hard-debug (heavy) work, sonnet/medium is
  // the routine (light) default.
  let reason = null;
  if (HEAVY.has(skill) && (isHaiku || isLowEffort)) {
    reason = `"${skill}" is a heavy skill, but current settings are model=${model} effort=${effort}. Approve to continue anyway, or deny and run /model opus and /effort high (or higher) first.`;
  } else if (LIGHT.has(skill) && isOpusOrFable && isTopEffort) {
    reason = `"${skill}" is a light skill, but current settings are model=${model} effort=${effort} — likely more than it needs. Approve to continue anyway, or deny and run /model sonnet and /effort medium first.`;
  }

  if (reason) {
    // No disparity -> print nothing, tool proceeds under normal permissions.
    // A disparity -> route through the real allow/deny permission prompt
    // (there's no custom-dialog hook output; "ask" is the closest thing).
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: reason,
      },
    }) + "\n");
  }
}

try {
  main();
} catch {
  // never block the skill invocation over a hook bug
}
process.exit(0);
