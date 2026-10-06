#!/usr/bin/env python3
"""Ekonomik takvim — ücretsiz kaynaklardan data/econ.json (GitHub Actions'ta çalışır).

Kaynaklar (bağımsız; biri düşerse diğeriyle devam edilir):
  nasdaq  Nasdaq.com ekonomik takvim API'si (anahtarsız) — ABD; gerçekleşen, beklenti, önceki (Türkiye'yi kapsamıyor)
  ff      ForexFactory haftalık JSON'u (anahtarsız) — yalnızca bu hafta, ABD; önem derecesi, beklenti, önceki
Seçim: yalnızca aşağıdaki KURALLAR listesindeki göstergeler alınır (önem derecesi ve Türkçe ad buradan gelir).
Birleştirme: önceki econ.json'daki olaylar korunur, yeni gelen dolu alanlar üzerine yazılır; [bugün−10, bugün+35] dışı atılır.
Kullanım: python3 tools/fetch_econ.py [--dry] [--probe]   (--probe: Nasdaq ham satırlarını basar)
TR olayları: önceki econ.json'dan korunur (TÜİK/TCMB takvimi); Nasdaq ve ForexFactory Türkiye vermez.
Çıktı: data/econ.json, tanı: data/_diag/econ.json"""
import datetime as dt, html, json, os, re, sys, time, traceback
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_ext as fx

BROWSER = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
           'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9',
           'Origin': 'https://www.nasdaq.com', 'Referer': 'https://www.nasdaq.com/'}
TODAY = dt.datetime.now(dt.timezone.utc).date()
PROBE = '--probe' in sys.argv
ET = ZoneInfo('America/New_York')
BACK, FWD = 10, 35
DEF_HOUR = {'US': '12:30', 'TR': '07:00'}

