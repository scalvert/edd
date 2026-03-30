import { readFile } from 'node:fs/promises';
import ora from 'ora';
import {
  type ResponseFn,
  type JudgeFn,
  type RunResult,
  type CompareResult,
  runEval,
  createAnthropicJudge,
  loadBaseline,
  compareRuns,
} from '@scalvert/eval-core';
import { type CLIFlags, loadConfig, loadPromptNames, type ResolvedPrompt } from '../config.js';
import { saveLastRun } from '../last-run.js';
import { loadTestCases } from './test-cases.js';
import { formatResults, type RunOutcome } from './formatting.js';

export type { RunOutcome };

export interface RunFlags extends CLIFlags {
  prompt?: string;
  tests?: string;
  baseline?: string;
  failOnRegression?: boolean;
  all?: boolean;
}

export interface RunOptions {
  cwd: string;
  name?: string;
  flags?: RunFlags;
  respond?: ResponseFn;
  judge?: JudgeFn;
}

function buildRespondFn(systemPrompt: string, model: string, apiKey: string): ResponseFn {
  let clientPromise: Promise<InstanceType<typeof import('@anthropic-ai/sdk').default>> | undefined;

  async function getClient() {
    if (!clientPromise) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      clientPromise = Promise.resolve(new Anthropic({ apiKey }));
    }
    return clientPromise;
  }

  return async (input: string) => {
    const client = await getClient();
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: input }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? (b.text as string) : ''))
      .join('');

    return {
      response: text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  };
}

async function runSinglePrompt(
  prompt: ResolvedPrompt,
  options: {
    cwd: string;
    model: string;
    judgeModel: string;
    threshold: number;
    concurrency: number;
    respond?: ResponseFn;
    judge?: JudgeFn;
  }
): Promise<RunOutcome> {
  let systemPrompt: string;
  try {
    systemPrompt = await readFile(prompt.prompt, 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Prompt file not found: ${prompt.prompt}`);
    }
    throw error;
  }

  const testCases = await loadTestCases(prompt.tests);

  const respond = options.respond ?? buildRespondFn(systemPrompt, options.model, requireApiKey());

  const judge =
    options.judge ??
    createAnthropicJudge({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: options.judgeModel,
      threshold: options.threshold,
    });

  const spinnerText = `Running ${testCases.length} test cases against ${prompt.prompt}...`;
  const spinner = process.stdout.isTTY
    ? ora(spinnerText).start()
    : { stop() {}, succeed() {}, fail() {} };

  let result: RunResult;
  try {
    result = await runEval({
      testCases,
      respond,
      judge,
      concurrency: options.concurrency,
    });
  } catch (error) {
    spinner.fail();
    throw error;
  }

  spinner.stop();

  await saveLastRun(result, options.cwd);

  let comparison: CompareResult | undefined;
  const baseline = await loadBaseline(prompt.baseline);
  if (baseline) {
    comparison = compareRuns(result, baseline);
  }

  return { result, comparison, promptName: prompt.name, promptFile: prompt.prompt };
}

function requireApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required. Set it with: export ANTHROPIC_API_KEY=your-key'
    );
  }
  return key;
}

export async function run(options: RunOptions): Promise<RunOutcome[]> {
  const { cwd, name, flags = {} } = options;
  const { all, failOnRegression, ...configFlags } = flags;

  if (all) {
    const names = loadPromptNames(cwd);
    if (names.length === 0) {
      throw new Error('No prompts configured in edd.config.json');
    }

    const outcomes: RunOutcome[] = [];
    for (const promptName of names) {
      const config = loadConfig({ cwd, name: promptName, flags: configFlags });
      const outcome = await runSinglePrompt(config.prompt!, {
        cwd,
        model: config.defaults.model,
        judgeModel: config.defaults.judgeModel,
        threshold: config.defaults.threshold,
        concurrency: config.defaults.concurrency,
        respond: options.respond,
        judge: options.judge,
      });
      console.log(formatResults(outcome, config.defaults.threshold));
      console.log();
      outcomes.push(outcome);
    }

    if (failOnRegression) {
      const allRegressions = outcomes.flatMap((o) => o.comparison?.regressions ?? []);
      if (allRegressions.length > 0) {
        throw new Error(`${allRegressions.length} regression(s) detected across all prompts`);
      }
    }

    return outcomes;
  }

  const config = loadConfig({ cwd, name, flags: configFlags });

  if (!config.prompt) {
    throw new Error('No prompts configured in edd.config.json');
  }

  const outcome = await runSinglePrompt(config.prompt, {
    cwd,
    model: config.defaults.model,
    judgeModel: config.defaults.judgeModel,
    threshold: config.defaults.threshold,
    concurrency: config.defaults.concurrency,
    respond: options.respond,
    judge: options.judge,
  });

  console.log(formatResults(outcome, config.defaults.threshold));

  if (failOnRegression && outcome.comparison?.regressions.length) {
    throw new Error(
      `${outcome.comparison.regressions.length} regression(s) detected: ${outcome.comparison.regressions.join(', ')}`
    );
  }

  return [outcome];
}
