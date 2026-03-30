import { Command } from 'commander';
import { packageUpSync } from 'package-up';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { init } from './commands/init.js';
import { baseline } from './commands/baseline.js';
import { run, type RunFlags } from './commands/run.js';

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

  program
    .command('run [name]')
    .description('Run eval against a prompt')
    .option('--prompt <path>', 'path to prompt file')
    .option('--tests <path>', 'path to tests directory')
    .option('--baseline <path>', 'path to baseline file')
    .option('--threshold <n>', 'score threshold', parseFloat)
    .option('--concurrency <n>', 'max concurrent evals', parseInt)
    .option('--fail-on-regression', 'exit 1 if regressions detected')
    .option('--iterations <n>', 'number of eval iterations for statistical confidence', parseInt)
    .option('--all', 'run all configured prompts')
    .action(async (name: string | undefined, cmdOptions: Record<string, unknown>) => {
      const cwd = program.opts().cwd as string;
      const flags: RunFlags = {
        ...(cmdOptions.prompt ? { prompt: cmdOptions.prompt as string } : {}),
        ...(cmdOptions.tests ? { tests: cmdOptions.tests as string } : {}),
        ...(cmdOptions.baseline ? { baseline: cmdOptions.baseline as string } : {}),
        ...(cmdOptions.threshold !== undefined
          ? { threshold: cmdOptions.threshold as number }
          : {}),
        ...(cmdOptions.concurrency !== undefined
          ? { concurrency: cmdOptions.concurrency as number }
          : {}),
        ...(cmdOptions.iterations !== undefined
          ? { iterations: cmdOptions.iterations as number }
          : {}),
        failOnRegression: cmdOptions.failOnRegression as boolean | undefined,
        all: cmdOptions.all as boolean | undefined,
      };
      await run({ cwd, name, flags });
    });

  program
    .command('baseline [name]')
    .description('Promote last run to baseline')
    .action(async (name: string | undefined) => {
      const cwd = program.opts().cwd as string;
      await baseline({ cwd, name });
    });

  return program;
}
