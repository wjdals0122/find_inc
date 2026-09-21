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


// ---- AI review (품평회): presenter + N reviewer Codex sessions, orchestrated in turn by the browser.
export const REVIEW_PERSPECTIVES={
  '전략':'브랜드 포지셔닝, 브리프 목표와의 정합성, 경쟁 대비 차별성을 봅니다.',
  '고객':'타깃 고객의 이해도, 구매 동기와 우려, 메시지 공감도를 봅니다.',
  '콘텐츠':'카피 완성도, 시각 구성, 제작 품질, 자연스러운 한국어를 봅니다.',
  '채널 운영':'채널별 포맷 적합성, 노출·전환 가능성, 운영 실행성을 봅니다.',
  '브랜드':'브랜드 가이드와 톤 준수, 공식 근거 표기를 봅니다.',
  '성과 분석':'측정 지표, 가설 검증 방법, 기대 성과의 근거를 봅니다.'
};
const REVIEW_MARK='[FIND.INC AI 품평회]';
export const REVIEW_KINDS={brief:'마케팅 브리핑',image:'광고 이미지',video:'광고 영상'};
const relPath=p=>String(p).startsWith(TARGET.path)?String(p).slice(TARGET.path.length).replace(/^[\\/]+/,'').replace(/\\/g,'/'):String(p);
export function insideProject(p){const s=String(p||'');return s.startsWith(TARGET.path+'\\')&&!/(^|[\\/])\.\.([\\/]|$)/.test(s)&&!/[\0]/.test(s);}
const itemList=items=>items.map(i=>`- [${REVIEW_KINDS[i.kind]||i.kind}] ${i.label} — ${relPath(i.path)}`).join('\n');
export function reviewPresenterPrompt(r){
  return `${REVIEW_MARK} 발표
당신은 FIND.INC 콘텐츠팀 발표자입니다. 프로젝트 ${TARGET.path}의 AGENTS.md와 docs/company/company.md를 읽어 회사 맥락을 파악하세요.
품평회 주제: ${r.topic}
먼저 git fetch로 원격 최신 상태를 확인하세요. 작업 트리는 바꾸지 말고, 원격에 더 최신 버전이 있는 Git 관리 파일은 git show로 읽으세요. 02-contents/는 Git이 아닌 Google Drive 동기화 폴더이므로 로컬 파일을 그대로 읽습니다.
발표할 산출물:
${itemList(r.items)}
각 산출물을 읽고 핵심 의도, 타깃, 메시지, 시각 구성, 기대 효과를 발표하세요.
응답은 발표 문장으로만 구성하고, 한 줄에 한 문장씩 "@@발표: ..." 형식을 지키세요. 산출물마다 2~4줄, 전체 6~14줄로 하세요.
품평 중에는 파일 수정, 커밋, 배포, 외부 게시를 하지 마세요. 비밀값과 개인정보는 말하지 마세요.
이후 "대표:"로 시작하는 메시지는 대표의 의견이고, "[품평 답변]" 메시지는 평가자 피드백 모음입니다. 답변도 "@@발표:" 형식으로 하세요. "[세션 종료]" 메시지를 받으면 그 지시를 따르세요.`;
}
function timelineText(r,filter=()=>true){
  return r.timeline.filter(filter).map(u=>`[${u.speaker==='me'?'대표':u.speaker==='presenter'?'발표':(r.reviewers[u.reviewer]?.perspective||'평가')+' 피드백'}] ${u.text}`).join('\n');
}
export function reviewReviewerPrompt(r,i){
  const v=r.reviewers[i];
  return `${REVIEW_MARK} 피드백
당신은 FIND.INC 품평회의 ${v.perspective} 관점 평가자입니다. ${REVIEW_PERSPECTIVES[v.perspective]||''}
프로젝트 ${TARGET.path}의 AGENTS.md를 참고하고, 필요하면 아래 산출물 파일을 직접 읽으세요. 읽기만 허용됩니다.
품평회 주제: ${r.topic}
산출물:
${itemList(r.items)}
지금까지의 발표와 피드백:
${timelineText(r)||'(아직 없음)'}
${v.perspective} 관점에서 잘된 점 1개, 개선할 점 2~3개, 구체적인 수정 제안 1~2개를 말하세요. 앞선 피드백과 겹치면 동의나 보완으로 짧게 언급하세요. 대표 의견이 있으면 반영하세요.
응답은 한 줄에 한 문장씩 "@@피드백: ..." 형식으로만 4~7줄 작성하세요. 파일 수정, 커밋, 배포, 외부 게시는 하지 마세요. 비밀값과 개인정보는 말하지 마세요.
"대표:"로 시작하는 메시지에는 "@@피드백:" 형식으로 짧게 답하세요.`;
}
export function reviewAnswerPrompt(r){
  return `[품평 답변]
평가자들의 피드백과 대표 의견입니다.
${timelineText(r,u=>u.speaker!=='presenter')}
각 피드백의 수용 여부와 개선 계획을 "@@발표:" 형식으로 4~8줄 답변하세요. 마지막 줄에서 대표의 추가 의견을 요청하세요.`;
}
export function reviewSlug(topic){return (String(topic).toLowerCase().replace(/[^0-9a-z가-힣]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40))||'review';}
export function reviewEndPrompt(r){
  const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}),file=`docs/reviews/${date}-${reviewSlug(r.topic)}.md`;
  return `[세션 종료]
대표가 품평회를 종료했습니다. 다음을 순서대로 수행하세요.
1. "@@발표:" 형식으로 핵심 결론을 2~3줄 말하세요.
2. ${file} 파일을 한국어 마크다운으로 작성하세요. 포함: 품평회 주제, 일시, 참석 에이전트(관점·모델·Effort), 발표 산출물(경로), 발표 내용 요약, 관점별 피드백, 대표 의견, 발표자 답변, 합의된 개선 사항과 다음 할 일. 아래 전체 기록을 근거로 하고 개인정보와 비밀값은 넣지 마세요. 같은 이름의 파일이 있으면 뒤에 -2, -3을 붙이세요.
3. 이 파일 외에는 수정하지 말고 커밋이나 배포도 하지 마세요.
4. 마지막 줄에 "@@결과: 저장 경로"를 한 줄로 남기세요. 실패했다면 원인을 적으세요.
참석 에이전트: 발표자(${r.presenter.model}/${r.presenter.effort}), ${r.reviewers.map(v=>`${v.perspective}(${v.model}/${v.effort})`).join(', ')}
전체 기록:
${timelineText(r)}`;
}
// Parses one session's transcript into tagged lines. User messages are never shown from here
// (the browser records the user's own lines), and readiness only counts after every message we sent.
export function readTagged(records,tags){
  const lines=[];let ready=false,failed=false,extraUserTurns=0;
  for(const rec of records){const c=rec.content||rec,d=c?.content?.data;
    if(c?.role==='user'){const t=typeof c?.content?.text==='string'?c.content.text:'';if(!t.startsWith(REVIEW_MARK))extraUserTurns++;ready=false;continue;}
    if(c?.role!=='agent'||!d)continue;
    if(c.content.type==='acp'&&d.type==='message'&&typeof d.message==='string'){ready=false;
      d.message.split(/\r?\n/).forEach((line,i)=>{const hit=line.match(/^\s*@@\s*([^:：]{1,8})\s*[:：]\s*(.+)$/);if(!hit||!tags.includes(hit[1].trim()))return;lines.push({id:rec.id+':'+i,tag:hit[1].trim(),text:hit[2].trim().slice(0,600)});});}
    if(c.content.type==='event'&&['ready','task_complete','turn_complete'].includes(d.type))ready=true;
    if(['error','task_failed','turn_aborted'].includes(d.type))failed=true;
  }
  return {lines,ready,failed,extraUserTurns};
}

