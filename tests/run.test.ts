import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBintastic, type BintasticProject } from 'bintastic';
import type { ResponseFn, JudgeFn, RunResult } from '@scalvert/eval-core';
import { saveBaseline } from '@scalvert/eval-core';
import { run } from '../src/commands/run.js';

const { setupProject, teardownProject } = createBintastic({
  binPath: new URL('../dist/cli.js', import.meta.url).pathname,
});

let project: BintasticProject;

beforeEach(async () => {
  project = await setupProject();
});

afterEach(() => {
  teardownProject();
});

function fakeRespond(): ResponseFn {
  return async () => ({
    response: 'Hello! How can I help you today?',
    inputTokens: 10,
    outputTokens: 20,
  });
}

function fakeJudge(scoreMap?: Record<string, number>): JudgeFn {
  return async ({ input }) => {
    const score = scoreMap?.[input] ?? 0.9;
    return {
      passed: score >= 0.7,
      score,
      reasoning: score >= 0.7 ? 'Good response' : 'Poor response',
      inputTokens: 5,
      outputTokens: 10,
    };
  };
}

async function setupTestProject(options?: { baseline?: RunResult }) {
  const config = {
    defaults: {
      model: 'claude-haiku-4-5-20251001',
      judgeModel: 'claude-haiku-4-5-20251001',
      threshold: 0.7,
      concurrency: 2,
    },
    prompts: {
      'test-prompt': {
        prompt: 'prompts/test-prompt.md',
        tests: 'tests/test-prompt/',
      },
    },
  };

  project.mergeFiles({
    'edd.config.json': JSON.stringify(config),
    prompts: {
      'test-prompt.md': 'You are a helpful assistant.',
    },
    tests: {
      'test-prompt': {
        'cases.json': JSON.stringify([
          { name: 'greeting', input: 'Say hello', rubric: 'Contains a greeting' },
          { name: 'farewell', input: 'Say goodbye', rubric: 'Contains a farewell' },
        ]),
      },
    },
  });
  await project.write();

  if (options?.baseline) {
    await saveBaseline(options.baseline, join(project.baseDir, 'baselines', 'test-prompt.json'));
  }
}

