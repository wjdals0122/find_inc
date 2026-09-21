const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1540,height:1150},reducedMotion:'reduce',timezoneId:'Asia/Seoul'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.OFFICE_BASE||'http://127.0.0.1:8000';
 try{
  await page.clock.install({time:new Date('2026-11-18T03:00:00Z')});
  await page.goto(base+'/virtual-office-preview.html');await page.clock.runFor(300);
  const light=()=>page.locator('#virtual-office').getAttribute('data-lighting');
  const pixels=()=>page.evaluate(()=>Array.from(document.querySelector('.vo-scene canvas').getContext('2d').getImageData(0,0,1120,1320).data).filter((_,i)=>i%4000===0));
  assert.equal(await light(),'day','real noon is daylight');
  await page.screenshot({path:path.resolve(__dirname,'../../.private/office-redesign-day.png')});
  const day=await pixels();await page.locator('#vo-day').selectOption('night');await page.clock.runFor(150);
  assert.equal(await light(),'night','night is selectable during the day');assert.notDeepEqual(await pixels(),day,'night changes the rendered scene');
  await page.locator('#vo-view').selectOption('river');await page.clock.runFor(150);
  await page.screenshot({path:path.resolve(__dirname,'../../.private/office-redesign-night.png')});
  const river=await pixels();await page.locator('#vo-view').selectOption('skyline');await page.clock.runFor(150);assert.notDeepEqual(await pixels(),river,'river and skyline are different backgrounds');
  const edge=()=>page.evaluate(()=>Array.from(document.querySelector('.vo-scene canvas').getContext('2d').getImageData(0,0,20,1320).data));
  const clearEdge=await edge();await page.locator('#vo-weather').selectOption('snow');await page.clock.runFor(150);
  assert.notDeepEqual(await edge(),clearEdge,'weather also changes the exterior outside the windows');assert.equal(await page.locator('#virtual-office').getAttribute('data-weather'),'snow');
  await page.locator('#vo-weather').selectOption('clear');
  await page.locator('.vo-floor-pill[data-view="1"]').click();await page.clock.runFor(150);
  assert.equal(await page.locator('#virtual-office').getAttribute('data-floor-view'),'3F','single floor view');
  assert.equal(await page.locator('.vo-scene canvas').evaluate(c=>c.height),736,'single floor renders the expanded floor plan');assert.equal(await page.locator('.vo-floor-pill[data-view="1"]').getAttribute('aria-pressed'),'true');
  const fb=await page.locator('.vo-floorbar').boundingBox(),vb=await page.locator('.vo-viewport').boundingBox();assert(fb.y>vb.y+vb.height/2,'floor picker sits at the bottom');
  assert.equal(await page.locator('.vo-floor-link:visible').count(),1,'only the chosen floor label shows');
  await page.locator('.vo-floor-pill[data-view="all"]').click();await page.clock.runFor(150);
  assert.equal(await page.locator('.vo-floor-link:visible').count(),4,'all floors view restores the full building');assert.equal(await page.locator('.vo-scene canvas').evaluate(c=>c.height),1320);
  await page.locator('#vo-day').selectOption('auto');await page.clock.setSystemTime(new Date('2026-11-18T14:00:00Z'));await page.clock.runFor(150);assert.equal(await light(),'night','real 23:00 switches automatically');
  await page.clock.setSystemTime(new Date('2026-11-18T09:00:00Z'));await page.clock.runFor(150);assert.equal(await light(),'dusk');
  await page.locator('#vo-meeting').click();await page.clock.runFor(200);
  assert.equal(await page.locator('#vo-meeting').getAttribute('aria-pressed'),'true');
  assert((await page.locator('[data-actor="analyst"]').innerText()).includes('4F'),'idle staff gather at the top-floor lounge');
  assert((await page.locator('[data-actor="researcher"]').innerText()).includes('3F'),'working staff keep their active work');
  await page.screenshot({path:path.resolve(__dirname,'../../.private/office-redesign-townhall.png')});
  await page.locator('#vo-meeting').click();await page.clock.runFor(150);assert((await page.locator('[data-actor="analyst"]').innerText()).includes('3F'),'staff return to their own departments');
  for(const width of [320,390,820,1024]){await page.setViewportSize({width,height:900});await page.clock.runFor(150);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no outer overflow '+width);const toolbar=await page.locator('.vo-toolbar').boundingBox();const button=await page.locator('#vo-meeting').boundingBox();assert(button.y>=toolbar.y&&button.y+button.height<=toolbar.y+toolbar.height+1,'meeting control fits toolbar '+width);if(width<760){const roster=await page.locator('.vo-roster').boundingBox(),detail=await page.locator('.vo-detail').boundingBox();assert(detail.x>=roster.x+roster.width,'mobile agent details do not overlap roster');}}
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:path.resolve(__dirname,'../../.private/office-redesign-mobile.png')});
  await page.locator('#virtual-office-toggle').click();assert(!await page.evaluate(()=>document.body.classList.contains('vo-night')),'night style does not leak into reports');
  assert.deepEqual(errors,[]);console.log('PASS: day/night/dusk/auto, city/river backgrounds, exterior weather, single/all floor view, all-hands gathering and return, busy session preservation, responsive controls');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
