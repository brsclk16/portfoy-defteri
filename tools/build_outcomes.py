#!/usr/bin/env python3
"""Geçmiş haber ve olayların sonucunu çıkarır: beklenti neydi, ne oldu, takip edilen ETF/hisseler nasıl tepki verdi.
Girdi: data/portfolio.json (haberler, olaylar), history.json (kapanışlar), econ.json + macroev.json (makro beklenti/gerçekleşen),
news_raw.json + earnhist.json + earnings.json (bilanço HBK ve şirket tepkisi). Çıktı: data/outcomes.json.
Ücretsiz, anahtarsız; yalnızca repodaki verileri kullanır. Kayıtlar birikir (econ.json kısa pencereli olduğu için).
Kullanım: python3 tools/build_outcomes.py [--dry]"""
import json, os, sys, datetime as dt
from bisect import bisect_left, bisect_right

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
def load(n, default=None):
    try:
        return json.load(open(os.path.join(D, n)))
    except (FileNotFoundError, json.JSONDecodeError):
        return default

P = load('portfolio.json', {})
H = load('history.json', {})
OUT = os.path.join(D, 'outcomes.json')
prev = load('outcomes.json', {}) or {}
now = dt.datetime.now(dt.timezone.utc)
KEEP_DAYS = 60

def ts(s):
    try:
        return dt.datetime.fromisoformat(str(s).replace('Z', '+00:00'))
    except ValueError:
        return None

SER = {t: ([d for d, _ in v], [c for _, c in v]) for t, v in H.items() if isinstance(v, list) and v}
# history.json'da zaman zaman eksik günler oluyor; tam seri long_px.json'da (Yahoo düzeltilmiş kapanış). Önce o, sonra
# long_px'in son gününden sonraki günler için history.json.
_L = load('long_px.json', {}) or {}
for t, px in (_L.get('px') or {}).items():
    ld = _L.get('dates') or []
    pts = [(d, c) for d, c in zip(ld, px) if c is not None and d >= '2025-01-01']
    if not pts:
        continue
    last = pts[-1][0]
    pts += [(d, c) for d, c in H.get(t, []) if d > last] if isinstance(H.get(t), list) else []
    SER[t] = ([d for d, _ in pts], [c for _, c in pts])
TRACKED = [t for t in (P.get('instruments') or {}) if t in SER]

def wd_between(a, b):
    # a ile b arasındaki (ikisi hariç) hafta içi gün sayısı: >1 ise veri boşluğu var (bir tatil gününe izin verilir)
    return sum(1 for k in range(1, (b - a).days) if (a + dt.timedelta(days=k)).weekday() < 5)

def reaction(t, when, after_close):
    """Olayın fiyata ilk yansıdığı gün ve 5 işlem günü sonrası getirisi (%), SPY'a göre fark."""
    if t not in SER:
        return None
    ds, cs = SER[t]
    day = when.strftime('%Y-%m-%d')
    i = bisect_right(ds, day) - 1 if after_close else bisect_left(ds, day) - 1   # baz kapanış
    if i < 0 or i + 1 >= len(ds):
        return None
    # veri boşluğu (eksik günler) varsa tepkiyi başka günlere yanlış atamamak için atla
    ed = when.date()
    b0, b1 = dt.date.fromisoformat(ds[i]), dt.date.fromisoformat(ds[i + 1])
    if (ed - b0).days > 4 or (b1 - ed).days > 4 or wd_between(b0, b1) > 1:
        return None
    b = cs[i]
    r = {'t': t, 'base': ds[i], 'd1': round((cs[i + 1] / b - 1) * 100, 2), 'day1': ds[i + 1]}
    if i + 5 < len(ds) and (dt.date.fromisoformat(ds[i + 5]) - b0).days <= 10:
        r['d5'] = round((cs[i + 5] / b - 1) * 100, 2)
    if 'SPY' in SER and t != 'SPY':
        sd, sc = SER['SPY']
        if ds[i] in sd:
            j = sd.index(ds[i])
            if j + 1 < len(sd) and sd[j + 1] == ds[i + 1]:
                r['x1'] = round(r['d1'] - (sc[j + 1] / sc[j] - 1) * 100, 2)
            if 'd5' in r and j + 5 < len(sd):
                r['x5'] = round(r['d5'] - (sc[j + 5] / sc[j] - 1) * 100, 2)
    return r

