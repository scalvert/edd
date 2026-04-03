import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBintastic, type BintasticProject } from 'bintastic';

const { setupProject, teardownProject, runBin } = createBintastic({
  binPath: new URL('../dist/cli.js', import.meta.url).pathname,
});

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

  test('--threshold accepts 0', async () => {
    const result = await runBin('run', '--threshold', '0', '--cwd', project.baseDir);

    expect(result.stderr).not.toContain('Threshold must be a number between 0 and 1');
  });

  test('--threshold accepts 1', async () => {
    const result = await runBin('run', '--threshold', '1', '--cwd', project.baseDir);

    expect(result.stderr).not.toContain('Threshold must be a number between 0 and 1');
  });

  test('run without config shows clear error', async () => {
    const result = await runBin('run', '--cwd', project.baseDir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No prompts configured');
  });

  test('baseline without prior run shows clear error', async () => {
    project.mergeFiles({
      'edd.config.json': JSON.stringify({
        prompts: {
          test: { prompt: 'prompts/test.md', tests: 'tests/test/' },
        },
      }),
    });
    await project.write();

    const result = await runBin('baseline', '--cwd', project.baseDir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No last run found');
  });

  test('run with missing prompt file shows clear error', async () => {
    project.mergeFiles({
      'edd.config.json': JSON.stringify({
        prompts: {
          test: { prompt: 'prompts/nonexistent.md', tests: 'tests/test/' },
        },
      }),
    });
    await project.write();

    const result = await runBin('run', '--cwd', project.baseDir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Prompt file not found');
  });

  test('run help shows all options', async () => {
    const result = await runBin('run', '--help');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--prompt');
    expect(result.stdout).toContain('--tests');
    expect(result.stdout).toContain('--baseline');
    expect(result.stdout).toContain('--threshold');
    expect(result.stdout).toContain('--concurrency');
    expect(result.stdout).toContain('--iterations');
    expect(result.stdout).toContain('--all');
    expect(result.stdout).toContain('--fail-on-regression');
  });
});
