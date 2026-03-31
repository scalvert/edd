export { createProgram } from './program.js';
export {
  DEFAULTS,
  loadConfig,
  type ResolvedConfig,
  type ResolvedDefaults,
  type ResolvedPrompt,
  type CLIFlags,
} from './config.js';
export { saveLastRun, loadLastRun, type LastRunData, type PromptMetadata } from './last-run.js';
export { baseline, type BaselineOptions } from './commands/baseline.js';
export { demo } from './commands/demo.js';
export { run, type RunOptions, type RunOutcome, type RunFlags } from './commands/run.js';
export { loadTestCases } from './commands/test-cases.js';
export { formatResults } from './commands/formatting.js';
