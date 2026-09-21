const {chromium}=require('playwright');
const assert=require('node:assert/strict');
// AI meeting UI checks against the local preview's scripted sample transport. No Codex session is created.
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.OFFICE_BASE||'http://127.0.0.1:8000';
 try{
  await page.goto(base+'/virtual-office-preview.html');
  await page.locator('#aim-topic').waitFor();
  assert(await page.locator('.hero-actions #aim-launch').isVisible(),'topic input and AI 회의 열기 sit in the top bar');
  assert.equal((await page.locator('#aim-open').innerText()).trim(),'AI 회의 열기');
  await page.locator('#aim-topic').fill('<img src=x onerror="window.pwned=1"> 신제품 런칭');
  await page.locator('#aim-open').click();
  await page.locator('#aim-panel .aim-log').waitFor();
  assert((await page.locator('#aim-title').innerText()).includes('<img'),'topic is rendered as text');
  assert.equal(await page.evaluate(()=>window.pwned),undefined,'topic is escaped');
  const on4F=()=>page.evaluate(()=>[...document.querySelectorAll('[data-actor] small')].filter(s=>s.textContent.startsWith('4F')).length);
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-actor] small')].filter(s=>s.textContent.startsWith('4F')).length>=4,null,{timeout:15000});
  assert(await page.locator('[data-actor="writer"] small').innerText().then(t=>t.startsWith('4F')),'an idle content agent joins');
  assert.equal(await page.locator('[data-actor="me"]').count(),0,'the user is not listed as an agent');
  assert.equal(await page.locator('#virtual-office').getAttribute('data-floor-view'),'4F','office focuses the meeting floor');
  await page.waitForFunction(()=>document.querySelectorAll('.aim-line').length>=5,null,{timeout:20000});
  await page.waitForFunction(()=>document.querySelector('.vo-feed-items')?.textContent.includes('[샘플] 30대'),null,{timeout:20000});
  assert((await page.locator('.aim-status strong').innerText()).includes('대표 의견 대기')||(await page.locator('.aim-status strong').innerText()).includes('논의'));
  await page.locator('#aim-say').fill('숏폼을 먼저 진행합시다');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>[...document.querySelectorAll('.aim-line.me p')].some(p=>p.textContent==='숏폼을 먼저 진행합시다'));
  assert((await page.locator('.vo-feed-items').innerText()).includes('숏폼을 먼저 진행합시다'),'my line also appears as an office speech entry');
  await page.locator('.aim-end').click();
  await page.waitForFunction(()=>document.querySelector('.aim-summary')?.textContent.includes('docs/meetings'),null,{timeout:20000});
  assert.equal((await page.locator('.aim-status strong').innerText()).trim(),'회의 종료');
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-actor] small')].filter(s=>s.textContent.startsWith('4F')).length<=1,null,{timeout:20000});
  assert(await page.locator('[data-actor="writer"] small').innerText().then(t=>t.startsWith('2F')),'agents return to their departments');
  assert(await page.locator('[data-actor="researcher"] small').innerText().then(t=>t.startsWith('3F')),'busy agents never left their work');
  // Connection errors are visible, and an unpaired browser shows the Happier approval link.
  await page.evaluate(()=>{window.HappierCloud.api=async(o,path)=>{if(path==='connection')throw Error('대상 컴퓨터가 오프라인입니다.');throw Error('x');};});
  await page.locator('#aim-new-topic').fill('오류 확인');await page.locator('.aim-primary').click();
  await page.waitForFunction(()=>document.querySelector('.aim-status')?.classList.contains('error'));
  assert((await page.locator('.aim-status').innerText()).includes('오프라인'));
  await page.evaluate(()=>{window.HappierCloud.api=async(o,path)=>path==='connection'?{ready:false,needsPairing:true}:path==='pair/start'?{url:'https://cloud.happier.dev/terminal/connect#k',expiresAt:Date.now()+60000}:{state:'pending'};});
  await page.locator('.aim-primary').click();await page.locator('.aim-pair-link').waitFor();
  assert((await page.locator('.aim-pair-link').innerText()).includes('Happier 웹에서 승인'));
  for(const width of [390,820]){await page.setViewportSize({width,height:860});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow '+width);const b=await page.locator('#aim-panel').boundingBox();assert(b.x>=0&&b.x+b.width<=width,'panel fits '+width);}
  assert.deepEqual(errors,[]);
  console.log('PASS: header launcher, escaping, team agents gather on 4F, real-line bubbles/feed, user chat, end summary and return, error and approval states, responsive panel');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
