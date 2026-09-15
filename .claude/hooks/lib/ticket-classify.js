// Shared ticket-weight classification used by ticket-settings-check.js
// (UserPromptSubmit, "open ticket #N") and ticket-create-settings-suggest.js
// (PostToolUse, `gh issue create`). One heuristic, so the two can't disagree
// about what a given ticket is worth.
const { HEAVY, LIGHT } = require("./skill-weight.js");

// A handful of skill names (run, init, loop, sync, research) are also ordinary
// English words, so a bare word-boundary match false-positives on normal prose
// ("context processors run per request"). Require an explicit signal instead:
// a leading slash, backtick-quoting, or the word "skill" nearby.
function findSkillMention(text, skills) {
  for (const s of skills) {
    const re = new RegExp(`(?:[/\`]${s}\\b|\\b${s}\\b\\s+skill\\b|\\bskill[:\\s]+${s}\\b)`, "i");
    if (re.test(text)) return s;
  }
  return null;
}

function classifyTicket(issue) {
  const text = [issue.title, issue.body, ...(issue.comments || []).map((c) => c.body)]
    .filter(Boolean)
    .join("\n");
  const labels = (issue.labels || []).map((l) => l.name.toLowerCase());

  // A skill explicitly named in the ticket is a stronger signal than keyword
  // guessing — reuse the same heavy/light split skill-settings-check.js uses.
  const heavySkill = findSkillMention(text, HEAVY);
  if (heavySkill) return { weight: "heavy", why: `mentions the "${heavySkill}" skill` };
  const lightSkill = findSkillMention(text, LIGHT);
  if (lightSkill) return { weight: "light", why: `mentions the "${lightSkill}" skill` };

  const heavyRe = /\bschema\b|\bmigration\b|\badr\b|architectur|cross-cutting|\bredesign\b|\brewrite\b/i;
  // Covers both "hard to reproduce" debugging and performance/optimization work
  // (N+1 queries, recomputation, bottlenecks) — the usage doc's own example of
  // this category (#193, "nav recomputed 2-3x per request") is a perf ticket,
  // not a flaky-bug report, so the keyword list has to cover both.
  const hardDebugRe = /\bflaky\b|\bintermittent\b|non-reproduc|\bregression\b|\bdebugg?ing\b|\bbroken\b|\bperformance\b|\boptimi[sz]|\bslow(ness)?\b|\bn\+1\b|\bbottleneck\b|\brecomputed?\b/i;
  const lightRe = /\btypo\b|\bcopy change\b|\bsmall fix\b|\bdoc(s)?\b|\btweak\b|one[- ]liner/i;

  if (labels.includes("adr") || heavyRe.test(text)) {
    return { weight: "heavy", why: "architectural/schema/ADR language in the ticket" };
  }
  if (hardDebugRe.test(text)) {
    return { weight: "hard-debug", why: "debugging/performance language (flaky/broken/regression/optimization) in the ticket" };
  }
  if (lightRe.test(text)) {
    return { weight: "light", why: "trivial/routine language in the ticket" };
  }
  return { weight: "routine", why: null };
}

module.exports = { classifyTicket };
