import { Command } from 'commander';
import { packageUpSync } from 'package-up';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { init } from './commands/init.js';

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

  program
    .command('init')
    .description('Initialize a new edd project')
    .action(async () => {
      const cwd = program.opts().cwd as string;
      await init(cwd);
    });

  return program;
}
