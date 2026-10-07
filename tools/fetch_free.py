#!/usr/bin/env python3
"""Ücretsiz içgörü verisi (GitHub Actions'ta çalışır) — Bigdata.com kredisi bittiğinde boş kalan dosyalar için.

Parçalar (her biri bağımsız; biri düşerse diğerleri yazılır; hiçbir kaynak değer veremezse eski kayıt korunur):
  analysts   data/analysts.json   Yahoo Finance ortalama hedef fiyat + al/tut/sat (yedek: Nasdaq.com/Zacks konsensüsü);
                                  not/hedef değişiklikleri: Yahoo upgradeDowngradeHistory (son 14 gün)
  valuation  data/valuation.json  pe: Yahoo trailingPE; fpe: fiyat ÷ Nasdaq önümüzdeki 4 çeyrek EPS konsensüsü;
                                  eg: (o toplam ÷ son 4 çeyrek gerçekleşen EPS − 1)×100; peg = pe ÷ eg (0 < eg ≤ 100)
  earnhist   data/earnhist.json   Finnhub bilanço takvimi (tarih, bmo/amc) → tools/build_earnhist.py (fiyat tepkisi)
  dividends  data/dividends.json  Nasdaq.com temettü geçmişi
  inst13f    data/inst13f.json    Nasdaq.com kurumsal sahiplik (13F): sahiplik %, son çeyrek artıran/azaltan kurum sayısı, büyük kurumlar
  insider    data/insider.json    Nasdaq.com içeriden işlemler (son 90 gün; congress kısmına dokunmaz)
  peers      data/peers.json      Finnhub rakip listesi (yalnızca eksik olanlar)
  fundhold   data/fundhold.json   Yahoo topHoldings (fonların en büyük 10 varlığı; haftada bir yeni kayıt)
Kullanım: python3 tools/fetch_free.py [parça ...] [--dry] [--probe]   (boşsa hepsi; --dry dosya yazmaz)
Çıktı tanısı: data/_diag/free.json. Anahtarlar hiçbir dosyaya yazılmaz."""
import datetime as dt, http.cookiejar, json, os, re, subprocess, sys, tempfile, time, traceback, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_ext as fx  # rd / wr

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINNHUB = os.environ.get('FINNHUB_KEY', '').strip()
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
NASDAQ_H = {'User-Agent': UA, 'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://www.nasdaq.com', 'Referer': 'https://www.nasdaq.com/'}
CJ = http.cookiejar.CookieJar()
OP = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CJ))
NOW = dt.datetime.now(dt.timezone.utc)
TODAY = NOW.date()
STAMP = NOW.strftime('%Y-%m-%dT%H:%M:%SZ')
DRY = '--dry' in sys.argv
ALIAS = {'NOVO.B': 'NVO'}
COMMODITY = {'IAU', 'SLV', 'GLD', 'SIVR', 'PPLT', 'USO', 'UNG'}
DIAG = {'at': STAMP, 'parts': {}}


def us(t):
    return ALIAS.get(t, t).split(':')[0]


def get(url, headers=None, timeout=20, tries=2):
    h = {'User-Agent': UA, 'Accept': 'application/json, text/plain, */*'}
    h.update(headers or {})
    last = None
    for i in range(tries):
        try:
            with OP.open(urllib.request.Request(url, headers=h), timeout=timeout) as r:
                return r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 401, 403, 404):
                raise
        except Exception as e:
            last = e
        time.sleep(2 * (i + 1))
    raise last


def nasdaq(path):
    time.sleep(0.35)
    j = json.loads(get('https://api.nasdaq.com/api/' + path, NASDAQ_H))
    return j.get('data') or {}


_CRUMB = [None]


