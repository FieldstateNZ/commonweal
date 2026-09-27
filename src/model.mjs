/**
 * Deterministic annual screening arithmetic, not a validated solar design model.
 * All numeric outputs retain unrounded IEEE-754 values in the stated units.
 */
export const MODEL_VERSION = 'commonweal.annual-solar.v1';

const INPUTS = Object.freeze({
  capacity_kwp: { unit: 'kWp' },
  annual_yield_kwh_per_kwp: { unit: 'kWh/kWp/year' },
  annual_demand_kwh: { unit: 'kWh/year' },
  onsite_use_fraction: { unit: 'fraction', fraction: true },
  capital_cost_nzd: { unit: 'NZD' },
  annual_operating_cost_nzd: { unit: 'NZD/year' },
  import_price_nzd_per_kwh: { unit: 'NZD/kWh' },
  export_price_nzd_per_kwh: { unit: 'NZD/kWh' },
  renter_share: { unit: 'fraction', fraction: true },
  other_household_share: { unit: 'fraction', fraction: true },
  community_share: { unit: 'fraction', fraction: true },
  displaced_grid_kgco2e_per_kwh: { unit: 'kgCO2e/kWh', nullable: true },
  embodied_kgco2e: { unit: 'kgCO2e', nullable: true },
  annual_compute_kwh: { unit: 'kWh/year', nullable: true },
  annual_compute_kgco2e: { unit: 'kgCO2e/year', nullable: true },
  annual_water_litres: { unit: 'L/year', nullable: true },
});
const BASIS = new Set(['illustrative_assumption', 'source_reported', 'derived', 'unknown']);
const SHARE_TOLERANCE = 1e-9;

function record(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
}

function text(value, path, maximum = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new Error(`${path} must be a nonempty string of at most ${maximum} characters`);
  }
}

