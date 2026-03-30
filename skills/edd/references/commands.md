# edd CLI Reference

## Commands

### `npx @scalvert/edd init`

Initialize a new edd project. Creates `edd.config.json`, sample test directory, and adds `.edd/` to `.gitignore`.

### `npx @scalvert/edd demo`

Copy sample prompt and test cases into the current directory. Includes a customer service bot prompt with 6 test cases covering refusals, tone, language, and scope.

### `npx @scalvert/edd run [name]`

Run evals against a prompt. If only one prompt is configured, the name argument is optional.

**Flags:**

- `--prompt <path>` — override the prompt file path
- `--tests <path>` — override the tests directory
- `--baseline <path>` — override the baseline file path
- `--threshold <n>` — score threshold (default: 0.7). Tests scoring below this fail.
- `--concurrency <n>` — max concurrent eval requests (default: 5)
- `--iterations <n>` — run evals N times and aggregate with mean/σ for statistical confidence
- `--fail-on-regression` — exit with code 1 if any regressions are detected vs baseline
- `--all` — run all configured prompts

**Output format:**

```
Running 6 test cases against prompts/customer-service.md...
  ✓ refuses-pii-lookup         (score: 0.95)
  ✗ friendly-tone              (score: 0.31, threshold: 0.70)
  ──────────────────────────────
  5/6 passing · pass rate: 0.833

  Baseline: 0.667 → 0.833 (+0.167)
  1 improvement: "handles-ambiguous-queries"
  1 regression:  "friendly-tone"

  API usage: 1,234 input · 567 output · ~$0.0089
```

With `--iterations 3`:

```
Running 6 test cases × 3 iterations against prompts/customer-service.md...
  ✓ refuses-pii-lookup         (mean: 0.95, σ: 0.02, n=3)
  ✗ friendly-tone              (mean: 0.31, σ: 0.17, n=3, threshold: 0.70)
```

### `npx @scalvert/edd baseline [name]`

Promote the last run to baseline. Computes a SHA-256 hash of the current prompt and stores it in the baseline file.

**Warnings:**

- If pass rate is below threshold
- If test suite has changed since the last run

**The baseline file is committed to git.** Always confirm with the user before overwriting an existing baseline.

## Configuration (`edd.config.json`)

```json
{
  "defaults": {
    "model": "claude-haiku-4-5-20251001",
    "judgeModel": "claude-haiku-4-5-20251001",
    "threshold": 0.7,
    "concurrency": 5
  },
  "prompts": {
    "customer-service": {
      "prompt": "prompts/customer-service.md",
      "tests": "tests/customer-service/"
    }
  }
}
```

Baseline path defaults to `baselines/<prompt-name>.json` if not specified.

## Test case format

Each JSON file in the tests directory contains an array:

```json
[
  {
    "name": "unique-test-name",
    "input": "The user message to send to the prompt",
    "rubric": "Specific behavioral criteria the LLM judge evaluates against"
  }
]
```

Rubrics should be specific and behavioral, not vague. Instead of "should be helpful," write "Must politely decline and not reveal any personal information about the user."

## Environment

Requires `ANTHROPIC_API_KEY` environment variable for running evals.
