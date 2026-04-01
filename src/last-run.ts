import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type RunResult, RunResultSchema } from '@scalvert/eval-core';

const LAST_RUN_DIR = '.edd/last-run';

function lastRunPath(cwd: string, promptName: string): string {
  return join(cwd, LAST_RUN_DIR, `${promptName}.json`);
}

export async function saveLastRun(
  result: RunResult,
  cwd: string,
  promptName: string
): Promise<void> {
  const dirPath = join(cwd, LAST_RUN_DIR);
  await mkdir(dirPath, { recursive: true });
  await writeFile(lastRunPath(cwd, promptName), JSON.stringify(result, null, 2));
}

export async function loadLastRun(cwd: string, promptName: string): Promise<RunResult | null> {
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
  return RunResultSchema.parse(raw);
}
