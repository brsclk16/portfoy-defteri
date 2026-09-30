#!/usr/bin/env python3
"""Portföy Defteri — ücretsiz haber/sinyal toplayıcı (GitHub Actions'ta çalışır).

Zamanlanmış Claude görevi web sitelerine doğrudan erişemediği için (her alan adı onay istiyor) ham haberleri
burada toplayıp data/news_raw.json'a yazıyoruz; "Portföy haber taraması" görevi bu dosyayı repodan okur,
seçer, Türkçe özetler ve veritabanına yazar.

Anahtarsız kaynaklar: tema RSS akışları (piyasa, Fed, yarı iletken, biyotek, metaller), hisse bazlı
Nasdaq / Seeking Alpha RSS, Google News RSS araması, TickerTick API, GDELT DOC 2.0 (haber tonu).
İsteğe bağlı (GitHub secret): SEC_UA (SEC EDGAR 8-K/6-K; "Ad Soyad eposta@adres"), FINNHUB_KEY (şirket haberi,
bilanço takvimi, EPS sürprizi, analist tavsiyeleri), FMP_KEY (analist hedef fiyat konsensüsü).
Kullanım: python3 tools/fetch_news.py [theme ticker sec google tickertick finnhub fmp gdelt]  (boşsa hepsi)
Her kaynak bağımsızdır; biri çökse diğerleri yazılır. Anahtarlar hiçbir dosyaya yazılmaz."""
import datetime as dt, email.utils, gzip, hashlib, html, json, os, re, sys, time, traceback
import urllib.parse, urllib.request, urllib.error
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
OUT = 'news_raw.json'
NOW = dt.datetime.now(dt.timezone.utc)
WINDOW_H = int(os.environ.get('NEWS_WINDOW_H', '36'))
MAX_ITEMS = 700
UA_BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 PortfoyDefteri/1.0'
UA_SEC = os.environ.get('SEC_UA', '').strip()  # SEC gerçek iletişim bilgisi ister: "Ad Soyad eposta@adres"
FINNHUB_KEY = os.environ.get('FINNHUB_KEY', '').strip()
FMP_KEY = os.environ.get('FMP_KEY', '').strip()
DIAG = {}