def yahoo_qs(sym, modules):
    if _CRUMB[0] is None:
        try:
            get('https://fc.yahoo.com', timeout=15, tries=1)
        except Exception:
            pass  # 404 döner ama çerezi ayarlar
        _CRUMB[0] = get('https://query1.finance.yahoo.com/v1/test/getcrumb', timeout=15).strip()
    u = (f'https://query2.finance.yahoo.com/v10/finance/quoteSummary/{urllib.parse.quote(sym)}'
         f'?modules={",".join(modules)}&crumb={urllib.parse.quote(_CRUMB[0])}')
    time.sleep(0.3)
    return json.loads(get(u))['quoteSummary']['result'][0]


def finnhub(path):
    if not FINNHUB:
        raise RuntimeError('FINNHUB_KEY yok')
    time.sleep(1.1)  # ücretsiz: dakikada 60
    sep = '&' if '?' in path else '?'
    return json.loads(get(f'https://finnhub.io/api/v1/{path}{sep}token={FINNHUB}'))


def num(v):
    if v is None:
        return None
    if isinstance(v, dict):
        v = v.get('raw')
    if isinstance(v, (int, float)):
        return float(v) if v == v else None
    s = str(v).strip().replace('$', '').replace(',', '').replace('%', '')
    if s.startswith('(') and s.endswith(')'):
        s = '-' + s[1:-1]
    try:
        return float(s)
    except ValueError:
        return None


def mdy(s):
    try:
        return dt.datetime.strptime(str(s).strip(), '%m/%d/%Y').date().isoformat()
    except Exception:
        return None


def r2(x):
    return None if x is None else round(x, 2)


# ------------------------------------------------------------------ semboller
def instruments():
    P = fx.rd('portfolio.json', {}) or {}
    return P.get('instruments', {}) or {}


def stocks():
    """Portföy + izleme listesindeki ABD'de işlem gören hisseler + fonların en büyük 5 ABD holdingi (tekrarsız)."""
    I = instruments()
    out = []
    for t, i in I.items():
        if i.get('type') == 'Hisse' and ':' not in t:
            out.append(t)
    for w in (fx.rd('watchlist.json', {}) or {}).get('tickers', []):
        t = w.get('t') if isinstance(w, dict) else w
        if t and ':' not in t and (not isinstance(w, dict) or w.get('kind') != 'etf'):
            out.append(t)
    U = (fx.rd('universe.json', {}) or {}).get('data', {})
    for t, i in I.items():
        if i.get('watchlist') or i.get('type') != 'ETF':
            continue
        n = 0
        for h in i.get('holdings') or []:
            s = h.get('t')
            if not s or (s not in U and s not in ALIAS):  # ABD dışı (evrende yoksa) atla
                continue
            out.append(s)
            n += 1
            if n >= 5:
                break
    seen, res = set(), []
    for t in out:
        if t not in seen:
            seen.add(t)
            res.append(t)
    return res


def price_of(t):
    U = (fx.rd('universe.json', {}) or {}).get('data', {})
    p = (U.get(t) or U.get(us(t)) or {}).get('px')
    if p:
        return p
    q = ((fx.rd('prices.json', {}) or {}).get('quotes') or {}).get(t) or {}
    return q.get('price')


# ------------------------------------------------------------------ parçalar
YCACHE = {}


def yahoo_stock(t):
    if t not in YCACHE:
        YCACHE[t] = yahoo_qs(us(t), ['financialData', 'recommendationTrend', 'upgradeDowngradeHistory', 'summaryDetail', 'price'])
    return YCACHE[t]


ACT = {'up': 'not yükseltme', 'down': 'not düşürme', 'init': 'kapsama başlatma'}


