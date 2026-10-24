import json, pathlib, urllib.request, collections, re
ROOT = pathlib.Path(__file__).parent / 'research' / 'cpbl_raw'
ROOT.mkdir(parents=True, exist_ok=True)
def fetch(path, name):
    url = 'https://stats.cpbl.com.tw/api/proxy/v1/' + path
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0','Accept':'application/json'})
    raw = urllib.request.urlopen(req, timeout=60).read()
    (ROOT / name).write_bytes(raw)
    return json.loads(raw)
def walk(x, path='$'):
    if isinstance(x, dict):
        for k,v in x.items():
            yield path+'.'+k, v
            yield from walk(v,path+'.'+k)
    elif isinstance(x,list):
        for v in x: yield from walk(v,path+'[]')
reports=[]
for gid in ['2026-A-211','2026-D-166','2026-C-1']:
    data=fetch('games/'+gid,gid+'.json')
    inner=data.get('Data',data)
    game=inner.get('Game',inner)
    logs=game.get('LiveLog',[])
    schema=collections.Counter(p for p,v in walk(data))
    interesting={p:{'count':n} for p,n in schema.items() if re.search(r'ump|referee|catch|height|zone|sz_|challenge|overturn|review|abs',p,re.I)}
    calls=collections.Counter()
    located=0
    for row in logs:
        tm=row.get('Trackman') or {}
        call=((tm.get('Play') or {}).get('PitchTag') or {}).get('PitchCall')
        calls[str(call)]+=1
        loc=((tm.get('Pitch') or {}).get('Location') or {})
        located+=loc.get('PlateLocSide') is not None and loc.get('PlateLocHeight') is not None
    hits=[]
    for p,v in walk(data):
        if isinstance(v,str) and re.search(r'挑戰|改判|維持原判|ABS|電子好球',v,re.I): hits.append({'path':p,'value':v[:500]})
    sample=next((r for r in logs if (r.get('Trackman') or {}).get('Pitch')),None)
    report={'game_id':gid,'top_keys':list(data),'data_keys':list(inner),'game_keys':list(game),'log_count':len(logs),'located':located,'pitch_calls':dict(calls),'interesting_paths':interesting,'text_hits':hits,'sample':sample}
    reports.append(report)
    print(json.dumps({k:v for k,v in report.items() if k!='sample'},ensure_ascii=False))
(ROOT/'audit.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