# ------------------------------------------------------------------ tema akışları
# (ad, url, temalar, anahtar kelime süzgeci — None ise hepsi alınır)
SEMI_KW = r'nvidia|amd\b|intel|micron|tsmc|taiwan semi|asml|broadcom|dell|vertiv|credo|marvell|sk hynix|samsung|hbm|dram|nand|memory|gpu|data cent|datacent|export|tariff|chip|semiconductor|foundry|lithograph|euv|ai server|hyperscal'
BIO_KW = None
METAL_KW = r'gold|silver|copper|freeport|southern copper|teck|hudbay|first quantum|bhp|antofagasta|codelco|chile|peru|central bank|comex|lme|tariff|smelter'
MACRO_KW = r'fed\b|federal reserve|fomc|powell|inflation|cpi|pce|payroll|jobs|treasury|yield|rate|dollar|tariff|gdp|ism|recession|oil'
THEME_FEEDS = [
    ('investing-market', 'https://www.investing.com/rss/news_25.rss', ['makro'], MACRO_KW + '|' + SEMI_KW),
    ('investing-economy', 'https://www.investing.com/rss/news_95.rss', ['makro'], None),
    ('cnbc-top', 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', ['makro'], MACRO_KW + '|' + SEMI_KW),
    ('cnbc-economy', 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258', ['makro'], MACRO_KW),
    ('fed', 'https://www.federalreserve.gov/feeds/press_all.xml', ['makro', 'fed'], None),
    ('fed-speeches', 'https://www.federalreserve.gov/feeds/speeches.xml', ['makro', 'fed'], None),
    ('eetimes', 'https://www.eetimes.com/feed/', ['yari-iletken'], SEMI_KW),
    ('semi-digest', 'https://www.semiconductor-digest.com/feed/', ['yari-iletken'], SEMI_KW),
    ('semi-today', 'https://www.semiconductor-today.com/rss/news.xml', ['yari-iletken'], SEMI_KW),
    ('semiengineering', 'https://semiengineering.com/feed/', ['yari-iletken'], SEMI_KW),
    ('tomshardware', 'https://www.tomshardware.com/feeds/all', ['yari-iletken'], r'nvidia|amd\b|intel|micron|tsmc|asml|dell|vertiv|credo|data cent|export|tariff|hbm|dram|memory price'),
    ('trendforce', 'https://www.trendforce.com/news/feed/', ['yari-iletken', 'bellek'], None),
    ('endpoints', 'https://endpoints.news/feed/', ['biyotek'], BIO_KW),
    ('fiercebiotech', 'https://www.fiercebiotech.com/rss/xml', ['biyotek'], BIO_KW),
    ('fiercepharma', 'https://www.fiercepharma.com/rss/xml', ['biyotek'], BIO_KW),
    ('biopharmadive', 'https://www.biopharmadive.com/feeds/news/', ['biyotek'], BIO_KW),
    ('statnews', 'https://www.statnews.com/feed/', ['biyotek'], r'fda|drug|trial|biotech|pharma|lilly|novo|merck|abbvie|amgen|moderna|medicare|glp-1|obesity|approval|cms'),
    ('mining', 'https://www.mining.com/feed/', ['metaller'], METAL_KW),
]
# Google News RSS tema aramaları (son 1 gün)
GOOGLE_THEMES = [
    ('makro', 'Federal Reserve rate hike OR inflation OR Treasury yields'),
    ('makro', 'US CPI OR PCE OR nonfarm payrolls OR ISM manufacturing'),
    ('yari-iletken', 'semiconductor tariffs OR chip export controls China'),
    ('yari-iletken', 'AI data center capex OR hyperscaler spending'),
    ('bellek', 'DRAM OR HBM OR NAND memory prices'),
    ('biyotek', 'FDA approval OR "complete response letter" OR "phase 3" results'),
    ('biyotek', 'drug pricing Medicare negotiation OR GLP-1 obesity'),
    ('metaller', 'gold price OR silver price central bank gold buying'),
    ('metaller', 'copper price OR copper tariff OR Chile Peru copper mine'),
]


# ------------------------------------------------------------------ yardımcılar
def rd(name, default=None):
    try:
        with open(os.path.join(DATA, name), encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def wr(name, obj):
    p = os.path.join(DATA, name)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')


def get(url, headers=None, tries=2, timeout=15, raw=False):
    h = {'User-Agent': UA_BROWSER, 'Accept-Encoding': 'gzip', 'Accept': '*/*'}
    h.update(headers or {})
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r:
                b = r.read()
                if r.headers.get('Content-Encoding') == 'gzip' or b[:2] == b'\x1f\x8b':
                    b = gzip.decompress(b)
                return b if raw else b.decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 401, 403, 404, 410):
                raise
            if e.code == 429:
                time.sleep(8 * (i + 1))
        except Exception as e:
            last = e
        time.sleep(2 * (i + 1))
    raise last


def jget(url, headers=None):
    return json.loads(get(url, headers))


def clean(s, n=None):
    s = html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))
    s = re.sub(r'\s+', ' ', s).strip()
    return s[:n].rstrip() + ('…' if n and len(s) > n else '') if n else s


def iso(d):
    return d.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ') if d else None


def pdate(s):
    if not s:
        return None
    s = s.strip()
    try:
        d = email.utils.parsedate_to_datetime(s)
        return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)
    except Exception:
        pass
    for fmt in ('%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M:%S.%f%z', '%Y-%m-%dT%H:%M:%SZ', '%Y-%m-%d %H:%M:%S', '%Y%m%dT%H%M%SZ', '%Y-%m-%d'):
        try:
            d = dt.datetime.strptime(s.replace('Z', '+0000') if '%z' in fmt else s, fmt)
            return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)
        except Exception:
            continue
    try:
        d = dt.datetime.fromisoformat(s.replace('Z', '+00:00'))
        return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)
    except Exception:
        return None


def local(tag):
    return tag.rsplit('}', 1)[-1] if '}' in tag else tag


