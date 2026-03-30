import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULTS } from '../config.js';

const CONFIG_FILE = 'edd.config.json';
const TEST_DIR = 'tests/my-prompt';
const TEST_FILE = 'tests/my-prompt/returns-greeting.json';
const GITIGNORE = '.gitignore';
const EDD_IGNORE_ENTRY = '.edd/';

function log(action: 'created' | 'skipped', path: string, note?: string) {
  const suffix = note ? ` (${note})` : '';
  console.log(`  ${action}  ${path}${suffix}`);
}

async function writeIfMissing(filePath: string, relativePath: string, content: string) {
  if (existsSync(filePath)) {
    log('skipped', relativePath);
    return;
  }
  await writeFile(filePath, content);
  log('created', relativePath);
}

async function ensureGitignore(cwd: string) {
  const filePath = join(cwd, GITIGNORE);

  if (!existsSync(filePath)) {
    await writeFile(filePath, `${EDD_IGNORE_ENTRY}\n`);
    log('created', GITIGNORE);
    return;
  }

  const content = await readFile(filePath, 'utf8');
  const lines = content.split('\n').map((l) => l.trim());

  if (lines.includes(EDD_IGNORE_ENTRY)) {
    log('skipped', GITIGNORE, `${EDD_IGNORE_ENTRY} already listed`);
    return;
  }

  const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
  await writeFile(filePath, `${content}${prefix}${EDD_IGNORE_ENTRY}\n`);
  log('created', GITIGNORE);
}

export async function init(cwd: string): Promise<void> {
  const config = {
    defaults: { ...DEFAULTS },
    prompts: {
      'my-prompt': {
        prompt: 'prompts/my-prompt.md',
        tests: 'tests/my-prompt/',
      },
    },
  };

  const testCase = [
    {
      name: 'returns-greeting',
      input: 'Say hello',
      rubric: 'Response contains a friendly greeting',
    },
  ];

  await writeIfMissing(join(cwd, CONFIG_FILE), CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');

  await mkdir(join(cwd, TEST_DIR), { recursive: true });

  await writeIfMissing(join(cwd, TEST_FILE), TEST_FILE, JSON.stringify(testCase, null, 2) + '\n');

  await ensureGitignore(cwd);
}
