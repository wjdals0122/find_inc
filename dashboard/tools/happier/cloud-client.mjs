/* Browser-only Happier Cloud adapter. Protocol reviewed against Happier CLI 0.2.21
 * and happier-dev/happier e992e049ffa7a98ab60740ac60f94918f022ff24.
 * Device secrets never enter the dashboard HTML, logs, URLs to Firebase, or a server.
 */
import {io} from 'socket.io-client';
import nacl from 'tweetnacl';
import {sha256} from '@noble/hashes/sha256';
import {openTerminalProvisioningV3Response} from './vendor/terminalProvisioningV2.ts';
import {openEncryptedDataKeyEnvelopeV1} from './vendor/encryptedDataKeyEnvelopeV1.ts';
import {stringifySerializedJsonValue,parseSerializedJsonValue} from './vendor/serializedJsonValue.ts';

export const CLOUD='https://api.happier.dev';
export const TARGET={id:'82ebbb06-c1ae-4d40-88c6-98c8f575dc41',host:'DESKTOP-MKHC6HD',path:'C:\\Users\\M123\\Desktop\\find-inc'};
const encoder=new TextEncoder(),decoder=new TextDecoder();
export const b64=bytes=>btoa(String.fromCharCode(...bytes));
export const unb64=text=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const url64=bytes=>b64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const random=n=>crypto.getRandomValues(new Uint8Array(n));
const stamp=()=>new Date().toISOString();
const finalStates=new Set(['completed','failed']);
async function dashboardHash(){try{const response=await fetch(new URL('dashboard.html',location.href),{cache:'no-store'});if(!response.ok)return null;return url64(new Uint8Array(await crypto.subtle.digest('SHA-256',await response.arrayBuffer())));}catch{return null;}}

export async function encryptData(value,key) {
  const nonce=random(12),k=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},k,encoder.encode(stringifySerializedJsonValue(value))));
  const out=new Uint8Array(13+cipher.length);out.set(nonce,1);out.set(cipher,13);return b64(out);
}
export async function decryptData(text,key) {
  const bytes=unb64(text);if(bytes.length<29||bytes[0]!==0)throw Error('암호화 형식을 확인할 수 없습니다.');
  const k=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['decrypt']);
  return parseSerializedJsonValue(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(1,13)},k,bytes.slice(13))));
}

// Credentials and run contents are AES-GCM wrapped in IndexedDB. The wrapping
// key is a non-extractable CryptoKey scoped to the Firebase user's browser origin.
export class BrowserVault {
  constructor(owner){this.owner=owner;}
  async db(){if(this.handle)return this.handle;this.handle=await new Promise((resolve,reject)=>{const r=indexedDB.open('find-happier-cloud-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('vault');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('브라우저 보안 저장소를 열지 못했습니다.'));});return this.handle;}
  async read(key){const db=await this.db();return new Promise((resolve,reject)=>{const r=db.transaction('vault').objectStore('vault').get(this.owner+':'+key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('저장소 읽기 실패'));});}
  async write(key,value){const db=await this.db();return new Promise((resolve,reject)=>{const tx=db.transaction('vault','readwrite');tx.objectStore('vault').put(value,this.owner+':'+key);tx.oncomplete=resolve;tx.onerror=()=>reject(Error('저장소 쓰기 실패'));});}
  async key(){if(!this.wrappingKey){this.wrappingKey=await this.read('key');if(!this.wrappingKey){this.wrappingKey=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await this.write('key',this.wrappingKey);}}return this.wrappingKey;}
  async load(){const value=await this.read('sealed');if(!value)return {};try{return JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:value.iv},await this.key(),value.data)));}catch{throw Error('저장된 브라우저 연결을 복호화하지 못했습니다.');}}
  async save(value){const iv=random(12);const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await this.key(),encoder.encode(JSON.stringify(value)));await this.write('sealed',{iv,data});}
}

export function parseModels(raw) {
  return (raw?.availableModels||[]).map(m=>{
    const option=m.modelOptions?.find(o=>o.id==='reasoning_effort');
    const efforts=(option?.options||[]).map(o=>String(o.value));
    return {id:m.id,label:m.name,efforts,defaultEffort:String(option?.currentValue||efforts[0]||'')};
  }).filter(m=>typeof m.id==='string'&&m.efforts.length);
}