def parse_feed(text):
    """RSS 2.0 / Atom / RDF → [{title,url,summary,date,source}]"""
    text = re.sub(r'^[^<]+', '', text)
    root = ET.fromstring(text.encode('utf-8'))
    out = []
    for el in root.iter():
        if local(el.tag) not in ('item', 'entry'):
            continue
        d = {'title': '', 'url': '', 'summary': '', 'date': None, 'source': ''}
        for c in el:
            n = local(c.tag)
            if n == 'title':
                d['title'] = clean(''.join(c.itertext()))
            elif n == 'link':
                href = c.attrib.get('href')
                if href and (c.attrib.get('rel') in (None, 'alternate')):
                    d['url'] = d['url'] or href
                elif (c.text or '').strip():
                    d['url'] = d['url'] or c.text.strip()
            elif n in ('description', 'summary', 'content', 'encoded') and not d['summary']:
                d['summary'] = clean(''.join(c.itertext()), 400)
            elif n in ('pubDate', 'published', 'updated', 'date', 'issued') and not d['date']:
                d['date'] = pdate(c.text or '')
            elif n == 'source':
                d['source'] = clean(c.text or '')
            elif n == 'guid' and not d['url'] and (c.text or '').startswith('http'):
                d['url'] = c.text.strip()
        if d['title'] and d['url']:
            out.append(d)
    return out


ITEMS = []
T0 = time.time()
BUDGET = {'theme': 120, 'ticker': 150, 'sec': 60, 'finnhub': 150, 'fmp': 60, 'google': 120, 'tickertick': 160, 'gdelt': 130}
DEADLINE = [0]


def over():
    return time.time() > DEADLINE[0]


def add(src, feed, title, url, date, summary='', tickers=(), themes=(), extra=None):
    if not title or not url:
        return
    if date and (NOW - date).total_seconds() > WINDOW_H * 3600:
        return
    it = {'title': clean(title, 240), 'url': url, 'source': src, 'feed': feed,
          'publishedAt': iso(date), 'summary': clean(summary, 400),
          'tickers': sorted(set(t for t in tickers if t)), 'themes': sorted(set(themes))}
    if extra:
        it.update(extra)
    ITEMS.append(it)


def run(name, fn):
    t0 = time.time()
    DEADLINE[0] = t0 + BUDGET.get(name, 120)
    n0 = len(ITEMS)
    try:
        info = fn() or {}
        DIAG[name] = {'ok': True, 'items': len(ITEMS) - n0, 'sec': round(time.time() - t0, 1), **info}
    except Exception as e:
        DIAG[name] = {'ok': False, 'err': f'{type(e).__name__}: {e}'[:300], 'items': len(ITEMS) - n0}
        traceback.print_exc()


# ------------------------------------------------------------------ evren
def us_sym(t):
    return 'NVO' if t == 'NOVO.B' else t.split(':')[0]


def universe():
    """{sembol: {'name','funds':[...],'direct':bool}} — tek hisseler, izleme listesi, fonların ilk 4 holdingi."""
    P = rd('portfolio.json', {}) or {}
    I = P.get('instruments', {}) or {}
    U = {}
    for t, v in I.items():
        typ = (v.get('type') or '').lower()
        if typ == 'hisse':
            U.setdefault(t, {'name': v.get('name') or t, 'funds': [], 'direct': True})['direct'] = True
        elif (v.get('holdings') or []):
            hs = sorted(v['holdings'], key=lambda h: -(h.get('w') or 0))[:4]
            for h in hs:
                ht = h.get('t')
                if not ht or not re.match(r'^[A-Z][A-Z0-9.]{0,6}$', ht):
                    continue
                e = U.setdefault(ht, {'name': h.get('n') or ht, 'funds': [], 'direct': False})
                e['funds'].append({'t': t, 'w': h.get('w')})
    for w in (rd('watchlist.json', {}) or {}).get('tickers', []):
        t = w.get('t') if isinstance(w, dict) else w
        if t and ':' not in t:
            U.setdefault(t, {'name': (w.get('note') if isinstance(w, dict) else None) or t, 'funds': [], 'direct': False})['watch'] = True
    return U, I


def short_name(n):
    n = re.sub(r'\b(Inc|Corp|Corporation|Holdings?|Holding|Group|Co|Company|Ltd|plc|N\.V\.|NV|A/S|S\.A\.|SA|and Company|& Co)\b\.?', '', n or '', flags=re.I)
    n = re.sub(r'\(.*?\)', '', n)
    return re.sub(r'\s+', ' ', n).strip(' ,.-&') or n


