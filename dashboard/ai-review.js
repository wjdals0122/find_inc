(() => {
  'use strict';
  // AI 품평회 (5F 대강당): setup popup, chat panel and the hall screen.
  // Transcript lines come only from the real Happier/Codex review sessions or from the user.
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const PERSPECTIVES=['전략','고객','콘텐츠','채널 운영','브랜드','성과 분석'];
  const COLORS={'전략':'#649d8a','고객':'#5d8fa8','콘텐츠':'#b49b6c','채널 운영':'#7e9db7','브랜드':'#9a7fa8','성과 분석':'#8a9a5b'};
  const KINDS={brief:'마케팅 브리핑',image:'광고 이미지',video:'광고 영상'};
  const STATES={checking:'발표자 세션 준비 중',presenting:'발표 중',reviewing:'피드백 중',answering:'발표자 답변 중',open:'자유 토론',closing:'정리 중',awaiting_approval:'Happier 승인 대기',completed:'품평회 종료',failed:'오류',disconnected:'연결 끊김',uncertain:'세션 확인 필요',error:'오류',connecting:'연결 확인 중',pairing:'Happier 승인 필요'};
  const FINAL=new Set(['completed','failed']);
  const MIME={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',svg:'image/svg+xml'};
  let dialog,panel,review=null,cast={},state='idle',error='',notice='',pairing=null,models=[],artifacts=null,artifactError='',busy=false,draft='',revision=0,setupSeen=false;
  let form={topic:'',items:new Set(),count:4,presenter:{model:'',effort:''},reviewers:[]};
  let pollTimer,pairTimer,speakTimer=0,queue=[],spoken=new Set(),screenItem=null,screenFiles=[],screenIndex=0,screenMsg='',blobs=new Map(),expanded=false;
  async function owner(){
    if(window.AI_MEETING_PREVIEW_OWNER)return window.AI_MEETING_PREVIEW_OWNER;
    const {getSession}=await import('./auth-session.js');const {auth}=await getSession();
    if(!auth.currentUser)throw Error('로그인 후 다시 시도해주세요.');return auth.currentUser.uid;
  }
  async function api(path,body,timeout=40000){
    if(!window.HappierCloud)throw Error('Happier 연결 모듈을 불러오지 못했습니다. 새로고침해주세요.');
    const id=await owner();let timer;
    try{return await Promise.race([window.HappierCloud.api(id,path,body),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Happier 응답 시간이 초과됐습니다.')),timeout);})]);}
    finally{clearTimeout(timer);}
  }
  const effortsOf=id=>models.find(m=>m.id===id)?.efforts||[];
  const defEffort=id=>models.find(m=>m.id===id)?.defaultEffort||effortsOf(id)[0]||'';
  function fitReviewers(){
    while(form.reviewers.length<form.count){const m=models[0]?.id||'';form.reviewers.push({perspective:PERSPECTIVES[form.reviewers.length%PERSPECTIVES.length],model:m,effort:defEffort(m)});}
    form.reviewers.length=form.count;
    for(const a of [form.presenter,...form.reviewers]){if(!models.some(m=>m.id===a.model))a.model=models[0]?.id||'';if(!effortsOf(a.model).includes(a.effort))a.effort=defEffort(a.model);}
  }
  // ---------- setup popup ----------
  function captureSetup(){
    if(!dialog?.open)return;const q=s=>dialog.querySelector(s);
    form.topic=q('#rv-topic')?.value??form.topic;
    dialog.querySelectorAll('[data-item]').forEach(c=>c.checked?form.items.add(c.dataset.item):form.items.delete(c.dataset.item));
    const p=q('#rv-p-model');if(p){form.presenter.model=p.value;form.presenter.effort=q('#rv-p-effort').value;}
    form.reviewers.forEach((r,i)=>{const pe=q(`#rv-r${i}-persp`);if(pe){r.perspective=pe.value;r.model=q(`#rv-r${i}-model`).value;r.effort=q(`#rv-r${i}-effort`).value;}});
  }
  function allItems(){return artifacts?[...artifacts.briefs,...artifacts.images,...artifacts.videos]:[];}
  function modelSelect(id,val){return `<select id="${id}" ${models.length?'':'disabled'}>${models.map(m=>`<option value="${esc(m.id)}" ${m.id===val?'selected':''}>${esc(m.label)}</option>`).join('')||'<option>연결 후 확인</option>'}</select>`;}
  function effortSelect(id,model,val){return `<select id="${id}" ${effortsOf(model).length?'':'disabled'}>${effortsOf(model).map(e=>`<option ${e===val?'selected':''}>${esc(e)}</option>`).join('')||'<option>—</option>'}</select>`;}
  function group(kind,list){
    return `<fieldset class="rv-group"><legend>${KINDS[kind]} <span>${list?list.length:'—'}</span></legend>${!artifacts?`<p class="rv-muted">${esc(artifactError||'실행 PC에서 산출물을 찾는 중…')}</p>`:list.length?list.map(i=>`<label class="rv-item"><input type="checkbox" data-item="${esc(i.id)}" ${form.items.has(i.id)?'checked':''}><span><strong>${esc(i.label)}</strong><small>${esc(i.files?.join(' · ')||i.path.split('\\').slice(-3).join(' / '))}</small></span></label>`).join(''):'<p class="rv-muted">선택할 산출물이 없습니다.</p>'}</fieldset>`;
  }
  function drawSetup(){
    if(!dialog?.open)return;captureSetup();fitReviewers();
    const active=review&&!FINAL.has(review.state),none=artifacts&&!allItems().length;
    const canStart=!active&&!busy&&form.topic.trim()&&form.items.size&&models.length;
    dialog.innerHTML=`<header class="rv-head"><div><p class="aim-eyebrow">AI REVIEW · 5F 대강당</p><h2 id="rv-setup-title">${active?'진행 중인 품평회가 있습니다':'품평회를 준비할까요?'}</h2></div><button type="button" class="aim-close rv-x" aria-label="품평회 설정 닫기">×</button></header>
      ${active?`<section class="rv-resume"><div><strong>${esc(review.topic)}</strong><small>${esc(STATES[review.state]||review.state)} · ${esc(review.progress||'')}</small></div><button type="button" class="aim-primary rv-resume-btn">이어서 보기 ↗</button><p class="rv-muted">새 품평회는 현재 세션을 종료한 뒤 시작할 수 있습니다.</p></section>`:''}
      <div class="aim-status ${['error','failed'].includes(state)?'error':models.length?'live':'wait'}" role="status"><span class="aim-light" aria-hidden="true"></span><div><strong>${esc(models.length?'Happier 연결됨 · 실행 PC 확인':STATES[state]||'연결 확인 중')}</strong><small>${esc(error||notice||'실행 PC의 Git 저장소와 02-contents 폴더에서 산출물을 찾습니다.')}</small></div></div>
      ${pairing?`<div class="aim-pairing"><p>이 브라우저는 아직 Happier 승인이 필요합니다.</p><a class="aim-pair-link" href="${esc(pairing.url)}" target="_blank" rel="noopener noreferrer">Happier 웹에서 승인 ↗</a></div>`:''}
      ${active?'':`<form class="rv-form">
        <label class="rv-label" for="rv-topic">발표 주제</label><input id="rv-topic" type="text" maxlength="300" placeholder="예: X5 신규 광고 1차 품평" value="${esc(form.topic)}">
        <p class="rv-label">발표할 산출물 <small>Git 저장소의 마케팅 브리핑 · Drive 동기화 02-contents</small></p>
        ${none?'<p class="rv-empty" role="alert">선택할 산출물이 없습니다. 01-strategy/brief/ 또는 02-contents/ad-images · ad-videos에 산출물을 만든 뒤 다시 열어주세요.</p>':''}
        <div class="rv-groups">${group('brief',artifacts?.briefs)}${group('image',artifacts?.images)}${group('video',artifacts?.videos)}</div>
        <div class="rv-agents-head"><p class="rv-label">에이전트 구성</p><label>평가 에이전트 수 <select id="rv-count">${[1,2,3,4,5,6].map(n=>`<option ${n===form.count?'selected':''}>${n}</option>`).join('')}</select></label></div>
        <div class="rv-agents" role="table" aria-label="에이전트별 모델과 Effort">
          <div class="rv-row" role="row"><span class="rv-who" style="--c:#b49b6c">발표자 · 콘텐츠</span>${modelSelect('rv-p-model',form.presenter.model)}${effortSelect('rv-p-effort',form.presenter.model,form.presenter.effort)}</div>
          ${form.reviewers.map((r,i)=>`<div class="rv-row" role="row"><select id="rv-r${i}-persp" aria-label="평가 ${i+1} 관점" style="--c:${COLORS[r.perspective]}">${PERSPECTIVES.map(p=>`<option ${p===r.perspective?'selected':''}>${p}</option>`).join('')}</select>${modelSelect(`rv-r${i}-model`,r.model)}${effortSelect(`rv-r${i}-effort`,r.model,r.effort)}</div>`).join('')}
        </div>
        <div class="rv-submit"><p class="rv-muted">에이전트마다 별도 Codex 세션이 차례로 실행됩니다. 품평 중에는 파일을 수정하지 않습니다.</p><button type="submit" class="aim-primary" ${canStart?'':'disabled'}>${busy?'준비 중…':'품평회 시작 ↗'}</button></div>
      </form>`}`;
    dialog.querySelector('.rv-x').onclick=()=>dialog.close();
    dialog.querySelector('.rv-resume-btn')?.addEventListener('click',()=>{dialog.close();openPanel();window.VirtualOffice?.hall?.focus();stageCast();});
    const f=dialog.querySelector('.rv-form');if(!f)return;
    f.onsubmit=e=>{e.preventDefault();start();};
    f.oninput=e=>{if(e.target.id==='rv-topic'){captureSetup();const b=f.querySelector('[type=submit]');b.disabled=!(form.topic.trim()&&form.items.size&&models.length&&!busy);}};
    f.onchange=e=>{if(e.target.id==='rv-count'){captureSetup();form.count=Number(e.target.value);}drawSetup();};
  }
  async function openSetup(){
    if(document.body.dataset.authState!=='authenticated')return;setupSeen=true;
    if(!dialog){dialog=document.createElement('dialog');dialog.id='rv-setup';dialog.className='rv-setup';dialog.setAttribute('aria-labelledby','rv-setup-title');document.body.append(dialog);dialog.addEventListener('close',captureSetup);}
    if(!dialog.open)dialog.showModal();drawSetup();
    if(review&&!FINAL.has(review.state))return;
    const generation=++revision;error='';notice='';
    try{
      state='connecting';drawSetup();
      const c=await api('connection',undefined,60000);if(generation!==revision)return;
      if(c.needsPairing){pairing=await api('pair/start',{});state='pairing';drawSetup();waitPairing(generation);return;}
      if(!c.ready)throw Error('Happier 기기 연결이 준비되지 않았습니다.');
      models=c.models||[];state='idle';drawSetup();
      artifacts=null;artifactError='';drawSetup();
      artifacts=await api('review-artifacts',undefined,90000);if(generation!==revision)return;drawSetup();
    }catch(e){if(generation===revision){error=e.message;state='error';if(!artifacts)artifactError='산출물 목록을 불러오지 못했습니다.';drawSetup();}}
  }
  function waitPairing(generation){clearTimeout(pairTimer);pairTimer=setTimeout(async()=>{if(generation!==revision)return;try{const r=await api('pair/status');if(generation!==revision)return;if(r.state==='authorized'){pairing=null;openSetup();return;}waitPairing(generation);}catch(e){pairing=null;error=e.message;state='error';drawSetup();}},2500);}
  async function start(){
    captureSetup();if(busy)return;const items=allItems().filter(i=>form.items.has(i.id));
    if(!form.topic.trim()||!items.length){error='발표 주제와 산출물을 선택해주세요.';drawSetup();return;}
    busy=true;error='';drawSetup();const generation=++revision;
    try{
      review=await api('reviews',{requestId:crypto.randomUUID(),topic:form.topic.trim(),items:items.map(i=>({kind:i.kind,label:i.label,path:i.path})),presenter:{...form.presenter},reviewers:form.reviewers.map(r=>({...r}))});
      if(generation!==revision)return;spoken=new Set();queue=[];state=review.state;
      dialog.close();openPanel();stageCast(true);screenItem=review.items[0];screenFiles=[];loadScreen();schedule(2000);
    }catch(e){if(generation===revision){error=e.message;drawSetup();}}
    finally{busy=false;if(dialog?.open)drawSetup();}
  }
  // ---------- staging ----------
  let staged=false,staging=false;
  function stageCast(force){
    const hall=window.VirtualOffice?.hall;if(!hall||!review)return;
    if(staging||(staged&&!force&&hall.active))return;
    // hall.start switches to 5F, which re-fires vo-floor-enter; the guard stops re-staging.
    staging=true;staged=true;try{cast=hall.start(review.reviewers.map(r=>r.perspective));}finally{staging=false;}
    (review.timeline||[]).forEach(u=>spoken.add(u.id));drawPanel();
  }
  function speakerKey(u){return u.speaker==='presenter'?'presenter':u.speaker==='me'?'me':u.speaker==='reviewer'?'r'+u.reviewer:null;}
  function stage(lines){for(const u of lines){if(spoken.has(u.id))continue;spoken.add(u.id);const k=speakerKey(u);if(k)queue.push([k,u.text]);}if(!speakTimer)speakNext();}
  function speakNext(){const n=queue.shift();if(!n){speakTimer=0;return;}window.VirtualOffice?.hall?.say(n[0],n[1]);speakTimer=setTimeout(speakNext,queue.length>6?1400:2800);}
  // ---------- panel ----------
  function label(u){
    if(u.speaker==='me')return ['나 (대표)','#284b42'];if(u.speaker==='system')return ['안내','#8a8f99'];
    if(u.speaker==='presenter')return [`발표자${cast.presenter?' · '+cast.presenter:''}`,'#b49b6c'];
    const p=review?.reviewers[u.reviewer]?.perspective||'평가';return [`${p}${cast['r'+u.reviewer]?' · '+cast['r'+u.reviewer]:''}`,COLORS[p]||'#858da5'];
  }
  function openPanel(){
    if(document.body.dataset.authState!=='authenticated'||!review)return;
    if(!panel){panel=document.createElement('aside');panel.id='rv-panel';panel.className='aim-panel rv-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','rv-title');document.body.append(panel);}
    panel.hidden=false;drawPanel();
  }
  function drawPanel(){
    if(!panel||panel.hidden||!review)return;draft=panel.querySelector('#rv-say')?.value??draft;
    const live=!FINAL.has(review.state),lines=review.timeline||[],cls=['completed'].includes(review.state)?'done':['failed','error','disconnected'].includes(review.state)||error?'error':'live';
    panel.innerHTML=`<header class="aim-head"><div><p class="aim-eyebrow">AI REVIEW · 5F 대강당</p><h2 id="rv-title">${esc(review.topic)}</h2></div><button type="button" class="aim-close rv-close" aria-label="품평회 창 접기">×</button></header>
      <div class="aim-status ${cls}" role="status"><span class="aim-light" aria-hidden="true"></span><div><strong>${esc(STATES[review.state]||review.state)}</strong><small>${esc(error||review.progress||'')}</small></div>${live?'<button type="button" class="aim-refresh rv-refresh" aria-label="품평회 상태 새로고침">↻</button>':''}</div>
      <div class="rv-screens"><span>대강당 화면</span>${review.items.map((it,i)=>`<button type="button" class="rv-chip" data-screen="${i}" aria-pressed="${screenItem?.path===it.path}">${esc(KINDS[it.kind])} · ${esc(it.label.split(' · ').slice(-1)[0])}</button>`).join('')}</div>
      <ul class="aim-people" aria-label="참석 에이전트"><li style="--c:#b49b6c">발표자</li>${review.reviewers.map(r=>`<li style="--c:${COLORS[r.perspective]}">${esc(r.perspective)} <small>${esc(r.model)}·${esc(r.effort)}</small></li>`).join('')}<li style="--c:#284b42">나 (대표)</li></ul>
      <ol class="aim-log" aria-live="polite" aria-label="발표와 피드백">${lines.length?lines.map(u=>{const [n,c]=label(u);return `<li class="aim-line ${u.speaker==='me'?'me':''} ${u.speaker==='system'?'rv-system':''}" style="--c:${c}"><b>${esc(n)}</b><p>${esc(u.text)}</p></li>`;}).join(''):`<li class="aim-empty">${live?'발표자가 산출물을 읽고 발표를 준비하고 있습니다…':'기록된 발언이 없습니다.'}</li>`}</ol>
      ${review.state==='completed'&&review.summary?`<div class="aim-summary"><strong>정리 결과</strong><p>${esc(review.summary)}</p></div>`:''}
      ${live?`<form class="aim-say rv-say"><label class="sr-only" for="rv-say">품평회에 의견 보내기</label><textarea id="rv-say" rows="2" maxlength="2000" placeholder="대표로 의견을 말해보세요" ${review.ended||!review.sessions?.[0]?.sessionId?'disabled':''}>${esc(draft)}</textarea><div class="aim-actions"><button type="button" class="aim-end rv-end" ${review.ended||!review.sessions?.[0]?.sessionId||busy?'disabled':''}>세션 종료</button><button type="submit" class="aim-send" ${review.ended||!review.sessions?.[0]?.sessionId||busy?'disabled':''}>보내기 ↗</button></div></form>`:`<div class="aim-say"><button type="button" class="aim-primary rv-new">새 품평회 준비</button></div>`}
      <footer class="aim-foot"><span>말풍선 = 실제 Codex 발표·피드백</span><span>종료 시 docs/reviews에 정리</span></footer>`;
    panel.querySelector('.rv-close').onclick=()=>{panel.hidden=true;};
    panel.querySelector('.rv-refresh')?.addEventListener('click',()=>poll());
    panel.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>{screenItem=review.items[Number(b.dataset.screen)];screenFiles=[];screenIndex=0;loadScreen();drawPanel();});
    const f=panel.querySelector('.rv-say');if(f){f.onsubmit=e=>{e.preventDefault();send();};f.querySelector('textarea').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}};}
    panel.querySelector('.rv-end')?.addEventListener('click',end);
    panel.querySelector('.rv-new')?.addEventListener('click',()=>{panel.hidden=true;openSetup();});
    const log=panel.querySelector('.aim-log');if(log)log.scrollTop=log.scrollHeight;
  }
  // ---------- hall screen ----------
  function mdHtml(text){
    return String(text).slice(0,14000).split(/\r?\n/).map(l=>{const t=esc(l).replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');
      if(/^#{1,2}\s/.test(l))return `<h3>${t.replace(/^#{1,2}\s/,'')}</h3>`;if(/^#{3,}\s/.test(l))return `<h4>${t.replace(/^#+\s/,'')}</h4>`;
      if(/^\s*\|/.test(l))return /^\s*\|[\s:|-]+\|\s*$/.test(l)?'':`<p class="rv-tr">${t.replace(/^\s*\||\|\s*$/g,'').split('|').map(c=>`<span>${c.trim()}</span>`).join('')}</p>`;
      if(/^\s*[-*]\s/.test(l))return `<p class="rv-li">${t.replace(/^\s*[-*]\s/,'')}</p>`;return t.trim()?`<p>${t}</p>`:'';}).join('');
  }
  function screenNode(){
    const el=document.createElement('div');el.className='rv-screen'+(expanded?' expanded':'');
    const file=screenFiles[screenIndex];
    el.innerHTML=`<div class="rv-screen-bar"><strong>${esc(screenItem?KINDS[screenItem.kind]+' · '+screenItem.label:'')}</strong><span>${screenFiles.length>1?`<button type="button" data-nav="-1" aria-label="이전 파일">‹</button><em>${screenIndex+1}/${screenFiles.length}</em><button type="button" data-nav="1" aria-label="다음 파일">›</button>`:''}<button type="button" data-expand aria-label="${expanded?'화면 작게 보기':'화면 크게 보기'}">${expanded?'↙':'⤢'}</button></span></div><div class="rv-screen-body" tabindex="0"></div>`;
    const body=el.querySelector('.rv-screen-body');
    if(screenMsg||!file)body.innerHTML=`<p class="rv-screen-msg">${esc(screenMsg||'화면에 띄울 파일이 없습니다.')}</p>`;
    else if(file.html!=null)body.innerHTML=`<div class="rv-doc"><p class="rv-file">${esc(file.name)}</p>${file.html}</div>`;
    else if(file.url&&file.type==='image')body.innerHTML=`<img src="${esc(file.url)}" alt="${esc(file.name)}"><p class="rv-file">${esc(file.name)}</p>`;
    else if(file.url&&file.type==='video')body.innerHTML=`<video src="${esc(file.url)}" controls playsinline muted></video><p class="rv-file">${esc(file.name)}</p>`;
    else body.innerHTML=`<p class="rv-screen-msg">${esc(file.error||'불러오는 중…')}</p>`;
    el.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{screenIndex=(screenIndex+Number(b.dataset.nav)+screenFiles.length)%screenFiles.length;showFile();});
    el.querySelector('[data-expand]').onclick=()=>{expanded=!expanded;renderScreen();};
    return el;
  }
  function renderScreen(){window.VirtualOffice?.hall?.screen(screenItem?screenNode():null);}
  async function loadScreen(){
    if(!screenItem||!review){renderScreen();return;}const item=screenItem,generation=revision;screenMsg='산출물 파일을 확인하는 중…';renderScreen();
    try{const r=await api('review-folder',{path:item.path},40000);if(generation!==revision||screenItem!==item)return;
      screenFiles=(r.files||[]).sort((a,b)=>(a.type==='text')-(b.type==='text')||a.name.localeCompare(b.name));if(item.kind==='brief')screenFiles.sort((a,b)=>(b.name.endsWith('brief.md'))-(a.name.endsWith('brief.md')));
      screenMsg=screenFiles.length?'':'선택한 산출물 폴더에 화면에 띄울 파일이 없습니다.';screenIndex=0;showFile();}
    catch(e){if(screenItem===item){screenMsg=e.message;renderScreen();}}
  }
  async function showFile(){
    const file=screenFiles[screenIndex];renderScreen();if(!file||file.url||file.html!=null)return;
    if(file.size>2500000){file.error='파일이 커서(2.5MB 초과) 화면에 표시할 수 없습니다. 발표자는 원본을 직접 확인합니다.';renderScreen();return;}
    try{const cached=blobs.get(file.path);let data=cached;
      if(!data){const r=await api('reviews/'+review.id+'/file',{path:file.path},45000);const bytes=Uint8Array.from(atob(r.content),c=>c.charCodeAt(0));
        data=file.type==='text'?{html:mdHtml(new TextDecoder().decode(bytes))}:{url:URL.createObjectURL(new Blob([bytes],{type:MIME[file.name.split('.').pop().toLowerCase()]||'application/octet-stream'}))};blobs.set(file.path,data);}
      Object.assign(file,data);file.error='';}
    catch(e){file.error=e.message;}
    if(screenFiles[screenIndex]===file)renderScreen();
  }
  // ---------- polling & chat ----------
  async function poll(){
    if(!review)return;const generation=revision;clearTimeout(pollTimer);
    try{const next=await api('reviews/'+review.id,undefined,60000);if(generation!==revision)return;const hadSession=!!review.sessions?.[0]?.sessionId;review=next;error='';
      stage(next.timeline||[]);
      if(!hadSession&&next.sessions?.[0]?.sessionId&&screenItem&&screenFiles.some(f=>!f.url&&f.html==null))showFile();
      if(next.state==='completed'){window.VirtualOffice?.hall?.say('presenter','품평 내용을 docs/에 정리했습니다.');setTimeout(()=>{window.VirtualOffice?.hall?.end();staged=false;},6000);}
      drawPanel();if(dialog?.open)drawSetup();
    }catch(e){if(generation===revision){error=e.message;drawPanel();}}
    if(generation===revision&&review&&!FINAL.has(review.state))schedule(4000);
  }
  function schedule(ms){clearTimeout(pollTimer);pollTimer=setTimeout(()=>{if(document.hidden){schedule(ms);return;}poll();},ms);}
  async function send(){
    draft=panel?.querySelector('#rv-say')?.value??draft;const text=draft.trim();if(!text||!review||busy)return;busy=true;const generation=revision;
    window.VirtualOffice?.hall?.say('me',text);
    try{review=await api('reviews/'+review.id+'/say',{text});if(generation!==revision)return;draft='';error='';(review.timeline||[]).filter(u=>u.speaker==='me'&&u.text===text).forEach(u=>spoken.add(u.id));stage(review.timeline||[]);}
    catch(e){if(generation===revision)error=e.message;}
    finally{if(generation===revision){busy=false;drawPanel();panel?.querySelector('#rv-say')?.focus();schedule(2500);}}
  }
  async function end(){
    if(!review||busy)return;busy=true;const generation=revision;
    try{review=await api('reviews/'+review.id+'/end',{});if(generation!==revision)return;error='';window.VirtualOffice?.hall?.say('me','세션을 종료합니다. 발표와 피드백 정리 부탁해요.');}
    catch(e){if(generation===revision)error=e.message;}
    finally{if(generation===revision){busy=false;drawPanel();schedule(3000);}}
  }
  async function resume(){
    try{const list=await api('reviews',undefined,20000);const active=(list.reviews||[]).find(r=>!FINAL.has(r.state));if(!active)return;
      const generation=revision;const r=await api('reviews/'+active.id,undefined,60000);if(generation!==revision)return;review=r;(r.timeline||[]).forEach(u=>spoken.add(u.id));screenItem=r.items[0];schedule(3000);
    }catch{}
  }
  function onHall(){
    const active=review&&!FINAL.has(review.state);
    if(active){stageCast();if(screenItem&&!screenFiles.length)loadScreen();else renderScreen();if(setupSeen){openPanel();return;}}
    if(!setupSeen)openSetup();
  }
  function reset(){revision++;clearTimeout(pollTimer);clearTimeout(pairTimer);clearTimeout(speakTimer);speakTimer=0;queue=[];spoken=new Set();review=null;cast={};staged=false;pairing=null;models=[];artifacts=null;error='';notice='';busy=false;draft='';setupSeen=false;
    form={topic:'',items:new Set(),count:4,presenter:{model:'',effort:''},reviewers:[]};screenItem=null;screenFiles=[];blobs.forEach(b=>b.url&&URL.revokeObjectURL(b.url));blobs.clear();
    if(panel){panel.hidden=true;panel.innerHTML='';}if(dialog?.open)dialog.close();window.VirtualOffice?.hall?.end();window.VirtualOffice?.hall?.screen(null);}
  window.addEventListener('vo-floor-enter',e=>{if(e.detail?.floor==='hall')onHall();});
  window.addEventListener('vo-hall-open',()=>{if(review&&!FINAL.has(review.state)){stageCast();if(screenItem&&!screenFiles.length)loadScreen();}openSetup();});
  new MutationObserver(()=>{if(document.body.dataset.authState!=='authenticated')reset();else resume();}).observe(document.body,{attributes:true,attributeFilter:['data-auth-state']});
  if(document.body.dataset.authState==='authenticated')resume();
  window.AIReview={openSetup,openPanel,reset,get review(){return review;},get state(){return review?.state||state;}};
})();
