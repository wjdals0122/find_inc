(() => {
  'use strict';
  // AI meeting room: the topic launcher in the header, a chat panel, and Virtual Office staging.
  // Every bubble and transcript line comes from the real Happier/Codex meeting session or from the user.
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const SPEAKERS={lead:{name:'팀장',color:'#858da5'},strategy:{name:'전략팀',color:'#649d8a'},contents:{name:'콘텐츠팀',color:'#b49b6c'},operation:{name:'운영팀',color:'#7e9db7'},me:{name:'나 (대표)',color:'#284b42'}};
  const STATES={idle:'대기',connecting:'연결 확인 중',pairing:'Happier 승인 필요',checking:'연결 확인 중',creating:'회의 세션 생성 중',uncertain:'세션 확인 필요',speaking:'논의 중',listening:'대표 의견 대기',awaiting_approval:'Happier 승인 대기',summarizing:'팀장이 정리 중',completed:'회의 종료',failed:'오류',disconnected:'연결 끊김',error:'오류'};
  const FINAL=new Set(['completed','failed']);
  let panel,meeting=null,state='idle',notice='',error='',pairing=null,models=[],model='',effort='',busy=false,draft='',topicDraft='',revision=0;
  let pollTimer,pairTimer,speakTimer,spoken=new Set(),queue=[];
  const storeKey=owner=>'find-ai-meeting:'+owner;
  const pendingPrefix=uid=>storeKey(uid)+':history:';
  const saving=new Map();
  let historyDialog,historyNotice='',historyVersion=0;
  const historyClient=()=>import('./meeting-history.js');
  async function owner(){
    if(window.AI_MEETING_PREVIEW_OWNER)return window.AI_MEETING_PREVIEW_OWNER;
    const {getSession}=await import('./auth-session.js');const {auth}=await getSession();
    if(!auth.currentUser)throw Error('로그인 후 다시 시도해주세요.');return auth.currentUser.uid;
  }
  async function api(path,body,timeout=30000){
    if(!window.HappierCloud)throw Error('Happier 연결 모듈을 불러오지 못했습니다. 새로고침해주세요.');
    const id=await owner();let timer;
    try{return await Promise.race([window.HappierCloud.api(id,path,body),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Happier 응답 시간이 초과됐습니다.')),timeout);})]);}
    finally{clearTimeout(timer);}
  }
  function remember(id){owner().then(o=>{try{id?sessionStorage.setItem(storeKey(o),id):sessionStorage.removeItem(storeKey(o));}catch{}}).catch(()=>{});}
  function pendingHistory(uid){
    try{
      const prefix=pendingPrefix(uid);
      return Object.keys(localStorage).filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length));
    }catch{return [];}
  }
  function markHistory(uid,id,pending){
    const key=pendingPrefix(uid)+id;
    try{if(pending)localStorage.setItem(key,'1');else localStorage.removeItem(key);}catch{}
  }
  async function saveHistory(completed,uid){
    const key=uid+'_'+completed.id;
    if(saving.has(key))return saving.get(key);
    markHistory(uid,completed.id,true);
    const task=historyClient().then(client=>client.saveMeeting(uid,completed))
      .then(()=>markHistory(uid,completed.id,false))
      .finally(()=>saving.delete(key));
    saving.set(key,task);
    return task;
  }
  async function finishHistory(completed){
    if(window.AI_MEETING_PREVIEW_OWNER){remember(null);return;}
    const generation=revision;
    try{
      const uid=await owner();
      if(generation!==revision)return;
      const task=saveHistory(completed,uid);
      try{
        if(sessionStorage.getItem(storeKey(uid))===completed.id)sessionStorage.removeItem(storeKey(uid));
      }catch{}
      await task;
      if(generation===revision){historyNotice='회의 기록을 저장했습니다.';draw();}
    }catch{
      if(generation===revision){historyNotice='회의 기록을 저장하지 못했습니다. 내 회의 기록에서 다시 시도할 수 있습니다.';draw();}
    }
  }
  function retryHistory(uid,activeId){
    return Promise.allSettled(pendingHistory(uid).filter(id=>id!==activeId).map(async id=>{
      if(saving.has(uid+'_'+id))return saving.get(uid+'_'+id);
      const record=await api('meetings/'+id,undefined,20000);
      if(await owner()!==uid)throw Error('로그인 계정이 바뀌었습니다.');
      if(record.state==='failed'){markHistory(uid,id,false);return;}
      if(record.state==='completed')await saveHistory(record,uid);
    }));
  }
  async function openHistory(){
    if(!historyDialog){
      historyDialog=document.createElement('dialog');
      historyDialog.className='aim-history';
      historyDialog.setAttribute('aria-labelledby','aim-history-title');
      historyDialog.innerHTML='<header class="aim-head"><h2 id="aim-history-title">내 회의 기록</h2><button class="aim-close" type="button" aria-label="회의 기록 닫기">×</button></header><p class="aim-history-status" role="status"></p><ol class="aim-history-list"></ol><footer class="aim-history-actions"><button type="button" class="aim-history-button aim-history-retry" hidden>다시 시도</button><button type="button" class="aim-history-button aim-history-more" hidden>더 보기</button></footer>';
      historyDialog.querySelector('.aim-close').onclick=()=>historyDialog.close();
      historyDialog.addEventListener('close',()=>{historyVersion++;panel?.querySelector('.aim-history-open')?.focus();});
      document.body.append(historyDialog);
    }
    if(!historyDialog.open)historyDialog.showModal();
    const version=++historyVersion;
    const status=historyDialog.querySelector('.aim-history-status');
    const list=historyDialog.querySelector('.aim-history-list');
    const retry=historyDialog.querySelector('.aim-history-retry');
    const more=historyDialog.querySelector('.aim-history-more');
    const current=()=>historyDialog.open&&version===historyVersion;
    list.replaceChildren();retry.hidden=true;more.hidden=true;
    if(window.AI_MEETING_PREVIEW_OWNER){status.textContent='미리보기에서는 회의 기록을 조회할 수 없습니다.';return;}
    status.textContent='회의 기록을 불러오는 중…';
    let cursor=null,uid,client;
    retry.onclick=openHistory;
    async function loadPage(){
      more.disabled=true;
      retry.hidden=true;
      try{
        const page=await client.listMeetings(uid,cursor);
        if(!current())return;
        list.insertAdjacentHTML('beforeend',page.entries.map(record=>{
          const date=record.endedAt.toDate().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
          return `<li><details><summary>${esc(record.topic)}<small>${esc(date)} · ${esc(record.departments.join(' · '))}</small></summary><p>${esc(record.summary)}</p></details></li>`;
        }).join(''));
        cursor=page.next;more.hidden=!cursor;
        if(!pendingHistory(uid).length)status.textContent=list.childElementCount?'':'저장된 회의가 없습니다.';
      }catch{
        if(current()){status.textContent='회의 기록을 불러오지 못했습니다.';retry.hidden=false;}
      }finally{if(current())more.disabled=false;}
    }
    more.onclick=loadPage;
    try{
      uid=await owner();client=await historyClient();
      const saves=await retryHistory(uid,meeting&&!FINAL.has(meeting.state)?meeting.id:null);
      if(!current())return;
      if(saves.some(result=>result.status==='rejected'))status.textContent='저장하지 못한 회의가 있습니다.';
      else if(pendingHistory(uid).length)status.textContent='저장을 기다리는 회의가 있습니다.';
      await loadPage();
      if(current()&&pendingHistory(uid).length)retry.hidden=false;
    }catch{
      if(current()){status.textContent='회의 기록을 불러오지 못했습니다.';retry.hidden=false;}
    }
  }
  function mountLauncher(){
    const actions=document.querySelector('.hero-actions');if(!actions||document.getElementById('aim-launch'))return;
    const form=document.createElement('form');form.id='aim-launch';form.className='aim-launch';form.setAttribute('aria-label','AI 회의 시작');
    form.innerHTML='<label class="sr-only" for="aim-topic">AI 회의 주제</label><input id="aim-topic" type="text" maxlength="300" placeholder="회의 주제" autocomplete="off"><button id="aim-open" type="submit">AI 회의 열기</button>';
    form.onsubmit=e=>{e.preventDefault();const topic=form.querySelector('#aim-topic').value.trim();openPanel();if(topic&&(!meeting||FINAL.has(meeting.state))){topicDraft=topic;start(topic);}else{draw();panel.querySelector('#aim-new-topic')?.focus();}};
    const toggle=document.getElementById('virtual-office-toggle');toggle?toggle.before(form):actions.prepend(form);
  }
  function openPanel(){
    if(document.body.dataset.authState!=='authenticated')return;
    if(!panel){panel=document.createElement('aside');panel.id='aim-panel';panel.className='aim-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','aim-title');document.body.append(panel);}
    panel.hidden=false;document.body.classList.add('aim-open');draw();
  }
  function closePanel(){if(panel){capture();panel.hidden=true;}document.body.classList.remove('aim-open');document.getElementById('aim-open')?.focus();}
  function capture(){if(!panel)return;draft=panel.querySelector('#aim-say')?.value??draft;topicDraft=panel.querySelector('#aim-new-topic')?.value??topicDraft;model=panel.querySelector('#aim-model')?.value||model;}
  function lightClass(){return ['speaking','listening','summarizing'].includes(state)?'live':state==='completed'?'done':['failed','error','disconnected'].includes(state)?'error':'wait';}
  function draw(){
    if(!panel||panel.hidden)return;capture();
    const live=meeting&&!FINAL.has(meeting.state),lines=meeting?.utterances||[];
    const chosen=models.find(m=>m.id===model);
    panel.innerHTML=`<header class="aim-head"><div><p class="aim-eyebrow">AI MEETING ROOM · HAPPIER × CODEX</p><h2 id="aim-title">${esc(meeting?.topic||'무엇을 논의할까요?')}</h2></div><button type="button" class="aim-close" aria-label="회의 창 접기">×</button></header>
      <div class="aim-status ${lightClass()}" role="status"><span class="aim-light" aria-hidden="true"></span><div><strong>${esc(STATES[state]||state)}</strong><small>${esc(error||notice||meeting?.progress||'전략·콘텐츠·운영팀 에이전트가 4F 회의실에 모입니다.')}</small></div>${meeting&&!FINAL.has(meeting.state)?'<button type="button" class="aim-refresh" aria-label="회의 상태 새로고침">↻</button>':''}</div>
      ${pairing?`<div class="aim-pairing"><p>이 브라우저는 아직 Happier 승인이 필요합니다. 승인되면 회의를 바로 시작합니다.</p><a class="aim-pair-link" href="${esc(pairing.url)}" target="_blank" rel="noopener noreferrer">Happier 웹에서 승인 ↗</a></div>`:''}
      <ul class="aim-people" aria-label="참석자">${Object.entries(SPEAKERS).map(([k,v])=>`<li style="--c:${v.color}">${esc(v.name)}</li>`).join('')}</ul>
      ${meeting?`<ol class="aim-log" aria-live="polite" aria-label="회의 대화">${lines.length?lines.map(u=>`<li class="aim-line ${u.speaker==='me'?'me':''} ${u.pending?'pending':''}" style="--c:${(SPEAKERS[u.speaker]||SPEAKERS.lead).color}"><b>${esc((SPEAKERS[u.speaker]||SPEAKERS.lead).name)}</b><p>${esc(u.text)}</p>${u.pending?'<small>전달 중</small>':''}</li>`).join(''):`<li class="aim-empty">${live?'에이전트들이 회의실에 모이고 있습니다. 첫 발언을 기다리는 중…':'기록된 발언이 없습니다.'}</li>`}</ol>`:''}
      ${meeting?.state==='completed'&&meeting.summary?`<div class="aim-summary"><strong>팀장 정리 · 저장 결과</strong><p>${esc(meeting.summary)}</p></div>`:''}
      ${live?`<form class="aim-say"><label class="sr-only" for="aim-say">회의에 발언하기</label><textarea id="aim-say" rows="2" maxlength="2000" placeholder="대표로 의견을 말해보세요" ${meeting.ended||!meeting.sessionId?'disabled':''}>${esc(draft)}</textarea><div class="aim-actions"><button type="button" class="aim-end" ${meeting.ended||!meeting.sessionId||busy?'disabled':''}>회의 마치기</button><button type="submit" class="aim-send" ${meeting.ended||!meeting.sessionId||busy?'disabled':''}>보내기 ↗</button></div></form>`:
      `<form class="aim-start"><label for="aim-new-topic">회의 주제</label><input id="aim-new-topic" type="text" maxlength="300" required placeholder="예: 다음 달 신제품 런칭 채널 전략" value="${esc(topicDraft)}"><label for="aim-model">모델 <select id="aim-model" ${models.length?'':'disabled'}>${models.map(m=>`<option value="${esc(m.id)}" ${m.id===model?'selected':''}>${esc(m.label)}</option>`).join('')||'<option>연결 후 확인</option>'}</select></label><button type="submit" class="aim-primary" ${busy?'disabled':''}>${meeting?'새 회의 열기':'AI 회의 열기'} ↗</button></form>`}
      ${historyNotice?`<p class="aim-history-notice" role="status">${esc(historyNotice)}</p>`:''}
      <footer class="aim-foot"><button type="button" class="aim-history-button aim-history-open">내 회의 기록</button><span>정리본은 docs/meetings → main</span></footer>`;
    panel.querySelector('.aim-close').onclick=closePanel;
    panel.querySelector('.aim-refresh')?.addEventListener('click',()=>poll(true));
    panel.querySelector('.aim-start')?.addEventListener('submit',e=>{e.preventDefault();capture();if(topicDraft.trim())start(topicDraft.trim());});
    const say=panel.querySelector('.aim-say');if(say){say.onsubmit=e=>{e.preventDefault();send();};const ta=say.querySelector('textarea');ta.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}};}
    panel.querySelector('.aim-end')?.addEventListener('click',end);
    panel.querySelector('.aim-history-open').onclick=openHistory;
    const log=panel.querySelector('.aim-log');if(log)log.scrollTop=log.scrollHeight;
  }
  function setState(next,message=''){state=next;notice=message;draw();}
  async function ensureConnection(generation){
    setState('connecting','Happier Cloud 기기와 Codex 로그인을 확인합니다.');
    const result=await api('connection',undefined,60000);if(generation!==revision)return null;
    if(result.needsPairing){pairing=await api('pair/start',{});if(generation!==revision)return null;setState('pairing','Happier 웹에서 승인하면 회의를 시작합니다.');return 'pairing';}
    if(!result.ready)throw Error('Happier 기기 연결이 준비되지 않았습니다.');
    models=result.models||[];if(!models.some(m=>m.id===model))model=models[0]?.id||'';const m=models.find(x=>x.id===model);effort=m?.defaultEffort||'';
    if(!model)throw Error('사용할 Codex 모델을 확인하지 못했습니다.');return 'ready';
  }
  function waitPairing(topic,generation){clearTimeout(pairTimer);pairTimer=setTimeout(async()=>{if(generation!==revision)return;try{const r=await api('pair/status');if(generation!==revision)return;if(r.state==='authorized'){pairing=null;start(topic);return;}waitPairing(topic,generation);}catch(e){pairing=null;fail(e);}},2500);}
  function fail(e){error=e?.message||String(e);state='error';draw();}
  async function start(topic){
    if(busy)return;busy=true;error='';const generation=++revision;clearTimeout(pollTimer);
    try{
      const ready=await ensureConnection(generation);if(ready==='pairing'){waitPairing(topic,generation);return;}if(!ready)return;
      setState('creating','암호화된 Happier 연결로 Codex 회의 세션을 만들고 있습니다.');
      spoken=new Set();queue=[];clearTimeout(speakTimer);
      meeting=await api('meetings',{requestId:crypto.randomUUID(),topic,model,effort});if(generation!==revision)return;
      remember(meeting.id);draft='';const input=document.getElementById('aim-topic');if(input)input.value='';
      window.VirtualOffice?.aiMeeting?.start(topic);
      state=meeting.state;notice='';draw();schedule(1500);
    }catch(e){if(generation===revision)fail(e);}
    finally{if(generation===revision){busy=false;draw();}}
  }
  function stage(lines){
    for(const u of lines){if(u.pending||spoken.has(u.id))continue;spoken.add(u.id);if(u.speaker==='result')continue;queue.push(u);}
    if(!speakTimer)speakNext();
  }
  function speakNext(){const u=queue.shift();if(!u){speakTimer=0;return;}window.VirtualOffice?.aiMeeting?.say(u.speaker,u.text);speakTimer=setTimeout(speakNext,queue.length>6?1400:2800);}
  async function poll(manual){
    if(!meeting)return;const generation=revision;clearTimeout(pollTimer);
    try{const next=await api('meetings/'+meeting.id,undefined,20000);if(generation!==revision)return;meeting=next;state=next.state;error='';notice='';
      stage(next.utterances||[]);
      if(next.state==='failed'){
        remember(null);
        owner().then(uid=>{if(generation===revision)markHistory(uid,next.id,false);}).catch(()=>{});
      }
      if(next.state==='completed'){void finishHistory(next);window.VirtualOffice?.aiMeeting?.say('lead','회의 정리를 마치고 docs/에 저장했습니다.');setTimeout(()=>window.VirtualOffice?.aiMeeting?.end(),6000);}
      draw();
    }catch(e){if(generation===revision){error=e.message;state='disconnected';draw();}}
    if(generation===revision&&meeting&&!FINAL.has(meeting.state))schedule(manual?3000:3500);
  }
  function schedule(ms){clearTimeout(pollTimer);pollTimer=setTimeout(()=>{if(document.hidden){schedule(ms);return;}poll();},ms);}
  async function send(){
    capture();const text=draft.trim();if(!text||!meeting||busy)return;busy=true;const generation=revision;
    window.VirtualOffice?.aiMeeting?.say('me',text);
    try{meeting=await api('meetings/'+meeting.id+'/say',{text});if(generation!==revision)return;draft='';state=meeting.state;error='';
      (meeting.utterances||[]).filter(u=>u.pending).forEach(u=>spoken.add(u.id));
    }catch(e){if(generation===revision){error=e.message;draw();}}
    finally{if(generation===revision){busy=false;draw();panel?.querySelector('#aim-say')?.focus();schedule(2500);}}
  }
  async function end(){
    if(!meeting||busy)return;busy=true;const generation=revision;
    try{
      const uid=await owner();
      if(generation!==revision)return;
      const finished=await api('meetings/'+meeting.id+'/end',{});
      if(!window.AI_MEETING_PREVIEW_OWNER)markHistory(uid,finished.id,true);
      if(generation!==revision)return;
      meeting=finished;state=meeting.state;error='';window.VirtualOffice?.aiMeeting?.say('me','회의를 마치겠습니다. 팀장님 정리 부탁해요.');
    }
    catch(e){if(generation===revision)error=e.message;}
    finally{if(generation===revision){busy=false;draw();schedule(3000);}}
  }
  async function resume(){
    try{const generation=revision;const o=await owner();if(generation!==revision)return;
      let id=null;try{id=sessionStorage.getItem(storeKey(o));}catch{}
      if(!window.AI_MEETING_PREVIEW_OWNER)void retryHistory(o,id);
      if(!id)return;
      const m=await api('meetings/'+id,undefined,20000);if(generation!==revision)return;
      if(m.state==='completed'){void finishHistory(m);return;}
      if(m.state==='failed'){remember(null);markHistory(o,m.id,false);return;}
      meeting=m;state=m.state;(m.utterances||[]).forEach(u=>spoken.add(u.id));schedule(3000);
    }catch{}
  }
  function reset(){revision++;historyVersion++;historyDialog?.close();historyNotice='';clearTimeout(pollTimer);clearTimeout(pairTimer);clearTimeout(speakTimer);speakTimer=0;queue=[];spoken=new Set();meeting=null;pairing=null;state='idle';notice='';error='';busy=false;draft='';topicDraft='';models=[];model='';if(panel){panel.hidden=true;panel.innerHTML='';}document.body.classList.remove('aim-open');window.VirtualOffice?.aiMeeting?.end();}
  new MutationObserver(()=>{if(document.body.dataset.authState!=='authenticated')reset();else resume();}).observe(document.body,{attributes:true,attributeFilter:['data-auth-state']});
  mountLauncher();if(document.body.dataset.authState==='authenticated')resume();
  window.AIMeeting={open:openPanel,start,reset,get state(){return state;},get meeting(){return meeting;}};
})();
