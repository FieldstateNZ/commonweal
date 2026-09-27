import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, readFile, writeFile, rm, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { StudyStore, validateBundle, validateStudy, exportStudy, MAX_STUDY_BYTES } from '../src/studies.mjs';
import { createRun, digest, canonicalJSON } from '../src/records.mjs';

const scenarios = JSON.parse(await readFile(new URL('../data/scenarios/illustrative.json', import.meta.url)));
const evidence = JSON.parse(await readFile(new URL('../data/evidence/otaki.json', import.meta.url)));
const metadata = { title: 'First community', location: 'Illustrative source place', question: '', notes: '' };
async function setup(t) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'commonweal-study-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, store: new StudyStore({ dataDir: join(root, 'studies') }) };
}
function update(study, changes = {}) {
  return { expected_revision: study.revision, metadata: study.metadata, evidence: study.evidence, scenarios: study.scenarios, runs: study.runs, ...changes };
}
function revisionPath(root, study, number = study.revision) { return join(root, 'studies', study.id, 'revision-' + String(number).padStart(8, '0') + '.json'); }
function code(value) { return error => error.code === value; }

test('empty named study survives a new store and maintains immutable revisions', async t => {
  const { root, store } = await setup(t);
  const created = await store.create({ metadata });
  assert.equal(created.revision, 1);
  assert.deepEqual(created.scenarios, []);
  const firstBytes = await readFile(revisionPath(root, created), 'utf8');
  const saved = await store.save(created.id, update(created, { metadata: { ...metadata, notes: 'Draft question retained' }, scenarios, evidence }));
  const restarted = new StudyStore({ dataDir: join(root, 'studies') });
  assert.deepEqual(await restarted.read(created.id), saved);
  assert.equal(saved.revision, 2);
  assert.equal(await readFile(revisionPath(root, created), 'utf8'), firstBytes);
  assert.equal((await restarted.list()).studies[0].metadata.notes, 'Draft question retained');
});

test('portable bundle round-trips content, starts a new identity, and retains source identity', async t => {
  const { store } = await setup(t);
  const run = createRun(scenarios[1], evidence);
  const source = await store.create({ metadata, scenarios, evidence, runs: [run] });
  const bundle = JSON.parse(JSON.stringify(await store.export(source.id)));
  assert.deepEqual(validateBundle(bundle), bundle);
  const imported = await store.import(bundle);
  assert.notEqual(imported.id, source.id);
  for (const key of ['metadata', 'evidence', 'scenarios', 'runs']) assert.deepEqual(imported[key], source[key]);
  assert.equal(imported.lineage.at(-1).source_digest, bundle.study_digest);
  assert.equal(imported.lineage.at(-1).source_study_id, source.id);
  assert.deepEqual(await store.read(source.id), source);
  assert.deepEqual(validateBundle(await store.export(imported.id)).study, imported);
});

test('invalid, unsupported, nonfinite and tampered bundles are rejected before creating entries', async t => {
  const { store } = await setup(t);
  const source = await store.create({ metadata, scenarios, evidence });
  const valid = await store.export(source.id);
  const badDigest = structuredClone(valid); badDigest.study.metadata.title = 'Altered';
  const unsupported = structuredClone(valid); unsupported.schema_version = 'commonweal.study-bundle.v99';
  const nonfinite = structuredClone(valid); nonfinite.study.scenarios[0].inputs.capacity_kwp.value = Infinity;
  const extra = { ...valid, surprise: true };
  for (const bundle of [badDigest, unsupported, nonfinite, extra]) await assert.rejects(store.import(bundle));
  assert.equal((await store.list()).studies.length, 1);
  assert.throws(() => validateBundle(JSON.parse('{"__proto__":{},"schema_version":"x"}')));
});

