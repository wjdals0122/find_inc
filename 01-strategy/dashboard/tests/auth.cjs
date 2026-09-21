const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const html = fs.readFileSync(path.join(__dirname, '../dashboard.html'));
const server = http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
let base;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-inc-auth-checks-'));
const liveBackend = process.env.FIREBASE_AUTH_LIVE === '1';
const results = [];
const errors = [];
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
    await p.goto(base); await p.locator('#auth-submit:enabled').waitFor();
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
    await page.locator('#search-open').click();check('Existing search opens',await page.locator('#search-dialog').isVisible());await page.locator('[data-close="search-dialog"]').click();
    await page.locator('#source-open').click();check('Existing source viewer opens',await page.locator('#source-dialog').isVisible());await page.locator('[data-close="source-dialog"]').click();
    await page.reload();await page.waitForFunction(()=>document.body.dataset.authState==='authenticated');
    check('Session restored after reload',await page.locator('#studio-login').isHidden());
    const other=await ctx.newPage();await other.goto(base);await other.waitForFunction(()=>document.body.dataset.authState==='authenticated');
    check('Remembered login shared in second tab',await other.locator('#studio-login').isHidden());
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:dir+'/dashboard-mobile.png',fullPage:true});
    check('Logout reachable on mobile',await page.locator('#auth-logout').isVisible());
    await page.locator('#auth-logout').click();await page.waitForFunction(()=>document.body.dataset.authState==='signed-out');
    await other.waitForFunction(()=>document.body.dataset.authState==='signed-out');
    check('Logout clears report and synchronizes other tab',await page.locator('#studio-dashboard').isHidden()&&await other.locator('#studio-dashboard').isHidden());
    await page.reload();await page.locator('#auth-submit:enabled').waitFor();
    check('Reload after logout stays locked',await page.locator('#studio-dashboard').isHidden()&&!await page.evaluate(()=>!!window.StudioData));
    await page.locator('#auth-email').fill('ui-test@example.invalid');await page.locator('#auth-reset').click();
    await page.waitForFunction(()=>document.querySelector('#auth-status').dataset.tone==='success');
    check('Password reset success message', (await page.locator('#auth-status').innerText()).includes('재설정 메일'));
    await ctx.close();
    const blocked=await browser.newContext();await blocked.route('https://www.gstatic.com/firebasejs/**',r=>r.abort());const bp=await blocked.newPage();await bp.goto(base);await bp.locator('#auth-retry').waitFor();
    check('SDK network failure stays locked with retry',await bp.locator('#studio-dashboard').isHidden()&&await bp.locator('#auth-submit').isDisabled());await blocked.close();
    check('No browser runtime errors',errors.length===0);
    fs.writeFileSync(dir+'/results.json',JSON.stringify({passed:results,errors},null,2));console.log(JSON.stringify({passed:results,errors,artifacts:dir},null,2));
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);console.log('PASSED BEFORE FAILURE',results);server.close();process.exitCode=1});
