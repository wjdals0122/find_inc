const {chromium}=require('playwright');
const assert=require('node:assert/strict');
// AI 품평회 UI checks against the local preview's scripted sample transport. No Codex session is created.
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);if(process.env.DBG)console.log('PAGEERROR',String(e.stack).slice(0,900));});
 const base=process.env.OFFICE_BASE||'http://127.0.0.1:8000';
 const on5F=()=>page.evaluate(()=>[...document.querySelectorAll('[data-actor] small')].filter(s=>s.textContent.startsWith('5F')).length);
 try{
  await page.goto(base+'/virtual-office-preview.html');await page.locator('.vo-floor-pill[data-view="0"]').waitFor();
  assert.equal((await page.locator('.vo-floor-pill[data-view="0"]').innerText()).trim(),'5F 대강당','auditorium is its own floor');
  await page.locator('.vo-floor-pill[data-view="0"]').click();
  await page.locator('#rv-setup[open]').waitFor();
  assert.equal(await page.locator('#virtual-office').getAttribute('data-floor-view'),'5F');
  await page.locator('[data-item]').first().waitFor();
  assert.equal(await page.locator('[data-item]').count(),3,'brief, ad image and ad video are offered');
  for(const t of ['마케팅 브리핑','광고 이미지','광고 영상'])assert((await page.locator('.rv-groups').innerText()).includes(t));
  assert.equal(await page.locator('.rv-row').count(),5,'presenter + 4 reviewers by default');
  await page.locator('#rv-count').selectOption('2');assert.equal(await page.locator('.rv-row').count(),3,'agent count changes rows');
  await page.locator('#rv-count').selectOption('4');
  assert.equal(await page.locator('#rv-r0-model').count(),1);assert.equal(await page.locator('#rv-r0-effort').count(),1,'each agent has model and effort');
  await page.locator('#rv-r3-persp').selectOption('채널 운영');
  assert(await page.locator('.rv-form [type=submit]').isDisabled(),'start needs a topic and an artifact');
  await page.locator('#rv-topic').fill('<img src=x onerror="window.pwned=1"> X5 광고 품평');
  await page.locator('[data-item="image:1"]').check();await page.locator('[data-item="brief:1"]').check();
  await page.locator('.rv-form [type=submit]').click();
  await page.locator('#rv-panel .aim-log').waitFor();
  assert(await page.locator('#rv-setup[open]').count()===0,'popup closes after start');
  assert((await page.locator('#rv-title').innerText()).includes('<img'));assert.equal(await page.evaluate(()=>window.pwned),undefined,'topic is escaped');
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-actor] small')].filter(s=>s.textContent.startsWith('5F')).length>=5,null,{timeout:15000});
  assert.equal(await page.locator('[data-actor="me-review"]').count(),0,'the user is not listed as an agent');
  await page.locator('.vo-hall-screen .rv-doc').waitFor({timeout:15000});
  assert((await page.locator('.vo-hall-screen .rv-doc').innerText()).includes('후킹 메시지'),'marketing brief renders on the screen');
  await page.locator('.rv-chip').nth(1).click();await page.locator('.vo-hall-screen img').waitFor({timeout:15000});
  assert(await page.locator('.vo-hall-screen').isVisible(),'selected ad image is on the hall screen');
  await page.locator('.vo-hall-screen [data-expand]').click();assert(await page.locator('.rv-screen.expanded').isVisible());await page.locator('.vo-hall-screen [data-expand]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#rv-panel .aim-line').length>=4,null,{timeout:30000});
  const log=await page.locator('#rv-panel .aim-log').innerText();assert(log.includes('발표자')&&log.includes('전략'),'presentation then perspective feedback');
  await page.waitForFunction(()=>document.querySelector('.vo-feed-items')?.textContent.includes('[샘플]'),null,{timeout:20000});
  await page.locator('#rv-say').fill('조건 문구 크기를 꼭 반영해주세요');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>[...document.querySelectorAll('#rv-panel .aim-line.me p')].some(p=>p.textContent==='조건 문구 크기를 꼭 반영해주세요'));
  assert((await page.locator('.vo-feed-items').innerText()).includes('조건 문구 크기를'),'my line appears as an office speech entry');
  // Reloading auth keeps the running review: the hall shows the existing session instead of a new setup.
  await page.evaluate(()=>{document.body.dataset.authState='signed-out';});await page.waitForTimeout(50);
  await page.evaluate(()=>{document.body.dataset.authState='authenticated';});
  await page.waitForFunction(()=>window.AIReview.review);
  await page.locator('.vo-hall-cta').click();await page.locator('.rv-resume-btn').waitFor();
  assert((await page.locator('#rv-setup-title').innerText()).includes('진행 중인 품평회'));
  await page.locator('.rv-resume-btn').click();await page.locator('#rv-panel .aim-line').first().waitFor();
  assert(await page.locator('#rv-panel .aim-line').count()>=4,'existing session is shown to continue');
  await page.locator('.rv-end').click();
  await page.waitForFunction(()=>document.querySelector('#rv-panel .aim-summary')?.textContent.includes('docs/reviews'),null,{timeout:25000});
  assert.equal((await page.locator('#rv-panel .aim-status strong').innerText()).trim(),'품평회 종료');
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-actor] small')].filter(s=>s.textContent.startsWith('5F')).length===0,null,{timeout:20000});
  // Connection errors are visible.
  await page.evaluate(()=>{const b=window.HappierCloud.api;window.HappierCloud.api=async(o,p,body)=>p==='connection'?Promise.reject(Error('대상 컴퓨터가 오프라인입니다.')):b(o,p,body);});
  await page.locator('.vo-hall-cta').click();await page.waitForFunction(()=>document.querySelector('#rv-setup .aim-status')?.classList.contains('error'));
  assert((await page.locator('#rv-setup .aim-status').innerText()).includes('오프라인'));await page.locator('.rv-x').click();
  await page.evaluate(()=>location.reload());await page.locator('.vo-floor-pill[data-view="0"]').waitFor();
  await page.evaluate(()=>{window.__reviewEmpty=true;});await page.locator('.vo-floor-pill[data-view="0"]').click();
  await page.locator('.rv-empty').waitFor();assert((await page.locator('.rv-empty').innerText()).includes('선택할 산출물이 없습니다'));
  assert(await page.locator('.rv-form [type=submit]').isDisabled(),'cannot start without artifacts');
  for(const width of [390,820]){await page.setViewportSize({width,height:860});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow '+width);const b=await page.locator('#rv-setup').boundingBox();assert(b.x>=0&&b.x+b.width<=width,'popup fits '+width);}
  assert.deepEqual(errors,[]);
  console.log('PASS: 5F auditorium, setup popup (topic/artifacts/agent count/model/effort), escaping, agents gather, hall screen image+brief, presentation→feedback, user chat, resume existing session, session end summary and return, error state, empty artifacts, responsive popup');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
