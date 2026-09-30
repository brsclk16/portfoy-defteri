#!/usr/bin/env python3
"""Fikir tarayıcı evreni — çok kaynaklı, çapraz doğrulamalı ücretsiz veri toplayıcı (GitHub Actions'ta çalışır).

Kaynaklar (her biri bağımsız; biri düşerse diğerleriyle devam edilir):
  yahoo   Yahoo Finance grafik API'si (anahtarsız) — 2 yıllık günlük kapanış → fiyat, dönem getirileri, 50/200g ort., 52h aralık
  stooq   Stooq (anahtarsız CSV) — son kapanış çapraz kontrolü; Yahoo düşerse günlük geçmiş yedeği
  nasdaq  Nasdaq.com API'si (anahtarsız) — son fiyat, F/K, piyasa değeri, 52h aralık, sektör (ABD listeli)
  finnhub Finnhub (FINNHUB_KEY) — anlık fiyat, son 12 ay F/K, beta, piyasa değeri, sektör
  fmp     Financial Modeling Prep (FMP_KEY, ücretsiz katman) — profil: piyasa değeri, beta, sektör
  twelve  Twelve Data (TWELVEDATA_KEY, isteğe bağlı) — Yahoo ve Stooq düşerse günlük geçmiş yedeği
  sec     SEC EDGAR companyfacts (SEC_UA) — seyreltilmiş hisse başı kârın son 4 çeyreği → F/K hesabı
Kural: her alan için mevcut kaynakların medyanı alınır; fiyat en az iki kaynakla doğrulanır (%1,5 tolerans),
F/K kaynakları %25'ten fazla ayrışırsa tanı dosyasına yazılır. Hiçbir kaynak bir değeri veremezse eski değer korunur.
Kullanım: python3 tools/fetch_universe.py [SEMBOL ...]   (boşsa tüm evren)
Çıktı: data/universe.json (birleştirerek), data/universe_list.json ("hold" yeniden hesaplanır), data/_diag/universe.json"""
import csv, datetime as dt, io, json, math, os, re, statistics as st, sys, time, traceback, urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_ext as fx  # get/jget/rd/wr, SEC yardımcıları

TODAY = dt.date.today()
FINNHUB = os.environ.get('FINNHUB_KEY', '').strip()
FMP = os.environ.get('FMP_KEY', '').strip()
TWELVE = os.environ.get('TWELVEDATA_KEY', '').strip()
SEC_UA = os.environ.get('SEC_UA', '').strip()
BROWSER = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
           'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9'}

# Yabancı borsada işlem gören semboller: evren sembolü → (Yahoo, Stooq, Finnhub). Nasdaq/FMP'de ABD dışı sembol denenmez.
FOREIGN = {'ANTO': ('ANTO.L', 'anto.uk', 'ANTO.L'), 'GLEN': ('GLEN.L', 'glen.uk', 'GLEN.L'), 'BOL': ('BOL.ST', None, 'BOL.ST'),
           'FM': ('FM.TO', None, 'FM.TO'), 'KGH': ('KGH.WA', 'kgh', 'KGH.WA')}
FCUR = {'ANTO': 'GBp', 'GLEN': 'GBp', 'BOL': 'SEK', 'FM': 'CAD', 'KGH': 'PLN'}
LABEL = {'ndx': 'NDX', 'sp': 'SPX', 'hold': 'FON'}


def ysym(t):
    return FOREIGN[t][0] if t in FOREIGN else t.replace('.', '-')


def ssym(t):
    return FOREIGN[t][1] if t in FOREIGN else t.lower().replace('.', '-') + '.us'


def fsym(t):
    return FOREIGN[t][2] if t in FOREIGN else t


