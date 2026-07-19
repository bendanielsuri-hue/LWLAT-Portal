# Principles — Engineering

General engineering values that hold regardless of which project this is. Entries here are numbered plainly (`C1`, `T1`, ...) — from *outside* this file (code comments, other docs, ADRs), cite one with the `ENG-` prefix, e.g. `(ENG-C1)`. The prefix tells you which file to open; the bare code is what you search for once you're in it. `DES-`/`INT-` work the same way for `PRINCIPLES-DESIGN.md`/`PRINCIPLES-INTERACTION.md`. Categories are added as new principles surface — this list is not a fixed taxonomy.

## C — Code Clarity

- **C1.** Comment the why, not the what. Only write a comment when something would surprise a reader — a hidden constraint, a workaround, a non-obvious reason. If removing the comment wouldn't confuse anyone, don't write it.
- **C2.** Names should explain themselves. A variable, function, or model name should make its purpose clear without needing a comment to restate it.
- **C3.** To show or hide something with JavaScript, toggle the `hidden` attribute, not `display: none` set directly in code — otherwise you have to remember and restore the right display type (block, flex, grid...) yourself when showing it again.

## E — Error Handling

- **E1.** Only add error handling or validation at real boundaries — user input, external services. Trust your own internal code instead of guarding against things that can't happen.

## O — Operational Safety

- **O1.** Pause and confirm before anything hard to reverse or that reaches beyond your own local, in-progress work. Proceed freely on anything reversible and contained.
- **O2.** Never commit secrets or credentials. Check a file's actual contents, not just its filename, before staging anything that might contain them.
- **O3.** Log enough context that a problem can be diagnosed from the log alone, after the fact, without needing to reproduce it live.

## P — Process

- **P1.** Keep commits scoped to one coherent change. Don't sweep in unrelated edits just because they touch the same file.
- **P2.** Review your own diff before calling work done — read what actually changed, not just what you intended to change.
- **P3.** Avoid adding a new dependency for something simple enough to write directly. Every dependency is a future maintenance and security cost.
- **P4.** When nothing external depends on the old behavior, change the code directly instead of adding a compatibility shim or flag to support both at once.

## S — Structure & Scalability

- **S1.** Design the structure (data models, architecture) to grow to future cases without a rewrite, even when only one case exists today — but don't build features or options for cases that don't exist yet.
- **S2.** Wait for real repetition before extracting a shared helper or abstraction. A guessed abstraction is usually costlier to unwind than the duplication it was meant to avoid.

## T — Testing

- **T1.** Tests never run against real/live data — only a throwaway test database or fixture. A test must never be able to damage or leak real data.

## V — Values

- **V1.** Prefer a named token or constant over a hardcoded value, wherever one exists.