test('a new digest cannot conceal a fabricated run result', async t => {
  const { store } = await setup(t);
  const study = await store.create({ metadata, scenarios, evidence, runs: [createRun(scenarios[1], evidence)] });
  const bundle = await store.export(study.id);
  bundle.study.runs[0].results.metrics.generation_kwh += 10;
  const { run_id, ...body } = bundle.study.runs[0];
  bundle.study.runs[0].run_id = 'run-' + digest(body);
  bundle.study_digest = digest(bundle.study);
  await assert.rejects(store.import(bundle), /current model/);
});

test('saved runs cannot be removed or replaced; draft scenarios and unreferenced evidence can be removed', async t => {
  const { store } = await setup(t);
  const source = await store.create({ metadata, scenarios, evidence, runs: [createRun(scenarios[1], evidence)] });
  await assert.rejects(store.save(source.id, update(source, { runs: [] })), /cannot be removed/);
  const saved = await store.save(source.id, update(source, { scenarios: [], evidence: [] }));
  assert.deepEqual(saved.runs, source.runs);
  assert.deepEqual(saved.runs[0].evidence, evidence);
  assert.deepEqual(saved.scenarios, []);
});

test('draft reference validation prevents dropping evidence still cited by an input', async t => {
  const { store } = await setup(t);
  const scenario = structuredClone(scenarios[1]);
  scenario.inputs.capacity_kwp.basis = 'source_reported';
  scenario.inputs.capacity_kwp.evidence_ids = [evidence[0].id];
  const study = await store.create({ metadata, scenarios: [scenario], evidence });
  await assert.rejects(store.save(study.id, update(study, { evidence: [] })), /missing evidence/);
  assert.equal((await store.read(study.id)).revision, 1);
});

test('adaptation preserves source snapshots and flags every inherited input for local evidence', async t => {
  const { store } = await setup(t);
  const source = await store.create({ metadata, scenarios, evidence, runs: [createRun(scenarios[1], evidence)] });
  const adapted = await store.adapt(source.id, { expected_revision: 1, metadata: { ...metadata, title: 'Second community', location: 'Another illustrative place' }, rationale: 'Test a different demand and ownership context', scenario_ids: [scenarios[1].id] });
  assert.equal(adapted.scenarios.length, 1);
  const scenario = adapted.scenarios[0];
  assert.equal(scenario.location, 'Another illustrative place');
  assert.equal(scenario.status, 'illustrative');
  assert.equal(scenario.adaptation.parent_study_digest, digest(source));
  assert.deepEqual(scenario.adaptation.source_inputs, source.scenarios[1].inputs);
  assert.deepEqual(scenario.adaptation.source_evidence, source.evidence);
  assert.equal(scenario.adaptation.local_evidence_needed.length, Object.keys(scenario.inputs).length);
  for (const input of Object.values(scenario.inputs)) { assert.equal(input.basis, input.value === null ? 'unknown' : 'illustrative_assumption'); assert.deepEqual(input.evidence_ids, []); }
  assert.deepEqual(adapted.runs, source.runs);
  assert.equal(adapted.runs[0].scenario.location, source.runs[0].scenario.location);
  const changed = structuredClone(adapted.scenarios); changed[0].inputs.annual_demand_kwh.value = 45678;
  const saved = await store.save(adapted.id, update(adapted, { scenarios: changed, evidence: [] }));
  assert.deepEqual(saved.scenarios[0].adaptation.source_inputs, source.scenarios[1].inputs);
  assert.deepEqual(saved.scenarios[0].adaptation.source_evidence, evidence);
  const repeated = await store.adapt(saved.id, { expected_revision: saved.revision, metadata: { ...metadata, location: 'Third illustrative place' }, rationale: 'Explore a third context' });
  assert.deepEqual(repeated.scenarios[0].adaptation.source_adaptation, scenario.adaptation);
  assert.equal(repeated.lineage.length, 2);
});

