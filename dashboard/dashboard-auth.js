import {getSession} from './auth-session.js';
const dashboard = document.getElementById('studio-dashboard');
const logout = document.getElementById('auth-logout');
const status = document.getElementById('auth-dashboard-status');
let revision = 0;
let signingOut = false;
function returnToLogin() {
  dashboard.hidden = true;
  dashboard.inert = true;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  document.querySelectorAll('audio,video').forEach(media => media.pause());
  const target = new URL('login.html', location.href);
  target.hash = location.hash;
  location.replace(target.href);
}
try {
  const {auth, sdk} = await getSession();
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    status.textContent = '';
    signingOut = true;
    try { await sdk.signOut(auth); returnToLogin(); }
    catch { signingOut = false; status.textContent = '로그아웃하지 못했습니다. 다시 시도해주세요.'; logout.disabled = false; }
  });
  sdk.onAuthStateChanged(auth, async user => {
    const current = ++revision;
    if (!user) { if (!signingOut) returnToLogin(); return; }
    try {
      document.body.dataset.authState = 'opening';
      dashboard.hidden = false;
      await window.StudioBoot();
      if (current !== revision || !auth.currentUser) return;
      dashboard.inert = false;
      document.body.dataset.authState = 'authenticated';
      logout.disabled = false;
      logout.title = `${user.email || ''} 로그아웃`;
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('studio-ready'));
    } catch {
      dashboard.hidden = false;
      dashboard.inert = false;
      document.body.dataset.authState = 'authenticated';
      status.textContent = '대시보드를 불러오지 못했습니다. 새로고침해주세요.';
    }
  }, returnToLogin);
} catch { returnToLogin(); }
