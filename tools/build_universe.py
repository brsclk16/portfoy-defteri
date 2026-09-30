#!/usr/bin/env python3
"""Geniş tarayıcı ve ısı haritası verisi: Bigdata.com şirket özetlerinden (company_overview + price_performance) çıkarılan
satırları data/universe.json'a birleştirir.
Kullanım: python3 tools/build_universe.py <jsonl dosyaları...> [--meta meta.json]
 Her satır: {"t":"NVDA","n":"NVIDIA Corporation","sec":"Technology","ind":"Semiconductors","mc":5.57e12,"px":230,"beta":2.2,
   "hi":236.5,"lo":164.3,"s50":216.5,"s200":199.7,"d1":0.5,"d5":3.6,"m1":5.8,"m3":18.0,"m6":37.3,"ytd":23.4,"y1":26.5,"pe":45.1,"asOf":"2026-09-29"}
   (yüzdeler yüzde cinsinden; bilinmeyen alanı koyma). {"t":..,"err":".."} satırları atlanır.
 meta.json: {"ndx":[...],"sp":[...],"hold":[...]} → her sembolün hangi listede olduğu (idx) yazılır. Verilmezse mevcut idx korunur.
Mevcut kayıtla birleştirir (yeni alanlar eskisinin üzerine yazılır)."""
import json, sys, os, datetime as dt
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); P = os.path.join(ROOT, 'data', 'universe.json')
args = sys.argv[1:]; meta = None
if '--meta' in args: i = args.index('--meta'); meta = json.load(open(args[i + 1])); del args[i:i + 2]
U = json.load(open(P)) if os.path.exists(P) else {'data': {}}
NUM = ['mc', 'px', 'beta', 'hi', 'lo', 's50', 's200', 'd1', 'd5', 'm1', 'm3', 'm6', 'ytd', 'y1', 'pe']
n = bad = 0
for f in args:
    for line in open(f, encoding='utf-8'):
        line = line.strip()
        if not line: continue
        try: r = json.loads(line)
        except Exception: bad += 1; continue
        t = str(r.get('t', '')).upper().strip()
        if not t or r.get('err'): continue
        cur = U['data'].get(t, {})
        for k in ['n', 'sec', 'ind', 'asOf']:
            if r.get(k): cur[k] = r[k]
        for k in NUM:
            v = r.get(k)
            if isinstance(v, (int, float)) and v == v: cur[k] = round(float(v), 4 if k == 'beta' else 2)
        if not (cur.get('px', 0) > 0): continue
        U['data'][t] = cur; n += 1
if meta:
    for t, v in U['data'].items():
        v['idx'] = [lab for k, lab in (('ndx', 'NDX'), ('sp', 'SPX'), ('hold', 'FON')) if t in meta.get(k, [])]
U['updatedAt'] = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
if not str(U.get('source', '')).startswith('Çok kaynaklı'): U['source'] = 'Bigdata.com (şirket özeti, fiyat performansı)'
json.dump(U, open(P, 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'{n} satır işlendi, {bad} bozuk satır; toplam {len(U["data"])} sembol')
