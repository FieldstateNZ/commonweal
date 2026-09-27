#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createRun,compareRuns,validateEvidence,verifyRun,operations,canonicalJSON } from './records.mjs';
import { examples } from './examples.mjs';
import { StudyWorkspace } from './workspace.mjs';
import { MAX_STUDY_BYTES } from './studies.mjs';

const help = [
  'Commonweal local structured operations (JSON to stdout; errors to stderr)',
  '  node src/cli.mjs operations',
  '  node src/cli.mjs examples',
  '  node src/cli.mjs validate-evidence EVIDENCE.json',
  '  node src/cli.mjs run SCENARIO.json [--evidence EVIDENCE.json]',
  '  node src/cli.mjs compare BASELINE_RUN.json ALTERNATIVE_RUN.json',
  '  node src/cli.mjs verify RUN.json',
  '  node src/cli.mjs studies',
  '  node src/cli.mjs study STUDY_ID',
  '  node src/cli.mjs study-create REQUEST.json',
  '  node src/cli.mjs study-save REQUEST.json',
  '  node src/cli.mjs study-export STUDY_ID',
  '  node src/cli.mjs study-import BUNDLE.json',
  '  node src/cli.mjs study-adapt STUDY_ID REQUEST.json',
  '  node src/cli.mjs study-evidence STUDY_ID REQUEST.json',
  '  node src/cli.mjs study-scenario STUDY_ID REQUEST.json',
  '  node src/cli.mjs study-run STUDY_ID SCENARIO_ID EXPECTED_REVISION',
  '  node src/cli.mjs study-compare STUDY_ID BASELINE_RUN_ID ALTERNATIVE_RUN_ID',
  'Study create/save/import/adapt/evidence/scenario/run explicitly write local study revisions.',
  'No URLs are fetched. Redirect stdout to save a portable result; study-export emits a bundle.',
  'Examples contains an array; save one scenario object as SCENARIO.json.'
].join('\n');
async function json(path, limit = 1024 * 1024) {
  const data=await readFile(path,'utf8');
  if(Buffer.byteLength(data)>limit)throw new Error('Input file exceeds '+limit+' bytes');
  return JSON.parse(data);
}
try {
  const [command,...args]=process.argv.slice(2);
  const workspace = new StudyWorkspace();
  const studyJson = path => json(path, MAX_STUDY_BYTES + 65536);
  let result;
  if(!command||command==='--help'){console.log(help);}
  else {
    if(command==='operations'&&args.length===0)result=operations;
    else if(command==='examples'&&args.length===0)result=await examples();
    else if(command==='validate-evidence'&&args.length===1)result={evidence:validateEvidence(await json(args[0])),warnings:['Format validation is not factual verification.']};
    else if(command==='run'&&(args.length===1||(args.length===3&&args[1]==='--evidence')))result=createRun(await json(args[0]),args.length===3?await json(args[2]):[]);
    else if(command==='compare'&&args.length===2)result=compareRuns(await Promise.all(args.map(path=>json(path))));
    else if(command==='verify'&&args.length===1)result={valid:true,run_id:verifyRun(await json(args[0])).run_id};
    else if(command==='studies'&&args.length===0)result=await workspace.list();
    else if(command==='study'&&args.length===1)result=await workspace.read({id:args[0]});
    else if(command==='study-create'&&args.length===1)result=await workspace.create(await studyJson(args[0]));
    else if(command==='study-save'&&args.length===1)result=await workspace.save(await studyJson(args[0]));
    else if(command==='study-export'&&args.length===1)result=(await workspace.export({id:args[0]})).bundle;
    else if(command==='study-import'&&args.length===1){const data=await studyJson(args[0]);result=await workspace.import({bundle:data.bundle??data});}
    else if(['study-adapt','study-evidence','study-scenario'].includes(command)&&args.length===2){
      const method={'study-adapt':'adapt','study-evidence':'putEvidence','study-scenario':'putScenario'}[command];
      result=await workspace[method]({...await studyJson(args[1]),id:args[0]});
    }
    else if(command==='study-run'&&args.length===3)result=await workspace.run({id:args[0],scenario_id:args[1],expected_revision:Number(args[2])});
    else if(command==='study-compare'&&args.length===3)result=await workspace.compare({id:args[0],baseline_run_id:args[1],alternative_run_id:args[2]});
    else throw new Error('Unknown command or arguments.\n'+help);
    console.log(command==='study-export' ? canonicalJSON(result) : JSON.stringify(JSON.parse(canonicalJSON(result)),null,2));
  }
}catch(error){console.error(error.message);process.exitCode=1;}