# (ülke, regex [küçük harf ad], Türkçe ad, önem, kategori, birim, dönem gecikmesi, iyi yön)
# gecikme: ay sayısı | 'w' haftalık başvuru haftası | 'q' önceki çeyrek | None dönem yok. iyi yön: +1 yüksek iyi, -1 düşük iyi.
RULES = [
    ('US', r'initial jobless claims', 'Haftalık işsizlik başvuruları', 3, 'labor-market', 'K', 'w', -1),
    ('US', r'^(?!.*adp)(?!.*private)non.?farm payrolls?(?!.*private)', 'Tarım dışı istihdam', 3, 'labor-market', 'K', 1, 1),
    ('US', r'^unemployment rate', 'İşsizlik oranı', 3, 'labor-market', '%', 1, -1),
    ('US', r'average hourly earnings.*(mom|m/m)', 'Ortalama saatlik kazanç (aylık)', 3, 'labor-market', '%', 1, None),
    ('US', r'^(?!.*weekly)adp (non.?farm )?employment(?!.*weekly)', 'ADP özel sektör istihdamı', 3, 'labor-market', 'K', 1, 1),
    ('US', r'jolts', 'JOLTS iş ilanları', 3, 'labor-market', 'M', 1, 1),
    ('US', r'core pce.*(mom|m/m)', 'Çekirdek PCE (aylık)', 3, 'inflation', '%', 1, -1),
    ('US', r'^pce price index.*(yoy|y/y)', 'PCE enflasyonu (yıllık)', 3, 'inflation', '%', 1, -1),
    ('US', r'core (cpi|inflation rate).*(mom|m/m)', 'Çekirdek TÜFE (aylık)', 3, 'inflation', '%', 1, -1),
    ('US', r'^(cpi|inflation rate|consumer price index).*(yoy|y/y)', 'TÜFE (yıllık)', 3, 'inflation', '%', 1, -1),
    ('US', r'^(cpi|inflation rate|consumer price index).*(mom|m/m)', 'TÜFE (aylık)', 3, 'inflation', '%', 1, -1),
    ('US', r'^(ppi|producer price index).*(yoy|y/y)', 'ÜFE (yıllık)', 3, 'inflation', '%', 1, -1),
    ('US', r'ism manufacturing pmi', 'ISM imalat', 3, 'economic-activity', None, 1, 1),
    ('US', r'ism (services|non.?manufacturing) pmi', 'ISM hizmet', 3, 'economic-activity', None, 1, 1),
    ('US', r'gdp.*(qoq|q/q|growth rate|annuali)', 'GSYH (çeyreklik)', 3, 'economic-activity', '%', 'q', 1),
    ('US', r'^retail sales.*(mom|m/m)(?!.*ex)', 'Perakende satışlar', 3, 'consumption', '%', 1, 1),
    ('US', r'^retail sales$', 'Perakende satışlar', 3, 'consumption', '%', 1, 1),
    ('US', r'(trade balance|balance of trade)', 'Dış ticaret dengesi', 3, 'economic-activity', 'B USD', 2, 1),
    ('US', r'^durable goods orders(?!.*ex)', 'Dayanıklı mal siparişleri (aylık)', 3, 'economic-activity', '%', 1, 1),
    ('US', r'michigan.*(sentiment|confidence)', 'Michigan tüketici güveni', 3, 'consumption', None, 0, 1),
    ('US', r'(cb|conference board) consumer confidence', 'CB tüketici güveni', 3, 'consumption', None, 0, 1),
    ('US', r'(fed|fomc).*(interest rate decision|rate decision|funds rate)|^fed interest rate', 'Fed faiz kararı', 3, 'interest-rates', '%', None, None),
    ('US', r'fomc.*minutes', 'FOMC tutanakları', 3, 'central-banks', None, None, None),
    ('TR', r'(tcmb|cbrt|interest rate decision|one.?week repo|1.?week repo)', 'TCMB faiz kararı', 3, 'interest-rates', '%', None, None),
    ('TR', r'(mpc|ppk).*(summary|minutes)', 'PPK toplantı özeti', 2, 'central-banks', None, None, None),
    ('TR', r'(inflation rate|cpi|consumer price).*(yoy|y/y)', 'TÜFE (yıllık)', 3, 'inflation', '%', 1, -1),
    ('TR', r'(inflation rate|cpi|consumer price).*(mom|m/m)', 'TÜFE (aylık)', 3, 'inflation', '%', 1, -1),
    ('TR', r'(ppi|producer price).*(yoy|y/y)', 'Yİ-ÜFE (yıllık)', 2, 'inflation', '%', 1, -1),
    ('TR', r'unemployment rate', 'İşsizlik oranı', 2, 'labor-market', '%', 1, -1),
    ('TR', r'(trade balance|balance of trade)', 'Dış ticaret dengesi', 2, 'economic-activity', 'B USD', 1, 1),
    ('TR', r'current account', 'Cari işlemler dengesi', 2, 'capital-flows', 'B USD', 2, 1),
    ('TR', r'industrial production.*(yoy|y/y)', 'Sanayi üretimi (yıllık)', 2, 'economic-activity', '%', 2, 1),
    ('TR', r'retail sales.*(yoy|y/y)', 'Perakende satışlar (yıllık)', 2, 'consumption', '%', 2, 1),
    ('TR', r'capacity utili', 'Kapasite kullanım oranı', 2, 'economic-activity', '%', 0, 1),
    ('TR', r'consumer confidence', 'Tüketici güveni', 2, 'consumption', None, 0, 1),
    ('TR', r'(business|real sector) confidence', 'Reel kesim güven endeksi', 2, 'economic-activity', None, 0, 1),
    ('TR', r'economic (confidence|sentiment)', 'Ekonomik güven endeksi', 2, 'economic-activity', None, 0, 1),
    ('TR', r'manufacturing pmi', 'İSO imalat PMI', 2, 'economic-activity', None, 1, 1),
    ('TR', r'gdp.*(yoy|y/y|growth rate)', 'GSYH (yıllık)', 3, 'economic-activity', '%', 'q', 1),
]
RX = [(c, re.compile(p), *rest) for c, p, *rest in RULES]
COUNTRY = {'united states': 'US', 'us': 'US', 'usa': 'US', 'usd': 'US', 'turkey': 'TR', 'türkiye': 'TR', 'turkiye': 'TR', 'tr': 'TR', 'try': 'TR'}


