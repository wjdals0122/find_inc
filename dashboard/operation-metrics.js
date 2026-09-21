(() => {
  'use strict';
  const channels = [
    {id:'youtube',name:'YouTube',letter:'Y',color:'#f17c70',metrics:[['views','조회수','회'],['estimatedMinutesWatched','시청 시간','분']],zone:'미국 태평양 시간'},
    {id:'instagram',name:'Instagram',letter:'I',color:'#bd9bf6',metrics:[['views','조회수','회'],['reach','도달','계정']],zone:'수집 데이터 기준'},
    {id:'google-search',name:'Search Console',letter:'G',color:'#73baa1',metrics:[['impressions','노출수','회'],['clicks','클릭수','회']],zone:'미국 태평양 시간'}
  ];
  let host, controller, revision=0, data=null, error='', selected='youtube', account='all', loading=false;
  const kstDate = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const add = (day,n) => new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
  let end=add(kstDate(),-1), start=add(end,-6);
  const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = n => new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(n);
  const stamp = s => s ? new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+' KST' : '수집 기록 없음';
  const days = () => {const out=[];for(let d=start;d<=end;d=add(d,1))out.push(d);return out;};
  const rows = channel => (data?.rows||[]).filter(r=>r.channel===channel && r.metric_date>=start && r.metric_date<=end && (account==='all'||r.account_id===account));
  const latest = list => list.reduce((s,r)=>!s||r.collected_at>s?r.collected_at:s,'');
  function points(channel,metric) {
    const list=rows(channel).filter(r=>r.metric_name===metric);
    return days().map(day=>{const found=list.filter(r=>r.metric_date===day);return {day,value:found.length?found.reduce((n,r)=>n+Number(r.metric_value),0):null};});
  }
  function chart(series,color,label,unit) {
    const w=640,h=180,left=40,right=18,top=20,bottom=32,values=series.filter(p=>p.value!==null);
    if(!values.length)return `<div class="op-chart-empty"><span class="op-empty-orbit" aria-hidden="true"></span><strong>아직 저장된 지표가 없습니다</strong><p>수집된 데이터가 들어오면 날짜별 추이가 표시됩니다.</p></div>`;
    const max=Math.max(1,...values.map(p=>p.value)),x=i=>left+i*(w-left-right)/Math.max(1,series.length-1),y=v=>h-bottom-v/max*(h-top-bottom);
    let path='',connected=false;
    series.forEach((p,i)=>{if(p.value===null){connected=false;return;}path+=(connected?' L':' M')+x(i)+','+y(p.value);connected=true;});
    return `<svg class="op-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)} 날짜별 추이. 단위 ${unit}. 누락 날짜는 선을 연결하지 않습니다.">
      ${[0,.5,1].map(f=>`<line class="op-gridline" x1="${left}" y1="${y(max*f)}" x2="${w-right}" y2="${y(max*f)}"/><text x="0" y="${y(max*f)+4}">${number(max*f)}</text>`).join('')}
      <path class="op-trace" d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
      ${series.map((p,i)=>p.value===null?`<path d="M${x(i)-3},${h-bottom}h6" stroke="var(--muted)" opacity=".35"/>`:`<circle cx="${x(i)}" cy="${y(p.value)}" r="4" fill="${color}" stroke="var(--panel)" stroke-width="2"><title>${p.day} · ${number(p.value)} ${unit}</title></circle>`).join('')}
      ${[...new Set([0,Math.floor((series.length-1)/2),series.length-1])].map(i=>`<text text-anchor="middle" x="${x(i)}" y="${h-7}">${series[i].day.slice(5).replace('-','/')}</text>`).join('')}
    </svg>`;
  }
  function render() {
    if(!host?.isConnected)return;
    const list=rows(selected),channel=channels.find(c=>c.id===selected),dates=days();
    const accounts=[...new Set((data?.rows||[]).filter(r=>r.channel===selected).map(r=>r.account_id))];
    const covered=new Set(list.map(r=>r.metric_date)).size;
    host.innerHTML=`<section class="op-workspace" aria-label="채널 운영 성과" aria-busy="${loading}">
      <div class="op-hero">
        <div class="op-hero-copy"><p class="op-eyebrow"><span></span> OPERATION / CHANNEL INTELLIGENCE</p><h2>작은 움직임에서,<br><em>다음 성장까지.</em></h2><p>채널마다 다른 신호를 한곳에서 읽으세요.<br>수집된 숫자와 비어 있는 날짜까지, 있는 그대로.</p><div class="op-hero-bottom"><span>03 CHANNELS</span><i></i><span>ONE CONNECTED VIEW</span></div></div>
        <div class="op-orbits" aria-hidden="true"><div class="op-orbit op-orbit-a"><b>Y</b></div><div class="op-orbit op-orbit-b"><b>I</b></div><div class="op-orbit op-orbit-c"><b>G</b></div><div class="op-core"><span>FIND.</span><small>IN MOTION</small></div><div class="op-cross">+</div></div>
      </div>
      <form class="op-toolbar"><div class="op-periods" aria-label="기간 선택">${[7,14,30].map(n=>`<button type="button" data-period="${n}" class="${start===add(end,-n+1)?'active':''}" aria-pressed="${start===add(end,-n+1)}">${n}일</button>`).join('')}</div><div class="op-date-fields"><label><span class="sr-only">시작 날짜</span><input type="date" name="start" value="${start}" required max="${end}"></label><span>—</span><label><span class="sr-only">종료 날짜</span><input type="date" name="end" value="${end}" required max="${kstDate()}"></label><button type="submit" class="op-apply">적용</button></div><button type="button" class="op-refresh" ${loading?'disabled':''}><span class="${loading?'op-spin':''}" aria-hidden="true">↻</span> ${loading?'불러오는 중':'새로고침'}</button></form>
      <div class="op-source" role="status"><span class="op-status-dot ${error?'error':''}"></span><span>${error?esc(error):!data?'저장된 성과를 불러오고 있습니다.':data.mode==='live'?'Supabase 실시간 조회':'Supabase 저장 데이터 · 스냅샷'}${data?.mode==='snapshot'?` · ${stamp(data.exported_at)} 기준`:''}</span>${data?`<span class="op-source-right">화면 조회 ${stamp(data.fetched_at)}</span>`:''}</div>
      ${data?.mode==='snapshot'?'<p class="op-notice">현재는 DB에서 가져온 스냅샷을 표시합니다. 새로고침은 최신 로컬 스냅샷을 다시 읽습니다.</p>':''}
      <div class="op-channels" role="group" aria-label="채널 선택">${channels.map((c,i)=>{const count=rows(c.id).length;return `<button type="button" class="op-channel ${selected===c.id?'selected':''}" data-channel="${c.id}" aria-pressed="${selected===c.id}" style="--channel:${c.color};--order:${i}"><div class="op-channel-top"><span class="op-channel-logo">${c.letter}</span><span class="op-channel-name">${c.name}</span><span class="op-channel-arrow" aria-hidden="true">↗</span></div><div class="op-channel-bottom"><span>${count?'저장 데이터 있음':'저장 데이터 없음'}</span><b>${count?new Set(rows(c.id).map(r=>r.metric_date)).size+'일':'—'}</b></div></button>`;}).join('')}</div>
      <div class="op-section-head"><div><p class="op-eyebrow">DAILY PERFORMANCE</p><h3>${channel.name} <span>날짜별 추이</span></h3></div><label class="op-account"><span class="sr-only">계정 선택</span><select>${accounts.length>1?'<option value="all">모든 계정</option>':''}${accounts.length?accounts.map(a=>`<option value="${esc(a)}" ${account===a?'selected':''}>${esc(a)}</option>`).join(''):'<option>연결된 저장 계정 없음</option>'}</select></label></div>
      <div class="op-metrics">${channel.metrics.map(([key,label,unit],i)=>{const series=points(selected,key),valid=series.filter(p=>p.value!==null),total=valid.reduce((n,p)=>n+p.value,0);return `<article class="op-metric" style="--order:${i}"><div class="op-metric-top"><h4>${label}</h4><span>${valid.length}/${dates.length}일 제공</span></div><div class="op-number">${valid.length?number(total):'—'}<small>${unit}</small></div><p class="op-metric-note">${valid.length?'제공된 날짜 합계':'기간 내 저장 데이터 없음'}${key==='reach'?' · 일별 도달 합계, 기간 순도달과 다름':''}</p>${chart(series,i?'#8d9ac8':channel.color,label,unit)}</article>`;}).join('')}</div>
      <div class="op-detail-grid"><article class="op-coverage"><div class="op-metric-top"><h4>수집 커버리지</h4><span>${covered} / ${dates.length}일</span></div><div class="op-day-strip">${dates.map(d=>`<div class="${list.some(r=>r.metric_date===d)?'collected':''}" title="${d}: ${list.some(r=>r.metric_date===d)?'저장 데이터 있음':'미제공'}"><span></span><small>${dates.length<=14?d.slice(8):''}</small></div>`).join('')}</div><p><i></i> 저장 데이터 있음 <i class="missing"></i> 미제공</p><small>미제공 날짜는 0으로 계산하지 않습니다.</small></article><article class="op-collection"><p class="op-eyebrow">LAST COLLECTED</p><strong>${stamp(latest(list))}</strong><p>지표 수집 시각 · ${channel.zone}</p><small>새로고침은 저장 데이터 조회이며 채널 API 수집을 실행하지 않습니다.</small></article></div>
      <details class="op-data-table"><summary>날짜별 원본 지표 <span>${list.length}개 저장 행</span></summary><div class="op-table-scroll"><table><caption class="sr-only">${channel.name} 날짜별 성과와 수집 시각</caption><thead><tr><th>날짜</th>${channel.metrics.map(m=>`<th>${m[1]} (${m[2]})</th>`).join('')}<th>수집 시각 (KST)</th></tr></thead><tbody>${dates.map(d=>`<tr><th>${d}</th>${channel.metrics.map(([key])=>{const p=points(selected,key).find(p=>p.day===d);return `<td>${p.value===null?'미제공':number(p.value)}</td>`;}).join('')}<td>${stamp(latest(list.filter(r=>r.metric_date===d)))}</td></tr>`).join('')}</tbody></table></div></details>
      <footer class="op-footer"><span>FIND.INC / OPERATION</span><span>${start} — ${end} · 서비스별 집계 시간대 적용</span></footer>
    </section>`;
    host.querySelectorAll('[data-channel]').forEach(b=>b.onclick=()=>{selected=b.dataset.channel;account='all';render();});
    host.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{start=add(end,-Number(b.dataset.period)+1);refresh();});
    host.querySelector('.op-account select').onchange=e=>{account=e.target.value;render();};
    host.querySelector('.op-refresh').onclick=refresh;
    host.querySelector('form').onsubmit=e=>{e.preventDefault();const fields=new FormData(e.target),a=fields.get('start'),b=fields.get('end');if(a>b||Date.parse(b)-Date.parse(a)>365*86400000){error='기간은 시작일부터 최대 366일까지 선택해주세요.';render();return;}start=a;end=b;refresh();};
  }
  async function refresh() {
    controller?.abort();controller=new AbortController();const run=++revision;loading=true;error='';render();
    try {
      const {getSession}=await import('./auth-session.js');
      const {auth}=await getSession();
      if(!auth.currentUser)throw Error('로그인 후 성과를 확인해주세요.');
      const token=await auth.currentUser.getIdToken();
      const response=await fetch(`/api/channel-metrics?start=${start}&end=${end}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error(response.status===401?'로그인이 만료되었습니다. 다시 로그인해주세요.':response.status===404?'이 사이트에 성과 조회 서버가 아직 연결되지 않았습니다.':'성과 데이터를 조회하지 못했습니다. 잠시 후 다시 시도해주세요.');
      const body=await response.json();if(!Array.isArray(body.rows))throw Error('올바른 성과 응답이 아닙니다.');
      if(run!==revision)return;data=body;
    } catch(e) {if(run===revision&&e.name!=='AbortError'){data=null;error=e.message;}}
    finally{if(run===revision){loading=false;render();}}
  }
  window.OperationMetrics={mount(el){host=el;data=null;refresh();},unmount(){revision++;controller?.abort();host=null;},clear(){this.unmount();data=null;account='all';}};
})();
