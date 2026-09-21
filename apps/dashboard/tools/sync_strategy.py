"""Export the existing dashboard's Strategy catalog for the native app.
Run from repository root: python apps/dashboard/tools/sync_strategy.py
"""
import base64, gzip, hashlib, json, math, pathlib, re, struct, wave
ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / 'apps/dashboard/assets/strategy'
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'media').mkdir(exist_ok=True)
html = (ROOT / 'dashboard/dashboard.html').read_text(encoding='utf-8')
data = json.loads(gzip.decompress(base64.b64decode(re.search(r'id="studio-data-gzip">([^<]+)', html)[1])))
assets = {}
for name, uri in data['assets'].items():
    if not (name.startswith('01-strategy/') or name in ['studio/demo-character.svg', 'studio/ui-font.woff']): continue
    if not uri.startswith('data:'): continue
    header, encoded = uri.split(',', 1)
    ext = pathlib.PurePosixPath(name).suffix or '.bin'
    file = 'media/' + hashlib.sha256(name.encode()).hexdigest()[:20] + ext
    (OUT / file).write_bytes(base64.b64decode(encoded))
    assets[name] = {'file': 'assets/strategy/' + file, 'mime': header[5:].split(';')[0]}
    if ext == '.woff':
        from fontTools.ttLib import TTFont
        font = TTFont(OUT / file)
        font.flavor = None
        font_file = str(pathlib.PurePosixPath(file).with_suffix('.ttf'))
        font.save(OUT / font_file)
        assets[name]['fontFile'] = 'assets/strategy/' + font_file
documents = {}
for name, doc in data['documents'].items():
    if not (name.endswith('.md') and ('01-strategy/' in name or name.startswith('@report/'))): continue
    local = (ROOT / name).resolve()
    if local.is_relative_to(ROOT / '01-strategy') and local.is_file():
        doc = {**doc, 'body': local.read_text(encoding='utf-8')}
    documents[name] = doc
workspace = data['workspace']
for brand in workspace['brands']:
    for product in brand['products']:
        product['stages'] = {'strategy': product['stages']['strategy']}
result = {k:data[k] for k in ['profiles','resourceScopes','pathAliases','documentScopes']}
result.update(workspace=workspace, documents=documents, assets=assets)
(OUT/'catalog.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
# Same explicitly labelled demo sound as dashboard.html; not an official brand asset.
with wave.open(str(OUT/'sound-logo-demo.wav'),'wb') as w:
    w.setparams((1,2,22050,0,'NONE','not compressed'))
    frames=[]
    for i in range(22050*3):
        t=i/22050; s=0
        for start,freq in [(.12,523.25),(.54,659.25),(.98,783.99)]:
            d=t-start
            if d>=0:
                env=min(d/.025,1)*math.exp(-d*2.6)
                s+=(math.sin(2*math.pi*freq*d)*.13+math.sin(4*math.pi*freq*d)*.028)*env
        frames.append(struct.pack('<h',round(max(-1,min(1,s))*32767)))
    w.writeframes(b''.join(frames))
print(f"Exported {len(workspace['brands'])} brands, {len(documents)} documents, {len(assets)} assets")
