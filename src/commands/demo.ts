import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { packageUpSync } from 'package-up';

async function walkDir(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDir(fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

export async function demo(cwd: string): Promise<void> {
  const pkgPath = packageUpSync({ cwd: dirname(import.meta.dirname!) });
  if (!pkgPath) {
    throw new Error('Could not find package root');
  }

  const demoDir = join(dirname(pkgPath), 'demo');
  const files = await walkDir(demoDir);

  for (const srcFile of files) {
    const relPath = relative(demoDir, srcFile);
    const destFile = join(cwd, relPath);

    if (existsSync(destFile)) {
      console.log(`  skipped  ${relPath}`);
      continue;
    }

    await mkdir(dirname(destFile), { recursive: true });
    await copyFile(srcFile, destFile);
    console.log(`  \u2713  ${relPath}`);
  }
}