def part_analysts(diag):
    A = fx.rd('analysts.json', {}) or {}
    D = A.setdefault('data', {})
    syms = list(dict.fromkeys(stocks() + list(D)))
    ok = 0
    for t in syms:
        cur = D.setdefault(t, {'hist': [], 'changes': []})
        row, y = None, None
        try:
            y = yahoo_stock(t)
            fd = y.get('financialData') or {}
            tr = ((y.get('recommendationTrend') or {}).get('trend') or [{}])[0]
            pt = num(fd.get('targetMeanPrice'))
            if pt and tr and tr.get('period') == '0m':
                row = [TODAY.isoformat(), pt, int((tr.get('strongBuy') or 0) + (tr.get('buy') or 0)), int(tr.get('hold') or 0),
                       int((tr.get('sell') or 0) + (tr.get('strongSell') or 0))]
                cur['src'] = 'Yahoo Finance'
        except Exception as e:
            diag.setdefault('errs', []).append(f'{t} yahoo: {type(e).__name__} {str(e)[:60]}')
        if row is None:
            try:
                c = (nasdaq(f'analyst/{urllib.parse.quote(us(t))}/targetprice') or {}).get('consensusOverview') or {}
                pt = num(c.get('priceTarget'))
                if pt:
                    row = [TODAY.isoformat(), pt, int(num(c.get('buy')) or 0), int(num(c.get('hold')) or 0), int(num(c.get('sell')) or 0)]
                    cur['src'] = 'Nasdaq.com (Zacks konsensüsü)'
            except Exception as e:
                diag.setdefault('errs', []).append(f'{t} nasdaq: {type(e).__name__} {str(e)[:60]}')
        if row:
            h = [r for r in cur.get('hist', []) if r[0] != row[0]]
            h.append(row)
            cur['hist'] = sorted(h, key=lambda r: r[0])[-400:]
            ok += 1
        if y:
            cut = TODAY - dt.timedelta(days=14)
            new = []
            for g in ((y.get('upgradeDowngradeHistory') or {}).get('history') or []):
                try:
                    d = dt.datetime.fromtimestamp(int(g.get('epochGradeDate')), dt.timezone.utc).date()
                except Exception:
                    continue
                if d < cut:
                    continue
                a = ACT.get(g.get('action'))
                ptA, ptB = num(g.get('priorPriceTarget')), num(g.get('currentPriceTarget'))
                if not a:
                    pa = (g.get('priceTargetAction') or '').lower()
                    if ptA and ptB and ptB > ptA or pa.startswith('raise'):
                        a = 'hedef artırma'
                    elif ptA and ptB and ptB < ptA or pa.startswith('lower'):
                        a = 'hedef düşürme'
                if not a:
                    continue
                new.append({'d': d.isoformat(), 'firm': g.get('firm'), 'action': a, 'from': g.get('fromGrade') or None, 'to': g.get('toGrade') or None,
                            'ptFrom': ptA or None, 'ptTo': ptB or None, 'url': f'https://finance.yahoo.com/quote/{us(t)}/analysis/'})
            have = {(c['d'], c.get('firm'), c.get('action')) for c in cur.get('changes', [])}
            have |= {(c['d'], c.get('action'), c.get('ptTo')) for c in cur.get('changes', []) if c.get('ptTo')}
            add = [c for c in new if (c['d'], c['firm'], c['action']) not in have and (c['d'], c['action'], c['ptTo']) not in have]
            if add:
                cur['changes'] = sorted(add + cur.get('changes', []), key=lambda c: c['d'], reverse=True)[:30]
                diag.setdefault('changes', {})[t] = len(add)
        cur.setdefault('changes', [])
        if not cur.get('hist'):
            D.pop(t, None)
    A['updatedAt'] = STAMP
    diag['ok'] = ok
    diag['n'] = len(syms)
    return {'analysts.json': A} if ok else {}