def match(c, name):
    n = name.lower().strip()
    for cc, rx, tr, imp, cat, unit, lag, good in RX:
        if cc == c and rx.search(n):
            if tr in ('GSYH (çeyreklik)', 'Michigan tüketici güveni', 'Dış ticaret dengesi'):
                for k, v in (('adv', 'öncü'), ('prel', 'öncü'), ('flash', 'öncü'), ('second', 'ikinci'), ('2nd', 'ikinci'),
                             ('third', 'nihai'), ('3rd', 'nihai'), ('final', 'nihai')):
                    if k in n:
                        tr = tr[:-1] + f', {v})' if tr.endswith(')') else f'{tr} ({v})'
                        break
            return tr, imp, cat, unit, lag, good
    return None


def michigan_tag(e):
    if e and e['tr'] == 'Michigan tüketici güveni':
        e['tr'] += ' (öncü)' if int(e['date'][8:10]) <= 15 else ' (nihai)'
    return e


def num(s):
    if s is None:
        return None, None
    s = html.unescape(str(s)).replace('\xa0', ' ').strip()
    if not s or s in ('-', '--', 'N/A', 'n/a'):
        return None, None
    m = re.search(r'(-?)\$?\s*(-?[\d,]*\.?\d+)\s*([%KMBT]?)', s, re.I)
    if not m:
        return None, None
    v = float(m.group(2).replace(',', ''))
    if m.group(1) == '-' and v > 0:
        v = -v
    return v, (m.group(3).upper() or None)


def period(d, lag):
    if lag is None:
        return None
    if lag == 'w':
        return (d - dt.timedelta(days=(d.weekday() - 5) % 7 or 7)).isoformat()
    if lag == 'q':
        q = (d.month - 1) // 3  # önceki çeyrek
        y = d.year if q else d.year - 1
        return f'{y}-Q{q or 4}'
    y, m = d.year, d.month - lag
    while m < 1:
        m += 12
        y -= 1
    return f'{y}-{m:02d}'


def build(c, name, when, act, fc, prev, src):
    r = match(c, name)
    if not r:
        return None
    tr, imp, cat, unit, lag, good = r
    a, ua = num(act)
    f, uf = num(fc)
    p, up = num(prev)
    if unit is None:
        unit = ua or uf or up
        unit = unit if unit in ('%', 'K', 'M', 'B') else None
    sur = round(a - f, 4) if a is not None and f is not None else None
    better = (sur * good > 0) if (sur not in (None, 0) and good) else None
    return michigan_tag({'date': when, 'c': c, 'name': name.strip(), 'tr': tr, 'imp': imp, 'cat': cat, 'act': a, 'fc': f, 'prev': p,
            'unit': unit, 'sur': sur, 'better': better, 'period': period(dt.date.fromisoformat(when[:10]), lag), '_src': src})


def nasdaq(diag):
    out, sample, fails = [], None, 0
    for i in range(-BACK + 1, FWD + 2):
        d = TODAY + dt.timedelta(days=i)
        if d.weekday() == 0:  # pazartesi sorgusu pazar olaylarını getirir
            continue
        try:
            j = json.loads(fx.get(f'https://api.nasdaq.com/api/calendar/economicevents?date={d.isoformat()}', headers=BROWSER, tries=2, timeout=20))
        except Exception as e:
            fails += 1
            diag.setdefault('nasdaq_errs', []).append(f'{d}: {type(e).__name__} {str(e)[:80]}')
            if fails >= 4 and not out:
                diag['nasdaq_dead'] = True
                break
            continue
        rows = ((j.get('data') or {}).get('rows')) or []
        if PROBE and abs(i) <= 4:
            for r in rows:
                if COUNTRY.get(str(r.get('country') or '').strip().lower()):
                    print('PROBE', d, r.get('gmt'), r.get('country'), '|', r.get('eventName'), '|', r.get('actual'), r.get('consensus'), r.get('previous'))
        for r in rows:
            c = COUNTRY.get(str(r.get('country') or '').strip().lower())
            if not c:
                continue
            if sample is None:
                sample = r
            # Nasdaq: sorgu günü D'nin satırları D−1 gününe ait; 'gmt' alanı aslında New York saati (CI incelemesiyle doğrulandı).
            ev_day = d - dt.timedelta(days=1)
            t = str(r.get('gmt') or r.get('time') or '').strip()
            if re.fullmatch(r'\d{1,2}:\d{2}', t):
                hh, mm = map(int, t.split(':'))
                when = dt.datetime(ev_day.year, ev_day.month, ev_day.day, hh, mm, tzinfo=ET).astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:00Z')
            else:
                when = f'{ev_day.isoformat()}T{DEF_HOUR[c]}:00Z'
            e = build(c, str(r.get('eventName') or r.get('event') or ''), when, r.get('actual'), r.get('consensus'), r.get('previous'), 'nasdaq')
            if e:
                out.append(e)
        time.sleep(0.4)
    diag['nasdaq_sample'] = sample
    diag['nasdaq'] = len(out)
    return out


