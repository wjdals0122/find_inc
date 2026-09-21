import {CloudClient,CLOUD} from './cloud-client.mjs';
import {openTerminalProvisioningV2Response,sealTerminalProvisioningV3Payload} from './vendor/terminalProvisioningV2.ts';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const b64=x=>Buffer.from(x).toString('base64');
let client;const stash={value:{},async load(){return this.value;},async save(value){this.value=structuredClone(value);}};
const fetcher=async(url,options)=>{
 const response=await fetch(url,options);
 if(!url.endsWith('/v1/auth/request/claim')||!response.ok)return response;
 const data=await response.json();
 // Official CLI approval currently provisions V2. Re-wrap that locally approved
 // payload to exercise the browser's V3 verifier; no credential leaves memory.
 const raw=Uint8Array.from(Buffer.from(data.response,'base64'));
 if(String.fromCharCode(...raw.slice(0,4))!=='HPV3'){
  const pending=client.pending;
  const opened=openTerminalProvisioningV2Response({payload:raw,recipientSecretKeyOrSeed:pending.secretKey});
  if(opened?.type!=='dataKey')throw Error('Native approval did not provision a data key');
  data.response=b64(sealTerminalProvisioningV3Payload({contentPrivateKey:opened.key,terminalEphemeralPublicKey:pending.publicKey,pairingSecret:pending.pairingSecret,createdAtMs:pending.createdAtMs,expiresAtMs:pending.expiresAtMs,randomBytes:n=>crypto.getRandomValues(new Uint8Array(n))}));
 }
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};
client=new CloudClient({owner:'protocol-live-check',fetcher,vault:stash});
try{
 await client.startPairing();
 const publicKey=b64(client.pending.publicKey);
 const approved=await exec('C:/Users/M123/.happier/bin/happier.exe',['--server','cloud','auth','approve','--public-key',publicKey,'--json'],{timeout:30000,windowsHide:true});
 if(!approved.stdout.includes('true'))throw Error('CLI approval failed');
 await client.pairingStatus();
 const connection=await client.connection();
 console.log(JSON.stringify({stage:'encrypted-cloud-rpc',connection}));
 const models=await client.getModels();console.log(JSON.stringify({stage:'models',models}));

 const {chromium}=await import('file:///' + 'C:/Users/M123/Desktop/find-inc/dashboard/tests/node_modules/playwright/index.mjs');
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:8770/login.html');
  await page.addScriptTag({url:'http://127.0.0.1:8770/happier-cloud.js'});
  const check=await page.evaluate(async record=>{
   const first=window.HappierCloud.forUser('live-protocol-browser');
   await first.readyPromise;await first.vault.save(record);window.HappierCloud.clear();
   const client=window.HappierCloud.forUser('live-protocol-browser');
   const ready=await client.connection();const models=await client.getModels();
   const wrappingKey=await client.vault.key();
   const sealed=await client.vault.read('sealed');
   let exportBlocked=false;try{await crypto.subtle.exportKey('raw',wrappingKey);}catch{exportBlocked=true;}
   return {ready:ready.ready,checks:ready.checks,transport:client.socket.io.engine.transport.name,modelCount:models.length,vaultEncrypted:sealed.data instanceof ArrayBuffer,wrappingKeyNonExtractable:!wrappingKey.extractable&&exportBlocked};
  },stash.value);
  console.log(JSON.stringify({stage:'real-browser-cloud-check',...check}));
  if(!check.ready||check.transport!=='websocket'||!check.wrappingKeyNonExtractable)throw Error('Browser check failed');
 }finally{await browser.close();}

}catch(e){console.error(JSON.stringify({error:e.message,stack:e.stack?.split('\n').slice(0,4)}));process.exitCode=1;}
finally{client.close();}