def part_valuation(diag):
    V = fx.rd('valuation.json', {}) or {}
    D = V.setdefault('data', {})
    syms = list(dict.fromkeys(stocks() + [t for t in D if ':' not in t]))
    ok = 0
    for t in syms:
        s = urllib.parse.quote(us(t))
        rec = {}
        try:
            y = yahoo_stock(t)
            sd = y.get('summaryDetail') or {}
            pe = num(sd.get('trailingPE'))
            if pe and 0 < pe < 1000:
                rec['pe'] = r2(pe)
        except Exception as e:
            diag.setdefault('errs', []).append(f'{t} yahoo: {type(e).__name__}')
        try:
            fq = ((nasdaq(f'analyst/{s}/earnings-forecast').get('quarterlyForecast') or {}).get('rows') or [])[:4]
            fwd = [num(r.get('consensusEPSForecast')) for r in fq]
            hq = ((nasdaq(f'company/{s}/earnings-surprise').get('earningsSurpriseTable') or {}).get('rows') or [])[:4]
            trl = [num(r.get('eps')) for r in hq]
            px = price_of(t)
            if len(fwd) == 4 and None not in fwd and sum(fwd) > 0 and px:
                f = px / sum(fwd)
                if 0 < f < 1000:
                    rec['fpe'] = r2(f)
                if len(trl) == 4 and None not in trl and sum(trl) > 0:
                    eg = (sum(fwd) / sum(trl) - 1) * 100
                    rec['eg'] = r2(eg)
                    if rec.get('pe') and 0 < eg <= 100:
                        rec['peg'] = r2(rec['pe'] / eg)
        except Exception as e:
            diag.setdefault('errs', []).append(f'{t} nasdaq: {type(e).__name__} {str(e)[:60]}')
        if rec:
            rec['asOf'] = TODAY.isoformat()
            rec['src'] = 'free'
            D[t] = rec
            ok += 1
    V['updatedAt'] = STAMP
    V['source'] = 'Yahoo Finance (F/K) · Nasdaq.com/Zacks (EPS konsensüsü ve gerçekleşen)'
    V['note'] = 'PEG, beklenen EPS büyümesi %100’ü aşan (tek seferlik giderlerle bozulmuş) hisselerde gösterilmez.'
    diag['ok'] = ok
    diag['n'] = len(syms)
    return {'valuation.json': V} if ok else {}


def part_earnhist(diag):
    E = fx.rd('earnhist.json', {}) or {}
    syms = list(dict.fromkeys(stocks() + list((E.get('data') or {}))))
    evs = []
    for t in syms:
        try:
            j = finnhub(f'calendar/earnings?symbol={urllib.parse.quote(us(t))}&from={(TODAY - dt.timedelta(days=60)).isoformat()}'
                        f'&to={(TODAY + dt.timedelta(days=120)).isoformat()}')
        except Exception as e:
            diag.setdefault('errs', []).append(f'{t}: {type(e).__name__} {str(e)[:60]}')
            continue
        for r in j.get('earningsCalendar') or []:
            d = r.get('date')
            if not d:
                continue
            hr = {'bmo': '12:00:00', 'amc': '21:00:00'}.get(r.get('hour'), '16:00:00')
            q = f"Q{r['quarter']} {r['year']}" if r.get('quarter') and r.get('year') else None
            evs.append({'t': t, 'name': ((E.get('data') or {}).get(t) or {}).get('name'), 'dt': f'{d}T{hr}Z', 'q': q})
    diag['events'] = len(evs)
    if not evs:
        return {}
    if DRY:
        diag['sample'] = evs[:6]
        return {}
    with tempfile.TemporaryDirectory() as tmp:
        p = os.path.join(tmp, 'events.json')
        json.dump(evs, open(p, 'w'))
        r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'build_earnhist.py'), p, tmp], capture_output=True, text=True)
        diag['out'] = (r.stdout or '')[-800:]
        if r.returncode:
            raise RuntimeError((r.stderr or '')[-400:])
    E = fx.rd('earnhist.json', {}) or {}
    E['source'] = 'Finnhub (bilanço tarihleri) · fiyat geçmişi'
    return {'earnhist.json': E}


