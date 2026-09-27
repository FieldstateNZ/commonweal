import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRun, verifyRun, compareRuns, validateEvidence, canonicalJSON } from '../src/records.mjs';
import { makeServer } from '../src/server.mjs';
import { examples } from '../src/examples.mjs';

const execute = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const clone = structuredClone;

function reorderKeys(value) {
  if (Array.isArray(value)) return value.map(reorderKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).reverse().map(key => [key, reorderKeys(value[key])]));
  }
  return value;
}

async function fixtures() {
  const data = await examples();
  assert.ok(data.scenarios.length >= 2, 'Two real repository example scenarios must be usable');
  assert.ok(data.evidence.length > 0, 'The supplied study must include evidence records');
  return data;
}

// Use raw Node HTTP so path traversal and Host tests reach the server unchanged.
function http(port, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: response.statusCode, headers: response.headers, text,
          json: () => JSON.parse(text) });
      });
    });
    req.setTimeout(5000, () => req.destroy(new Error('Local HTTP test timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

async function serverFor(t) {
  const server = makeServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const port = server.address().port;
  return {
    port,
    get: (path, options) => http(port, path, options),
    post: (path, data, headers = {}) => http(port, path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data),
    }),
  };
}

test('repository examples create reproducible runs independent of object-key order', async () => {
  const { scenarios, evidence } = await fixtures();
  for (const scenario of scenarios) {
    const run = createRun(scenario, evidence);
    const reordered = createRun(reorderKeys(scenario), reorderKeys(evidence));
    assert.match(run.run_id, /^run-[a-f0-9]{64}$/);
    assert.equal(reordered.run_id, run.run_id);
    assert.equal(canonicalJSON(run), canonicalJSON(reordered));
    assert.deepEqual(verifyRun(JSON.parse(JSON.stringify(run))), run);
  }
});

test('changed numeric assumptions or evidence versions create distinct identities without mutating input', async () => {
  const { scenarios, evidence } = await fixtures();
  const scenario = scenarios[0];
  const before = JSON.stringify({ scenario, evidence });
  const baseline = createRun(scenario, evidence);
  const changedInput = clone(scenario);
  changedInput.inputs.annual_operating_cost_nzd.value += 1;
  const alternative = createRun(changedInput, evidence);
  assert.notEqual(alternative.run_id, baseline.run_id);
  assert.equal(alternative.results.metrics.annual_operating_surplus_nzd,
    baseline.results.metrics.annual_operating_surplus_nzd - 1);
  const changedEvidence = clone(evidence);
  changedEvidence[0].version += '-revision';
  const revised = createRun(scenario, changedEvidence);
  assert.notEqual(revised.run_id, baseline.run_id);
  assert.deepEqual(revised.results, baseline.results, 'Evidence metadata alone does not invent a numeric effect');
  assert.equal(JSON.stringify({ scenario, evidence }), before);
});

test('run construction rejects unresolved evidence and multiple versions of one evidence ID', async () => {
  const { scenarios, evidence } = await fixtures();
  const missing = clone(scenarios[0]);
  missing.inputs.capacity_kwp.evidence_ids = ['not-in-this-evidence-bundle'];
  assert.throws(() => createRun(missing, evidence), /references missing evidence/);
  const cited = clone(scenarios[0]);
  cited.inputs.capacity_kwp.evidence_ids = [evidence[0].id];
  assert.doesNotThrow(() => createRun(cited, evidence));
  const duplicate = { ...clone(evidence[0]), version: evidence[0].version + '-another' };
  assert.throws(() => createRun(scenarios[0], [...evidence, duplicate]), /Duplicate evidence id/);
  assert.throws(() => validateEvidence([...evidence, duplicate]), /Duplicate evidence id/);
});

test('imported outputs must recompute exactly even if someone updates the claimed digest', async () => {
  const { scenarios, evidence } = await fixtures();
  const baseline = createRun(scenarios[0], evidence);
  const imported = clone(baseline);
  imported.results.metrics.generation_kwh += 1000000;
  // A consumer must not trust a result because it has a run-shaped envelope.
  assert.throws(() => verifyRun(imported), /does not match/);
  assert.throws(() => compareRuns([baseline, imported]), /does not match/);
  const { run_id, ...body } = imported;
  const { digest } = await import('../src/records.mjs');
  imported.run_id = 'run-' + digest(body);
  assert.throws(() => verifyRun(imported), /does not match/);
  assert.throws(() => compareRuns([baseline, imported]), /does not match/);
  const oldModel = clone(baseline);
  oldModel.model.version = 'unavailable-model-version';
  assert.throws(() => verifyRun(oldModel), /does not match/);
});

test('comparison direction is explicit, identical inputs have zero differences, and price years cannot mix', async () => {
  const { scenarios, evidence } = await fixtures();
  const baseline = createRun(scenarios[0], evidence);
  const identical = compareRuns([baseline, baseline]);
  assert.ok(Object.values(identical.deltas).every(delta => delta === 0));
  const altered = clone(scenarios[0]);
  altered.inputs.annual_operating_cost_nzd.value += 25;
  const alternative = createRun(altered, evidence);
  const comparison = compareRuns([baseline, alternative]);
  assert.equal(comparison.direction, 'alternative minus baseline');
  assert.equal(comparison.deltas.annual_operating_cost_nzd, 25);
  assert.equal(comparison.deltas.annual_operating_surplus_nzd, -25);
  altered.price_year = scenarios[0].price_year === 2200 ? 2199 : scenarios[0].price_year + 1;
  assert.throws(() => compareRuns([baseline, createRun(altered, evidence)]), /same NZD price year/);
  for (const invalid of [null, [], [baseline], [baseline, baseline, baseline]]) {
    assert.throws(() => compareRuns(invalid), /exactly two runs/);
  }
});

test('comparisons expose redistribution separately and preserve unknown environmental differences', async () => {
  const { scenarios, evidence } = await fixtures();
  const scenario = clone(scenarios[1]);
  const baseline = createRun(scenario, evidence);
  assert.ok(baseline.results.metrics.annual_operating_surplus_nzd > 0, 'This fixture must have value to redistribute');
  scenario.inputs.renter_share.value = 1;
  scenario.inputs.other_household_share.value = 0;
  scenario.inputs.community_share.value = 0;
  const alternative = createRun(scenario, evidence);
  const comparison = compareRuns([baseline, alternative]);
  assert.ok(Object.values(comparison.deltas).every(delta => delta === 0), 'Redistribution must not manufacture more energy or money');
  assert.ok(comparison.allocation_deltas.renters_nzd > 0);
  assert.ok(comparison.allocation_deltas.community_nzd < 0);
  const totalChange = Object.values(comparison.allocation_deltas).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(totalChange) < 1e-8, 'Changes of benefit shares must conserve total allocated value');
  assert.ok(Object.values(comparison.environment_deltas).every(delta => delta === null), 'Two unknowns do not produce a zero difference');
  scenario.inputs.annual_compute_kwh = {
    value: 12, unit: 'kWh/year', basis: 'illustrative_assumption', evidence_ids: [],
  };
  const knownCompute = createRun(scenario, evidence);
  assert.equal(compareRuns([baseline, knownCompute]).environment_deltas.annual_compute_kwh, null);
  scenario.inputs.annual_compute_kwh.value = 20;
  const moreCompute = createRun(scenario, evidence);
  assert.equal(compareRuns([knownCompute, moreCompute]).environment_deltas.annual_compute_kwh, 8);
  for (const [section, key, change] of [
    ['allocation', 'renters_nzd', 1], ['environment', 'annual_compute_kwh', 500],
  ]) {
    const fabricated = clone(moreCompute);
    fabricated.results[section][key] = change;
    assert.throws(() => verifyRun(fabricated), /does not match/);
  }
});

