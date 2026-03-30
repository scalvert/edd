---
name: edd
description: Autonomous eval-driven development loop — run evals, diagnose failures, fix prompts, and manage baselines for prompt regression testing with edd.
---

# Eval-Driven Development with edd

You are working in a project that uses **edd** (Eval-Driven Development) for prompt regression testing. edd evaluates prompts against test cases using an LLM judge and tracks pass rates over time via baselines.

## Core concepts

- **Prompt**: A system prompt file (markdown) that defines LLM behavior.
- **Test case**: An `{ name, input, rubric }` object. The rubric is what the LLM judge evaluates against — it describes the _specific expected behavior_, not just "be helpful."
- **Baseline**: A saved run result (`baselines/<name>.json`) committed to git. Future runs compare against it to detect regressions and improvements.
- **Last run**: The most recent eval result (`.edd/last-run.json`), gitignored. Promoted to baseline with `npx @scalvert/edd baseline`.

## How to think about prompt-behavior relationships

When a test fails, the root cause is almost always one of:

1. **Missing constraint** — the prompt doesn't mention the behavior the rubric requires.
2. **Conflicting instructions** — two rules in the prompt contradict each other for this input.
3. **Ambiguous language** — the prompt says something like "be helpful" but the rubric requires a specific refusal.
4. **Scope gap** — the prompt covers the general case but not the edge case in the test input.

Always read the rubric, the prompt, AND the test input together before proposing a fix. A score below threshold doesn't mean "the prompt is bad" — it means the prompt's instructions didn't produce the behavior the rubric describes for that specific input.

## The eval loop

1. **Run evals**: `npx @scalvert/edd run [name]` to evaluate. Use `--fail-on-regression` in CI.
2. **Interpret results**: Read failures carefully. The score reflects rubric adherence, not general quality.
3. **Fix the prompt**: Make targeted edits. Change only what's needed for failing tests.
4. **Re-run**: Verify the fix worked AND didn't break passing tests.
5. **Save baseline**: `npx @scalvert/edd baseline [name]` to promote the last run. This file gets committed to git.

## When to ask the user

- **Before overwriting a baseline** — always confirm. Baselines are committed to git and represent accepted behavior.
- **Before modifying test cases** — rubrics define the contract. Changing them changes what "correct" means.
- **When a fix creates new failures** — after 2-3 fix attempts, ask rather than continuing to iterate.
- **When the pass rate is below threshold** — the user may want to accept it or adjust the threshold.

## When to proceed autonomously

- Running `npx @scalvert/edd run` to evaluate current state.
- Reading prompt files, test cases, and baselines to diagnose failures.
- Making targeted prompt edits to fix specific failing tests.
- Re-running after a fix to verify.

## Configuration

The project config lives in `edd.config.json`. See `references/commands.md` for the full CLI reference when you need flag details.

## Key files

- `edd.config.json` — prompt and test path mappings, model defaults
- `prompts/<name>.md` — system prompt files
- `tests/<name>/<category>.json` — test case arrays `[{ name, input, rubric }]`
- `baselines/<name>.json` — committed baseline results
- `.edd/last-run.json` — most recent run (gitignored)
