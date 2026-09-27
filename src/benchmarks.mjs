import { assertDepth, validateEvidence } from './records.mjs';

function text(value, path, maximum = 10000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new Error(`${path} must be a nonempty string (max ${maximum} characters)`);
  }
}
function completeDate(value, path) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error(`${path} must be a valid YYYY-MM-DD date`);
  }
}
function earliestStart(value, path) {
  // The first day is an ordering bound, not a replacement for uncertain precision.
  if (typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return `${value}-01`;
  completeDate(value, path);
  return value;
}

/**
 * Describe reported period totals without annualising, inventing a meter series,
 * or interpreting the arithmetic residual as a measured export quantity.
 */
export function summarizeBenchmarks(records, evidence) {
  assertDepth(records);
  if (!Array.isArray(records) || records.length > 200) {
    throw new Error('benchmarks must be an array with at most 200 records');
  }
  const evidenceIds = new Set(validateEvidence(evidence).map(record => record.id));
  const seen = new Set();
  const summarized = records.map((record, index) => {
    const path = `benchmarks[${index}]`;
    if (record === null || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`${path} must be an object`);
    }
    text(record.id, `${path}.id`, 128);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(record.id)) {
      throw new Error(`${path}.id must use letters, numbers, dots, underscores, colons or hyphens`);
    }
    if (seen.has(record.id)) throw new Error(`Duplicate benchmark id: ${record.id}`);
    seen.add(record.id);
    const earliest = earliestStart(record.period_start, `${path}.period_start`);
    completeDate(record.period_end, `${path}.period_end`);
    if (earliest > record.period_end) throw new Error(`${path}.period_start must not follow period_end`);
    const generation = record.generation_kwh_reported;
    const onsite = record.onsite_solar_kwh_reported;
    if (typeof generation !== 'number' || !Number.isFinite(generation) || generation <= 0) {
      throw new Error(`${path}.generation_kwh_reported must be a finite positive number`);
    }
    if (onsite !== null && (typeof onsite !== 'number' || !Number.isFinite(onsite) || onsite < 0 || onsite > generation)) {
      throw new Error(`${path}.onsite_solar_kwh_reported must be null or a finite number from zero to reported generation`);
    }
    text(record.evidence_id, `${path}.evidence_id`, 120);
    if (!evidenceIds.has(record.evidence_id)) throw new Error(`${path} references missing evidence ${record.evidence_id}`);
    text(record.quality_note, `${path}.quality_note`);
    return {
      ...structuredClone(record),
      derived: {
        onsite_share: onsite === null ? null : onsite / generation,
        residual_kwh: onsite === null ? null : generation - onsite,
      },
    };
  });
  return {
    schema_version: 'commonweal.benchmarks.v1',
    records: summarized,
    limitations: [
      'These are source-reported period totals, not independently checked meter readings or a reproduced temporal generation/load series. Preserve and inspect every quality note, including estimated production during meter faults.',
      'Onsite share is reported onsite solar use divided by reported generation. Residual is generation minus onsite use; it is not measured export and can include differences in source definitions or reporting boundaries.',
      'Periods retain their reported date precision. Partial periods are not annualised, missing onsite totals remain unknown, and totals from unlike periods are not directly comparable.',
      'These arithmetic checks do not validate hourly matching, winter reliability, network feasibility, household benefits, project finances or climate effects, and do not calibrate the separate illustrative screening model.',
      'Evidence schema and reference checks do not establish source accuracy. Expert review and underlying meter data are needed before operational reliance.',
    ],
  };
}
