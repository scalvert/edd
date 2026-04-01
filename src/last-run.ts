import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type RunResult, RunResultSchema } from '@scalvert/eval-core';
import { z } from 'zod';

const LAST_RUN_DIR = '.edd/last-run';

export interface PromptMetadata {
  promptName: string;
  promptPath: string;
  promptHash: string;
}

function lastRunPath(cwd: string, promptName: string): string {
  return join(cwd, LAST_RUN_DIR, `${promptName}.json`);
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
  promptName: string,
  metadata?: PromptMetadata
): Promise<void> {
  const dirPath = join(cwd, LAST_RUN_DIR);
  await mkdir(dirPath, { recursive: true });
  const data: LastRunData = metadata ? { ...result, promptMetadata: metadata } : result;
  await writeFile(lastRunPath(cwd, promptName), JSON.stringify(data, null, 2));
}

export async function loadLastRun(cwd: string, promptName: string): Promise<LastRunData | null> {
  const filePath = lastRunPath(cwd, promptName);

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
