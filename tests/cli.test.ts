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
});
