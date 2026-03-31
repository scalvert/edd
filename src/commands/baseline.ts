import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { saveBaseline } from '@scalvert/eval-core';
import { loadConfig } from '../config.js';
import { loadLastRun } from '../last-run.js';
import { loadTestCases } from './test-cases.js';

export interface BaselineOptions {
  cwd: string;
  name?: string;
}

export async function baseline(options: BaselineOptions): Promise<void> {
  const { cwd, name } = options;
  const config = loadConfig({ cwd, name });

  if (!config.prompt) {
    throw new Error('No prompts configured in edd.config.json');
  }

  const lastRun = await loadLastRun(cwd, config.prompt.name);
  if (!lastRun) {
    throw new Error(
      `No last run found for prompt "${config.prompt.name}". Run \`edd run ${config.prompt.name}\` first.`
    );
  }

  const promptContent = await readFile(config.prompt.prompt, 'utf8');
  const currentHash = createHash('sha256').update(promptContent).digest('hex');

  if (lastRun.promptMetadata?.promptHash && lastRun.promptMetadata.promptHash !== currentHash) {
    throw new Error(
      'Prompt file has changed since the last run. Run `edd run` again before promoting to baseline.'
    );
  }

  const promptHash = lastRun.promptMetadata?.promptHash ?? currentHash;

  const testCases = await loadTestCases(config.prompt.tests);
  const currentNames = new Set(testCases.map((tc) => tc.name));
  const runNames = new Set(lastRun.results.map((r) => r.name));

  if (currentNames.size !== runNames.size || [...currentNames].some((n) => !runNames.has(n))) {
    console.warn('Warning: Test suite has changed since the last run.');
  }

  if (lastRun.passRate < config.defaults.threshold) {
    console.warn(
      `Warning: Pass rate ${lastRun.passRate.toFixed(3)} is below threshold ${config.defaults.threshold.toFixed(2)}.`
    );
  }

  const result = { ...lastRun, promptHash, promptMetadata: undefined };
  await saveBaseline(result, config.prompt.baseline);

  console.log(`Baseline saved to ${relative(cwd, config.prompt.baseline)}`);
}
