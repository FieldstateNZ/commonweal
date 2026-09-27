import { readFile } from 'node:fs/promises';
import { summarizeBenchmarks } from './benchmarks.mjs';
const dataRoot = new URL('../data/', import.meta.url);
export async function examples() {
  const [scenarios,evidence,benchmarks] = await Promise.all([
    readFile(new URL('scenarios/illustrative.json',dataRoot),'utf8'),
    readFile(new URL('evidence/otaki.json',dataRoot),'utf8'),
    readFile(new URL('benchmarks/otaki-annual.json',dataRoot),'utf8')
  ]);
  const records=JSON.parse(evidence);
  return {scenarios:JSON.parse(scenarios),evidence:records,benchmarks:summarizeBenchmarks(JSON.parse(benchmarks),records)};
}