export function readTranscript(contents) {
  let result='',ready=false,failed=false;
  for(const c of contents){const d=c?.content?.data;
    if(c?.role!=='agent'||!d)continue;
    if(c.content.type==='acp'&&d.type==='message'&&typeof d.message==='string'){result=d.message;ready=false;}
    if(c.content.type==='event'&&['ready','task_complete','turn_complete'].includes(d.type))ready=true;
    if(['error','task_failed','turn_aborted'].includes(d.type))failed=true;
  }
  return {result,ready,failed};
}


// AI meeting protocol: every spoken line is "@@<speaker>: <text>" so bubbles show only real meeting content.
export const MEETING_SPEAKERS={'팀장':'lead','전략':'strategy','콘텐츠':'contents','운영':'operation','결과':'result'};
const MEETING_MARK='[FIND.INC AI 회의]',END_MARK='[회의 마치기]';
export function meetingPrompt(topic){
  return `${MEETING_MARK}
당신은 FIND.INC의 AI 회의를 진행하는 팀장 에이전트입니다. 프로젝트 ${TARGET.path}의 AGENTS.md와 docs/company/company.md를 읽고 회사 맥락을 파악하세요.
회의 주제: ${topic}
참석자: 팀장(진행), 전략팀장(01-strategy), 콘텐츠팀장(02-contents), 운영팀장(03-operation), 대표(사용자).
Codex 멀티 에이전트(하위 에이전트) 기능을 쓸 수 있으면 전략·콘텐츠·운영 팀장을 각각 하위 에이전트로 띄워 각 팀 관점의 의견을 받으세요. 쓸 수 없으면 팀별 관점을 분리해 직접 작성하세요.
응답은 발언으로만 구성하고, 한 줄에 한 발언씩 반드시 다음 형식을 지키세요.
@@팀장: ...
@@전략: ...
@@콘텐츠: ...
@@운영: ...
한 발언은 2문장 이내, 한 차례에 4~8개 발언으로 서로의 의견에 반응하세요. 차례 마지막에는 팀장이 대표의 의견을 묻고 멈추세요.
대표의 메시지는 "대표:"로 시작합니다. 대표의 발언에 각 팀이 직접 반응하세요.
회의 중에는 파일 읽기만 하고 파일 수정, 커밋, 배포, 외부 게시는 하지 마세요. 비밀값과 개인정보는 말하지 마세요.
"${END_MARK}" 메시지를 받으면 그 지시에 따라 정리와 저장을 수행하세요.`;
}
export function meetingSlug(topic){return (String(topic).toLowerCase().replace(/[^0-9a-z가-힣]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40))||'meeting';}
export function meetingEndPrompt(m){
  const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}),file=`docs/meetings/${date}-${meetingSlug(m.topic)}.md`;
  return `${END_MARK}
대표: 회의를 마칩니다. 팀장으로서 다음을 순서대로 수행하세요.
1. @@팀장: 형식으로 결론과 다음 할 일을 3~5개 발언으로 요약하세요.
2. ${file} 파일을 한국어 마크다운으로 작성하세요. 포함: 회의 주제, 일시, 참석자, 팀별 논의 요약, 대표 의견, 결정 사항, 다음 할 일(담당 팀·우선순위). 개인정보와 비밀값은 넣지 마세요. 같은 이름의 파일이 있으면 뒤에 -2, -3을 붙이세요.
3. 현재 작업 폴더의 브랜치와 커밋하지 않은 변경은 건드리지 마세요. 이 파일만 Git main 브랜치에 올립니다: git fetch origin main → git worktree add <임시 폴더> origin/main → 파일 복사 → 임시 폴더에서 git add, git commit -m "docs: add AI meeting notes" → git push origin HEAD:main → git ls-remote origin main으로 원격 반영 확인 → git worktree remove <임시 폴더>. 현재 작업 폴더의 같은 경로에도 파일을 남기세요.
4. 마지막 줄에 "@@결과: 저장 경로 · 커밋 해시 · push 성공 여부"를 한 줄로 남기세요. 실패했다면 원인을 적으세요.`;
}
const textOf=c=>typeof c?.content?.text==='string'?c.content.text:typeof c?.content?.data?.message==='string'?c.content.data.message:'';
export function readMeeting(records){
  const utterances=[];let ready=false,failed=false,summary='',userTurns=0;
  for(const rec of records){const c=rec.content||rec,d=c?.content?.data;
    if(c?.role==='user'){const t=textOf(c);if(!t||t.startsWith(MEETING_MARK))continue;userTurns++;ready=false;
      if(t.startsWith(END_MARK)){utterances.push({id:rec.id+':end',speaker:'me',text:'회의를 마치고 정리를 요청했습니다.',localId:rec.localId||null,seq:rec.seq});continue;}
      utterances.push({id:String(rec.id),speaker:'me',text:t.replace(/^대표:\s*/,''),localId:rec.localId||null,seq:rec.seq});continue;}
    if(c?.role!=='agent'||!d)continue;
    if(c.content.type==='acp'&&d.type==='message'&&typeof d.message==='string'){ready=false;
      d.message.split(/\r?\n/).forEach((line,i)=>{const hit=line.match(/^\s*@@\s*(팀장|전략|콘텐츠|운영|결과)\s*[:：]\s*(.+)$/);if(!hit)return;
        const speaker=MEETING_SPEAKERS[hit[1]],text=hit[2].trim().slice(0,600);if(speaker==='result')summary=text;utterances.push({id:rec.id+':'+i,speaker,text,seq:rec.seq});});}
    if(c.content.type==='event'&&['ready','task_complete','turn_complete'].includes(d.type))ready=true;
    if(['error','task_failed','turn_aborted'].includes(d.type))failed=true;
  }
  return {utterances,ready,failed,summary,userTurns};
}
export function mergeLocal(utterances,localSays){
  const seen=new Set(utterances.map(u=>u.localId).filter(Boolean)),seenText=utterances.filter(u=>u.speaker==='me').map(u=>u.text);
  return [...utterances,...localSays.filter(l=>!seen.has(l.localId)&&!seenText.includes(l.text)).map(l=>({id:l.localId,speaker:'me',text:l.text,pending:true}))];
}

