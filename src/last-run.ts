import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type RunResult, RunResultSchema } from '@scalvert/eval-core';

const LAST_RUN_DIR = '.edd';
const LAST_RUN_FILE = 'last-run.json';

export async function saveLastRun(result: RunResult, cwd: string): Promise<void> {
  const dirPath = join(cwd, LAST_RUN_DIR);
  await mkdir(dirPath, { recursive: true });
  await writeFile(join(dirPath, LAST_RUN_FILE), JSON.stringify(result, null, 2));
}

export async function loadLastRun(cwd: string): Promise<RunResult | null> {
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
  return RunResultSchema.parse(raw);
}