export class CloudClient {
  #credentials=null;
  constructor({owner,fetcher=globalThis.fetch.bind(globalThis),socketFactory=io,vault=new BrowserVault(owner)}={}) {
    this.owner=owner;this.fetcher=fetcher;this.socketFactory=socketFactory;this.vault=vault;
    this.runs=new Map();this.meetings=new Map();this.reviews=new Map();this.machineKeys=new Map();this.sessionKeys=new Map();this.creating=new Set();this.closed=false;
    this.readyPromise=this.restore();
  }
  async restore(){const data=await this.vault.load();if(this.closed)return;this.#credentials=data.credentials||null;for(const r of data.runs||[])this.runs.set(r.id,r);for(const m of data.meetings||[])this.meetings.set(m.id,m);for(const r of data.reviews||[])this.reviews.set(r.id,r);}
  async persist(){if(this.closed)return;await this.vault.save({credentials:this.#credentials,runs:[...this.runs.values()].slice(-100),meetings:[...this.meetings.values()].slice(-20),reviews:[...this.reviews.values()].slice(-10)});}
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
  async rpc(target,method,payload,timeout=15000,{allowError=false}={}){
    await this.connectSocket();
    const key=this.machineKeys.get(target)||this.sessionKeys.get(target);if(!key)throw Error('암호화 RPC 키가 없습니다.');
    const ciphertext=await encryptData(payload,key);
    const response=await new Promise((resolve,reject)=>this.socket.timeout(timeout).emit('rpc-call',{method:target+':'+method,params:ciphertext,timeoutMs:timeout},(error,result)=>error?reject(Error('암호화 RPC 응답 시간이 초과됐습니다.')):resolve(result)));
    if(!response?.ok)throw Error('기기 RPC를 사용할 수 없습니다.');
    const result=await decryptData(Array.isArray(response.result)?response.result[0]:response.result,key);
    if(!allowError&&(result?.error||result?.errorCode))throw Error('기기에서 요청을 처리하지 못했습니다.');return result;
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
  // ---- AI review (품평회)
  async listArtifacts(){
    await this.readyPromise;if(!this.#credentials)return {needsPairing:true,briefs:[],images:[],videos:[]};
    if(!this.machineKeys.has(TARGET.id))await this.connection();
    const ls=async path=>{const r=await this.rpc(TARGET.id,'daemon.filesystem.listDirectory',{path,includeFiles:true,maxEntries:500},20000,{allowError:true});if(r?.ok===false)return null;return r.entries||[];};
    const dirs=list=>(list||[]).filter(e=>/dir/i.test(e.type)&&!e.name.startsWith('.'));
    const latest=list=>Math.max(0,...(list||[]).map(e=>Number(e.modified)||Date.parse(e.modified)||0));
    const briefs=[],images=[],videos=[],sep='\\';
    for(const base of ['01-strategy\\brief','01-contents\\marketing-brief','01-strategy\\marketing-brief']){
      for(const brand of dirs(await ls(TARGET.path+sep+base)))for(const product of dirs(await ls(brand.path))){
        const files=(await ls(product.path)||[]).filter(e=>!/dir/i.test(e.type)&&/\.md$/i.test(e.name));if(!files.length)continue;
        briefs.push({id:'brief:'+product.path,kind:'brief',brand:brand.name,product:product.name,label:`${brand.name} · ${product.name} 마케팅 브리핑`,path:product.path,files:files.map(f=>f.name),modified:latest(files)});
      }
    }
    for(const [kind,folder,out] of [['image','ad-images',images],['video','ad-videos',videos]]){
      for(const brand of dirs(await ls(TARGET.path+sep+'02-contents'+sep+folder)))for(const product of dirs(await ls(brand.path))){
        for(const ad of dirs(await ls(product.path)).filter(d=>/^ads?-/i.test(d.name)))out.push({id:kind+':'+ad.path,kind,brand:brand.name,product:product.name,label:`${brand.name} · ${product.name} · ${ad.name}`,path:ad.path,modified:Number(ad.modified)||Date.parse(ad.modified)||0});
      }
    }
    const byNew=(a,b)=>b.modified-a.modified||a.label.localeCompare(b.label);
    return {briefs:briefs.sort(byNew),images:images.sort(byNew),videos:videos.sort(byNew),root:TARGET.path};
  }
  async listArtifactFolder(path){
    await this.readyPromise;if(!insideProject(path))throw Error('프로젝트 밖의 경로는 열 수 없습니다.');
    if(!this.machineKeys.has(TARGET.id))await this.connection();
    const out=[];const walk=async(dir,depth)=>{const r=await this.rpc(TARGET.id,'daemon.filesystem.listDirectory',{path:dir,includeFiles:true,maxEntries:200},20000,{allowError:true});if(r?.ok===false)throw Error('산출물 폴더를 읽지 못했습니다.');
      for(const e of r.entries||[]){if(e.name.startsWith('.')||/desktop\.ini$/i.test(e.name))continue;if(/dir/i.test(e.type)){if(depth<2&&!/^(archive|references)$/i.test(e.name))await walk(e.path,depth+1);}else if(/\.(md|png|jpe?g|webp|gif|mp4|webm|mov)$/i.test(e.name))out.push({name:relPath(e.path).split('/').slice(-2).join('/'),path:e.path,size:e.size,type:/\.md$/i.test(e.name)?'text':/\.(mp4|webm|mov)$/i.test(e.name)?'video':'image'});}};
    await walk(path,0);return {files:out.slice(0,60)};
  }
  async readArtifactFile(id,path){
    await this.readyPromise;const r=this.reviews.get(id);if(!r)throw Error('품평회를 찾을 수 없습니다.');
    if(!insideProject(path))throw Error('프로젝트 밖의 파일은 열 수 없습니다.');
    const s=r.sessions[0];if(!s?.sessionId)throw Error('발표자 세션이 준비되면 화면에 표시합니다.');
    await this.sessionKeyFor(s.sessionId);
    const res=await this.rpc(s.sessionId,'readFile',{path},30000,{allowError:true});
    if(!res?.success)throw Error(/too large/i.test(res?.error||'')?'파일이 커서(2.5MB 초과) 화면에 표시할 수 없습니다.':'파일을 읽지 못했습니다.');
    return {content:res.content};
  }
  async createReview(body){
    await this.readyPromise;
    if(!/^[a-f0-9-]{36}$/i.test(body.requestId))throw Error('품평회 요청 ID가 올바르지 않습니다.');
    const existing=this.reviews.get(body.requestId);if(existing)return this.publicReview(existing);
    const active=[...this.reviews.values()].find(r=>!finalStates.has(r.state));if(active)throw Error('진행 중인 품평회가 있습니다. 이어서 보거나 세션을 종료한 뒤 시작해주세요.');
    const topic=String(body.topic||'').trim(),ok=(m,e)=>this.models?.find(x=>x.id===m)?.efforts.includes(e);
    if(!topic||topic.length>300)throw Error('발표 주제를 300자 이내로 입력해주세요.');
    const items=(Array.isArray(body.items)?body.items:[]).filter(i=>REVIEW_KINDS[i?.kind]&&insideProject(i.path)).slice(0,8).map(i=>({kind:i.kind,label:String(i.label||'').slice(0,120),path:i.path}));
    if(!items.length)throw Error('발표할 산출물을 하나 이상 선택해주세요.');
    const reviewers=(Array.isArray(body.reviewers)?body.reviewers:[]).slice(0,6).map(v=>({perspective:REVIEW_PERSPECTIVES[v?.perspective]?v.perspective:'전략',model:v?.model,effort:v?.effort}));
    if(!reviewers.length)throw Error('평가 에이전트를 한 명 이상 선택해주세요.');
    if(!ok(body.presenter?.model,body.presenter?.effort)||reviewers.some(v=>!ok(v.model,v.effort)))throw Error('에이전트별 모델과 Effort를 확인해주세요.');
    const r={id:body.requestId,kind:'review',topic,items,presenter:{model:body.presenter.model,effort:body.presenter.effort},reviewers,stage:'presenting',turn:0,state:'checking',progress:'발표자 세션을 준비하는 중',timeline:[],createdAt:stamp(),updatedAt:stamp(),ended:false,sessions:[]};
    r.sessions.push(this.reviewSession(r,'presenter',-1,r.presenter,reviewPresenterPrompt(r)));
    this.reviews.set(r.id,r);await this.persist();this.start(r.sessions[0],false);return this.publicReview(r);
  }
  reviewSession(r,role,index,cfg,prompt){
    const nonce=crypto.randomUUID(),updatedAt=Date.now();
    return {id:nonce,role,index,model:cfg.model,effort:cfg.effort,sessionId:null,state:'checking',attempts:0,expectExtra:0,createdAt:stamp(),
      payload:{type:'spawn-in-directory',directory:TARGET.path,backendTarget:{kind:'builtInAgent',agentId:'codex'},agent:'codex',codexBackendMode:'appServer',experimentalCodexAcp:false,windowsRemoteSessionLaunchMode:'hidden',permissionMode:'default',permissionModeUpdatedAt:updatedAt,modelId:cfg.model,modelUpdatedAt:updatedAt,spawnNonce:nonce,connectedServices:{v:1,bindingsByServiceId:{'openai-codex':{source:'native'},openai:{source:'native'}}},sessionConfigOptionOverrides:{v:1,updatedAt,overrides:{reasoning_effort:{updatedAt,value:cfg.effort}}},pendingFirstInput:{text:prompt,localId:'dashboard-review-'+nonce}}};
  }
  publicReview(r){return {...r,sessions:r.sessions.map(({payload,...s})=>s)};}
  async listReviews(){await this.readyPromise;return {reviews:[...this.reviews.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(({timeline,sessions,...rest})=>rest)};}
  async readSessionRecords(sessionId){
    const response=await this.request('/v2/sessions/'+encodeURIComponent(sessionId));const session=response.session||response;
    if(session.encryptionMode==='plain')throw Error('평문 세션은 지원하지 않습니다.');
    const key=await this.rowKey(session);this.sessionKeys.set(sessionId,key);
    const page=await this.request('/v1/sessions/'+encodeURIComponent(sessionId)+'/messages?scope=main&limit=100');
    const records=[];for(const x of page.messages||[])if(x.content?.t==='encrypted')records.push({...x,content:await decryptData(x.content.c,key)});
    const agent=session.agentState?await decryptData(session.agentState,key):null;
    return {records:records.sort((a,b)=>a.seq-b.seq),pending:Object.keys(agent?.requests||{}).length};
  }
  async pushToSession(s,text){
    const key=await this.sessionKeyFor(s.sessionId),localId='dashboard-review-say-'+crypto.randomUUID();
    const ciphertext=await encryptData({role:'user',content:{type:'text',text},meta:{sentFrom:'web',source:'web'}},key);
    await this.request('/v2/sessions/'+encodeURIComponent(s.sessionId)+'/pending',{body:{localId,ciphertext,messageRole:'user'}});
    s.expectExtra=(s.expectExtra||0)+1;s.ready=false;return localId;
  }
  async getReview(id){
    await this.readyPromise;const r=this.reviews.get(id);if(!r)throw Error('품평회를 찾을 수 없습니다.');
    if(finalStates.has(r.state))return this.publicReview(r);
    try{
      await this.connectSocket();let approval=false;const seen=new Set(r.timeline.map(u=>u.id));
      for(const s of r.sessions){if(!s.sessionId||s.done)continue;
        const {records,pending}=await this.readSessionRecords(s.sessionId);
        const read=readTagged(records,s.role==='presenter'?['발표','결과']:['피드백']);
        s.ready=read.ready&&read.extraUserTurns>=(s.expectExtra||0);s.failed=read.failed;if(pending)approval=true;
        for(const l of read.lines){const uid=s.sessionId+':'+l.id;if(seen.has(uid))continue;seen.add(uid);
          if(l.tag==='결과'){r.summary=l.text;continue;}
          r.timeline.push({id:uid,speaker:s.role,reviewer:s.index,text:l.text,at:stamp()});}
      }
      r.timeline=r.timeline.slice(-400);
      await this.advanceReview(r);
      if(approval&&!finalStates.has(r.state)){r.state='awaiting_approval';r.progress='Happier에서 사용자 승인이 필요합니다.';}
    }catch(e){r.state='disconnected';r.progress=e.message;}
    r.updatedAt=stamp();await this.persist();return this.publicReview(r);
  }
  async advanceReview(r){
    const presenter=r.sessions[0],N=r.reviewers.length;
    if(!presenter.sessionId){r.state=presenter.state==='failed'||presenter.state==='uncertain'?'failed':'checking';r.progress=presenter.progress||'발표자 세션을 만드는 중';return;}
    if(presenter.failed&&r.stage!=='closing'){r.state='failed';r.progress='발표자 Codex 세션이 오류를 보고했습니다.';return;}
    if(r.stage==='presenting'){if(!presenter.ready){r.state='presenting';r.progress='발표자가 산출물을 발표하는 중';return;}r.stage='reviewing';r.turn=0;}
    if(r.stage==='reviewing'){
      while(r.turn<N){
        let s=r.sessions.find(x=>x.role==='reviewer'&&x.index===r.turn);
        if(!s){s=this.reviewSession(r,'reviewer',r.turn,r.reviewers[r.turn],reviewReviewerPrompt(r,r.turn));r.sessions.push(s);await this.persist();this.start(s,false);}
        if(s.ready||s.failed||s.state==='failed'||s.state==='uncertain'){
          if(s.failed||!s.sessionId)r.timeline.push({id:'skip:'+s.id,speaker:'system',text:`${r.reviewers[r.turn].perspective} 평가자 세션에 오류가 있어 다음 순서로 넘어갑니다.`,at:stamp()});
          s.done=true;r.turn++;continue;}
        r.state='reviewing';r.progress=`${r.reviewers[r.turn].perspective} 관점 평가자가 피드백하는 중 (${r.turn+1}/${N})`;return;
      }
      r.stage='answering';await this.pushToSession(presenter,reviewAnswerPrompt(r));presenter.ready=false;
    }
    if(r.stage==='answering'){if(!presenter.ready){r.state='answering';r.progress='발표자가 피드백에 답변하는 중';return;}r.stage='open';}
    if(r.stage==='open'){r.state='open';r.progress=presenter.ready?'자유 토론 · 대표 의견을 기다리는 중':'발표자가 대표 의견에 답하는 중';return;}
    if(r.stage==='closing'){
      if(presenter.ready&&r.summary){r.state='completed';r.stage='closed';r.progress='발표와 피드백을 docs/에 정리했습니다.';r.finishedAt=stamp();}
      else if(presenter.ready&&presenter.failed){r.state='failed';r.progress='정리 중 오류가 발생했습니다.';}
      else{r.state='closing';r.progress='발표자가 품평 내용을 docs/에 정리하는 중';}
    }
  }
  async sendToReview(id,text,kind='say'){
    await this.readyPromise;const r=this.reviews.get(id);if(!r)throw Error('품평회를 찾을 수 없습니다.');
    if(finalStates.has(r.state)||r.ended)throw Error('이미 종료 중이거나 끝난 품평회입니다.');
    const presenter=r.sessions[0];if(!presenter.sessionId)throw Error('발표자 세션이 아직 준비되지 않았습니다.');
    await this.connectSocket();
    if(kind==='end'){await this.pushToSession(presenter,reviewEndPrompt(r));presenter.ready=false;r.ended=true;r.stage='closing';r.state='closing';r.progress='발표자에게 정리를 요청했습니다.';}
    else{const body=String(text||'').trim();if(!body||body.length>2000)throw Error('의견은 2000자 이내로 입력해주세요.');
      const current=r.stage==='reviewing'?r.sessions.find(x=>x.role==='reviewer'&&x.index===r.turn&&x.sessionId):null,target=current||presenter;
      const localId=await this.pushToSession(target,'대표: '+body);r.timeline.push({id:localId,speaker:'me',text:body,at:stamp()});}
    r.updatedAt=stamp();await this.persist();return this.publicReview(r);
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
    if(path==='review-artifacts')return client.listArtifacts();
    if(path==='review-folder')return client.listArtifactFolder(body?.path);
    if(path==='reviews')return body?client.createReview(body):client.listReviews();
    const review=path.match(/^reviews\/([a-f0-9-]{36})(?:\/(say|end|file))?$/i);
    if(review)return review[2]==='say'?client.sendToReview(review[1],body?.text,'say'):review[2]==='end'?client.sendToReview(review[1],'','end'):review[2]==='file'?client.readArtifactFile(review[1],body?.path):client.getReview(review[1]);
    if(meeting)return meeting[2]==='say'?client.sendToMeeting(meeting[1],body?.text,'say'):meeting[2]==='end'?client.sendToMeeting(meeting[1],'','end'):client.getMeeting(meeting[1]);
    throw Error('지원하지 않는 Cloud 작업입니다.');
  }
};
if(typeof window!=='undefined')window.HappierCloud=browserAPI;