def part_dividends(diag):
    DV = fx.rd('dividends.json', {}) or {}
    D = DV.setdefault('data', {})
    I = instruments()
    syms = [t for t, i in I.items() if not i.get('watchlist') and ':' not in t] + [t for t in D if t not in I]
    ok = 0
    cut23 = '2023-01-01'
    for t in dict.fromkeys(syms):
        typ = (I.get(t) or {}).get('type') or ''
        if typ == 'Emtia tröstü' or t in COMMODITY:
            D[t] = {'pays': False, 'note': 'Emtia tröstü: dağıtım yapmaz', 'url': f'https://www.nasdaq.com/market-activity/etf/{t.lower()}/dividend-history'}
            continue
        ac = 'etf' if typ == 'ETF' else 'stocks'
        url = f'https://www.nasdaq.com/market-activity/{ac}/{us(t).lower()}/dividend-history'
        try:
            j = nasdaq(f'quote/{urllib.parse.quote(us(t))}/dividends?assetclass={ac}')
        except Exception as e:
            diag.setdefault('errs', []).append(f'{t}: {type(e).__name__} {str(e)[:60]}')
            continue
        rows = ((j.get('dividends') or {}).get('rows')) or []
        hist = []
        for r in rows:
            ex = mdy(r.get('exOrEffDate'))
            a = num(r.get('amount'))
            if not ex or a is None or (r.get('type') or 'Cash').lower() != 'cash':
                continue
            hist.append([ex, a, mdy(r.get('paymentDate'))])
        hist.sort(key=lambda r: r[0], reverse=True)
        if not hist:
            if j.get('dividends') is not None:
                D[t] = {'pays': False, 'url': url}
                ok += 1
            continue
        yr = [h for h in hist if h[0] >= (TODAY - dt.timedelta(days=370)).isoformat()]
        annual = round(sum(h[1] for h in yr), 4) if yr else None
        n = len(yr)
        freq = 'Aylık' if n >= 10 else 'Çeyreklik' if n >= 3 else '6 aylık' if n == 2 else 'Yıllık' if n == 1 else None
        px = price_of(t)
        rec = {'pays': True, 'freq': freq, 'yield': round(annual / px * 100, 2) if annual and px else None, 'annual': annual,
               'hist': [h for h in hist if h[0] >= cut23], 'url': url}
        D[t] = {k: v for k, v in rec.items() if v is not None}
        ok += 1
    DV['updatedAt'] = STAMP
    DV['source'] = 'Nasdaq.com'
    diag['ok'] = ok
    return {'dividends.json': DV} if ok else {}


def part_inst13f(diag):
    F = fx.rd('inst13f.json', {}) or {}
    D = F.setdefault('data', {})
    syms = list(dict.fromkeys([t for t in stocks() if t not in ALIAS][:12] + list(D)))
    ok = 0
    for t in syms:
        try:
            j = nasdaq(f'company/{urllib.parse.quote(us(t))}/institutional-holdings?limit=40&type=TOTAL&sortColumn=marketValue&sortOrder=DESC')
        except Exception as e:
            diag.setdefault('errs', []).append(f'{t}: {type(e).__name__} {str(e)[:60]}')
            continue
        os_ = j.get('ownershipSummary') or {}
        pct = num((os_.get('SharesOutstandingPCT') or {}).get('value'))
        tot = num((os_.get('ShareoutstandingTotal') or {}).get('value'))  # milyon
        pos = {r.get('positions'): r for r in ((j.get('activePositions') or {}).get('rows') or []) + ((j.get('newSoldOutPositions') or {}).get('rows') or [])}
        hv = lambda k, f: num((pos.get(k) or {}).get(f)) or 0
        px = price_of(t)
        rows = []
        for r in (((j.get('holdingsTransactions') or {}).get('table') or {}).get('rows') or []):
            sh, chs = num(r.get('sharesHeld')), num(r.get('sharesChange'))
            mv = num(r.get('marketValue'))
            mv = mv * 1000 if mv is not None else None
            chg = num(r.get('sharesChangePCT'))
            new = bool(sh and chs and abs(chs - sh) < 1)
            if mv is None or not (mv >= 250e6 or (chg is not None and abs(chg) >= 50 and mv >= 50e6) or (new and mv >= 50e6)):
                continue
            row = {'d': mdy(r.get('date')), 'h': r.get('ownerName'), 'sh': int(sh) if sh else None, 'mv': round(mv), 'chg': None if new else r2(chg),
                   'own': round(sh / (tot * 1e6) * 100, 3) if sh and tot else None}
            if new:
                row['new'] = True
            rows.append(row)
        rows = sorted(rows, key=lambda r: -r['mv'])[:12]
        if pct is None and not rows:
            continue
        inc = hv('Increased Positions', 'shares') + hv('New Positions', 'shares')
        dec = hv('Decreased Positions', 'shares') + hv('Sold Out Positions', 'shares')
        D[t] = {'instPct': pct, 'buyers12m': int(hv('Increased Positions', 'holders') + hv('New Positions', 'holders')),
                'sellers12m': int(hv('Decreased Positions', 'holders') + hv('Sold Out Positions', 'holders')),
                'inflow12m': round(inc * px) if px else None, 'outflow12m': round(dec * px) if px else None,
                'window': 'son çeyrek (13F); akışlar güncel fiyatla', 'rows': rows,
                'url': f'https://www.nasdaq.com/market-activity/stocks/{us(t).lower()}/institutional-holdings'}
        ok += 1
    F['updatedAt'] = STAMP
    F['source'] = 'Nasdaq.com (SEC 13F)'
    diag['ok'] = ok
    return {'inst13f.json': F} if ok else {}


