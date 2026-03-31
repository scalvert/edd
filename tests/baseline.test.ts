import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBintastic, type BintasticProject } from 'bintastic';
import type { RunResult } from '@scalvert/eval-core';
import { baseline } from '../src/commands/baseline.js';
import { saveLastRun, type PromptMetadata } from '../src/last-run.js';

const { setupProject, teardownProject } = createBintastic({
  binPath: new URL('../dist/cli.js', import.meta.url).pathname,
});

let project: BintasticProject;

beforeEach(async () => {
  project = await setupProject();
});

afterEach(() => {
  teardownProject();
  vi.restoreAllMocks();
});

const promptContent = 'You are a helpful assistant.';

function makeLastRun(overrides: Partial<RunResult> = {}): RunResult {
  return {
    runId: 'run-1',
    timestamp: '2026-01-01T00:00:00.000Z',
    passRate: 1.0,
    results: [
      {
        name: 'greeting',
        passed: true,
        score: 0.9,
        reasoning: 'Good',
        inputTokens: 10,
        outputTokens: 20,
        costUsd: 0.001,
        durationMs: 100,
      },
      {
        name: 'farewell',
        passed: true,
        score: 0.85,
        reasoning: 'Good',
        inputTokens: 10,
        outputTokens: 20,
        costUsd: 0.001,
        durationMs: 100,
      },
    ],
    totalInputTokens: 20,
    totalOutputTokens: 40,
    totalCostUsd: 0.002,
    ...overrides,
  };
}

async function setupBaselineProject(lastRun?: RunResult) {
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
      'test-prompt.md': promptContent,
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

  if (lastRun) {
    const metadata: PromptMetadata = {
      promptName: 'test-prompt',
      promptPath: 'prompts/test-prompt.md',
      promptHash: createHash('sha256').update(promptContent).digest('hex'),
    };
    await saveLastRun(lastRun, project.baseDir, metadata);
  }
}

describe('baseline', () => {
  test('throws when no last run exists', async () => {
    await setupBaselineProject();

    await expect(baseline({ cwd: project.baseDir })).rejects.toThrow(/No last run found/);
  });

  test('saves baseline with promptHash', async () => {
    await setupBaselineProject(makeLastRun());

    await baseline({ cwd: project.baseDir });

    const saved = JSON.parse(
      readFileSync(join(project.baseDir, 'baselines', 'test-prompt.json'), 'utf8')
    );

    const expectedHash = createHash('sha256').update(promptContent).digest('hex');
    expect(saved.promptHash).toBe(expectedHash);
    expect(saved.passRate).toBe(1.0);
    expect(saved.results).toHaveLength(2);
  });

  test('warns when pass rate is below threshold', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await setupBaselineProject(makeLastRun({ passRate: 0.5 }));

    await baseline({ cwd: project.baseDir });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Pass rate 0.500 is below threshold 0.70')
    );
  });

  test('warns when test suite has changed since the run', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lastRun = makeLastRun({
      results: [
        {
          name: 'old-test',
          passed: true,
          score: 0.9,
          reasoning: 'Good',
          inputTokens: 10,
          outputTokens: 20,
          costUsd: 0.001,
          durationMs: 100,
        },
      ],
    });
    await setupBaselineProject(lastRun);

    await baseline({ cwd: project.baseDir });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Test suite has changed'));
  });

  test('auto-selects single prompt without name argument', async () => {
    await setupBaselineProject(makeLastRun());

    await baseline({ cwd: project.baseDir });

    const saved = JSON.parse(
      readFileSync(join(project.baseDir, 'baselines', 'test-prompt.json'), 'utf8')
    );
    expect(saved.runId).toBe('run-1');
  });

  test('throws when prompt content changed since last run', async () => {
    await setupBaselineProject(makeLastRun());

    writeFileSync(
      join(project.baseDir, 'prompts', 'test-prompt.md'),
      'You are a DIFFERENT assistant now.'
    );

    await expect(baseline({ cwd: project.baseDir })).rejects.toThrow(
      /Prompt file has changed since the last run/
    );
  });

  test('baseline uses run-time hash when prompt is unchanged', async () => {
    await setupBaselineProject(makeLastRun());

    await baseline({ cwd: project.baseDir });

    const saved = JSON.parse(
      readFileSync(join(project.baseDir, 'baselines', 'test-prompt.json'), 'utf8')
    );
    const expectedHash = createHash('sha256').update(promptContent).digest('hex');
    expect(saved.promptHash).toBe(expectedHash);
    expect(saved.promptMetadata).toBeUndefined();
  });
});
