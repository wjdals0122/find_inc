// LOCAL PREVIEW ONLY: scripted sample review (품평회) layered over the meeting preview mock.
// Never loaded by dashboard.html. Every line is labelled [샘플] and nothing runs on a PC.
(() => {
  const base=window.HappierCloud;if(!base||window.HappierCloud.__review)return;
  const root='C:\\Users\\M123\\Desktop\\find-inc';
  const art={briefs:[{id:'brief:1',kind:'brief',brand:'BMW',product:'더뉴 BMW X5 G65',label:'BMW · 더뉴 BMW X5 G65 마케팅 브리핑',path:root+'\\01-strategy\\brief\\BMW\\X5',files:['brief.md','marketing_messages.md'],modified:3}],
    images:[{id:'image:1',kind:'image',brand:'BMW',product:'더뉴 BMW X5 G65',label:'BMW · 더뉴 BMW X5 G65 · ads-1',path:root+'\\02-contents\\ad-images\\BMW\\X5\\ads-1',modified:2}],
    videos:[{id:'video:1',kind:'video',brand:'BMW',product:'더뉴 BMW X5 G65',label:'BMW · 더뉴 BMW X5 G65 · ads-3',path:root+'\\02-contents\\ad-videos\\BMW\\X5\\ads-3',modified:1}]};
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="100%" height="100%" fill="#1d2433"/><text x="72" y="300" fill="#fff" font-size="120" font-family="sans-serif">400마력</text><text x="72" y="430" fill="#9fb4d9" font-size="64" font-family="sans-serif">0~100km/h 5.3초</text><rect x="72" y="560" width="936" height="520" fill="#2f3a52"/><text x="72" y="1200" fill="#fff" font-size="48" font-family="sans-serif">[샘플] BMW X5 40 xDrive</text></svg>';
  const b64=t=>btoa(String.fromCharCode(...new TextEncoder().encode(t)));
  const script=[['presenter',-1,'[샘플] 첫 이미지는 400마력과 5.3초를 상단에 크게 배치했습니다.'],['presenter',-1,'[샘플] 브리프의 핵심 고객인 성능 비교형 구매자를 겨냥합니다.'],['reviewer',0,'[샘플] 브리프 목표와 잘 맞고 공식 수치 근거가 명확합니다.'],['reviewer',0,'[샘플] 경쟁 SUV 대비 차별점이 한 줄 더 있으면 좋겠습니다.'],['reviewer',1,'[샘플] 조건 문구가 작아 모바일에서 읽기 어렵습니다.'],['reviewer',2,'[샘플] 카피 톤은 자연스럽고 CTA가 분명합니다.'],['reviewer',3,'[샘플] 인스타그램 4:5 비율에 맞춰 여백을 줄여보세요.'],['presenter',-1,'[샘플] 조건 문구를 키우고 4:5 버전을 추가하겠습니다.']];
  let r=null,tick=0;
  const view=()=>{const lines=[];let n=Math.min(script.length,tick);for(let i=0;i<n;i++){const [speaker,reviewer,text]=script[i];lines.push({id:'s'+i,speaker,reviewer,text});}(r.mine||[]).forEach(m=>lines.splice(Math.min(lines.length,m.at),0,m.line));
    if(r.ended&&tick>r.endTick+2)lines.push({id:'end',speaker:'presenter',reviewer:-1,text:'[샘플] 결론: 조건 문구 확대, 4:5 버전 추가.'});return lines;};
  const pub=()=>({...r,timeline:view(),sessions:[{role:'presenter',sessionId:'preview-presenter'}]});
  window.HappierCloud={...base,__review:true,async api(owner,path,body){
    if(path==='review-artifacts'){await new Promise(x=>setTimeout(x,300));return window.__reviewEmpty?{briefs:[],images:[],videos:[]}:art;}
    if(path==='reviews'&&!body)return {reviews:r?[{id:r.id,topic:r.topic,state:r.state}]:[]};
    if(path==='reviews'&&body){r={id:body.requestId,topic:body.topic,items:body.items,presenter:body.presenter,reviewers:body.reviewers,state:'checking',stage:'presenting',progress:'[샘플] 발표자 세션 준비 중',mine:[],ended:false,createdAt:new Date().toISOString()};tick=0;return pub();}
    if(path==='review-folder'){const kind=String(body.path).includes('ad-images')?'image':String(body.path).includes('ad-videos')?'video':'brief';
      return {files:kind==='brief'?[{name:'X5/brief.md',path:body.path+'\\brief.md',type:'text',size:900}]:[{name:'ads/sample-ad.svg',path:body.path+'\\sample-ad.svg',type:'image',size:800},{name:'ads/ads.md',path:body.path+'\\ads.md',type:'text',size:500}]};}
    if(/^reviews\/[^/]+\/file$/.test(path)){return {content:String(body.path).endsWith('.svg')?b64(svg):b64('# [샘플] 산출물 문서\n\n| 항목 | 내용 |\n|---|---|\n| 후킹 메시지 | 400마력, 0~100km/h 5.3초 |\n\n- 상단 25%에 수치를 크게 둡니다.\n- 하단에 조건 문구를 표시합니다.')};}
    if(/^reviews\/[^/]+\/say$/.test(path)){r.mine.push({at:Math.min(script.length,tick),line:{id:'me'+r.mine.length,speaker:'me',text:body.text}});return pub();}
    if(/^reviews\/[^/]+\/end$/.test(path)){r.ended=true;r.endTick=tick;r.state='closing';r.progress='[샘플] 발표자가 docs/에 정리하는 중';return pub();}
    if(/^reviews\/[^/]+$/.test(path)){tick++;
      if(r.ended){if(tick>r.endTick+2){r.state='completed';r.progress='[샘플] 품평회 종료';r.summary='[샘플] docs/reviews/sample.md · 프리뷰는 저장하지 않습니다.';}}
      else{const t=Math.min(script.length,tick);r.state=t<=2?'presenting':t<7?'reviewing':t<8?'answering':'open';r.progress=r.state==='reviewing'?`[샘플] ${r.reviewers[Math.min(r.reviewers.length-1,script[Math.min(t,7)][1])]?.perspective||'평가'} 관점 피드백 중`:'[샘플] '+r.state;}
      return pub();}
    return base.api(owner,path,body);
  }};
})();