def part_insider(diag):
    N = fx.rd('insider.json', {}) or {}
    T = N.setdefault('tickers', {})
    syms = list(dict.fromkeys([t for t in stocks() if ':' not in t] + list(T)))
    cut = (TODAY - dt.timedelta(days=90)).isoformat()
    ok = 0
    for t in syms:
        if t in ALIAS:
            continue
        try:
            j = nasdaq(f'company/{urllib.parse.quote(us(t))}/insider-trades?limit=200&type=ALL&sortColumn=lastDate&sortOrder=DESC')
        except Exception as e:
            diag.setdefault('errs', []).append(f'{t}: {type(e).__name__} {str(e)[:60]}')
            continue
        rows = (((j.get('transactionTable') or {}).get('table') or {}).get('rows')) or []
        rs = []
        for r in rows:
            d = mdy(r.get('lastDate'))
            if not d or d < cut:
                continue
            rs.append((d, r))
        mk, grants = [], 0
        for d, r in rs:
            ty = (r.get('transactionType') or '').lower()
            sh, p = num(r.get('sharesTraded')) or 0, num(r.get('lastPrice')) or 0
            if p > 0 and ('buy' in ty or 'sell' in ty):
                mk.append((d, r, 'buy' if 'buy' in ty else 'sell', sh * p))
            else:
                grants += 1
        people = {}
        for d, r, side, v in mk:
            k = r.get('insider') or ''
            p = people.setdefault(k, {'name': k, 'title': r.get('relation') or '', 'buy': 0.0, 'sell': 0.0, 'last': ''})
            p[side] += v
            p['last'] = max(p['last'], d)
        e = T.setdefault(t, {})
        e['insider'] = {'window': '90g', 'buyCount': sum(1 for x in mk if x[2] == 'buy'), 'sellCount': sum(1 for x in mk if x[2] == 'sell'),
                        'buyValue': round(sum(x[3] for x in mk if x[2] == 'buy')), 'sellValue': round(sum(x[3] for x in mk if x[2] == 'sell')),
                        'people': sorted(people.values(), key=lambda p: -(p['buy'] + p['sell']))[:8], 'grants': grants, 'src': 'Nasdaq.com'}
        if len(rows) >= 200 and rs and rs[-1][0] > cut:
            e['insider']['partial'] = True
        ok += 1
    N['updatedAt'] = STAMP
    diag['ok'] = ok
    return {'insider.json': N} if ok else {}