def fund_tags(U, t):
    e = U.get(t, {})
    out = [f['t'] for f in e.get('funds', [])]
    if e.get('direct') or e.get('watch'):
        out.append(t)
    return out


# ------------------------------------------------------------------ kaynaklar
def src_theme():
    ok, bad = 0, []
    for name, url, themes, kw in THEME_FEEDS:
        if over():
            bad.append('süre doldu'); break
        try:
            for d in parse_feed(get(url)):
                txt = d['title'] + ' ' + d['summary']
                if kw and not re.search(kw, txt, re.I):
                    continue
                add(name, 'rss', d['title'], d['url'], d['date'], d['summary'], themes=themes)
            ok += 1
        except Exception as e:
            bad.append(f'{name}: {type(e).__name__} {str(e)[:80]}')
        time.sleep(0.5)
    return {'feedsOk': ok, 'feedsFail': bad}


FOREIGN_6K = {'ASML', 'TSM', 'NOVO.B'}
NO_US_FEED = {'FM'}  # First Quantum: ABD'de 'FM' başka bir enstrüman; yalnızca ad aramasıyla izlenir


def src_ticker(U):
    ok, bad = 0, []
    for t in U:
        if t in NO_US_FEED:
            continue
        if over():
            bad.append('süre doldu'); break
        s = us_sym(t)
        tags = fund_tags(U, t)
        feeds = [
            ('nasdaq', f'https://www.nasdaq.com/feed/rssoutbound?symbol={s}', {}),
            ('seekingalpha', f'https://seekingalpha.com/api/sa/combined/{s}.xml', {}),
        ]
        for name, url, hd in feeds:
            try:
                for d in parse_feed(get(url, hd)):
                    src = d['source'] or name
                    add(src, name, d['title'], d['url'], d['date'], d['summary'], tickers=[t] + tags,
                        extra={'holding': t})
                ok += 1
            except Exception as e:
                bad.append(f'{name}/{s}: {type(e).__name__} {str(e)[:60]}')
            time.sleep(0.6)
    return {'feedsOk': ok, 'feedsFail': bad[:40]}


SEC_ITEMS = {'1.01': 'önemli anlaşma', '1.02': 'anlaşma feshi', '2.01': 'satın alma/elden çıkarma', '2.02': 'finansal sonuçlar',
             '2.05': 'yeniden yapılandırma', '2.06': 'değer düşüklüğü', '3.01': 'kotasyon', '5.02': 'yönetici değişikliği',
             '7.01': 'Reg FD açıklaması', '8.01': 'diğer önemli olay', '9.01': 'finansal tablolar/ekler'}


def src_sec(U):
    if not UA_SEC:
        return {'skipped': 'SEC_UA secret tanımlı değil ("Ad Soyad eposta@adres")'}
    h = {'User-Agent': UA_SEC}
    m = jget('https://www.sec.gov/files/company_tickers.json', h)
    cik = {v['ticker'].upper(): int(v['cik_str']) for v in m.values()}
    bad, since = [], (NOW - dt.timedelta(days=4)).date().isoformat()
    for t in U:
        if over():
            bad.append('süre doldu'); break
        s = us_sym(t).upper()
        c = cik.get(s)
        if not c:
            continue
        try:
            js = jget(f'https://data.sec.gov/submissions/CIK{c:010d}.json', h)
            r = js.get('filings', {}).get('recent', {})
            for i, form in enumerate(r.get('form', [])):
                fd = r['filingDate'][i]
                if fd < since:
                    break
                if form not in ('8-K', '6-K', '8-K/A', 'SC 13D', 'SC 13G'):
                    continue
                acc = r['accessionNumber'][i].replace('-', '')
                doc = r.get('primaryDocument', [''] * (i + 1))[i]
                items = r.get('items', [''] * (i + 1))[i] or ''
                desc = ', '.join(f'{x} {SEC_ITEMS.get(x, "")}'.strip() for x in items.split(',') if x)
                acc_t = r.get('acceptanceDateTime', [''] * (i + 1))[i]
                add('SEC EDGAR', 'sec', f'{e_name(U, t)} {form}' + (f' — Item {desc}' if desc else ''),
                    f'https://www.sec.gov/Archives/edgar/data/{c}/{acc}/{doc}', pdate(acc_t) or pdate(fd),
                    items, tickers=[t] + fund_tags(U, t), extra={'holding': t, 'form': form, 'items': items})
        except Exception as e:
            bad.append(f'{s}: {type(e).__name__} {str(e)[:60]}')
        time.sleep(0.3)
    return {'fail': bad}