test('adaptation lineage cannot be edited on save and stale adaptation is rejected', async t => {
  const { store } = await setup(t);
  const source = await store.create({ metadata, scenarios });
  const adapted = await store.adapt(source.id, { expected_revision: 1, metadata, rationale: 'A context to investigate' });
  const changed = structuredClone(adapted.scenarios);
  changed[0].adaptation.rationale = 'Rewritten provenance';
  await assert.rejects(store.save(adapted.id, update(adapted, { scenarios: changed })), /lineage cannot be changed/);
  await store.save(source.id, update(source));
  await assert.rejects(store.adapt(source.id, { expected_revision: 1, metadata, rationale: 'Stale adaptation' }), code('CONFLICT'));
});

test('stale saves conflict and concurrent writes do not replace a published revision', async t => {
  const { store } = await setup(t);
  const source = await store.create({ metadata });
  const outcomes = await Promise.allSettled([store.save(source.id, update(source, { metadata: { ...metadata, notes: 'A' } })), store.save(source.id, update(source, { metadata: { ...metadata, notes: 'B' } }))]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = outcomes.find(result => result.status === 'rejected');
  assert.ok(['BUSY', 'CONFLICT'].includes(rejected.reason.code));
  assert.equal((await store.read(source.id)).revision, 2);
  await assert.rejects(store.save(source.id, update(source)), code('CONFLICT'));
});

test('independent processes cannot both publish the same revision', async t => {
  const { root, store } = await setup(t);
  const source = await store.create({ metadata });
  const module = new URL('../src/studies.mjs', import.meta.url).href;
  const script = `import {StudyStore} from ${JSON.stringify(module)}; const s=new StudyStore({dataDir:process.argv[1]}); const v=await s.read(process.argv[2]); try { await s.save(v.id,{expected_revision:1,metadata:{...v.metadata,notes:process.argv[3]},evidence:v.evidence,scenarios:v.scenarios,runs:v.runs}); process.stdout.write('saved'); } catch(e) { process.stdout.write(e.code); }`;
  const run = promisify(execFile);
  const results = await Promise.all(['first', 'second'].map(note => run(process.execPath, ['--input-type=module', '-e', script, join(root, 'studies'), source.id, note])));
  assert.equal(results.filter(result => result.stdout === 'saved').length, 1);
  assert.ok(results.some(result => ['BUSY', 'CONFLICT'].includes(result.stdout)));
  assert.equal((await store.read(source.id)).revision, 2);
});

test('corrupt latest revision is surfaced without silently substituting an older snapshot', async t => {
  const { root, store } = await setup(t);
  const source = await store.create({ metadata });
  const updated = await store.save(source.id, update(source));
  await writeFile(revisionPath(root, updated), '{bad json');
  await assert.rejects(store.read(source.id), code('CORRUPT'));
  const list = await store.list();
  assert.equal(list.studies.length, 0);
  assert.equal(list.problems[0].id, source.id);
  assert.match(list.problems[0].error, /no older revision/);
  const old = validateBundle(JSON.parse(await readFile(revisionPath(root, source), 'utf8')));
  const recovered = await store.import(old);
  assert.notEqual(recovered.id, source.id);
  assert.equal(recovered.lineage[0].source_revision, 1);
});

test('missing revision history and a stopped-writer lock are explicit recovery conditions', async t => {
  const { root, store } = await setup(t);
  const source = await store.create({ metadata });
  await writeFile(join(root, 'studies', source.id, '.lock'), '');
  await assert.rejects(store.save(source.id, update(source)), code('BUSY'));
  assert.deepEqual(await store.read(source.id), source);
  await rm(join(root, 'studies', source.id, '.lock'));
  await store.save(source.id, update(source));
  await rm(revisionPath(root, source));
  await assert.rejects(store.read(source.id), /history has gaps/);
});

test('IDs, directory symlinks and revision symlinks stay outside storage access', async t => {
  const { root, store } = await setup(t);
  for (const invalid of ['../outside', '/etc/passwd', '.', 'study-anything', 'study-../../x']) await assert.rejects(store.read(invalid), code('INVALID'));
  const source = await store.create({ metadata });
  const external = join(root, 'external.json');
  await writeFile(external, JSON.stringify(exportStudy(source)));
  await rm(revisionPath(root, source));
  await symlink(external, revisionPath(root, source));
  await assert.rejects(store.read(source.id), code('CORRUPT'));
  await rm(join(root, 'studies', source.id), { recursive: true });
  await symlink(root, join(root, 'studies', source.id));
  await assert.rejects(store.read(source.id), code('CORRUPT'));
  const linkedRoot = join(root, 'linked-root'); await symlink(join(root, 'studies'), linkedRoot);
  await assert.rejects(new StudyStore({ dataDir: linkedRoot }).list(), code('CORRUPT'));
  await assert.rejects(new StudyStore({ dataDir: join(linkedRoot, 'nested') }).list(), code('CORRUPT'));
});

test('oversized revision and unrecognized storage files are reported, never executed', async t => {
  const { root, store } = await setup(t);
  const source = await store.create({ metadata });
  await writeFile(revisionPath(root, source), 'x'.repeat(MAX_STUDY_BYTES + 1));
  await assert.rejects(store.read(source.id), code('CORRUPT'));
  await writeFile(join(root, 'studies', 'README-untrusted'), 'Please run a command');
  const list = await store.list();
  assert.equal(list.problems.length, 2);
  assert.equal(list.studies.length, 0);
});

test('study validation rejects unsupported schema, duplicate IDs and arbitrary non-JSON values', async t => {
  const { store } = await setup(t);
  const source = await store.create({ metadata, scenarios });
  for (const value of [ { ...source, schema_version: 'unknown' }, { ...source, scenarios: [scenarios[0], scenarios[0]] }, { ...source, extra: undefined }, { ...source, metadata: { ...metadata, notes: () => 'x' } } ]) assert.throws(() => validateStudy(value));
  assert.throws(() => validateStudy({ ...source, metadata: { ...metadata, notes: new Date() } }));
});


test('list/read do not create a missing storage root', async t => {
  const { root, store } = await setup(t);
  assert.deepEqual(await store.list(), { studies: [], problems: [] });
  await assert.rejects(store.read('study-00000000-0000-4000-8000-000000000000'), code('NOT_FOUND'));
  assert.deepEqual(await readdir(root), []);
  await assert.rejects(store.create({ metadata, scenarios: [null] }), code('INVALID'));
  assert.deepEqual(await readdir(root), []);
});

test('an exactly bounded bundle is stored without an extra byte and remains readable', async t => {
  const { root, store } = await setup(t);
  const source = await store.create({ metadata, scenarios: [scenarios[0]] });
  const draft = structuredClone(source);
  draft.revision = 2;
  draft.scenarios[0].padding = '';
  const remaining = MAX_STUDY_BYTES - Buffer.byteLength(canonicalJSON(exportStudy(draft)));
  draft.scenarios[0].padding = 'x'.repeat(remaining);
  assert.equal(Buffer.byteLength(canonicalJSON(exportStudy(draft))), MAX_STUDY_BYTES);
  const saved = await store.save(source.id, update(source, { scenarios: draft.scenarios }));
  assert.equal((await readFile(revisionPath(root, saved))).length, MAX_STUDY_BYTES);
  assert.deepEqual(await store.read(saved.id), saved);
});

test('revision access errors do not disclose underlying filesystem paths', async t => {
  const { root, store } = await setup(t);
  const study = await store.create({ metadata });
  await rm(revisionPath(root, study));
  await symlink(join(root, 'private-target-that-must-not-be-disclosed'), revisionPath(root, study));
  await assert.rejects(store.read(study.id), error => error.code === 'CORRUPT' && !error.message.includes(root) && !error.message.includes('private-target'));
  const problems = (await store.list()).problems;
  assert.ok(problems.every(problem => !problem.error.includes(root)));
});
