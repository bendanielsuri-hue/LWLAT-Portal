// Shared skill-weight classification used by skill-settings-check.js (PreToolUse/Skill)
// and ticket-settings-check.js (UserPromptSubmit). Keep in one place so the two hooks
// can't drift on which skills count as heavy vs light.
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

module.exports = { HEAVY, LIGHT };
