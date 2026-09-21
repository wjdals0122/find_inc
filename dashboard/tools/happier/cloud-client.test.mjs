import test from 'node:test';
import assert from 'node:assert/strict';
import {createDecipheriv,createCipheriv,randomBytes} from 'node:crypto';
import {CloudClient,CLOUD,TARGET,encryptData,decryptData,parseModels,readTranscript,readMeeting,mergeLocal,meetingEndPrompt,b64,unb64} from './cloud-client.mjs';
import {sealTerminalProvisioningV3Payload} from './vendor/terminalProvisioningV2.ts';

const vault=()=>({value:{},async load(){return this.value;},async save(value){this.value=structuredClone(value);}});
const model={id:'test-model',label:'Test',efforts:['medium'],defaultEffort:'medium'};
const body=()=>({requestId:crypto.randomUUID(),skill:'brand',model:model.id,effort:'medium',instruction:'Generate a report',apply:false});
const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw Error('test state did not settle');};

test('AES-GCM wire output matches the official Node bundle format and JSON envelope',async()=>{
 const key=randomBytes(32),value={request:'do not leak plaintext',nested:{ok:true}};
 const encrypted=await encryptData(value,key),bundle=unb64(encrypted);
 assert.equal(bundle[0],0);
 const decipher=createDecipheriv('aes-256-gcm',key,bundle.slice(1,13));decipher.setAuthTag(bundle.slice(-16));
 const plain=Buffer.concat([decipher.update(bundle.slice(13,-16)),decipher.final()]).toString();
 assert.deepEqual(JSON.parse(plain),{__happierSerializedJsonValueV1:true,type:'json',value});
 assert.deepEqual(await decryptData(encrypted,key),value);
 bundle[bundle.length-1]^=1;await assert.rejects(decryptData(b64(bundle),key));
});

test('Legacy unwrapped JSON in an AES data-key packet is also decoded',async()=>{
 const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const output=Buffer.concat([Buffer.from([0]),iv,cipher.update('{"legacy":true}'),cipher.final(),cipher.getAuthTag()]);
 assert.deepEqual(await decryptData(b64(output),key),{legacy:true});
});

test('Pairing requires authenticated V3 approval and does not persist private request keys',async()=>{
 const store=vault();let client;const key=randomBytes(32);
 const fetcher=async url=>{
  if(url.endsWith('/request'))return Response.json({state:'requested',expiresAt:Date.now()+60000});
  if(url.includes('/status'))return Response.json({status:'authorized'});
  const p=client.pending;
  return Response.json({state:'authorized',token:'test-account-token',response:b64(sealTerminalProvisioningV3Payload({contentPrivateKey:key,terminalEphemeralPublicKey:p.publicKey,pairingSecret:p.pairingSecret,createdAtMs:p.createdAtMs,expiresAtMs:p.expiresAtMs,randomBytes:n=>randomBytes(n)}))});
 };
 client=new CloudClient({owner:'test',fetcher,vault:store});
 const paired=await client.startPairing();assert.ok(paired.url.startsWith('https://cloud.happier.dev/terminal/connect#'));
 assert.equal(new URL(paired.url).search,'');
 assert.equal((await client.pairingStatus()).state,'authorized');
 assert.equal(client.pending,null);assert.equal(store.value.credentials.machineKey,b64(key));
 assert.equal(JSON.stringify(store.value).includes('secretKey'),false);client.close();
});

test('V3 approval authenticated with the wrong pairing secret is rejected',async()=>{
 let client;client=new CloudClient({owner:'test',vault:vault(),fetcher:async url=>{
  if(url.endsWith('/request'))return Response.json({expiresAt:Date.now()+60000});
  if(url.includes('/status'))return Response.json({status:'authorized'});
  const p=client.pending;return Response.json({state:'authorized',token:'invalid',response:b64(sealTerminalProvisioningV3Payload({contentPrivateKey:randomBytes(32),terminalEphemeralPublicKey:p.publicKey,pairingSecret:randomBytes(32),createdAtMs:p.createdAtMs,expiresAtMs:p.expiresAtMs,randomBytes:n=>randomBytes(n)}))});
 }});await client.startPairing();await assert.rejects(client.pairingStatus(),/암호화 검증/);client.close();
});

test('RPC sends ciphertext through Cloud Socket.IO and decrypts replies',async()=>{
 const client=new CloudClient({owner:'test',vault:vault()}),key=randomBytes(32);let packet;
 await client.readyPromise;client.machineKeys.set(TARGET.id,key);
 client.connectSocket=async()=>{};
 client.socket={timeout(){return this;},emit(event,payload,callback){packet=payload;assert.equal(event,'rpc-call');assert.equal(typeof payload.params,'string');encryptData({ok:true},key).then(result=>callback(null,{ok:true,result}));},disconnect(){}};
 const answer=await client.rpc(TARGET.id,'capabilities.describe',{sensitive:'test-prompt'});
 assert.deepEqual(answer,{ok:true});assert.equal(JSON.stringify(packet).includes('test-prompt'),false);
 assert.deepEqual(await decryptData(packet.params,key),{sensitive:'test-prompt'});client.close();
});

test('An unpaired browser cannot claim connection readiness',async()=>{
 const client=new CloudClient({owner:'test',vault:vault()});assert.equal((await client.connection()).ready,false);assert.equal((await client.connection()).needsPairing,true);client.close();
});

