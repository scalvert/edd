---
name: edd-run
description: 'Slash command: /edd-run — run evals and interpret results, explaining each failure in plain language.'
---

# /edd-run — Run Evals and Interpret Results

Run this when the user types `/edd-run` or asks you to run evals and explain the results.

## Step 1: Run evals

Run `npx @scalvert/edd run` (or `npx @scalvert/edd run <name>` if the user specified a prompt).

If the user asked to run all prompts, use `npx @scalvert/edd run --all`.

## Step 2: Parse the output

The output shows each test case with a ✓ (pass) or ✗ (fail), its score, and the overall pass rate. If a baseline exists, it also shows improvements and regressions.

## Step 3: Interpret and explain

For each **failing** test, explain in plain language:

1. **What the rubric required** — read the test case from the tests directory to get the rubric. Summarize the expected behavior in one sentence.
2. **What likely happened** — based on the score and the rubric, infer what the LLM probably did wrong. Low scores (< 0.3) usually mean the response directly violated the rubric. Mid-range scores (0.3-0.6) often mean partial compliance.
3. **Why it matters** — connect the failure to the prompt's purpose. "This test ensures the bot never reveals customer PII. A failure here means the prompt's privacy rules aren't strong enough for this type of request."

For **passing** tests, no explanation is needed unless the score is close to the threshold (within 0.1), in which case flag it as fragile.

## Step 4: Summarize

After explaining individual failures, give a high-level summary:

- Overall pass rate and how it compares to baseline (if one exists)
- Number of improvements and regressions
- Whether the prompt is ready for baseline promotion or needs fixes

Example summary:

> **4/6 passing (0.667)**, down from baseline 0.833 (-0.167). Two regressions: "refuses-pii-lookup" and "maintains-professional-tone". The privacy rule in the prompt may have been weakened by the recent edit to line 12. Consider running `/edd-fix` to diagnose and repair.

## Step 5: Suggest next steps

Based on the results, suggest one of:

- **All passing, no baseline**: "Run `npx @scalvert/edd baseline` to save this as the baseline."
- **All passing, matches or exceeds baseline**: "Results look good. Run `npx @scalvert/edd baseline` to update the baseline if you're satisfied."
- **Failures exist**: "Run `/edd-fix` to diagnose and fix the failing tests."
- **High variance** (if `--iterations` was used and σ is large): "Consider increasing iterations for more confidence, or tightening the prompt's instructions for the high-σ tests."

## Important

- Always read the actual rubric from the test file, don't guess what a test checks based on its name alone.
- Never save a baseline without asking the user.
- If the pass rate is below the configured threshold, explicitly flag this.
- When comparing to baseline, highlight regressions more prominently than improvements — regressions require action, improvements are good news.
