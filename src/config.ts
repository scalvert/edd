import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { z } from 'zod';

const PromptEntrySchema = z.object({
  prompt: z.string(),
  tests: z.string(),
  baseline: z.string().optional(),
});

const ConfigFileSchema = z.object({
  defaults: z
    .object({
      model: z.string().optional(),
      judgeModel: z.string().optional(),
      threshold: z.number().optional(),
      concurrency: z.number().optional(),
    })
    .optional(),
  prompts: z.record(z.string(), PromptEntrySchema).optional(),
});

export const DEFAULTS = {
  model: 'claude-haiku-4-5-20251001',
  judgeModel: 'claude-haiku-4-5-20251001',
  threshold: 0.7,
  concurrency: 5,
} as const;

export interface ResolvedDefaults {
  model: string;
  judgeModel: string;
  threshold: number;
  concurrency: number;
}

export interface ResolvedPrompt {
  name: string;
  prompt: string;
  tests: string;
  baseline: string;
}

export interface CLIFlags {
  model?: string;
  judgeModel?: string;
  threshold?: number;
  concurrency?: number;
}

export interface PathOverrides {
  prompt?: string;
  tests?: string;
  baseline?: string;
}

export interface ResolvedConfig {
  defaults: ResolvedDefaults;
  prompt?: ResolvedPrompt;
}

function stripUndefined<T extends object>(obj: T): Partial<{ [K in keyof T]: NonNullable<T[K]> }> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<{
    [K in keyof T]: NonNullable<T[K]>;
  }>;
}

function resolvePrompt(
  prompts: Record<string, z.infer<typeof PromptEntrySchema>>,
  name: string | undefined,
  cwd: string
): ResolvedPrompt {
  const entries = Object.entries(prompts);

  if (entries.length === 0) {
    throw new Error('No prompts configured in edd.config.json');
  }

  let selectedName: string;
  let entry: z.infer<typeof PromptEntrySchema>;

  if (name) {
    const found = prompts[name];
    if (!found) {
      const available = entries.map(([k]) => k).join(', ');
      throw new Error(`Prompt "${name}" not found. Available: ${available}`);
    }
    selectedName = name;
    entry = found;
  } else if (entries.length === 1) {
    [selectedName, entry] = entries[0]!;
  } else {
    const available = entries.map(([k]) => k).join(', ');
    throw new Error(`Multiple prompts configured. Specify one of: ${available}`);
  }

  return {
    name: selectedName,
    prompt: resolve(cwd, entry.prompt),
    tests: resolve(cwd, entry.tests),
    baseline: entry.baseline
      ? resolve(cwd, entry.baseline)
      : resolve(cwd, 'baselines', `${selectedName}.json`),
  };
}

export function loadConfig(options: {
  cwd: string;
  name?: string;
  flags?: CLIFlags;
  pathOverrides?: PathOverrides;
}): ResolvedConfig {
  const { cwd, name, flags = {}, pathOverrides = {} } = options;
  const configPath = join(cwd, 'edd.config.json');

  const raw = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
  const configFile = ConfigFileSchema.parse(raw);

  const defaults = {
    ...DEFAULTS,
    ...stripUndefined(configFile.defaults ?? {}),
    ...stripUndefined(flags),
  } as ResolvedDefaults;

  let prompt = configFile.prompts ? resolvePrompt(configFile.prompts, name, cwd) : undefined;

  if (prompt && Object.keys(stripUndefined(pathOverrides)).length > 0) {
    prompt = {
      ...prompt,
      ...(pathOverrides.prompt ? { prompt: resolve(cwd, pathOverrides.prompt) } : {}),
      ...(pathOverrides.tests ? { tests: resolve(cwd, pathOverrides.tests) } : {}),
      ...(pathOverrides.baseline ? { baseline: resolve(cwd, pathOverrides.baseline) } : {}),
    };
  }

  return { defaults, prompt };
}

export function loadPromptNames(cwd: string): string[] {
  const configPath = join(cwd, 'edd.config.json');
  const raw = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
  const configFile = ConfigFileSchema.parse(raw);
  return Object.keys(configFile.prompts ?? {});
}