test('Time-limited create remains uncertain and never automatically spawns twice',async()=>{
 const client=new CloudClient({owner:'test',vault:vault()});await client.readyPromise;client.models=[model];
 client.connection=async()=>({ready:true});let spawns=0;
 client.rpc=async(_target,method)=>{if(method==='spawn-happy-session'){spawns++;throw Error('timeout');}return {status:'pending'};};
 const input=body(),run=await client.create(input,[{id:'brand',label:'Brand'}]);
 await wait(()=>client.runs.get(run.id).state==='uncertain');
 assert.equal(spawns,1);assert.equal(client.runs.get(run.id).sessionId,null);
 await client.create(input,[{id:'brand',label:'Brand'}]);assert.equal(spawns,1);
 await client.retry(run.id);await wait(()=>!client.creating.size);assert.equal(spawns,1);client.close();
});

test('Timeout reconciliation uses the identical spawn nonce and recovers the session',async()=>{
 const client=new CloudClient({owner:'test',vault:vault()});await client.readyPromise;client.models=[model];client.connection=async()=>({ready:true});
 let spawnedNonce,resolvedNonce;
 client.rpc=async(_target,method,payload)=>{if(method==='spawn-happy-session'){spawnedNonce=payload.spawnNonce;throw Error('timeout');}resolvedNonce=payload.spawnNonce;return {status:'success',sessionId:'existing-cloud-session'};};
 const run=await client.create(body(),[{id:'brand',label:'Brand'}]);await wait(()=>!client.creating.size);
 assert.equal(spawnedNonce,resolvedNonce);assert.equal(spawnedNonce,run.id);assert.equal(client.runs.get(run.id).sessionId,'existing-cloud-session');assert.equal(client.runs.get(run.id).state,'running');client.close();
});

test('A disconnected nonce lookup never authorizes a new spawn on retry',async()=>{
 const client=new CloudClient({owner:'test',vault:vault()});await client.readyPromise;client.models=[model];client.connection=async()=>({ready:true});
 let spawns=0;client.rpc=async()=>{spawns++;throw Error('offline');};
 const run=await client.create(body(),[{id:'brand',label:'Brand'}]);await wait(()=>!client.creating.size);
 const count=spawns;await client.retry(run.id);await wait(()=>!client.creating.size);
 assert.equal(spawns,count+1);assert.equal(client.runs.get(run.id).state,'uncertain');client.close();
});

test('Only observed model-specific effort options are offered',()=>{
 assert.deepEqual(parseModels({availableModels:[{id:'m',name:'Model',modelOptions:[{id:'reasoning_effort',currentValue:'high',options:[{value:'low'},{value:'high'}]}]},{id:'unknown',name:'Unknown'}]}),[{id:'m',label:'Model',efforts:['low','high'],defaultEffort:'high'}]);
});

test('Assistant commentary alone never marks a run completed',()=>{
 const response={role:'agent',content:{type:'acp',data:{type:'message',message:'Result'}}};
 assert.equal(readTranscript([response]).ready,false);
 assert.equal(readTranscript([response,{role:'agent',content:{type:'event',data:{type:'ready'}}}]).ready,true);
});

test('Meeting transcript keeps only tagged speaker lines and the user turns',()=>{
 const records=[
  {id:'u0',seq:1,content:{role:'user',content:{type:'text',text:'[FIND.INC AI 회의]\nprompt'}}},
  {id:'a1',seq:2,content:{role:'agent',content:{type:'acp',data:{type:'message',message:'생각 중 메모\n@@전략: 타깃을 30대로 좁히죠.\n@@콘텐츠: 숏폼 3편 제안합니다.\n@@팀장: 대표님 의견은요?'}}}},
  {id:'e1',seq:3,content:{role:'agent',content:{type:'event',data:{type:'task_complete'}}}},
  {id:'u1',seq:4,localId:'say-1',content:{role:'user',content:{type:'text',text:'대표: 예산은 절반으로.'}}}
 ];
 const read=readMeeting(records);
 assert.deepEqual(read.utterances.map(u=>[u.speaker,u.text]),[['strategy','타깃을 30대로 좁히죠.'],['contents','숏폼 3편 제안합니다.'],['lead','대표님 의견은요?'],['me','예산은 절반으로.']]);
 assert.equal(read.ready,false,'a new user turn reopens the discussion');
 assert.equal(mergeLocal(read.utterances,[{localId:'say-1',text:'예산은 절반으로.'},{localId:'say-2',text:'새 의견'}]).filter(u=>u.pending).length,1);
});
test('Meeting chat is sent encrypted to the session pending queue and end requests docs + main push',async()=>{
 const client=new CloudClient({owner:'test',vault:vault()}),key=randomBytes(32);const posts=[];
 await client.readyPromise;client.connectSocket=async()=>{};client.sessionKeys.set('sess-1',key);
 client.request=async(path,opts={})=>{posts.push({path,body:opts.body});return {didWrite:true};};
 const id=crypto.randomUUID();client.meetings.set(id,{id,kind:'meeting',topic:'신제품 런칭',state:'listening',sessionId:'sess-1',localSays:[],createdAt:new Date().toISOString()});
 const said=await client.sendToMeeting(id,'secret-free hello','say');
 assert.equal(posts[0].path,'/v2/sessions/sess-1/pending');assert.equal(JSON.stringify(posts[0].body).includes('hello'),false,'chat text never leaves in plaintext');
 assert.equal((await decryptData(posts[0].body.ciphertext,key)).content.text,'대표: secret-free hello');
 assert.equal(said.utterances.at(-1).pending,true);
 await client.sendToMeeting(id,'','end');const end=(await decryptData(posts[1].body.ciphertext,key)).content.text;
 assert.match(end,/docs\/meetings\/\d{4}-\d{2}-\d{2}-신제품-런칭\.md/);assert.match(end,/push origin HEAD:main/);
 await assert.rejects(client.sendToMeeting(id,'late','say'),/마무리/);client.close();
});
