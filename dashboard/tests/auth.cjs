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
