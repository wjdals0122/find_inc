const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.OFFICE_BASE||'http://127.0.0.1:8000';
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1540,height:1040}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.route('**/habblaud-art.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+'\nHabblaudArt={...HabblaudArt};'});});
  await page.clock.install();await page.goto(base+'/virtual-office-preview.html');await page.waitForTimeout(1500);
  assert(await page.locator('#virtual-office').isVisible());assert.equal(await page.locator('.vo-person').count(),10);
  assert((await page.locator('.vo-connection').innerText()).includes('실제 실행 아님'));
  await page.locator('[data-actor="researcher"]').click();assert.equal(await page.locator('.vo-task').count(),2,'same agent groups simultaneous sessions');
  await page.locator('#vo-weather').selectOption('rain');await page.locator('#vo-day').selectOption('day');
  await page.screenshot({path:path.resolve(__dirname,'../../.private/office-desktop.png')});
  await page.locator('#virtual-office-toggle').click();assert(await page.locator('#virtual-office').isHidden());
  await page.evaluate(()=>{VirtualOffice.clear();VirtualOffice.toggle(true)});
  const send=async runs=>page.evaluate(runs=>window.dispatchEvent(new CustomEvent('studio-skill-runs',{detail:{runs}})),runs);
  const t=new Date().toISOString();const a={id:'test-1',agentId:'shared-worker',agentName:'통합 에이전트',skill:'brand',label:'실제 형태 테스트',state:'running',progress:'자료 확인',sessionId:'session-1',createdAt:t};
  await send([a,{...a,id:'test-2',sessionId:'session-2'}]);await page.locator('[data-actor="shared-worker"]').click();assert.equal(await page.locator('.vo-task').count(),2);assert.equal(await page.locator('[data-actor="shared-worker"]').count(),1);
  await send([{...a,id:'test-2',state:'failed',result:'<img src=x onerror=alert(1)>검증 오류'}]);assert((await page.locator('.vo-detail').innerText()).includes('검증 오류'));assert.equal(await page.locator('.vo-detail img').count(),0,'results are escaped');
  await page.evaluate(()=>{window.officePoses=[];const original=HabblaudArt.characterSprite;HabblaudArt.characterSprite=r=>{if(!officePoses.includes(r.pose))officePoses.push(r.pose);return original(r)};});
  await send([{...a,state:'completed',result:'완료 응답'}]);assert((await page.locator('.vo-detail').innerText()).includes('완료 응답'));
  // Exercise walking, lounge conversation and return without wall-clock waits.
  await page.clock.runFor(55000);assert(await page.locator('#virtual-office canvas').isVisible());
  assert(await page.evaluate(()=>['walk','talk','stand'].every(p=>officePoses.includes(p))),'completion walks, talks and returns: '+JSON.stringify({poses:await page.evaluate(()=>officePoses),errors}));
  for(const width of [390,320,820]){await page.setViewportSize({width,height:844});await page.waitForTimeout(100);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no document overflow '+width);assert(await page.locator('#virtual-office-toggle').isVisible());}
  await page.screenshot({path:path.resolve(__dirname,'../../.private/office-mobile.png')});
  await page.evaluate(()=>VirtualOffice.clear());assert(await page.locator('#virtual-office').isHidden());
  await page.evaluate(()=>{document.body.dataset.authState='checking';VirtualOffice.toggle(true)});assert(await page.locator('#virtual-office').isHidden(),'signed-out office cannot open');
  // Real dashboard shell and SkillsPanel with a controlled authenticated Cloud adapter.
  const live=await browser.newPage({viewport:{width:1440,height:1000}});live.on('pageerror',e=>errors.push(e.message));
  await live.route('**/auth-session.js',r=>r.fulfill({contentType:'text/javascript',body:`export async function getSession(){return {auth:{currentUser:{uid:'office-test',email:'test@example.invalid'}},sdk:{onAuthStateChanged:(auth,cb)=>queueMicrotask(()=>cb(auth.currentUser)),signOut:async()=>{}}}}`}));
  await live.route('**/happier-cloud.js',r=>r.fulfill({contentType:'text/javascript',body:`window.testCloudCalls=[];window.testRun={id:'cloud-1',skill:'brand',label:'Cloud test',state:'running',progress:'진행 응답',createdAt:new Date().toISOString(),sessionId:'cloud-session'};window.HappierCloud={clear(){},async api(owner,path){testCloudCalls.push(path);if(path==='history')return {runs:[testRun]};if(path.startsWith('runs/'))return testRun;return {skills:[],models:[],defaults:{}}}};`}));
  await live.goto(base+'/dashboard.html');await live.waitForFunction(()=>document.body.dataset.authState==='authenticated');
  await live.locator('#virtual-office-toggle').click();await live.waitForFunction(()=>document.querySelector('.vo-task')?.textContent.includes('Cloud test'));
  assert(await live.evaluate(()=>testCloudCalls.includes('runs/cloud-1')),'office polls active sessions while skill dialog is closed');
  await live.evaluate(()=>{testRun={...testRun,state:'failed',result:'연결 오류 테스트'};return SkillsPanel.officeRefresh()});assert((await live.locator('.vo-detail').innerText()).includes('연결 오류 테스트'));
  await live.screenshot({path:path.resolve(__dirname,'../../.private/office-integrated.png')});
  for(const width of [390,320]){await live.setViewportSize({width,height:844});assert(await live.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'dashboard office no overflow '+width);assert(await live.locator('#virtual-office-toggle').isVisible());}
  await live.evaluate(()=>SkillsPanel.clear());assert(await live.locator('#virtual-office').isHidden());assert.equal(await live.locator('.vo-task').count(),0);
  await live.close();assert.deepEqual(errors,[]);console.log('PASS: preview, toggle, agent/session grouping, progress/results/errors, escaping, walk/talk/return, responsive layout, authenticated SkillsPanel polling and logout clearing');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
