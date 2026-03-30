import { describe, test, expect } from 'vitest';
import { formatResults, type RunOutcome } from '../src/commands/formatting.js';
import type { RunResult, CompareResult } from '@scalvert/eval-core';

function makeResult(overrides: Partial<RunResult> = {}): RunResult {
  return {
    runId: 'run-1',
    timestamp: '2026-01-01T00:00:00.000Z',
    passRate: 0.833,
    results: [
      {
        name: 'refuses PII requests',
        passed: true,
        score: 0.95,
        reasoning: 'Good',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.001,
        durationMs: 500,
      },
      {
        name: 'stays in english',
        passed: true,
        score: 0.92,
        reasoning: 'Good',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.001,
        durationMs: 500,
      },
      {
        name: 'friendly tone',
        passed: false,
        score: 0.31,
        reasoning: 'Too formal',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.001,
        durationMs: 500,
      },
    ],
    totalInputTokens: 1234,
    totalOutputTokens: 567,
    totalCostUsd: 0.0089,
    ...overrides,
  };
}

function makeOutcome(overrides: Partial<RunOutcome> = {}): RunOutcome {
  return {
    result: makeResult(),
    promptName: 'customer-service',
    promptFile: 'prompts/customer-service.md',
    ...overrides,
  };
}

describe('formatResults', () => {
  test('formats passing and failing test lines', () => {
    const output = formatResults(makeOutcome(), 0.7);

    expect(output).toMatchInlineSnapshot(`
      "Running 3 test cases against prompts/customer-service.md...
        ✓ refuses PII requests          (score: 0.95)
        ✓ stays in english              (score: 0.92)
        ✗ friendly tone                 (score: 0.31, threshold: 0.70)
        ──────────────────────────────
        2/3 passing · pass rate: 0.833

        API usage: 1,234 input · 567 output · ~$0.0089"
    `);
  });

  test('formats baseline comparison with improvements and regressions', () => {
    const comparison: CompareResult = {
      passRateDelta: 0.167,
      improvements: ['handles ambiguous queries'],
      regressions: ['friendly tone'],
    };

    const output = formatResults(makeOutcome({ comparison }), 0.7);

    expect(output).toMatchInlineSnapshot(`
      "Running 3 test cases against prompts/customer-service.md...
        ✓ refuses PII requests          (score: 0.95)
        ✓ stays in english              (score: 0.92)
        ✗ friendly tone                 (score: 0.31, threshold: 0.70)
        ──────────────────────────────
        2/3 passing · pass rate: 0.833

        Baseline: 0.666 → 0.833 (+0.167)
        1 improvement: "handles ambiguous queries"
        1 regression:  "friendly tone"

        API usage: 1,234 input · 567 output · ~$0.0089"
    `);
  });

  test('omits baseline section when no comparison', () => {
    const output = formatResults(makeOutcome(), 0.7);

    expect(output).not.toContain('Baseline');
    expect(output).not.toContain('regression');
    expect(output).not.toContain('improvement');
  });

  test('formats API usage with commas and dollar cost', () => {
    const output = formatResults(makeOutcome(), 0.7);

    expect(output).toContain('1,234 input');
    expect(output).toContain('567 output');
    expect(output).toContain('~$0.0089');
  });

  test('pluralizes improvements and regressions', () => {
    const comparison: CompareResult = {
      passRateDelta: 0.2,
      improvements: ['a', 'b'],
      regressions: ['c', 'd', 'e'],
    };

    const output = formatResults(makeOutcome({ comparison }), 0.7);

    expect(output).toContain('2 improvements:');
    expect(output).toContain('3 regressions:');
  });
});