def e_name(U, t):
    return U.get(t, {}).get('name') or t


def gnews(q, when='1d'):
    url = 'https://news.google.com/rss/search?' + urllib.parse.urlencode(
        {'q': f'{q} when:{when}', 'hl': 'en-US', 'gl': 'US', 'ceid': 'US:en'})
    return parse_feed(get(url))


def src_google(U, I):
    ok, bad = 0, []
    qs = []
    for t, e in U.items():
        nm = short_name(e['name'])
        qs.append((f'"{nm}"' if nm and nm.upper() != t else f'{t} stock', [t] + fund_tags(U, t), []))
    for th, q in GOOGLE_THEMES:
        qs.append((q, [], [th]))
    for q, tk, th in qs:
        if over():
            bad.append('süre doldu'); break
        try:
            for d in gnews(q)[:(12 if tk else 10)]:
                title = d['title']
                src = d['source']
                if src and title.endswith(' - ' + src):
                    title = title[: -len(src) - 3]
                add(src or 'Google News', 'google', title, d['url'], d['date'], '', tickers=tk, themes=th,
                    extra={'query': q})
            ok += 1
        except Exception as e:
            bad.append(f'{q[:30]}: {type(e).__name__} {str(e)[:60]}')
        time.sleep(1.2)
    return {'queriesOk': ok, 'queriesFail': bad[:20]}


def src_tickertick(U):
    ok, bad = 0, []
    for i, t in enumerate(U):
        if t in NO_US_FEED:
            continue
        if over():
            bad.append('süre doldu'); break
        s = us_sym(t).lower()
        q = f'(and z:{s} (or T:curated T:market T:earning T:sec T:analysis))'
        url = 'https://api.tickertick.com/feed?' + urllib.parse.urlencode({'q': q, 'n': 30})
        try:
            js = jget(url)
            for st in js.get('stories', []):
                d = dt.datetime.fromtimestamp(st.get('time', 0) / 1000, dt.timezone.utc) if st.get('time') else None
                add(st.get('site') or 'TickerTick', 'tickertick', st.get('title'), st.get('url'), d,
                    st.get('description') or '', tickers=[t] + fund_tags(U, t), extra={'holding': t})
            ok += 1
        except Exception as e:
            bad.append(f'{s}: {type(e).__name__} {str(e)[:60]}')
        time.sleep(6.5)  # dakikada 10 istek sınırı
    return {'queriesOk': ok, 'queriesFail': bad}


SIG = {}
EARN = []


def src_finnhub(U):
    if not FINNHUB_KEY:
        return {'skipped': 'FINNHUB_KEY yok'}
    base = 'https://finnhub.io/api/v1'
    k = urllib.parse.quote(FINNHUB_KEY)
    f, to = (NOW - dt.timedelta(days=2)).date().isoformat(), NOW.date().isoformat()
    bad = []
    syms = {us_sym(t): t for t in U if t not in NO_US_FEED}
    for s, t in syms.items():
        if over():
            bad.append('süre doldu'); break
        g = SIG.setdefault(t, {})
        try:
            for n in jget(f'{base}/company-news?symbol={s}&from={f}&to={to}&token={k}')[:30]:
                d = dt.datetime.fromtimestamp(n.get('datetime', 0), dt.timezone.utc) if n.get('datetime') else None
                add(n.get('source') or 'Finnhub', 'finnhub', n.get('headline'), n.get('url'), d, n.get('summary') or '',
                    tickers=[t] + fund_tags(U, t), extra={'holding': t})
        except Exception as e:
            bad.append(f'news/{s}: {e}'[:90])
        time.sleep(1.1)
        try:
            r = jget(f'{base}/stock/recommendation?symbol={s}&token={k}')
            if r:
                r = r[0]
                g['rec'] = {'period': r.get('period'), 'strongBuy': r.get('strongBuy'), 'buy': r.get('buy'),
                            'hold': r.get('hold'), 'sell': r.get('sell'), 'strongSell': r.get('strongSell')}
        except Exception as e:
            bad.append(f'rec/{s}: {e}'[:90])
        time.sleep(1.1)
        try:
            r = jget(f'{base}/stock/earnings?symbol={s}&limit=4&token={k}')
            if r:
                r = sorted(r, key=lambda x: x.get('period') or '', reverse=True)[0]
                g['eps'] = {'period': r.get('period'), 'quarter': r.get('quarter'), 'year': r.get('year'),
                            'act': r.get('actual'), 'est': r.get('estimate'), 'surprisePct': r.get('surprisePercent')}
        except Exception as e:
            bad.append(f'eps/{s}: {e}'[:90])
        time.sleep(1.1)
    try:
        f2, t2 = NOW.date().isoformat(), (NOW + dt.timedelta(days=21)).date().isoformat()
        cal = jget(f'{base}/calendar/earnings?from={f2}&to={t2}&token={k}').get('earningsCalendar', [])
        for c in cal:
            if c.get('symbol') in syms:
                EARN.append({'t': syms[c['symbol']], 'date': c.get('date'), 'hour': c.get('hour'),
                             'quarter': c.get('quarter'), 'year': c.get('year'), 'epsEst': c.get('epsEstimate'),
                             'revEst': c.get('revenueEstimate'), 'src': 'Finnhub'})
    except Exception as e:
        bad.append(f'calendar: {e}'[:90])
    return {'fail': bad[:30], 'earnings': len(EARN)}


