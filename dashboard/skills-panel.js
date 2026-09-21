(() => {
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={checking:'연결 확인 중',creating:'세션 생성 중',uncertain:'생성 결과 확인 필요',running:'실행 중',awaiting_approval:'승인 대기',completed:'완료',failed:'오류',disconnected:'추적 연결 끊김'};
  const errors={owner_required:'이 로컬 연결은 다른 대시보드 계정에 연결돼 있습니다.',authentication_required:'로그인 후 다시 시도해주세요.',invalid_selection:'모델과 Effort 선택을 다시 확인해주세요.',connection_not_ready:'기기 연결을 확인한 후 실행해주세요.',request_id_conflict:'동일 실행 요청의 내용이 달라졌습니다. 히스토리에서 확인해주세요.'};
  let dialog,bootstrap,connection,run,view='new',history=[],selected='',busy=false,notice='',pollTimer,revision=0;
  let instruction='',model='',effort='',apply=true;
  let island,preview,previewLoading=false,previewError='',catalogPromise,leaveTimer,hoverDismissed=false;
  let pairing=null,pairTimer,pendingRun=false;
  const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
  const stamp=x=>x?new Date(x).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
  async function api(path,body,timeout=25000) {
    const {getSession}=await import('./auth-session.js');const {auth}=await getSession();
    if(!auth.currentUser)throw Error('로그인 후 다시 시도해주세요.');
    if(!window.HappierCloud)throw Error('Cloud 연결 모듈을 불러오지 못했습니다. 새로고침해주세요.');
    let timer;
    const generation=revision;
    try{const result=await Promise.race([window.HappierCloud.api(auth.currentUser.uid,path,body),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('응답 시간이 초과됐습니다. 히스토리에서 기존 실행을 확인해주세요.')),timeout);})]);
      if(generation===revision){const runs=Array.isArray(result?.runs)?result.runs:result?.id&&result?.state?[result]:null;if(runs)window.dispatchEvent(new CustomEvent('studio-skill-runs',{detail:{runs}}));if(path==='disconnect')window.VirtualOffice?.clear();}return result;}
    finally{clearTimeout(timer);}
  }
  function catalog() {
    if(bootstrap&&!bootstrap.offline)return Promise.resolve(bootstrap);
    const generation=revision;
    return catalogPromise ||= api('bootstrap').catch(async()=>{
      const response=await fetch(new URL('skills-catalog.json',location.href),{cache:'no-store'});
      if(!response.ok)throw Error('프로젝트 스킬 목록을 불러오지 못했습니다.');
      const data=await response.json();
      if(!Array.isArray(data.skills))throw Error('프로젝트 스킬 목록을 확인할 수 없습니다.');
      return {skills:data.skills,models:[],defaults:{},offline:true};
    }).then(result=>{if(generation===revision)bootstrap=result;return result;}).finally(()=>{if(generation===revision)catalogPromise=null;});
  }
  function islandList() {
    if(!preview)return;
    const list=preview.querySelector('.sk-island-list');
    list.innerHTML=bootstrap?.skills.length?bootstrap.skills.map((skill,i)=>`<button type="button" class="sk-island-skill" data-island-skill="${esc(skill.id)}" style="--entry:${Math.min(i,10)}"><span class="sk-island-symbol" aria-hidden="true">${i%3===0?'✳':i%3===1?'↗':'⌘'}</span><span><strong>${esc(skill.label)}</strong><small>/${esc(skill.id)}</small></span><span class="sk-island-arrow" aria-hidden="true">↗</span></button>`).join(''):`<p class="sk-island-empty" role="status">${esc(previewLoading?'스킬 목록을 불러오고 있습니다…':previewError||'실행 창에서 프로젝트 스킬을 확인하세요.')}</p>`;
    preview.querySelector('.sk-island-count').textContent=bootstrap?.skills.length?String(bootstrap.skills.length).padStart(2,'0'):'';
    preview.querySelectorAll('[data-island-skill]').forEach(button=>button.onclick=()=>open(button.dataset.islandSkill));
  }
  async function expandIsland() {
    if(document.body.dataset.authState!=='authenticated'||dialog?.open)return;
    if(island.classList.contains('is-expanded')){clearTimeout(leaveTimer);return;}
    clearTimeout(leaveTimer);hoverDismissed=false;
    island.classList.add('is-expanded');preview.inert=false;preview.setAttribute('aria-hidden','false');
    island.querySelector('#skills-open').setAttribute('aria-expanded','true');
    if(bootstrap){islandList();return;}
    const generation=revision;previewLoading=true;previewError='';islandList();
    try{await catalog();}catch{if(generation===revision)previewError='목록을 불러오지 못했습니다. 실행 창에서 다시 연결해주세요.';}
    finally{if(generation===revision){previewLoading=false;islandList();}}
  }
  function collapseIsland() {
    clearTimeout(leaveTimer);island?.classList.remove('is-expanded');
    if(preview){preview.inert=true;preview.setAttribute('aria-hidden','true');}
    island?.querySelector('#skills-open').setAttribute('aria-expanded','false');
  }
  function mountIsland() {
    const launcher=document.getElementById('skills-open');if(!launcher)return;
    island=document.createElement('aside');island.id='skills-island';island.className='skills-island';island.setAttribute('aria-label','프로젝트 스킬 아일랜드');
    island.innerHTML=`<section id="skills-island-preview" class="sk-island-preview" aria-label="스킬 바로가기" aria-hidden="true" inert><div class="sk-island-head"><div><p>YOUR NEXT MOVE</p><h2>무엇을 만들까요?</h2></div><button class="sk-island-dismiss" type="button" aria-label="스킬 목록 접기">×</button></div><div class="sk-island-subtitle"><span>프로젝트 스킬</span><span class="sk-island-count"></span></div><nav class="sk-island-list" aria-label="스킬 선택"></nav><button type="button" class="sk-island-all">스킬 스튜디오 열기 <span aria-hidden="true">↗</span></button><div class="sk-island-foot"><span class="sk-island-dot" aria-hidden="true"></span>Happier Cloud · 로컬 Codex</div></section><span class="sk-island-caption" aria-hidden="true">스킬 스튜디오</span>`;
    preview=island.querySelector('#skills-island-preview');
    launcher.setAttribute('aria-label','스킬 스튜디오 열기');launcher.setAttribute('aria-expanded','false');launcher.setAttribute('aria-controls','skills-island-preview skills-dialog');
    launcher.innerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4c0 7-5 12-12 12 7 0 12 5 12 12 0-7 5-12 12-12-7 0-12-5-12-12Z"/><path d="M25 3v6M22 6h6"/></svg><span class="sr-only">스킬</span>';
    island.prepend(launcher);document.body.append(island);
    island.addEventListener('pointerenter',()=>{if(finePointer.matches&&!hoverDismissed)expandIsland();});
    island.addEventListener('pointerleave',()=>{hoverDismissed=false;leaveTimer=setTimeout(()=>{if(!island.contains(document.activeElement))collapseIsland();},220);});
    island.addEventListener('focusin',()=>{if(!hoverDismissed)expandIsland();});
    island.addEventListener('focusout',()=>{leaveTimer=setTimeout(()=>{if(!island.contains(document.activeElement)&&!island.matches(':hover'))collapseIsland();},100);});
    island.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();hoverDismissed=true;collapseIsland();launcher.focus();}});
    preview.querySelector('.sk-island-dismiss').onclick=()=>{hoverDismissed=true;collapseIsland();launcher.focus();};
    preview.querySelector('.sk-island-all').onclick=()=>open();
    launcher.onclick=()=>open();
  }
  function draw() {
    if(!dialog?.open)return;
    const skill=bootstrap?.skills.find(s=>s.id===selected),currentModel=bootstrap?.models.find(m=>m.id===model);
    dialog.innerHTML=`<header class="sk-head"><div><p class="sk-eyebrow">HAPPIER CLOUD × CODEX</p><h2 id="skills-title">아이디어에서, 산출물까지.</h2></div><button type="button" class="sk-close" aria-label="스킬 창 닫기">×</button></header>
      <div class="sk-connection"><span class="sk-light ${connection?.ready?'ready':''}"></span><div><strong>${connection?.ready?'로컬 Codex 연결됨':connection?'연결 확인 필요':'Happier 연결 확인 중'}</strong><small>${connection?.ready?esc(connection.machine)+' · 종단간 암호화 · 공용 Cloud':'기기 등록과 암호화된 daemon RPC를 확인합니다.'}</small></div>${connection&&!connection.ready&&!connection.needsPairing?'<button class="sk-cloud-connect" type="button">Cloud 연결</button>':''}<button class="sk-check" type="button" ${busy?'disabled':''}>연결 확인 ↻</button>${connection?.ready?'<button class="sk-disconnect" type="button">연결 해제</button>':''}</div>
      ${pairing?`<div class="sk-pairing"><strong>이 브라우저의 Happier 연결을 승인해주세요.</strong><p>기존 Happier 계정으로 로그인한 뒤 승인하세요. 승인되면 ${pendingRun?'요청한 스킬을 바로 실행합니다':'자동으로 연결을 확인합니다'}. 연결 키는 이 브라우저의 보안 저장소에 암호화해 보관하며, 다음부터는 이 단계를 건너뜁니다.</p><a class="sk-pair-link" href="${esc(pairing.url)}" target="_blank" rel="noopener noreferrer">Happier 웹에서 승인 ↗</a><small>승인 대기 · ${stamp(pairing.expiresAt)}까지</small></div>`:''}
      <nav class="sk-view-tabs" aria-label="스킬 실행 메뉴"><button type="button" data-view="new" class="${view==='new'?'active':''}">스킬 실행</button><button type="button" data-view="history" class="${view==='history'?'active':''}">히스토리 <span>${history.length||''}</span></button></nav>
      <p class="sk-notice" role="status">${esc(notice)}</p>
      ${view==='new'?`<div class="sk-layout"><aside class="sk-catalog" aria-label="산출물 생성 스킬"><p>PROJECT SKILLS <span>${bootstrap?.skills.length||'—'}</span></p><input class="sk-search" type="search" aria-label="스킬 검색" placeholder="스킬 검색"> <div class="sk-skill-list">${bootstrap?.skills.map(s=>`<button type="button" data-skill="${esc(s.id)}" class="${selected===s.id?'selected':''}" aria-pressed="${selected===s.id}"><span>${esc(s.label)}</span><small>/${esc(s.id)}</small></button>`).join('')||'<p class="sk-empty">목록을 불러오고 있습니다.</p>'}</div></aside>
      <section class="sk-compose"><div class="sk-selected-head"><span class="sk-skill-mark" aria-hidden="true">✳</span><div><h3>${esc(skill?.label||'스킬을 선택하세요')}</h3><p>/${esc(skill?.id||'project-skill')}</p></div></div><p class="sk-description">${esc(skill?.description||'프로젝트에 설치된 스킬로 문서, 이미지와 운영 자료를 만듭니다.')}</p>
      <form id="skill-run-form"><div class="sk-config"><label>모델<select id="skill-model" required ${!bootstrap?.models.length?'disabled':''}>${bootstrap?.models.map(m=>`<option value="${esc(m.id)}" ${model===m.id?'selected':''}>${esc(m.label)}</option>`).join('')||`<option>${bootstrap?.offline?'실행 서버 연결 필요':'목록 확인 중'}</option>`}</select></label><label>Effort<select id="skill-effort" required ${!currentModel?'disabled':''}>${(currentModel?.efforts||[]).map(e=>`<option ${effort===e?'selected':''} value="${esc(e)}">${esc(e)}</option>`).join('')}</select></label></div>
      <label class="sk-request-label" for="skill-instruction">어떤 산출물이 필요한가요?</label><textarea id="skill-instruction" required maxlength="8000" placeholder="브랜드·상품·대상 기간·참고 자료와 원하는 결과를 적어주세요.">${esc(instruction)}</textarea>
      <label class="sk-apply"><input id="skill-apply" type="checkbox" ${apply?'checked':''}><span>필요하면 대시보드 자료에 반영하고 배포<small>기존 디자인과 로그인을 유지합니다. 반영된 화면은 새로고침합니다.</small></span></label>
      <div class="sk-run-footer"><p>${connection?.ready?esc(connection.machine)+'의 대시보드 프로젝트 폴더에서 실행됩니다.':'Codex 실행 PC의 대시보드 프로젝트 폴더에서 실행됩니다.'}<br>사용자 승인이 필요한 작업은 Happier에서 확인하세요.</p><button type="submit" class="sk-primary" ${!(connection?.ready||connection?.needsPairing)||busy||pendingRun||!skill||(connection?.ready&&!currentModel)?'disabled':''}>${busy?'요청 확인 중…':pendingRun?'승인 대기 중…':'스킬 실행'} <span aria-hidden="true">↗</span></button></div></form></section></div>`:''}
      ${view==='history'?`<section class="sk-history"><div class="sk-history-head"><h3>실행 내역</h3><button type="button" class="sk-history-refresh">새로고침 ↻</button></div>${history.length?history.map(r=>`<button type="button" data-run="${esc(r.id)}" class="sk-history-row"><div><strong>${esc(r.label)}</strong><small>${esc(r.model)} · ${esc(r.effort)} · ${stamp(r.createdAt)}</small></div><span class="sk-state ${r.state}">${labels[r.state]||'확인 필요'}</span></button>`).join(''):'<div class="sk-empty">아직 실행 내역이 없습니다.</div>'}</section>`:''}
      ${view==='run'&&run?`<section class="sk-run-detail"><button type="button" class="sk-back">← 히스토리</button><div class="sk-run-heading"><div><p class="sk-eyebrow">${esc(run.model)} / ${esc(run.effort)}</p><h3>${esc(run.label)}</h3></div><span class="sk-state ${run.state}">${labels[run.state]||'확인 필요'}</span></div><div class="sk-progress-track">${['요청 접수','기기 확인','세션 생성','실행·결과'].map((text,i)=>`<span class="${i===0||i===1&&run.state!=='checking'||i===2&&run.sessionId||i===3&&run.state==='completed'?'done':''}"><b>${i+1}</b>${text}</span>`).join('')}</div><p class="sk-progress-text" role="status">${esc(run.progress)}</p><dl class="sk-run-meta"><div><dt>시작</dt><dd>${stamp(run.createdAt)}</dd></div><div><dt>세션 ID</dt><dd>${esc(run.sessionId||'발급 대기')}</dd></div></dl><div class="sk-result"><h4>${run.state==='completed'?'결과':'진행 응답'}</h4><pre>${esc(run.result||'세션이 준비되면 응답이 여기에 표시됩니다.')}</pre></div><div class="sk-result-actions"><a href="https://cloud.happier.dev" target="_blank" rel="noopener noreferrer">Happier에서 보기 ↗</a>${!['completed','failed'].includes(run.state)?'<button type="button" class="sk-retry">기존 세션 확인·재연결</button>':''}${run.state==='completed'&&run.dashboardChanged?'<button type="button" class="sk-reload">반영된 대시보드 열기 ↻</button>':''}</div></section>`:''}
      <footer class="sk-footer"><span>FIND.INC / REMOTE SKILL STUDIO</span><span>네이티브 인증 · 기본 권한 정책</span></footer>`;
    dialog.querySelector('.sk-close').onclick=()=>dialog.close();
    dialog.querySelector('.sk-check').onclick=check;
    dialog.querySelector('.sk-cloud-connect')?.addEventListener('click',beginPairing);
    dialog.querySelector('.sk-disconnect')?.addEventListener('click',async()=>{await api('disconnect',{});connection=null;bootstrap=null;model='';effort='';await catalog();await check();});
    dialog.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{capture();view=b.dataset.view;if(view==='history')loadHistory();else draw();});
    dialog.querySelectorAll('[data-skill]').forEach(b=>b.onclick=()=>{capture();selected=b.dataset.skill;draw();});
    const search=dialog.querySelector('.sk-search');if(search)search.oninput=()=>dialog.querySelectorAll('[data-skill]').forEach(b=>{b.hidden=!b.textContent.toLowerCase().includes(search.value.toLowerCase());});
    const modelSelect=dialog.querySelector('#skill-model');if(modelSelect)modelSelect.onchange=()=>{capture();model=modelSelect.value;const m=bootstrap.models.find(x=>x.id===model);effort=m.defaultEffort;draw();};
    const form=dialog.querySelector('#skill-run-form');if(form)form.onsubmit=submit;
    dialog.querySelector('.sk-history-refresh')?.addEventListener('click',loadHistory);
    dialog.querySelectorAll('[data-run]').forEach(b=>b.onclick=()=>showRun(b.dataset.run));
    dialog.querySelector('.sk-back')?.addEventListener('click',()=>{view='history';loadHistory();});
    dialog.querySelector('.sk-retry')?.addEventListener('click',async()=>{try{run=await api('retry/'+run.id,{});notice='같은 요청 ID로 기존 세션부터 확인합니다.';draw();schedule();}catch(e){notice=e.message;draw();}});
    dialog.querySelector('.sk-reload')?.addEventListener('click',()=>location.reload());
  }
  function capture() {if(!dialog)return;instruction=dialog.querySelector('#skill-instruction')?.value??instruction;model=dialog.querySelector('#skill-model')?.value||model;effort=dialog.querySelector('#skill-effort')?.value||effort;apply=dialog.querySelector('#skill-apply')?.checked??apply;}
  async function check() {capture();const generation=revision;connection=null;busy=true;notice='Cloud 기기 등록·암호화 RPC·Codex 인증을 확인합니다.';draw();try{const result=await api('connection',undefined,60000);if(generation!==revision)return;connection=result;if(result.models&&bootstrap){bootstrap.models=result.models;bootstrap.offline=false;model=result.models.some(m=>m.id===model)?model:result.models[0]?.id;const chosen=result.models.find(m=>m.id===model);effort=chosen?.efforts.includes(effort)?effort:chosen?.defaultEffort;}notice=result.ready?'Cloud 기기 등록과 암호화 RPC, 기존 Codex 인증을 확인했습니다.':result.needsPairing?'이 브라우저는 아직 Happier 승인이 필요합니다. 스킬 실행을 누르면 승인 버튼이 나타납니다.':'연결 확인이 완료되지 않았습니다. Happier의 기기 및 로그인 상태를 확인해주세요.';}catch(e){if(generation!==revision)return;connection={ready:false,checks:{}};notice=e.message;}finally{if(generation===revision){busy=false;draw();}}}
  async function beginPairing(){const generation=revision;try{notice='브라우저 연결 요청을 만들고 있습니다.';draw();pairing=await api('pair/start',{});if(generation!==revision)return;notice='승인 링크를 열어 기존 Happier 계정에서 승인해주세요.';draw();waitPairing(generation);}catch(e){notice=e.message;draw();}}
  function waitPairing(generation){clearTimeout(pairTimer);pairTimer=setTimeout(async()=>{if(generation!==revision)return;try{const result=await api('pair/status');if(generation!==revision)return;if(result.state==='authorized'){pairing=null;bootstrap=null;model='';effort='';await catalog();await check();if(generation!==revision)return;if(pendingRun){pendingRun=false;if(connection?.ready)await submit();else{notice='승인됐지만 기기 연결이 준비되지 않았습니다. 연결 확인 후 다시 실행해주세요.';draw();}}return;}waitPairing(generation);}catch(e){pairing=null;pendingRun=false;notice=e.message;draw();}},2500);}
  async function open(skillId) {
    if(document.body.dataset.authState!=='authenticated')return;
    collapseIsland();
    if(typeof skillId==='string'){capture();selected=skillId;view='new';}
    if(!dialog){dialog=document.createElement('dialog');dialog.id='skills-dialog';dialog.className='skills-dialog';dialog.setAttribute('aria-labelledby','skills-title');document.body.append(dialog);dialog.addEventListener('close',()=>{capture();clearTimeout(pollTimer);});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});}
    if(dialog.open){draw();return;}dialog.showModal();draw();
    const generation=revision;
    try {await catalog();if(generation!==revision)return;selected=selected||bootstrap.skills[0]?.id;model=model||(bootstrap.models.some(m=>m.id===bootstrap.defaults?.model)?bootstrap.defaults.model:bootstrap.models[0]?.id);const m=bootstrap.models.find(m=>m.id===model);effort=effort||(m?.efforts.includes(bootstrap.defaults?.effort)?bootstrap.defaults.effort:m?.defaultEffort);draw();await check();if(generation!==revision)return;history=(await api('history')).runs;draw();if(view==='run')schedule();}
    catch(e){if(generation===revision){notice=e.message;busy=false;draw();}}
  }
  async function submit(e) {
    e?.preventDefault();if(busy)return;capture();
    // Approval is only requested when this browser is not yet paired; the run resumes automatically after it.
    if(!connection?.ready){if(connection?.needsPairing&&selected&&instruction.trim()){pendingRun=true;if(!pairing)await beginPairing();else draw();}return;}busy=true;notice='실행 요청을 접수하고 있습니다.';
    const requestId=crypto.randomUUID();
    const body={requestId,skill:selected,model,effort,instruction,apply};
    draw();
    try {run=await api('runs',body);view='run';notice='';draw();schedule();}
    catch(error){notice=error.message+' 새로 실행하기 전에 히스토리를 확인해주세요.';view='history';await loadHistory();}
    finally{busy=false;draw();}
  }
  async function loadHistory() {clearTimeout(pollTimer);try{history=(await api('history')).runs;}catch(e){notice=e.message;}draw();}
  async function showRun(id) {try{run=await api('runs/'+id);view='run';notice='';draw();schedule();}catch(e){notice=e.message;draw();}}
  function schedule(){clearTimeout(pollTimer);if(dialog?.open&&view==='run'&&run&&!['completed','failed'].includes(run.state))pollTimer=setTimeout(()=>poll(),4500);}
  async function poll(){const generation=revision;try{const next=await api('runs/'+run.id,undefined,15000);if(generation!==revision)return;run=next;draw();if(run.state==='completed'&&run.apply&&run.dashboardChanged){notice='산출물이 대시보드에 반영됐습니다. 화면을 새로고침합니다.';draw();setTimeout(()=>location.reload(),2200);return;}}catch(e){if(generation===revision){notice=e.message;draw();}}schedule();}
  window.SkillsPanel={open,showRun:async id=>{await open();await showRun(id);},async officeRefresh(){
    const generation=revision;const snapshot=await api('history');if(generation!==revision)return;
    const pending=snapshot.runs.filter(r=>!['completed','failed'].includes(r.state));
    let cursor=0;const failures=[];await Promise.allSettled(Array.from({length:Math.min(3,pending.length)},async()=>{while(cursor<pending.length&&generation===revision){const current=pending[cursor++];try{await api('runs/'+current.id,undefined,15000);}catch(e){failures.push(e);}}}));
    if(failures.length)throw failures[0];
    return snapshot;
  },clear(){revision++;window.VirtualOffice?.clear();clearTimeout(pollTimer);clearTimeout(pairTimer);pairing=null;pendingRun=false;window.HappierCloud?.clear();collapseIsland();dialog?.close();bootstrap=null;catalogPromise=null;connection=null;run=null;history=[];notice='';instruction='';model='';effort='';selected='';view='new';busy=false;previewError='';previewLoading=false;islandList();}};
  mountIsland();
})();
