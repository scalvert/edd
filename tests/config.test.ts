import { resolve } from 'node:path';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBintastic, type BintasticProject } from 'bintastic';
import { loadConfig } from '../src/config.js';

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

async function writeConfig(config: Record<string, unknown>) {
  project.mergeFiles({ 'edd.config.json': JSON.stringify(config) });
  await project.write();
}

describe('loadConfig', () => {
  describe('defaults cascade', () => {
    test('uses hardcoded defaults when no config file exists', () => {
      const result = loadConfig({ cwd: project.baseDir });

      expect(result.defaults).toEqual({
        model: 'claude-haiku-4-5-20251001',
        judgeModel: 'claude-haiku-4-5-20251001',
        threshold: 0.7,
        concurrency: 5,
      });
      expect(result.prompt).toBeUndefined();
    });

    test('config values override hardcoded defaults', async () => {
      await writeConfig({
        defaults: { model: 'claude-sonnet-4-6' },
      });

      const result = loadConfig({ cwd: project.baseDir });

      expect(result.defaults.model).toBe('claude-sonnet-4-6');
      expect(result.defaults.threshold).toBe(0.7);
    });

    test('CLI flags override config values', async () => {
      await writeConfig({
        defaults: { model: 'config-model' },
      });

      const result = loadConfig({
        cwd: project.baseDir,
        flags: { model: 'flag-model' },
      });

      expect(result.defaults.model).toBe('flag-model');
    });
  });

  describe('prompt resolution', () => {
    test('auto-selects single prompt when no name given', async () => {
      await writeConfig({
        prompts: {
          'my-prompt': {
            prompt: 'prompts/my-prompt.md',
            tests: 'tests/my-prompt/',
          },
        },
      });

      const result = loadConfig({ cwd: project.baseDir });

      expect(result.prompt?.name).toBe('my-prompt');
    });

    test('throws listing names when multiple prompts and no name given', async () => {
      await writeConfig({
        prompts: {
          alpha: { prompt: 'prompts/alpha.md', tests: 'tests/alpha/' },
          beta: { prompt: 'prompts/beta.md', tests: 'tests/beta/' },
        },
      });

      expect(() => loadConfig({ cwd: project.baseDir })).toThrow(
        /Multiple prompts configured.*alpha.*beta/
      );
    });

    test('resolves named prompt', async () => {
      await writeConfig({
        prompts: {
          alpha: { prompt: 'prompts/alpha.md', tests: 'tests/alpha/' },
          beta: { prompt: 'prompts/beta.md', tests: 'tests/beta/' },
        },
      });

      const result = loadConfig({ cwd: project.baseDir, name: 'beta' });

      expect(result.prompt?.name).toBe('beta');
    });

    test('throws when named prompt not found', async () => {
      await writeConfig({
        prompts: {
          alpha: { prompt: 'prompts/alpha.md', tests: 'tests/alpha/' },
        },
      });

      expect(() => loadConfig({ cwd: project.baseDir, name: 'missing' })).toThrow(
        /Prompt "missing" not found.*alpha/
      );
    });

    test('defaults baseline to baselines/<name>.json when not specified', async () => {
      await writeConfig({
        prompts: {
          'customer-service': {
            prompt: 'prompts/customer-service.md',
            tests: 'tests/customer-service/',
          },
        },
      });

      const result = loadConfig({ cwd: project.baseDir });

      expect(result.prompt?.baseline).toBe(
        resolve(project.baseDir, 'baselines', 'customer-service.json')
      );
    });

    test('resolves all paths relative to cwd', async () => {
      await writeConfig({
        prompts: {
          test: {
            prompt: 'prompts/test.md',
            tests: 'tests/test/',
            baseline: 'baselines/test.json',
          },
        },
      });

      const result = loadConfig({ cwd: project.baseDir, name: 'test' });

      expect(result.prompt?.prompt).toBe(resolve(project.baseDir, 'prompts/test.md'));
      expect(result.prompt?.tests).toBe(resolve(project.baseDir, 'tests/test/'));
      expect(result.prompt?.baseline).toBe(resolve(project.baseDir, 'baselines/test.json'));
    });

    test('pathOverrides override configured prompt paths', async () => {
      await writeConfig({
        prompts: {
          alpha: {
            prompt: 'prompts/alpha.md',
            tests: 'tests/alpha/',
            baseline: 'baselines/alpha.json',
          },
        },
      });

      const result = loadConfig({
        cwd: project.baseDir,
        pathOverrides: {
          prompt: 'custom/prompt.md',
          tests: 'custom/tests/',
          baseline: 'custom/baseline.json',
        },
      });

      expect(result.prompt?.prompt).toBe(resolve(project.baseDir, 'custom/prompt.md'));
      expect(result.prompt?.tests).toBe(resolve(project.baseDir, 'custom/tests/'));
      expect(result.prompt?.baseline).toBe(resolve(project.baseDir, 'custom/baseline.json'));
    });

    test('pathOverrides work with named prompts', async () => {
      await writeConfig({
        prompts: {
          alpha: { prompt: 'prompts/alpha.md', tests: 'tests/alpha/' },
          beta: { prompt: 'prompts/beta.md', tests: 'tests/beta/' },
        },
      });

      const result = loadConfig({
        cwd: project.baseDir,
        name: 'beta',
        pathOverrides: { prompt: 'override/prompt.md' },
      });

      expect(result.prompt?.name).toBe('beta');
      expect(result.prompt?.prompt).toBe(resolve(project.baseDir, 'override/prompt.md'));
      expect(result.prompt?.tests).toBe(resolve(project.baseDir, 'tests/beta/'));
    });

    test('partial pathOverrides only replace specified fields', async () => {
      await writeConfig({
        prompts: {
          test: {
            prompt: 'prompts/test.md',
            tests: 'tests/test/',
            baseline: 'baselines/test.json',
          },
        },
      });

      const result = loadConfig({
        cwd: project.baseDir,
        pathOverrides: { tests: 'other-tests/' },
      });

      expect(result.prompt?.prompt).toBe(resolve(project.baseDir, 'prompts/test.md'));
      expect(result.prompt?.tests).toBe(resolve(project.baseDir, 'other-tests/'));
      expect(result.prompt?.baseline).toBe(resolve(project.baseDir, 'baselines/test.json'));
    });

    test('pathOverrides do not leak into defaults', async () => {
      await writeConfig({
        prompts: {
          test: { prompt: 'prompts/test.md', tests: 'tests/test/' },
        },
      });

      const result = loadConfig({
        cwd: project.baseDir,
        pathOverrides: { prompt: 'x.md', tests: 'y/', baseline: 'z.json' },
      });

      const defaultsObj = result.defaults as Record<string, unknown>;
      expect(defaultsObj).not.toHaveProperty('prompt');
      expect(defaultsObj).not.toHaveProperty('tests');
      expect(defaultsObj).not.toHaveProperty('baseline');
    });
  });
});
