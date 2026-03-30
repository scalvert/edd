import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type TestCase, TestCaseSchema } from '@scalvert/eval-core';
import { z } from 'zod';

export async function loadTestCases(testsPath: string): Promise<TestCase[]> {
  let entries: string[];
  try {
    entries = await readdir(testsPath);
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Tests directory not found: ${testsPath}`);
    }
    throw error;
  }

  const jsonFiles = entries.filter((f) => f.endsWith('.json'));

  if (jsonFiles.length === 0) {
    throw new Error(`No test files found in ${testsPath}`);
  }

  const allCases: TestCase[] = [];

  for (const file of jsonFiles) {
    const filePath = join(testsPath, file);
    const content = await readFile(filePath, 'utf8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`Invalid JSON in ${file}`);
    }

    const items = Array.isArray(parsed) ? parsed : [parsed];

    for (const item of items) {
      try {
        allCases.push(z.array(TestCaseSchema).length(1).parse([item])[0]!);
      } catch {
        throw new Error(`Invalid test case in ${file}: expected { name, input, rubric }`);
      }
    }
  }

  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const tc of allCases) {
    if (seen.has(tc.name)) {
      duplicates.push(tc.name);
    }
    seen.add(tc.name);
  }

  if (duplicates.length > 0) {
    throw new Error(`Duplicate test case names: ${duplicates.join(', ')}`);
  }

  return allCases;
}