function texts(value, path, maximum = 4000) {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array of strings`);
  value.forEach((item, index) => text(item, `${path}[${index}]`, maximum));
}

/** Validate the supported schema and return it unchanged. Never fills unknowns. */
export function validateScenario(scenario) {
  record(scenario, 'scenario');
  if (scenario.schema_version !== 'commonweal.scenario.v1') {
    throw new Error('scenario.schema_version must be commonweal.scenario.v1');
  }
  text(scenario.id, 'scenario.id', 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(scenario.id)) {
    throw new Error('scenario.id must use letters, numbers, dots, underscores, colons or hyphens');
  }
  text(scenario.title, 'scenario.title', 300);
  text(scenario.location, 'scenario.location', 300);
  if (!Number.isInteger(scenario.price_year) || scenario.price_year < 1900 || scenario.price_year > 2200) {
    throw new Error('scenario.price_year must be an integer from 1900 to 2200');
  }
  if (scenario.status !== 'illustrative') {
    throw new Error('scenario.status must be illustrative: this model is not validated against a real project');
  }
  texts(scenario.assumptions, 'scenario.assumptions');
  texts(scenario.unknowns, 'scenario.unknowns');
  record(scenario.inputs, 'scenario.inputs');
  for (const key of Object.keys(scenario.inputs)) {
    if (!Object.hasOwn(INPUTS, key)) throw new Error(`Unsupported input: ${key}`);
  }
  for (const [key, spec] of Object.entries(INPUTS)) {
    const path = `scenario.inputs.${key}`;
    if (!Object.hasOwn(scenario.inputs, key)) throw new Error(`${path} is required`);
    const input = scenario.inputs[key];
    record(input, path);
    if (input.unit !== spec.unit) throw new Error(`${path}.unit must be ${spec.unit}`);
    if (!BASIS.has(input.basis)) throw new Error(`${path}.basis is unsupported`);
    texts(input.evidence_ids, `${path}.evidence_ids`, 200);
    if (['source_reported', 'derived'].includes(input.basis) && !input.evidence_ids.length) {
      throw new Error(`${path}.evidence_ids must cite evidence for ${input.basis} inputs`);
    }
    if (input.value === null) {
      if (!spec.nullable) throw new Error(`${path}.value is required and cannot be null`);
      if (input.basis !== 'unknown') throw new Error(`${path}.basis must be unknown when value is null`);
      continue;
    }
    if (typeof input.value !== 'number' || !Number.isFinite(input.value) || input.value < 0) {
      throw new Error(`${path}.value must be a finite nonnegative number${spec.nullable ? ' or null' : ''}`);
    }
    if (input.basis === 'unknown') throw new Error(`${path}.value must be null when basis is unknown`);
    if (spec.fraction && input.value > 1) throw new Error(`${path}.value must be between 0 and 1`);
  }
  const shareSum = scenario.inputs.renter_share.value + scenario.inputs.other_household_share.value
    + scenario.inputs.community_share.value;
  if (Math.abs(shareSum - 1) > SHARE_TOLERANCE) {
    throw new Error('renter_share, other_household_share and community_share must sum to 1 (tolerance 1e-9)');
  }
  return scenario;
}

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(`Arithmetic overflow calculating ${label}; reduce the input magnitude`);
  return value;
}

/**
 * Annual energy and operating-value balances. Onsite use is an assumption,
 * clamped to annual demand; no hourly matching or battery is simulated.
 */
export function calculate(scenario) {
  validateScenario(scenario);
  const v = Object.fromEntries(Object.entries(scenario.inputs).map(([key, input]) => [key, input.value]));
  const generation = finite(v.capacity_kwp * v.annual_yield_kwh_per_kwp, 'generation_kwh');
  const onsite = Math.min(generation * v.onsite_use_fraction, v.annual_demand_kwh);
  const exported = generation - onsite;
  const imported = v.annual_demand_kwh - onsite;
  const avoided = finite(onsite * v.import_price_nzd_per_kwh, 'avoided_import_cost_nzd');
  const receipts = finite(exported * v.export_price_nzd_per_kwh, 'export_receipts_nzd');
  const grossValue = finite(avoided + receipts, 'annual gross operating value');
  const surplus = finite(grossValue - v.annual_operating_cost_nzd, 'annual_operating_surplus_nzd');
  const allocatable = Math.max(surplus, 0);
  const grossEmissionsProxy = v.displaced_grid_kgco2e_per_kwh === null ? null
    : finite(onsite * v.displaced_grid_kgco2e_per_kwh, 'gross_operational_proxy_kgco2e');

  return {
    metrics: {
      generation_kwh: generation,
      onsite_kwh: onsite,
      export_kwh: exported,
      import_kwh: imported,
      avoided_import_cost_nzd: avoided,
      export_receipts_nzd: receipts,
      annual_operating_cost_nzd: v.annual_operating_cost_nzd,
      annual_operating_surplus_nzd: surplus,
      capital_cost_nzd: v.capital_cost_nzd,
      annual_funding_gap_nzd: Math.max(-surplus, 0),
    },
    allocation: {
      renters_nzd: allocatable * v.renter_share,
      other_households_nzd: allocatable * v.other_household_share,
      community_nzd: allocatable * v.community_share,
    },
    environment: {
      gross_operational_proxy_kgco2e: grossEmissionsProxy,
      embodied_kgco2e: v.embodied_kgco2e,
      annual_compute_kwh: v.annual_compute_kwh,
      annual_compute_kgco2e: v.annual_compute_kgco2e,
      annual_water_litres: v.annual_water_litres,
    },
    limitations: [
      'Illustrative annual screening arithmetic, not a reconstruction of observed project results or a validated engineering, investment or policy model.',
      'Annual onsite use is assumed and capped by annual demand; no hourly demand, weather, seasonal or winter reliability, battery, storage, losses beyond the supplied yield, or network constraints are simulated.',
      'Operating surplus combines avoided import bills and export receipts, less operating costs. Avoided bills are not necessarily cash the project can distribute.',
      'Allocation is a hypothetical sharing of positive annual operating value. It requires an explicit ownership and transfer mechanism to benefit renters or other households. Deficits appear as a funding gap and are not allocated.',
      'Capital cost is reported separately and is not deducted from annual operating surplus. Financing, debt service, discounting, replacement, degradation, inflation, fixed tariffs and tax are not modeled; prices must use the stated price year consistently.',
      'The gross operational emissions proxy is annual onsite use multiplied by the supplied displacement factor. It excludes exported-energy displacement and is not a net climate benefit or a claim about marginal grid emissions.',
      'Embodied impacts are a stock, while compute emissions, compute energy and water are annual inputs. They are reported separately without netting incompatible periods. Unknown effects remain null, including when generation is zero.',
      'Environmental coverage is incomplete: materials, ecosystems, lifecycle boundaries and any other unmeasured impacts need separate evidence. Provided environmental inputs are not verified by this calculation.',
      'Practitioner and community review, local observations and distribution arrangements are required before real-world reliance. Enlarging, replicating and national scaling require different models; multiplying these totals does not establish feasibility.',
    ],
  };
}