describe('run', () => {
  test('runs eval with injected respond/judge', async () => {
    await setupTestProject();

    const outcomes = await run({
      cwd: project.baseDir,
      respond: fakeRespond(),
      judge: fakeJudge(),
    });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.result.results).toHaveLength(2);
    expect(outcomes[0]!.result.passRate).toBe(1);
    expect(outcomes[0]!.promptName).toBe('test-prompt');
  });

  test('saves last-run.json after execution', async () => {
    await setupTestProject();

    await run({
      cwd: project.baseDir,
      respond: fakeRespond(),
      judge: fakeJudge(),
    });

    expect(existsSync(join(project.baseDir, '.edd', 'last-run', 'test-prompt.json'))).toBe(true);
  });

  test('compares against baseline when it exists', async () => {
    const baseline: RunResult = {
      runId: 'baseline-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      passRate: 0.5,
      results: [
        {
          name: 'greeting',
          passed: true,
          score: 0.9,
          reasoning: 'OK',
          inputTokens: 10,
          outputTokens: 20,
          costUsd: 0.001,
          durationMs: 100,
        },
        {
          name: 'farewell',
          passed: false,
          score: 0.3,
          reasoning: 'Bad',
          inputTokens: 10,
          outputTokens: 20,
          costUsd: 0.001,
          durationMs: 100,
        },
      ],
      totalInputTokens: 20,
      totalOutputTokens: 40,
      totalCostUsd: 0.002,
    };

    await setupTestProject({ baseline });

    const outcomes = await run({
      cwd: project.baseDir,
      respond: fakeRespond(),
      judge: fakeJudge(),
    });

    expect(outcomes[0]!.comparison).toBeDefined();
    expect(outcomes[0]!.comparison!.passRateDelta).toBe(0.5);
    expect(outcomes[0]!.comparison!.improvements).toContain('farewell');
  });

  test('returns no comparison when no baseline exists', async () => {
    await setupTestProject();

    const outcomes = await run({
      cwd: project.baseDir,
      respond: fakeRespond(),
      judge: fakeJudge(),
    });

    expect(outcomes[0]!.comparison).toBeUndefined();
  });

  test('throws clear error for missing prompt file', async () => {
    const config = {
      prompts: {
        missing: {
          prompt: 'prompts/nonexistent.md',
          tests: 'tests/missing/',
        },
      },
    };
    project.mergeFiles({
      'edd.config.json': JSON.stringify(config),
    });
    await project.write();

    await expect(
      run({ cwd: project.baseDir, respond: fakeRespond(), judge: fakeJudge() })
    ).rejects.toThrow(/Prompt file not found/);
  });

  test('throws clear error for missing API key without DI', async () => {
    await setupTestProject();
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      await expect(run({ cwd: project.baseDir })).rejects.toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  test('--fail-on-regression throws when regressions exist', async () => {
    const baseline: RunResult = {
      runId: 'baseline-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      passRate: 1.0,
      results: [
        {
          name: 'greeting',
          passed: true,
          score: 0.9,
          reasoning: 'OK',
          inputTokens: 10,
          outputTokens: 20,
          costUsd: 0.001,
          durationMs: 100,
        },
        {
          name: 'farewell',
          passed: true,
          score: 0.9,
          reasoning: 'OK',
          inputTokens: 10,
          outputTokens: 20,
          costUsd: 0.001,
          durationMs: 100,
        },
      ],
      totalInputTokens: 20,
      totalOutputTokens: 40,
      totalCostUsd: 0.002,
    };

    await setupTestProject({ baseline });

    await expect(
      run({
        cwd: project.baseDir,
        respond: fakeRespond(),
        judge: fakeJudge({ 'Say goodbye': 0.3 }),
        flags: { failOnRegression: true },
      })
    ).rejects.toThrow(/regression/);
  });

  test('--all runs multiple prompts', async () => {
    const config = {
      prompts: {
        alpha: {
          prompt: 'prompts/alpha.md',
          tests: 'tests/alpha/',
        },
        beta: {
          prompt: 'prompts/beta.md',
          tests: 'tests/beta/',
        },
      },
    };

    project.mergeFiles({
      'edd.config.json': JSON.stringify(config),
      prompts: {
        'alpha.md': 'You are alpha.',
        'beta.md': 'You are beta.',
      },
      tests: {
        alpha: {
          'cases.json': JSON.stringify([
            { name: 'a-test', input: 'Hello', rubric: 'Is a greeting' },
          ]),
        },
        beta: {
          'cases.json': JSON.stringify([
            { name: 'b-test', input: 'Goodbye', rubric: 'Is a farewell' },
          ]),
        },
      },
    });
    await project.write();

    const outcomes = await run({
      cwd: project.baseDir,
      respond: fakeRespond(),
      judge: fakeJudge(),
      flags: { all: true },
    });

    expect(outcomes).toHaveLength(2);
    const names = outcomes.map((o) => o.promptName);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
  });

  test('--iterations aggregates multiple runs with mean and σ', async () => {
    await setupTestProject();

    let callCount = 0;
    const varyingJudge: JudgeFn = async () => {
      const scores = [0.8, 0.9, 1.0];
      const score = scores[callCount % scores.length]!;
      callCount++;
      return {
        passed: score >= 0.7,
        score,
        reasoning: 'OK',
        inputTokens: 5,
        outputTokens: 10,
      };
    };

    const outcomes = await run({
      cwd: project.baseDir,
      respond: fakeRespond(),
      judge: varyingJudge,
      flags: { iterations: 3 },
    });

    const result = outcomes[0]!.result;
    expect(result.results).toHaveLength(2);

    for (const r of result.results) {
      const extra = r as unknown as Record<string, unknown>;
      expect(extra.iterations).toBe(3);
      expect(typeof extra.σ).toBe('number');
      expect(extra.σ).toBeGreaterThanOrEqual(0);
    }

    expect(result.passRate).toBe(1);
  });

  test('--prompt/--tests/--baseline override configured paths', async () => {
    const config = {
      prompts: {
        'test-prompt': {
          prompt: 'prompts/test-prompt.md',
          tests: 'tests/test-prompt/',
        },
      },
    };

    project.mergeFiles({
      'edd.config.json': JSON.stringify(config),
      'custom-prompts': {
        'alt.md': 'You are an alternative assistant.',
      },
      'custom-tests': {
        'cases.json': JSON.stringify([
          { name: 'custom-case', input: 'Hello', rubric: 'Contains a greeting' },
        ]),
      },
    });
    await project.write();

    const outcomes = await run({
      cwd: project.baseDir,
      respond: fakeRespond(),
      judge: fakeJudge(),
      flags: {
        prompt: 'custom-prompts/alt.md',
        tests: 'custom-tests/',
      },
    });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.result.results).toHaveLength(1);
    expect(outcomes[0]!.result.results[0]!.name).toBe('custom-case');
  });

  test('--all with --fail-on-regression throws on regressions', async () => {
    const config = {
      prompts: {
        alpha: { prompt: 'prompts/alpha.md', tests: 'tests/alpha/' },
        beta: { prompt: 'prompts/beta.md', tests: 'tests/beta/' },
      },
    };

    project.mergeFiles({
      'edd.config.json': JSON.stringify(config),
      prompts: {
        'alpha.md': 'You are alpha.',
        'beta.md': 'You are beta.',
      },
      tests: {
        alpha: {
          'cases.json': JSON.stringify([
            { name: 'a-test', input: 'Hello', rubric: 'Is a greeting' },
          ]),
        },
        beta: {
          'cases.json': JSON.stringify([
            { name: 'b-test', input: 'Goodbye', rubric: 'Is a farewell' },
          ]),
        },
      },
    });
    await project.write();

    await saveBaseline(
      {
        runId: 'baseline-1',
        timestamp: '2026-01-01T00:00:00.000Z',
        passRate: 1.0,
        results: [
          {
            name: 'b-test',
            passed: true,
            score: 0.9,
            reasoning: 'OK',
            inputTokens: 10,
            outputTokens: 20,
            costUsd: 0.001,
            durationMs: 100,
          },
        ],
        totalInputTokens: 10,
        totalOutputTokens: 20,
        totalCostUsd: 0.001,
      },
      join(project.baseDir, 'baselines', 'beta.json')
    );

    await expect(
      run({
        cwd: project.baseDir,
        respond: fakeRespond(),
        judge: fakeJudge({ Goodbye: 0.3 }),
        flags: { all: true, failOnRegression: true },
      })
    ).rejects.toThrow(/regression/);
  });

  test('--all with --fail-on-regression does not throw when no regressions', async () => {
    const config = {
      prompts: {
        alpha: { prompt: 'prompts/alpha.md', tests: 'tests/alpha/' },
      },
    };

    project.mergeFiles({
      'edd.config.json': JSON.stringify(config),
      prompts: { 'alpha.md': 'You are alpha.' },
      tests: {
        alpha: {
          'cases.json': JSON.stringify([
            { name: 'a-test', input: 'Hello', rubric: 'Is a greeting' },
          ]),
        },
      },
    });
    await project.write();

    await expect(
      run({
        cwd: project.baseDir,
        respond: fakeRespond(),
        judge: fakeJudge(),
        flags: { all: true, failOnRegression: true },
      })
    ).resolves.not.toThrow();
  });

  test('--all saves per-prompt last-run files', async () => {
    const config = {
      prompts: {
        alpha: { prompt: 'prompts/alpha.md', tests: 'tests/alpha/' },
        beta: { prompt: 'prompts/beta.md', tests: 'tests/beta/' },
      },
    };

    project.mergeFiles({
      'edd.config.json': JSON.stringify(config),
      prompts: {
        'alpha.md': 'You are alpha.',
        'beta.md': 'You are beta.',
      },
      tests: {
        alpha: {
          'cases.json': JSON.stringify([
            { name: 'a-test', input: 'Hello', rubric: 'Is a greeting' },
          ]),
        },
        beta: {
          'cases.json': JSON.stringify([
            { name: 'b-test', input: 'Goodbye', rubric: 'Is a farewell' },
          ]),
        },
      },
    });
    await project.write();

    await run({
      cwd: project.baseDir,
      respond: fakeRespond(),
      judge: fakeJudge(),
      flags: { all: true },
    });

    expect(existsSync(join(project.baseDir, '.edd', 'last-run', 'alpha.json'))).toBe(true);
    expect(existsSync(join(project.baseDir, '.edd', 'last-run', 'beta.json'))).toBe(true);
  });

  test('--all rejects --prompt, --tests, and --baseline flags', async () => {
    await setupTestProject();

    await expect(
      run({
        cwd: project.baseDir,
        respond: fakeRespond(),
        judge: fakeJudge(),
        flags: { all: true, prompt: 'some-prompt.md' },
      })
    ).rejects.toThrow(/Cannot use --prompt, --tests, or --baseline with --all/);
  });

  test('iterations=1 produces no σ or iterations fields', async () => {
    await setupTestProject();

    const outcomes = await run({
      cwd: project.baseDir,
      respond: fakeRespond(),
      judge: fakeJudge(),
      flags: { iterations: 1 },
    });

    const r = outcomes[0]!.result.results[0]!;
    const extra = r as unknown as Record<string, unknown>;
    expect('σ' in extra).toBe(false);
    expect('iterations' in extra).toBe(false);
  });
});