def after_close(t0):
    # ABD seansı ~20:00 UTC'de kapanır (kışın 21:00); kapanış sonrası olay ertesi güne yansır
    lim = 20 if 3 <= t0.month <= 10 else 21
    return t0.hour >= lim

def verdict(sign, moves, key='x1', raw='d1'):
    vals = [m.get(key, m.get(raw)) for m in moves if m and m.get(key, m.get(raw)) is not None]
    if not vals or not sign:
        return None
    avg = sum(vals) / len(vals)
    s = sign * avg
    return 'tuttu' if s > 0.5 else 'ters' if s < -0.5 else 'etkisiz'

# ---------- haberler ----------
news_out = dict((prev.get('news') or {}))
for n in P.get('news') or []:
    t0 = ts(n.get('publishedAt'))
    if not t0 or (now - t0).days > KEEP_DAYS:
        continue
    news_out.pop(n.get('id'), None)   # kaynak hâlâ duruyorsa her seferinde yeniden hesapla
    tk = [t for t in (n.get('tickers') or []) if t in SER]
    if not tk:
        continue
    ac = after_close(t0)
    mv = [m for m in (reaction(t, t0, ac) for t in tk) if m]
    if not mv:
        continue
    sign = {'olumlu': 1, 'olumsuz': -1}.get(n.get('impact'))
    o = {'exp': n.get('impact'), 'moves': mv, 'v1': verdict(sign, mv)}
    if all('d5' in m for m in mv):
        o['v5'] = verdict(sign, mv, 'x5', 'd5')
    o['done'] = all('d5' in m for m in mv)
    news_out[n['id']] = o

# ---------- olaylar ----------
econ = (load('econ.json', {}) or {}).get('events') or []
mev = (load('macroev.json', {}) or {}).get('events') or []
raw = load('news_raw.json', {}) or {}
ehist = (load('earnhist.json', {}) or {}).get('data') or {}
cards = (load('earnings.json', {}) or {}).get('cards') or []
MK = [('PCE', 'PCE'), ('ISM', 'ISM'), ('tarım dışı', 'NFP'), ('istihdam', 'NFP'), ('GSYH', 'GDP'), ('büyüme', 'GDP'),
      ('TCMB', 'TCMB'), ('Fed', 'FOMC'), ('FOMC', 'FOMC'), ('TÜFE', 'CPI'), ('enflasyon', 'CPI')]

TRN = {'PCE': 'Çekirdek PCE', 'NFP': 'Tarım dışı istihdam', 'ISM': 'ISM imalat', 'GDP': 'GSYH', 'CPI': 'TÜFE',
       'FOMC': 'Fed politika faizi', 'TCMB': 'TCMB politika faizi', 'TR-TÜFE': 'Türkiye TÜFE'}

def macro_vals(e, t0):
    out = []
    title = e.get('title', '')
    tr = 'TCMB' in title or 'Türkiye' in title or 'TÜİK' in title
    for x in econ:
        tx = ts(x.get('date'))
        if not tx or abs((tx - t0).total_seconds()) > 3600 or x.get('act') is None:
            continue
        if (x.get('c') == 'TR') != tr or (x.get('imp') or 0) < 2:
            continue
        out.append({'name': x.get('tr') or x.get('name'), 'fc': x.get('fc'), 'act': x.get('act'), 'prev': x.get('prev'),
                    'unit': x.get('unit'), 'better': x.get('better')})
    if out:
        return out
    if 'tutanak' in title.lower() or 'minutes' in title.lower():
        return out
    k = next((v for w, v in MK if w.lower() in title.lower()), None)
    if k == 'CPI' and tr:
        k = 'TR-TÜFE'
    for x in mev:
        if x.get('k') == k and x.get('d') == t0.strftime('%Y-%m-%d') and x.get('act') is not None:
            nm = str(x.get('name') or '')
            sfx = ' (aylık)' if 'm/m' in nm.lower() or 'mom' in nm.lower() else ' (yıllık)' if 'y/y' in nm.lower() or 'yoy' in nm.lower() else ''
            out.append({'name': TRN.get(k, nm) + sfx, 'fc': x.get('fc'), 'act': x.get('act'), 'prev': x.get('prev'),
                        'unit': '%' if k in ('PCE', 'CPI', 'TR-TÜFE', 'GDP', 'TCMB', 'FOMC') else ('bin' if k == 'NFP' else None),
                        'better': x.get('better')})
    return out

