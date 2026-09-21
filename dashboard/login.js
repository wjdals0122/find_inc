import {getSession} from './auth-session.js';

/* Firebase browser configuration is public app identification, not an admin credential.
 * This controls the UI. The embedded report still requires server-side delivery for confidentiality.
 * SDK: https://firebase.google.com/docs/web/alt-setup
 * Auth: https://firebase.google.com/docs/auth/web/start
 */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const login = byId('studio-login');
  const form = byId('auth-form'), email = byId('auth-email'), password = byId('auth-password');
  const submit = byId('auth-submit'), submitLabel = byId('auth-submit-label');
  const status = byId('auth-status'), reset = byId('auth-reset'), retry = byId('auth-retry');
  let auth, sdk, ready = false, busy = false, opened = false, revision = 0, resetUntil = 0;
  let signupStep = 1;
  const signup = byId('signup-form'), signupEmail = byId('signup-email'), signupPassword = byId('signup-password'), signupConfirm = byId('signup-confirm');
  const signupStatus = byId('signup-status'), signupSwitch = byId('auth-switch');
  function message(text, tone = '') { status.textContent = text; status.dataset.tone = tone; }
  function controls(working = false) {
    busy = working;
    form.setAttribute('aria-busy', String(working));
    submit.disabled = !ready || working;
    reset.disabled = !ready || working;
    email.readOnly = password.readOnly = working;
    submitLabel.textContent = working ? '로그인 중…' : ready ? '로그인' : '로그인 준비 중…';
    signupSwitch.disabled = !ready || working;
    byId('signup-next').disabled = byId('signup-submit').disabled = !ready || working;
    byId('signup-back').disabled = working;
    signupEmail.readOnly = signupPassword.readOnly = signupConfirm.readOnly = working;
  }
  function errorText(error) {
    switch (error?.code) {
      case 'auth/invalid-credential': case 'auth/wrong-password': case 'auth/user-not-found': case 'auth/invalid-login-credentials':
        return '이메일 또는 비밀번호를 확인해주세요.';
      case 'auth/invalid-email': return '올바른 이메일 주소를 입력해주세요.';
      case 'auth/user-disabled': return '사용이 중지된 계정입니다. 관리자에게 문의해주세요.';
      case 'auth/too-many-requests': return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
      case 'auth/network-request-failed': return '연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해주세요.';
      case 'auth/operation-not-allowed': return '이메일 로그인을 사용할 수 없습니다. 관리자에게 문의해주세요.';
      case 'auth/web-storage-unsupported': return '브라우저의 사이트 저장소를 허용한 뒤 다시 시도해주세요.';
      default: return '로그인하지 못했습니다. 잠시 후 다시 시도해주세요.';
    }
  }
  function showLogin() { login.hidden = false; document.body.dataset.authState = 'signed-out'; }
  const toggle = byId('auth-password-toggle');
  toggle.addEventListener('click', () => {
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.setAttribute('aria-label', visible ? '비밀번호 숨기기' : '비밀번호 표시');
  });
  document.querySelectorAll('.auth-input-wrap').forEach(wrap => wrap.addEventListener('pointermove', event => {
    const rect = wrap.getBoundingClientRect();
    wrap.style.setProperty('--pointer-x', `${event.clientX - rect.left}px`);
    wrap.style.setProperty('--pointer-y', `${event.clientY - rect.top}px`);
  }));

  function signupMessage(text, tone = '') { signupStatus.textContent = text; signupStatus.dataset.tone = tone; }
  function setSignupStep(step) {
    signupStep = step;
    byId('signup-step-1').hidden = step !== 1; byId('signup-step-2').hidden = step !== 2;
    for (const n of [1,2]) {
      const indicator = byId('signup-progress-' + n); indicator.classList.toggle('active', n === step);
      if (n === step) indicator.setAttribute('aria-current', 'step'); else indicator.removeAttribute('aria-current');
    }
    byId('signup-progress-text').textContent = step === 1 ? '계정 정보' : '비밀번호 확인';
    signupMessage('');
    (step === 1 ? signupEmail : signupConfirm).focus();
  }
  function showSignup(show) {
    if (busy) return;
    form.hidden = show; signup.hidden = !show;
    byId('auth-heading').textContent = show ? '회원가입' : 'Welcome back.';
    byId('auth-intro').innerHTML = show ? '이메일과 비밀번호로 계정을 만들고<br>브랜드의 다음 전략을 시작하세요.' : '이메일과 비밀번호로 로그인하고<br>브랜드의 다음 전략을 이어가세요.';
    byId('auth-switch-copy').textContent = show ? '이미 계정이 있으신가요?' : '계정이 없으신가요?';
    signupSwitch.textContent = show ? '로그인' : '회원가입';
    message(''); signupMessage('');
    password.value = ''; signupPassword.value = ''; signupConfirm.value = '';
    signup.querySelectorAll('[data-signup-toggle]').forEach(button => {
      const input = byId(button.dataset.signupToggle); input.type = 'password';
      button.setAttribute('aria-pressed','false'); button.setAttribute('aria-label',input === signupConfirm ? '확인 비밀번호 표시' : '비밀번호 표시');
    });
    if (show) { signupEmail.value = email.value; setSignupStep(1); }
    else { email.value = signupEmail.value; email.focus(); }
  }
  signupSwitch.addEventListener('click', () => showSignup(signup.hidden));
  signup.querySelectorAll('[data-signup-toggle]').forEach(button => button.addEventListener('click', () => {
    const input = byId(button.dataset.signupToggle), visible = input.type === 'password';
    input.type = visible ? 'text' : 'password'; button.setAttribute('aria-pressed', String(visible));
    button.setAttribute('aria-label', (input === signupConfirm ? '확인 비밀번호 ' : '비밀번호 ') + (visible ? '숨기기' : '표시'));
  }));
  byId('signup-next').addEventListener('click', () => {
    if (!ready || busy) return;
    signupEmail.value = signupEmail.value.trim();
    if (!signupEmail.reportValidity() || !signupPassword.reportValidity()) return;
    signupConfirm.value = ''; setSignupStep(2);
  });
  byId('signup-back').addEventListener('click', () => { if (!busy) { signupConfirm.value = ''; setSignupStep(1); } });
  signup.addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready || busy) return;
    if (signupStep === 1) { byId('signup-next').click(); return; }
    if (!signupConfirm.reportValidity()) return;
    if (signupPassword.value !== signupConfirm.value) {
      signupMessage('비밀번호가 일치하지 않습니다. 다시 확인해주세요.', 'error'); signupConfirm.focus(); return;
    }
    controls(true); signup.setAttribute('aria-busy','true'); signupMessage('계정을 만들고 있습니다.');
    try {
      await sdk.setPersistence(auth, sdk.browserSessionPersistence);
      await sdk.createUserWithEmailAndPassword(auth, signupEmail.value.trim(), signupPassword.value);
      signupPassword.value = ''; signupConfirm.value = '';
    } catch (error) {
      const msg = error?.code === 'auth/email-already-in-use' ? '이미 사용 중이거나 가입할 수 없는 이메일입니다.'
        : error?.code === 'auth/weak-password' ? '비밀번호가 보안 조건에 맞지 않습니다. 더 안전한 비밀번호를 사용해주세요.'
        : error?.code === 'auth/invalid-email' ? '이메일 주소를 확인해주세요.'
        : error?.code === 'auth/network-request-failed' ? '연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해주세요.'
        : error?.code === 'auth/too-many-requests' ? '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
        : '회원가입을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.';
      signupMessage(msg, 'error');
    } finally { signup.removeAttribute('aria-busy'); controls(false); }
  });

  retry.addEventListener('click', () => location.reload());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready || busy || !form.reportValidity()) return;
    controls(true); message('로그인하고 있습니다.');
    try {
      await sdk.setPersistence(auth, byId('auth-remember').checked ? sdk.browserLocalPersistence : sdk.browserSessionPersistence);
      await sdk.signInWithEmailAndPassword(auth, email.value.trim(), password.value);
      password.value = '';
    } catch (error) {
      message(errorText(error), 'error');
      password.value = '';
      password.focus();
    } finally { controls(false); }
  });
  reset.addEventListener('click', async () => {
    if (!ready || busy) return;
    if (!email.reportValidity()) return;
    if (Date.now() < resetUntil) { message('잠시 후 다시 요청해주세요.'); return; }
    controls(true); submitLabel.textContent = '전송 중…';
    try {
      await sdk.sendPasswordResetEmail(auth, email.value.trim());
      resetUntil = Date.now() + 60000;
      message('등록된 이메일이라면 비밀번호 재설정 메일이 전송됩니다. 메일함을 확인해주세요.', 'success');
    } catch (error) {
      if (error?.code === 'auth/user-not-found') {
        resetUntil = Date.now() + 60000;
        message('등록된 이메일이라면 비밀번호 재설정 메일이 전송됩니다. 메일함을 확인해주세요.', 'success');
      } else message(errorText(error), 'error');
    } finally { controls(false); }
  });

  function authChanged(user) {
    if (!user) { showLogin(); return; }
    const target = new URL('dashboard.html', location.href);
    target.hash = location.hash;
    location.replace(target.href);
  }
  const timeout = setTimeout(() => {
    message('연결이 지연되고 있습니다. 인터넷 연결을 확인해주세요.', 'error');
    retry.hidden = false;
  }, 15000);
  (async () => {
    try {
      ({auth, sdk} = await getSession());
      clearTimeout(timeout); retry.hidden = true;
      ready = true; controls(false);
      sdk.onAuthStateChanged(auth, authChanged, () => {
        showLogin(); message('로그인 상태를 확인하지 못했습니다. 다시 연결해주세요.', 'error');
        ready = false; controls(false); retry.hidden = false;
      });
    } catch {
      clearTimeout(timeout); showLogin(); ready = false; controls(false);
      message('로그인 서비스에 연결하지 못했습니다. 인터넷 연결을 확인해주세요.', 'error');
      retry.hidden = false;
    }
  })();
})();