def src_fmp(U):
    if not FMP_KEY:
        return {'skipped': 'FMP_KEY yok'}
    bad = []
    for t in U:
        if t in NO_US_FEED:
            continue
        s = us_sym(t)
        try:
            r = jget(f'https://financialmodelingprep.com/stable/price-target-consensus?symbol={s}&apikey={urllib.parse.quote(FMP_KEY)}')
            if isinstance(r, list) and r:
                r = r[0]
                SIG.setdefault(t, {})['target'] = {'consensus': r.get('targetConsensus'), 'median': r.get('targetMedian'),
                                                   'low': r.get('targetLow'), 'high': r.get('targetHigh'), 'src': 'FMP'}
        except Exception as e:
            bad.append(f'{s}: {type(e).__name__} {str(e)[:60]}')
        time.sleep(0.5)
    return {'fail': bad}


DBG = {}


def src_gdelt(U):
    """Şirket adına göre son 3 gün / önceki 4 gün ortalama haber tonu (−10…+10 ölçeği)."""
    bad = []
    for t, e in U.items():
        nm = short_name(e['name'])
        if not nm or len(nm) < 3:
            continue
        if over():
            bad.append('süre doldu'); break
        q = f'"{nm}" sourcelang:english'
        url = 'https://api.gdeltproject.org/api/v2/doc/doc?' + urllib.parse.urlencode(
            {'query': q, 'mode': 'timelinetone', 'timespan': '7d', 'format': 'json'})
        try:
            js = jget(url)
            pts = []
            for s in js.get('timeline', []):
                for p in s.get('data', []):
                    d = pdate(p.get('date'))
                    if d and p.get('value') is not None:
                        pts.append((d, float(p['value'])))
            DBG[t] = {'pts': len(pts), 'keys': list(js.keys())[:3], 'first': str(js.get('timeline', [{}])[0].get('data', [None])[:1])[:80] if js.get('timeline') else None}
            rec = [v for d, v in pts if (NOW - d).days < 3]
            old = [v for d, v in pts if (NOW - d).days >= 3]
            if rec:
                g = SIG.setdefault(t, {})
                a = sum(rec) / len(rec)
                b = sum(old) / len(old) if old else None
                g['tone'] = {'avg3d': round(a, 2), 'prev4d': round(b, 2) if b is not None else None,
                             'dir': ('UP' if b is not None and a - b > 0.5 else 'DOWN' if b is not None and b - a > 0.5 else 'NEUTRAL'),
                             'src': 'GDELT'}
        except Exception as e:
            bad.append(f'{t}: {type(e).__name__} {str(e)[:60]}')
        time.sleep(6.5)
    if DBG:
        return {'fail': bad, 'debug': DBG}  # GDELT: 5 sn'de bir istek (429'a karşı pay)
    return {'fail': bad}


