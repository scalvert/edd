import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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

describe('edd init', () => {
  test('creates all expected files', async () => {
    const result = await runBin('init', '--cwd', project.baseDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatchInlineSnapshot(`
      "  created  edd.config.json
        created  tests/my-prompt/returns-greeting.json
        created  .gitignore"
    `);
  });

  test('generated config is valid JSON with correct structure', async () => {
    await runBin('init', '--cwd', project.baseDir);

    const config = JSON.parse(readFileSync(join(project.baseDir, 'edd.config.json'), 'utf8'));

    expect(config).toMatchInlineSnapshot(`
      {
        "defaults": {
          "concurrency": 5,
          "judgeModel": "claude-haiku-4-5-20251001",
          "model": "claude-haiku-4-5-20251001",
          "threshold": 0.7,
        },
        "prompts": {
          "my-prompt": {
            "prompt": "prompts/my-prompt.md",
            "tests": "tests/my-prompt/",
          },
        },
      }
    `);
  });

  test('example test file is valid JSON array with correct fields', async () => {
    await runBin('init', '--cwd', project.baseDir);

    const testCases = JSON.parse(
      readFileSync(join(project.baseDir, 'tests/my-prompt/returns-greeting.json'), 'utf8')
    );

    expect(testCases).toMatchInlineSnapshot(`
      [
        {
          "input": "Say hello",
          "name": "returns-greeting",
          "rubric": "Response contains a friendly greeting",
        },
      ]
    `);
  });

  test('skips existing files on second run', async () => {
    await runBin('init', '--cwd', project.baseDir);
    const second = await runBin('init', '--cwd', project.baseDir);

    expect(second.exitCode).toBe(0);
    expect(second.stdout).toMatchInlineSnapshot(`
      "  skipped  edd.config.json
        skipped  tests/my-prompt/returns-greeting.json
        skipped  .gitignore (.edd/ already listed)"
    `);
  });

  test('.gitignore appends .edd/ when missing, handles no trailing newline', async () => {
    await writeFile(join(project.baseDir, '.gitignore'), 'node_modules/');

    await runBin('init', '--cwd', project.baseDir);

    const content = readFileSync(join(project.baseDir, '.gitignore'), 'utf8');
    expect(content).toMatchInlineSnapshot(`
      "node_modules/
      .edd/
      "
    `);
  });

  test('.gitignore skips when .edd/ already present', async () => {
    await writeFile(join(project.baseDir, '.gitignore'), '.edd/\n');

    const result = await runBin('init', '--cwd', project.baseDir);

    expect(result.stdout).toContain('skipped  .gitignore');
    const content = readFileSync(join(project.baseDir, '.gitignore'), 'utf8');
    expect(content).toBe('.edd/\n');
  });

  test('--cwd controls where files are created', async () => {
    const subdir = join(project.baseDir, 'subproject');
    await mkdir(subdir, { recursive: true });

    await runBin('init', '--cwd', subdir);

    expect(existsSync(join(subdir, 'edd.config.json'))).toBe(true);
    expect(existsSync(join(project.baseDir, 'edd.config.json'))).toBe(false);
  });
});
