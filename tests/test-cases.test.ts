import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBintastic, type BintasticProject } from 'bintastic';
import { loadTestCases } from '../src/commands/test-cases.js';

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

describe('loadTestCases', () => {
  test('loads valid test cases from a single file', async () => {
    project.mergeFiles({
      tests: {
        'cases.json': JSON.stringify([
          { name: 'test-1', input: 'Hello', rubric: 'Is a greeting' },
          { name: 'test-2', input: 'Goodbye', rubric: 'Is a farewell' },
        ]),
      },
    });
    await project.write();

    const cases = await loadTestCases(join(project.baseDir, 'tests'));

    expect(cases).toHaveLength(2);
    expect(cases[0]!.name).toBe('test-1');
    expect(cases[1]!.name).toBe('test-2');
  });

  test('loads and merges from multiple files', async () => {
    project.mergeFiles({
      tests: {
        'a.json': JSON.stringify([{ name: 'from-a', input: 'A', rubric: 'Is A' }]),
        'b.json': JSON.stringify([{ name: 'from-b', input: 'B', rubric: 'Is B' }]),
      },
    });
    await project.write();

    const cases = await loadTestCases(join(project.baseDir, 'tests'));

    expect(cases).toHaveLength(2);
    const names = cases.map((c) => c.name);
    expect(names).toContain('from-a');
    expect(names).toContain('from-b');
  });

  test('throws on missing tests directory', async () => {
    await expect(loadTestCases(join(project.baseDir, 'nonexistent'))).rejects.toThrow(
      /Tests directory not found/
    );
  });

  test('throws on empty tests directory', async () => {
    await mkdir(join(project.baseDir, 'tests'), { recursive: true });

    await expect(loadTestCases(join(project.baseDir, 'tests'))).rejects.toThrow(
      /No test files found/
    );
  });

  test('throws on invalid JSON', async () => {
    project.mergeFiles({ tests: { 'bad.json': '{ not valid }}}' } });
    await project.write();

    await expect(loadTestCases(join(project.baseDir, 'tests'))).rejects.toThrow(/Invalid JSON/);
  });

  test('throws on schema validation failure', async () => {
    project.mergeFiles({
      tests: {
        'bad.json': JSON.stringify([{ name: 'test', input: 'Hello' }]),
      },
    });
    await project.write();

    await expect(loadTestCases(join(project.baseDir, 'tests'))).rejects.toThrow(
      /Invalid test case/
    );
  });

  test('throws listing duplicates for duplicate test names', async () => {
    project.mergeFiles({
      tests: {
        'a.json': JSON.stringify([{ name: 'dupe', input: 'A', rubric: 'Is A' }]),
        'b.json': JSON.stringify([{ name: 'dupe', input: 'B', rubric: 'Is B' }]),
      },
    });
    await project.write();

    await expect(loadTestCases(join(project.baseDir, 'tests'))).rejects.toThrow(
      /Duplicate test case names: dupe/
    );
  });

  test('ignores non-JSON files', async () => {
    project.mergeFiles({
      tests: {
        'cases.json': JSON.stringify([{ name: 'test-1', input: 'Hello', rubric: 'Is a greeting' }]),
        'README.md': '# Tests',
      },
    });
    await project.write();

    const cases = await loadTestCases(join(project.baseDir, 'tests'));

    expect(cases).toHaveLength(1);
  });
});