def part_peers(diag):
    P = fx.rd('peers.json', {}) or {}
    D = P.setdefault('data', {})
    I = instruments()
    want = [t for t, i in I.items() if i.get('type') == 'Hisse' and ':' not in t and not D.get(t)]
    want += [w.get('t') for w in (fx.rd('watchlist.json', {}) or {}).get('tickers', []) if isinstance(w, dict) and w.get('t') and ':' not in w['t']
             and w.get('kind') != 'etf' and not D.get(w['t'])]
    ok = 0
    for t in dict.fromkeys(want):
        try:
            L = [x for x in finnhub(f'stock/peers?symbol={urllib.parse.quote(us(t))}') if x and x != us(t) and '.' not in x][:6]
        except Exception as e:
            diag.setdefault('errs', []).append(f'{t}: {type(e).__name__} {str(e)[:60]}')
            continue
        if len(L) >= 3:
            D[t] = L
            ok += 1
    diag['ok'] = ok
    diag['n'] = len(want)
    if ok:
        P['updatedAt'] = STAMP
        return {'peers.json': P}
    return {}


def part_fundhold(diag):
    F = fx.rd('fundhold.json', {}) or {}
    D = F.setdefault('data', {})
    I = instruments()
    ok = 0
    for t, i in I.items():
        if i.get('watchlist') or i.get('type') != 'ETF':
            continue
        cur = D.get(t) or []
        if cur and cur[0].get('d', '') >= (TODAY - dt.timedelta(days=6)).isoformat():
            continue
        try:
            th = yahoo_qs(t, ['topHoldings']).get('topHoldings') or {}
        except Exception as e:
            diag.setdefault('errs', []).append(f'{t}: {type(e).__name__} {str(e)[:60]}')
            continue
        h = []
        for x in th.get('holdings') or []:
            w = num(x.get('holdingPercent'))
            s = (x.get('symbol') or '').split('.')[0] if (x.get('symbol') or '').endswith(('.L', '.TO', '.AX', '.ST', '.CO', '.HK', '.KS', '.TW')) else (x.get('symbol') or '')
            if w is None:
                continue
            h.append({'t': s or None, 'n': x.get('holdingName'), 'w': round(w * 100, 2)})
        if not h:
            continue
        rec = {'d': TODAY.isoformat(), 'h': h, 'src': 'Yahoo Finance (ilk 10)'}
        D[t] = [rec] + [r for r in cur if r.get('d') != rec['d']][:25]
        ok += 1
    diag['ok'] = ok
    if ok:
        F['updatedAt'] = STAMP
        return {'fundhold.json': F}
    return {}


PARTS = {'analysts': part_analysts, 'valuation': part_valuation, 'earnhist': part_earnhist, 'dividends': part_dividends,
         'inst13f': part_inst13f, 'insider': part_insider, 'peers': part_peers, 'fundhold': part_fundhold}


def main():
    want = [a for a in sys.argv[1:] if not a.startswith('--')] or list(PARTS)
    t0 = time.time()
    for name in want:
        d = DIAG['parts'].setdefault(name, {})
        t1 = time.time()
        try:
            out = PARTS[name](d)
            for fn, obj in out.items():
                if DRY:
                    s = json.dumps(obj, ensure_ascii=False)
                    d['preview'] = s[:1500]
                else:
                    fx.wr(fn, obj)
                d['wrote'] = d.get('wrote', []) + [fn]
        except Exception as e:
            d['fatal'] = f'{type(e).__name__}: {str(e)[:300]}'
            traceback.print_exc()
        d['sec'] = round(time.time() - t1, 1)
        if 'errs' in d:
            d['errs'] = d['errs'][:15]
        print(name, json.dumps({k: v for k, v in d.items() if k != 'preview'}, ensure_ascii=False)[:1500])
        if DRY and d.get('preview'):
            print('  önizleme:', d['preview'][:1500])
    DIAG['sec'] = round(time.time() - t0, 1)
    if not DRY:
        for p in DIAG['parts'].values():
            p.pop('preview', None)
        fx.wr('_diag/free.json', DIAG)


if __name__ == '__main__':
    main()
