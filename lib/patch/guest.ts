// Trusted guest programs. Model output is only validated JSON data, never shell/code.
export const HEALTH_CHECK = String.raw`
const http=require('node:http');
const config=require('/workspace/fixture-config.json');
const get=port=>new Promise(resolve=>{const req=http.get({hostname:'127.0.0.1',port,path:'/',timeout:2000},res=>{let body='';res.on('data',data=>{body+=data;if(body.length>4096)req.destroy();});res.on('end',()=>resolve({port,status:res.statusCode,body}));res.on('error',()=>resolve({port,status:null,body}));});req.on('timeout',()=>req.destroy());req.on('error',()=>resolve({port,status:null,body:''}));});
(async()=>{const proxy=await get(config.proxyPort),backend=await get(config.backendPort);let ok=false;try{const data=JSON.parse(backend.body);ok=backend.status===200&&data.ok===true&&data.service==='synthetic-backend'&&proxy.status===200&&proxy.body===backend.body;}catch{}console.log(JSON.stringify({proxy,backend,regression:{pass:ok,description:'Backend remains healthy and proxy preserves the backend JSON response'}}));})().catch(()=>{console.error('Health test failed');process.exitCode=1;});
`;

export const APPLY_PATCH = String.raw`
const fs=require('node:fs');
(async()=>{
 const patch=JSON.parse(fs.readFileSync('/workspace/proposed-patch.json','utf8'));
 const file='/workspace/fixture-config.json';
 const before=JSON.parse(fs.readFileSync(file,'utf8'));
 if(patch.file!==file||patch.operation!=='replace'||patch.path!=='/upstreamPort'||patch.risk!=='SANDBOX_MUTATION'||before.upstreamPort!==patch.oldValue||!Number.isInteger(patch.value)||patch.value<1||patch.value>65535||patch.value===patch.oldValue)throw new Error('Patch precondition rejected');
 const after={...before,upstreamPort:patch.value};
 fs.writeFileSync(file,JSON.stringify(after,null,2));
 process.kill(Number(fs.readFileSync('/workspace/fixture.pid','utf8')),'SIGHUP');
 for(let attempt=0;attempt<50;attempt++){
  try{const ack=JSON.parse(fs.readFileSync('/workspace/reload-ack.json','utf8'));if(JSON.stringify(ack)===JSON.stringify(after)){console.log(JSON.stringify({applied:true,reloaded:true,before,after}));return;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw new Error('Fixture reload was not acknowledged');
})().catch(error=>{console.error(String(error.message).slice(0,240));process.exitCode=1;});
`;
