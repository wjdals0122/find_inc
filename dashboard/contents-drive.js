(() => {
  'use strict';
  const ROOT = '1rRp5lRjKKM3KSQo3JqfHZq1J54EpovDO';
  const CLIENT = '613731739866-6ff2vv89q9v1djvphh2682jdp15u9u15.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive';
  const FOLDER = 'application/vnd.google-apps.folder';
  let token = '', expires = 0, timer, client, sdkPromise, host, files = [], current = ROOT;
  let loading = false, message = '', updated = '', generation = 0, previewGeneration = 0;
  let controller = new AbortController();
  const urls = new Set();
  const previews = new Set();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const folder = id => id === ROOT ? {id: ROOT, name: 'Contents'} : files.find(f => f.id === id);
  const link = f => `https://drive.google.com/${f.mimeType === FOLDER ? 'drive/folders/' : 'file/d/'}${encodeURIComponent(f.id)}${f.mimeType === FOLDER ? '' : '/view'}`;
  const bytes = size => !size ? '' : Number(size) > 1048576 ? `${(Number(size)/1048576).toFixed(1)} MB` : `${Math.ceil(Number(size)/1024)} KB`;
  function releasePreview() {
    previewGeneration++;
    if (host) host.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
    previews.forEach(url => URL.revokeObjectURL(url)); previews.clear();
  }
  function release() {
    releasePreview();
    urls.forEach(url => URL.revokeObjectURL(url)); urls.clear();
  }
  function disconnect(text = '연결이 만료되었습니다. Google Drive를 다시 연결해주세요.') {
    token = ''; expires = 0; clearTimeout(timer); generation++;
    controller.abort(); controller = new AbortController(); loading = false;
    release(); files = []; updated = ''; current = ROOT; message = text; draw();
  }
  function sdk() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    return sdkPromise ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => { sdkPromise = null; script.remove(); reject(Error('Google 연결을 불러오지 못했습니다. 다시 시도해주세요.')); }, 15000);
      script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
      script.onload = () => { clearTimeout(timeout); resolve(); };
      script.onerror = () => { clearTimeout(timeout); sdkPromise = null; script.remove(); reject(Error('Google 연결을 불러오지 못했습니다. 인터넷 연결을 확인해주세요.')); };
      document.head.append(script);
    });
  }
  function initClient() {
    client ||= google.accounts.oauth2.initTokenClient({
      client_id: CLIENT, scope: SCOPE, include_granted_scopes: false,
      callback: response => {
        if (document.body.dataset.authState !== 'authenticated') return;
        if (response.error || !response.access_token) { message = 'Drive 연결이 완료되지 않았습니다. 다시 연결해주세요.'; draw(); return; }
        if (!google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)) { disconnect('Drive 권한을 허용해야 폴더를 볼 수 있습니다.'); return; }
        token = response.access_token; expires = Date.now() + Number(response.expires_in || 3600)*1000;
        clearTimeout(timer); timer = setTimeout(() => disconnect(), Math.max(0, expires-Date.now()-15000));
        refresh();
      },
      error_callback: () => { message = '연결 창이 닫혔거나 차단되었습니다. 팝업을 허용한 뒤 다시 연결해주세요.'; draw(); }
    });
  }
  function connect() {
    if (!window.google?.accounts?.oauth2) { message = 'Google 연결을 준비하고 있습니다. 잠시 후 연결 버튼을 눌러주세요.'; draw(); sdk().then(initClient).catch(error => { message = error.message; draw(); }); return; }
    initClient(); client.requestAccessToken({prompt: ''});
  }
  async function request(url) {
    if (!token || Date.now() >= expires-15000) { disconnect(); throw Error('Drive를 다시 연결해주세요.'); }
    const result = await fetch(url, {headers: {Authorization: `Bearer ${token}`}, signal: controller.signal, cache: 'no-store'});
    if (result.status === 401) { disconnect(); throw Error('Drive를 다시 연결해주세요.'); }
    if (!result.ok) {
      let reason = ''; try { reason = (await result.json()).error?.errors?.[0]?.reason || ''; } catch {}
      throw Error(result.status === 403 ? (reason === 'accessNotConfigured' ? 'Google Cloud에서 Drive API를 활성화해주세요.' : '이 파일을 볼 권한이 없거나 Drive API 사용이 제한되었습니다. 연결한 계정과 API 설정을 확인해주세요.') : result.status === 404 ? '폴더 또는 파일을 찾을 수 없습니다. 연결한 계정의 접근 권한을 확인해주세요.' : 'Drive 자료를 불러오지 못했습니다. 새로고침으로 다시 시도해주세요.');
    }
    return result;
  }
  async function refresh() {
    if (loading) return;
    release(); controller.abort(); controller = new AbortController();
    const run = ++generation; loading = true; message = ''; draw();
    const next = [], queue = [ROOT], visited = new Set();
    try {
      while (queue.length) {
        const parent = queue.shift(); if (visited.has(parent)) continue; visited.add(parent);
        let pageToken = '';
        do {
          const params = new URLSearchParams({q: `'${parent}' in parents and trashed = false`, pageSize:'1000', fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime,parents,thumbnailLink,shortcutDetails)', supportsAllDrives:'true', includeItemsFromAllDrives:'true'});
          if (pageToken) params.set('pageToken',pageToken);
          const data = await (await request(`https://www.googleapis.com/drive/v3/files?${params}`)).json();
          if (run !== generation) return;
          if (data.incompleteSearch) throw Error('Drive 검색 결과가 일부 누락되었습니다. 새로고침으로 다시 시도해주세요.');
          for (const f of data.files || []) { next.push({...f, parent}); if (f.mimeType === FOLDER) queue.push(f.id); }
          pageToken = data.nextPageToken || '';
        } while (pageToken);
      }
      files = next.sort((a,b) => (b.mimeType===FOLDER)-(a.mimeType===FOLDER) || a.name.localeCompare(b.name,'ko'));
      if (!folder(current)) current = ROOT;
      updated = new Date().toLocaleTimeString('ko-KR');
    } catch (error) { if (run === generation && error.name !== 'AbortError') message = error.message; }
    finally { if (run === generation) { loading = false; draw(); } }
  }
  function crumbs() {
    const path = []; let item = folder(current); const seen = new Set();
    while (item && !seen.has(item.id)) { seen.add(item.id); path.unshift(item); item = item.id === ROOT ? null : folder(item.parent); }
    return path.map(f => `<button class="drive-crumb" data-folder="${esc(f.id)}">${esc(f.name)}</button>`).join('<span aria-hidden="true">/</span>');
  }
  function cards(query = '') {
    const items = files.filter(f => query ? f.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) : f.parent === current);
    const grid = host?.querySelector('#drive-grid'); if (!grid) return;
    grid.innerHTML = items.length ? items.map(f => {
      const isFolder = f.mimeType === FOLDER, image = f.mimeType.startsWith('image/'), video = f.mimeType.startsWith('video/');
      return `<article class="panel drive-card"><button class="drive-card-open" ${isFolder ? `data-folder="${esc(f.id)}"` : `data-preview="${esc(f.id)}"`}><div class="drive-cover"><span aria-hidden="true">${isFolder ? '▱' : video ? '▷' : image ? '▧' : '≡'}</span>${(image || video) && f.thumbnailLink ? `<img data-thumb="${esc(f.id)}" alt="" loading="lazy">` : ''}<small>${isFolder ? 'FOLDER' : video ? 'VIDEO' : image ? 'IMAGE' : 'FILE'}</small></div><div class="drive-card-name">${esc(f.name)}</div></button><div class="drive-card-foot"><span>${esc(isFolder ? `${files.filter(x=>x.parent===f.id).length}개 항목` : bytes(f.size) || f.mimeType.split('/').pop())}</span><a href="${link(f)}" target="_blank" rel="noopener noreferrer">Drive에서 열기 ↗</a></div></article>`;
    }).join('') : `<div class="drive-empty">${loading ? '하위 폴더와 파일을 불러오고 있습니다…' : !token ? 'Google Drive를 연결하면 콘텐츠가 여기에 표시됩니다.' : query ? '검색 결과가 없습니다.' : '이 폴더는 비어 있습니다.'}</div>`;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return; observer.unobserve(entry.target); thumbnail(entry.target);
    }));
    grid.querySelectorAll('[data-thumb]').forEach(img => observer.observe(img));
    grid._observer?.disconnect(); grid._observer = observer;
  }
  async function thumbnail(img) {
    const f = files.find(x => x.id === img.dataset.thumb), run = generation;
    if (!f?.thumbnailLink) return;
    try {
      const url = new URL(f.thumbnailLink);
      if (url.protocol !== 'https:' || !/(^|\.)(googleusercontent\.com|googleapis\.com|google\.com)$/.test(url.hostname)) return;
      const blob = await (await request(url.href)).blob();
      if (run !== generation || !img.isConnected) return;
      const src = URL.createObjectURL(blob); urls.add(src); img.src = src;
    } catch { /* The file remains accessible through preview and Drive. */ }
  }
  async function preview(id) {
    const f = files.find(x=>x.id===id); if (!f) return;
    releasePreview(); const run = ++previewGeneration;
    const dialog = host.querySelector('#drive-preview');
    dialog.querySelector('h2').textContent = f.name;
    const anchor = dialog.querySelector('a'); anchor.href = link(f);
    const body = dialog.querySelector('.drive-preview-body');
    body.textContent = '미리보기를 불러오고 있습니다…'; dialog.showModal();
    if (!/^(image|video)\//.test(f.mimeType)) { body.textContent = '이 파일 형식은 Drive에서 열어 확인해주세요.'; return; }
    if (Number(f.size) > 250*1024*1024) { body.textContent = '250 MB를 넘는 파일은 Drive에서 열어 미리보기 해주세요.'; return; }
    if (f.mimeType.startsWith('video/')) body.textContent = `영상 ${bytes(f.size)}를 불러오고 있습니다. 파일 크기에 따라 시간이 걸릴 수 있습니다.`;
    try {
      const blob = await (await request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`)).blob();
      if (run !== previewGeneration || !dialog.open || !dialog.isConnected) return;
      const src = URL.createObjectURL(blob); previews.add(src);
      const media = document.createElement(f.mimeType.startsWith('video/') ? 'video' : 'img');
      if (media.tagName === 'VIDEO') { media.controls = true; media.playsInline = true; } else media.alt = f.name;
      media.onerror = () => { body.textContent = '이 브라우저에서 미리보기를 표시할 수 없습니다. Drive에서 열어주세요.'; };
      media.src = src; body.replaceChildren(media);
    } catch (error) { if (run === previewGeneration && error.name !== 'AbortError') body.textContent = error.message; }
  }
  function draw() {
    if (!host?.isConnected) return;
    host.querySelector('#drive-grid')?._observer?.disconnect(); release();
    const connected = !!token;
    host.innerHTML = `<section class="drive-workspace"><div class="drive-heading"><div><p class="drive-eyebrow">CONTENT LIBRARY</p><h2>콘텐츠 라이브러리</h2><p class="drive-description">Google Drive의 폴더와 제작 자료를 한곳에서 확인하세요.</p></div><div class="drive-actions"><button class="button strong" id="drive-connect">${connected ? '계정 다시 연결' : 'Google Drive 연결'}</button><button class="button" id="drive-refresh" ${!connected || loading ? 'disabled' : ''}>${loading ? '불러오는 중…' : '새로고침'}</button>${connected ? '<button class="quiet-link" id="drive-disconnect">연결 해제</button>' : ''}</div></div><div class="drive-summary"><span class="drive-dot ${connected?'connected':''}"></span><span>${connected ? 'Google Drive 연결됨' : 'Google Drive 연결 필요'}</span><span>${files.filter(f=>f.mimeType===FOLDER).length}개 폴더 · ${files.filter(f=>f.mimeType!==FOLDER).length}개 파일</span>${updated ? `<span>최근 갱신 ${esc(updated)}</span>` : ''}<a href="https://drive.google.com/drive/folders/${ROOT}" target="_blank" rel="noopener noreferrer">루트 폴더 열기 ↗</a></div><p class="drive-status" role="status" aria-live="polite">${esc(message)}</p><div class="drive-toolbar"><nav aria-label="Drive 폴더 경로">${crumbs()}</nav><label class="drive-search"><span class="sr-only">전체 하위 폴더와 파일 검색</span><input id="drive-search" type="search" placeholder="전체 폴더와 파일 검색" ${!connected?'disabled':''}></label></div><div class="drive-grid" id="drive-grid" aria-busy="${loading}"></div><dialog id="drive-preview" class="drive-preview"><div class="drive-preview-head"><h2></h2><button class="icon-button" id="drive-preview-close" aria-label="미리보기 닫기">✕</button></div><div class="drive-preview-body"></div><div class="drive-preview-foot"><a class="button" target="_blank" rel="noopener noreferrer">Drive에서 열기 ↗</a></div></dialog></section>`;
    host.querySelector('#drive-connect').onclick = connect;
    host.querySelector('#drive-refresh').onclick = refresh;
    const off = host.querySelector('#drive-disconnect'); if (off) off.onclick = () => disconnect('Google Drive 연결을 해제했습니다.');
    host.querySelector('#drive-search').oninput = event => cards(event.target.value.trim());
    host.querySelector('#drive-preview-close').onclick = () => host.querySelector('dialog').close();
    host.querySelector('dialog').onclose = releasePreview;
    host.onclick = event => {
      const target = event.target.closest('[data-folder],[data-preview]'); if (!target) return;
      if (target.dataset.folder) { current = target.dataset.folder; draw(); }
      else preview(target.dataset.preview);
    };
    cards();
  }
  window.ContentsDrive = {
    mount(element) { host = element; draw(); sdk().then(initClient).catch(error => { message = error.message; draw(); }); },
    unmount() { host?.querySelector('#drive-grid')?._observer?.disconnect(); release(); host = null; },
    clear() { disconnect('Google Drive를 연결해주세요.'); }
  };
  window.addEventListener('pagehide', () => disconnect('Google Drive를 연결해주세요.'));
})();