def earn_vals(T, t0):
    o = {}
    d0 = t0.date()
    for e in raw.get('earnings') or []:
        if e.get('t') == T and abs((dt.date.fromisoformat(e['date']) - d0).days) <= 3:
            if e.get('epsEst') is not None: o['epsEst'] = round(e['epsEst'], 3)
            if e.get('epsAct') is not None: o['epsAct'] = round(e['epsAct'], 3)
            if e.get('revEst'): o['revEst'] = e['revEst']
            if e.get('revAct'): o['revAct'] = e['revAct']
    s = ((raw.get('signals') or {}).get(T) or {}).get('eps') or {}
    if 'epsAct' not in o and s.get('act') is not None and s.get('period'):
        lag = (d0 - dt.date.fromisoformat(s['period'][:10])).days
        if -10 <= lag <= 80:
            o['epsAct'] = round(s['act'], 3)
            o.setdefault('epsEst', round(s['est'], 3) if s.get('est') is not None else None)
    for c in cards:
        if c.get('t') == T and abs((dt.date.fromisoformat(c['date'][:10]) - d0).days) <= 3:
            e = c.get('eps') or {}
            if e.get('act') is not None: o['epsAct'] = e['act']
            if e.get('est') is not None: o['epsEst'] = e['est']
            if e.get('surprisePct') is not None: o['surprisePct'] = e['surprisePct']
            if c.get('guidance'): o['guidance'] = c['guidance']
            o['card'] = c.get('id')
    if o.get('epsAct') is not None and o.get('epsEst') and 'surprisePct' not in o:
        o['surprisePct'] = round((o['epsAct'] / o['epsEst'] - 1) * 100 * (1 if o['epsEst'] > 0 else -1), 1)
    for h in (ehist.get(T) or {}).get('hist') or []:
        if abs((dt.date.fromisoformat(h['d']) - d0).days) <= 3:
            if h.get('move') is not None: o['move'] = h['move']
            if h.get('move5') is not None: o['move5'] = h['move5']
            break
    return {k: v for k, v in o.items() if v is not None}

ev_out = dict((prev.get('events') or {}))
for e in P.get('events') or []:
    t0 = ts(e.get('date'))
    if not t0 or t0 > now or (now - t0).days > KEEP_DAYS:
        continue
    ev_out.pop(e.get('id'), None)
    kind = e.get('kind')
    o = {'kind': kind}
    if kind in ('makro', 'fed'):
        vals = macro_vals(e, t0)
        if vals:
            o['vals'] = vals
        tk = e.get('tickers') or TRACKED
    else:
        tk = list(e.get('tickers') or [])
        T = (e.get('holdings') or [None])[0] or (tk[0] if tk else None)
        if kind == 'bilanco' and T:
            o['co'] = T
            o.update(earn_vals(T, t0))
            if T in SER and T not in tk:
                tk = [T] + tk
    ac = after_close(t0)
    mv = [m for m in (reaction(t, t0, ac) for t in tk if t in SER) if m]
    if mv:
        mv.sort(key=lambda m: -abs(m.get('d1', 0)))
        o['moves'] = mv
    if kind == 'bilanco' and o.get('surprisePct') is not None:
        sp = o['surprisePct']
        o['beat'] = 'üstünde' if sp > 1 else 'altında' if sp < -1 else 'uyumlu'
    if len(o) > 1:
        o['done'] = bool(mv) and all('d5' in m for m in mv)
        ev_out[e['id']] = o

# eski kayıtları buda
cut = (now - dt.timedelta(days=KEEP_DAYS)).strftime('%Y%m%d')
news_out = {k: v for k, v in news_out.items() if k[:8] >= cut}
ev_out = {k: v for k, v in ev_out.items() if k[:8] >= cut}
res = {'updatedAt': now.strftime('%Y-%m-%dT%H:%M:%SZ'),
       'note': 'd1: olayın fiyata yansıdığı ilk işlem günü getirisi, d5: 5 işlem günü; x1/x5: SPY\'a göre fark (puan). '
               'v1/v5: haberin beklenen yönü (olumlu/olumsuz) SPY\'a göre ±0,5 puanı aştıysa "tuttu", ters yöndeyse "ters".',
       'news': news_out, 'events': ev_out}
if '--dry' in sys.argv:
    print(json.dumps(res, ensure_ascii=False, indent=1)[:4000])
else:
    json.dump(res, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'sonuç: {len(news_out)} haber, {len(ev_out)} olay')