def num(v):
    """'$1,234.5', '12.3%', 'N/A' gibi metinleri sayıya çevirir."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v) if v == v and not math.isinf(v) else None
    s = str(v).replace('$', '').replace(',', '').replace('%', '').strip()
    try:
        return float(s)
    except ValueError:
        return None


class Src:
    """Kaynak başına sayaç + devre kesici: art arda çok hata alan kaynak o çalışmada bırakılır."""
    def __init__(self, name, limit=8, pause=0.0):
        self.name, self.limit, self.pause = name, limit, pause
        self.ok = self.fail = self.streak = 0
        self.errs = []
        self.dead = False

    def call(self, fn, *a):
        if self.dead:
            return None
        try:
            r = fn(*a)
            if self.pause:
                time.sleep(self.pause)
            if r is None:
                self.fail += 1
                return None
            self.ok += 1
            self.streak = 0
            return r
        except Exception as e:
            self.fail += 1
            self.streak += 1
            if len(self.errs) < 12:
                self.errs.append(f'{a[0] if a else ""}: {type(e).__name__} {str(e)[:120]}')
            if self.pause:
                time.sleep(self.pause)
            if self.streak >= self.limit:
                self.dead = True
                self.errs.append(f'devre kesildi ({self.limit} ardışık hata)')
            return None

    def diag(self):
        return {'ok': self.ok, 'fail': self.fail, 'dead': self.dead, 'errs': self.errs}


# ---------------------------------------------------------------- günlük geçmişten ölçüler
def series_metrics(rows, cur=None):
    """rows: [(tarih 'YYYY-MM-DD', kapanış, yüksek, düşük)] eskiden yeniye. Dönem getirileri takvim tarihine göre:
    hedef tarihteki ya da ondan önceki son kapanışa kıyasla (ilk işlem günü hedeften sonraysa o dönem yazılmaz)."""
    rows = [r for r in rows if r[1] is not None and r[1] > 0]
    if len(rows) < 2:
        return None
    d_last = dt.date.fromisoformat(rows[-1][0])
    c0 = rows[-1][1]
    out = {'px': c0, 'asOf': rows[-1][0], 'd1': (c0 / rows[-2][1] - 1) * 100}
    if len(rows) > 5:
        out['d5'] = (c0 / rows[-6][1] - 1) * 100

    def back(target):
        if dt.date.fromisoformat(rows[0][0]) > target:
            return None
        prev = None
        for d, c, *_ in rows:
            if dt.date.fromisoformat(d) > target:
                break
            prev = c
        return prev

    def minus_months(d, m):
        y, mo = d.year, d.month - m
        while mo <= 0:
            mo += 12
            y -= 1
        day = min(d.day, [31, 29 if y % 4 == 0 and (y % 100 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1])
        return dt.date(y, mo, day)

    for k, m in (('m1', 1), ('m3', 3), ('m6', 6), ('y1', 12)):
        b = back(minus_months(d_last, m))
        if b:
            out[k] = (c0 / b - 1) * 100
    b = back(dt.date(d_last.year - 1, 12, 31))
    if b:
        out['ytd'] = (c0 / b - 1) * 100
    closes = [r[1] for r in rows]
    if len(closes) >= 50:
        out['s50'] = sum(closes[-50:]) / 50
    if len(closes) >= 200:
        out['s200'] = sum(closes[-200:]) / 200
    yr = [r for r in rows if dt.date.fromisoformat(r[0]) > minus_months(d_last, 12)]
    hs = [r[2] if r[2] else r[1] for r in yr]
    ls = [r[3] if r[3] else r[1] for r in yr]
    if hs:
        out['hi'], out['lo'] = max(hs), min(ls)
    if cur:
        out['cur'] = cur
    return out


# ---------------------------------------------------------------- kaynaklar
def yahoo_hist(t):
    s = urllib.parse.quote(ysym(t))
    for host in ('query1', 'query2'):
        try:
            j = json.loads(fx.get(f'https://{host}.finance.yahoo.com/v8/finance/chart/{s}?range=2y&interval=1d&includePrePost=false&events=div%2Csplit',
                                  headers=BROWSER, tries=2, timeout=15))
            break
        except Exception:
            if host == 'query2':
                raise
    r = (j.get('chart') or {}).get('result') or []
    if not r:
        return None
    r = r[0]
    ts = r.get('timestamp') or []
    q = (r.get('indicators') or {}).get('quote') or [{}]
    q = q[0]
    adj = ((r.get('indicators') or {}).get('adjclose') or [{}])[0].get('adjclose')
    off = (r.get('meta') or {}).get('gmtoffset') or 0
    rows = []
    for i, x in enumerate(ts):
        c = (q.get('close') or [None] * len(ts))[i]
        if c is None:
            continue
        d = dt.datetime.utcfromtimestamp(x + off).date().isoformat()
        rows.append((d, c, (q.get('high') or [None] * len(ts))[i], (q.get('low') or [None] * len(ts))[i]))
    meta = r.get('meta') or {}
    return {'rows': rows, 'cur': meta.get('currency'), 'name': meta.get('longName') or meta.get('shortName'),
            'last': meta.get('regularMarketPrice')}


def stooq_hist(t):
    s = ssym(t)
    if not s:
        return None
    txt = fx.get(f'https://stooq.com/q/d/l/?s={s}&i=d', headers=BROWSER, tries=1, timeout=15)
    if not txt.startswith('Date'):
        raise ValueError('CSV değil: ' + txt[:60].replace('\n', ' '))
    rows = []
    cut = (TODAY - dt.timedelta(days=760)).isoformat()
    for r in csv.DictReader(io.StringIO(txt)):
        if r['Date'] >= cut:
            rows.append((r['Date'], num(r.get('Close')), num(r.get('High')), num(r.get('Low'))))
    return {'rows': rows} if rows else None


def stooq_last(t):
    s = ssym(t)
    if not s:
        return None
    txt = fx.get(f'https://stooq.com/q/l/?s={s}&f=sd2t2ohlcv&h&e=csv', headers=BROWSER, tries=1, timeout=15)
    rr = list(csv.DictReader(io.StringIO(txt)))
    if not rr:
        return None
    c = num(rr[0].get('Close'))
    return {'px': c, 'date': rr[0].get('Date')} if c else None


def twelve_hist(t):
    if not TWELVE or t in FOREIGN:
        return None
    j = json.loads(fx.get(f'https://api.twelvedata.com/time_series?symbol={urllib.parse.quote(t)}&interval=1day&outputsize=520&format=JSON&apikey={TWELVE}', tries=2, timeout=20))
    if j.get('status') == 'error':
        raise ValueError(j.get('message', '')[:100])
    vals = j.get('values') or []
    rows = [(v['datetime'][:10], num(v['close']), num(v['high']), num(v['low'])) for v in reversed(vals)]
    time.sleep(8)  # ücretsiz katman: dakikada 8 kredi
    return {'rows': rows, 'cur': (j.get('meta') or {}).get('currency')}


def nasdaq(t):
    if t in FOREIGN:
        return None
    s = urllib.parse.quote(t.replace('.', '/'))
    out = {}
    try:
        j = json.loads(fx.get(f'https://api.nasdaq.com/api/quote/{s}/info?assetclass=stocks', headers=BROWSER, tries=1, timeout=15))
        d = j.get('data') or {}
        p = (d.get('primaryData') or {})
        out['px'] = num(p.get('lastSalePrice'))
        out['name'] = d.get('companyName')
    except Exception:
        pass
    j = json.loads(fx.get(f'https://api.nasdaq.com/api/quote/{s}/summary?assetclass=stocks', headers=BROWSER, tries=1, timeout=15))
    sd = ((j.get('data') or {}).get('summaryData') or {})
    val = lambda k: (sd.get(k) or {}).get('value')
    out['pe'] = num(val('PERatio'))
    out['mc'] = num(val('MarketCap'))
    out['sec'] = val('Sector')
    out['ind'] = val('Industry')
    hl = val('FiftTwoWeekHighLow') or val('FiftyTwoWeekHighLow')
    if hl and '/' in str(hl):
        a, b = str(hl).split('/')[:2]
        out['hi'], out['lo'] = num(a), num(b)
    out = {k: v for k, v in out.items() if v not in (None, '', 'N/A')}
    return out or None


def finnhub(t):
    if not FINNHUB:
        return None
    s = urllib.parse.quote(fsym(t))
    q = json.loads(fx.get(f'https://finnhub.io/api/v1/quote?symbol={s}&token={FINNHUB}', tries=2, timeout=15))
    time.sleep(1.05)
    m = json.loads(fx.get(f'https://finnhub.io/api/v1/stock/metric?symbol={s}&metric=all&token={FINNHUB}', tries=2, timeout=15))
    time.sleep(1.05)
    mm = m.get('metric') or {}
    out = {'px': num(q.get('c')) or None, 'd1': num(q.get('dp')), 'pe': num(mm.get('peTTM') or mm.get('peExclExtraTTM') or mm.get('peBasicExclExtraTTM')),
           'beta': num(mm.get('beta')), 'hi': num(mm.get('52WeekHigh')), 'lo': num(mm.get('52WeekLow'))}
    mc = num(mm.get('marketCapitalization'))
    if mc and t not in FOREIGN:
        out['mc'] = mc * 1e6
    out = {k: v for k, v in out.items() if v not in (None, 0)}
    return out or None


def finnhub_profile(t):
    if not FINNHUB:
        return None
    j = json.loads(fx.get(f'https://finnhub.io/api/v1/stock/profile2?symbol={urllib.parse.quote(fsym(t))}&token={FINNHUB}', tries=2, timeout=15))
    time.sleep(1.05)
    if not j:
        return None
    return {k: v for k, v in {'name': j.get('name'), 'ind': j.get('finnhubIndustry')}.items() if v}


def fmp(t):
    if not FMP or t in FOREIGN:
        return None
    j = json.loads(fx.get(f'https://financialmodelingprep.com/stable/profile?symbol={urllib.parse.quote(t.replace(".", "-"))}&apikey={FMP}', tries=1, timeout=15))
    if not j:
        return None
    j = j[0]
    out = {'px': num(j.get('price')), 'mc': num(j.get('marketCap')), 'beta': num(j.get('beta')), 'name': j.get('companyName'),
           'sec': j.get('sector'), 'ind': j.get('industry')}
    rg = j.get('range') or ''
    if '-' in rg:
        a, b = rg.split('-')[:2]
        out['lo'], out['hi'] = num(a), num(b)
    return {k: v for k, v in out.items() if v not in (None, '', 0)} or None


_CIK = None
_EPS = {}


def sec_eps_ttm(t):
    """Seyreltilmiş EPS'nin son 4 çeyreği (10-K'dan türetilen 4. çeyrek dahil). Yalnız us-gaap USD raporlayanlar."""
    global _CIK
    if not SEC_UA or t in FOREIGN:
        return None
    if _CIK is None:
        m = fx.jget('https://www.sec.gov/files/company_tickers.json')
        _CIK = {v['ticker'].upper(): int(v['cik_str']) for v in m.values()}
    c = _CIK.get(t.upper().replace('.', '-')) or _CIK.get(t.upper())
    if not c:
        return None
    cf = fx.jget(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{c:010d}.json')
    time.sleep(0.2)
    fl = cf.get('facts', {}).get('us-gaap', {}).get('EarningsPerShareDiluted', {}).get('units', {}).get('USD/shares', [])
    if not fl:
        return None
    q = fx.flow_quarters(fl)
    ends = sorted(q)
    if len(ends) < 4:
        return None
    last4 = ends[-4:]
    span = (fx.pd_(last4[-1]) - fx.pd_(last4[0])).days
    if span > 300 or (TODAY - fx.pd_(last4[-1])).days > 200:
        return None
    return {'eps': sum(q[e][0] for e in last4), 'end': last4[-1]}


# ---------------------------------------------------------------- birleştirme
def med(vals):
    v = [x for x in vals if isinstance(x, (int, float)) and x == x]
    return st.median(v) if v else None


def spread(vals):
    v = [x for x in vals if isinstance(x, (int, float)) and x > 0]
    return (max(v) / min(v) - 1) * 100 if len(v) >= 2 else 0.0


def recompute_hold():
    P = fx.rd('portfolio.json', {}) or {}
    wl = {w.get('t') if isinstance(w, dict) else w for w in ((fx.rd('watchlist.json', {}) or {}).get('tickers', []) or [])}
    hold = set()
    for k, x in (P.get('instruments') or {}).items():
        if x.get('watchlist') or k in wl:
            continue
        for h in (x.get('holdings') or [])[:10]:
            hold.add('NVO' if h.get('t') == 'NOVO.B' else h.get('t'))
        if x.get('type') == 'Hisse':
            hold.add('NVO' if k == 'NOVO.B' else k)
    return sorted(t for t in hold if t)


def main(only=None):
    t0 = time.time()
    L = fx.rd('universe_list.json', {}) or {}
    hold = recompute_hold()
    if hold and hold != L.get('hold'):
        L['hold'] = hold
        with open(os.path.join(fx.DATA, 'universe_list.json'), 'w', encoding='utf-8') as f:
            json.dump(L, f, ensure_ascii=False, indent=0)
    syms = []
    for k in ('ndx', 'sp', 'hold'):
        for t in L.get(k, []):
            if t != 'GOOG' and t not in syms:
                syms.append(t)
    if only:
        syms = [t for t in syms if t in only] + [t for t in only if t not in syms]
    U = fx.rd('universe.json', {'data': {}}) or {'data': {}}
    D = U.setdefault('data', {})
    S = {n: Src(n) for n in ('yahoo', 'stooq', 'nasdaq', 'finnhub', 'fmp', 'twelve', 'sec')}
    S['nasdaq'].pause = 0.35
    S['nasdaq'].limit = S['stooq'].limit = 4
    S['yahoo'].pause = 0.25
    S['stooq'].pause = 0.3
    flags, filled, stale = [], {}, []
    fxr = {}

    budget = float(os.environ.get('UNI_BUDGET_MIN', '30')) * 60
    for i, t in enumerate(syms):
        if time.time() - t0 > budget * 0.6:
            for n in ('nasdaq', 'stooq', 'fmp', 'sec', 'twelve'):
                if not S[n].dead:
                    S[n].dead = True
                    S[n].errs.append('süre bütçesi: bu çalışmada bırakıldı')
        if time.time() - t0 > budget:
            stale.extend(syms[i:])
            print('süre bütçesi doldu, kalan semboller eski değerleriyle kaldı', flush=True)
            break
        cur = D.get(t, {})
        before = set(k for k, v in cur.items() if v not in (None, ''))
        H = S['yahoo'].call(yahoo_hist, t)
        hsrc = 'yahoo'
        if not H or len(H.get('rows', [])) < 30:
            H, hsrc = S['stooq'].call(stooq_hist, t), 'stooq'
        if not H or len(H.get('rows', [])) < 30:
            H, hsrc = S['twelve'].call(twelve_hist, t), 'twelve'
        M = series_metrics(H['rows'], H.get('cur') or FCUR.get(t)) if H and H.get('rows') else None
        N = S['nasdaq'].call(nasdaq, t)
        F = S['finnhub'].call(finnhub, t)
        P = S['fmp'].call(fmp, t)
        SQ = S['stooq'].call(stooq_last, t) if hsrc != 'stooq' else None
        used = [hsrc] if M else []

        # fiyat doğrulaması: geçmiş kaynağının son kapanışı ile bağımsız kaynaklar
        cands = {'hist': M and M['px'], 'nasdaq': N and N.get('px'), 'finnhub': F and F.get('px'), 'stooq': SQ and SQ.get('px'),
                 'fmp': P and P.get('px')}
        cands = {k: v for k, v in cands.items() if v}
        oth = [v for k, v in cands.items() if k != 'hist']
        if M and len(oth) >= 2 and spread(oth) <= 1.5 and abs(M['px'] / med(oth) - 1) > 0.015:
            # geçmiş kaynağı, kendi arasında tutarlı iki+ bağımsız kaynakla çelişiyor → geçmişi kullanma
            flags.append({'t': t, 'alan': 'fiyat (geçmiş reddedildi)', 'degerler': {k: round(v, 4) for k, v in cands.items()}})
            M, used = None, []
            cands.pop('hist', None)
        if M:
            cur.pop('pxAt', None)
            base = M['px']
            agree = [k for k, v in cands.items() if k != 'hist' and abs(v / base - 1) <= 0.015]
            new = dict(M)
            new['v'] = 1 + len(agree)
            others = [k for k in cands if k != 'hist']
            if others and not agree:
                flags.append({'t': t, 'alan': 'fiyat', 'degerler': {k: round(v, 4) for k, v in cands.items()}})
        elif cands:
            # geçmiş yoksa anlık kaynakların medyanı; getiriler eski kalır
            px = med(list(cands.values()))
            new = {'px': px, 'v': sum(1 for v in cands.values() if abs(v / px - 1) <= 0.015), 'pxAt': TODAY.isoformat()}
            if F and F.get('d1') is not None:
                new['d1'] = F['d1']
        else:
            stale.append(t)
            continue
        for n, x in (('nasdaq', N), ('finnhub', F), ('fmp', P), ('stooq', SQ)):
            if x:
                used.append(n)

        # 52h aralık geçmişten yoksa kaynak medyanı
        if 'hi' not in new:
            hi, lo = med([x.get('hi') for x in (N, F, P) if x]), med([x.get('lo') for x in (N, F, P) if x])
            if hi and lo:
                new['hi'], new['lo'] = hi, lo

        # F/K: Finnhub, Nasdaq ve SEC (fiyat / seyreltilmiş EPS TTM) medyanı
        pes = {}
        if F and F.get('pe', 0) > 0:
            pes['finnhub'] = F['pe']
        if N and N.get('pe', 0) > 0:
            pes['nasdaq'] = N['pe']
        need_sec = len(pes) < 2 and t not in FOREIGN
        if need_sec:
            E = S['sec'].call(sec_eps_ttm, t)
            if E and E['eps'] > 0 and new.get('px'):
                pes['sec'] = new['px'] / E['eps']
                used.append('sec')
            elif E and E['eps'] <= 0:
                pes['sec_negatif'] = None
        pv = {k: v for k, v in pes.items() if v}
        if pv:
            new['pe'] = med(list(pv.values()))
            if spread(list(pv.values())) > 25:
                flags.append({'t': t, 'alan': 'F/K', 'degerler': {k: round(v, 2) for k, v in pv.items()}})
        elif 'sec_negatif' in pes or (F and F.get('pe', 1) < 0):
            new['pe'] = None  # zarar eden şirkette eski pozitif F/K'yı taşıma

        # piyasa değeri (USD) ve beta
        mcs = [x.get('mc') for x in (N, F, P) if x and x.get('mc')]
        if mcs:
            new['mc'] = med(mcs)
            if spread(mcs) > 15:
                flags.append({'t': t, 'alan': 'piyasa değeri', 'degerler': [round(m / 1e9, 1) for m in mcs]})
        bs = [x.get('beta') for x in (F, P) if x and x.get('beta')]
        if bs:
            new['beta'] = med(bs)

        # ad / sektör: mevcut (Bigdata) sınıflandırması korunur, yoksa kaynaklardan
        if not cur.get('n'):
            nm = (P or {}).get('name') or (H or {}).get('name') or (N or {}).get('name')
            if not nm:
                nm = (S['finnhub'].call(finnhub_profile, t) or {}).get('name')
            if nm:
                new['n'] = nm
        if not cur.get('sec'):
            s_ = (P or {}).get('sec') or (N or {}).get('sec')
            if s_:
                new['sec'] = s_
        if not cur.get('ind'):
            i_ = (P or {}).get('ind') or (N or {}).get('ind')
            if i_:
                new['ind'] = i_

        # döviz: USD dışı listelemede fiyat yerel kalır, 'cur' ile işaretlenir
        if t in FCUR and not new.get('cur'):
            new['cur'] = FCUR[t]
        if new.get('cur') in (None, 'USD'):
            new.pop('cur', None)
            cur.pop('cur', None)

        for k, v in new.items():
            if v is None:
                cur.pop(k, None)
            elif isinstance(v, float):
                cur[k] = round(v, 4 if k == 'beta' else 2)
            else:
                cur[k] = v
        cur['src'] = sorted(set(used))
        cur['idx'] = [LABEL[k] for k in ('ndx', 'sp', 'hold') if t in L.get(k, [])]
        D[t] = cur
        gained = sorted(set(k for k, v in cur.items() if v not in (None, '')) - before - {'src', 'idx', 'v'})
        if gained:
            filled[t] = gained
        if (i + 1) % 25 == 0:
            print(f'{i + 1}/{len(syms)} · {time.time() - t0:.0f} sn', flush=True)

    # evren dışı kalmış eski satırların etiketlerini güncelle
    for t, v in D.items():
        v['idx'] = [LABEL[k] for k in ('ndx', 'sp', 'hold') if t in L.get(k, [])]

    # kıyas: SPY dönem getirileri (RS hesabı için)
    try:
        B = yahoo_hist('SPY') or stooq_hist('SPY')
        bm = series_metrics(B['rows']) if B else None
        if bm:
            U['bench'] = {'SPY': {k: round(bm[k], 2) for k in ('px', 'd1', 'd5', 'm1', 'm3', 'm6', 'ytd', 'y1') if k in bm}, 'asOf': bm['asOf']}
    except Exception as e:
        print('SPY kıyası alınamadı', e)

    U['updatedAt'] = dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    live = [n for n, s in S.items() if s.ok]
    U['source'] = 'Çok kaynaklı: ' + ', '.join({'yahoo': 'Yahoo Finance', 'stooq': 'Stooq', 'nasdaq': 'Nasdaq.com', 'finnhub': 'Finnhub', 'fmp': 'FMP',
                                               'twelve': 'Twelve Data', 'sec': 'SEC EDGAR'}[n] for n in live) + ' (+ haftalık Bigdata.com şirket özeti)'
    n_rows = len([t for t in syms if t in D])
    U['check'] = {'at': U['updatedAt'], 'rows': n_rows, 'verified': sum(1 for t in syms if D.get(t, {}).get('v', 0) >= 2),
                  'flags': len(flags), 'missing': stale}
    fx.wr('universe.json', U)
    diag = {'at': U['updatedAt'], 'sec': round(time.time() - t0, 1), 'symbols': len(syms), 'stale': stale,
            'sources': {n: s.diag() for n, s in S.items()}, 'flags': flags[:80], 'filled': filled}
    fx.wr('_diag/universe.json', diag)
    print(json.dumps({k: diag[k] for k in ('sec', 'symbols', 'stale')}, ensure_ascii=False))
    print(json.dumps({n: (s.ok, s.fail, s.dead) for n, s in S.items()}))
    print(f'{len(flags)} uyuşmazlık, {len(filled)} sembolde yeni alan dolduruldu')


if __name__ == '__main__':
    try:
        main(sys.argv[1:] or None)
    except Exception:
        traceback.print_exc()
        sys.exit(1)
