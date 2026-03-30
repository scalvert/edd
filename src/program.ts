import { Command } from 'commander';
import { packageUpSync } from 'package-up';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';

function getVersion(): string {
  const pkgPath = packageUpSync({ cwd: dirname(import.meta.dirname!) });

  if (!pkgPath) {
    return '0.0.0';
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
  return pkg.version;
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('edd')
    .description('Eval-Driven Development — prompt regression testing CLI')
    .version(getVersion())
    .option('--cwd <dir>', 'working directory', process.cwd());

  return program;
}
