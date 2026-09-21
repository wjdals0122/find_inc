// LOCAL PREVIEW ONLY: scripted sample meeting so the UI can be reviewed without a Happier/Codex session.
// Never loaded by dashboard.html. All lines below are sample text, not agent output.
(() => {
  if(window.HappierCloud)return;
  window.AI_MEETING_PREVIEW_OWNER='preview';
  const script=[
    ['lead','[샘플] 주제를 정리하고 팀별 의견부터 듣겠습니다.'],
    ['strategy','[샘플] 30대 직장인 타깃의 구매 이유를 먼저 정리하죠.'],
    ['contents','[샘플] 그 근거로 숏폼 3편과 상세페이지 카피를 준비할게요.'],
    ['operation','[샘플] 유튜브와 검색 유입 지표로 2주 뒤 효과를 보겠습니다.'],
    ['lead','[샘플] 대표님, 우선순위 의견 주시겠어요?']
  ];
  let m=null,tick=0,said=[];
  const now=()=>new Date().toISOString();
  function view(){const lines=script.slice(0,Math.min(script.length,tick)).map(([speaker,text],i)=>({id:'s'+i,speaker,text}));
    said.forEach((s,i)=>{lines.push({id:'me'+i,speaker:'me',text:s});if(tick>script.length+i*2+1)lines.push({id:'r'+i,speaker:['strategy','contents','operation'][i%3],text:'[샘플] 대표님 의견 반영해 계획을 조정하겠습니다.'});});
    if(m.ended&&tick>m.endTick+2){lines.push({id:'end1',speaker:'lead',text:'[샘플] 결론: 숏폼 우선, 2주 뒤 지표 리뷰.'},{id:'end2',speaker:'result',text:'[샘플] docs/meetings/sample.md · 커밋 없음(프리뷰)'});}
    return lines;}
  window.HappierCloud={clear(){},async api(owner,path,body){
    await new Promise(r=>setTimeout(r,250));
    if(path==='connection')return {ready:true,machine:'PREVIEW',models:[{id:'sample-model',label:'샘플 모델',efforts:['medium'],defaultEffort:'medium'}]};
    if(path==='meetings'&&body){m={id:body.requestId,topic:body.topic,state:'creating',progress:'[샘플] 회의 세션 생성 중',sessionId:'preview-session',createdAt:now(),ended:false};tick=0;said=[];return {...m,utterances:[]};}
    if(path.endsWith('/say')){said.push(body.text);m.state='speaking';return {...m,utterances:[...view(),{id:'pending',speaker:'me',text:body.text,pending:true}]};}
    if(path.endsWith('/end')){m.ended=true;m.endTick=tick;m.state='summarizing';m.progress='[샘플] 팀장이 정리 중';return {...m,utterances:view()};}
    if(path.startsWith('meetings/')){tick++;
      if(m.ended&&tick>m.endTick+2){m.state='completed';m.progress='[샘플] 회의 종료';m.summary='[샘플] docs/meetings/sample.md · 프리뷰는 저장·push하지 않습니다.';}
      else if(!m.ended){m.state=tick>=script.length?'listening':'speaking';m.progress=m.state==='listening'?'[샘플] 대표 의견 대기':'[샘플] 논의 중';}
      return {...m,utterances:view()};}
    throw Error('preview: unsupported '+path);
  }};
})();
