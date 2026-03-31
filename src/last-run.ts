import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type RunResult, RunResultSchema } from '@scalvert/eval-core';
import { z } from 'zod';

const LAST_RUN_DIR = '.edd';
const LAST_RUN_FILE = 'last-run.json';

export interface PromptMetadata {
  promptName: string;
  promptPath: string;
  promptHash: string;
}

const LastRunDataSchema = RunResultSchema.extend({
  promptMetadata: z
    .object({
      promptName: z.string(),
      promptPath: z.string(),
      promptHash: z.string(),
    })
    .optional(),
});

export type LastRunData = RunResult & { promptMetadata?: PromptMetadata };

export async function saveLastRun(
  result: RunResult,
  cwd: string,
  metadata?: PromptMetadata
): Promise<void> {
  const dirPath = join(cwd, LAST_RUN_DIR);
  await mkdir(dirPath, { recursive: true });
  const data: LastRunData = metadata ? { ...result, promptMetadata: metadata } : result;
  await writeFile(join(dirPath, LAST_RUN_FILE), JSON.stringify(data, null, 2));
}

export async function loadLastRun(cwd: string): Promise<LastRunData | null> {
  const filePath = join(cwd, LAST_RUN_DIR, LAST_RUN_FILE);

  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const raw: unknown = JSON.parse(content);
  return LastRunDataSchema.parse(raw);
}
