import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBintastic, type BintasticProject } from 'bintastic';

const { setupProject, teardownProject, runBin } = createBintastic({
  binPath: new URL('../dist/cli.js', import.meta.url).pathname,
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let project: BintasticProject;

beforeEach(async () => {
  project = await setupProject();
});

afterEach(() => {
  teardownProject();
});

describe('edd cli', () => {
  test('--help shows usage', async () => {
    const result = await runBin('--help');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Eval-Driven Development');
    expect(result.stdout).toContain('--cwd');
  });

  test('--version shows version', async () => {
    const result = await runBin('--version');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  test('--threshold rejects values outside 0-1', async () => {
    const result = await runBin('run', '--threshold', '1.5');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Threshold must be a number between 0 and 1');
  });

  test('--threshold rejects non-numeric values', async () => {
    const result = await runBin('run', '--threshold', 'abc');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Threshold must be a number between 0 and 1');
  });

  test('--concurrency rejects zero', async () => {
    const result = await runBin('run', '--concurrency', '0');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Concurrency must be a positive integer');
  });

  test('--iterations rejects negative values', async () => {
    const result = await runBin('run', '--iterations', '-1');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Iterations must be a positive integer');
  });
});
