import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBintastic, type BintasticProject } from 'bintastic';
import { TestCaseSchema } from '@scalvert/eval-core';
import { z } from 'zod';
import { demo } from '../src/commands/demo.js';

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

describe('demo', () => {
  test('copies all demo files into project directory', async () => {
    await demo(project.baseDir);

    expect(existsSync(join(project.baseDir, 'edd.config.json'))).toBe(true);
    expect(existsSync(join(project.baseDir, 'prompts', 'customer-service.md'))).toBe(true);
    expect(existsSync(join(project.baseDir, 'tests', 'customer-service', 'cases.json'))).toBe(true);
  });

  test('skips files that already exist', async () => {
    await demo(project.baseDir);

    project.mergeFiles({ 'edd.config.json': '{"custom": true}' });
    await project.write();

    await demo(project.baseDir);

    const afterSecondRun = readFileSync(join(project.baseDir, 'edd.config.json'), 'utf8');
    expect(afterSecondRun).toBe('{"custom": true}');
  });

  test('demo test cases validate against TestCaseSchema', async () => {
    await demo(project.baseDir);

    const cases = JSON.parse(
      readFileSync(join(project.baseDir, 'tests', 'customer-service', 'cases.json'), 'utf8')
    );

    const parsed = z.array(TestCaseSchema).parse(cases);
    expect(parsed).toHaveLength(6);
  });

  test('demo config is valid JSON with correct structure', async () => {
    await demo(project.baseDir);

    const config = JSON.parse(readFileSync(join(project.baseDir, 'edd.config.json'), 'utf8'));

    expect(config.prompts['customer-service']).toBeDefined();
    expect(config.prompts['customer-service'].prompt).toBe('prompts/customer-service.md');
    expect(config.prompts['customer-service'].tests).toBe('tests/customer-service/');
  });
});
