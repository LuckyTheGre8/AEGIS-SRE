// Trusted fixture infrastructure. The diagnostic source is generated separately.
export const SERVER = String.raw`
const http = require('node:http');
const fs = require('node:fs');
let config = JSON.parse(fs.readFileSync('/workspace/fixture-config.json','utf8'));
process.on('SIGHUP',()=>{config=JSON.parse(fs.readFileSync('/workspace/fixture-config.json','utf8'));fs.writeFileSync('/workspace/reload-ack.json',JSON.stringify(config));});
http.createServer((_req,res) => { res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({service:'synthetic-backend',ok:true})); }).listen(config.backendPort,'127.0.0.1');
http.createServer((_req,res) => {
 const upstream = http.get({hostname:'127.0.0.1',port:config.upstreamPort,path:'/',timeout:1500}, response => { res.writeHead(response.statusCode); response.pipe(res); });
 upstream.on('timeout', () => upstream.destroy());
 upstream.on('error', error => { res.writeHead(502, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'Bad Gateway',upstreamError:error.code || 'TIMEOUT',upstreamPort:config.upstreamPort})); });
}).listen(config.proxyPort,'127.0.0.1');
`;
export const BOOTSTRAP = String.raw`
const {spawn} = require('node:child_process');
const http = require('node:http');
const child=spawn(process.execPath,['/workspace/fixture-server.cjs'],{detached:true,stdio:'ignore',env:{}});
require('node:fs').writeFileSync('/workspace/fixture.pid',String(child.pid));
child.unref();
const get = port => new Promise(resolve => { const req=http.get({hostname:'127.0.0.1',port,path:'/',timeout:1000},res=>{let body='';res.on('data',data=>body+=data);res.on('end',()=>resolve({port,status:res.statusCode,body}));}); req.on('error',()=>resolve({port,status:null}));req.on('timeout',()=>req.destroy()); });
(async()=>{ for(let attempt=0;attempt<30;attempt++){ const proxy=await get(8080),backend=await get(3000); if(proxy.status===502 && backend.status===200){console.log(JSON.stringify({fixture:'broken-proxy',proxy,backend}));return;} await new Promise(resolve=>setTimeout(resolve,100)); } throw new Error('Fixture failed to start'); })().catch(error=>{console.error(error.message);process.exitCode=1;});
`;

export const RUNNER = String.raw`
const fs=require('node:fs'), http=require('node:http'), vm=require('node:vm');
const config=Object.freeze(JSON.parse(fs.readFileSync('/workspace/fixture-config.json','utf8')));
const source=fs.readFileSync('/workspace/generated-tool.js','utf8');
const seconds=Math.min(20,Math.max(1,Number(process.argv[2])||20));
let reads=0,probes=0,logs=0;
function readConfig(){if(++reads>1)throw new Error('Read budget exceeded');return config;}
function probe(target){
 if(++probes>3 || !['proxy','backend','configuredUpstream'].includes(target))throw new Error('Probe denied');
 const port={proxy:config.proxyPort,backend:config.backendPort,configuredUpstream:config.upstreamPort}[target];
 return new Promise(resolve=>{const req=http.get({hostname:'127.0.0.1',port,path:'/',timeout:2000},res=>{let body='';res.on('data',data=>{body+=data;if(body.length>4096)req.destroy(new Error('Response limit'));});res.on('end',()=>resolve(Object.freeze({port,status:res.statusCode,body,error:null})));res.on('error',()=>resolve(Object.freeze({port,status:null,body:'',error:'RESPONSE_ERROR'})));});req.on('timeout',()=>req.destroy(new Error('TIMEOUT')));req.on('error',error=>resolve(Object.freeze({port,status:null,body:'',error:error.code||'TIMEOUT'})));});
}
const context=vm.createContext({readConfig,probe,console:Object.freeze({log(value){if(++logs>1||typeof value!=='string'||Buffer.byteLength(value)>16384)throw new Error('Output limit');JSON.parse(value);process.stdout.write(value+'\n');}})},{codeGeneration:{strings:false,wasm:false}});
const deadline=setTimeout(()=>{process.stderr.write('Tool deadline exceeded\n');process.exit(124);},seconds*1000);
Promise.resolve().then(()=>new vm.Script('(async()=>{ "use strict";\n'+source+'\n})()', {filename:'generated-tool.js'}).runInContext(context,{timeout:seconds*1000})).then(()=>{if(logs!==1)throw new Error('Expected one JSON observation');}).catch(error=>{process.stderr.write(String(error.message).slice(0,500)+'\n');process.exitCode=1;}).finally(()=>clearTimeout(deadline));
`;
