#!/usr/bin/env python3
"""Artifact veritabanı dökümünden data/portfolio.json üretir.
Kullanım: python3 build_portfolio.py <dump_dir>
<dump_dir> altında instruments/, news/, events/, signals/ klasörleri (ArtifactData list out_dir çıktısı)."""
import json, sys, os, glob, datetime
src = sys.argv[1]
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
H = json.load(open(os.path.join(D, 'history.json')))
def coll(n):
    out = []
    for f in sorted(glob.glob(os.path.join(src, n, '*.json'))):
        d = json.load(open(f)); d['id'] = os.path.basename(f)[:-5]; out.append(d)
    return out
inst = {}
for d in coll('instruments'):
    d.pop('id', None); t = d['ticker']
    base = [c for dt, c in H.get(t, []) if dt <= f'{datetime.date.today().year - 1}-12-31']
    if base: d['ytdBase'] = base[-1]
    inst[t] = d
if len(inst) < 5: sys.exit('instruments eksik görünüyor, portfolio.json yazılmadı')
news = coll('news')
# GitHub Models'ın Actions'ta yazdığı haberler (data/news_ai.json) veritabanında yoksa da korunur
try:
    _u = {n.get('url') for n in news}
    news += [n for n in json.load(open(os.path.join(D, 'news_ai.json'))).get('items', []) if n.get('url') not in _u]
except FileNotFoundError:
    pass
news = sorted(news, key=lambda x: x.get('publishedAt', ''), reverse=True)[:80]
events = sorted(coll('events'), key=lambda x: x.get('date', ''))
signals = {s['ticker']: s for s in coll('signals') if s.get('ticker')}
out = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
       'instruments': inst, 'news': news, 'events': events, 'signals': signals}
json.dump(out, open(os.path.join(D, 'portfolio.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
# yeni enstrüman eklendiyse prices.json'da da yer aç
P = json.load(open(os.path.join(D, 'prices.json')))
for t, d in inst.items():
    P['quotes'].setdefault(t, {'price': d.get('price'), 'chg': d.get('dayChange'), 'pct': d.get('dayChangePct'),
                               'day': str(d.get('priceAsOf', ''))[:10], 'hi52': d.get('high52'), 'lo52': d.get('low52')})
json.dump(P, open(os.path.join(D, 'prices.json'), 'w'), separators=(',', ':'))
print(f'{len(inst)} enstrüman, {len(news)} haber, {len(events)} olay, {len(signals)} sinyal')