def ff(diag):
    out = []
    try:
        j = json.loads(fx.get('https://nfs.faireconomy.media/ff_calendar_thisweek.json', headers=BROWSER, tries=2, timeout=20))
    except Exception as e:
        diag['ff_err'] = f'{type(e).__name__} {str(e)[:80]}'
        return out
    for r in j or []:
        c = COUNTRY.get(str(r.get('country') or '').lower())
        if not c or str(r.get('impact')) not in ('High', 'Medium'):
            continue
        try:
            when = dt.datetime.fromisoformat(r['date']).astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:00Z')
        except Exception:
            continue
        e = build(c, str(r.get('title') or ''), when, r.get('actual'), r.get('forecast'), r.get('previous'), 'ff')
        if e:
            out.append(e)
    diag['ff'] = len(out)
    return out


def key(e):
    return (e['c'], e['tr'], e['date'][:10])


def merge(old, new):
    M = {key(e): dict(e) for e in old}
    for e in new:
        k = key(e)
        # Aynı gösterge ve dönem başka bir günde varsa (erteleme) eskisini kaldır.
        if e.get('period'):
            for k2 in [k2 for k2, v in M.items() if k2 != k and k2[:2] == k[:2] and v.get('period') == e['period']]:
                del M[k2]
        cur = M.get(k)
        if not cur:
            M[k] = dict(e)
            continue
        for f in ('date', 'name', 'act', 'fc', 'prev', 'unit', 'sur', 'better', 'period'):
            if e.get(f) is not None and not (f == 'date' and e.get('_src') == 'nasdaq' and cur.get('_src') == 'ff'):
                cur[f] = e[f]
        cur['imp'], cur['cat'] = max(cur.get('imp') or 0, e['imp']), e['cat']
        cur['_src'] = e.get('_src') or cur.get('_src')
    lo, hi = (TODAY - dt.timedelta(days=BACK)).isoformat(), (TODAY + dt.timedelta(days=FWD)).isoformat() + 'T99'
    ev = [v for v in M.values() if lo <= v['date'] <= hi]
    for v in ev:
        if v['c'] == 'TR' and v['tr'] in ('TCMB faiz kararı', 'TÜFE (yıllık)', 'TÜFE (aylık)'):
            v['imp'] = 3
    return sorted(ev, key=lambda v: (v['date'], v['c'], v['tr']))


def main():
    dry = '--dry' in sys.argv
    t0 = time.time()
    diag = {}
    old = fx.rd('econ.json', {}) or {}
    new = nasdaq(diag) + ff(diag)
    events = merge(old.get('events') or [], new)
    srcs = sorted({e.get('_src') for e in new if e.get('_src')})
    for e in events:
        e.pop('_src', None)
    out = {'updatedAt': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
           'source': 'Ücretsiz kaynaklar: ' + (' · '.join({'nasdaq': 'Nasdaq.com ekonomik takvim', 'ff': 'ForexFactory'}[s] for s in srcs) or 'önceki dosya'),
           'events': events}
    diag.update({'at': out['updatedAt'], 'sec': round(time.time() - t0, 1), 'new': len(new), 'total': len(events)})
    print(json.dumps(diag, ensure_ascii=False, indent=1, default=str)[:4000])
    if dry:
        for e in events:
            print(e['date'][:16], e['c'], e['imp'], e['tr'], e['act'], e['fc'], e['prev'], e['unit'], e['period'])
        return
    fx.wr('_diag/econ.json', diag)
    if not new:
        print('yeni olay yok; econ.json değiştirilmedi')
        return
    fx.wr('econ.json', out)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
