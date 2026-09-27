import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, lstat, readdir, open, unlink, link, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJSON, digest, createRun, validateEvidence, verifyRun } from './records.mjs';

export const MAX_STUDY_BYTES = 8 * 1024 * 1024;
const DEFAULT_DIR = fileURLToPath(new URL('../.commonweal/studies', import.meta.url));
const ID = /^study-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const REVISION = /^revision-(\d{8})\.json$/;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export class StudyError extends Error {
  constructor(code, message) { super(message); this.name = 'StudyError'; this.code = code; }
}
function fail(message, code = 'INVALID') { throw new StudyError(code, message); }
function exact(value, keys, label) {
  if (!object(value)) fail(label + ' must be an object');
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(label + ' has unsupported field ' + key);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(label + ' requires ' + key);
}
function string(value, label, { empty = false, max = 10000 } = {}) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) fail(label + ' must be ' + (empty ? 'a' : 'a nonempty') + ' string of at most ' + max + ' characters');
}
function id(value) { if (typeof value !== 'string' || !ID.test(value)) fail('Invalid local study id'); }
function revision(value) { if (!Number.isSafeInteger(value) || value < 1 || value > 99999999) fail('revision must be an integer from 1 to 99999999'); }
function hash(value) { if (typeof value !== 'string' || !HASH.test(value)) fail('Invalid study digest'); }
function date(value) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('Study timestamps must be full ISO timestamps'); }
function array(value, label, maximum = 100) { if (!Array.isArray(value) || value.length > maximum) fail(label + ' must contain at most ' + maximum + ' entries'); }
function metadata(value) {
  exact(value, ['title', 'location', 'question', 'notes'], 'metadata');
  string(value.title, 'metadata.title', { max: 300 });
  string(value.location, 'metadata.location', { max: 300 });
  string(value.question, 'metadata.question', { empty: true });
  string(value.notes, 'metadata.notes', { empty: true });
}
// Reject values that JSON would silently drop or transform before hashing or storage.
function boundedJSON(value) {
  let entries = 0;
  function visit(v, depth = 0) {
    if (depth > 35 || ++entries > 200000) fail('Study JSON exceeds the supported nesting or entry limit');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (Array.isArray(v)) { for (const item of v) visit(item, depth + 1); return; }
    if (!object(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail('Study must contain only JSON values and finite numbers');
    for (const [key, item] of Object.entries(v)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('Unsupported JSON key: ' + key);
      visit(item, depth + 1);
    }
  }
  visit(value);
  const json = canonicalJSON(value);
  if (Buffer.byteLength(json) > MAX_STUDY_BYTES) fail('Study exceeds the 8 MiB size limit');
  return json;
}
function lineage(value) {
  array(value, 'lineage');
  for (const entry of value) {
    exact(entry, ['kind', 'source_study_id', 'source_revision', 'source_digest', 'source_title', 'source_location', 'at', 'rationale'], 'lineage entry');
    if (!['imported', 'adapted'].includes(entry.kind)) fail('Unsupported lineage kind');
    id(entry.source_study_id); revision(entry.source_revision); hash(entry.source_digest); date(entry.at);
    string(entry.source_title, 'lineage.source_title', { max: 300 });
    string(entry.source_location, 'lineage.source_location', { max: 300 });
    string(entry.rationale, 'lineage.rationale');
  }
}
function adaptation(value, inputKeys, depth = 0) {
  if (depth > 8) fail('Adaptation history exceeds eight generations; retain the exported ancestors separately');
  exact(value, ['parent_study_id', 'parent_revision', 'parent_study_digest', 'parent_scenario_id', 'source_title', 'source_location', 'source_inputs', 'source_price_year', 'source_evidence', 'source_assumptions', 'source_unknowns', 'local_evidence_needed', 'rationale', 'source_adaptation'], 'scenario.adaptation');
  id(value.parent_study_id); revision(value.parent_revision); hash(value.parent_study_digest);
  string(value.parent_scenario_id, 'adaptation.parent_scenario_id', { max: 128 });
  string(value.source_title, 'adaptation.source_title', { max: 300 });
  string(value.source_location, 'adaptation.source_location', { max: 300 });
  string(value.rationale, 'adaptation.rationale');
  if (!object(value.source_inputs) || canonicalJSON(Object.keys(value.source_inputs).sort()) !== canonicalJSON(inputKeys.slice().sort())) fail('Adaptation source inputs must retain every model input');
  array(value.local_evidence_needed, 'local_evidence_needed');
  if (canonicalJSON(value.local_evidence_needed.slice().sort()) !== canonicalJSON(inputKeys.slice().sort())) fail('Adaptation must identify every inherited input as needing local review');
  for (const key of ['source_assumptions', 'source_unknowns']) {
    array(value[key], 'adaptation.' + key);
    value[key].forEach(item => string(item, 'adaptation.' + key));
  }
  createRun({ schema_version: 'commonweal.scenario.v1', id: value.parent_scenario_id, title: value.source_title, location: value.source_location, price_year: value.source_price_year, status: 'illustrative', inputs: value.source_inputs, assumptions: value.source_assumptions, unknowns: value.source_unknowns }, value.source_evidence);
  if (value.source_adaptation !== null) adaptation(value.source_adaptation, inputKeys, depth + 1);
}

export function validateStudy(value) {
  boundedJSON(value);
  exact(value, ['schema_version', 'id', 'revision', 'created_at', 'updated_at', 'metadata', 'evidence', 'scenarios', 'runs', 'lineage'], 'study');
  if (value.schema_version !== 'commonweal.study.v1') fail('Unsupported study schema_version');
  id(value.id); revision(value.revision); date(value.created_at); date(value.updated_at);
  if (value.updated_at < value.created_at) fail('updated_at cannot precede created_at');
  metadata(value.metadata); validateEvidence(value.evidence); lineage(value.lineage);
  array(value.scenarios, 'scenarios'); array(value.runs, 'runs');
  const scenarioIds = new Set();
  for (const scenario of value.scenarios) {
    if (!object(scenario)) fail('Each scenario must be an object');
    if (scenarioIds.has(scenario.id)) fail('Duplicate scenario id: ' + scenario.id);
    scenarioIds.add(scenario.id);
    array(scenario.assumptions, 'scenario.assumptions'); array(scenario.unknowns, 'scenario.unknowns');
    createRun(scenario, value.evidence);
    if (Object.hasOwn(scenario, 'adaptation')) adaptation(scenario.adaptation, Object.keys(scenario.inputs));
  }
  const runIds = new Set();
  for (const run of value.runs) {
    verifyRun(run);
    if (runIds.has(run.run_id)) fail('Duplicate run id: ' + run.run_id);
    runIds.add(run.run_id);
    if (Object.hasOwn(run.scenario, 'adaptation')) adaptation(run.scenario.adaptation, Object.keys(run.scenario.inputs));
  }
  return structuredClone(value);
}
export function studyDigest(study) { return digest(validateStudy(study)); }
export function exportStudy(study) {
  const checked = validateStudy(study);
  const result = { schema_version: 'commonweal.study-bundle.v1', study: checked, study_digest: digest(checked) };
  boundedJSON(result);
  return result;
}
export function validateBundle(bundle) {
  boundedJSON(bundle);
  exact(bundle, ['schema_version', 'study', 'study_digest'], 'bundle');
  if (bundle.schema_version !== 'commonweal.study-bundle.v1') fail('Unsupported study bundle schema_version');
  hash(bundle.study_digest);
  const study = validateStudy(bundle.study);
  if (digest(study) !== bundle.study_digest) fail('Study bundle digest mismatch; content may be damaged or altered');
  return { schema_version: bundle.schema_version, study, study_digest: bundle.study_digest };
}
function preserve(previous, next) {
  const runs = new Map(next.runs.map(run => [run.run_id, run]));
  for (const run of previous.runs) if (canonicalJSON(runs.get(run.run_id)) !== canonicalJSON(run)) fail('Completed run snapshots cannot be removed or replaced');
  const scenarios = new Map(next.scenarios.map(scenario => [scenario.id, scenario]));
  for (const scenario of previous.scenarios) {
    const updated = scenarios.get(scenario.id);
    if (updated && Object.hasOwn(scenario, 'adaptation') && canonicalJSON(updated.adaptation) !== canonicalJSON(scenario.adaptation)) fail('Existing scenario adaptation lineage cannot be changed');
  }
}
async function regularDirectory(path, { missing = false } = {}) {
  let stat;
  try { stat = await lstat(path); } catch (error) { if (missing && error.code === 'ENOENT') return false; throw error; }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Storage directories must be real directories, never symlinks', 'CORRUPT');
  return true;
}
async function readFileSafe(path) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_STUDY_BYTES) fail('Stored revision must be a regular bounded file', 'CORRUPT');
    // Bound the actual read as well as the initial size; a changing file cannot grow the allocation.
    const buffer = Buffer.alloc(Math.min(stat.size + 1, MAX_STUDY_BYTES + 1));
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== stat.size) fail('Stored revision changed while being read', 'CORRUPT');
    return JSON.parse(buffer.subarray(0, offset).toString('utf8'));
  } finally { if (handle) await handle.close(); }
}
async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}