export class CloudClient {
  #credentials=null;
  constructor({owner,fetcher=globalThis.fetch.bind(globalThis),socketFactory=io,vault=new BrowserVault(owner)}={}) {
    this.owner=owner;this.fetcher=fetcher;this.socketFactory=socketFactory;this.vault=vault;
    this.runs=new Map();this.meetings=new Map();this.machineKeys=new Map();this.sessionKeys=new Map();this.creating=new Set();this.closed=false;
    this.readyPromise=this.restore();
  }
  async restore(){const data=await this.vault.load();if(this.closed)return;this.#credentials=data.credentials||null;for(const r of data.runs||[])this.runs.set(r.id,r);for(const m of data.meetings||[])this.meetings.set(m.id,m);}
  async persist(){if(this.closed)return;await this.vault.save({credentials:this.#credentials,runs:[...this.runs.values()].slice(-100),meetings:[...this.meetings.values()].slice(-20)});}
  async request(path,{body,auth=true,timeout=18000}={}) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{const r=await this.fetcher(CLOUD+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(auth&&this.#credentials?{Authorization:'Bearer '+this.#credentials.token}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store',signal:controller.signal});
      if(!r.ok){if(r.status===401&&auth)this.disconnect();throw Error(r.status===401?'Happier 연결을 다시 승인해주세요.':'Happier Cloud 요청에 실패했습니다.');}
      return await r.json();
    }catch(e){if(e.name==='AbortError')throw Error('Happier Cloud 응답 시간이 초과됐습니다.');throw e;}finally{clearTimeout(timer);}
  }
  async startPairing() {
    await this.readyPromise;
    const secretKey=random(32),publicKey=nacl.box.keyPair.fromSecretKey(secretKey).publicKey,claim=random(32),pairingSecret=random(32),createdAtMs=Date.now();
    const response=await this.request('/v1/auth/request',{auth:false,body:{publicKey:b64(publicKey),supportsV2:true,supportsTokenOnly:false,claimSecretHash:url64(sha256(claim))}});
    const expiresAtMs=Math.min(createdAtMs+600000,Number(response.expiresAt)||Infinity);
    this.pending={secretKey,publicKey,claim,pairingSecret,createdAtMs,expiresAtMs};
    const fragment=new URLSearchParams({key:url64(publicKey),server:CLOUD,pairingSecret:url64(pairingSecret),createdAt:String(createdAtMs),expiresAt:String(expiresAtMs)});
    return {url:'https://cloud.happier.dev/terminal/connect#'+fragment,expiresAt:expiresAtMs};
  }
  async pairingStatus(){
    if(!this.pending)return {state:this.#credentials?'authorized':'none'};
    const p=this.pending;if(Date.now()>p.expiresAtMs){this.pending=null;throw Error('연결 승인 시간이 만료됐습니다. 다시 연결해주세요.');}
    const state=await this.request('/v1/auth/request/status?publicKey='+encodeURIComponent(b64(p.publicKey)),{auth:false});
    if(state.status!=='authorized')return {state:'pending'};
    const claim=await this.request('/v1/auth/request/claim',{auth:false,body:{publicKey:b64(p.publicKey),claimSecret:url64(p.claim)}});
    if(claim.state!=='authorized')return {state:'pending'};
    const opened=openTerminalProvisioningV3Response({payload:unb64(claim.response),recipientSecretKeyOrSeed:p.secretKey,terminalEphemeralPublicKey:p.publicKey,pairingSecret:p.pairingSecret,createdAtMs:p.createdAtMs,expiresAtMs:p.expiresAtMs,nowMs:Date.now()});
    if(opened?.type!=='dataKey'||!claim.token)throw Error('연결 승인 응답의 암호화 검증에 실패했습니다.');
    this.#credentials={token:claim.token,machineKey:b64(opened.key)};this.pending=null;await this.persist();return {state:'authorized'};
  }
  async disconnect(){this.socket?.disconnect();this.socket=null;this.#credentials=null;this.pending=null;this.machineKeys.clear();this.sessionKeys.clear();this.models=[];await this.persist();}
  close(){this.closed=true;this.socket?.disconnect();this.#credentials=null;this.pending=null;this.machineKeys.clear();this.sessionKeys.clear();}
  async connectSocket(){
    await this.readyPromise;if(!this.#credentials)throw Error('Happier Cloud 연결 승인이 필요합니다.');
    if(this.socket?.connected)return;
    if(this.socketPromise)return this.socketPromise;
    this.socket?.disconnect();
    this.socket=this.socketFactory(CLOUD,{path:'/v1/updates/',transports:['websocket'],auth:{token:this.#credentials.token,clientType:'user-scoped',clientPurpose:'sync'},withCredentials:false,autoConnect:false,forceNew:true,multiplex:false,reconnection:false});
    this.socket.on('update',event=>{const body=event.body,sid=body?.sid;const run=[...this.runs.values(),...this.meetings.values()].find(r=>r.sessionId===sid);if(!run)return;run.dirty=true;const key=this.sessionKeys.get(sid),message=body?.message;if(key&&message?.content?.t==='encrypted')decryptData(message.content.c,key).then(content=>{run.socketMessages=[...(run.socketMessages||[]).filter(m=>m.id!==message.id),{id:message.id,seq:message.seq,content}].slice(-100);}).catch(()=>{});});
    this.socketPromise=new Promise((resolve,reject)=>{const socket=this.socket;const timer=setTimeout(()=>{socket.disconnect();reject(Error('Cloud 소켓 연결 시간이 초과됐습니다.'));},12000);const done=(error)=>{clearTimeout(timer);socket.off('connect',ok);socket.off('connect_error',bad);error?reject(error):resolve();};const ok=()=>done();const bad=()=>done(Error('암호화된 Cloud 소켓을 연결하지 못했습니다.'));socket.once('connect',ok);socket.once('connect_error',bad);socket.connect();}).finally(()=>{this.socketPromise=null;});
    return this.socketPromise;
  }
  async rowKey(row){
    if(!row.dataEncryptionKey||row.encryptionMode==='plain')throw Error('암호화된 기기·세션 키가 필요합니다.');
    const key=openEncryptedDataKeyEnvelopeV1({envelope:unb64(row.dataEncryptionKey),recipientSecretKeyOrSeed:unb64(this.#credentials.machineKey)});
    if(!key||key.length!==32)throw Error('현재 계정으로 기기·세션 키를 열지 못했습니다.');return key;
  }
  async rpc(target,method,payload,timeout=15000){
    await this.connectSocket();
    const key=this.machineKeys.get(target)||this.sessionKeys.get(target);if(!key)throw Error('암호화 RPC 키가 없습니다.');
    const ciphertext=await encryptData(payload,key);
    const response=await new Promise((resolve,reject)=>this.socket.timeout(timeout).emit('rpc-call',{method:target+':'+method,params:ciphertext,timeoutMs:timeout},(error,result)=>error?reject(Error('암호화 RPC 응답 시간이 초과됐습니다.')):resolve(result)));
    if(!response?.ok)throw Error('기기 RPC를 사용할 수 없습니다.');
    const result=await decryptData(Array.isArray(response.result)?response.result[0]:response.result,key);
    if(result?.error||result?.errorCode)throw Error('기기에서 요청을 처리하지 못했습니다.');return result;
  }
  async connection(){
    await this.readyPromise;
    if(!this.#credentials)return {ready:false,needsPairing:true,checks:{},checkedAt:stamp()};
    await this.connectSocket();
    const rows=await this.request('/v1/machines');
    const row=(Array.isArray(rows)?rows:rows.machines||[]).find(m=>m.id===TARGET.id);
    if(!row||row.revokedAt||row.replacedByMachineId)throw Error('이 계정에 등록된 대상 기기를 확인할 수 없습니다.');
    if(!row.active||Date.now()-Number(row.activeAt)>90000)throw Error('대상 컴퓨터가 오프라인입니다.');
    const key=await this.rowKey(row);this.machineKeys.set(TARGET.id,key);
    const metadata=await decryptData(row.metadata,key);
    if(metadata.host!==TARGET.host)throw Error('등록된 대상 컴퓨터의 이름이 다릅니다.');
    const described=await this.rpc(TARGET.id,'capabilities.describe',{});
    if(described.protocolVersion!==1)throw Error('기기 RPC 프로토콜을 확인할 수 없습니다.');
    const detected=await this.rpc(TARGET.id,'capabilities.detect',{requests:[{id:'cli.codex',params:{includeLoginStatus:true}}],bypassCache:true},20000);
    const result=detected.results?.['cli.codex'];
    const native=result?.ok===true&&result.data?.available===true&&(result.data?.authStatus?.state==='logged_in'||result.data?.isLoggedIn===true);
    if(!native)throw Error('기존 Codex 로그인을 확인할 수 없습니다. Happier에서 Codex 인증을 확인해주세요.');
    return {ready:true,machine:metadata.host,machineId:row.id,checks:{cloud:true,registered:true,daemonReady:true,codex:true},checkedAt:stamp(),encrypted:true};
  }
  async getModels(){
    if(!this.#credentials)return [];
    const r=await this.rpc(TARGET.id,'capabilities.invoke',{id:'cli.codex',method:'probeModels',params:{backendTarget:{kind:'builtInAgent',agentId:'codex'},codexBackendMode:'appServer',directory:TARGET.path}},30000);
    if(r.ok!==true||r.result?.source==='static')throw Error('기기의 실제 모델 목록을 확인하지 못했습니다.');
    this.models=parseModels(r.result);return this.models;
  }
  publicRun(r){const {payload,socketMessages,pageHash,...rest}=r;return rest;}
  async history(){await this.readyPromise;return {runs:[...this.runs.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(r=>this.publicRun(r))};}
  async create(body,catalog){
    await this.readyPromise;
    if(!/^[a-f0-9-]{36}$/i.test(body.requestId))throw Error('실행 요청 ID가 올바르지 않습니다.');
    const existing=this.runs.get(body.requestId);if(existing){if(['skill','model','effort','instruction','apply'].some(k=>existing[k]!==body[k]))throw Error('같은 요청 ID의 실행 내용이 다릅니다.');return this.publicRun(existing);}
    const skill=catalog.find(s=>s.id===body.skill),model=this.models?.find(m=>m.id===body.model);
    if(!skill||!model?.efforts.includes(body.effort)||!body.instruction?.trim()||body.instruction.length>8000)throw Error('스킬·모델·Effort와 요청 내용을 확인해주세요.');
    const run={...body,id:body.requestId,label:skill.label,state:'checking',sessionId:null,progress:'Cloud 기기 등록과 daemon 준비 상태 확인 중',result:'',createdAt:stamp(),updatedAt:stamp(),attempts:0,pageHash:body.apply?await dashboardHash():null};
    const prompt=`프로젝트 ${TARGET.path}의 AGENTS.md와 .agents/skills 안의 ${skill.id}/SKILL.md를 찾아 읽고 $${skill.id} 스킬을 적용하세요.\n사용자 요청: ${body.instruction}\n기존 프로젝트·인증·다른 산출물을 보존하고 비밀값은 출력하지 마세요. 작업에 필요한 사용자 확인과 외부 게시 승인 조건은 스킬을 따르세요. 결과 파일과 성공·실패·확인 필요 사항을 마지막 응답에 남기세요.\n`+(body.apply?'결과가 대시보드 자료에 영향을 주면 strategy-dashboard로 기존 디자인·로그인·스킬 아일랜드와 기존 자료를 보존하며 반영하고 필요하면 기존 Firebase Hosting find-inc에 hosting만 배포해 실제 결과를 확인하세요.':'대시보드 재생성이나 배포는 수행하지 마세요.');
    const updatedAt=Date.now();
    run.payload={type:'spawn-in-directory',directory:TARGET.path,backendTarget:{kind:'builtInAgent',agentId:'codex'},agent:'codex',codexBackendMode:'appServer',experimentalCodexAcp:false,windowsRemoteSessionLaunchMode:'hidden',permissionMode:'default',permissionModeUpdatedAt:updatedAt,modelId:body.model,modelUpdatedAt:updatedAt,spawnNonce:body.requestId,connectedServices:{v:1,bindingsByServiceId:{'openai-codex':{source:'native'},openai:{source:'native'}}},sessionConfigOptionOverrides:{v:1,updatedAt,overrides:{reasoning_effort:{updatedAt,value:body.effort}}},pendingFirstInput:{text:prompt,localId:'dashboard-input-'+body.requestId}};
    this.runs.set(run.id,run);await this.persist();this.start(run,false);return this.publicRun(run);
  }
  async resolveExisting(run){const r=await this.rpc(TARGET.id,'daemon.spawnSession.resolve',{spawnNonce:run.id},15000);return r;}
  async start(run,retry){
    if(this.creating.has(run.id))return;this.creating.add(run.id);
    try{
      await this.connection();if(this.closed)return;
      if(run.sessionId)return;
      if(retry||run.attempts){const found=await this.resolveExisting(run);
        if(found.status==='success'&&found.sessionId){run.sessionId=found.sessionId;run.state='running';run.progress='이미 생성된 세션에 다시 연결했습니다.';await this.persist();return;}
        if(found.status!=='not_found'){run.state='uncertain';run.progress='기존 세션이 준비 중이거나 확인되지 않았습니다. 새 세션을 만들지 않았습니다.';await this.persist();return;}}
      run.state='creating';run.progress='암호화된 Cloud RPC로 Codex 세션 생성 중';run.attempts++;await this.persist();
      try{const r=await this.rpc(TARGET.id,'spawn-happy-session',run.payload,60000);
        if(r.type!=='success'||!r.sessionId)throw Error('세션 생성 결과에 세션 ID가 없습니다.');
        run.sessionId=r.sessionId;run.state='running';run.progress='Codex 실행 중';
      }catch{const found=await this.resolveExisting(run);
        if(found.status==='success'&&found.sessionId){run.sessionId=found.sessionId;run.state='running';run.progress='생성된 세션을 찾아 연결했습니다.';}
        else{run.state='uncertain';run.progress='세션 생성 결과 확인 필요. 기존 세션 확인 후 재연결하세요.';}}
    }catch(e){run.state=run.attempts?'uncertain':'failed';run.progress=e.message;}
    finally{run.updatedAt=stamp();this.creating.delete(run.id);await this.persist();}
  }
  async getRun(id){
    await this.readyPromise;const r=this.runs.get(id);if(!r)throw Error('실행 내역을 찾을 수 없습니다.');
    if(r.sessionId&&!finalStates.has(r.state)){
      try{
        await this.connectSocket();
        const response=await this.request('/v2/sessions/'+encodeURIComponent(r.sessionId));const session=response.session||response;
        if(session.encryptionMode==='plain')throw Error('평문 세션은 지원하지 않습니다.');
        const key=await this.rowKey(session);this.sessionKeys.set(r.sessionId,key);
        const page=await this.request('/v1/sessions/'+encodeURIComponent(r.sessionId)+'/messages?scope=main&limit=100');
        const messageMap=new Map((r.socketMessages||[]).map(m=>[m.id,m]));for(const m of page.messages||[]){if(m.content?.t==='encrypted')messageMap.set(m.id,{...m,content:await decryptData(m.content.c,key)});}
        const contents=[...messageMap.values()].sort((a,b)=>a.seq-b.seq).map(m=>m.content);
        const read=readTranscript(contents);if(read.result)r.result=read.result;
        const agent=session.agentState?await decryptData(session.agentState,key):null;
        const pending=Object.keys(agent?.requests||{}).length;
        r.state=pending?'awaiting_approval':'running';r.progress=pending?'Happier에서 사용자 승인이 필요합니다.':'암호화된 Codex 응답 수신 중';
        if(read.failed){r.state='failed';r.progress='Codex가 오류 또는 중단을 보고했습니다.';}
        else if(read.ready&&read.result&&!pending){r.state='completed';r.progress='Codex 응답 완료';r.finishedAt=stamp();if(r.apply&&r.pageHash){const next=await dashboardHash();r.dashboardChanged=Boolean(next&&next!==r.pageHash);}}
      }catch(e){r.state='disconnected';r.progress=e.message;}
      r.updatedAt=stamp();await this.persist();
    }
    return this.publicRun(r);
  }
  // ---- AI meeting: one Codex session runs a multi-agent meeting; the user joins through the session's pending queue.
  async createMeeting(body){
    await this.readyPromise;
    if(!/^[a-f0-9-]{36}$/i.test(body.requestId))throw Error('회의 요청 ID가 올바르지 않습니다.');
    const existing=this.meetings.get(body.requestId);if(existing)return this.publicMeeting(existing);
    const topic=String(body.topic||'').trim(),model=this.models?.find(m=>m.id===body.model);
    if(!topic||topic.length>300)throw Error('회의 주제를 300자 이내로 입력해주세요.');
    if(!model?.efforts.includes(body.effort))throw Error('회의에 사용할 모델과 Effort를 확인해주세요.');
    const m={id:body.requestId,kind:'meeting',topic,model:body.model,effort:body.effort,state:'checking',sessionId:null,progress:'Cloud 기기와 Codex 연결 확인 중',createdAt:stamp(),updatedAt:stamp(),attempts:0,ended:false,localSays:[]};
    const updatedAt=Date.now();
    m.payload={type:'spawn-in-directory',directory:TARGET.path,backendTarget:{kind:'builtInAgent',agentId:'codex'},agent:'codex',codexBackendMode:'appServer',experimentalCodexAcp:false,windowsRemoteSessionLaunchMode:'hidden',permissionMode:'default',permissionModeUpdatedAt:updatedAt,modelId:body.model,modelUpdatedAt:updatedAt,spawnNonce:body.requestId,connectedServices:{v:1,bindingsByServiceId:{'openai-codex':{source:'native'},openai:{source:'native'}}},sessionConfigOptionOverrides:{v:1,updatedAt,overrides:{reasoning_effort:{updatedAt,value:body.effort}}},pendingFirstInput:{text:meetingPrompt(topic),localId:'dashboard-meeting-'+body.requestId}};
    this.meetings.set(m.id,m);await this.persist();this.start(m,false);return this.publicMeeting(m);
  }
  publicMeeting(m){const {payload,socketMessages,localSays,...rest}=m;return {...rest,utterances:mergeLocal(m.utterances||[],localSays||[])};}
  async listMeetings(){await this.readyPromise;return {meetings:[...this.meetings.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(m=>{const {payload,socketMessages,localSays,utterances,...rest}=m;return rest;})};}
  async sessionKeyFor(sessionId){
    if(this.sessionKeys.has(sessionId))return this.sessionKeys.get(sessionId);
    const response=await this.request('/v2/sessions/'+encodeURIComponent(sessionId));const session=response.session||response;
    if(session.encryptionMode==='plain')throw Error('평문 세션은 지원하지 않습니다.');
    const key=await this.rowKey(session);this.sessionKeys.set(sessionId,key);return key;
  }
  async getMeeting(id){
    await this.readyPromise;const m=this.meetings.get(id);if(!m)throw Error('회의를 찾을 수 없습니다.');
    if(m.sessionId&&!finalStates.has(m.state)){
      try{
        await this.connectSocket();
        const response=await this.request('/v2/sessions/'+encodeURIComponent(m.sessionId));const session=response.session||response;
        if(session.encryptionMode==='plain')throw Error('평문 세션은 지원하지 않습니다.');
        const key=await this.rowKey(session);this.sessionKeys.set(m.sessionId,key);
        const page=await this.request('/v1/sessions/'+encodeURIComponent(m.sessionId)+'/messages?scope=main&limit=100');
        const map=new Map((m.socketMessages||[]).map(x=>[x.id,x]));for(const x of page.messages||[]){if(x.content?.t==='encrypted')map.set(x.id,{...x,content:await decryptData(x.content.c,key)});}
        const read=readMeeting([...map.values()].sort((a,b)=>a.seq-b.seq));
        m.utterances=read.utterances;
        const agent=session.agentState?await decryptData(session.agentState,key):null,pending=Object.keys(agent?.requests||{}).length;
        if(read.failed){m.state='failed';m.progress='Codex가 오류 또는 중단을 보고했습니다.';}
        else if(pending){m.state='awaiting_approval';m.progress='Happier에서 사용자 승인이 필요합니다. (예: Git push)';}
        else if(m.ended&&read.ready&&read.summary){m.state='completed';m.progress='회의 정리와 저장이 끝났습니다.';m.summary=read.summary;m.finishedAt=stamp();}
        else if(m.ended){m.state='summarizing';m.progress='팀장이 회의 내용을 정리하고 docs/에 저장하는 중';}
        else{m.state=read.ready?'listening':'speaking';m.progress=read.ready?'대표의 의견을 기다리는 중':'에이전트들이 논의하는 중';}
      }catch(e){m.state='disconnected';m.progress=e.message;}
      m.updatedAt=stamp();await this.persist();
    }
    return this.publicMeeting(m);
  }
  async sendToMeeting(id,text,kind='say'){
    await this.readyPromise;const m=this.meetings.get(id);if(!m)throw Error('회의를 찾을 수 없습니다.');
    if(!m.sessionId)throw Error('회의 세션이 아직 준비되지 않았습니다.');
    if(finalStates.has(m.state)||m.ended)throw Error('이미 마무리 중이거나 끝난 회의입니다.');
    const body=String(text||'').trim();if(kind==='say'&&(!body||body.length>2000))throw Error('발언은 2000자 이내로 입력해주세요.');
    await this.connectSocket();const key=await this.sessionKeyFor(m.sessionId);
    const localId='dashboard-say-'+crypto.randomUUID();
    const message=kind==='end'?meetingEndPrompt(m):'대표: '+body;
    const ciphertext=await encryptData({role:'user',content:{type:'text',text:message},meta:{sentFrom:'web',source:'web'}},key);
    await this.request('/v2/sessions/'+encodeURIComponent(m.sessionId)+'/pending',{body:{localId,ciphertext,messageRole:'user'}});
    if(kind==='end'){m.ended=true;m.state='summarizing';m.progress='팀장에게 회의 정리를 요청했습니다.';}
    else{m.localSays=[...(m.localSays||[]),{localId,speaker:'me',text:body,at:stamp()}].slice(-50);m.state='speaking';m.progress='에이전트들이 대표 의견을 검토하는 중';}
    m.updatedAt=stamp();await this.persist();return this.publicMeeting(m);
  }
  async retry(id){await this.readyPromise;const r=this.runs.get(id);if(!r)throw Error('실행 내역을 찾을 수 없습니다.');if(!finalStates.has(r.state))this.start(r,true);return this.publicRun(r);}
}

const clients=new Map();
let publicCatalog;
async function getCatalog(){return publicCatalog ||= fetch(new URL('skills-catalog.json',location.href),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('프로젝트 스킬 목록을 불러오지 못했습니다.');return r.json();}).then(d=>d.skills);}
const browserAPI={forUser(owner){if(!clients.has(owner))clients.set(owner,new CloudClient({owner}));return clients.get(owner);},clear(){clients.forEach(c=>c.close());clients.clear();},
  async api(owner,path,body){
    const client=this.forUser(owner);await client.readyPromise;
    if(path==='bootstrap')return {skills:await getCatalog(),models:client.models||[],defaults:{},offline:false};
    if(path==='connection'){const result=await client.connection();if(result.ready)result.models=await client.getModels();return result;}
    if(path==='pair/start')return client.startPairing();
    if(path==='pair/status')return client.pairingStatus();
    if(path==='disconnect'){await client.disconnect();return {ok:true};}
    if(path==='history')return client.history();
    if(path==='runs')return client.create(body,await getCatalog());
    if(path.startsWith('runs/'))return client.getRun(path.slice(5));
    if(path.startsWith('retry/'))return client.retry(path.slice(6));
    if(path==='meetings')return body?client.createMeeting(body):client.listMeetings();
    const meeting=path.match(/^meetings\/([a-f0-9-]{36})(?:\/(say|end))?$/i);
    if(meeting)return meeting[2]==='say'?client.sendToMeeting(meeting[1],body?.text,'say'):meeting[2]==='end'?client.sendToMeeting(meeting[1],'','end'):client.getMeeting(meeting[1]);
    throw Error('지원하지 않는 Cloud 작업입니다.');
  }
};
if(typeof window!=='undefined')window.HappierCloud=browserAPI;
