import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, validateScenario, MODEL_VERSION } from '../src/model.mjs';

const assumed = (value, unit) => ({ value, unit, basis: 'illustrative_assumption', evidence_ids: [] });
const unknown = (unit) => ({ value: null, unit, basis: 'unknown', evidence_ids: [] });
function scenario(changes = {}) {
  const fixture = {
    schema_version: 'commonweal.scenario.v1',
    id: 'test-community', title: 'Illustrative test community', location: 'Unspecified NZ community',
    price_year: 2026, status: 'illustrative', assumptions: ['Test inputs only.'], unknowns: ['Hourly demand.'],
    inputs: {
      capacity_kwp: assumed(100, 'kWp'),
      annual_yield_kwh_per_kwp: assumed(1200, 'kWh/kWp/year'),
      annual_demand_kwh: assumed(100000, 'kWh/year'),
      onsite_use_fraction: assumed(0.6, 'fraction'),
      capital_cost_nzd: assumed(180000, 'NZD'),
      annual_operating_cost_nzd: assumed(2000, 'NZD/year'),
      import_price_nzd_per_kwh: assumed(0.3, 'NZD/kWh'),
      export_price_nzd_per_kwh: assumed(0.1, 'NZD/kWh'),
      renter_share: assumed(0.4, 'fraction'),
      other_household_share: assumed(0.3, 'fraction'),
      community_share: assumed(0.3, 'fraction'),
      displaced_grid_kgco2e_per_kwh: unknown('kgCO2e/kWh'),
      embodied_kgco2e: unknown('kgCO2e'),
      annual_compute_kwh: unknown('kWh/year'),
      annual_compute_kgco2e: unknown('kgCO2e/year'),
      annual_water_litres: unknown('L/year'),
    },
  };
  for (const [key, value] of Object.entries(changes)) fixture.inputs[key].value = value;
  return fixture;
}
function close(actual, expected, label = '') {
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} differs from ${expected}`);
}
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test('known annual balance keeps capital separate and explicitly allocates positive operating value', () => {
  const result = calculate(scenario());
  assert.deepEqual(result.metrics, {
    generation_kwh: 120000, onsite_kwh: 72000, export_kwh: 48000, import_kwh: 28000,
    avoided_import_cost_nzd: 21600, export_receipts_nzd: 4800, annual_operating_cost_nzd: 2000,
    annual_operating_surplus_nzd: 24400, capital_cost_nzd: 180000, annual_funding_gap_nzd: 0,
  });
  assert.deepEqual(result.allocation, { renters_nzd: 9760, other_households_nzd: 7320, community_nzd: 7320 });
});

test('energy and operating-value conservation across independent demand/generation/use combinations', () => {
  for (const capacity of [0, 0.5, 10, 1000]) {
    for (const demand of [0, 2, 10000, 1e7]) {
      for (const fraction of [0, 0.1, 0.5, 1]) {
        const { metrics: m, allocation: a } = calculate(scenario({
          capacity_kwp: capacity, annual_demand_kwh: demand, onsite_use_fraction: fraction,
        }));
        close(m.onsite_kwh + m.export_kwh, m.generation_kwh, 'generation balance');
        close(m.onsite_kwh + m.import_kwh, demand, 'demand balance');
        assert.ok(m.onsite_kwh <= demand && m.onsite_kwh <= m.generation_kwh);
        assert.ok(m.onsite_kwh >= 0 && m.export_kwh >= 0 && m.import_kwh >= 0);
        close(m.annual_operating_surplus_nzd + m.annual_operating_cost_nzd,
          m.avoided_import_cost_nzd + m.export_receipts_nzd, 'operating-value balance');
        close(Object.values(a).reduce((sum, value) => sum + value, 0),
          Math.max(m.annual_operating_surplus_nzd, 0), 'allocation balance');
      }
    }
  }
});

test('zero generation preserves demand, costs, the funding gap and unknown environmental effects', () => {
  const result = calculate(scenario({ capacity_kwp: 0 }));
  assert.equal(result.metrics.generation_kwh, 0);
  assert.equal(result.metrics.onsite_kwh, 0);
  assert.equal(result.metrics.export_kwh, 0);
  assert.equal(result.metrics.import_kwh, 100000);
  assert.equal(result.metrics.annual_operating_surplus_nzd, -2000);
  assert.equal(result.metrics.annual_funding_gap_nzd, 2000);
  assert.ok(Object.values(result.allocation).every(value => value === 0));
  assert.ok(Object.values(result.environment).every(value => value === null));
});

test('zero demand exports all generation; oversupply clamps onsite use to demand', () => {
  const empty = calculate(scenario({ annual_demand_kwh: 0 }));
  assert.equal(empty.metrics.onsite_kwh, 0);
  assert.equal(empty.metrics.export_kwh, 120000);
  assert.equal(empty.metrics.import_kwh, 0);
  const small = calculate(scenario({ annual_demand_kwh: 5000 }));
  assert.equal(small.metrics.onsite_kwh, 5000);
  assert.equal(small.metrics.export_kwh, 115000);
  assert.equal(small.metrics.import_kwh, 0);
});

test('negative and exactly zero operating surplus cannot create benefits', () => {
  for (const operatingCost of [26400, 30000]) {
    const { metrics, allocation } = calculate(scenario({ annual_operating_cost_nzd: operatingCost }));
    assert.ok(Object.values(allocation).every(value => value === 0));
    assert.equal(metrics.annual_funding_gap_nzd, operatingCost - 26400);
  }
});

test('all benefit shares may be assigned to renters; zero prices are valid', () => {
  const renters = calculate(scenario({ renter_share: 1, other_household_share: 0, community_share: 0 }));
  assert.equal(renters.allocation.renters_nzd, 24400);
  assert.equal(renters.allocation.other_households_nzd, 0);
  assert.equal(renters.allocation.community_nzd, 0);
  const free = calculate(scenario({ import_price_nzd_per_kwh: 0, export_price_nzd_per_kwh: 0 }));
  assert.equal(free.metrics.annual_operating_surplus_nzd, -2000);
});

test('environment keeps incompatible stock/annual measures separate and only estimates onsite displacement', () => {
  const input = scenario();
  input.inputs.displaced_grid_kgco2e_per_kwh = assumed(0.1, 'kgCO2e/kWh');
  input.inputs.embodied_kgco2e = assumed(40000, 'kgCO2e');
  input.inputs.annual_compute_kwh = assumed(12, 'kWh/year');
  input.inputs.annual_compute_kgco2e = assumed(2, 'kgCO2e/year');
  input.inputs.annual_water_litres = assumed(80, 'L/year');
  assert.deepEqual(calculate(input).environment, {
    gross_operational_proxy_kgco2e: 7200, embodied_kgco2e: 40000,
    annual_compute_kwh: 12, annual_compute_kgco2e: 2, annual_water_litres: 80,
  });
  input.inputs.annual_compute_kgco2e = unknown('kgCO2e/year');
  assert.equal(calculate(input).environment.annual_compute_kgco2e, null);
  assert.ok(!Object.keys(calculate(input).environment).some(key => key.includes('net')));
});

test('repeatable output does not mutate even a deeply frozen input and does not round values', () => {
  const input = deepFreeze(scenario({ import_price_nzd_per_kwh: 1 / 7 }));
  const before = JSON.stringify(input);
  const result = calculate(input);
  assert.equal(JSON.stringify(result), JSON.stringify(calculate(input)));
  assert.equal(JSON.stringify(input), before);
  close(result.metrics.avoided_import_cost_nzd, 72000 / 7);
  assert.notEqual(result.metrics.avoided_import_cost_nzd, Number(result.metrics.avoided_import_cost_nzd.toFixed(2)));
  assert.ok(MODEL_VERSION.length > 0);
});

test('rejects nonfinite, negative and nonnumeric values in every numeric input', () => {
  for (const key of Object.keys(scenario().inputs)) {
    for (const value of [NaN, Infinity, -Infinity, -1, '3', undefined]) {
      const input = scenario();
      input.inputs[key] = { ...input.inputs[key], value, basis: 'illustrative_assumption' };
      assert.throws(() => calculate(input), new RegExp(`${key}.*finite nonnegative`));
    }
  }
});

test('rejects bad fractions and share sums but tolerates binary representation error', () => {
  for (const key of ['onsite_use_fraction', 'renter_share', 'other_household_share', 'community_share']) {
    assert.throws(() => calculate(scenario({ [key]: 1.01 })), /between 0 and 1/);
  }
  for (const share of [0, 0.4001, 1]) {
    assert.throws(() => calculate(scenario({ renter_share: share })), /must sum to 1/);
  }
  assert.doesNotThrow(() => calculate(scenario({ renter_share: 0.1, other_household_share: 0.2, community_share: 0.7 })));
});

test('every input has a required exact unit and a known provenance basis', () => {
  for (const key of Object.keys(scenario().inputs)) {
    const absent = scenario();
    delete absent.inputs[key];
    assert.throws(() => calculate(absent), new RegExp(`${key} is required`));
    const incorrectUnit = scenario();
    incorrectUnit.inputs[key].unit = 'wrong unit';
    assert.throws(() => calculate(incorrectUnit), /unit must be/);
  }
  const basis = scenario();
  basis.inputs.capacity_kwp.basis = 'verified_by_ai';
  assert.throws(() => calculate(basis), /basis is unsupported/);
  const extra = scenario();
  extra.inputs.battery_kwh = assumed(100, 'kWh');
  assert.throws(() => calculate(extra), /Unsupported input: battery_kwh/);
});

test('source-reported and derived values need explicit evidence identifiers', () => {
  for (const basis of ['source_reported', 'derived']) {
    const input = scenario();
    input.inputs.capacity_kwp.basis = basis;
    assert.throws(() => calculate(input), /must cite evidence/);
    input.inputs.capacity_kwp.evidence_ids = ['test-evidence'];
    assert.doesNotThrow(() => calculate(input));
  }
  const input = scenario();
  input.inputs.capacity_kwp.evidence_ids = [null];
  assert.throws(() => calculate(input), /evidence_ids\[0\]/);
});

test('null is reserved for explicitly unknown environmental inputs', () => {
  const required = scenario();
  required.inputs.capacity_kwp.value = null;
  required.inputs.capacity_kwp.basis = 'unknown';
  assert.throws(() => calculate(required), /cannot be null/);
  const hiddenUnknown = scenario();
  hiddenUnknown.inputs.embodied_kgco2e.basis = 'illustrative_assumption';
  assert.throws(() => calculate(hiddenUnknown), /basis must be unknown/);
  const inventedUnknown = scenario();
  inventedUnknown.inputs.embodied_kgco2e.value = 0;
  assert.throws(() => calculate(inventedUnknown), /value must be null/);
});

test('rejects malformed metadata and unsupported status/version without time-dependent rules', () => {
  for (const invalid of [null, undefined, [], 'scenario']) assert.throws(() => validateScenario(invalid), /must be an object/);
  for (const [key, values] of Object.entries({
    schema_version: ['v2', undefined], id: ['', 'bad id', '../escape'], title: ['', null],
    location: [' ', 42], price_year: [1899, 2201, 2026.5, '2026', Infinity],
    status: ['measured', 'validated'], assumptions: [null, 'assumption', ['']], unknowns: [undefined, [7]],
    inputs: [null, []],
  })) {
    for (const value of values) {
      const input = scenario(); input[key] = value;
      assert.throws(() => validateScenario(input), new RegExp(key));
    }
  }
});

test('refuses overflow in energy, monetary products, monetary sums and emissions', () => {
  assert.throws(() => calculate(scenario({ capacity_kwp: Number.MAX_VALUE })), /overflow.*generation/);
  assert.throws(() => calculate(scenario({ import_price_nzd_per_kwh: Number.MAX_VALUE })), /overflow.*avoided/);
  assert.throws(() => calculate(scenario({ export_price_nzd_per_kwh: Number.MAX_VALUE })), /overflow.*export/);
  const sum = scenario({
    capacity_kwp: 2, annual_yield_kwh_per_kwp: 1, annual_demand_kwh: 1, onsite_use_fraction: 0.5,
    import_price_nzd_per_kwh: Number.MAX_VALUE, export_price_nzd_per_kwh: Number.MAX_VALUE,
  });
  assert.throws(() => calculate(sum), /overflow.*gross operating value/);
  const emissions = scenario();
  emissions.inputs.displaced_grid_kgco2e_per_kwh = assumed(Number.MAX_VALUE, 'kgCO2e/kWh');
  assert.throws(() => calculate(emissions), /overflow.*gross_operational_proxy/);
});
