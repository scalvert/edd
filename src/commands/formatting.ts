import type { CompareResult, RunResult } from '@scalvert/eval-core';

export interface RunOutcome {
  result: RunResult;
  comparison?: CompareResult;
  promptName: string;
  promptFile: string;
}

const numberFormat = new Intl.NumberFormat('en-US');

function formatTokens(n: number): string {
  return numberFormat.format(n);
}

function formatCost(n: number): string {
  return `$${n.toFixed(4)}`;
}

function formatDelta(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(3)}`;
}

export function formatResults(outcome: RunOutcome, threshold: number): string {
  const { result, comparison, promptFile } = outcome;
  const lines: string[] = [];

  const first = result.results[0] as Record<string, unknown> | undefined;
  const iterCount = first && 'iterations' in first ? (first.iterations as number) : undefined;
  const iterLabel = iterCount ? ` \u00D7 ${iterCount} iterations` : '';

  lines.push(`Running ${result.results.length} test cases${iterLabel} against ${promptFile}...`);

  for (const r of result.results) {
    const icon = r.passed ? '\u2713' : '\u2717';
    const padding = ' '.repeat(Math.max(1, 30 - r.name.length));
    const extra = r as unknown as Record<string, unknown>;

    if ('σ' in extra) {
      const thresholdNote = r.passed ? '' : `, threshold: ${threshold.toFixed(2)}`;
      lines.push(
        `  ${icon} ${r.name}${padding}(mean: ${r.score.toFixed(2)}, \u03C3: ${(extra.σ as number).toFixed(2)}, n=${extra.iterations}${thresholdNote})`
      );
    } else {
      const thresholdNote = r.passed ? '' : `, threshold: ${threshold.toFixed(2)}`;
      lines.push(`  ${icon} ${r.name}${padding}(score: ${r.score.toFixed(2)}${thresholdNote})`);
    }
  }

  const passing = result.results.filter((r) => r.passed).length;
  lines.push(
    '  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'
  );
  lines.push(
    `  ${passing}/${result.results.length} passing \u00B7 pass rate: ${result.passRate.toFixed(3)}`
  );

  if (comparison) {
    lines.push('');
    lines.push(
      `  Baseline: ${(result.passRate - comparison.passRateDelta).toFixed(3)} \u2192 ${result.passRate.toFixed(3)} (${formatDelta(comparison.passRateDelta)})`
    );

    if (comparison.improvements.length > 0) {
      const names = comparison.improvements.map((n) => `"${n}"`).join(', ');
      lines.push(
        `  ${comparison.improvements.length} improvement${comparison.improvements.length === 1 ? '' : 's'}: ${names}`
      );
    }

    if (comparison.regressions.length > 0) {
      const names = comparison.regressions.map((n) => `"${n}"`).join(', ');
      lines.push(
        `  ${comparison.regressions.length} regression${comparison.regressions.length === 1 ? '' : 's'}:  ${names}`
      );
    }
  }

  lines.push('');
  const costSuffix = result.totalCostUsd > 0 ? ` \u00B7 ~${formatCost(result.totalCostUsd)}` : '';
  lines.push(
    `  API usage: ${formatTokens(result.totalInputTokens)} input \u00B7 ${formatTokens(result.totalOutputTokens)} output${costSuffix}`
  );

  return lines.join('\n');
}
