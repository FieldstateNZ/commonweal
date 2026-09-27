import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRun,compareRuns,validateEvidence,verifyRun,operations } from './records.mjs';
import { examples } from './examples.mjs';

const assets=new Map([
  ['/', ['index.html','text/html; charset=utf-8']],
  ['/index.html', ['index.html','text/html; charset=utf-8']],
  ['/app.mjs', ['app.mjs','text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css','text/css; charset=utf-8']]
]);
function send(res,status,data) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(data,null,2)+'\n');
}
async function body(req) {
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')) {
    const e=new Error('Use Content-Type: application/json');e.status=415;throw e;
  }
  let bytes=0;const chunks=[];
  for await (const chunk of req) {
    bytes+=chunk.length;
    if(bytes>1024*1024){const e=new Error('JSON body exceeds 1 MiB');e.status=413;throw e;}
    chunks.push(chunk);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw new Error('Request body must be valid JSON');}
}
export function makeServer() {
  return createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const host=req.headers.host||'';
    if(!/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host)){send(res,403,{error:'This prototype accepts localhost requests only'});return;}
    const origin=req.headers.origin;
    if(origin && origin!=='http://'+host){send(res,403,{error:'Cross-origin API requests are disabled'});return;}
    try {
      const path=new URL(req.url,'http://'+host).pathname;
      if(req.method==='GET' && assets.has(path)) {
        const [name,type]=assets.get(path);
        const data=await readFile(new URL('../public/'+name,import.meta.url));
        res.writeHead(200,{'Content-Type':type});res.end(data);return;
      }
      if(req.method==='GET' && path==='/api/health'){send(res,200,{status:'ok',model:operations.model});return;}
      if(req.method==='GET' && path==='/api/operations'){send(res,200,operations);return;}
      if(req.method==='GET' && path==='/api/examples'){send(res,200,await examples());return;}
      if(req.method!=='POST'){send(res,404,{error:'Unknown route'});return;}
      if(!['/api/validate-evidence','/api/run','/api/compare','/api/verify'].includes(path)){send(res,404,{error:'Unknown route'});return;}
      const data=await body(req);
      if(data===null||typeof data!=='object'||Array.isArray(data))throw new Error('Request JSON must be an object');
      if(path==='/api/validate-evidence')send(res,200,{evidence:validateEvidence(data.evidence),warnings:['Format checked only; source accuracy, rights and review claims require human checking. No server-side data is saved.']});
      if(path==='/api/run')send(res,200,createRun(data.scenario,data.evidence??[]));
      if(path==='/api/compare')send(res,200,compareRuns(data.runs));
      if(path==='/api/verify')send(res,200,{valid:true,run_id:verifyRun(data.run).run_id});
    }catch(error){
      send(res,error.status||400,{error:error.message||'Request failed'});
    }
  });
}
export function startServer(port=4317) {
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT must be an integer between 0 and 65535');
  const server=makeServer();
  server.listen(port,'127.0.0.1',()=>console.log('Commonweal local workbench: http://127.0.0.1:'+server.address().port));
  return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const server=startServer(Number(process.env.PORT??4317));
  server.on('error',error=>{console.error(error.message);process.exitCode=1;});
}
