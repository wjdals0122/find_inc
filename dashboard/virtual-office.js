/* FIND.INC office simulation. Habblaud MIT art; authenticated dashboard runs only. */
(() => {
  'use strict';
  const art=window.HabblaudArt, W=1120,H=1616,STEP=296,TOP=90,DH=736,WING=440;
  const terminal=new Set(['completed','failed']);
  const states={checking:'연결 확인',creating:'세션 생성',running:'작업 중',awaiting_approval:'승인 대기',completed:'완료',failed:'오류',disconnected:'연결 끊김',uncertain:'확인 필요'};
  const teams=[
    {id:'hall',name:'대강당 · 품평회',floor:5,color:'#9a7fa8',rooms:['무대','객석','로비']},
    {id:'lead',name:'경영 · 전체 회의',floor:4,color:'#858da5',rooms:['대표 · 의사결정','전사 타운홀','프로젝트 리뷰']},
    {id:'strategy',name:'전략',floor:3,color:'#649d8a',rooms:['브랜드 · 상품','경쟁 · 시장','고객 인사이트']},
    {id:'contents',name:'콘텐츠',floor:2,color:'#b49b6c',rooms:['카피 · 브리프','이미지 · 제품 컷','영상 · 랜딩']},
    {id:'operation',name:'운영',floor:1,color:'#7e9db7',rooms:['채널 운영','성과 분석','검색 · 유튜브']}
  ];
  const roles=[
    ['director','디렉터','lead',0,['team-lead','remember']],
    ['researcher','브랜드 리서처','strategy',0,['brand','product','crawler']],
    ['analyst','시장 애널리스트','strategy',1,['competitor','competitive-ads-extractor']],
    ['customer','고객 리서처','strategy',2,['customer','customer-needs','purchase-concerns','use-context','user-experience']],
    ['writer','카피라이터','contents',0,['marketing-brief','natural-korean']],
    ['designer','비주얼 디자이너','contents',1,['product-shot','product-shot-grid','product-shot-reference','imagegen']],
    ['builder','콘텐츠 메이커','contents',2,['strategy-dashboard','watch']],
    ['operator','채널 매니저','operation',0,['youtube-publish','youtube-reply']],
    ['metrics','성과 애널리스트','operation',1,['channel-metrics']],
    ['search','채널 애널리스트','operation',2,['youtube-metrics','google-search-metrics']]
  ];
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hash=s=>[...String(s)].reduce((a,c)=>(Math.imul(a,31)+c.charCodeAt(0))>>>0,13);
  const baseY=team=>TOP+teams.findIndex(t=>t.id===team)*STEP;
  const desk=(team,room,slot=0)=>({x:110+room*206+slot*62,y:baseY(team)+157});
  const active=r=>!terminal.has(r.state);
  let root,canvas,ctx,viewport,scene,selected='researcher',open=false,raf=0,last=0,refreshTimer=0,generation=0,refreshing=false;
  let floorView='all',weather='clear',dayMode='auto',cityView='skyline',meeting=false,zoom=1,feed=[],demo=false,connection='스킬 실행 내역을 연결합니다';
  const runs=new Map(),actors=new Map(),portraits=new Map();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function makeActor(id,name,team,room){const a={id,name,team,room,seed:hash(id),appearance:art.appearanceFromSeed(hash(id)),...desk(team,room),path:[],phase:'idle',until:0,bubble:'',bubbleUntil:0};actors.set(id,a);return a;}
  function resetActors(){actors.clear();roles.forEach(([id,name,team,room])=>makeActor(id,name,team,room));}
  resetActors();
  function owner(r){return String(r.agentId||r.agent?.id||r.agentKey||roles.find(x=>x[4].includes(r.skill))?.[0]||'director');}
  function assigned(r){return roles.find(x=>x[4].includes(r.skill))||roles[0];}
  function actorRuns(a){return [...runs.values()].filter(r=>owner(r)===a.id).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));}
  function say(a,message){a.bubble=String(message||'').slice(0,100);a.bubbleUntil=performance.now()+12000;}
  function walk(a,targetTeam,targetRoom,end='desk',location){
    const startY=baseY(a.team)+244,finishY=baseY(targetTeam)+244,target=location||desk(targetTeam,targetRoom);
    a.path=[{x:a.x,y:startY},{x:1044,y:startY}];
    if(a.team!==targetTeam)a.path.push({x:1044,y:finishY,elevator:true});
    a.path.push({x:target.x,y:finishY},{...target});a.team=targetTeam;a.room=targetRoom;a.phase='walking';a.afterWalk=end;
    if(reduced.matches){Object.assign(a,target);a.path=[];a.phase=end;}
  }
  function ingest(incoming){
    if(document.body.dataset.authState!=='authenticated')return;
    const now=performance.now();
    for(const r of incoming){if(!r?.id||!r.state)continue;
      const previous=runs.get(r.id);runs.set(r.id,{...r});
      const role=assigned(r),id=owner(r);let a=actors.get(id);
      if(!a)a=makeActor(id,String(r.agentName||r.agent?.name||role[1]),role[2],role[3]);
      if(previous?.state!==r.state||previous?.progress!==r.progress||previous?.result!==r.result){
        say(a,`${r.label||r.skill||'작업'} · ${r.state==='failed'?(r.result||r.progress||'오류'):r.state==='completed'?(r.result||'완료'):r.progress||states[r.state]}`);
        feed.unshift({name:a.name,text:`${r.label||r.skill} · ${states[r.state]||r.state}`,time:r.updatedAt||r.createdAt||new Date().toISOString()});feed=feed.slice(0,24);
      }
      if(active(r)){
        a.meetingHome=null;
        // A busy session always takes precedence over a finished sibling session.
        const current=actorRuns(a).find(active)||r,route=assigned(current);
        if(a.team!==route[2]||a.room!==route[3])walk(a,route[2],route[3],'desk');
        else if(['idle','lounge','return','to-lounge'].includes(a.phase)){const d=desk(a.team,a.room);a.path=[{x:a.x,y:baseY(a.team)+244},{x:d.x,y:baseY(a.team)+244},d];a.phase='walking';a.afterWalk='desk';}
        else if(!a.path.length)a.phase='desk';
      }else if(previous&&active(previous)&&!actorRuns(a).some(active)&&r.state==='completed'){
        a.phase='to-lounge';a.path=[{x:a.x,y:baseY(a.team)+244},{x:728,y:baseY(a.team)+244},{x:728,y:baseY(a.team)+215}];a.afterWalk='lounge';a.until=now+16000;
      }
    }
    if(open)renderPanels();
  }
  function mount(){
    if(root)return;
    root=document.createElement('section');root.id='virtual-office';root.hidden=true;root.setAttribute('aria-label','FIND.INC 버추얼 오피스');
    root.innerHTML=`<header class="vo-toolbar"><div class="vo-heading"><span class="vo-mark" aria-hidden="true">▥</span><div><p>FIND.INC / THE WORKPLACE</p><h1>작업이 살아 움직이는 오피스</h1></div></div><div class="vo-tools"><span class="vo-clock"></span><label for="vo-day">채광</label><select id="vo-day" aria-label="채광 시간"><option value="auto">실제 시간</option><option value="day">밝은 낮</option><option value="dusk">노을</option><option value="night">도시의 밤</option></select><select id="vo-view" aria-label="창밖 배경"><option value="skyline">도시 파노라마</option><option value="river">리버뷰</option></select><label for="vo-weather">날씨</label><select id="vo-weather" aria-label="오피스 날씨"><option value="clear">☀ 맑음</option><option value="cloudy">☁ 흐림</option><option value="rain">☂ 비</option><option value="snow">❄ 눈</option></select><button id="vo-zoom-out" aria-label="오피스 축소">−</button><button id="vo-zoom-in" aria-label="오피스 확대">+</button><button id="vo-meeting" aria-pressed="false" title="대기 중인 캐릭터가 모이는 회의 연출입니다. 실제 작업은 계속됩니다.">전체 회의</button><button id="vo-launch">스킬 실행 ↗</button></div></header><div class="vo-viewport" tabindex="0" aria-label="오피스 전경. 스크롤로 층 이동"><div class="vo-scene"><canvas width="1120" height="${H}" aria-label="5개 층의 픽셀아트 오피스. 담당자 목록에서 작업을 확인하세요."></canvas><div class="vo-hall-screen" hidden aria-label="대강당 화면"></div><button class="vo-hall-cta" type="button">AI 품평회 ↗</button>${teams.map((t,i)=>`<button class="vo-floor-link" data-floor="${i}" style="top:${(baseY(t.id)+8)/H*100}%">${t.floor}F · ${t.name}</button>`).join('')}</div></div><nav class="vo-floorbar" aria-label="층 보기"><button class="vo-floor-pill" data-view="all" aria-pressed="true">전체 층</button>${teams.map((t,i)=>`<button class="vo-floor-pill" data-view="${i}" aria-pressed="false">${t.floor}F ${t.name.split(' ')[0]}</button>`).join('')}</nav><aside class="vo-sidebar"><div class="vo-roster-wrap"><p class="vo-section-label">THE TEAM <span id="vo-count"></span></p><div class="vo-roster"></div></div><div class="vo-detail"></div><section class="vo-feed"><p class="vo-section-label">OFFICE JOURNAL</p><div class="vo-feed-items"></div></section></aside><footer class="vo-footer"><span class="vo-connection" role="status"></span><span>대화는 휴식 연출 · <a href="https://github.com/marmottajr/habblaud" target="_blank" rel="noopener">Habblaud art ↗</a> · FIND.INC</span></footer>`;
    document.body.append(root);canvas=root.querySelector('canvas');ctx=canvas.getContext('2d');viewport=root.querySelector('.vo-viewport');scene=root.querySelector('.vo-scene');
    root.querySelector('#vo-day').onchange=e=>dayMode=e.target.value;
    root.querySelector('#vo-view').onchange=e=>cityView=e.target.value;
    root.querySelector('#vo-meeting').onclick=()=>gather(!meeting);
    const params=new URLSearchParams(location.search),preset=params.get('lighting'),view=params.get('view');
    if(['auto','day','dusk','night'].includes(preset)){dayMode=preset;root.querySelector('#vo-day').value=preset;}
    if(['skyline','river'].includes(view)){cityView=view;root.querySelector('#vo-view').value=view;}
    root.querySelector('#vo-weather').onchange=e=>{weather=e.target.value;root.dataset.weather=weather;};root.dataset.weather=weather;
    root.querySelectorAll('.vo-floor-pill').forEach(b=>b.onclick=()=>setFloorView(b.dataset.view));
    root.querySelector('#vo-zoom-in').onclick=()=>setZoom(zoom+.15);root.querySelector('#vo-zoom-out').onclick=()=>setZoom(zoom-.15);
    root.querySelector('#vo-launch').onclick=()=>window.SkillsPanel?.open();
    root.querySelectorAll('[data-floor]').forEach(b=>b.onclick=()=>focusFloor(Number(b.dataset.floor)));
    root.querySelector('.vo-hall-cta').onclick=()=>window.dispatchEvent(new CustomEvent('vo-hall-open'));placeHall();
    canvas.onclick=e=>{const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*W/r.width,y=(e.clientY-r.top)*canvas.height/r.height+detailOffset();const a=[...actors.values()].find(a=>Math.abs(x-a.x)<22&&Math.abs(y-a.y+20)<34);if(a){selected=a.id;renderPanels();}};
  }
  function setZoom(z){zoom=Math.max(.7,Math.min(1.8,z));scene.style.width=Math.round(W*zoom)+'px';}
  // Single-floor view crops the same canvas with CSS; scene coordinates and clicks stay unchanged.
  function setFloorView(v){floorView=v==='all'?'all':Math.max(0,Math.min(teams.length-1,Number(v)));root.querySelectorAll('.vo-floor-pill').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===String(floorView))));
    const one=floorView!=='all';root.dataset.floorView=one?teams[floorView].floor+'F':'all';
    // A single floor gets its own taller canvas: the summary storey on top plus an extra wing below.
    canvas.height=one?DH:H;canvas.setAttribute('aria-label',one?`${teams[floorView].floor}F ${teams[floorView].name} 상세 평면. 업무 공간과 추가 라운지·회의실을 보여줍니다.`:'5개 층의 픽셀아트 오피스. 담당자 목록에서 작업을 확인하세요.');
    root.querySelectorAll('.vo-floor-link').forEach((b,i)=>{b.hidden=one&&i!==floorView;b.style.top=one?`${16/DH*100}%`:`${(TOP+i*STEP+8)/H*100}%`;});viewport.scrollTop=0;placeHall();
    if(one)window.dispatchEvent(new CustomEvent('vo-floor-enter',{detail:{floor:teams[floorView].id}}));}
  const detailOffset=()=>floorView==='all'?0:baseY(teams[floorView].id)-8;
  // The hall screen and entry button are DOM overlays aligned to the canvas stage (scene units).
  function placeHall(){
    const hy=baseY('hall'),one=floorView!=='all',showing=!one||teams[floorView].id==='hall',ch=one?DH:H,off=one?hy-8:0;
    const screen=root.querySelector('.vo-hall-screen'),cta=root.querySelector('.vo-hall-cta');
    Object.assign(screen.style,{left:330/W*100+'%',width:460/W*100+'%',top:(hy+14-off)/ch*100+'%',height:170/ch*100+'%'});
    screen.classList.toggle('vo-hidden',!showing);cta.hidden=!showing;Object.assign(cta.style,{left:52/W*100+'%',top:(hy+128-off)/ch*100+'%'});
  }
  function focusFloor(i){if(floorView!=='all'){setFloorView(i);return;}if(teams[i]?.id==='hall')window.dispatchEvent(new CustomEvent('vo-floor-enter',{detail:{floor:'hall'}}));viewport.scrollTo({top:(TOP+i*STEP-10)*scene.clientWidth/W,behavior:reduced.matches?'instant':'smooth'});}
  function avatar(a){if(!portraits.has(a.id))portraits.set(a.id,art.avatarCanvas(a.seed,{scale:2}).toDataURL());return portraits.get(a.id);}
  function renderPanels(){
    if(!root)return;
    root.querySelector('#vo-count').textContent=`/ ${actors.size}`;
    root.querySelector('.vo-roster').innerHTML=[...actors.values()].filter(a=>!a.guest).map(a=>{const rr=actorRuns(a),busy=rr.filter(active),err=rr.some(r=>r.state==='failed'),team=teams.find(t=>t.id===a.team);return `<button class="vo-person" data-actor="${esc(a.id)}" aria-pressed="${selected===a.id}"><img src="${avatar(a)}" alt=""><span><strong>${esc(a.name)}</strong><small>${team.floor}F ${team.name} · ${busy.length?busy.length+'건 진행':rr.length?rr.length+'개 세션':'세션 없음'}</small></span><i class="${busy.length?'busy':err?'error':''}" aria-hidden="true"></i></button>`;}).join('');
    root.querySelectorAll('[data-actor]').forEach(b=>b.onclick=()=>{selected=b.dataset.actor;renderPanels();focusFloor(teams.findIndex(t=>t.id===actors.get(selected).team));});
    const a=actors.get(selected)||actors.values().next().value,rr=actorRuns(a);
    root.querySelector('.vo-detail').innerHTML=`<p class="vo-section-label">AGENT / CODEX</p><h2>${esc(a.name)}</h2><p>${esc(teams.find(t=>t.id===a.team).rooms[a.room])}</p><p class="vo-hint">담당 역할별 캐릭터 · 여러 세션을 한곳에서 확인</p>${rr.length?rr.map(r=>`<article class="vo-task"><strong>${esc(r.label||r.skill)}</strong><p>${esc(states[r.state]||r.state)} · ${esc(r.progress||'')}</p><small>세션 ${esc(r.sessionId||'준비 중')}</small>${r.result?`<pre>${esc(r.result)}</pre>`:''}<button data-office-run="${esc(r.id)}">작업 상세 열기 ↗</button></article>`).join(''):'<p class="vo-empty">아직 연결된 작업이 없습니다.<br>스킬을 실행하면 담당자가 자리에서 작업을 시작합니다.</p>'}`;
    root.querySelectorAll('[data-office-run]').forEach(b=>b.onclick=()=>{if(!demo)window.SkillsPanel?.showRun(b.dataset.officeRun);});
    root.querySelector('.vo-feed-items').innerHTML=feed.slice(0,10).map(f=>`<article><strong>${esc(f.name)}</strong><p>${esc(f.text)}</p><time>${esc(new Date(f.time).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}))}</time></article>`).join('')||'<p class="vo-empty">실행한 스킬의 진행·완료·오류가 여기에 기록됩니다.</p>';
    root.querySelector('.vo-connection').innerHTML=`<span class="vo-dot">●</span><span class="${demo?'vo-demo-banner':''}">${esc(demo?'연출 미리보기 · 샘플 데이터 (실제 실행 아님)':connection)}</span>`;
  }
  async function refresh(){
    if(!open||demo||refreshing||document.hidden)return;
    const gen=generation;refreshing=true;
    try{await window.SkillsPanel?.officeRefresh();if(gen!==generation)return;connection=`대시보드 실행 내역 ${runs.size}건 확인 · 진행 세션 주기적 조회`;}
    catch(e){if(gen!==generation)return;connection='연결 확인 필요 · '+e.message;}
    finally{if(gen===generation){refreshing=false;renderPanels();clearTimeout(refreshTimer);if(open)refreshTimer=setTimeout(refresh,6000);}}
  }
  function toggle(value=!open){
    if(document.body.dataset.authState!=='authenticated')return;
    if(open===value)return;mount();open=value;root.hidden=!open;document.body.classList.toggle('vo-active',open);if(!open)document.body.classList.remove('vo-night');document.getElementById('virtual-office-toggle').setAttribute('aria-pressed',String(open));
    if(open){renderPanels();fit();last=performance.now();raf=requestAnimationFrame(frame);refresh();viewport.focus({preventScroll:true});}else{cancelAnimationFrame(raf);clearTimeout(refreshTimer);document.getElementById('virtual-office-toggle').focus();}
  }
  function fit(){if(!scene)return;scene.style.minWidth='780px';setZoom(Math.max(.7,Math.min(1,(viewport.clientWidth-30)/W)));}
  function clear(){generation++;refreshing=false;clearTimeout(refreshTimer);runs.clear();feed=[];demo=false;meeting=false;aiMeeting.active=false;hall.active=false;hall.cast={};resetActors();if(open){open=false;root.hidden=true;document.body.classList.remove('vo-active','vo-night');document.getElementById('virtual-office-toggle')?.setAttribute('aria-pressed','false');}cancelAnimationFrame(raf);if(root){root.querySelector('#vo-meeting').setAttribute('aria-pressed','false');root.querySelector('#vo-meeting').textContent='전체 회의';renderPanels();}}
  // Explicit opt-in preview uses sample runs; never contacts or starts a Codex session.
  function preview(){clear();demo=true;toggle(true);const now=new Date().toISOString();ingest([
    {id:'preview-brand',skill:'brand',label:'브랜드 아이덴티티 조사',state:'running',progress:'공식 자료에서 브랜드 컬러를 확인하고 있어요.',createdAt:now,sessionId:'preview-01'},
    {id:'preview-product',skill:'product',label:'상품 정보 정리',state:'running',progress:'제품 사양과 사용 조건을 정리하고 있어요.',createdAt:now,sessionId:'preview-02'},
    {id:'preview-design',skill:'product-shot',label:'제품 연출 컷',state:'running',progress:'밝은 창가의 제품 컷을 제작하고 있어요.',createdAt:now,sessionId:'preview-03'},
    {id:'preview-metrics',skill:'channel-metrics',label:'채널 성과 분석',state:'running',progress:'최근 7일 데이터를 비교하고 있어요.',createdAt:now,sessionId:'preview-04'}]);connection='샘플 연출';renderPanels();}
  function sprite(s,x,y,scale=2){ctx.drawImage(s.canvas,Math.round(x-s.ax*scale),Math.round(y-s.ay*scale),s.canvas.width*scale,s.canvas.height*scale);}
  function furniture(kind,x,y,variant,state=0,front=false){const f=art.furnitureSprites(kind,variant,state);sprite(front?(f.front||f.base):f.base,x,y);}
  function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}
  function text(s,x,y,size=11,c='#5c7569'){ctx.font=`${size}px Pretendard, system-ui, sans-serif`;ctx.fillStyle=c;ctx.fillText(s,x,y);}
  function gather(on){
    meeting=on;const b=root.querySelector('#vo-meeting');b.setAttribute('aria-pressed',String(on));b.textContent=on?'회의 마치기':'전체 회의';
    if(on){let seat=0;for(const a of actors.values()){
      if(actorRuns(a).some(active)||a.meetingHome)continue;
      a.meetingHome={team:a.team,room:a.room};
      const spot={x:315+(seat%5)*96,y:baseY('lead')+190+Math.floor(seat/5)*38};seat++;
      walk(a,'lead',1,'meeting',spot);say(a,'타운홀 라운지에서 만나요. (회의 연출)');
    }focusFloor(teams.findIndex(t=>t.id==='lead'));}else for(const a of actors.values())if(a.meetingHome){const home=a.meetingHome;a.meetingHome=null;walk(a,home.team,home.room,'idle');}
    renderPanels();
  }
  function sky(t){
    const hr=new Date().getHours()+new Date().getMinutes()/60;
    const night=dayMode==='night'||dayMode==='auto'&&(hr<6||hr>=19);
    const dusk=dayMode==='dusk'||dayMode==='auto'&&(hr>=17&&hr<19||hr>=6&&hr<7);
    root.dataset.lighting=night?'night':dusk?'dusk':'day';document.body.classList.toggle('vo-night',night);
    const grey=weather==='cloudy'||weather==='rain',top=night?(grey?'#1a2433':'#101d39'):dusk?(grey?'#a99a98':'#dca293'):weather==='rain'?'#94a9b3':grey?'#b3c4cb':weather==='snow'?'#d3e0e8':'#bce4f1';
    const grad=ctx.createLinearGradient(0,0,0,H);grad.addColorStop(0,top);grad.addColorStop(1,night?(grey?'#2a3644':'#233c57'):dusk?(grey?'#d2c5b8':'#f2d5b3'):grey?'#dce3e0':weather==='snow'?'#f1f5f6':'#edf4e8');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
    if(night){for(let i=0;i<70;i++){const x=hash('star'+i)%W,y=hash('star-y'+i)%H;rect(x,y,i%5===0?2:1,1,'#dae8fa99');}rect(916,24,24,24,'#f2e5bb');rect(924,20,24,24,top);}
    else if(weather==='clear')rect(916,22,29,29,dusk?'#ffe6b3':'#fff6d1');
    const cloudN=weather==='clear'?12:26,cloudC=weather==='clear'?(night?'#758fa52a':'#ffffff70'):night?'#5d6b7c66':weather==='rain'?'#7d8d97aa':'#e8eef0cc';
    for(let i=0;i<cloudN;i++){const x=(i*137+t*.003)%1300-100,w=weather==='clear'?60:90;rect(x,25+(i%3)*12,w,weather==='clear'?5:9,cloudC);rect(x+12,19+(i%3)*12,w/2,8,cloudC);}
    // Full-scene skyline continues behind the building; windows share the same city.
    for(let i=0;i<32;i++){const x=i*38,h=60+hash('tower'+i)%190;rect(x,H-h,32,h,night?'#142b45':'#96b7bc88');for(let yy=H-h+8;yy<H;yy+=13)for(let xx=x+5;xx<x+29;xx+=9)if(hash(xx+':'+yy)%3)rect(xx,yy,3,4,night?'#e6c78299':'#d3e5de');}
    if(cityView==='river'){rect(0,H-40,W,40,night?'#193d59':'#a0d1da');for(let i=0;i<30;i++)rect((i*53+t*.006)%W,H-32+(i%5)*6,12+i%3*7,1,night?'#d3c48b77':'#dff4ed');}
    // Weather continues outside the building: margins, roof and the gaps between floors.
    if(weather==='rain'||weather==='snow'){const rain=weather==='rain';for(let i=0;i<260;i++){const x=(i*71+t*(rain?.05:.01)+(hash('wx'+i)%40))%W,y=(hash('wy'+i)%H+t*(rain?.25:.03))%H;rect(x,y,rain?1:2,rain?10:2,rain?(night?'#b8cfe388':'#eef8ff99'):'#ffffff');}}
    if(weather==='snow'&&floorView==='all')teams.forEach(tm=>{const y=baseY(tm.id);rect(22,y-4,1080,4,'#f8fbfc');rect(22,y+274,1080,3,'#f1f6f8');});
    text('FIND.INC',36,42,22,night?'#cfdfd5':'#527f7e');text(night?'AFTER HOURS / CITY LIGHTS':'A LITTLE WORLD. REAL WORK.',36,59,9,night?'#90a8bb':'#6c9391');
    return {night,dusk};
  }
  function windows(y,night,t){
    rect(32,y+35,976,63,night?'#162d4b':light.dusk?'#eac3aa':'#cae8ed');
    for(let layer=0;layer<2;layer++)for(let i=0;i<28;i++){
      const x=34+i*37+layer*14,h=13+hash(i+':city'+layer)%45;
      rect(x,y+98-h,layer?25:34,h,night?(layer?'#29445e':'#20364d'):(layer?'#8fb4c1':'#adcbd0'));
      if(i===18&&layer){rect(x+11,y+32,2,20,night?'#b7d6e6':'#a2bec6');}
      for(let wy=y+101-h;wy<y+94;wy+=9)for(let wx=x+4;wx<x+22;wx+=7)if(hash(wx+':'+wy)%4)rect(wx,wy,2,3,night?(i%3?'#e9cc8f':'#8ec3d7'):'#d9ece9');
    }
    if(cityView==='river'){
      rect(32,y+80,976,18,night?'#1c415b':'#9dcfd5');
      for(let i=0;i<48;i++)rect(32+i*21,y+83+i%4*4,8,1,night?'#d3c17f88':'#dceee3');
      rect(32,y+78,976,2,night?'#819ba5':'#b7c5bc');for(let i=0;i<9;i++){const x=57+i*110;rect(x,y+66,3,15,night?'#b6c2ba':'#bacac5');rect(x-18,y+75,40,1,night?'#e4c48d':'#d7e2d9');}
    }
    for(let i=0;i<14;i++){rect(31+i*72,y+31,4,69,night?'#a2b5b5':'#f3f6ef');rect(35+i*72,y+38,1,55,night?'#91bdd633':'#ffffff88');}
    rect(30,y+96,980,6,night?'#a6b9b1':'#d4e1db');
    if(weather==='rain'||weather==='snow'){ctx.save();ctx.beginPath();ctx.rect(32,y+35,976,60);ctx.clip();for(let i=0;i<70;i++){const x=32+(i*47+t*(weather==='rain'?.04:.008))%976,yy=y+35+(i*13+t*(weather==='rain'?.13:.018))%63;rect(x,yy,weather==='rain'?1:2,weather==='rain'?8:2,weather==='rain'?'#e7f5ff99':'#ffffff');}ctx.restore();}
  }
  const interiors={
    lead:{floor:'wood',tint:'#c5af8b',wall:'#eee8db',trim:'#b7a279',label:'THE SKY LOUNGE / 타운홀',rug:'#70887d'},
    strategy:{floor:'carpet',tint:'#c0cfb5',wall:'#e9efdf',trim:'#738f72',label:'THE RESEARCH LIBRARY / 리서치 라이브러리',rug:'#9cae8f'},
    contents:{floor:'wood',tint:'#d6b792',wall:'#f4e6d6',trim:'#bc8f68',label:'THE CREATIVE STUDIO / 크리에이티브 스튜디오',rug:'#dab4a4'},
    operation:{floor:'concrete',tint:'#c3ced3',wall:'#dfe8ed',trim:'#628398',label:'THE CONTROL ROOM / 채널 컨트롤룸',rug:'#8da6b0'}
  };
  function partition(x,y,color){rect(x,y,5,108,color);rect(x+2,y+3,2,99,'#f5faf688');rect(x-2,y,9,3,'#f3f5ed');}
  function workstation(x,y,seed){furniture('desk',x+35,y+147,undefined,0);furniture('office_chair',x+68,y+163);furniture('desk',x+118,y+147,undefined,0);furniture('office_chair',x+151,y+163);}
  function townhall(y,p){
    // A single open lounge replaces the repeated center cubicles on the penthouse.
    rect(244,y+108,580,137,'#c4b391');art.drawRug(ctx,258,y+142,548,94,p.rug,21);
    rect(366,y+104,320,33,'#314f4a');rect(374,y+109,304,23,'#cee0cc');
    text('FIND.INC / ALL HANDS',431,y+124,13,'#395d50');
    rect(342,y+136,367,5,'#a48862');furniture('plant_tall',272,y+142,'palm');furniture('plant_tall',788,y+142,'palm');
    for(const x of [289,430,571,712]){furniture('sofa',x,y+180,'down');furniture('sofa',x,y+225,'down');}
    furniture('coffee_table',378,y+211);furniture('coffee_table',660,y+211);
    text('TOWNHALL LOUNGE · 전체 회의 / 16 SEATS',360,y+263,11,'#546657');
    furniture('desk',77,y+147);furniture('office_chair',110,y+163);furniture('bookshelf',64,y+224);furniture('plant_tall',206,y+208,'ficus');
    partition(232,y+116,'#aeaa91');text('대표 · 의사결정',60,y+263,10,'#62715d');
  }
  function department(t,y,p){
    for(let k=0;k<3;k++){const x=42+k*206;
      art.drawRug(ctx,x+8,y+124,174,104,p.rug,hash(t.id+k));
      workstation(x,y,k);
      if(t.id==='strategy'){
        furniture('bookshelf',x+12,y+222);furniture('binder_shelf',x+171,y+207);furniture('plant_tall',x+176,y+147,'ficus');
        // Research notes and pinned references on each glazed booth.
        rect(x+11,y+109,56,10,'#f5f1d9');for(let n=0;n<4;n++)rect(x+16+n*11,y+112,7,4,['#d1b077','#8fae94','#a4b8c1','#cab2a7'][n]);
      }else if(t.id==='contents'){
        furniture('beanbag',x+28,y+224,['yellow','red','blue'][k]);furniture('armchair',x+154,y+222,'left');furniture('plant_small',x+177,y+159,'succulent');
        rect(x+126,y+108,55,11,'#f9eee0');for(let n=0;n<5;n++)rect(x+130+n*9,y+111,7,5,['#cf8f72','#789c9a','#e0bb67','#a99eaf','#d4d8c5'][n]);
        furniture('floor_lamp',x+176,y+223);
      }else{
        // Live-looking wall dashboards are decorative; task states stay in bubbles.
        rect(x+9,y+106,172,17,'#284a59');for(let n=0;n<12;n++)rect(x+17+n*12,y+116-(n*7+k*3)%9,5,3+(n*7+k*3)%9,['#7db5af','#b8d5cc','#cfbe88'][k]);
        furniture('filing_cabinet',x+19,y+222);furniture('printer',x+167,y+224);furniture('plant_tall',x+176,y+153,'monstera');
      }
      if(k<2)partition(x+192,y+116,t.id==='contents'?'#c4a184':'#9db5a6');
      text(t.rooms[k],x+10,y+263,10,'#4e675b');
    }
    partition(648,y+116,p.trim);partition(834,y+116,p.trim);
    art.drawFloor(ctx,t.id==='contents'?'carpet':'wood',657,y+105,174,143,{seed:18,tint:t.id==='contents'?'#d4baab':'#c8b497'});
    if(t.id==='operation'){
      furniture('counter',675,y+144);furniture('coffee_machine',708,y+144);furniture('cafe_table',707,y+204);furniture('cafe_chair',681,y+215,'right');furniture('cafe_chair',765,y+215,'left');furniture('vending_machine',792,y+167);
    }else if(t.id==='contents'){
      furniture('sofa',682,y+159,'down');furniture('beanbag',779,y+220,'yellow');furniture('coffee_table',719,y+203);furniture('arcade',792,y+162);
    }else{
      furniture('sofa',682,y+161,'down');furniture('coffee_table',718,y+206);furniture('coffee_machine',796,y+159);furniture('plant_tall',813,y+224,'palm');
    }
    text(t.id==='operation'?'COFFEE BAR':t.id==='contents'?'IDEA LOUNGE':'GARDEN LOUNGE',674,y+263,9,'#72775e');
  }
  // 5F auditorium: stage, big screen (DOM overlay sits on top), curtains and front audience rows.
  function hallFloor(t,y){
    const night=light.night;rect(24,y+5,1080,276,'#28424435');rect(22,y,1080,274,'#eff0e7');
    art.drawFloor(ctx,'wood',30,y+100,978,163,{seed:hash('hall'),tint:'#b89a7c'});
    rect(30,y+2,978,186,night?'#262a38':'#353a4d');for(let i=0;i<16;i++)rect(40+i*61,y+14,42,160,night?'#2e3344':'#3f4559');
    rect(326,y+10,468,178,'#151821');rect(330,y+14,460,170,'#0e1117');
    text('FIND.INC  AI REVIEW',476,y+96,14,'#8f96b3');text('발표 화면',528,y+116,10,'#6b7290');
    for(const x of [292,794]){rect(x,y+6,34,192,'#7b2f3d');for(let k=0;k<5;k++)rect(x+3+k*6,y+6,2,192,'#93404f');}
    rect(232,y+188,656,30,'#7d6046');rect(232,y+188,656,4,'#a8865f');rect(232,y+214,656,4,'#5a4330');
    rect(690,y+168,30,34,'#4f3a29');rect(686,y+166,38,5,'#6d5139');furniture('floor_lamp',256,y+214);furniture('floor_lamp',864,y+214);
    for(const x of [96,180,264,856,940])furniture('bench',x,y+236);for(const x of [138,222,898])furniture('bench',x,y+262);
    furniture('plant_tall',48,y+236,'palm');
    rect(30,y+2,150,26,t.color);rect(30,y+26,150,2,'#00000022');text(`${t.floor}F`,40,y+21,15,'#ffffff');text('대강당',78,y+20,11,'#ffffffdd');
    text('THE AUDITORIUM / 대강당 · 품평회',192,y+20,12,'#c9b6d6');
    rect(1014,y+3,82,260,night?'#a0b0ad':'#d3dfd8');rect(1022,y+8,66,85,night?'#bccac1':'#eaf0e8');text('↕',1041,y+28,15,'#507a66');
    furniture('elevator',1022,y+96,undefined,elevatorFloor===t.floor?4:0);text(`${t.floor}F`,1040,y+125,13,'#5c7a6b');text('LIFT',1037,y+241,9,'#718a7b');
    partition(1008,y+116,'#9a7fa8');rect(30,y+266,1072,8,'#bfcec4');rect(30,y+266,1072,2,'#f6f7ef');
    text('STAGE · 발표',250,y+208,9,'#f1dfc6');text('FRONT ROW · 품평단',236,y+262,9,'#6d5d4c');
    if(night){ctx.save();ctx.beginPath();ctx.rect(30,y+101,978,163);ctx.clip();for(const x of [420,700]){const g=ctx.createRadialGradient(x,y+200,5,x,y+200,120);g.addColorStop(0,'#ffe6a830');g.addColorStop(1,'#ffe6a800');ctx.fillStyle=g;ctx.fillRect(x-120,y+90,240,180);}ctx.restore();}
  }
  function hallWing(t,y){
    const Y=y+262,night=light.night;wingLabels=[];
    rect(22,Y,1080,WING+8,'#eff0e7');art.drawFloor(ctx,'carpet',30,Y,978,WING-12,{seed:hash('hall-wing'),tint:'#a88fa6'});
    // Tiered audience seating continues below the stage in the detailed view.
    for(let r=0;r<5;r++){rect(150,Y+20+r*62,660,6,'#8b7392');for(let c=0;c<9;c++)furniture('cafe_chair',190+c*72,Y+56+r*62,'up');}
    text('AUDIENCE · 객석 45석',160,Y+346,10,'#5e4b63');
    rect(36,Y+20,100,320,'#e7dfe8');text('LOBBY',50,Y+40,10,'#5e4b63');furniture('reception_desk',86,Y+120);furniture('bench',86,Y+220);furniture('plant_tall',60,Y+300,'monstera');furniture('water_cooler',112,Y+300);
    rect(826,Y+20,176,150,'#d9d3df');text('CONTROL BOOTH',840,Y+40,10,'#5e4b63');furniture('desk',870,Y+110);furniture('office_chair',900,Y+126);furniture('tv',950,Y+90);
    rect(826,Y+186,176,154,'#e7dfe8');text('GREEN ROOM · 대기실',840,Y+206,10,'#5e4b63');furniture('sofa',912,Y+270,'down');furniture('mirror',850,Y+300);furniture('coffee_table',912,Y+320);
    rect(1014,Y,82,WING-12,night?'#a0b0ad':'#d3dfd8');text('STAIRS',1032,Y+190,9,'#5c7a6b');for(let i=0;i<8;i++)rect(1024,Y+210+i*14,62,3,'#9fb3a8');
    rect(30,Y+WING-12,1072,8,'#bfcec4');rect(30,Y+WING-12,1072,2,'#f6f7ef');
    if(night)rect(30,Y,978,WING-12,'#14243b30');
  }
  function roomFloor(t,y){
    if(t.id==='hall'){hallFloor(t,y);return;}
    const p=interiors[t.id];rect(24,y+5,1080,276,'#28424435');rect(22,y,1080,274,'#eff0e7');
    art.drawFloor(ctx,p.floor,30,y+100,978,163,{seed:hash(t.id),tint:p.tint});
    rect(30,y+2,978,30,p.wall);rect(30,y+28,978,3,p.trim);windows(y,light.night,clock);
    if(t.id==='lead')townhall(y,p);else department(t,y,p);
    partition(1008,y+116,p.trim);
    // Every floor retains a separate enclosed meeting / project review room.
    rect(851,y+108,140,17,t.id==='contents'?'#d9c1b0':'#cddbd2');text(t.id==='lead'?'PROJECT REVIEW':'MEETING ROOM',864,y+120,10,'#526d60');
    art.drawRug(ctx,850,y+147,148,92,t.id==='operation'?'#9eb5bb':'#c7cdb6',15);
    furniture('meeting_table',883,y+180);furniture('stool',865,y+190);furniture('stool',970,y+190);furniture('stool',914,y+222);furniture('plant_tall',986,y+147,'bonsai');
    text(t.id==='lead'?'소규모 프로젝트 회의':'팀 미팅 · 회의실',864,y+263,10,'#627565');
    rect(1014,y+3,82,260,light.night?'#a0b0ad':'#d3dfd8');rect(1022,y+8,66,85,light.night?'#bccac1':'#eaf0e8');text('↕',1041,y+28,15,'#507a66');
    furniture('elevator',1022,y+96,undefined,elevatorFloor===t.floor?4:0);text(`${t.floor}F`,1040,y+125,13,'#5c7a6b');text('LIFT',1037,y+241,9,'#718a7b');
    rect(30,y+266,1072,8,'#bfcec4');rect(30,y+266,1072,2,'#f6f7ef');
    // Floor identity band: team-colored badge + accent stripe so each floor reads at a glance.
    rect(30,y+2,150,26,t.color);rect(30,y+26,150,2,'#00000022');text(`${t.floor}F`,40,y+21,15,'#ffffff');text(t.name.split(' ')[0],78,y+20,11,'#ffffffdd');
    rect(180,y+28,828,3,t.color);
    text(p.label,192,y+20,12,p.trim);
    if(light.night){
      rect(30,y+102,978,162,'#14243b25');ctx.save();ctx.beginPath();ctx.rect(30,y+101,978,163);ctx.clip();
      for(const x of [140,450,745,920]){const g=ctx.createRadialGradient(x,y+135,5,x,y+135,82);g.addColorStop(0,'#ffdf9428');g.addColorStop(1,'#ffdf9400');ctx.fillStyle=g;ctx.fillRect(x-82,y+102,164,163);rect(x-22,y+103,44,2,'#ffe8b6');}
      ctx.restore();
    }
  }
  // Detail-only wing: extra shared rooms per floor. Purely spatial decoration; it never creates or reflects sessions.
  function room(x,y,w,h,label,sub,tint){rect(x,y,w,h,tint);rect(x,y,w,3,'#ffffff55');rect(x,y,2,h,'#9fb1a755');rect(x+w-2,y,2,h,'#9fb1a755');rect(x,y+h-2,w,2,'#9fb1a755');wingLabels.push([label,x+8,y+6]);if(sub)text(sub,x+10,y+h-10,9,'#6d7e70');}
  let wingLabels=[];
  function glassWall(x,y,w){rect(x,y,w,4,'#b9d3d6aa');rect(x,y,w,1,'#ffffff');for(let i=x;i<x+w;i+=46)rect(i,y-2,3,8,'#7f9c97');}
  function wing(t,y){
    if(t.id==='hall'){hallWing(t,y);return;}
    const p=interiors[t.id],Y=y+262,night=light.night;wingLabels=[];
    rect(22,Y,1080,WING+8,'#eff0e7');art.drawFloor(ctx,p.floor,30,Y,978,WING-12,{seed:hash(t.id+'wing'),tint:p.tint});
    rect(30,Y+2,978,26,'#00000010');text('CORRIDOR · '+t.floor+'F',44,Y+18,9,'#6d7e70');
    rect(1014,Y,82,WING-12,night?'#a0b0ad':'#d3dfd8');text('STAIRS',1032,Y+190,9,'#5c7a6b');for(let i=0;i<8;i++)rect(1024,Y+210+i*14,62,3,'#9fb3a8');
    furniture('water_cooler',1040,Y+120);furniture('trash_bin',1078,Y+120);
    const A=[36,Y+40,368,WING-62],B=[414,Y+40,316,WING-62],C=[740,Y+40,262,WING-62];
    if(t.id==='lead'){
      room(...A,'GRAND BOARDROOM / 전사 대회의실','전 직원 프레젠테이션 · 24석','#e6dcc8');art.drawRug(ctx,A[0]+24,Y+120,A[2]-48,220,'#7f8f7a',3);
      furniture('tv',A[0]+184,Y+92);furniture('whiteboard',A[0]+60,Y+96);furniture('whiteboard',A[0]+310,Y+96);
      for(let r=0;r<2;r++){const ty=Y+190+r*110;furniture('meeting_table',A[0]+110,ty);furniture('meeting_table',A[0]+250,ty);for(const sx of [70,120,170,210,260,310]){furniture('stool',A[0]+sx,ty-34);furniture('stool',A[0]+sx,ty+28);}}
      room(...B,'EXECUTIVE LOUNGE','대표 손님 응접 · 서재','#e9e1d2');art.drawRug(ctx,B[0]+40,Y+140,236,160,'#9b6b55',8);
      furniture('bookshelf',B[0]+40,Y+110);furniture('bookshelf',B[0]+90,Y+110);furniture('painting',B[0]+200,Y+76);furniture('floor_lamp',B[0]+286,Y+130);
      furniture('sofa',B[0]+150,Y+190,'down');furniture('coffee_table',B[0]+150,Y+250);furniture('armchair',B[0]+64,Y+260,'right');furniture('armchair',B[0]+240,Y+260,'left');furniture('sofa',B[0]+150,Y+320,'up');furniture('plant_tall',B[0]+290,Y+360,'palm');
      room(...C,'SKY BAR & PANTRY','라운지 바 · 간식','#dfe6dd');furniture('counter',C[0]+60,Y+110);furniture('coffee_machine',C[0]+60,Y+108);furniture('counter_sink',C[0]+124,Y+110);furniture('fridge',C[0]+214,Y+110);
      for(const [cx,cy] of [[70,200],[190,200],[70,300],[190,300]]){furniture('cafe_table',C[0]+cx,Y+cy);furniture('cafe_chair',C[0]+cx-28,Y+cy+8,'right');furniture('cafe_chair',C[0]+cx+28,Y+cy+8,'left');}
    }else if(t.id==='strategy'){
      room(...A,'ARCHIVE STACKS / 자료 서고','시장·경쟁 리포트 아카이브','#dfe8d6');
      for(let r=0;r<3;r++)for(let c=0;c<6;c++)furniture(c%3===2?'binder_shelf':'bookshelf',A[0]+40+c*56,Y+110+r*100);
      room(...B,'WAR ROOM / 전략 회의실','브리프 리뷰 · 화이트보드','#e4ead9');glassWall(B[0],B[1]+B[3]-4,B[2]);
      furniture('whiteboard',B[0]+70,Y+96);furniture('whiteboard',B[0]+170,Y+96);furniture('poster',B[0]+260,Y+80);
      art.drawRug(ctx,B[0]+30,Y+150,256,180,'#8aa58d',5);furniture('meeting_table',B[0]+110,Y+230);furniture('meeting_table',B[0]+200,Y+230);
      for(const sx of [70,120,170,210,250]){furniture('stool',B[0]+sx,Y+196);furniture('stool',B[0]+sx,Y+262);}
      room(...C,'READING NOOK','조용한 리서치 코너','#e8eedf');
      for(const [cx,cy,d] of [[50,170,'right'],[200,170,'left'],[50,290,'right'],[200,290,'left']]){furniture('armchair',C[0]+cx,Y+cy,d);furniture('floor_lamp',C[0]+(d==='right'?cx-20:cx+22),Y+cy-10);}
      furniture('coffee_table',C[0]+125,Y+180);furniture('coffee_table',C[0]+125,Y+300);furniture('plant_tall',C[0]+125,Y+110,'monstera');furniture('bench',C[0]+125,Y+370);
    }else if(t.id==='contents'){
      room(...A,'PHOTO STUDIO / 제품 컷 촬영','조명 · 배경지 · 촬영 테이블','#efe3d6');
      rect(A[0]+90,Y+66,190,120,'#e6c9b8');rect(A[0]+90,Y+186,190,60,'#efd9cb');rect(A[0]+90,Y+66,190,4,'#c8a48f');
      furniture('coffee_table',A[0]+185,Y+225);furniture('floor_lamp',A[0]+60,Y+230);furniture('floor_lamp',A[0]+310,Y+230);furniture('stool',A[0]+185,Y+320);furniture('mirror',A[0]+40,Y+330);furniture('shelf_wall',A[0]+310,Y+330);
      room(...B,'EDIT BAY / 편집실','영상·이미지 편집 데스크','#ece0d2');
      for(let r=0;r<2;r++)for(let c=0;c<3;c++){const dx=B[0]+60+c*96,dy=Y+130+r*120;furniture('desk',dx,dy);furniture('office_chair',dx+30,dy+16);}
      furniture('printer',B[0]+290,Y+370);furniture('plant_small',B[0]+30,Y+370,'succulent');
      room(...C,'CREATIVE ALL-HANDS','팀 리뷰 · 무드보드','#f2e7dc');furniture('tv',C[0]+130,Y+92);furniture('poster',C[0]+50,Y+80);furniture('poster',C[0]+215,Y+80);
      art.drawRug(ctx,C[0]+20,Y+150,222,200,'#dab4a4',7);
      for(const [cx,cy,v] of [[50,190,'yellow'],[130,180,'red'],[210,190,'blue'],[60,290,'blue'],[200,290,'yellow']])furniture('beanbag',C[0]+cx,Y+cy,v);furniture('coffee_table',C[0]+130,Y+250);furniture('arcade',C[0]+230,Y+370);
    }else{
      room(...A,'RECEPTION / 리셉션','방문객 · 택배 수령','#dde6ea');furniture('sign',A[0]+184,Y+80);furniture('reception_desk',A[0]+184,Y+170);
      furniture('bench',A[0]+90,Y+300);furniture('bench',A[0]+280,Y+300);furniture('plant_tall',A[0]+30,Y+150,'monstera');furniture('plant_tall',A[0]+340,Y+150,'palm');furniture('clock',A[0]+300,Y+70);furniture('tv',A[0]+70,Y+92);
      room(...B,'OPEN DESKS / 공용 좌석','자유석 · 협업 데스크','#e2e9ec');
      for(let r=0;r<3;r++)for(let c=0;c<3;c++){const dx=B[0]+60+c*96,dy=Y+110+r*100;furniture('desk',dx,dy);furniture('office_chair',dx+30,dy+16);}
      room(...C,'TOWN KITCHEN','커피 · 간식 · 탁구','#e5ebe2');furniture('counter',C[0]+40,Y+110);furniture('microwave',C[0]+40,Y+108);furniture('counter_sink',C[0]+104,Y+110);furniture('coffee_machine',C[0]+160,Y+108);furniture('fridge',C[0]+222,Y+110);
      furniture('pingpong_table',C[0]+130,Y+220);furniture('cafe_table',C[0]+70,Y+330);furniture('cafe_chair',C[0]+42,Y+338,'right');furniture('vending_machine',C[0]+220,Y+330);
    }
    ctx.font='11px Pretendard, system-ui, sans-serif';for(const [l,lx,ly] of wingLabels){const w=ctx.measureText(l).width+14;rect(lx,ly,w,18,'#fffef5ee');rect(lx,ly+17,w,1,p.trim);text(l,lx+7,ly+13,11,'#3f5d50');}
    rect(30,Y+WING-12,1072,8,'#bfcec4');rect(30,Y+WING-12,1072,2,'#f6f7ef');
    if(night){rect(30,Y,978,WING-12,'#14243b25');ctx.save();ctx.beginPath();ctx.rect(30,Y,978,WING-12);ctx.clip();for(const x of [200,570,870])for(const yy of [120,300]){const g=ctx.createRadialGradient(x,Y+yy,5,x,Y+yy,110);g.addColorStop(0,'#ffdf9428');g.addColorStop(1,'#ffdf9400');ctx.fillStyle=g;ctx.fillRect(x-110,Y+yy-110,220,220);}ctx.restore();}
  }
  let light={},clock=0,elevatorFloor=1,band=null;
  function updateActor(a,dt,t){
    const rr=actorRuns(a),busy=rr.some(active);
    if(a.path.length){const p=a.path[0],dx=p.x-a.x,dy=p.y-a.y,d=Math.hypot(dx,dy),speed=p.elevator?180:65,step=speed*dt;
      a.dir=Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down';a.inLift=!!p.elevator;
      if(d<=step){a.x=p.x;a.y=p.y;a.path.shift();if(!a.path.length){a.phase=a.afterWalk||'desk';a.inLift=false;if(a.phase==='lounge'){
        a.until=t+7000;say(a,'작업 끝! 잠깐 커피 마실까요?');
        const friend=!a.socialReply&&[...actors.values()].find(b=>b.id!==a.id&&b.team===a.team&&!actorRuns(b).some(active)&&!b.path.length&&b.phase!=='lounge');
        if(friend){friend.path=[{x:friend.x,y:baseY(friend.team)+244},{x:772,y:baseY(friend.team)+244},{x:772,y:baseY(friend.team)+215}];friend.afterWalk='lounge';friend.phase='to-lounge';friend.until=t+10000;friend.socialReply=true;}
        if(a.socialReply){say(a,'좋아요. 잠깐 쉬고 다음 작업 준비해요.');a.socialReply=false;}
      }}}else{a.x+=dx/d*step;a.y+=dy/d*step;}
    }else if(a.phase==='lounge'&&t>a.until){const d=desk(a.team,a.room);a.path=[{x:a.x,y:baseY(a.team)+244},{x:d.x,y:baseY(a.team)+244},d];a.afterWalk='idle';a.phase='return';}
    const run=rr.find(active),pose=a.path.length?'walk':['lounge','meeting'].includes(a.phase)?'talk':busy?(run?.state==='awaiting_approval'?'raise_hand':run?.state==='disconnected'?'wait':'type'):'stand';
    if(band&&(a.y<band[0]||a.y>band[1]))return;
    if(a.inLift){elevatorFloor=teams[Math.max(0,Math.min(teams.length-1,Math.round((a.y-TOP-150)/STEP)))].floor;return;}
    const s=art.characterSprite({appearance:a.appearance,dir:a.path.length?a.dir:pose==='type'?'up':'down',pose,frame:reduced.matches?0:Math.floor(t/(pose==='walk'?140:pose==='type'?130:400))});sprite(s,a.x,a.y);
    if(selected===a.id){rect(a.x-17,a.y+3,34,2,'#609b7e');}
    text(a.name,a.x-27,a.y+17,9,'#486a59');
  }
  // Real AI-meeting lines (from the Codex session) get a wider, wrapped bubble with a speaker colour.
  function meetingBubble(a){
    const words=a.bubble.replace(/\s+/g,' '),lines=[];for(let i=0;i<words.length&&lines.length<3;i+=21)lines.push(words.slice(i,i+21));
    if(words.length>63)lines[2]=lines[2].slice(0,20)+'…';
    const w=196,h=10+lines.length*15,x=Math.max(35,Math.min(W-w-8,a.x-w/2)),y=a.y-62-h,team=teams.find(t=>t.id===a.team);
    rect(x+2,y+2,w,h,'#2d504026');rect(x,y,w,h,a.guest?'#284b42':'#fffef5');rect(x,y,3,h,a.guest?'#d6e6ba':a.speakColor||team.color);rect(a.x-3,y+h,6,4,a.guest?'#284b42':'#fffef5');
    lines.forEach((l,i)=>text(l,x+9,y+17+i*15,10,a.guest?'#eef4e6':'#3f5d50'));
  }
  function bubble(a,t){
    if(a.phase==='meeting'&&a.id!=='director'&&!a.aiMeet&&!a.review)return;
    if((a.aiMeet||a.review)&&t<a.bubbleUntil&&a.bubble&&!(band&&(a.y<band[0]||a.y>band[1]))){meetingBubble(a);return;}
    const rr=actorRuns(a),r=rr.find(active)||rr[0];let message=t<a.bubbleUntil?a.bubble:'';
    if(!message&&r&&active(r))message=`${states[r.state]} · ${r.label||r.skill}`;
    if(!message||a.inLift||band&&(a.y<band[0]||a.y>band[1]))return;
    message=message.replace(/\s+/g,' ');const short=message.length>27?message.slice(0,26)+'…':message,w=Math.min(224,Math.max(76,short.length*6.8)),x=Math.max(35,Math.min(W-w-8,a.x-w/2)),y=a.y-78;
    rect(x+2,y+2,w,24,'#2d504020');rect(x,y,w,24,r?.state==='failed'?'#fff0e7':'#fffef5');rect(x,y,w,1,'#d6e3d1');rect(a.x-3,y+24,6,4,'#fffef5');text(short,x+7,y+16,10,r?.state==='failed'?'#a65c47':'#55755d');
  }
  function frame(t){
    if(!open)return;
    if(document.hidden){last=t;raf=requestAnimationFrame(frame);return;}
    if(t-last<66){raf=requestAnimationFrame(frame);return;}
    const dt=Math.min(.1,(t-last)/1000);last=t;clock=reduced.matches?0:t;
    ctx.imageSmoothingEnabled=false;light=sky(clock);
    if(floorView==='all'){band=null;teams.forEach(team=>roomFloor(team,baseY(team.id)));}
    else{const team=teams[floorView],y=baseY(team.id);band=[y-20,y+300];ctx.save();ctx.translate(0,-detailOffset());roomFloor(team,y);wing(team,y);}
    [...actors.values()].sort((a,b)=>a.y-b.y).forEach(a=>updateActor(a,reduced.matches?5:dt,t));actors.forEach(a=>bubble(a,t));
    if(floorView!=='all')ctx.restore();
    root.querySelector('.vo-clock').textContent=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})+' · LOCAL';
    raf=requestAnimationFrame(frame);
  }
  const button=document.createElement('button');button.id='virtual-office-toggle';button.type='button';button.textContent='Virtual Office';button.setAttribute('aria-pressed','false');button.setAttribute('aria-controls','virtual-office');button.onclick=()=>toggle();
  document.querySelector('.hero-actions')?.prepend(button);
  window.addEventListener('studio-skill-runs',e=>{if(!demo)ingest(e.detail.runs);});
  window.addEventListener('resize',()=>{if(open)fit();});
  document.addEventListener('visibilitychange',()=>{if(open&&!document.hidden)refresh();});
  // AI meeting staging. Seats are spatial only; spoken lines come from the real meeting transcript.
  const meetingReps={lead:'director',strategy:'researcher',contents:'writer',operation:'operator'};
  const speakColors={lead:'#858da5',strategy:'#649d8a',contents:'#b49b6c',operation:'#7e9db7'};
  function meetingActor(speaker){
    if(speaker==='me')return actors.get('me');
    const preferred=actors.get(meetingReps[speaker]);if(preferred?.aiMeet)return preferred;
    return [...actors.values()].find(a=>a.aiMeet&&a.speaker===speaker)||preferred;
  }
  const aiMeeting={
    active:false,
    start(topic){
      mount();if(!open)toggle(true);if(meeting)gather(false);this.active=true;setFloorView(teams.findIndex(t=>t.id==='lead'));
      const seats=[{x:330,y:200},{x:470,y:200},{x:610,y:200},{x:750,y:200}],teamOrder=['lead','strategy','contents','operation'];
      teamOrder.forEach((team,i)=>{
        const own=actors.get(meetingReps[team]);
        const a=own&&!own.review&&!actorRuns(own).some(active)?own:[...actors.values()].find(x=>x.team===team&&!x.guest&&!x.review&&!actorRuns(x).some(active));
        if(!a)return;a.aiMeet=true;a.speaker=team;a.speakColor=speakColors[team];a.meetingHome={team:a.team,room:a.room};
        walk(a,'lead',1,'meeting',{x:seats[i].x,y:baseY('lead')+seats[i].y});
      });
      let me=actors.get('me');if(!me){me=makeActor('me','나 (대표)','lead',1);me.guest=true;}
      Object.assign(me,{aiMeet:true,speaker:'me',x:540,y:baseY('lead')+244,path:[],phase:'meeting'});
      feed.unshift({name:'AI 회의',text:'회의 시작 · '+String(topic||'').slice(0,40),time:new Date().toISOString()});feed=feed.slice(0,24);renderPanels();
    },
    say(speaker,line){
      const a=meetingActor(speaker);if(!a)return false;
      a.bubble=String(line||'').slice(0,200);a.bubbleUntil=performance.now()+9000;
      feed.unshift({name:speaker==='me'?'나 (대표)':a.name,text:String(line||'').slice(0,80),time:new Date().toISOString()});feed=feed.slice(0,24);if(open)renderPanels();return true;
    },
    end(){
      this.active=false;actors.delete('me');
      for(const a of actors.values())if(a.aiMeet){a.aiMeet=false;a.bubble='';if(a.meetingHome){const home=a.meetingHome;a.meetingHome=null;walk(a,home.team,home.room,'idle');}}
      if(open)renderPanels();
    }
  };
  // AI review staging on 5F. Seats are spatial only; lines come from the real review sessions or the user.
  const reviewPrefs={'전략':['analyst','researcher'],'고객':['customer','researcher'],'콘텐츠':['designer','writer'],'채널 운영':['operator','search'],'브랜드':['researcher','analyst'],'성과 분석':['metrics','search']};
  const reviewColors={'전략':'#649d8a','고객':'#5d8fa8','콘텐츠':'#b49b6c','채널 운영':'#7e9db7','브랜드':'#9a7fa8','성과 분석':'#8a9a5b'};
  const hall={
    active:false,cast:{},
    get index(){return teams.findIndex(t=>t.id==='hall');},
    focus(){mount();if(!open)toggle(true);setFloorView(this.index);},
    start(perspectives){
      mount();if(!open)toggle(true);this.end();this.active=true;
      const free=x=>x&&!x.guest&&!x.aiMeet&&!x.review&&!actorRuns(x).some(active);
      const pick=prefs=>prefs.map(id=>actors.get(id)).find(free)||[...actors.values()].find(free);
      const seat=(a,key,spot,color)=>{a.review=key;a.speakColor=color;a.meetingHome={team:a.team,room:a.room};walk(a,'hall',1,'meeting',{x:spot.x,y:baseY('hall')+spot.y});this.cast[key]=a.id;};
      const presenter=pick(['builder','writer','designer']);if(presenter)seat(presenter,'presenter',{x:846,y:214},'#b49b6c');
      const row=[{x:430,y:236},{x:500,y:236},{x:570,y:236},{x:640,y:236},{x:465,y:262},{x:535,y:262}];
      perspectives.forEach((p,i)=>{const a=pick(reviewPrefs[p]||[]);if(a)seat(a,'r'+i,row[i%row.length],reviewColors[p]||'#858da5');});
      let me=actors.get('me-review');if(!me){me=makeActor('me-review','나 (대표)','hall',1);me.guest=true;}
      Object.assign(me,{review:'me',x:720,y:baseY('hall')+262,path:[],phase:'meeting',team:'hall'});this.cast.me='me-review';
      setFloorView(this.index);renderPanels();
      return Object.fromEntries(Object.entries(this.cast).map(([k,id])=>[k,actors.get(id)?.name||'']));
    },
    say(key,line){const a=actors.get(this.cast[key]);if(!a)return false;a.bubble=String(line||'').slice(0,200);a.bubbleUntil=performance.now()+9000;
      feed.unshift({name:key==='me'?'나 (대표)':a.name,text:String(line||'').slice(0,80),time:new Date().toISOString()});feed=feed.slice(0,24);if(open)renderPanels();return true;},
    screen(node){mount();const el=root.querySelector('.vo-hall-screen');el.replaceChildren(...(node?[node]:[]));el.hidden=!node;placeHall();},
    end(){this.active=false;actors.delete('me-review');this.cast={};
      for(const a of actors.values())if(a.review){a.review=null;a.bubble='';if(a.meetingHome){const home=a.meetingHome;a.meetingHome=null;walk(a,home.team,home.room,'idle');}}
      if(open)renderPanels();}
  };
  window.VirtualOffice={toggle,clear,preview,aiMeeting,hall,isOpen:()=>open,setFloorView:v=>{mount();setFloorView(v);}};
})();
