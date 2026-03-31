import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import ora from 'ora';
import {
  type ResponseFn,
  type JudgeFn,
  type Pricing,
  type RunResult,
  type CompareResult,
  runEval,
  createAnthropicJudge,
  loadBaseline,
  compareRuns,
} from '@scalvert/eval-core';

const MODEL_PRICING: Record<string, Pricing> = {
  'claude-haiku-4-5-20251001': { inputPerMillion: 0.8, outputPerMillion: 4 },
  'claude-sonnet-4-5-20250514': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-opus-4-20250514': { inputPerMillion: 15, outputPerMillion: 75 },
};
import {
  type CLIFlags,
  type PathOverrides,
  loadConfig,
  loadPromptNames,
  type ResolvedPrompt,
} from '../config.js';
import { saveLastRun, type PromptMetadata } from '../last-run.js';
import { loadTestCases } from './test-cases.js';
import { formatResults, type RunOutcome } from './formatting.js';

export type { RunOutcome };

export interface RunFlags extends CLIFlags {
  prompt?: string;
  tests?: string;
  baseline?: string;
  failOnRegression?: boolean;
  all?: boolean;
  iterations?: number;
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

function aggregateRuns(runs: RunResult[], threshold: number, iterations: number): RunResult {
  const nameToScores = new Map<string, { scores: number[]; result: RunResult['results'][0] }>();

  for (const run of runs) {
    for (const r of run.results) {
      const entry = nameToScores.get(r.name) ?? { scores: [], result: r };
      entry.scores.push(r.score);
      nameToScores.set(r.name, entry);
    }
  }

  const results = [...nameToScores.entries()].map(([name, { scores, result }]) => {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, s) => a + (s - mean) ** 2, 0) / scores.length;
    const σ = Math.sqrt(variance);
    return {
      ...result,
      name,
      score: mean,
      passed: mean >= threshold,
      σ,
      iterations,
    };
  });

  const passRate = results.filter((r) => r.passed).length / results.length;

  return {
    runId: runs[0]!.runId,
    timestamp: runs[0]!.timestamp,
    passRate,
    results,
    totalInputTokens: runs.reduce((a, r) => a + r.totalInputTokens, 0),
    totalOutputTokens: runs.reduce((a, r) => a + r.totalOutputTokens, 0),
    totalCostUsd: runs.reduce((a, r) => a + r.totalCostUsd, 0),
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
    iterations: number;
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

  const { iterations } = options;
  const pricing = MODEL_PRICING[options.model];
  const relativePrompt = relative(options.cwd, prompt.prompt);
  const iterLabel = iterations > 1 ? ` \u00D7 ${iterations} iterations` : '';
  const spinnerText = `Running ${testCases.length} test cases${iterLabel} against ${relativePrompt}...`;
  const spinner = process.stdout.isTTY
    ? ora(spinnerText).start()
    : { text: '', stop() {}, succeed() {}, fail() {} };

  let result: RunResult;
  try {
    if (iterations > 1) {
      const runs: RunResult[] = [];
      for (let i = 0; i < iterations; i++) {
        const r = await runEval({
          testCases,
          respond,
          judge,
          concurrency: options.concurrency,
          pricing,
        });
        runs.push(r);
        spinner.text = `Running ${testCases.length} test cases \u00D7 ${iterations} iterations (${i + 1}/${iterations} complete) against ${relativePrompt}...`;
      }
      result = aggregateRuns(runs, options.threshold, iterations);
    } else {
      result = await runEval({
        testCases,
        respond,
        judge,
        concurrency: options.concurrency,
        pricing,
      });
    }
  } catch (error) {
    spinner.fail();
    throw error;
  }

  spinner.stop();

  const promptHash = createHash('sha256').update(systemPrompt).digest('hex');
  const metadata: PromptMetadata = {
    promptName: prompt.name,
    promptPath: relativePrompt,
    promptHash,
  };
  await saveLastRun(result, options.cwd, prompt.name, metadata);

  let comparison: CompareResult | undefined;
  const baseline = await loadBaseline(prompt.baseline);
  if (baseline) {
    comparison = compareRuns(result, baseline);
  }

  return {
    result,
    comparison,
    promptName: prompt.name,
    promptFile: relativePrompt,
  };
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
  const {
    all,
    failOnRegression,
    iterations: iterationsFlag,
    prompt: promptOverride,
    tests: testsOverride,
    baseline: baselineOverride,
    ...configFlags
  } = flags;
  const iterations = iterationsFlag ?? 1;
  const pathOverrides: PathOverrides = {
    ...(promptOverride ? { prompt: promptOverride } : {}),
    ...(testsOverride ? { tests: testsOverride } : {}),
    ...(baselineOverride ? { baseline: baselineOverride } : {}),
  };

  if (all) {
    const names = loadPromptNames(cwd);
    if (names.length === 0) {
      throw new Error('No prompts configured in edd.config.json');
    }

    const outcomes: RunOutcome[] = [];
    for (const promptName of names) {
      const config = loadConfig({ cwd, name: promptName, flags: configFlags, pathOverrides });
      const outcome = await runSinglePrompt(config.prompt!, {
        cwd,
        model: config.defaults.model,
        judgeModel: config.defaults.judgeModel,
        threshold: config.defaults.threshold,
        concurrency: config.defaults.concurrency,
        iterations,
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

  const config = loadConfig({ cwd, name, flags: configFlags, pathOverrides });

  if (!config.prompt) {
    throw new Error('No prompts configured in edd.config.json');
  }

  const outcome = await runSinglePrompt(config.prompt, {
    cwd,
    model: config.defaults.model,
    judgeModel: config.defaults.judgeModel,
    threshold: config.defaults.threshold,
    concurrency: config.defaults.concurrency,
    iterations,
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
