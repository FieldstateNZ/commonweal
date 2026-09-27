import { StudyStore, StudyError } from './studies.mjs';
import { createRun, compareRuns, canonicalJSON } from './records.mjs';
import { examples } from './examples.mjs';

const drafts = ({metadata,evidence,scenarios,runs}) => ({metadata,evidence,scenarios,runs});

// UI, CLI and MCP share these operations. Paths are a launcher setting only.
export class StudyWorkspace {
  constructor(store = new StudyStore()) { this.store = store; }
  async list() { return this.store.list(); }
  async read({id}) { return {study: await this.store.read(id)}; }
  async examples() { return examples(); }
  async create({metadata, example = false, evidence = [], scenarios = [], runs = []}) {
    if (typeof example !== 'boolean') throw new StudyError('INVALID', 'example must be a boolean');
    if (example) ({evidence, scenarios} = await examples());
    return {study: await this.store.create({metadata, evidence, scenarios, runs})};
  }
  async save({study, expected_revision}) {
    if (!study || typeof study !== 'object' || Array.isArray(study)) throw new StudyError('INVALID', 'study must be an object');
    if (study.revision !== expected_revision) throw new StudyError('CONFLICT', 'The working revision does not match expected_revision; reopen the saved study before updating.');
    const current = await this.store.read(study.id);
    for (const key of ['schema_version', 'created_at', 'lineage']) {
      if (canonicalJSON(study[key]) !== canonicalJSON(current[key])) throw new StudyError('INVALID', key + ' is retained history and cannot be edited');
    }
    const {metadata, evidence, scenarios, runs} = study;
    return {study: await this.store.save(study.id, {expected_revision, metadata, evidence, scenarios, runs})};
  }
  async export({id}) { return {bundle: await this.store.export(id)}; }
  async import({bundle}) { return {study: await this.store.import(bundle)}; }
  async adapt({id, ...options}) { return {study: await this.store.adapt(id, options)}; }
  async current(id, expected_revision) {
    const study = await this.store.read(id);
    if (study.revision !== expected_revision) throw new StudyError('CONFLICT', 'Study changed. Read the latest revision before writing.');
    return study;
  }
  async putEvidence({id, expected_revision, evidence}) {
    const study = await this.current(id, expected_revision);
    return {study: await this.store.save(id, {...drafts(study), expected_revision, evidence})};
  }
  async putScenario({id, expected_revision, scenario}) {
    const study = await this.current(id, expected_revision);
    if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) throw new StudyError('INVALID', 'scenario must be an object');
    const scenarios = study.scenarios.filter(item => item.id !== scenario.id);
    scenarios.push(scenario);
    return {study: await this.store.save(id, {...drafts(study), expected_revision, scenarios})};
  }
  async run({id, expected_revision, scenario_id}) {
    const study = await this.current(id, expected_revision);
    const scenario = study.scenarios.find(item => item.id === scenario_id);
    if (!scenario) throw new StudyError('NOT_FOUND', 'Scenario not found in this study');
    const run = createRun(scenario, study.evidence);
    if (study.runs.some(item => item.run_id === run.run_id)) return {study, run};
    return {study: await this.store.save(id, {...drafts(study), expected_revision, runs: [...study.runs, run]}), run};
  }
  async compare({id, baseline_run_id, alternative_run_id}) {
    const study = await this.store.read(id);
    const runs = [baseline_run_id, alternative_run_id].map(runId => {
      const run = study.runs.find(item => item.run_id === runId);
      if (!run) throw new StudyError('NOT_FOUND', 'Run not found in this study');
      return run;
    });
    return {comparison: compareRuns(runs)};
  }
}
