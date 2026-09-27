import { createHash } from 'node:crypto';
import { calculate, validateScenario, MODEL_VERSION } from './model.mjs';

export const MODEL_ID = 'annual-solar-screen';
const classes = ['source_reported_observation','source_reported_forecast','source_reported','derived','illustrative_assumption','unknown'];
const reviews = ['unreviewed','source_checked','expert_reviewed','disputed'];
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function fail(message) { throw new Error(message); }
function text(v, path, max = 10000) {
  if (typeof v !== 'string' || !v.trim() || v.length > max) fail(path + ' must be a nonempty string (max ' + max + ' characters)');
}
function strings(v, path) {
  if (!Array.isArray(v) || v.length > 100) fail(path + ' must be an array with at most 100 entries');
  v.forEach((s,i) => text(s,path+'['+i+']'));
}
function date(v, path, nullable=false) {
  if (nullable && v === null) return;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0,10)!==v) fail(path+' must be a valid ISO date');
}
export function assertDepth(value, depth=0) {
  if (depth > 40) fail('JSON nesting exceeds 40 levels');
  if (object(value) || Array.isArray(value)) {
    for (const [key,v] of Object.entries(value)) {
      if (['__proto__','prototype','constructor'].includes(key)) fail('Unsupported JSON key: '+key);
      assertDepth(v,depth+1);
    }
  }
}
export function canonicalJSON(value) {
  assertDepth(value);
  function sort(v) {
    if (Array.isArray(v)) return v.map(sort);
    if (object(v)) return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));
    if (typeof v === 'number' && !Number.isFinite(v)) fail('JSON numbers must be finite');
    return v;
  }
  return JSON.stringify(sort(value));
}
export function digest(value) { return createHash('sha256').update(canonicalJSON(value)).digest('hex'); }
export function validateEvidence(records) {
  assertDepth(records);
  if (!Array.isArray(records) || records.length > 200) fail('evidence must be an array with at most 200 records');
  const seen = new Set();
  records.forEach((e,i) => {
    const p='evidence['+i+']';
    if (!object(e) || e.schema_version !== 'commonweal.evidence.v1') fail(p+' requires schema_version commonweal.evidence.v1');
    text(e.id,p+'.id',120);
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(e.id)) fail(p+'.id must contain lowercase letters, numbers, dots, hyphens or underscores');
    if (seen.has(e.id)) fail('Duplicate evidence id: '+e.id+'; choose one version per run');
    seen.add(e.id);
    for (const k of ['version','title','claim']) text(e[k],p+'.'+k);
    if (!classes.includes(e.classification)) fail(p+'.classification is unsupported');
    if (!reviews.includes(e.review_status)) fail(p+'.review_status is unsupported');
    if (!object(e.source)) fail(p+'.source must be an object');
    for (const k of ['title','publisher','locator']) text(e.source[k],p+'.source.'+k);
    let url;
    try { url = new URL(e.source.url); } catch { fail(p+'.source.url must be an HTTP(S) URL'); }
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password) fail(p+'.source.url must be HTTP(S) without credentials');
    date(e.source.published_at,p+'.source.published_at',true);
    date(e.source.accessed_at,p+'.source.accessed_at');
    if (!object(e.context)) fail(p+'.context must be an object');
    for (const k of ['location','period','units','method']) text(e.context[k],p+'.context.'+k);
    strings(e.limitations,p+'.limitations');
    if (!object(e.rights) || !['link_only','open_license','permission_recorded'].includes(e.rights.status)) fail(p+'.rights requires a supported status');
    text(e.rights.note,p+'.rights.note');
  });
  return structuredClone(records);
}
export function createRun(scenario,evidence=[]) {
  assertDepth(scenario);
  validateScenario(scenario);
  const checked=validateEvidence(evidence);
  const ids=new Set(checked.map(e=>e.id));
  for(const [key,input] of Object.entries(scenario.inputs)) {
    for(const id of input.evidence_ids) if(!ids.has(id)) fail('Input '+key+' references missing evidence '+id);
  }
  const body={
    schema_version:'commonweal.run.v1',
    model:{id:MODEL_ID,version:MODEL_VERSION},
    scenario:structuredClone(scenario),
    evidence:checked,
    results:calculate(scenario)
  };
  return {...body,run_id:'run-'+digest(body)};
}
export function verifyRun(run) {
  if(!object(run) || run.schema_version!=='commonweal.run.v1') fail('Expected a commonweal.run.v1 record');
  const rebuilt=createRun(run.scenario,run.evidence);
  if(canonicalJSON(run)!==canonicalJSON(rebuilt)) fail('Run content does not match its inputs/current model; rerun the scenario or use the recorded model version');
  return rebuilt;
}
export function compareRuns(runs) {
  if(!Array.isArray(runs) || runs.length!==2) fail('Compare requires exactly two runs, in baseline then alternative order');
  const [a,b]=runs.map(verifyRun);
  if(a.scenario.price_year!==b.scenario.price_year) fail('Comparison requires the same NZD price year; convert inputs explicitly first');
  function differences(before,after) {
    return Object.fromEntries(Object.keys(before).map(key=>{
      if(before[key]===null || after[key]===null) return [key,null];
      const value=after[key]-before[key];
      if(!Number.isFinite(value)) fail('Comparison overflow for '+key);
      return [key,value];
    }));
  }
  const deltas=differences(a.results.metrics,b.results.metrics);
  const allocation_deltas=differences(a.results.allocation,b.results.allocation);
  const environment_deltas=differences(a.results.environment,b.results.environment);
  return {
    schema_version:'commonweal.comparison.v1',
    direction:'alternative minus baseline',
    runs:[a,b].map(r=>({run_id:r.run_id,title:r.scenario.title})),
    price_year:a.scenario.price_year,
    deltas,
    allocation_deltas,
    environment_deltas,
    limitations:[
      'Both runs are illustrative annual screening scenarios, not observed Ōtaki outcomes.',
      'Differences inherit each run’s assumptions; inspect changed inputs and local context.',
      'Positive operating value excludes capital recovery, financing, tax and replacement; avoided bills are not necessarily distributable cash.',
      'No hourly dispatch, battery, winter reliability, network feasibility or net climate benefit is established.',
      'An environmental difference is unknown if either run lacks that value; stock and annual quantities remain separate.'
    ]
  };
}
export const operations={
  schema_version:'commonweal.operations.v1',
  model:{id:MODEL_ID,version:MODEL_VERSION},
  local_only:true,
  operations:[
    {name:'examples',http:'GET /api/examples',cli:'examples',description:'Read illustrative scenarios, separate sourced evidence and reported benchmark summaries.'},
    {name:'import_evidence',http:'POST /api/validate-evidence',cli:'validate-evidence EVIDENCE.json',input:'{evidence: EvidenceRecord[]}',description:'Validate and return records. Does not verify facts, fetch URLs or persist anything.'},
    {name:'run_scenario',http:'POST /api/run',cli:'run SCENARIO.json --evidence EVIDENCE.json',input:'{scenario: Scenario, evidence: EvidenceRecord[]}',description:'Validate references, calculate and return a complete content-addressed run.'},
    {name:'compare_runs',http:'POST /api/compare',cli:'compare BASELINE_RUN.json ALTERNATIVE_RUN.json',input:'{runs: [Run, Run]}',description:'Verify runs by recomputing and return alternative-minus-baseline differences.'},
    {name:'verify_run',http:'POST /api/verify',cli:'verify RUN.json',input:'{run: Run}',description:'Check provenance and recomputation against this installed model version.'}
  ],
  participation:'Human UI, CLI and API use the same computation. No AI subscription, API key or paid inference is needed to operate this prototype.',
  ai_boundary:'People may connect compatible external AI tools themselves; no WebMCP adapter or autonomous research agent is implemented.',
  evidence_note:'Schema validation is not fact checking. Review labels are contributor claims requiring their own documented review.'
};
