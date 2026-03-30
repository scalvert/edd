import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBintastic, type BintasticProject } from 'bintastic';
import type { RunResult } from '@scalvert/eval-core';
import { saveLastRun, loadLastRun } from '../src/last-run.js';

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

const validRunResult: RunResult = {
  runId: 'test-run-1',
  timestamp: '2026-01-01T00:00:00.000Z',
  passRate: 0.8,
  results: [
    {
      name: 'test-1',
      passed: true,
      score: 0.9,
      reasoning: 'Good response',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
      durationMs: 500,
    },
  ],
  totalInputTokens: 100,
  totalOutputTokens: 50,
  totalCostUsd: 0.001,
};

describe('saveLastRun', () => {
  test('creates .edd directory and writes file', async () => {
    await saveLastRun(validRunResult, project.baseDir);

    expect(existsSync(join(project.baseDir, '.edd'))).toBe(true);
    expect(existsSync(join(project.baseDir, '.edd', 'last-run.json'))).toBe(true);
  });
});

describe('loadLastRun', () => {
  test('round-trips data through save and load', async () => {
    await saveLastRun(validRunResult, project.baseDir);
    const loaded = await loadLastRun(project.baseDir);

    expect(loaded).toEqual(validRunResult);
  });

  test('returns null when file does not exist', async () => {
    const result = await loadLastRun(project.baseDir);

    expect(result).toBeNull();
  });

  test('throws on malformed JSON', async () => {
    const dirPath = join(project.baseDir, '.edd');
    await mkdir(dirPath, { recursive: true });
    await writeFile(join(dirPath, 'last-run.json'), '{ not valid json }}}');

    await expect(loadLastRun(project.baseDir)).rejects.toThrow();
  });

  test('throws on invalid schema', async () => {
    const dirPath = join(project.baseDir, '.edd');
    await mkdir(dirPath, { recursive: true });
    await writeFile(join(dirPath, 'last-run.json'), JSON.stringify({ runId: 123 }));

    await expect(loadLastRun(project.baseDir)).rejects.toThrow();
  });
});