# ------------------------------------------------------------------ birleştirme
def norm_title(s):
    s = re.sub(r'\s+[-|\u2013]\s+[^-|\u2013]{2,40}$', '', s or '')
    return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()[:90]


def finalize():
    by = {}
    prio = {'finnhub': 1, 'tickertick': 2, 'nasdaq': 3, 'sec': 0, 'rss': 1, 'seekingalpha': 4, 'yahoo': 4, 'google': 5}
    for it in ITEMS:
        k = norm_title(it['title'])
        if not k:
            continue
        if k in by:
            o = by[k]
            o['tickers'] = sorted(set(o['tickers']) | set(it['tickers']))
            o['themes'] = sorted(set(o['themes']) | set(it['themes']))
            o.setdefault('alsoIn', [])
            if it['source'] not in o['alsoIn'] and it['source'] != o['source']:
                o['alsoIn'].append(it['source'])
            if prio.get(it['feed'], 9) < prio.get(o['feed'], 9):
                for f in ('url', 'source', 'feed', 'summary'):
                    if it.get(f):
                        o[f] = it[f]
            if not o.get('publishedAt') and it.get('publishedAt'):
                o['publishedAt'] = it['publishedAt']
        else:
            by[k] = dict(it)
    items = list(by.values())
    for i, it in enumerate(items):
        it['id'] = hashlib.sha1(it['url'].encode()).hexdigest()[:12]
    items.sort(key=lambda x: x.get('publishedAt') or '', reverse=True)
    # önce google dışı ve ticker'lı maddeler korunur; kesinti gerekirse google'ın ticker'sız maddeleri gider
    keep = [i for i in items if i['feed'] != 'google' or i['tickers']]
    rest = [i for i in items if not (i['feed'] != 'google' or i['tickers'])]
    out = (keep + rest)[:MAX_ITEMS]
    out.sort(key=lambda x: x.get('publishedAt') or '', reverse=True)
    return out


def main(argv):
    # GDELT GitHub Actions IP'lerinden sürekli 429 veriyor; varsayılan dışı (elle: fetch_news.py gdelt)
    want = set(argv) or {'theme', 'ticker', 'sec', 'google', 'tickertick', 'finnhub', 'fmp'}
    U, I = universe()
    print('evren:', ', '.join(U))
    if 'theme' in want:
        run('theme', src_theme)
    if 'ticker' in want:
        run('ticker', lambda: src_ticker(U))
    if 'sec' in want:
        run('sec', lambda: src_sec(U))
    if 'finnhub' in want:
        run('finnhub', lambda: src_finnhub(U))
    if 'fmp' in want:
        run('fmp', lambda: src_fmp(U))
    if 'google' in want:
        run('google', lambda: src_google(U, I))
    if 'tickertick' in want:
        run('tickertick', lambda: src_tickertick(U))
    if 'gdelt' in want:
        run('gdelt', lambda: src_gdelt(U))
    items = finalize()
    prev = rd(OUT, {}) or {}
    sig = prev.get('signals', {}) if not ({'finnhub', 'fmp', 'gdelt'} & want) else {t: {k: v for k, v in g.items() if k == 'tone'} for t, g in prev.get('signals', {}).items() if 'gdelt' not in want and g.get('tone')}
    for t, g in SIG.items():
        sig.setdefault(t, {}).update(g)
    out = {
        'generatedAt': iso(NOW), 'windowHours': WINDOW_H,
        'note': 'Ham haber adayları; seçim/özet Claude görevinde yapılır. google feed linkleri news.google.com yönlendirmesidir.',
        'universe': {t: {'name': e['name'], 'funds': e['funds'], 'direct': e.get('direct', False), 'watch': e.get('watch', False)} for t, e in U.items()},
        'counts': {'items': len(items), 'raw': len(ITEMS)},
        'items': items,
        'signals': sig,
        'earnings': sorted(EARN, key=lambda x: x.get('date') or '') or prev.get('earnings', []),
    }
    wr(OUT, out)
    os.makedirs(os.path.join(DATA, '_diag'), exist_ok=True)
    wr('_diag/news.json', {'at': iso(NOW), **DIAG})
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk not in ('feedsFail', 'queriesFail', 'fail')} for k, v in DIAG.items()}, ensure_ascii=False))
    print('toplam haber:', len(items))


if __name__ == '__main__':
    main(sys.argv[1:])
