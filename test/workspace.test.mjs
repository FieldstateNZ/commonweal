import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { StudyStore, MAX_STUDY_BYTES } from '../src/studies.mjs';
import { StudyWorkspace } from '../src/workspace.mjs';
import { makeServer } from '../src/server.mjs';
import { examples } from '../src/examples.mjs';

const execute = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const metadata = {title:'Community study',location:'Illustrative test community',question:'',notes:''};
async function temporary(t) {
  const path = await realpath(await mkdtemp(join(tmpdir(),'commonweal-workspace-')));
  t.after(() => rm(path,{recursive:true,force:true}));
  return path;
}
async function serve(t,dataDir) {
  const server = makeServer({workspace:new StudyWorkspace(new StudyStore({dataDir}))});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const close = async () => {
    if (!server.listening) return;
    server.closeAllConnections();
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  };
  t.after(close);
  const url = 'http://127.0.0.1:'+server.address().port;
  return {close, async request(path,method='GET',data) {
    const response = await fetch(url+path,{method,headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
    return {status:response.status,data:await response.json()};
  }};
}

test('HTTP blank creation, item editing, immutable runs and reopen on a restarted server', async t => {
  const dataDir = join(await temporary(t),'studies');
  let api = await serve(t,dataDir);
  assert.deepEqual((await api.request('/api/studies')).data,{studies:[],problems:[]});
  let response = await api.request('/api/studies','POST',{metadata});
  assert.equal(response.status,201,JSON.stringify(response.data));
  let study = response.data.study;
  assert.deepEqual(study.scenarios,[]); assert.deepEqual(study.evidence,[]); assert.deepEqual(study.runs,[]);
  const path = '/api/studies/'+study.id;
  const sample = await examples();
  study.scenarios = [sample.scenarios[1]]; study.evidence = sample.evidence;
  response = await api.request(path,'PUT',{study,expected_revision:study.revision});
  assert.equal(response.status,200,JSON.stringify(response.data));
  study=response.data.study;
  const beforeRun=structuredClone(study);
  response=await api.request(path+'/run','POST',{expected_revision:study.revision,scenario_id:study.scenarios[0].id});
  assert.equal(response.status,200,JSON.stringify(response.data));
  study=response.data.study;
  const run=structuredClone(response.data.run);
  assert.equal(study.runs.length,1);
  assert.equal((await api.request(path,'PUT',{study:beforeRun,expected_revision:beforeRun.revision})).status,409);
  const removed=structuredClone(study); removed.runs=[];
  assert.equal((await api.request(path,'PUT',{study:removed,expected_revision:study.revision})).status,400);
  const duplicate=await api.request(path+'/run','POST',{expected_revision:study.revision,scenario_id:study.scenarios[0].id});
  assert.equal(duplicate.data.study.revision,study.revision,'Identical run is not appended twice');
  study.metadata.notes='Saved from normal study editing';
  study.evidence[0].version+='-edited';
  response=await api.request(path,'PUT',{study,expected_revision:study.revision});
  assert.equal(response.status,200,JSON.stringify(response.data));
  study=response.data.study;
  assert.deepEqual(study.runs[0],run,'Saved evidence changes cannot edit previous run snapshots');
  await api.close();
  api=await serve(t,dataDir);
  assert.deepEqual((await api.request(path)).data.study,study);
  assert.equal((await api.request('/api/studies')).data.studies[0].metadata.notes,study.metadata.notes);
  const exported=await api.request(path+'/export');
  response=await api.request('/api/studies/import','POST',exported.data);
  assert.equal(response.status,201,JSON.stringify(response.data));
  const imported=response.data.study;
  assert.notEqual(imported.id,study.id);
  for (const key of ['metadata','evidence','scenarios','runs']) assert.deepEqual(imported[key],study[key]);
  assert.equal(imported.lineage.at(-1).source_study_id,study.id);
  assert.deepEqual((await api.request(path)).data.study,study,'Import never replaces the source study');
});

test('HTTP invalid bundles and paths never replace valid studies or expose filesystem paths', async t => {
  const dataDir=join(await temporary(t),'studies');
  const api=await serve(t,dataDir);
  const created=await api.request('/api/studies','POST',{metadata,example:true});
  const study=created.data.study;
  const path='/api/studies/'+study.id;
  const {bundle}=(await api.request(path+'/export')).data;
  const corrupt=structuredClone(bundle); corrupt.study.metadata.title='Tampered';
  const unsupported=structuredClone(bundle); unsupported.schema_version='unknown';
  for (const invalid of [corrupt,unsupported,null,{},'file:///private/data']) {
    const response=await api.request('/api/studies/import','POST',{bundle:invalid});
    assert.equal(response.status,400,JSON.stringify(response.data));
    assert.ok(!JSON.stringify(response.data).includes(dataDir));
  }
  assert.equal((await api.request('/api/studies')).data.studies.length,1);
  assert.deepEqual((await api.request(path)).data.study,study);
  for (const id of ['not-a-study','%2e%2e%2fprivate','study-123']) {
    const response=await api.request('/api/studies/'+id);
    assert.ok([400,404].includes(response.status));
    assert.ok(!JSON.stringify(response.data).includes(dataDir));
  }
  await writeFile(join(dataDir,study.id,'revision-00000001.json'),'{broken');
  const response=await api.request(path);
  assert.equal(response.status,422);
  assert.ok(!JSON.stringify(response.data).includes(dataDir));
  const list=(await api.request('/api/studies')).data;
  assert.equal(list.studies.length,0); assert.equal(list.problems.length,1);
});

test('shared service evidence/scenario/run/adapt actions retain source context and local review needs', async t => {
  const service=new StudyWorkspace(new StudyStore({dataDir:join(await temporary(t),'studies')}));
  let {study}=await service.create({metadata});
  const {evidence,scenarios}=await examples();
  ({study}=await service.putEvidence({id:study.id,expected_revision:study.revision,evidence}));
  const scenario=structuredClone(scenarios[1]);
  scenario.inputs.capacity_kwp.evidence_ids=[evidence[0].id];
  scenario.inputs.capacity_kwp.basis='source_reported';
  ({study}=await service.putScenario({id:study.id,expected_revision:study.revision,scenario}));
  ({study}=await service.run({id:study.id,expected_revision:study.revision,scenario_id:scenario.id}));
  const oldRun=study.runs[0];
  const newMetadata={...metadata,title:'Second community',location:'Another illustrative place'};
  const {study:adapted}=await service.adapt({id:study.id,expected_revision:study.revision,metadata:newMetadata,rationale:'Test local demand and benefit assumptions'});
  assert.notEqual(adapted.id,study.id);
  assert.deepEqual(adapted.runs,[oldRun]);
  assert.equal(adapted.runs[0].scenario.location,scenario.location);
  const adaptedScenario=adapted.scenarios[0];
  assert.equal(adaptedScenario.location,newMetadata.location);
  assert.equal(adaptedScenario.status,'illustrative');
  assert.equal(adaptedScenario.inputs.capacity_kwp.basis,'illustrative_assumption');
  assert.deepEqual(adaptedScenario.inputs.capacity_kwp.evidence_ids,[]);
  assert.deepEqual(adaptedScenario.adaptation.source_inputs,scenario.inputs);
  assert.ok(adaptedScenario.adaptation.local_evidence_needed.includes('capacity_kwp'));
  assert.equal(adaptedScenario.adaptation.parent_study_id,study.id);
  assert.deepEqual((await service.read({id:study.id})).study,study);
  const {comparison}=await service.compare({id:study.id,baseline_run_id:oldRun.run_id,alternative_run_id:oldRun.run_id});
  assert.ok(Object.values(comparison.deltas).every(value=>value===0));
  await assert.rejects(service.compare({id:study.id,baseline_run_id:oldRun.run_id,alternative_run_id:'missing'}),/Run not found/);
});

test('separate CLI processes share local storage and portable import/export without cwd dependence', async t => {
  const directory=await temporary(t);
  const dataDir=join(directory,'studies');
  const invokeRaw=async (...args)=>{
    const {stdout,stderr}=await execute(process.execPath,[cli,...args],{cwd:directory,env:{...process.env,COMMONWEAL_DATA_DIR:dataDir},maxBuffer:10*1024*1024});
    assert.equal(stderr,''); return stdout;
  };
  const invoke=async (...args)=>JSON.parse(await invokeRaw(...args));
  const request=join(directory,'create.json');
  await writeFile(request,JSON.stringify({metadata,example:true}));
  const {study}=await invoke('study-create',request);
  assert.equal((await invoke('studies')).studies.length,1);
  assert.deepEqual((await invoke('study',study.id)).study,study);
  const ran=await invoke('study-run',study.id,study.scenarios[0].id,String(study.revision));
  const exported=await invokeRaw('study-export',study.id);
  assert.deepEqual(JSON.parse(exported).study,ran.study);
  const portable=join(directory,'bundle.json'); await writeFile(portable,exported);
  const imported=await invoke('study-import',portable);
  assert.notEqual(imported.study.id,study.id);
  assert.deepEqual(imported.study.runs,ran.study.runs);
  assert.equal((await invoke('studies')).studies.length,2);
});


test('CLI exported bundle near the size limit can be imported directly from stdout', async t => {
  const directory=await temporary(t);
  const dataDir=join(directory,'studies');
  const service=new StudyWorkspace(new StudyStore({dataDir}));
  const sample=await examples();
  const scenarios=Array.from({length:100},(_,index)=>({
    ...structuredClone(sample.scenarios[0]),id:'size-test-'+index,assumptions:Array(100).fill('')
  }));
  const request={metadata,evidence:sample.evidence,scenarios};
  const padding=Math.floor((MAX_STUDY_BYTES-16384-Buffer.byteLength(JSON.stringify(request)))/10000);
  for(const scenario of scenarios)scenario.assumptions.fill('Illustrative size test. '+ 'x'.repeat(padding-24));
  const {study}=await service.create(request);
  const {bundle}=await service.export({id:study.id});
  assert.ok(Buffer.byteLength(JSON.stringify(bundle,null,2))>MAX_STUDY_BYTES+65536,'Pretty output would exceed the import file limit');
  const options={cwd:directory,env:{...process.env,COMMONWEAL_DATA_DIR:dataDir},maxBuffer:12*1024*1024};
  const exported=await execute(process.execPath,[cli,'study-export',study.id],options);
  assert.equal(exported.stderr,'');
  assert.ok(Buffer.byteLength(exported.stdout)<=MAX_STUDY_BYTES+1);
  const portable=join(directory,'large-bundle.json');
  await writeFile(portable,exported.stdout);
  const imported=await execute(process.execPath,[cli,'study-import',portable],options);
  assert.equal(imported.stderr,'');
  const copy=JSON.parse(imported.stdout).study;
  assert.notEqual(copy.id,study.id);
  assert.deepEqual(copy.scenarios,study.scenarios);
  assert.equal(copy.lineage.at(-1).source_study_id,study.id);
});
