import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeBenchmarks } from '../src/benchmarks.mjs';

const evidence = [{
  schema_version: 'commonweal.evidence.v1', id: 'test-reported-totals', version: '1',
  title: 'Reported annual totals fixture', claim: 'Test evidence, not an independently verified reading.',
  classification: 'source_reported_observation', review_status: 'unreviewed',
  source: { title: 'Test annual report', publisher: 'Test source', url: 'https://example.org/report',
    published_at: null, accessed_at: '2026-09-28', locator: 'Test table' },
  context: { location: 'Test location', period: 'Test periods', units: 'kWh', method: 'Test transcription' },
  limitations: ['Fixture only.'], rights: { status: 'link_only', note: 'Fixture only.' },
}];
function rows() {
  return [
    { id: 'partial-2021', period_start: '2020-09', period_end: '2021-06-30',
      generation_kwh_reported: 80246, onsite_solar_kwh_reported: null,
      evidence_id: evidence[0].id, quality_note: 'Partial period; exact start day and onsite total unknown.' },
    { id: 'annual-2024', period_start: '2023-07-01', period_end: '2024-06-30',
      generation_kwh_reported: 142193.71, onsite_solar_kwh_reported: 98841.52,
      evidence_id: evidence[0].id, quality_note: 'Source-reported annual total; no underlying meter series.' },
    { id: 'annual-2025', period_start: '2024-07-01', period_end: '2025-06-30',
      generation_kwh_reported: 138252.58, onsite_solar_kwh_reported: 95886.20,
      evidence_id: evidence[0].id, quality_note: 'Two months of production estimated after a meter fault.' },
  ];
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`);

test('reports source totals unchanged, with bounded arithmetic shares and residuals', () => {
  const result = summarizeBenchmarks(rows(), evidence);
  assert.equal(result.schema_version, 'commonweal.benchmarks.v1');
  const [partial, first, second] = result.records;
  assert.equal(partial.generation_kwh_reported, 80246);
  close(first.derived.residual_kwh, 43352.19);
  close(second.derived.residual_kwh, 42366.38);
  assert.ok(first.derived.onsite_share > 0.695 && first.derived.onsite_share < 0.696);
  assert.ok(second.derived.onsite_share > 0.693 && second.derived.onsite_share < 0.694);
  for (const record of [first, second]) {
    close(record.onsite_solar_kwh_reported + record.derived.residual_kwh, record.generation_kwh_reported);
    assert.ok(record.derived.onsite_share >= 0 && record.derived.onsite_share <= 1);
    assert.deepEqual(Object.keys(record.derived), ['onsite_share', 'residual_kwh']);
  }
});

test('preserves uncertain start precision, unknown onsite totals and quality notes verbatim', () => {
  const original = rows();
  const result = summarizeBenchmarks(original, evidence);
  assert.equal(result.records[0].period_start, '2020-09');
  assert.deepEqual(result.records[0].derived, { onsite_share: null, residual_kwh: null });
  result.records.forEach((record, index) => {
    assert.equal(record.quality_note, original[index].quality_note);
    const { derived, ...reported } = record;
    assert.deepEqual(reported, original[index]);
  });
  assert.ok(result.limitations.some(note => note.includes('not measured export')));
  assert.ok(result.limitations.some(note => note.includes('not annualised')));
});

test('zero onsite and full onsite close the reported balance without rounding', () => {
  for (const onsite of [0, 142193.71]) {
    const record = { ...rows()[1], onsite_solar_kwh_reported: onsite };
    const output = summarizeBenchmarks([record], evidence).records[0];
    assert.equal(output.derived.onsite_share, onsite === 0 ? 0 : 1);
    assert.equal(output.derived.residual_kwh, onsite === 0 ? 142193.71 : 0);
  }
});

test('is deterministic, leaves inputs untouched and produces independent output objects', () => {
  const original = rows();
  const before = JSON.stringify(original);
  const first = summarizeBenchmarks(original, evidence);
  assert.deepEqual(first, summarizeBenchmarks(original, evidence));
  assert.equal(JSON.stringify(original), before);
  first.records[0].quality_note = 'Changed output';
  assert.equal(JSON.stringify(original), before);
});

test('requires valid referenced evidence without asserting its claims are verified', () => {
  assert.throws(() => summarizeBenchmarks(rows(), []), /missing evidence/);
  const invalid = structuredClone(evidence);
  invalid[0].source.url = 'javascript:alert(1)';
  assert.throws(() => summarizeBenchmarks(rows(), invalid), /HTTP/);
  assert.doesNotThrow(() => summarizeBenchmarks(rows(), evidence));
});

test('rejects zero, negative, nonnumeric and nonfinite generation', () => {
  for (const generation of [0, -1, NaN, Infinity, -Infinity, '10', null, undefined]) {
    const row = { ...rows()[1], generation_kwh_reported: generation };
    assert.throws(() => summarizeBenchmarks([row], evidence), /generation_kwh_reported/);
  }
});

test('requires onsite to be explicitly unknown or within reported generation', () => {
  for (const onsite of [-1, 142193.72, NaN, Infinity, '10', undefined]) {
    const row = { ...rows()[1], onsite_solar_kwh_reported: onsite };
    assert.throws(() => summarizeBenchmarks([row], evidence), /onsite_solar_kwh_reported/);
  }
});

test('validates dates, ordering and supported date precision', () => {
  for (const [key, values] of Object.entries({
    period_start: ['2024-13', '2024-00', '2024-02-30', '2024', '', null, '2024-07-01'],
    period_end: ['2024-06', '2024-02-30', '2023-06-30', '', null],
  })) {
    for (const value of values) {
      const row = { ...rows()[1], [key]: value };
      assert.throws(() => summarizeBenchmarks([row], evidence), /period_/);
    }
  }
  const leap = { ...rows()[1], period_start: '2024-02', period_end: '2024-02-29' };
  assert.doesNotThrow(() => summarizeBenchmarks([leap], evidence));
  assert.throws(() => summarizeBenchmarks([{ ...leap, period_start: '2024-03' }], evidence), /must not follow/);
});

test('validates collection shape, identifiers, duplicates and quality-note presence', () => {
  for (const records of [null, {}, 'records', [null], [[]]]) {
    assert.throws(() => summarizeBenchmarks(records, evidence), /benchmarks/);
  }
  assert.throws(() => summarizeBenchmarks([rows()[1], rows()[1]], evidence), /Duplicate benchmark id/);
  for (const [key, value] of [['id', ''], ['id', '../unsafe'], ['quality_note', ' '], ['evidence_id', null]]) {
    const row = { ...rows()[1], [key]: value };
    assert.throws(() => summarizeBenchmarks([row], evidence), new RegExp(key));
  }
  assert.deepEqual(summarizeBenchmarks([], evidence).records, []);
});
