const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req,res)=>{
  const name = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404);res.end();return;}
    const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html; charset=utf-8';
    res.writeHead(200,{'Content-Type':type});res.end(data);
  });
});
let base;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-inc-auth-checks-'));
const liveBackend = process.env.FIREBASE_AUTH_LIVE === '1';
const results = [];
const errors = [];
let signupRequests = 0;
const check = (name, ok) => { assert(ok, name); results.push(name); };
const jwt = () => {
  const now = Math.floor(Date.now()/1000);
  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
  return `${enc({alg:'RS256',typ:'JWT'})}.${enc({iss:'https://securetoken.google.com/find-inc',aud:'find-inc',auth_time:now,user_id:'test-ui-user',sub:'test-ui-user',iat:now,exp:now+3600,email:'ui-test@example.invalid',email_verified:true,firebase:{identities:{email:['ui-test@example.invalid']},sign_in_provider:'password'}})}.test-signature`;
};
async function mockedAuth(context) {
  await context.route('https://identitytoolkit.googleapis.com/**', async route => {
    const url = route.request().url();
    const payload = route.request().postDataJSON();
    let body, status = 200;
    if (url.includes('accounts:signInWithPassword')) {
      if (payload.password !== 'correct-test-password') { status=400; body={error:{code:400,message:'INVALID_LOGIN_CREDENTIALS'}}; }
      else body={kind:'identitytoolkit#VerifyPasswordResponse',localId:'test-ui-user',email:'ui-test@example.invalid',displayName:'UI Test',idToken:jwt(),registered:true,refreshToken:'test-refresh-token',expiresIn:'3600'};
    } else if (url.includes('accounts:signUp')) {
      signupRequests++;
      if (payload.email === 'duplicate@example.invalid') { status=400; body={error:{code:400,message:'EMAIL_EXISTS'}}; }
      else body={kind:'identitytoolkit#SignupNewUserResponse',localId:'test-ui-user',email:payload.email,idToken:jwt(),refreshToken:'test-refresh-token',expiresIn:'3600'};
    } else if (url.includes('accounts:lookup')) {
      body={users:[{localId:'test-ui-user',email:'ui-test@example.invalid',emailVerified:true,providerUserInfo:[{providerId:'password',email:'ui-test@example.invalid',rawId:'ui-test@example.invalid'}]}]};
    } else if (url.includes('accounts:sendOobCode')) body={email:payload.email};
    else return route.continue();
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
}
async function signin(page, remember=false) {
  await page.locator('#auth-submit:enabled').waitFor();
  await page.locator('#auth-email').fill('ui-test@example.invalid');
  await page.locator('#auth-password').fill('correct-test-password');
  await page.locator('#auth-remember').setChecked(remember);
  await page.locator('#auth-submit').click();
  await page.waitForFunction(()=>document.body.dataset.authState==='authenticated');
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base = `http://127.0.0.1:${server.address().port}/dashboard.html`;
  const browser=await chromium.launch({headless:true});
  try {
    // Real Firebase SDK and real backend: no account is created, no email is sent.
    const live=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'});
    if (!liveBackend) await mockedAuth(live);
    const p=await live.newPage(); p.on('pageerror',e=>errors.push(e.message));
    await p.goto(base); await p.waitForURL(/\/login\.html(?:#|$)/); await p.locator('#auth-submit:enabled').waitFor();
    check('Login HTML excludes report payload', !(await p.content()).includes('id="studio-data-gzip"'));
    check('Signed-out report hidden and runtime not booted',await p.locator('#studio-dashboard').isHidden() && !await p.evaluate(()=>!!window.StudioData));
    check('All five collected logos load',await p.locator('.auth-logo-card img').evaluateAll(xs=>xs.length===5&&xs.every(x=>x.complete&&x.naturalWidth>0)));
    const before=await p.locator('.auth-orbit').first().evaluate(x=>getComputedStyle(x).transform);
    await p.waitForTimeout(250);
    check('Brand logos animate',before!==await p.locator('.auth-orbit').first().evaluate(x=>getComputedStyle(x).transform));
    await p.locator('#auth-password').fill('invalid-test-password'); await p.locator('#auth-password-toggle').click();
    check('Password visibility toggle',await p.locator('#auth-password').getAttribute('type')==='text'); await p.locator('#auth-password-toggle').click();
    await p.locator('#auth-email').fill('nonexistent-validation-739866@example.invalid'); await p.locator('#auth-submit').click();
    await p.waitForFunction(()=>document.querySelector('#auth-status').dataset.tone==='error');
    check((liveBackend?'Live backend: ':'Mock backend: ')+'invalid credentials keep report locked',(await p.locator('#auth-status').innerText()).includes('이메일 또는 비밀번호')&&await p.locator('#studio-dashboard').isHidden());
    await p.locator('#auth-email').fill(''); await p.screenshot({path:dir+'/login-desktop.png',fullPage:true});
    for (const width of [390,320,820,1024]) {
      await p.setViewportSize({width,height:844});
      check('No login overflow at '+width,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(width===390) await p.screenshot({path:dir+'/login-mobile.png',fullPage:true});
    }
    await p.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'}); await p.setViewportSize({width:1440,height:1000});
    check('Reduced motion pauses logo animation',await p.locator('.auth-orbit').first().evaluate(x=>getComputedStyle(x).animationPlayState==='paused'||getComputedStyle(x).animationName==='none'));
    await p.screenshot({path:dir+'/login-dark.png',fullPage:true}); await live.close();
    // Success flows use real Firebase SDK against intercepted auth responses, never production accounts.
    const ctx=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'}); await mockedAuth(ctx);
    const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'#/brands/bmw/products/x5-g65/strategy/product');
    await signin(page,true);
    check('Successful auth reveals original deep-linked dashboard',await page.locator('#studio-login').isHidden()&&(await page.locator('#page-content').innerText()).includes('BMW'));
    await page.screenshot({path:dir+'/dashboard-desktop.png',fullPage:true});
    // Skill launcher transport is mocked; these checks never create agent jobs.
    let skillsPaired=true,skillsPairApproved=false,pairStarts=0,skillsReady=false,skillsRun=null,skillsRequest=null,skillConnectionChecks=0,skillsOffline=false;
    await ctx.route('**/happier-cloud.js',route=>route.fulfill({contentType:'text/javascript',body:`window.HappierCloud={clear(){},async api(owner,path,body){const response=await fetch('/__test/happier/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Test-Owner':owner},body:body?JSON.stringify(body):undefined});if(!response.ok)throw Error('Cloud connection unavailable');return response.json();}};`}));
    await ctx.route('**/__test/happier/**',async route=>{
      if(skillsOffline)return route.fulfill({status:404,body:'{}'});
      const name=new URL(route.request().url()).pathname.split('/__test/happier/')[1];
      let body;
      if(name==='bootstrap')body={csrf:'test-csrf',skills:[{id:'brand',label:'브랜드 조사',description:'브랜드 문서 생성'},{id:'product',label:'상품 조사',description:'상품 문서 생성'}],models:[{id:'test-a',label:'Test A',efforts:['low','medium'],defaultEffort:'medium'},{id:'test-b',label:'Test B',efforts:['high'],defaultEffort:'high'}],defaults:{model:'test-a',effort:'medium'}};
      else if(name==='pair/start'){pairStarts++;body={url:'https://app.happier.dev/terminal/connect#key=test',expiresAt:new Date(Date.now()+600000).toISOString()};}
      else if(name==='pair/status'){if(skillsPairApproved){skillsPaired=true;skillsReady=true;}body={state:skillsPairApproved?'authorized':'pending'};}
      else if(name==='connection'){skillConnectionChecks++;body=!skillsPaired?{ready:false,needsPairing:true,checks:{}}:{ready:skillsReady,machine:'Test machine',checks:{registered:skillsReady,daemonReady:skillsReady}};}
      else if(name==='history')body={runs:skillsRun?[skillsRun]:[]};
      else if(name==='runs'&&route.request().method()==='POST'){
        skillsRequest=route.request().postDataJSON();
        check('Cloud dispatch is scoped to the signed-in dashboard owner',route.request().headers()['x-test-owner']==='test-ui-user');
        skillsRun={id:skillsRequest.requestId,label:'브랜드 조사',model:skillsRequest.model,effort:skillsRequest.effort,createdAt:new Date().toISOString(),state:'creating',sessionId:null,progress:'세션 생성 중',result:''};body=skillsRun;
      }else if(name.startsWith('runs/'))body=skillsRun;
      else return route.fulfill({status:404,body:'{}'});
      await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.reload();await page.waitForFunction(()=>document.body.dataset.authState==='authenticated');
    check('AI meeting topic input and button sit in the dashboard top bar',await page.locator('.hero-actions #aim-topic').isVisible()&&(await page.locator('.hero-actions #aim-open').innerText()).trim()==='AI 회의 열기');
    check('Skill launcher is a fixed island outside the header',await page.locator('#skills-island').evaluate(e=>getComputedStyle(e).position==='fixed')&&await page.locator('.hero-actions #skills-open').count()===0);
    await page.locator('#skills-open').hover();
    await page.locator('[data-island-skill="product"]').waitFor({state:'visible'});
    check('Hover expands project skills without launching or checking a session',await page.locator('#skills-open').getAttribute('aria-expanded')==='true'&&skillConnectionChecks===0&&await page.locator('#skills-dialog').count()===0);
    await page.locator('[data-island-skill="product"]').hover();
    check('Moving from island icon to list keeps the shelf open',await page.locator('#skills-island').evaluate(e=>e.classList.contains('is-expanded')));
    await page.locator('#skills-open').focus();await page.keyboard.press('Escape');
    check('Escape closes the island and removes links from tab order',await page.locator('#skills-open').getAttribute('aria-expanded')==='false'&&await page.locator('#skills-island-preview').evaluate(e=>e.inert));
    await page.mouse.move(30,300);await page.locator('#skills-open').hover();
    await page.locator('[data-island-skill="product"]').waitFor({state:'visible'});
    await page.locator('#skills-island-preview').screenshot({path:dir+'/skills-island-desktop.png'});
    await page.locator('[data-island-skill="product"]').click();
    await page.waitForFunction(()=>document.querySelector('.sk-connection strong')?.textContent==='연결 확인 필요');
    check('Island skill opens the existing dialog with that skill selected',(await page.locator('.sk-selected-head h3').innerText())==='상품 조사');
    await page.locator('[data-skill="brand"]').click();
    check('Skill execution disabled until registered daemon is ready',await page.locator('.sk-primary').isDisabled());
    skillsReady=true;await page.locator('.sk-check').click();
    await page.locator('.sk-primary:enabled').waitFor();
    await page.locator('#skill-instruction').fill('Create a document');
    await page.locator('#skill-model').selectOption('test-b');
    check('Effort options follow selected model',await page.locator('#skill-effort option').count()===1&&await page.locator('#skill-effort').inputValue()==='high');
    check('Skill instructions survive configuration changes',await page.locator('#skill-instruction').inputValue()==='Create a document');
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});
      check('Skills popup fits '+width,await page.locator('#skills-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
      check('Skills header fits '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('#skills-dialog').screenshot({path:dir+'/skills-desktop.png'});
    await page.locator('#skill-apply').uncheck();await page.locator('.sk-primary').click();
    await page.locator('.sk-run-detail').waitFor();
    check('No running label before a session id is returned',(await page.locator('.sk-state').innerText())==='세션 생성 중'&&(await page.locator('.sk-run-meta').innerText()).includes('발급 대기'));
    check('Skill request includes selected model, effort and UUID',skillsRequest.model==='test-b'&&skillsRequest.effort==='high'&&skillsRequest.requestId.length===36);
    skillsRun={...skillsRun,state:'completed',sessionId:'test-session-id',result:'Created result <script>window.bad=true</script>'};
    await page.locator('[data-view="history"]').click();await page.locator('[data-run]').click();
    check('Skills history retains session and completed result',(await page.locator('.sk-result').innerText()).includes('Created result')&&(await page.locator('.sk-run-meta').innerText()).includes('test-session-id'));
    check('Skill result text is escaped',await page.evaluate(()=>!window.bad));
    await page.locator('.sk-close').click();await page.locator('#skills-open').click();
    await page.locator('.sk-run-detail').waitFor();check('Skill results survive closing and reopening popup',(await page.locator('.sk-result').innerText()).includes('Created result'));
    await page.locator('.sk-close').click();
    // Unpaired browser: 스킬 실행 shows the Happier approval button, then resumes the same run after approval.
    skillsPaired=false;skillsReady=false;skillsRun=null;skillsRequest=null;await page.evaluate(()=>window.SkillsPanel.clear());
    await page.locator('#skills-open').click();await page.locator('[data-skill="brand"]').click();
    await page.waitForFunction(()=>document.querySelector('.sk-notice')?.textContent.includes('승인이 필요'));
    check('Unpaired browser shows no approval link before 스킬 실행',await page.locator('.sk-pair-link').count()===0&&await page.locator('.sk-cloud-connect').count()===0);
    await page.locator('#skill-instruction').fill('Approval flow');await page.locator('.sk-primary').click();
    await page.locator('.sk-pair-link').waitFor();
    check('스킬 실행 shows Happier web approval button',(await page.locator('.sk-pair-link').innerText()).includes('Happier 웹에서 승인')&&pairStarts===1&&skillsRequest===null);
    skillsPairApproved=true;await page.locator('.sk-run-detail').waitFor({timeout:15000});
    check('Approved pairing resumes the run without choosing PC or folder',skillsRequest?.instruction==='Approval flow'&&skillsRequest.skill==='brand'&&!('machine' in skillsRequest)&&!('directory' in skillsRequest));
    await page.locator('.sk-close').click();skillsRun=null;skillsRequest=null;
    await page.locator('#skills-open').click();await page.locator('[data-view="new"]').click();await page.locator('.sk-primary:enabled').waitFor();
    await page.locator('#skill-instruction').fill('Already approved');await page.locator('.sk-primary').click();await page.locator('.sk-run-detail').waitFor();
    check('Already approved browser skips the approval step',pairStarts===1&&await page.locator('.sk-pair-link').count()===0&&skillsRequest?.instruction==='Already approved');
    await page.locator('.sk-close').click();
    // A static Hosting deployment still exposes the catalog, but cannot run jobs.
    skillsOffline=true;await page.evaluate(()=>window.SkillsPanel.clear());
    await page.mouse.move(30,300);await page.locator('#skills-open').hover();
    await page.waitForFunction(()=>document.querySelectorAll('[data-island-skill]').length>2);
    check('Static Hosting can display the public skill catalog without a runtime API',await page.locator('[data-island-skill]').count()===JSON.parse(fs.readFileSync(path.join(root,'skills-catalog.json'),'utf8')).skills.length);
    await page.locator('#skills-open').click();
    await page.waitForFunction(()=>document.querySelector('.sk-connection strong')?.textContent==='연결 확인 필요');
    check('Static Hosting never claims runtime connectivity or allows execution',await page.locator('.sk-primary').isDisabled()&&await page.locator('#skill-model').isDisabled());
    await page.locator('.sk-close').click();skillsOffline=false;
    // Isolated fixture for zero/missing-date behavior. No private files needed.
    const metricsSnapshot = {exported_at:'2026-11-17T07:36:45Z',rows:[10,11,12,13,14].flatMap(day=>['views','estimatedMinutesWatched'].map(metric_name=>({channel:'youtube',account_id:'test-channel',metric_date:`2026-11-${day}`,metric_name,metric_value:0,collected_at:'2026-11-17T06:54:42Z'})))};
    let metricsRequests=0, metricsFail=false;
    await ctx.route('**/api/channel-metrics?**', async r => {
      metricsRequests++;
      if(metricsFail) return r.fulfill({status:502,contentType:'application/json',body:'{}'});
      const q=new URL(r.request().url()).searchParams;
      return r.fulfill({contentType:'application/json',body:JSON.stringify({...metricsSnapshot,mode:'snapshot',fetched_at:new Date().toISOString(),rows:metricsSnapshot.rows.filter(x=>x.metric_date>=q.get('start')&&x.metric_date<=q.get('end'))})});
    });
    await page.locator('[data-stage="operation"]').click();
    await page.waitForFunction(()=>document.querySelector('.op-workspace')?.getAttribute('aria-busy')==='false');
    await page.locator('.op-date-fields input[name=start]').fill('2026-11-10');
    await page.locator('.op-date-fields input[name=end]').fill('2026-11-16');
    await page.locator('.op-apply').click();
    await page.waitForFunction(()=>document.querySelector('.op-metric-top')?.textContent.includes('5/7'));
    check('Operation displays stored zero separately from missing days',(await page.locator('.op-number').first().innerText()).includes('0')&&await page.locator('.op-day-strip .collected').count()===5);
    check('Operation labels snapshot source',(await page.locator('.op-notice').innerText()).includes('스냅샷'));
    await page.locator('.op-workspace').screenshot({path:dir+'/operation-desktop.png'});
    await page.locator('[data-channel="instagram"]').click();
    check('Instagram missing data is not presented as zero',(await page.locator('.op-number').first().innerText()).includes('—'));
    await page.locator('[data-channel="google-search"]').click();
    check('Search Console metrics use correct names',(await page.locator('.op-metrics').innerText()).includes('노출수')&&(await page.locator('.op-metrics').innerText()).includes('클릭수'));
    await page.locator('[data-channel="youtube"]').click();
    const beforeRefresh=metricsRequests;await page.locator('.op-refresh').click();
    await page.waitForFunction(()=>document.querySelector('.op-workspace')?.getAttribute('aria-busy')==='false');
    check('Operation refresh makes a new authenticated data request',metricsRequests>beforeRefresh);
    await page.locator('[data-period="14"]').click();
    await page.waitForFunction(()=>document.querySelector('.op-workspace')?.getAttribute('aria-busy')==='false');
    check('Operation period controls update coverage denominator',(await page.locator('.op-metric-top').first().innerText()).includes('5/14'));
    await page.locator('[data-period="7"]').click();
    await page.waitForFunction(()=>document.querySelector('.op-workspace')?.getAttribute('aria-busy')==='false');
    await page.setViewportSize({width:390,height:844});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))console.log('Operation overflow',await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.right>innerWidth+1;}).slice(-16).map(e=>({tag:e.tagName,id:e.id,class:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width}))));
    check('Operation has no mobile horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('.op-workspace').screenshot({path:dir+'/operation-mobile.png'});
    await page.setViewportSize({width:320,height:740});
    check('Operation fits a 320px screen',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.setViewportSize({width:1440,height:1000});
    await page.emulateMedia({reducedMotion:'reduce'});
    check('Operation reduced motion stops orbit animation',await page.locator('.op-orbit').first().evaluate(e=>getComputedStyle(e).animationName==='none'));
    await page.emulateMedia({reducedMotion:'no-preference'});
    metricsFail=true;await page.locator('.op-refresh').click();
    await page.waitForFunction(()=>document.querySelector('.op-status-dot')?.classList.contains('error'));
    check('Operation data failure has an explicit error state',(await page.locator('.op-source').innerText()).includes('조회하지 못했습니다'));
    metricsFail=false;
    // Drive integration: GIS and Drive responses are intercepted; no real Google consent or private files.
    const ROOT = '1rRp5lRjKKM3KSQo3JqfHZq1J54EpovDO';
    const driveRequests = [];
    let revision = 1, unauthorized = false;
    await ctx.route('https://accounts.google.com/gsi/client', r => r.fulfill({contentType:'text/javascript',body:`window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:options=>({requestAccessToken:()=>{window.__gisScope=options.scope;options.callback({access_token:'drive-test-memory-token',expires_in:window.__shortDriveExpiry?16:3600,scope:options.scope});}})}}};`}));
    await ctx.route('https://www.googleapis.com/drive/v3/**', async r => {
      driveRequests.push({url:r.request().url(),authorization:r.request().headers().authorization});
      if (unauthorized) { await r.fulfill({status:401,body:'{}'}); return; }
      const url=new URL(r.request().url());
      if (url.searchParams.get('alt')==='media') {
        await r.fulfill({contentType:url.pathname.endsWith('image-1')?'image/svg+xml':'video/mp4',body:url.pathname.endsWith('image-1')?'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#93a9c5"/></svg>':'mock-video'});return;
      }
      const parent=url.searchParams.get('q')||'';
      let body;
      if(parent.includes(ROOT)) body=url.searchParams.has('pageToken')?{files:[{id:'video-1',name:'Campaign.mp4',mimeType:'video/mp4',size:'100'}]}:{nextPageToken:'second',files:[{id:'folder-1',name:'BMW',mimeType:'application/vnd.google-apps.folder'},{id:'doc-1',name:revision===1?'Brief.pdf':'Updated brief.pdf',mimeType:'application/pdf'}]};
      else if(parent.includes('folder-1')) body={files:[{id:'image-1',name:'Product.svg',mimeType:'image/svg+xml',size:'120'},{id:'folder-2',name:'Final',mimeType:'application/vnd.google-apps.folder'}]};
      else body={files:[{id:'deep-1',name:'Nested.txt',mimeType:'text/plain'}]};
      await r.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.locator('[data-stage="contents"]').click();
    await page.locator('#drive-connect').waitFor();
    await page.waitForFunction(()=>!!window.google?.accounts?.oauth2);
    check('Contents starts disconnected',await page.locator('#drive-refresh').isDisabled());
    await page.locator('.drive-workspace').screenshot({path:dir+'/contents-disconnected.png'});
    await page.locator('#drive-connect').click();
    await page.locator('[data-folder="folder-1"]').waitFor();
    check('GIS requests the supplied full Drive scope',await page.evaluate(()=>window.__gisScope==='https://www.googleapis.com/auth/drive'));
    check('Pagination and all descendants loaded',(await page.locator('.drive-summary').innerText()).includes('2개 폴더 · 4개 파일'));
    check('Requests use Bearer authorization',driveRequests.length===4&&driveRequests.every(x=>x.authorization==='Bearer drive-test-memory-token'));
    await page.locator('.drive-workspace').screenshot({path:dir+'/contents-desktop.png'});
    await page.locator('[data-folder="folder-1"]').click();
    await page.locator('[data-preview="image-1"]').click();
    await page.locator('.drive-preview-body img').waitFor();
    check('Private image preview uses a blob URL',(await page.locator('.drive-preview-body img').getAttribute('src')).startsWith('blob:'));
    await page.locator('#drive-preview-close').click();
    await page.locator('[data-folder="folder-2"]').click();
    check('Nested folder contents visible',await page.locator('[data-preview="deep-1"]').isVisible());
    await page.locator('#drive-search').fill('Campaign');
    await page.locator('[data-preview="video-1"]').click();
    await page.waitForFunction(()=>document.querySelector('.drive-preview-body video')||document.querySelector('.drive-preview-body').textContent.includes('브라우저'));
    check('Video preview requested authenticated media',driveRequests.some(x=>x.url.includes('video-1?alt=media')));
    await page.locator('#drive-preview-close').click();
    revision=2;await page.locator('#drive-refresh').click();
    await page.locator('#drive-refresh:enabled').waitFor();
    await page.locator(`[data-folder="${ROOT}"]`).click();
    check('Refresh retrieves changed files',await page.getByText('Updated brief.pdf',{exact:true}).isVisible());
    await page.setViewportSize({width:390,height:844});
    check('Contents fits mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('.drive-workspace').screenshot({path:dir+'/contents-mobile.png'});
    check('Drive token never persisted',await page.evaluate(()=>![...Object.values(localStorage),...Object.values(sessionStorage)].some(x=>x.includes('drive-test-memory-token'))));
    unauthorized=true;await page.locator('#drive-refresh').click();
    await page.waitForFunction(()=>document.querySelector('#drive-refresh').disabled&&document.querySelector('.drive-status').textContent.includes('다시 연결'));
    check('Unauthorized token clears files and requests reconnection',await page.locator('.drive-card').count()===0);
    unauthorized=false;await page.locator('#drive-connect').click();await page.locator('[data-folder="folder-1"]').waitFor();
    await page.locator('#drive-disconnect').click();
    check('Disconnect clears Drive files',await page.locator('.drive-card').count()===0);
    await page.evaluate(()=>window.__shortDriveExpiry=true);
    await page.locator('#drive-connect').click();
    await page.locator('[data-folder="folder-1"]').waitFor();
    await page.waitForFunction(()=>document.querySelector('#drive-refresh').disabled&&document.querySelector('.drive-status').textContent.includes('만료'));
    check('Expiry timer clears token and requires a new user connection',await page.locator('.drive-card').count()===0);

    await page.setViewportSize({width:1440,height:1000});
    await page.locator('[data-stage="strategy"]').click();

    await page.locator('#search-open').click();check('Existing search opens',await page.locator('#search-dialog').isVisible());await page.locator('[data-close="search-dialog"]').click();
    await page.locator('#source-open').click();check('Existing source viewer opens',await page.locator('#source-dialog').isVisible());await page.locator('[data-close="source-dialog"]').click();
    await page.reload();await page.waitForFunction(()=>document.body.dataset.authState==='authenticated');
    check('Session restored after reload',await page.locator('#studio-login').isHidden());
    const other=await ctx.newPage();await other.goto(base);await other.waitForFunction(()=>document.body.dataset.authState==='authenticated');
    check('Remembered login shared in second tab',await other.locator('#studio-login').isHidden());
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:dir+'/dashboard-mobile.png',fullPage:true});
    check('Logout reachable on mobile',await page.locator('#auth-logout').isVisible());
    await page.locator('#auth-logout').click();await page.waitForURL(/\/login\.html(?:#|$)/);await page.waitForFunction(()=>document.body.dataset.authState==='signed-out');
    await other.waitForURL(/\/login\.html(?:#|$)/);await other.waitForFunction(()=>document.body.dataset.authState==='signed-out');
    check('Logout clears report and synchronizes other tab',await page.locator('#studio-dashboard').isHidden()&&await other.locator('#studio-dashboard').isHidden());
    await page.reload();await page.locator('#auth-submit:enabled').waitFor();
    check('Reload after logout stays locked',await page.locator('#studio-dashboard').isHidden()&&!await page.evaluate(()=>!!window.StudioData));
    await page.locator('#auth-email').fill('ui-test@example.invalid');await page.locator('#auth-reset').click();
    await page.waitForFunction(()=>document.querySelector('#auth-status').dataset.tone==='success');
    check('Password reset success message', (await page.locator('#auth-status').innerText()).includes('재설정 메일'));
    await ctx.close();
    // Registration uses the real SDK against an intercepted Firebase response.
    const registration=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light'});await mockedAuth(registration);
    const sp=await registration.newPage();sp.on('pageerror',e=>errors.push(e.message));await sp.goto(base);
    await sp.locator('#auth-switch:enabled').waitFor();await sp.locator('#auth-switch').click();
    check('Registration opens on first step',await sp.locator('#signup-step-1').isVisible()&&await sp.locator('#auth-form').isHidden());
    check('Registration has no mobile horizontal overflow',await sp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await sp.locator('#signup-email').fill('ui-test@example.invalid');await sp.locator('#signup-password').fill('correct-test-password');await sp.locator('#signup-next').click();
    check('Registration advances to confirmation',await sp.locator('#signup-step-2').isVisible()&&await sp.locator('#signup-progress-2').getAttribute('aria-current')==='step');
    await sp.locator('#signup-confirm').fill('mismatch-test-password');await sp.locator('#signup-submit').click();
    check('Mismatched passwords do not create an account',signupRequests===0&&(await sp.locator('#signup-status').innerText()).includes('일치하지'));
    await sp.locator('#signup-back').click();check('Back returns to account details',await sp.locator('#signup-step-1').isVisible());
    await sp.locator('#signup-next').click();await sp.locator('#signup-confirm').fill('correct-test-password');await sp.locator('#signup-submit').click();
    await sp.waitForFunction(()=>document.body.dataset.authState==='authenticated');
    check('Completed registration opens dashboard',signupRequests===1&&await sp.locator('#studio-login').isHidden());
    await sp.locator('#auth-logout').click();await sp.waitForFunction(()=>document.body.dataset.authState==='signed-out');
    await signin(sp);check('Registered user can log in after logout',await sp.locator('#studio-login').isHidden());
    await sp.locator('#auth-logout').click();await sp.waitForFunction(()=>document.body.dataset.authState==='signed-out');
    await sp.locator('#auth-switch:enabled').click();await sp.locator('#signup-email').fill('duplicate@example.invalid');await sp.locator('#signup-password').fill('correct-test-password');await sp.locator('#signup-next').click();await sp.locator('#signup-confirm').fill('correct-test-password');await sp.locator('#signup-submit').click();
    await sp.waitForFunction(()=>document.querySelector('#signup-status').dataset.tone==='error');
    check('Duplicate email shows an error and remains signed out',await sp.locator('#studio-dashboard').isHidden()&&(await sp.locator('#signup-status').innerText()).includes('이메일'));
    await sp.locator('#auth-switch').click();check('Switching back restores login',await sp.locator('#auth-form').isVisible()&&await sp.locator('#signup-form').isHidden());
    await registration.close();
    const blocked=await browser.newContext();await blocked.route('https://www.gstatic.com/firebasejs/**',r=>r.abort());const bp=await blocked.newPage();await bp.goto(base.replace('dashboard.html','login.html'));await bp.locator('#auth-retry').waitFor();
    check('SDK network failure stays locked with retry',await bp.locator('#studio-dashboard').isHidden()&&await bp.locator('#auth-submit').isDisabled());await blocked.close();
    check('No browser runtime errors',errors.length===0);
    fs.writeFileSync(dir+'/results.json',JSON.stringify({passed:results,errors},null,2));console.log(JSON.stringify({passed:results,errors,artifacts:dir},null,2));
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);console.log('PASSED BEFORE FAILURE',results);server.close();process.exitCode=1});
