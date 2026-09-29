#!/usr/bin/env python3
"""Portföy Defteri — ücretsiz dış veri toplayıcı (GitHub Actions'ta çalışır).
Kaynaklar: SEC EDGAR (bilanço, dosyalama tarihli), FRED (makro, anahtarsız CSV), CFTC (COT), CBOE (gecikmeli opsiyon + VIX),
Polymarket (olasılıklar), FINRA (günlük açığa satış hacmi), TCMB EVDS (mevduat faizi; EVDS_KEY secret'ı gerekir).
Kullanım: python3 tools/fetch_ext.py [edgar fred cot cboe pm finra evds]   (boşsa hepsi)
Her kaynak bağımsızdır; biri çökse diğerleri yazılır. Sonuç özeti data/_diag/ext.json'a yazılır. Anahtarlar hiçbir dosyaya yazılmaz."""
import csv, datetime as dt, io, json, math, os, re, sys, time, traceback, urllib.request, urllib.error, gzip

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
TODAY = dt.date.today()
UA = os.environ.get('SEC_UA', '').strip() or 'PortfoyDefteri (github.com/brsclk16/portfoy-defteri)'
DIAG = {}


def rd(name, default=None):
    try:
        with open(os.path.join(DATA, name), encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def wr(name, obj):
    p = os.path.join(DATA, name)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')


def get(url, headers=None, tries=3, raw=False, timeout=40):
    h = {'User-Agent': UA, 'Accept-Encoding': 'gzip'}
    h.update(headers or {})
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    b = gzip.decompress(b)
                return b if raw else b.decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (404, 400, 401, 403):
                raise
        except Exception as e:
            last = e
        time.sleep(1.5 * (i + 1))
    raise last


def jget(url, headers=None):
    return json.loads(get(url, headers))


def tickers():
    P = rd('portfolio.json', {}) or {}
    I = P.get('instruments', {})
    W = (rd('watchlist.json', {}) or {}).get('tickers', [])
    out = {}
    for t, v in I.items():
        out[t] = v.get('type') or ''
    for w in W:
        t = w.get('t') if isinstance(w, dict) else w
        if t and t not in out:
            out[t] = 'Hisse' if (isinstance(w, dict) and w.get('kind') != 'etf') else ''
    return out


def us_sym(t):
    return {'NOVO.B': 'NVO'}.get(t, t).split(':')[0]


# ---------------------------------------------------------------- SEC EDGAR
TAGS = {
    'rev': ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'],
    'gp': ['GrossProfit'],
    'op': ['OperatingIncomeLoss'],
    'ni': ['NetIncomeLoss', 'ProfitLoss'],
    'ocf': ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
    'capex': ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
    'sbc': ['ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense'],
}
ITAGS = {
    'cash0': ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
    'sti': ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'],
    'ltd': ['LongTermDebt'],
    'ltdn': ['LongTermDebtNoncurrent'],
    'ltdc': ['LongTermDebtCurrent', 'DebtCurrent'],
    'stb': ['ShortTermBorrowings', 'CommercialPaper'],
    'ar': ['AccountsReceivableNetCurrent'],
    'inv': ['InventoryNet'],
    'assets': ['Assets'],
}


def pd_(s):
    return dt.date.fromisoformat(s)


def facts_of(cf, tag, unit='USD'):
    for ns in ('us-gaap', 'ifrs-full'):
        u = cf.get('facts', {}).get(ns, {}).get(tag, {}).get('units', {})
        if unit in u:
            return u[unit]
    return []


def flow_quarters(fl):
    dur = {}
    for f in fl:
        if not f.get('start'):
            continue
        k = (f['start'], f['end'])
        if k not in dur or f['filed'] < dur[k][1]:
            dur[k] = (f['val'], f['filed'])
    q = {}
    for (s, e), (v, fi) in dur.items():
        d = (pd_(e) - pd_(s)).days
        if 80 <= d <= 100:
            q[e] = (v, fi)
    by_start = {}
    for (s, e), (v, fi) in dur.items():
        by_start.setdefault(s, []).append((e, v, fi))
    for s, lst in by_start.items():
        lst.sort()
        for i in range(1, len(lst)):
            e1, v1, f1 = lst[i - 1]
            e2, v2, f2 = lst[i]
            gap = (pd_(e2) - pd_(e1)).days
            if 80 <= gap <= 100 and e2 not in q:
                q[e2] = (v2 - v1, max(f1, f2))
    return q


def inst_values(fl):
    out = {}
    for f in fl:
        if f.get('start'):
            continue
        e = f['end']
        if e not in out or f['filed'] < out[e][1]:
            out[e] = (f['val'], f['filed'])
    return out


def near(dct, e, days=12):
    if e in dct:
        return dct[e]
    de = pd_(e)
    best = None
    for k, v in dct.items():
        dd = abs((pd_(k) - de).days)
        if dd <= days and (best is None or dd < best[0]):
            best = (dd, v)
    return best[1] if best else None


def edgar():
    T = tickers()
    stocks = [t for t, ty in T.items() if not re.search(r'ETF|tröst|fon|Emtia|Kripto|Döviz', ty or '', re.I)]
    if not os.environ.get('SEC_UA', '').strip():
        return {'skipped': 'SEC_UA secret tanımlı değil (SEC, "Ad Soyad eposta@adres" biçiminde gerçek iletişim bilgisi istiyor)'}
    cik = {}
    try:
        m = jget('https://www.sec.gov/files/company_tickers.json')
        cik = {v['ticker'].upper(): int(v['cik_str']) for v in m.values()}
    except Exception:
        txt = get('https://www.sec.gov/include/ticker.txt')
        cik = {a.upper(): int(b) for a, b in (l.split() for l in txt.splitlines() if l.strip())}
    fund = rd('fund.json', {'updatedAt': None, 'data': {}}) or {'data': {}}
    fund.setdefault('data', {})
    done, skipped = [], {}
    for t in stocks:
        s = us_sym(t)
        c = cik.get(s.upper().replace('.', '-')) or cik.get(s.upper())
        if not c:
            skipped[t] = 'CIK yok'
            continue
        try:
            cf = jget(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{c:010d}.json')
        except Exception as e:
            skipped[t] = f'indirme: {e}'
            continue
        time.sleep(0.25)
        FQ = {}
        for k, tags in TAGS.items():
            merged = {}
            for tag in tags:
                for e, v in flow_quarters(facts_of(cf, tag)).items():
                    merged.setdefault(e, v)
            FQ[k] = merged
        IV = {}
        for k, tags in ITAGS.items():
            merged = {}
            for tag in tags:
                for e, v in inst_values(facts_of(cf, tag)).items():
                    merged.setdefault(e, v)
            IV[k] = merged
        sh = {}
        for f in facts_of(cf, 'WeightedAverageNumberOfDilutedSharesOutstanding', 'shares'):
            if f.get('start') and 80 <= (pd_(f['end']) - pd_(f['start'])).days <= 100:
                sh.setdefault(f['end'], (f['val'], f['filed']))
        cover = inst_values(cf.get('facts', {}).get('dei', {}).get('EntityCommonStockSharesOutstanding', {}).get('units', {}).get('shares', []))
        ends = sorted(set(FQ['rev']) | set(FQ['ocf']))
        ends = [e for e in ends if e in FQ['rev']][-16:]
        if len(ends) < 4:
            skipped[t] = f'çeyreklik veri az ({len(ends)})'
            continue
        Q = []
        for e in ends:
            g = lambda k: (FQ[k].get(e) or (None, None))
            gi = lambda k: near(IV[k], e) or (None, None)
            rev, fr = g('rev')
            ocf = g('ocf')[0]
            capex = g('capex')[0]
            cash = gi('cash0')[0]
            sti = gi('sti')[0]
            ltd = gi('ltd')[0]
            if ltd is None:
                a, b = gi('ltdn')[0], gi('ltdc')[0]
                ltd = (a or 0) + (b or 0) if (a is not None or b is not None) else None
            stb = gi('stb')[0]
            debt = (ltd or 0) + (stb or 0) if (ltd is not None or stb is not None) else None
            shares = (sh.get(e) or near(cover, e, 70) or (None,))[0]
            filed = max([x for x in [fr, g('ocf')[1], g('ni')[1]] if x] or [None]) if fr else None
            y, mth = int(e[:4]), int(e[5:7])
            Q.append({'p': f'{y}Q{(mth - 1) // 3 + 1}', 'd': e, 'f': filed, 'rev': rev, 'gp': g('gp')[0], 'op': g('op')[0], 'ni': g('ni')[0],
                      'ocf': ocf, 'capex': capex, 'fcf': (ocf - capex) if (ocf is not None and capex is not None) else ocf,
                      'sbc': g('sbc')[0], 'cash': (cash or 0) + (sti or 0) if cash is not None else None, 'debt': debt,
                      'ar': gi('ar')[0], 'inv': gi('inv')[0], 'assets': gi('assets')[0], 'shares': shares})
        fund['data'][s] = {'src': 'sec', 'cur': 'USD', 'fetched': TODAY.isoformat(), 'cik': c, 'q': Q}
        done.append(s)
    fund['updatedAt'] = dt.datetime.utcnow().isoformat() + 'Z'
    wr('fund.json', fund)
    return {'ok': done, 'skipped': skipped}


# ---------------------------------------------------------------- FRED (anahtarsız CSV)
FRED_IDS = ['T10Y2Y', 'T10Y3M', 'BAMLH0A0HYM2', 'NFCI', 'DFII10', 'VIXCLS', 'DGS10', 'DGS2', 'SAHMREALTIME', 'ICSA', 'DTWEXBGS', 'T5YIE', 'FEDFUNDS']


def fred():
    out, errs = {}, {}
    for sid in FRED_IDS:
        try:
            txt = get(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd=2016-01-01')
            rows = list(csv.reader(io.StringIO(txt)))[1:]
            wk = {}
            for d, v in rows:
                if v in ('.', ''):
                    continue
                dd = pd_(d)
                key = (dd + dt.timedelta(days=(4 - dd.weekday()) % 7)).isoformat()  # haftanın cuması
                wk[key] = (d, float(v))
            out[sid] = [[k, round(v[1], 4)] for k, v in sorted(wk.items())]
        except Exception as e:
            errs[sid] = str(e)[:120]
        time.sleep(0.3)
    if not out:
        raise RuntimeError('FRED hiç seri dönmedi: ' + json.dumps(errs))
    wr('fred.json', {'updatedAt': dt.datetime.utcnow().isoformat() + 'Z', 'freq': 'weekly(Fri)', 'series': out})
    return {'series': len(out), 'errs': errs}


# ---------------------------------------------------------------- CFTC COT
COT = {'GOLD': '088691', 'SILVER': '084691', 'COPPER': '085692'}


def cot():
    codes = ",".join(f"'{c}'" for c in COT.values())
    url = ('https://publicreporting.cftc.gov/resource/6dca-aqww.json?$limit=2000&$order=report_date_as_yyyy_mm_dd%20DESC'
           f'&$where=cftc_contract_market_code%20in({urllib.request.quote(codes)})')
    rows = jget(url)
    rev = {v: k for k, v in COT.items()}
    out = {k: [] for k in COT}
    for r in rows:
        k = rev.get(r.get('cftc_contract_market_code'))
        if not k:
            continue
        d = r['report_date_as_yyyy_mm_dd'][:10]
        nl, ns = float(r['noncomm_positions_long_all']), float(r['noncomm_positions_short_all'])
        cl, cs = float(r['comm_positions_long_all']), float(r['comm_positions_short_all'])
        out[k].append([d, int(nl - ns), int(float(r['open_interest_all'])), int(cl - cs)])
    for k in out:
        out[k].sort()
        out[k] = out[k][-420:]
    wr('cot.json', {'updatedAt': dt.datetime.utcnow().isoformat() + 'Z', 'fields': ['date', 'specNet', 'openInterest', 'commNet'], 'data': out})
    return {k: len(v) for k, v in out.items()}


# ---------------------------------------------------------------- CBOE opsiyon + VIX
OPT_RE = re.compile(r'^(.*?)(\d{6})([CP])(\d{8})$')


def cboe_json(path):
    last = None
    for host in ('https://cdn.cboe.com', 'https://cdn-api.cboe.com'):
        try:
            return jget(f'{host}/api/global/delayed_quotes/{path}')
        except Exception as e:
            last = e
    raise last


def cboe():
    T = tickers()
    px_all = ((rd('prices.json', {}) or {}).get('quotes') or {})
    out, errs = {}, {}
    for t in T:
        s = us_sym(t)
        try:
            J = cboe_json(f'options/{s}.json')
            D = J.get('data', {})
            px = D.get('current_price') or D.get('close') or (px_all.get(t) or {}).get('price')
            if not px:
                errs[t] = 'fiyat yok'
                continue
            ex = {}
            pv = cv = poi = coi = 0
            for o in D.get('options', []):
                m = OPT_RE.match(o.get('option', ''))
                if not m:
                    continue
                e = dt.datetime.strptime(m.group(2), '%y%m%d').date()
                k = int(m.group(4)) / 1000
                side = m.group(3)
                mid = (o.get('bid', 0) + o.get('ask', 0)) / 2 if o.get('ask') else o.get('last_trade_price') or 0
                ex.setdefault(e, {}).setdefault(k, {})[side] = (mid, o.get('iv') or 0, o.get('delta') or 0)
                if side == 'P':
                    pv += o.get('volume') or 0; poi += o.get('open_interest') or 0
                else:
                    cv += o.get('volume') or 0; coi += o.get('open_interest') or 0
            rows = []
            skew = None
            for e in sorted(ex):
                dte = (e - TODAY).days
                if dte < 1 or dte > 200:
                    continue
                strikes = [k for k, v in ex[e].items() if 'C' in v and 'P' in v]
                if not strikes:
                    continue
                k = min(strikes, key=lambda x: abs(x - px))
                c, p = ex[e][k]['C'], ex[e][k]['P']
                if c[0] <= 0 or p[0] <= 0:
                    continue
                em = (c[0] + p[0]) / px * 100
                iv = (c[1] + p[1]) / 2 * 100 if c[1] and p[1] else None
                rows.append([e.isoformat(), round(em, 2), round(iv, 1) if iv else None, dte])
                if skew is None and 20 <= dte <= 60:
                    puts = [(abs(v['P'][2] + 0.25), v['P'][1]) for kk, v in ex[e].items() if 'P' in v and v['P'][1]]
                    calls = [(abs(v['C'][2] - 0.25), v['C'][1]) for kk, v in ex[e].items() if 'C' in v and v['C'][1]]
                    if puts and calls:
                        skew = round((min(puts)[1] - min(calls)[1]) * 100, 1)
            if rows:
                out[t] = {'px': px, 'exp': rows[:10], 'pcrVol': round(pv / cv, 2) if cv else None, 'pcrOI': round(poi / coi, 2) if coi else None, 'skew25': skew}
            else:
                errs[t] = 'uygun vade yok'
        except Exception as e:
            errs[t] = str(e)[:120]
        time.sleep(0.3)
    vix = {}
    for s in ('_VIX9D', '_VIX', '_VIX3M', '_VIX6M', '_VVIX'):
        try:
            vix[s.strip('_')] = cboe_json(f'quotes/{s}.json')['data']['current_price']
        except Exception as e:
            errs[s] = str(e)[:80]
    old = rd('options.json', {}) or {}
    hist = [h for h in (old.get('vixHist') or []) if h[0] != TODAY.isoformat()]
    if vix.get('VIX'):
        hist.append([TODAY.isoformat(), vix.get('VIX9D'), vix.get('VIX'), vix.get('VIX3M'), vix.get('VIX6M')])
    wr('options.json', {'updatedAt': dt.datetime.utcnow().isoformat() + 'Z', 'asOf': TODAY.isoformat(), 'data': out, 'vix': vix, 'vixHist': hist[-500:]})
    return {'ok': len(out), 'errs': errs, 'vix': vix}


# ---------------------------------------------------------------- Polymarket
PM_RE = re.compile(r'\b(Fed|FOMC|rate cuts?|rate hikes?|interest rates?|recession|inflation|CPI|tariffs?|Turkey|Türkiye|Erdo[gğ]an|S&P ?500|Nasdaq|crude|oil price|WTI|Brent|Nvidia|semiconductors?|chips?|Taiwan|shutdown|unemployment|GDP|Powell|Treasury|stock market|gold price|silver|copper|Bitcoin price)\b', re.I)
PM_NO = re.compile(r'FDV|memecoin|token|Arena|AI model|AI Agent|Gold Card|charged|indicted|sentenced|tweet|Elon', re.I)


def pm_list(x):
    if isinstance(x, str):
        try:
            return json.loads(x)
        except Exception:
            return []
    return x or []


def pm():
    evs = []
    for off in range(0, 2000, 100):
        page = jget(f'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100&offset={off}&order=volume&ascending=false')
        if not page:
            break
        evs += page
        time.sleep(0.25)
    sel = [e for e in evs if PM_RE.search(e.get('title', '') or '') and not PM_NO.search(e.get('title', '') or '') and float(e.get('volume') or 0) > 200000]
    sel.sort(key=lambda e: -float(e.get('volume') or 0))
    old = rd('pm.json', {}) or {}
    hist = old.get('hist') or {}
    out = []
    for e in sel[:40]:
        mk = []
        for m in e.get('markets') or []:
            if m.get('closed'):
                continue
            oc, pr = pm_list(m.get('outcomes')), pm_list(m.get('outcomePrices'))
            if len(oc) != len(pr) or not pr:
                continue
            try:
                yes = float(pr[oc.index('Yes')]) if 'Yes' in oc else float(pr[0])
            except Exception:
                continue
            mid = str(m.get('id'))
            h = [x for x in hist.get(mid, []) if x[0] != TODAY.isoformat()] + [[TODAY.isoformat(), round(yes, 4)]]
            hist[mid] = h[-90:]
            mk.append({'id': mid, 'q': m.get('question'), 'label': m.get('groupItemTitle') or '', 'yes': round(yes, 4), 'vol': round(float(m.get('volume') or 0)), 'end': (m.get('endDate') or '')[:10]})
        if mk:
            mk.sort(key=lambda x: -x['vol'])
            out.append({'id': str(e.get('id')), 'title': e.get('title'), 'slug': e.get('slug'), 'vol': round(float(e.get('volume') or 0)), 'end': (e.get('endDate') or '')[:10], 'markets': mk[:12]})
    live = {m['id'] for e in out for m in e['markets']}
    hist = {k: v for k, v in hist.items() if k in live}
    wr('pm.json', {'updatedAt': dt.datetime.utcnow().isoformat() + 'Z', 'events': out, 'hist': hist})
    return {'events': len(out), 'scanned': len(evs)}


# ---------------------------------------------------------------- FINRA günlük açığa satış hacmi
def finra():
    T = {us_sym(t): t for t in tickers()}
    T['SPY'] = 'SPY'
    old = (rd('shortvol.json', {}) or {}).get('data', {})
    data = {t: {r[0]: r for r in old.get(t, [])} for t in T.values()}
    got = 0
    d = TODAY
    tries = 0
    have = {r for v in data.values() for r in v}
    while got < 45 and tries < 70:
        tries += 1
        d -= dt.timedelta(days=1)
        if d.weekday() >= 5:
            continue
        iso = d.isoformat()
        if iso in have and got > 0:
            got += 1
            continue
        try:
            txt = get(f'https://cdn.finra.org/equity/regsho/daily/CNMSshvol{d:%Y%m%d}.txt', tries=2)
        except urllib.error.HTTPError:
            continue
        got += 1
        for line in txt.splitlines()[1:]:
            p = line.split('|')
            if len(p) < 5 or p[1] not in T:
                continue
            t = T[p[1]]
            data[t][iso] = [iso, int(float(p[2])), int(float(p[4]))]
        time.sleep(0.2)
    out = {t: sorted(v.values())[-90:] for t, v in data.items() if v}
    wr('shortvol.json', {'updatedAt': dt.datetime.utcnow().isoformat() + 'Z', 'fields': ['date', 'shortVolume', 'totalVolume'], 'data': out})
    return {'tickers': len(out), 'days': got}


# ---------------------------------------------------------------- TCMB EVDS
EVDS_BASES = ['https://evds3.tcmb.gov.tr/igmevdsms-dis/', 'https://evds2.tcmb.gov.tr/service/evds/']


def evds():
    key = os.environ.get('EVDS_KEY', '').strip()
    if not key:
        return {'skipped': 'EVDS_KEY secret tanımlı değil'}
    H = {'key': key}
    base, cat = None, None
    for b in EVDS_BASES:
        try:
            cat = jget(b + 'categories/type=json', H)
            base = b
            break
        except Exception as e:
            DIAG.setdefault('evds_try', []).append(f'{b}: {str(e)[:80]}')
    if not base:
        raise RuntimeError('EVDS erişilemedi')
    catalog = []
    for c in cat:
        name = c.get('TOPIC_TITLE_TR') or c.get('TOPIC_TITLE_ENG') or ''
        if not re.search(r'faiz', name, re.I):
            continue
        try:
            groups = jget(base + f"datagroups/mode=2&code={c.get('CATEGORY_ID')}&type=json", H)
        except Exception:
            continue
        for g in groups:
            gn = g.get('DATAGROUP_NAME') or ''
            if not re.search(r'mevduat', gn, re.I):
                continue
            try:
                sl = jget(base + f"serieList/type=json&code={g.get('DATAGROUP_CODE')}", H)
            except Exception:
                continue
            for s in sl:
                catalog.append({'group': gn, 'gcode': g.get('DATAGROUP_CODE'), 'freq': g.get('FREQUENCY_STR') or s.get('FREQUENCY_STR'), 'code': s.get('SERIE_CODE'), 'name': s.get('SERIE_NAME')})
    wr('_diag/evds_catalog.json', catalog)

    def pick(rx):
        c = [x for x in catalog if re.search(r'TL', x['group'] + x['name']) and re.search(rx, x['name'], re.I) and not re.search(r'USD|EUR|Döviz|Stok', x['group'] + x['name'], re.I)]
        c.sort(key=lambda x: (0 if re.search(r'hafta', (x['freq'] or '') + x['group'], re.I) else 1, 0 if re.search(r'akım', x['group'] + x['name'], re.I) else 1))
        return c[0]['code'] if c else None
    want = {'m1': pick(r'1 Aya Kadar') or 'TP.TRY.MT01', 'm3': pick(r'3 Aya Kadar') or 'TP.TRY.MT02', 'm6': pick(r'6 Aya Kadar') or 'TP.TRY.MT03', 'y1': pick(r'1 Yıla Kadar') or 'TP.TRY.MT04'}
    codes = '-'.join(want.values())
    J = jget(base + f'series={codes}&startDate=01-01-2019&endDate=31-12-2035&type=json', H)
    ser = {k: [] for k in want}
    for it in J.get('items', []):
        d = it.get('Tarih')
        try:
            iso = dt.datetime.strptime(d, '%d-%m-%Y').date().isoformat()
        except Exception:
            try:
                iso = dt.datetime.strptime(d, '%Y-%m-%d').date().isoformat()
            except Exception:
                continue
        for k, c in want.items():
            v = it.get(c.replace('.', '_'))
            if v not in (None, '', 'null'):
                ser[k].append([iso, float(v)])
    names = {k: next((x['name'] for x in catalog if x['code'] == c), c) for k, c in want.items()}
    wr('evds.json', {'updatedAt': dt.datetime.utcnow().isoformat() + 'Z', 'codes': want, 'names': names, 'series': ser})
    return {'codes': want, 'points': {k: len(v) for k, v in ser.items()}}


JOBS = {'edgar': edgar, 'fred': fred, 'cot': cot, 'cboe': cboe, 'pm': pm, 'finra': finra, 'evds': evds}

if __name__ == '__main__':
    want = sys.argv[1:] or list(JOBS)
    diag = rd('_diag/ext.json', {}) or {}
    for j in want:
        t0 = time.time()
        try:
            r = JOBS[j]()
            diag[j] = {'ok': True, 'at': dt.datetime.utcnow().isoformat() + 'Z', 'sec': round(time.time() - t0, 1), 'info': r}
            print(j, 'OK', json.dumps(r, ensure_ascii=False)[:400])
        except Exception as e:
            diag[j] = {'ok': False, 'at': dt.datetime.utcnow().isoformat() + 'Z', 'err': f'{type(e).__name__}: {e}'[:300], 'tb': traceback.format_exc()[-600:]}
            print(j, 'FAIL', e)
    diag.update({k: v for k, v in DIAG.items()})
    wr('_diag/ext.json', diag)
