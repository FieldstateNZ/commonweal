#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createRun,compareRuns,validateEvidence,verifyRun,operations,canonicalJSON } from './records.mjs';
import { examples } from './examples.mjs';

const help = [
  'Commonweal local structured operations (JSON to stdout; errors to stderr)',
  '  node src/cli.mjs operations',
  '  node src/cli.mjs examples',
  '  node src/cli.mjs validate-evidence EVIDENCE.json',
  '  node src/cli.mjs run SCENARIO.json [--evidence EVIDENCE.json]',
  '  node src/cli.mjs compare BASELINE_RUN.json ALTERNATIVE_RUN.json',
  '  node src/cli.mjs verify RUN.json',
  'No URLs are fetched. Files are read only; redirect stdout to save a result.',
  'Examples contains an array; save one scenario object as SCENARIO.json.'
].join('\n');
async function json(path) {
  const data=await readFile(path,'utf8');
  if(Buffer.byteLength(data)>1024*1024)throw new Error('Input file exceeds 1 MiB');
  return JSON.parse(data);
}
try {
  const [command,...args]=process.argv.slice(2);
  let result;
  if(!command||command==='--help'){console.log(help);}
  else {
    if(command==='operations'&&args.length===0)result=operations;
    else if(command==='examples'&&args.length===0)result=await examples();
    else if(command==='validate-evidence'&&args.length===1)result={evidence:validateEvidence(await json(args[0])),warnings:['Format validation is not factual verification.']};
    else if(command==='run'&&(args.length===1||(args.length===3&&args[1]==='--evidence')))result=createRun(await json(args[0]),args.length===3?await json(args[2]):[]);
    else if(command==='compare'&&args.length===2)result=compareRuns(await Promise.all(args.map(json)));
    else if(command==='verify'&&args.length===1)result={valid:true,run_id:verifyRun(await json(args[0])).run_id};
    else throw new Error('Unknown command or arguments.\n'+help);
    console.log(JSON.stringify(JSON.parse(canonicalJSON(result)),null,2));
  }
}catch(error){console.error(error.message);process.exitCode=1;}