test('evidence validation rejects malformed dates, URLs, dangerous keys and excessive nesting', async () => {
  const { evidence } = await fixtures();
  for (const invalidDate of ['2025-02-30', 'yesterday', '2026-13-01']) {
    const changed = clone(evidence);
    changed[0].source.accessed_at = invalidDate;
    assert.throws(() => validateEvidence(changed), /valid ISO date/);
  }
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://name:password@example.org/']) {
    const changed = clone(evidence);
    changed[0].source.url = url;
    assert.throws(() => validateEvidence(changed), /HTTP\(S\)/);
  }
  assert.throws(() => canonicalJSON(JSON.parse('{"__proto__":{"polluted":true}}')), /Unsupported JSON key/);
  let nested = {};
  for (let depth = 0; depth < 42; depth++) nested = { child: nested };
  assert.throws(() => canonicalJSON(nested), /nesting exceeds/);
  assert.throws(() => canonicalJSON({ value: Infinity }), /finite/);
  assert.equal({}.polluted, undefined);
});

test('local HTTP runs the complete evidence import, scenario, compare and verification loop', async t => {
  const api = await serverFor(t);
  const health = await api.get('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.json().status, 'ok');
  assert.equal(health.headers['cache-control'], 'no-store');
  assert.equal(health.headers['x-content-type-options'], 'nosniff');
  const operationResponse = await api.get('/api/operations');
  assert.equal(operationResponse.status, 200);
  const operations = operationResponse.json();
  for (const required of ['examples', 'import_evidence', 'run_scenario', 'compare_runs', 'verify_run']) {
    assert.ok(operations.operations.some(operation => operation.name === required));
  }
  const exampleResponse = await api.get('/api/examples');
  assert.equal(exampleResponse.status, 200);
  const { scenarios, evidence } = exampleResponse.json();
  const imported = await api.post('/api/validate-evidence', { evidence });
  assert.equal(imported.status, 200);
  assert.deepEqual(imported.json().evidence, evidence);
  assert.ok(imported.json().warnings.length > 0, 'Import must not imply factual verification');
  const runs = [];
  for (const scenario of scenarios.slice(0, 2)) {
    const response = await api.post('/api/run', { scenario, evidence });
    assert.equal(response.status, 200, response.text);
    assert.deepEqual(response.json(), createRun(scenario, evidence));
    runs.push(response.json());
  }
  const comparison = await api.post('/api/compare', { runs });
  assert.equal(comparison.status, 200, comparison.text);
  assert.deepEqual(comparison.json(), compareRuns(runs));
  const verified = await api.post('/api/verify', { run: runs[0] });
  assert.equal(verified.status, 200);
  assert.deepEqual(verified.json(), { valid: true, run_id: runs[0].run_id });
  const tampered = clone(runs[1]);
  tampered.results.metrics.generation_kwh += 1;
  assert.equal((await api.post('/api/compare', { runs: [runs[0], tampered] })).status, 400);
  assert.equal((await api.post('/api/verify', { run: tampered })).status, 400);
});

test('HTTP input failures return errors and do not kill the local process', async t => {
  const api = await serverFor(t);
  const malformed = await api.get('/api/run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(malformed.status, 400);
  assert.match(malformed.json().error, /valid JSON/);
  assert.equal((await api.get('/api/run', { method: 'POST', body: '{}' })).status, 415);
  for (const data of [null, [], 5, 'text', {}, { scenario: {} }]) {
    const response = await api.post('/api/run', data);
    assert.equal(response.status, 400, JSON.stringify(data));
    assert.equal(typeof response.json().error, 'string');
  }
  assert.equal((await api.post('/api/validate-evidence', { evidence: {} })).status, 400);
  assert.equal((await api.post('/api/compare', { runs: [] })).status, 400);
  assert.equal((await api.post('/api/verify', { run: {} })).status, 400);
  assert.equal((await api.get('/api/health')).json().status, 'ok');
});

test('HTTP confines access to local origins and explicit asset routes', async t => {
  const api = await serverFor(t);
  const rejectedHost = await api.get('/api/health', { headers: { Host: 'attacker.example' } });
  assert.equal(rejectedHost.status, 403);
  const rejectedOrigin = await api.get('/api/health', { headers: { Origin: 'https://attacker.example' } });
  assert.equal(rejectedOrigin.status, 403);
  const localOrigin = await api.get('/api/health', { headers: { Origin: `http://127.0.0.1:${api.port}` } });
  assert.equal(localOrigin.status, 200);
  for (const path of ['/../README.md', '/%2e%2e/README.md', '/%2e%2e%2fREADME.md', '/src/server.mjs', '/.git/config', '/api/missing']) {
    const response = await api.get(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.json().error, 'Unknown route');
  }
  assert.equal((await api.post('/api/missing', {})).status, 404);
});

test('real CLI commands produce portable JSON runs and verify/compare exported files', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'commonweal-cli-test-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const invoke = async (...args) => {
    const output = await execute(process.execPath, [cli, ...args], { cwd: temporary, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(output.stderr, '');
    return JSON.parse(output.stdout);
  };
  const data = await invoke('examples');
  assert.deepEqual(data, await examples(), 'CLI paths should not depend on the working directory');
  assert.ok((await invoke('operations')).operations.length >= 5);
  const evidencePath = join(temporary, 'evidence.json');
  await writeFile(evidencePath, JSON.stringify(data.evidence));
  assert.deepEqual((await invoke('validate-evidence', evidencePath)).evidence, data.evidence);
  const paths = [];
  const runs = [];
  for (const [index, scenario] of data.scenarios.slice(0, 2).entries()) {
    const scenarioPath = join(temporary, `scenario-${index}.json`);
    const runPath = join(temporary, `run-${index}.json`);
    await writeFile(scenarioPath, JSON.stringify(scenario));
    const run = await invoke('run', scenarioPath, '--evidence', evidencePath);
    assert.deepEqual(run, createRun(scenario, data.evidence));
    await writeFile(runPath, JSON.stringify(run));
    assert.deepEqual(await invoke('verify', runPath), { valid: true, run_id: run.run_id });
    runs.push(run); paths.push(runPath);
  }
  assert.deepEqual(await invoke('compare', ...paths), compareRuns(runs));
});

test('CLI rejects malformed commands, invalid JSON and fabricated imported results with nonzero status', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'commonweal-cli-invalid-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const invalidFile = join(temporary, 'bad.json');
  await writeFile(invalidFile, '{');
  const { scenarios, evidence } = await fixtures();
  const fabricated = createRun(scenarios[0], evidence);
  fabricated.results.metrics.generation_kwh += 1;
  const fakeRun = join(temporary, 'fabricated.json');
  await writeFile(fakeRun, JSON.stringify(fabricated));
  for (const args of [
    ['does-not-exist'], ['operations', 'extra'], ['run'], ['run', invalidFile, '--unknown', invalidFile],
    ['run', invalidFile], ['compare', fakeRun], ['verify', fakeRun], ['verify', join(temporary, 'missing.json')],
  ]) {
    await assert.rejects(execute(process.execPath, [cli, ...args], { cwd: temporary }), error => {
      assert.equal(error.code, 1, args.join(' '));
      assert.equal(error.stdout, '', 'Errors must not produce partial machine-readable success output');
      assert.ok(error.stderr.trim().length > 0);
      return true;
    });
  }
});
