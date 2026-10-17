// Trusted guest infrastructure. These programs are uploaded only to CreateOS.
export const SERVICE = String.raw`
const http=require('node:http'),fs=require('node:fs');
const contract=require('/workspace/fixture-contract.json');
let config;
function reload(){config=JSON.parse(fs.readFileSync('/workspace/fixture-config.json','utf8'));if(contract.environment){if(config.environmentValue)process.env[config.requiredVariable]=config.environmentValue;else delete process.env[config.requiredVariable];}}
reload();
process.on('SIGHUP',()=>{reload();fs.writeFileSync('/workspace/reload-ack.json',JSON.stringify(config));});
http.createServer((req,res)=>{
 let status=200,body={service:'synthetic-backend',ok:true};
 if(contract.environment){
  if(req.url==='/metadata')body={requiredVariable:config.requiredVariable,present:!!process.env[config.requiredVariable]};
  else if(req.url==='/'&&!process.env[config.requiredVariable]){status=500;body={error:'Missing required environment variable',variable:config.requiredVariable};}
  else if(req.url==='/'&&process.env[config.requiredVariable]!==config.expectedValue){status=500;body={error:'Synthetic environment value is invalid'};}
  else if(req.url!=='/'&&req.url!=='/health'){status=404;body={error:'Not found'};}
 }else if(req.url!=='/'&&req.url!==config.applicationPath){status=404;body={error:'Not found',path:req.url};}
 res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));
}).listen(config.servicePort,'127.0.0.1');
`;

// Probe destinations are trusted registry data, never URLs supplied by the model.
export const OBSERVE = String.raw`
const http=require('node:http');
const config=require('/workspace/fixture-config.json'),contract=require('/workspace/fixture-contract.json');
function get(target){const spec=contract.probes[target],port=config.servicePort,path=spec.configPath?config[spec.configPath]:spec.path;return new Promise(resolve=>{const req=http.get({hostname:'127.0.0.1',port,path,timeout:2000},res=>{let body='';res.on('data',data=>{body+=data;if(body.length>4096)req.destroy();});res.on('end',()=>resolve({port,status:res.statusCode,body}));res.on('error',()=>resolve({port,status:null,body}));});req.on('timeout',()=>req.destroy());req.on('error',()=>resolve({port,status:null,body:''}));});}
async function observe(){const proxy=await get(contract.primary),backend=await get(contract.baseline);let ok=false;try{const body=JSON.parse(backend.body);ok=proxy.status===200&&backend.status===200&&body.ok===true&&body.service==='synthetic-backend'&&proxy.body===backend.body;}catch{}return{proxy,backend,regression:{pass:ok,description:'Healthy application endpoint is unchanged and the repaired request returns its healthy response'}};}
`;
export const HEALTH_CHECK = OBSERVE + String.raw`
observe().then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('Health test failed');process.exitCode=1;});
`;
export const BOOTSTRAP = String.raw`
const {spawn}=require('node:child_process');
const child=spawn(process.execPath,['/workspace/fixture-server.cjs'],{detached:true,stdio:'ignore',env:{}});
require('node:fs').writeFileSync('/workspace/fixture.pid',String(child.pid));child.unref();
` + OBSERVE + String.raw`
(async()=>{for(let attempt=0;attempt<30;attempt++){const data=await observe();if(data.proxy.status===contract.failureStatus&&data.backend.status===200){console.log(JSON.stringify(data));return;}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Fixture failed to reproduce');})().catch(error=>{console.error(error.message);process.exitCode=1;});
`;
export const RUNNER = String.raw`
const fs=require('node:fs'),http=require('node:http'),vm=require('node:vm');
const config=Object.freeze(JSON.parse(fs.readFileSync('/workspace/fixture-config.json','utf8'))),contract=require('/workspace/fixture-contract.json');
const source=fs.readFileSync('/workspace/generated-tool.js','utf8');
const seconds=Math.min(20,Math.max(1,Number(process.argv[2])||20));let reads=0,probes=0,logs=0;
function readConfig(){if(++reads>1)throw new Error('Read budget exceeded');return config;}
function probe(target){
 if(++probes>3||!Object.hasOwn(contract.probes,target))throw new Error('Probe denied');
 const spec=contract.probes[target],port=config.servicePort,path=spec.configPath?config[spec.configPath]:spec.path;
 return new Promise(resolve=>{const req=http.get({hostname:'127.0.0.1',port,path,timeout:2000},res=>{let body='';res.on('data',data=>{body+=data;if(body.length>4096)req.destroy(new Error('Response limit'));});res.on('end',()=>resolve(Object.freeze({port,status:res.statusCode,body,error:null})));res.on('error',()=>resolve(Object.freeze({port,status:null,body:'',error:'RESPONSE_ERROR'})));});req.on('timeout',()=>req.destroy(new Error('TIMEOUT')));req.on('error',error=>resolve(Object.freeze({port,status:null,body:'',error:error.code||'TIMEOUT'})));});
}
const context=vm.createContext({readConfig,probe,console:Object.freeze({log(value){if(++logs>1||typeof value!=='string'||Buffer.byteLength(value)>16384)throw new Error('Output limit');JSON.parse(value);process.stdout.write(value+'\n');}})},{codeGeneration:{strings:false,wasm:false}});
const deadline=setTimeout(()=>{process.stderr.write('Tool deadline exceeded\n');process.exit(124);},seconds*1000);
Promise.resolve().then(()=>new vm.Script('(async()=>{ "use strict";\n'+source+'\n})()',{filename:'generated-tool.js'}).runInContext(context,{timeout:seconds*1000})).then(()=>{if(logs!==1)throw new Error('Expected one JSON observation');}).catch(error=>{process.stderr.write(String(error.message).slice(0,500)+'\n');process.exitCode=1;}).finally(()=>clearTimeout(deadline));
`;
export const APPLY_PATCH = String.raw`
const fs=require('node:fs');
(async()=>{
 const patch=JSON.parse(fs.readFileSync('/workspace/proposed-patch.json','utf8')),contract=require('/workspace/fixture-contract.json');
 const file='/workspace/fixture-config.json',before=JSON.parse(fs.readFileSync(file,'utf8')),key=contract.patchKey;
 if(patch.file!==file||patch.operation!=='replace'||patch.path!=='/'+key||patch.risk!=='SANDBOX_MUTATION'||before[key]!==patch.oldValue||typeof patch.value!=='string'||patch.value.length<1||patch.value.length>128||patch.value===patch.oldValue)throw new Error('Patch precondition rejected');
 if(key==='healthPath'&&!/^\/[a-zA-Z0-9/-]{0,64}$/.test(patch.value))throw new Error('Path rejected');
 const after={...before,[key]:patch.value};fs.writeFileSync(file,JSON.stringify(after,null,2));
 process.kill(Number(fs.readFileSync('/workspace/fixture.pid','utf8')),'SIGHUP');
 for(let attempt=0;attempt<50;attempt++){try{const ack=JSON.parse(fs.readFileSync('/workspace/reload-ack.json','utf8'));if(JSON.stringify(ack)===JSON.stringify(after)){console.log(JSON.stringify({applied:true,reloaded:true,before,after}));return;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 throw new Error('Fixture reload was not acknowledged');
})().catch(error=>{console.error(String(error.message).slice(0,240));process.exitCode=1;});
`;