/** Local storage, not a multi-user authorization boundary or a hostile-filesystem sandbox. */
export class StudyStore {
  constructor({ dataDir = process.env.COMMONWEAL_DATA_DIR || DEFAULT_DIR } = {}) {
    if (typeof dataDir !== 'string' || !dataDir.trim()) fail('dataDir must be a local directory path');
    this.dataDir = resolve(dataDir);
  }
  async _root({ create = false } = {}) {
    // Check each component before creating it. The system's configured temp root may
    // contain platform symlinks; callers can pass its realpath explicitly.
    const pieces = [];
    let cursor = this.dataDir;
    while (dirname(cursor) !== cursor) { pieces.unshift(cursor); cursor = dirname(cursor); }
    for (const path of pieces) {
      if (!(await regularDirectory(path, { missing: true }))) {
        if (!create) return null;
        try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
        await regularDirectory(path);
      }
    }
    if (await realpath(this.dataDir) !== this.dataDir) fail('Storage root may not traverse symlinks', 'CORRUPT');
    return this.dataDir;
  }
  async _directory(studyId) {
    id(studyId);
    const root = await this._root();
    if (root === null) fail('Study not found', 'NOT_FOUND');
    const path = join(root, studyId);
    try { await regularDirectory(path); } catch (error) { if (error.code === 'ENOENT') fail('Study not found', 'NOT_FOUND'); throw error; }
    return path;
  }
  async list() {
    const root = await this._root();
    const studies = [], problems = [];
    if (root === null) return { studies, problems };
    for (const entry of (await readdir(root)).sort()) {
      if (!ID.test(entry)) { problems.push({ id: entry, error: 'Unrecognized storage entry; left untouched' }); continue; }
      try {
        const value = await this.read(entry);
        studies.push({ id: value.id, revision: value.revision, metadata: value.metadata, created_at: value.created_at, updated_at: value.updated_at });
      } catch (error) { problems.push({ id: entry, error: error instanceof StudyError ? error.message : 'Study could not be read; inspect storage permissions and backups.' }); }
    }
    studies.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return { studies, problems };
  }
  async read(studyId) {
    const directory = await this._directory(studyId);
    const entries = await readdir(directory);
    const unexpected = entries.filter(name => !REVISION.test(name) && name !== '.lock' && !/^\.pending-[0-9a-f-]+$/.test(name));
    if (unexpected.length) fail('Unrecognized files in study directory; preserve and inspect before recovery', 'CORRUPT');
    const revisions = entries.filter(name => REVISION.test(name)).sort();
    if (!revisions.length) fail('Study has no complete revision; preserve the directory for recovery', 'CORRUPT');
    const latest = revisions.at(-1);
    const number = Number(REVISION.exec(latest)[1]);
    // Missing earlier revisions are corruption, not an invitation to silently roll back.
    if (revisions.length !== number || revisions.some((name, index) => Number(REVISION.exec(name)[1]) !== index + 1)) fail('Study revision history has gaps; restore a complete backup', 'CORRUPT');
    try {
      const bundle = validateBundle(await readFileSafe(join(directory, latest)));
      if (bundle.study.id !== studyId || bundle.study.revision !== number) fail('Stored revision identity does not match its path');
      return bundle.study;
    } catch (error) {
      const detail = error instanceof StudyError ? error.message : error instanceof SyntaxError ? 'Malformed JSON.' : 'Revision content or file access failed validation.';
      fail('Latest study revision is unreadable or invalid; no older revision was substituted. ' + detail, 'CORRUPT');
    }
  }
  async _publish(directory, study) {
    const bundle = exportStudy(study);
    const target = join(directory, 'revision-' + String(study.revision).padStart(8, '0') + '.json');
    const temporary = join(directory, '.pending-' + randomUUID());
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(canonicalJSON(bundle)); await handle.sync(); } finally { await handle.close(); }
    try {
      // Atomic no-replace publication. A duplicate revision is never overwritten.
      await link(temporary, target);
      await unlink(temporary);
      await syncDirectory(directory);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      if (error.code === 'EEXIST') fail('Revision already exists; reread before saving', 'CONFLICT');
      throw error;
    }
    return structuredClone(study);
  }
  async _new(value, history = []) {
    const now = new Date().toISOString();
    const study = validateStudy({ schema_version: 'commonweal.study.v1', id: 'study-' + randomUUID(), revision: 1, created_at: now, updated_at: now, metadata: value.metadata, evidence: value.evidence ?? [], scenarios: value.scenarios ?? [], runs: value.runs ?? [], lineage: history });
    exportStudy(study); // Includes bundle-envelope size before any filesystem mutation.
    const root = await this._root({ create: true });
    const directory = join(root, study.id);
    await mkdir(directory, { mode: 0o700 });
    const result = await this._publish(directory, study);
    await syncDirectory(root);
    return result;
  }
  async create({ metadata, evidence = [], scenarios = [], runs = [] }) { return this._new({ metadata, evidence, scenarios, runs }); }
  async save(studyId, update) {
    exact(update, ['expected_revision', 'metadata', 'evidence', 'scenarios', 'runs'], 'save');
    revision(update.expected_revision);
    const directory = await this._directory(studyId);
    let lock;
    try { lock = await open(join(directory, '.lock'), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); }
    catch (error) { if (error.code === 'EEXIST' || error.code === 'ELOOP') fail('Study is being saved or a previous writer stopped. Retry after the writer finishes; inspect a stale .lock before manual recovery.', 'BUSY'); throw error; }
    try {
      const previous = await this.read(studyId);
      if (previous.revision !== update.expected_revision) fail('Study changed since it was opened; reopen before saving', 'CONFLICT');
      const next = validateStudy({ ...previous, revision: previous.revision + 1, updated_at: new Date(Math.max(Date.now(), Date.parse(previous.updated_at))).toISOString(), metadata: update.metadata, evidence: update.evidence, scenarios: update.scenarios, runs: update.runs });
      preserve(previous, next);
      return await this._publish(directory, next);
    } finally { await lock.close(); await unlink(join(directory, '.lock')); }
  }
  async export(studyId) { return exportStudy(await this.read(studyId)); }
  async import(bundle) {
    const { study, study_digest } = validateBundle(bundle);
    return this._new(study, [...study.lineage, { kind: 'imported', source_study_id: study.id, source_revision: study.revision, source_digest: study_digest, source_title: study.metadata.title, source_location: study.metadata.location, at: new Date().toISOString(), rationale: 'Imported portable study; source snapshot retained by digest.' }]);
  }
  async adapt(studyId, { expected_revision, metadata: targetMetadata, rationale, scenario_ids }) {
    revision(expected_revision); metadata(targetMetadata); string(rationale, 'adaptation rationale');
    const source = await this.read(studyId);
    if (source.revision !== expected_revision) fail('Study changed since it was opened; reopen before adapting', 'CONFLICT');
    const parentDigest = studyDigest(source);
    if (scenario_ids !== undefined) {
      array(scenario_ids, 'scenario_ids');
      if (new Set(scenario_ids).size !== scenario_ids.length || scenario_ids.some(value => !source.scenarios.some(s => s.id === value))) fail('scenario_ids must name distinct scenarios in the source study');
    }
    const scenarios = source.scenarios.filter(s => scenario_ids === undefined || scenario_ids.includes(s.id)).map(scenario => {
      const adapted = structuredClone(scenario);
      adapted.id = 'scenario-' + randomUUID();
      adapted.title = scenario.title;
      adapted.location = targetMetadata.location;
      adapted.adaptation = { parent_study_id: source.id, parent_revision: source.revision, parent_study_digest: parentDigest, parent_scenario_id: scenario.id, source_title: scenario.title, source_location: scenario.location, source_inputs: structuredClone(scenario.inputs), source_price_year: scenario.price_year, source_evidence: structuredClone(source.evidence), source_assumptions: structuredClone(scenario.assumptions), source_unknowns: structuredClone(scenario.unknowns), local_evidence_needed: Object.keys(scenario.inputs), rationale, source_adaptation: scenario.adaptation ? structuredClone(scenario.adaptation) : null };
      for (const input of Object.values(adapted.inputs)) { input.basis = input.value === null ? 'unknown' : 'illustrative_assumption'; input.evidence_ids = []; }
      adapted.assumptions = [...adapted.assumptions, 'Adapted from ' + scenario.location + ' to ' + targetMetadata.location + '. Inherited values are illustrative and require local evidence. ' + rationale];
      adapted.unknowns = [...adapted.unknowns, 'Every inherited input requires local review; a change of location does not validate this scenario.'];
      return adapted;
    });
    return this._new({ metadata: targetMetadata, evidence: source.evidence, scenarios, runs: source.runs }, [...source.lineage, { kind: 'adapted', source_study_id: source.id, source_revision: source.revision, source_digest: parentDigest, source_title: source.metadata.title, source_location: source.metadata.location, at: new Date().toISOString(), rationale }]);
  }
}

// Public adapters receive bounded operational errors, never raw filesystem paths.
for (const name of ['list', 'read', 'create', 'save', 'export', 'import', 'adapt']) {
  const action = StudyStore.prototype[name];
  StudyStore.prototype[name] = async function (...args) {
    try { return await action.apply(this, args); } catch (error) {
      if (!(error instanceof StudyError) && typeof error.code === 'string' && /^E[A-Z0-9]+$/.test(error.code)) {
        throw new StudyError('IO', 'Local study storage could not be accessed (' + error.code + '); inspect directory permissions and backups.');
      }
      throw error;
    }
  };
}
