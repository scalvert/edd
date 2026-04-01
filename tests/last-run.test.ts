import { existsSync } from 'node:fs';
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
  test('creates .edd/last-run directory and writes prompt-scoped file', async () => {
    await saveLastRun(validRunResult, project.baseDir, 'my-prompt');

    expect(existsSync(join(project.baseDir, '.edd', 'last-run'))).toBe(true);
    expect(existsSync(join(project.baseDir, '.edd', 'last-run', 'my-prompt.json'))).toBe(true);
  });

  test('stores separate files per prompt', async () => {
    const alphaResult = { ...validRunResult, runId: 'alpha-run' };
    const betaResult = { ...validRunResult, runId: 'beta-run' };

    await saveLastRun(alphaResult, project.baseDir, 'alpha');
    await saveLastRun(betaResult, project.baseDir, 'beta');

    const loadedAlpha = await loadLastRun(project.baseDir, 'alpha');
    const loadedBeta = await loadLastRun(project.baseDir, 'beta');

    expect(loadedAlpha?.runId).toBe('alpha-run');
    expect(loadedBeta?.runId).toBe('beta-run');
  });
});

describe('loadLastRun', () => {
  test('round-trips data through save and load', async () => {
    await saveLastRun(validRunResult, project.baseDir, 'test-prompt');
    const loaded = await loadLastRun(project.baseDir, 'test-prompt');

    expect(loaded).toEqual(validRunResult);
  });

  test('returns null when file does not exist', async () => {
    const result = await loadLastRun(project.baseDir, 'nonexistent');

    expect(result).toBeNull();
  });

  test('throws on malformed JSON', async () => {
    project.mergeFiles({ '.edd': { 'last-run': { 'bad.json': '{ not valid json }}}' } } });
    await project.write();

    await expect(loadLastRun(project.baseDir, 'bad')).rejects.toThrow();
  });

  test('throws on invalid schema', async () => {
    project.mergeFiles({
      '.edd': { 'last-run': { 'bad.json': JSON.stringify({ runId: 123 }) } },
    });
    await project.write();

    await expect(loadLastRun(project.baseDir, 'bad')).rejects.toThrow();
  });
});
